// Recgon scheduled brain entries — keep the dispatcher "alive" between
// human-driven analyses by minting recurring tasks.
//
// Idempotency: each entry's `dedupKey` includes the period (ISO week or day)
// so re-running the cron in the same period is a no-op via the unique index
// `uq_agent_tasks_source_ref` on (team_id, kind, source_ref->>'dedupKey').

import type { BrainEntry } from './types';
import { mintTasksFromBrain } from './taskMint';
import { runDispatch } from './dispatcher';
import { supabase } from '../supabase';
import { logger } from '../logger';

function isoWeek(now: Date = new Date()): string {
  // ISO week-numbering: YYYY-Www. Used for once-per-week dedup.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type ProjectLite = { id: string; analyticsPropertyId?: string | null; analysis?: unknown };

async function getProjectsLite(teamId: string): Promise<ProjectLite[]> {
  const { data } = await supabase
    .from('projects')
    .select('id, analytics_property_id')
    .eq('team_id', teamId);
  if (!data) return [];
  // Hydrate analytics flag from the row's analytics_property_id; presence
  // means GA4 was connected at some point.
  return data.map((r) => ({
    id: r.id as string,
    analyticsPropertyId: (r.analytics_property_id as string | null) ?? null,
  }));
}

export function buildScheduledEntries(
  teamId: string,
  projects: ProjectLite[],
  now: Date = new Date(),
): BrainEntry[] {
  const entries: BrainEntry[] = [];
  const week = isoWeek(now);
  const day = isoDay(now);

  // Weekly product health check — fires once per ISO week. Goes to whichever
  // teammate scores best on strategy/product skills.
  entries.push({
    dedupKey: `schedule|health|${teamId}|${week}`,
    kind: 'next_step',
    source: 'schedule',
    sourceRef: { kind: 'health_check', week },
    title: 'Weekly product health check',
    description:
      'Scan the team\'s open work, recent feedback, and analytics signals. Surface the single most important thing to focus on this week and one risk to watch.',
    requiredSkills: ['strategy', 'product', 'roadmap', 'next_step'],
    priority: 1,
    estimatedHours: 2,
  });

  // Daily anomaly scan — only mint if at least one project has GA4 connected,
  // so we don't fill the queue with no-op tasks.
  const ga4Projects = projects.filter((p) => p.analyticsPropertyId);
  if (ga4Projects.length > 0) {
    entries.push({
      dedupKey: `schedule|anomaly|${teamId}|${day}`,
      kind: 'analytics',
      source: 'schedule',
      sourceRef: { kind: 'anomaly_scan', day, projectCount: ga4Projects.length },
      title: 'Daily analytics anomaly scan',
      description:
        'Pull the last day of GA4 data across connected projects. Flag any metric that broke trend (>2σ) and suggest the next investigation.',
      requiredSkills: ['analytics', 'ga4', 'anomaly_detection', 'metrics'],
      priority: 2,
      estimatedHours: 1,
    });
  }

  return entries;
}

export type ScheduleResult = {
  teamId: string;
  minted: number;
  skipped: number;
  dispatched: { assigned: number; noFit: number };
};

export async function runScheduledForTeam(teamId: string, now: Date = new Date()): Promise<ScheduleResult> {
  const projects = await getProjectsLite(teamId);
  const entries = buildScheduledEntries(teamId, projects, now);
  const snapshot = {
    computedAt: now.toISOString(),
    totalEntries: entries.length,
    byKind: {
      next_step: entries.filter((e) => e.kind === 'next_step').length,
      dev_prompt: entries.filter((e) => e.kind === 'dev_prompt').length,
      marketing: entries.filter((e) => e.kind === 'marketing').length,
      analytics: entries.filter((e) => e.kind === 'analytics').length,
      research: entries.filter((e) => e.kind === 'research').length,
      custom: entries.filter((e) => e.kind === 'custom').length,
    },
    entries,
  };
  const { minted, skipped } = await mintTasksFromBrain(teamId, snapshot);
  // Run a dispatch pass so the new tasks get assigned same-tick.
  let dispatched = { assigned: 0, noFit: 0 };
  try {
    const r = await runDispatch(teamId);
    dispatched = { assigned: r.assigned, noFit: r.noFit };
  } catch (err) {
    logger.warn('runScheduledForTeam: dispatch failed', {
      teamId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return { teamId, minted: minted.length, skipped, dispatched };
}

export async function listActiveTeamIds(): Promise<string[]> {
  // A team is "active" if it has a recgon_state row (seeded on team create).
  const { data } = await supabase.from('recgon_state').select('team_id');
  return ((data ?? []) as { team_id: string }[]).map((r) => r.team_id);
}

// Exposed for tests.
export const __testing = { isoWeek, isoDay, buildScheduledEntries };
