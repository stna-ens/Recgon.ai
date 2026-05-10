// Recgon's plain-English summary of a single git commit. The expensive
// generation work runs in a queued LLM job (`commit_summary` kind in
// `lib/llm/workers.ts`); this module is the read/write API the route
// handlers and the worker share.
//
// Cache key: (github_url, sha). Persistent in the `commit_summaries`
// Supabase table — see migration `20260503_commit_summaries.sql`.

import { supabase } from './supabase';
import { logger } from './logger';
import { chatViaProviders } from './llm/providers';
import { getCommitDetails } from './githubFetcher';
import { COMMIT_SUMMARY_SYSTEM, buildCommitSummaryUser } from './prompts';

export type CommitSummaryRow = {
  github_url: string;
  sha: string;
  raw_message: string;
  summary: string;
  committed_at: string | null;
  generated_at: string;
};

// Strip preambles ("Here is the summary:", "Summary: …"), code fences,
// surrounding quotes, and pick the first non-empty content line. Models
// sometimes ignore "no preamble" instructions; this is the safety net.
const PREAMBLE_RE = /^(here(?:'s| is)(?: the)?(?: summary| sentence| commit summary)?[:\s-]*|summary[:\s-]+|the commit[:\s-]+|in (?:one |a )?sentence[:\s-]+)/i;

function postProcessCommitSummary(raw: string): string {
  let s = (raw ?? '').trim();
  s = s.replace(/^```[a-z]*\n?|\n?```$/gi, '').trim();
  // Drop a leading preamble line if it's distinct from the actual answer
  // (i.e. there's a real second line below it).
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && PREAMBLE_RE.test(lines[0])) lines.shift();
  s = (lines[0] ?? '').trim();
  s = s.replace(PREAMBLE_RE, '').trim();
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  // Strip leading bullet markers.
  s = s.replace(/^[-*•]\s+/, '');
  return s;
}

// Bulk-lookup cached summaries for a single repo. Returns a Map keyed on sha.
// Empty Map on error (the caller falls back to raw commit messages).
export async function getCachedSummaries(
  githubUrl: string,
  shas: string[],
): Promise<Map<string, string>> {
  if (shas.length === 0) return new Map();
  const { data, error } = await supabase
    .from('commit_summaries')
    .select('sha, summary')
    .eq('github_url', githubUrl)
    .in('sha', shas);
  if (error) {
    logger.warn('commit_summaries lookup failed', { githubUrl, err: error.message });
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.sha as string, row.summary as string);
  }
  return map;
}

// Find the subset of shas that already have a `pending`/`running` job in
// `llm_jobs`, so callers don't double-enqueue when the home reloads while
// a worker is still processing.
export async function getPendingSummaryShas(
  githubUrl: string,
  shas: string[],
): Promise<Set<string>> {
  if (shas.length === 0) return new Set();
  const { data, error } = await supabase
    .from('llm_jobs')
    .select('payload')
    .eq('kind', 'commit_summary')
    .in('status', ['pending', 'running'])
    .filter('payload->>github_url', 'eq', githubUrl);
  if (error) {
    logger.warn('llm_jobs pending lookup failed', { githubUrl, err: error.message });
    return new Set();
  }
  const set = new Set<string>();
  for (const row of data ?? []) {
    const sha = (row.payload as { sha?: string } | null)?.sha;
    if (sha && shas.includes(sha)) set.add(sha);
  }
  return set;
}

// Worker entrypoint. Idempotent: if a row already exists for this
// (github_url, sha), returns it without spending another LLM call.
export async function runCommitSummaryJob(payload: {
  githubUrl: string;
  sha: string;
  token?: string;
}): Promise<CommitSummaryRow> {
  const { githubUrl, sha, token } = payload;
  if (!githubUrl || !sha) throw new Error('commit_summary job missing githubUrl or sha');

  // Fast path — already summarised.
  const existing = await supabase
    .from('commit_summaries')
    .select('*')
    .eq('github_url', githubUrl)
    .eq('sha', sha)
    .maybeSingle();
  if (existing.data) return existing.data as CommitSummaryRow;

  // Pull the commit + patches from GitHub.
  const details = await getCommitDetails(githubUrl, sha, token);
  if (!details) throw new Error(`commit not found on github: ${githubUrl}@${sha}`);

  // Empty-diff defence: GitHub returns the commit but no files for some
  // edge cases (merge commits with no diff, etc.). Don't bill the LLM —
  // just persist the raw message as the "summary".
  let summary: string;
  if (details.files.length === 0 || (details.stats.additions === 0 && details.stats.deletions === 0)) {
    summary = details.message.split('\n')[0] || 'Empty commit (no diff).';
  } else {
    const userPrompt = buildCommitSummaryUser({
      rawMessage: details.message,
      files: details.files,
      stats: details.stats,
    });
    const raw = await chatViaProviders(COMMIT_SUMMARY_SYSTEM, userPrompt, {
      temperature: 0.3,
      // ~22-word target × ~1.4 tokens/word = ~32 tokens of content; leave
      // headroom for any preamble we'll trim. Note: when Gemini does
      // chain-of-thought before answering, it counts toward this budget,
      // so we want plenty of slack rather than a tight cap.
      maxTokens: 600,
      taskKind: 'commit_summary',
      // Plain prose, not JSON. The Gemini default ('application/json') would
      // truncate this answer mid-string-literal.
      responseMimeType: 'text/plain',
    });
    summary = postProcessCommitSummary(raw) || details.message.split('\n')[0] || 'Update.';
  }

  const upsertRes = await supabase
    .from('commit_summaries')
    .upsert(
      {
        github_url: githubUrl,
        sha,
        raw_message: details.message,
        summary,
        committed_at: details.committedAt || null,
      },
      { onConflict: 'github_url,sha' },
    )
    .select('*')
    .single();
  if (upsertRes.error || !upsertRes.data) {
    throw new Error(`commit_summaries upsert failed: ${upsertRes.error?.message ?? 'no data'}`);
  }
  return upsertRes.data as CommitSummaryRow;
}
