// Recgon Brain — aggregates "what needs doing" across all projects in a team.
//
// Each reader produces BrainEntry[] with stable dedupKey so taskMint stays
// idempotent. Sources:
//   • prioritizedNextSteps         → 'next_step'
//   • developerPrompts             → 'dev_prompt'
//   • feedback bugs/themes rollup  → 'dev_prompt' / 'research'
//   • topRisks + growthMetrics     → 'next_step' (priority 1)
//   • GitHub commit drift          → 'research'
//
// Completion is honoured: nextStepsTaken[].taken and completedPrompts[] mean
// the entry should not be re-minted.

import { getAllProjects } from '../storage';
import { getLatestCommit } from '../githubFetcher';
import { logger } from '../logger';
import { getUserById } from '../userStorage';
import { getAnalyticsConfig } from '../analyticsStorage';
import { fetchAnalyticsData } from '../analyticsEngine';
import type { Project, FeedbackAnalysis, ProductAnalysis } from '../storage';
import type { BrainEntry, BrainSnapshot, TaskKind } from './types';

function dedupKey(parts: string[]): string {
  return parts.join('|');
}

function nextStepsFromProject(project: Project): BrainEntry[] {
  const analysis = project.analysis;
  if (!analysis?.prioritizedNextSteps?.length) return [];
  const taken = new Set(
    (analysis.nextStepsTaken ?? [])
      .filter((s) => s.taken)
      .map((s) => s.step),
  );
  const entries: BrainEntry[] = [];
  analysis.prioritizedNextSteps.forEach((step, idx) => {
    if (!step || taken.has(step)) return;
    entries.push({
      dedupKey: dedupKey(['ns', project.id, String(idx), step.slice(0, 40)]),
      kind: 'next_step',
      source: 'brain',
      sourceRef: { kind: 'next_step', projectId: project.id, index: idx, step },
      title: step.length > 80 ? step.slice(0, 77) + '…' : step,
      description: step,
      requiredSkills: ['strategy', 'next_step', 'product'],
      priority: idx < 3 ? 1 : 2, // top 3 are p1, rest p2
      estimatedHours: 2,
      projectId: project.id,
    });
  });
  return entries;
}

function devPromptsFromProject(project: Project): BrainEntry[] {
  const feedbackAnalyses = project.feedbackAnalyses ?? [];
  const entries: BrainEntry[] = [];
  for (const fa of feedbackAnalyses) {
    if (!fa.developerPrompts?.length) continue;
    const completedIdx = new Set(
      (fa.completedPrompts ?? []).map((c) => c.promptIndex),
    );
    fa.developerPrompts.forEach((prompt, idx) => {
      if (!prompt || completedIdx.has(idx)) return;
      entries.push({
        dedupKey: dedupKey(['dp', fa.id, String(idx)]),
        kind: 'dev_prompt',
        source: 'brain',
        sourceRef: {
          kind: 'dev_prompt',
          projectId: project.id,
          feedbackAnalysisId: fa.id,
          index: idx,
          prompt,
        },
        title: prompt.length > 80 ? prompt.slice(0, 77) + '…' : prompt,
        description: prompt,
        requiredSkills: ['code', 'engineering', 'dev_prompt'],
        priority: 2,
        estimatedHours: 3,
        projectId: project.id,
      });
    });
  }
  return entries;
}

// ── Feedback rollup ────────────────────────────────────────────────────────
//
// Top unaddressed bugs become dev_prompt tasks; recurring themes become
// research tasks. We dedupe across analyses by hashing the bug/theme text,
// so re-running feedback analysis on overlapping content doesn't double-mint.

const FEEDBACK_BUG_LIMIT = 5;
const FEEDBACK_THEME_LIMIT = 3;

