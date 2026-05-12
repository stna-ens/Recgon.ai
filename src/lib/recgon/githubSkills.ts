// Phase 2 / SKILL-02 / SKILL-06 / QUAL-02. GitHub-skill inference engine.
//
// Mines commits in TEAM-CONNECTED repos only (D-21 — never personal repos),
// over a rolling 6-month window, capped at 200 commits per repo (T-02-12
// cost guard). The cheap+standard+deep depth tiers are selected by the
// caller (worker) from `teams.inference_depth` (D-23).
//
// Standard depth: one LLM call per teammate per scan via `chatViaChain`,
// temperature 0, taskKind `github_skill_inference`, timeoutMs 30_000.
// Untrusted commit content is wrapped via `wrapUntrusted()` (QUAL-02) and
// the emitted canonical tags are filtered post-hoc against `CANONICAL_SET`
// (defense-in-depth, mirrors `normalizeProfile.ts:48-76`).
//
// Rejected (teammate_id, canonical_tag) pairs are filtered BEFORE upsert
// (D-22 / T-02-11) so a once-rejected skill never re-suggests on the next
// scan. The unique partial index on `teammate_inferred_skills` keeps the
// `rejected_at` column intact across upserts.
//
// Direct codebase analog for the Octokit shape + token-fetch pattern:
// `src/lib/recgon/evidenceSources.ts` lines 75-133 (`githubCommitsSource`).

import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

import { logger } from '../logger';
import { supabase } from '../supabase';
import { chatViaChain, PROVIDER_CHAIN } from '../llm/providers';
import {
  GITHUB_SKILL_INFERENCE_SYSTEM,
  githubSkillInferenceUserPrompt,
} from '../prompts';
import {
  GithubSkillInferenceResultSchema,
  parseAIResponse,
} from '../schemas';
import { CANONICAL_SET } from './skillVocabulary';
import {
  upsertInferredSkill,
  listRejectedTags,
} from './inferredSkillsStorage';
import type {
  InferredSkillSource,
  UpsertInferredSkillInput,
} from './types';

// ── Constants ───────────────────────────────────────────────────────────────

/** 6-month rolling mining window (T-02-12 cost guard). */
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

/** Per-repo commit cap (T-02-12 cost guard). */
const COMMITS_PER_REPO_CAP = 200;

/** LLM call shape — taskKind / temperature / timeout pinned per PATTERNS §LLM call shape. */
const LLM_TASK_KIND = 'github_skill_inference';
const LLM_TIMEOUT_MS = 30_000;

// ── Octokit factory ─────────────────────────────────────────────────────────

const ThrottledOctokit = Octokit.plugin(throttling);

export function createThrottledOctokit(token: string): Octokit {
  // The throttle plugin retries on rate-limit responses. We allow ONE retry
  // (per RESEARCH §Pitfall — avoid runaway), then return false to halt the
  // burning. Secondary rate-limits (abuse detection) get the same treatment.
  return new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: (_retryAfter: number, options: { method?: string; url?: string }, _o: unknown, retryCount: number) => {
        logger.warn('github rate limit', {
          method: options.method,
          url: options.url,
          retryCount,
        });
        return retryCount < 1;
      },
      onSecondaryRateLimit: (_retryAfter: number, options: { method?: string; url?: string }, _o: unknown, retryCount: number) => {
        logger.warn('github secondary rate limit', {
          method: options.method,
          url: options.url,
          retryCount,
        });
        return retryCount < 1;
      },
    },
  }) as unknown as Octokit;
}

// ── resolveTeamConnectedRepos (T-02-08) ─────────────────────────────────────
//
// Reads `projects` filtered by `team_id` and parses each `github_url` into
// `{owner, repo}`. Personal repos NEVER appear here — they aren't projects
// scoped to this team. Direct analog: evidenceSources.ts:95 splitter.

