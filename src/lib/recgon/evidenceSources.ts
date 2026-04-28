// Evidence source registry — pluggable verifiers Recgon can route to.
//
// Each source declares: a name, a description (read by the LLM router so it
// can pick the right one), an `isViable` check (does this source even apply
// to this task?), and a `fetch` that returns text for the verification LLM
// plus structured evidence for storage.
//
// Adding a new source (Instagram Graph, Twitter API, etc.) is now a one-file
// change here plus a line in SOURCES below — no changes to verify.ts.

import { logger } from '../logger';
import { getCommitDiff, getLatestCommit } from '../githubFetcher';
import { fetchAnalyticsData } from '../analyticsEngine';
import { getProject } from '../storage';
import { getAnalyticsConfig } from '../analyticsStorage';
import { getUserById } from '../userStorage';
import { scrapeWebsite } from '../firecrawl';
import { supabase } from '../supabase';
import { getIntegration } from '../integrationStorage';
import { listRecentMedia, parseInstagramShortcode } from '../instagramGraph';
import type { AgentTask, VerificationEvidence } from './types';

export type EvidenceSourceName =
  | 'github_commits'
  | 'ga4_metric'
  | 'marketing_artifacts'
  | 'instagram_graph'
  | 'web_fetch'
  | 'proof_writeup'
  | 'none';

export type EvidenceBundle = {
  source: EvidenceSourceName;
  text: string;
  evidence: VerificationEvidence;
  // True when the source ran but came back with content too thin to judge
  // (e.g. Firecrawl returned platform shell HTML for an Instagram URL).
  thin?: boolean;
};

export type EvidenceSource = {
  name: EvidenceSourceName;
  description: string;
  isViable(task: AgentTask): Promise<boolean> | boolean;
  fetch(task: AgentTask, opts?: { url?: string }): Promise<EvidenceBundle | null>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const URL_RE = /\bhttps?:\/\/[^\s)>\]]+/gi;

export function extractUrls(text: string | undefined | null): string[] {
  if (!text) return [];
  const matches = text.match(URL_RE) ?? [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?]+$/, ''))));
}

function urlsFromTask(task: AgentTask): string[] {
  const urls: string[] = [];
  urls.push(...extractUrls(task.description));
  urls.push(...extractUrls(task.proof?.text));
  for (const link of task.proof?.links ?? []) urls.push(link);
  return Array.from(new Set(urls));
}

// ── github_commits ──────────────────────────────────────────────────────────

const githubCommitsSource: EvidenceSource = {
  name: 'github_commits',
  description:
    'GitHub repository commits since the task was assigned. Best for any code, engineering, bugfix, refactor, or "implement X" task on a project linked to a GitHub repo.',
  async isViable(task) {
    if (!task.projectId) return false;
    const project = await getProject(task.projectId, task.teamId);
    return Boolean(project?.githubUrl);
  },
  async fetch(task) {
    if (!task.projectId) return null;
    const project = await getProject(task.projectId, task.teamId);
    if (!project?.githubUrl) return null;
    const baseSha = project.lastAnalyzedCommitSha;
    const tokenUserId = task.createdBy ?? project.createdBy;
    const user = tokenUserId ? await getUserById(tokenUserId) : null;
    const token = user?.githubAccessToken;

    const head = await getLatestCommit(project.githubUrl, token);
    if (!head) return null;

    if (!baseSha) {
      return {
        source: 'github_commits',
        text: `LATEST COMMIT (no baseline)\nsha: ${head.sha}\nmessage: ${head.message}\ndate: ${head.date}`,
        evidence: { commitShas: [head.sha], diffSummary: head.message },
      };
    }
    if (baseSha === head.sha) {
      return {
        source: 'github_commits',
        text: `No new commits since baseline ${baseSha}.`,
        evidence: { commitShas: [], diffSummary: 'no new commits' },
        thin: true,
      };
    }

    const diff = await getCommitDiff(project.githubUrl, baseSha, head.sha, token);
    if (!diff) return null;
    const fileLines = diff.files.slice(0, 20).map((f) => `${f.status}: ${f.filename}`).join('\n');
    const messages = diff.commits.map((c) => `- ${c.message}`).join('\n');
    return {
      source: 'github_commits',
      text: `COMPARE ${baseSha.slice(0, 7)}...${head.sha.slice(0, 7)}\n\nCOMMITS\n${messages}\n\nFILES\n${fileLines}`,
      evidence: {
        commitShas: [baseSha, head.sha],
        diffSummary: messages.slice(0, 1000),
      },
    };
  },
};