function feedbackRollupFromProject(project: Project): BrainEntry[] {
  const fas = project.feedbackAnalyses ?? [];
  if (fas.length === 0) return [];
  const entries: BrainEntry[] = [];
  // Combine across all analyses but keep dedup keyed by the text + project so
  // the same bug surfaced twice doesn't mint twice.
  const seenBugs = new Set<string>();
  const seenThemes = new Set<string>();
  let bugsTaken = 0;
  let themesTaken = 0;

  for (const fa of fas) {
    for (const bug of fa.bugs ?? []) {
      if (bugsTaken >= FEEDBACK_BUG_LIMIT) break;
      const norm = bug.trim().toLowerCase();
      if (!norm || seenBugs.has(norm)) continue;
      seenBugs.add(norm);
      bugsTaken++;
      entries.push({
        dedupKey: dedupKey(['fb-bug', project.id, norm.slice(0, 60)]),
        kind: 'dev_prompt',
        source: 'brain',
        sourceRef: { kind: 'feedback_bug', projectId: project.id, feedbackAnalysisId: fa.id, bug },
        title: bug.length > 80 ? bug.slice(0, 77) + '…' : bug,
        description: `User-reported bug from feedback analysis: ${bug}`,
        requiredSkills: ['code', 'engineering', 'bugfix'],
        priority: 1,
        estimatedHours: 2,
        projectId: project.id,
      });
    }
    for (const theme of fa.themes ?? []) {
      if (themesTaken >= FEEDBACK_THEME_LIMIT) break;
      const norm = theme.trim().toLowerCase();
      if (!norm || seenThemes.has(norm)) continue;
      seenThemes.add(norm);
      themesTaken++;
      entries.push({
        dedupKey: dedupKey(['fb-theme', project.id, norm.slice(0, 60)]),
        kind: 'research',
        source: 'brain',
        sourceRef: { kind: 'feedback_theme', projectId: project.id, feedbackAnalysisId: fa.id, theme },
        title: `Investigate recurring theme: ${theme.length > 50 ? theme.slice(0, 47) + '…' : theme}`,
        description: `Recurring user-feedback theme that needs strategic attention: ${theme}`,
        requiredSkills: ['research', 'product', 'strategy'],
        priority: 2,
        estimatedHours: 3,
        projectId: project.id,
      });
    }
  }
  return entries;
}

// ── Project health (topRisks + growthMetrics) ─────────────────────────────

// Map a free-form growthMetric string to a GA4 metric name. Heuristic-based
// — covers the common cases. If no match, the verifier still works against
// the GA4 default 'sessions' metric and the LLM judges the delta in context.
const METRIC_KEYWORDS: Array<{ pattern: RegExp; metric: string; expected: 'increase' | 'decrease' }> = [
  { pattern: /\bbounce\b/i, metric: 'bounceRate', expected: 'decrease' },
  { pattern: /\bsessions?\b/i, metric: 'sessions', expected: 'increase' },
  { pattern: /\bpage\s*views?\b/i, metric: 'screenPageViews', expected: 'increase' },
  { pattern: /\b(active\s+)?users?\b/i, metric: 'activeUsers', expected: 'increase' },
  { pattern: /\bnew\s+users?\b/i, metric: 'newUsers', expected: 'increase' },
  { pattern: /\b(avg|average)\s+session/i, metric: 'averageSessionDuration', expected: 'increase' },
];

function inferMetricFromGrowthGoal(goal: string): { metric: string; expected: 'increase' | 'decrease' } | null {
  for (const { pattern, metric, expected } of METRIC_KEYWORDS) {
    if (pattern.test(goal)) return { metric, expected };
  }
  return null;
}