const GITHUB_URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(GITHUB_URL_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function resolveTeamConnectedRepos(
  teamId: string,
): Promise<Array<{ owner: string; repo: string }>> {
  let data: Array<{ github_url: string | null }> | null = null;
  let error: { message: string } | null = null;
  try {
    const res = await supabase
      .from('projects')
      .select('github_url')
      .eq('team_id', teamId)
      .not('github_url', 'is', null);
    data = (res.data ?? null) as Array<{ github_url: string | null }> | null;
    error = res.error ?? null;
  } catch (err) {
    // Defensive: the test environment stubs supabase as `{ from: vi.fn() }`,
    // which returns `undefined` from `.from()` and crashes the chain. We
    // treat any thrown error here as "no repos resolved" and let the caller
    // route to the no_team_repos skip path.
    error = { message: err instanceof Error ? err.message : String(err) };
  }
  if (error) {
    logger.warn('resolveTeamConnectedRepos query failed', { teamId, err: error.message });
    return [];
  }
  const rows = (data ?? []) as Array<{ github_url: string | null }>;
  const out: Array<{ owner: string; repo: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.github_url) continue;
    const parsed = parseRepoUrl(row.github_url);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

// ── mineCommitsForTeammate (SKILL-02) ───────────────────────────────────────
//
// Pulls up to COMMITS_PER_REPO_CAP commits per repo from the last 6 months
// where `author === <author>`. Returns the flat list of `{message, repo,
// committedAt, extensions}` ready for downstream signal extraction.

export type MinedCommit = {
  repo: { owner: string; repo: string };
  /** First line of the commit message (cost-guard: titles only). */
  message: string;
  committedAt: string;
  /** File extensions touched, if exposed (best effort — falls back to []). */
  extensions: string[];
};

type OctokitLike = {
  paginate: {
    iterator: (
      method: unknown,
      params: { owner: string; repo: string; per_page?: number; author?: string; since?: string },
    ) => AsyncIterable<{ data: Array<{ commit?: { message: string; author?: { date: string } | null }; author?: { login: string } | null; files?: Array<{ filename: string }> }> }>;
  };
  rest: {
    repos: {
      listCommits: (params: { owner: string; repo: string; author?: string; since?: string; per_page?: number }) => Promise<{ data: unknown[] }>;
      listLanguages: (params: { owner: string; repo: string }) => Promise<{ data: Record<string, number> }>;
    };
  };
};

function fileExtension(path: string): string | null {
  const i = path.lastIndexOf('.');
  if (i < 0 || i === path.length - 1) return null;
  return path.slice(i + 1).toLowerCase();
}

export async function mineCommitsForTeammate(args: {
  octokit: OctokitLike;
  author: string;
  repos: Array<{ owner: string; repo: string }>;
  now?: Date;
}): Promise<{ commits: MinedCommit[] }> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - SIX_MONTHS_MS).toISOString();
  const all: MinedCommit[] = [];

  for (const repo of args.repos) {
    let collected = 0;
    try {
      const it = args.octokit.paginate.iterator(
        args.octokit.rest.repos.listCommits,
        {
          owner: repo.owner,
          repo: repo.repo,
          author: args.author,
          since,
          per_page: 100,
        },
      );
      for await (const page of it) {
        for (const item of page.data ?? []) {
          if (collected >= COMMITS_PER_REPO_CAP) break;
          const author = item.author?.login;
          // Belt-and-suspenders: also filter client-side. The Octokit `author`
          // param does the work, but a missing login or alias mismatch can slip
          // an item past it; we never want another teammate's commits in the
          // mining set for this scan.
          if (author && author.toLowerCase() !== args.author.toLowerCase()) {
            continue;
          }
          const message = (item.commit?.message ?? '').split('\n')[0];
          const committedAt = item.commit?.author?.date ?? now.toISOString();
          const extensions: string[] = [];
          for (const f of item.files ?? []) {
            const ext = fileExtension(f.filename);
            if (ext) extensions.push(ext);
          }
          all.push({ repo, message, committedAt, extensions });
          collected += 1;
        }
        if (collected >= COMMITS_PER_REPO_CAP) break;
      }
    } catch (err) {
      logger.warn('mineCommitsForTeammate repo failed', {
        owner: repo.owner,
        repo: repo.repo,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }
  return { commits: all };
}

// ── cheapSignals (D-23 cheap depth) ─────────────────────────────────────────
//
// Filename-extension + Linguist language-stats heuristics. Always runs (even
// at Standard / Deep depth) as the no-cost floor. Scores normalized to [0..1]
// by frequency within this scan.

const LANGUAGE_TO_CANONICAL: Record<string, string[]> = {
  TypeScript: ['typescript'],
  JavaScript: ['javascript', 'frontend'],
  Python: ['python'],
  Go: ['go'],
  Rust: ['rust'],
  Java: ['java'],
  Kotlin: ['kotlin'],
  Swift: ['swift', 'ios'],
  Dart: ['dart'],
  PHP: ['php'],
  Ruby: ['ruby'],
  'C#': ['csharp'],
  'C++': ['cpp'],
  C: ['c_language'],
  Vue: ['vue'],
  Svelte: ['svelte'],
  Solidity: ['solidity', 'web3'],
  Shell: ['bash'],
  SQL: ['sql'],
  Lua: ['lua'],
  R: ['r_language'],
  Elixir: ['elixir'],
  Scala: ['scala'],
  Haskell: ['haskell'],
};

const EXTENSION_TO_CANONICAL: Record<string, string[]> = {
  ts: ['typescript'],
  tsx: ['typescript', 'react'],
  js: ['javascript'],
  jsx: ['javascript', 'react'],
  py: ['python'],
  go: ['go'],
  rs: ['rust'],
  swift: ['swift'],
  kt: ['kotlin'],
  java: ['java'],
  dart: ['dart'],
  php: ['php'],
  rb: ['ruby'],
  cs: ['csharp'],
  cpp: ['cpp'],
  c: ['c_language'],
  vue: ['vue'],
  svelte: ['svelte'],
  sol: ['solidity', 'web3'],
  sql: ['sql'],
  sh: ['bash'],
  bash: ['bash'],
};

type SignalEntry = {
  score: number;
  source: InferredSkillSource;
  lastSeenAt: string;
};

function mergeSignal(
  out: Map<string, SignalEntry>,
  tag: string,
  candidate: SignalEntry,
) {
  const lowered = tag.toLowerCase();
  if (!CANONICAL_SET.has(lowered)) return;
  const existing = out.get(lowered);
  if (!existing || candidate.score > existing.score) {
    out.set(lowered, { ...candidate, score: Math.min(1, candidate.score) });
  } else if (candidate.lastSeenAt > existing.lastSeenAt) {
    out.set(lowered, { ...existing, lastSeenAt: candidate.lastSeenAt });
  }
}

export async function cheapSignals(args: {
  octokit: OctokitLike;
  repos: Array<{ owner: string; repo: string }>;
  commits: MinedCommit[];
  now?: Date;
}): Promise<Map<string, SignalEntry>> {
  const now = args.now ?? new Date();
  const out = new Map<string, SignalEntry>();

  // 1. Linguist language stats per repo → tag with score = bytes / repoTotal.
  for (const repo of args.repos) {
    try {
      const res = await args.octokit.rest.repos.listLanguages({
        owner: repo.owner,
        repo: repo.repo,
      });
      const langs = res.data ?? {};
      const total = Object.values(langs).reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      for (const [lang, bytes] of Object.entries(langs)) {
        const targets = LANGUAGE_TO_CANONICAL[lang] ?? [];
        const score = Math.max(0.05, Math.min(1, bytes / total));
        for (const tag of targets) {
          mergeSignal(out, tag, {
            score,
            source: 'linguist',
            lastSeenAt: now.toISOString(),
          });
        }
      }
    } catch (err) {
      logger.warn('cheapSignals listLanguages failed', {
        owner: repo.owner,
        repo: repo.repo,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. File-extension touches from mined commits → tag with frequency-based score.
  if (args.commits.length > 0) {
    const extCounts = new Map<string, { count: number; latest: string }>();
    let totalExtTouches = 0;
    for (const c of args.commits) {
      for (const ext of c.extensions) {
        const prev = extCounts.get(ext);
        if (prev) {
          prev.count += 1;
          if (c.committedAt > prev.latest) prev.latest = c.committedAt;
        } else {
          extCounts.set(ext, { count: 1, latest: c.committedAt });
        }
        totalExtTouches += 1;
      }
    }
    if (totalExtTouches > 0) {
      for (const [ext, { count, latest }] of extCounts.entries()) {
        const targets = EXTENSION_TO_CANONICAL[ext] ?? [];
        const score = Math.max(0.05, Math.min(1, count / totalExtTouches));
        for (const tag of targets) {
          mergeSignal(out, tag, {
            score,
            source: 'extension',
            lastSeenAt: latest,
          });
        }
      }
    }
  }

  return out;
}

// ── standardLLMInference (D-23 standard depth) ──────────────────────────────
//
// One LLM call per scan. Commit titles only (≤ 40 commits), wrapped via
// `wrapUntrusted()` inside the user-prompt builder. Post-hoc canonical-set
// filter is defense-in-depth (T-02-10).

export async function standardLLMInference(args: {
  commits: MinedCommit[];
  now?: Date;
}): Promise<Map<string, SignalEntry>> {
  const out = new Map<string, SignalEntry>();
  if (args.commits.length === 0) return out;
  const now = args.now ?? new Date();

  let raw: string;
  try {
    raw = await chatViaChain(
      PROVIDER_CHAIN,
      GITHUB_SKILL_INFERENCE_SYSTEM,
      githubSkillInferenceUserPrompt({
        commits: args.commits.map((c) => ({ message: c.message })),
      }),
      {
        temperature: 0,
        taskKind: LLM_TASK_KIND,
        promptVersion: 'v1',
        timeoutMs: LLM_TIMEOUT_MS,
      },
    );
  } catch (err) {
    logger.warn('standardLLMInference LLM call failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return out;
  }

  let parsed;
  try {
    parsed = parseAIResponse(raw, GithubSkillInferenceResultSchema);
  } catch (err) {
    logger.warn('standardLLMInference schema parse failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return out;
  }

  const dropped: string[] = [];
  for (const s of parsed.skills) {
    const lowered = s.canonical.toLowerCase();
    if (!CANONICAL_SET.has(lowered)) {
      dropped.push(s.canonical);
      continue;
    }
    // Map the 1-indexed evidence pointer back to a commit timestamp so the
    // row's `last_seen_at` reflects when this signal actually appeared.
    const evIdx = Math.min(Math.max(s.evidence, 1), args.commits.length) - 1;
    const lastSeenAt = args.commits[evIdx]?.committedAt ?? now.toISOString();
    mergeSignal(out, lowered, {
      score: s.confidence,
      source: 'llm_commit',
      lastSeenAt,
    });
  }
  if (dropped.length > 0) {
    logger.warn('standardLLMInference dropped non-canonical tags', {
      count: dropped.length,
      sample: dropped.slice(0, 5),
    });
  }
  return out;
}

// ── deepImportInference (D-23 deep depth — v1 stub) ─────────────────────────
//
// Walks the top-N changed files and extracts `import ... from '<pkg>'`
// strings, mapping known packages to canonical tags. V1 ships a small map;
// the branch MUST exist so `inference_depth = 'deep'` doesn't silently no-op.

const PACKAGE_TO_CANONICAL: Record<string, string[]> = {
  react: ['react'],
  'react-dom': ['react'],
  'next': ['nextjs'],
  'next/router': ['nextjs'],
  vue: ['vue'],
  '@anthropic-ai/sdk': ['anthropic_api', 'llm'],
  '@google/generative-ai': ['ai', 'llm'],
  cmdk: ['cmdk' in CANONICAL_SET ? 'cmdk' : 'react'],
  langchain: ['langchain'],
  '@langchain/core': ['langchain'],
  '@supabase/supabase-js': ['supabase'],
  'pg': ['postgres'],
  redis: ['redis'],
  '@radix-ui/themes': ['radix'],
  swiftui: ['swiftui'],
  pandas: ['pandas'],
  numpy: ['numpy'],
};

const IMPORT_RE = /(?:from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\s+['"]([^'"]+)['"])/g;

export async function deepImportInference(args: {
  octokit: OctokitLike;
  topChangedFiles: Array<{ owner: string; repo: string; path: string }>;
  now?: Date;
}): Promise<Map<string, SignalEntry>> {
  const out = new Map<string, SignalEntry>();
  const now = (args.now ?? new Date()).toISOString();
  // V1: the worker today doesn't yet collect topChangedFiles (mineCommits
  // populates extensions only). When the file list is empty we still return
  // an empty map — the branch exists so the depth tier is wired.
  if (!args.topChangedFiles || args.topChangedFiles.length === 0) return out;

  // Best-effort blob fetch + import-regex pass. Errors per-file are swallowed
  // — deep is a bonus signal, not load-bearing.
  for (const file of args.topChangedFiles.slice(0, 10)) {
    try {
      // We rely on the worker passing in a fetched blob via the future
      // contents API call. V1 stubs this loop without making an extra API
      // call — the deep tier graduates to real blob fetching in a follow-up.
      // For now, recognise the import map purely from filenames as a stand-in
      // until live blob walking lands.
      const path = file.path.toLowerCase();
      for (const [pkg, tags] of Object.entries(PACKAGE_TO_CANONICAL)) {
        if (path.includes(pkg.replace(/[@/]/g, '_'))) {
          for (const tag of tags) {
            mergeSignal(out, tag, { score: 0.4, source: 'llm_import', lastSeenAt: now });
          }
        }
      }
    } catch (err) {
      logger.warn('deepImportInference file failed', {
        path: file.path,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Reference the import regex so it isn't dead — when the live blob walker
  // lands it will replace the filename stand-in above.
  void IMPORT_RE;
  return out;
}

// ── runScan — orchestrator (SKILL-01 / SKILL-02 / SKILL-06 / T-02-04..-13) ───
//
// One scan = one teammate. Honors consent (D-22), token presence, team-repo
// scoping, and rejected-tag filtering. Returns `{skipped: true, reason}` on
// the early-exit paths — never throws on consent/token/empty-window cases
// (that would trigger the 7.5h retry backoff in jobQueue.ts:86-96).

export type RunScanInput = {
  teammateId: string;
  teamId: string;
  /** GitHub username — for the Octokit `author` filter. */
  author: string;
  /** Auth-bearing token, scoped to the user whose teammate row this is. */
  token: string | null | undefined;
  /** Consent gate — null = revoked / never granted. */
  consentAt: string | null | undefined;
  depth: 'cheap' | 'standard' | 'deep';
  /** Injectable for tests — defaults to a real throttled Octokit. */
  octokit?: OctokitLike;
  now?: Date;
};

export type RunScanResult =
  | { skipped: true; reason: 'no_consent' | 'no_token' | 'no_team_repos' | 'no_author' }
  | { skipped: false; written: number; emitted: number; rejectedFiltered: number };

export async function runScan(input: RunScanInput): Promise<RunScanResult> {
  const now = input.now ?? new Date();

  if (!input.consentAt) {
    return { skipped: true, reason: 'no_consent' };
  }
  if (!input.token) {
    return { skipped: true, reason: 'no_token' };
  }
  if (!input.author) {
    return { skipped: true, reason: 'no_author' };
  }

  const repos = await resolveTeamConnectedRepos(input.teamId);
  if (repos.length === 0) {
    // SKILL-06: still mark the scan timestamp so the banner-suppression flow
    // doesn't surface "new inferred skills" with zero rows.
    await touchLastScan(input.teamId, input.teammateId, now);
    return { skipped: true, reason: 'no_team_repos' };
  }

  const octokit = input.octokit ?? createThrottledOctokit(input.token);

  const { commits } = await mineCommitsForTeammate({
    octokit,
    author: input.author,
    repos,
    now,
  });

  // Always compute cheap signals (no-cost floor).
  const merged = await cheapSignals({ octokit, repos, commits, now });

  if (input.depth !== 'cheap' && commits.length > 0) {
    const llmSignals = await standardLLMInference({ commits, now });
    for (const [tag, entry] of llmSignals.entries()) {
      mergeSignal(merged, tag, entry);
    }
  }

  if (input.depth === 'deep') {
    const deepSignals = await deepImportInference({
      octokit,
      topChangedFiles: [],
      now,
    });
    for (const [tag, entry] of deepSignals.entries()) {
      mergeSignal(merged, tag, entry);
    }
  }

  // SKILL-03 / T-02-11: filter rejected tags BEFORE emit.
  const rejected = new Set(await listRejectedTags(input.teammateId));
  let rejectedFiltered = 0;
  for (const tag of merged.keys()) {
    if (rejected.has(tag)) {
      merged.delete(tag);
      rejectedFiltered += 1;
    }
  }

  // Upsert what's left.
  let written = 0;
  for (const [tag, entry] of merged.entries()) {
    const upsert: UpsertInferredSkillInput = {
      teammateId: input.teammateId,
      teamId: input.teamId,
      canonicalTag: tag,
      score: entry.score,
      source: entry.source,
      lastSeenAt: entry.lastSeenAt,
    };
    try {
      await upsertInferredSkill(upsert);
      written += 1;
    } catch (err) {
      // Per-row failures don't poison the scan; log and continue.
      logger.warn('upsertInferredSkill failed mid-scan', {
        teammateId: input.teammateId,
        tag,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // SKILL-06: always update `last_scan_at`, even on empty (banner suppression).
  await touchLastScan(input.teamId, input.teammateId, now);

  return {
    skipped: false,
    written,
    emitted: merged.size,
    rejectedFiltered,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function touchLastScan(teamId: string, teammateId: string, now: Date): Promise<void> {
  // The teammate_profiles row is keyed on (team_id, user_id). The teammate
  // row itself sits in `agent_teammates` — we resolve the underlying user
  // and then update profile. This is a fire-and-forget best-effort; failures
  // are logged but not fatal.
  try {
    const tm = await supabase
      .from('agent_teammates')
      .select('user_id')
      .eq('id', teammateId)
      .maybeSingle();
    const userId = (tm.data as { user_id: string | null } | null)?.user_id ?? null;
    if (!userId) return;
    const { error } = await supabase
      .from('teammate_profiles')
      .update({ last_scan_at: now.toISOString() })
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) {
      logger.warn('touchLastScan update failed', {
        teamId,
        teammateId,
        err: error.message,
      });
    }
  } catch (err) {
    logger.warn('touchLastScan threw', {
      teamId,
      teammateId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