// ── ga4_metric ──────────────────────────────────────────────────────────────

type MetricBaseline = { metric?: string; baseline?: number; expected?: 'increase' | 'decrease' };

const ga4MetricSource: EvidenceSource = {
  name: 'ga4_metric',
  description:
    'Google Analytics 4 metric snapshot. Best for tasks about traffic, sessions, conversion, bounce rate, or any other GA4 KPI on a project with analytics connected.',
  async isViable(task) {
    if (!task.projectId) return false;
    const project = await getProject(task.projectId, task.teamId);
    if (!project?.analyticsPropertyId) return false;
    const config = await getAnalyticsConfig({ kind: 'team', teamId: task.teamId });
    return Boolean(config?.oauth);
  },
  async fetch(task) {
    if (!task.projectId) return null;
    const project = await getProject(task.projectId, task.teamId);
    if (!project?.analyticsPropertyId) return null;
    const config = await getAnalyticsConfig({ kind: 'team', teamId: task.teamId });
    if (!config?.oauth) return null;

    const baselineRef = (task.sourceRef as MetricBaseline) ?? {};
    const metricName = baselineRef.metric ?? 'sessions';

    let data;
    try {
      data = await fetchAnalyticsData(
        project.analyticsPropertyId,
        { oauth: config.oauth, scope: { kind: 'team', teamId: task.teamId } },
        14,
      );
    } catch (err) {
      logger.warn('evidence: ga4 fetch failed', {
        taskId: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const overview = data.overview as unknown as Record<string, number>;
    const observed = Number(overview[metricName] ?? overview.sessions ?? 0);
    const baseline = typeof baselineRef.baseline === 'number' ? baselineRef.baseline : observed;
    const delta = observed - baseline;
    const direction = baselineRef.expected ?? 'increase';
    const moved = direction === 'increase' ? delta > 0 : delta < 0;

    return {
      source: 'ga4_metric',
      text: `METRIC: ${metricName}\nbaseline: ${baseline}\nobserved: ${observed}\ndelta: ${delta} (${moved ? 'matches' : 'against'} expected ${direction})`,
      evidence: { metric: metricName, baselineValue: baseline, observedValue: observed, delta },
    };
  },
};

// ── marketing_artifacts ─────────────────────────────────────────────────────

const marketingArtifactsSource: EvidenceSource = {
  name: 'marketing_artifacts',
  description:
    'Recgon-generated marketing content rows for the project (Instagram captions, TikTok scripts, Google Ads). Only proves something was *generated inside Recgon* — it does NOT prove the asset was published to any external platform.',
  async isViable(task) {
    return Boolean(task.projectId && task.assignedAt);
  },
  async fetch(task) {
    if (!task.projectId || !task.assignedAt) return null;
    const { data, error } = await supabase
      .from('marketing_content')
      .select('id, platform, content, generated_at')
      .eq('project_id', task.projectId)
      .gte('generated_at', task.assignedAt)
      .order('generated_at', { ascending: false })
      .limit(5);
    if (error) {
      logger.warn('evidence: marketing lookup failed', { taskId: task.id, err: error.message });
      return null;
    }
    if (!data || data.length === 0) {
      return {
        source: 'marketing_artifacts',
        text: 'No new marketing_content rows since the task was assigned.',
        evidence: { artifactIds: [] },
        thin: true,
      };
    }
    const lines = data.map((r) => {
      const c = (r.content as Record<string, string> | null) ?? {};
      return `- [${r.platform}] ${(c.headline1 ?? c.caption ?? Object.values(c)[0] ?? '').slice(0, 120)}`;
    });
    return {
      source: 'marketing_artifacts',
      text: `NEW MARKETING ARTIFACTS SINCE ASSIGNMENT (${data.length})\n${lines.join('\n')}`,
      evidence: { artifactIds: data.map((r) => r.id as string) },
    };
  },
};

// ── instagram_graph ────────────────────────────────────────────────────────
//
// Real Instagram verification via the Meta Graph API. Pulls the IG Business
// Account's recent media and matches against the task. Two match strategies:
//
//   1. If the task's proof contains an IG URL → parse the shortcode and find
//      it in the media list. If found AND posted after task.assignedAt → strong
//      evidence with a clear permalink + caption.
//   2. Otherwise → return the N most recent posts since assigned_at and let
//      the verification LLM judge "did any of these match the task?".
//
// Requires: project_integrations row with provider='instagram', plus
// META_APP_ID/META_APP_SECRET/META_REDIRECT_URI env vars (only used for the
// OAuth flow itself, not the verification calls).

const instagramGraphSource: EvidenceSource = {
  name: 'instagram_graph',
  description:
    'Instagram Business Account media via the Meta Graph API. Best for any "publish a Reel/post/story" task on a project that has Instagram connected. Verifies the post actually exists, when it was posted, and what the caption says.',
  async isViable(task) {
    if (!task.projectId) return false;
    const integration = await getIntegration(task.projectId, 'instagram');
    return Boolean(integration?.accessToken && integration.accountId);
  },
  async fetch(task) {
    if (!task.projectId) return null;
    const integration = await getIntegration(task.projectId, 'instagram');
    if (!integration?.accessToken || !integration.accountId) return null;

    let media;
    try {
      media = await listRecentMedia(integration.accountId, integration.accessToken, 25);
    } catch (err) {
      logger.warn('evidence: instagram_graph fetch failed', {
        taskId: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    // Filter to posts since the task was assigned (with a small slack window
    // for tasks created before the assignee actually started).
    const assignedAt = task.assignedAt ? new Date(task.assignedAt) : null;
    const slackMs = 24 * 60 * 60 * 1000;
    const recent = assignedAt
      ? media.filter((m) => new Date(m.timestamp).getTime() >= assignedAt.getTime() - slackMs)
      : media.slice(0, 5);

    // Strategy 1: did the assignee paste an IG URL in their proof?
    const proofUrls = urlsFromTask(task).filter((u) => /instagram\.com/i.test(u));
    const targetShortcodes = proofUrls
      .map(parseInstagramShortcode)
      .filter((s): s is string => Boolean(s));

    if (targetShortcodes.length > 0) {
      // The Graph API doesn't return the URL shortcode directly, but the
      // permalink contains it. Match against permalinks.
      const matched = media.filter((m) =>
        targetShortcodes.some((code) => m.permalink.includes(`/${code}/`)),
      );
      if (matched.length > 0) {
        const lines = matched.map(
          (m) =>
            `- [${m.media_type}] posted ${m.timestamp}\n  permalink: ${m.permalink}\n  caption: ${(m.caption ?? '').slice(0, 400)}`,
        );
        return {
          source: 'instagram_graph',
          text: `MATCHED INSTAGRAM POSTS (from proof URL)\nIG account: @${integration.accountHandle ?? '(unknown)'}\n\n${lines.join('\n\n')}`,
          evidence: { artifactIds: matched.map((m) => m.permalink) },
        };
      }
      // The URL was provided but the post isn't in the recent feed → fail.
      return {
        source: 'instagram_graph',
        text: `Proof linked to Instagram URL(s) ${proofUrls.join(', ')} but no matching post found in the connected IG Business Account's recent media. Either the post is from a different account, was deleted, or the link is wrong.`,
        evidence: { artifactIds: proofUrls },
        thin: true,
      };
    }

    // Strategy 2: no specific URL — let the LLM judge against recent posts.
    if (recent.length === 0) {
      return {
        source: 'instagram_graph',
        text: `IG account: @${integration.accountHandle ?? '(unknown)'}\n\nNo new Instagram posts since the task was assigned (${assignedAt?.toISOString() ?? 'unknown'}).`,
        evidence: { artifactIds: [] },
        thin: true,
      };
    }
    const lines = recent
      .slice(0, 8)
      .map(
        (m) =>
          `- [${m.media_type}] posted ${m.timestamp}\n  permalink: ${m.permalink}\n  caption: ${(m.caption ?? '').slice(0, 400)}`,
      );
    return {
      source: 'instagram_graph',
      text: `RECENT INSTAGRAM POSTS SINCE ASSIGNMENT\nIG account: @${integration.accountHandle ?? '(unknown)'}\n\n${lines.join('\n\n')}`,
      evidence: { artifactIds: recent.map((m) => m.permalink) },
    };
  },
};

// ── web_fetch ───────────────────────────────────────────────────────────────
//
// Generic web URL fetcher via Firecrawl. Best path for off-platform tasks
// where the assignee can give us a URL: a published blog post, a landing page
// change, a public Reel/TikTok URL, an X post, a LinkedIn post, etc.
//
// Honesty caveat: many social platforms block scrapers and return shell HTML
// (we know this from /feedback's YouTube experience). When the fetched
// content is too thin to judge, we mark `thin: true` and the verifier
// downgrades to inconclusive instead of pretending we saw the post.

const PLATFORM_SHELL_HINTS = [
  'access denied',
  'sign in to continue',
  "we'd love to show you",
  'enable javascript',
  'this content isn',
  'log in to instagram',
  'login • instagram',
  'before you continue',
  'forbidden',
  'just a moment',
];

const webFetchSource: EvidenceSource = {
  name: 'web_fetch',
  description:
    'Fetch a public URL (blog post, landing page, social media post URL, public profile, etc.) and read its content. Use this whenever a task is "verifiable by visiting a link" — including Instagram Reels, TikToks, LinkedIn posts, X posts, published articles, or any change to a public web page. The router must include the `url` to fetch.',
  async isViable(task) {
    return urlsFromTask(task).length > 0;
  },
  async fetch(task, opts) {
    const url = opts?.url ?? urlsFromTask(task)[0];
    if (!url) return null;
    const content = await scrapeWebsite(url).catch(() => null);
    if (!content) {
      return {
        source: 'web_fetch',
        text: `Tried to fetch ${url} — fetch failed (scraper unreachable, 4xx, or timeout).`,
        evidence: { artifactIds: [url] },
        thin: true,
      };
    }
    const lower = content.toLowerCase();
    const looksLikeShell =
      content.length < 400 || PLATFORM_SHELL_HINTS.some((hint) => lower.includes(hint));
    return {
      source: 'web_fetch',
      text: `FETCHED ${url}\n\nCONTENT (${content.length} chars):\n${content}`,
      evidence: { artifactIds: [url] },
      thin: looksLikeShell,
    };
  },
};

// ── proof_writeup ──────────────────────────────────────────────────────────

const proofWriteupSource: EvidenceSource = {
  name: 'proof_writeup',
  description:
    'The teammate-submitted proof text itself. Use this only when no real signal exists and the task is inherently subjective (research notes, internal decisions). Lower-confidence than any other source.',
  isViable(task) {
    return Boolean(task.proof?.text || task.proof?.links?.length || task.proof?.attachments?.length);
  },
  async fetch(task) {
    const proof = task.proof;
    if (!proof) return null;
    const lines: string[] = [];
    if (proof.text) lines.push(`TEXT:\n${proof.text}`);
    if (proof.links?.length) lines.push(`LINKS:\n${proof.links.map((l) => `- ${l}`).join('\n')}`);
    if (proof.attachments?.length) {
      lines.push(`ATTACHMENTS:\n${proof.attachments.map((a) => `- ${a.name} (${a.url})`).join('\n')}`);
    }
    if (proof.extras && Object.keys(proof.extras).length > 0) {
      lines.push(`EXTRAS:\n${JSON.stringify(proof.extras, null, 2)}`);
    }
    return {
      source: 'proof_writeup',
      text: lines.join('\n\n') || '(empty proof)',
      evidence: {},
    };
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

export const SOURCES: Record<Exclude<EvidenceSourceName, 'none'>, EvidenceSource> = {
  github_commits: githubCommitsSource,
  ga4_metric: ga4MetricSource,
  marketing_artifacts: marketingArtifactsSource,
  instagram_graph: instagramGraphSource,
  web_fetch: webFetchSource,
  proof_writeup: proofWriteupSource,
};

export async function listViableSources(task: AgentTask): Promise<EvidenceSourceName[]> {
  const out: EvidenceSourceName[] = [];
  for (const [name, src] of Object.entries(SOURCES)) {
    try {
      if (await src.isViable(task)) out.push(name as EvidenceSourceName);
    } catch (err) {
      logger.warn('evidence: viability check failed', {
        source: name,
        taskId: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export function describeSources(names: EvidenceSourceName[]): string {
  return names
    .filter((n) => n !== 'none')
    .map((n) => `- ${n}: ${SOURCES[n as Exclude<EvidenceSourceName, 'none'>].description}`)
    .join('\n');
}