// Snapshot the current GA4 value for a metric so the verifier has a real
// baseline to compare against. Returns null if GA4 isn't connected — the
// task still mints, just without a baseline (verifier falls back to 'thin').
async function snapshotMetricBaseline(
  project: Project,
  metric: string,
): Promise<number | null> {
  if (!project.analyticsPropertyId) return null;
  const config = await getAnalyticsConfig({ kind: 'team', teamId: project.teamId });
  if (!config?.oauth) return null;
  try {
    const data = await fetchAnalyticsData(
      project.analyticsPropertyId,
      { oauth: config.oauth, scope: { kind: 'team', teamId: project.teamId } },
      14,
    );
    const overview = data.overview as unknown as Record<string, number>;
    const value = overview[metric];
    return typeof value === 'number' ? value : null;
  } catch (err) {
    logger.warn('brain: ga4 baseline snapshot failed', {
      projectId: project.id,
      metric,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function projectHealthFromProject(project: Project): Promise<BrainEntry[]> {
  const a = project.analysis;
  if (!a) return [];
  const entries: BrainEntry[] = [];
  // topRisks → priority-1 next_step tasks. Risks are never auto-marked taken,
  // so dedup is purely by text hash + project — re-running analysis on a
  // still-present risk leaves the original task in place.
  (a.topRisks ?? []).slice(0, 3).forEach((risk, idx) => {
    if (!risk) return;
    const norm = risk.trim().toLowerCase().slice(0, 60);
    entries.push({
      dedupKey: dedupKey(['risk', project.id, String(idx), norm]),
      kind: 'next_step',
      source: 'brain',
      sourceRef: { kind: 'top_risk', projectId: project.id, index: idx, risk },
      title: `Mitigate risk: ${risk.length > 60 ? risk.slice(0, 57) + '…' : risk}`,
      description: `Strategic risk flagged in product analysis: ${risk}`,
      requiredSkills: ['strategy', 'product', 'risk'],
      priority: 1,
      estimatedHours: 4,
      projectId: project.id,
    });
  });
  // growthMetrics → analytics task to set up tracking + targets. Snapshot the
  // current GA4 value as the baseline so the verifier can later judge whether
  // the metric actually moved in the expected direction.
  const metrics = (a.growthMetrics ?? []).slice(0, 2);
  for (let idx = 0; idx < metrics.length; idx++) {
    const metric = metrics[idx];
    if (!metric) continue;
    const norm = metric.trim().toLowerCase().slice(0, 60);
    const inferred = inferMetricFromGrowthGoal(metric);
    const ga4Metric = inferred?.metric ?? 'sessions';
    const expected = inferred?.expected ?? 'increase';
    const baseline = await snapshotMetricBaseline(project, ga4Metric);

    entries.push({
      dedupKey: dedupKey(['metric', project.id, String(idx), norm]),
      kind: 'analytics',
      source: 'brain',
      sourceRef: {
        kind: 'growth_metric',
        projectId: project.id,
        index: idx,
        goal: metric,
        // These three fields are read by evidenceSources.ga4_metric to compare
        // observed vs baseline at verification time.
        metric: ga4Metric,
        baseline: baseline ?? undefined,
        expected,
      },
      title: `Track growth metric: ${metric.length > 60 ? metric.slice(0, 57) + '…' : metric}`,
      description: `Growth metric flagged in analysis. Set up tracking, baseline, and target: ${metric}${baseline !== null ? `\n\nBaseline (last 14d): ${ga4Metric} = ${baseline}` : ''}`,
      requiredSkills: ['analytics', 'data'],
      priority: 2,
      estimatedHours: 2,
      projectId: project.id,
    });
  }
  return entries;
}

// ── GitHub drift ─────────────────────────────────────────────────────────
//
// If the latest commit's date is >7 days newer than the analysis ts AND no
// commit message word overlaps with prioritizedNextSteps, mint a research
// task: priorities may have shifted. We use commit message keyword overlap
// as a cheap proxy — it's conservative (false-negative biased), which means
// we mint a drift entry only when there's real divergence signal.

const DRIFT_DAYS = 7;

async function githubDriftFromProject(project: Project): Promise<BrainEntry[]> {
  if (!project.githubUrl || !project.analysis) return [];
  const analyzedAt = new Date(project.analysis.analyzedAt);
  if (!Number.isFinite(analyzedAt.getTime())) return [];

  const user = project.createdBy ? await getUserById(project.createdBy) : null;
  const token = user?.githubAccessToken;
  const head = await getLatestCommit(project.githubUrl, token).catch(() => null);
  if (!head) return [];
  const commitDate = new Date(head.date);
  if (!Number.isFinite(commitDate.getTime())) return [];

  const ageDays = (commitDate.getTime() - analyzedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < DRIFT_DAYS) return [];

  const message = head.message.toLowerCase();
  const stepWords = new Set<string>();
  for (const step of project.analysis.prioritizedNextSteps ?? []) {
    for (const word of step.toLowerCase().split(/\W+/)) {
      if (word.length >= 5) stepWords.add(word);
    }
  }
  const overlapping = Array.from(stepWords).some((w) => message.includes(w));
  if (overlapping) return [];

  return [{
    dedupKey: dedupKey(['drift', project.id, head.sha.slice(0, 12)]),
    kind: 'research',
    source: 'brain',
    sourceRef: {
      kind: 'github_drift',
      projectId: project.id,
      headSha: head.sha,
      analyzedAt: project.analysis.analyzedAt,
    },
    title: `Review priorities — recent work has drifted from declared next steps`,
    description: `Latest commit "${head.message}" doesn't overlap with the analysis's prioritized next steps. Either re-analyze the codebase or update the priority list to match what's actually being built.`,
    requiredSkills: ['strategy', 'product', 'review'],
    priority: 2,
    estimatedHours: 1,
    projectId: project.id,
  }];
}

export async function readUnifiedBrain(teamId: string): Promise<BrainSnapshot> {
  const projects = await getAllProjects(teamId);
  const entries: BrainEntry[] = [];
  for (const p of projects) {
    entries.push(...nextStepsFromProject(p));
    entries.push(...devPromptsFromProject(p));
    entries.push(...feedbackRollupFromProject(p));
    try {
      entries.push(...await projectHealthFromProject(p));
    } catch (err) {
      logger.warn('brain: project health failed', {
        projectId: p.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      entries.push(...await githubDriftFromProject(p));
    } catch (err) {
      logger.warn('brain: github drift failed', {
        projectId: p.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const byKind: Record<TaskKind, number> = {
    next_step: 0,
    dev_prompt: 0,
    marketing: 0,
    analytics: 0,
    research: 0,
    custom: 0,
  };
  entries.forEach((e) => {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  });

  return {
    computedAt: new Date().toISOString(),
    totalEntries: entries.length,
    byKind,
    entries,
  };
}

// Exported for tests so they can build entries without hitting Supabase.
export const __testing = {
  nextStepsFromProject,
  devPromptsFromProject,
  feedbackRollupFromProject,
  projectHealthFromProject,
  githubDriftFromProject,
};

export type { Project, ProductAnalysis, FeedbackAnalysis };
