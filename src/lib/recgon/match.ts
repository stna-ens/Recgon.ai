// Recgon matching — score each teammate for a given task and pick the best.
//
// base score = 0.45 * skillOverlap
//            + 0.30 * fitForKind
//            + 0.15 * availabilityNow
//            + 0.10 * loadHeadroom
//
// Then the skillOverlap term is multiplied by `skillWeight()` (in [0.5, 1.5])
// so a teammate's recent track record on the task's required skills biases
// the match. Bounded so newcomers aren't shut out and one bad rating doesn't
// tank a strong teammate.
//
// Below MIN_FIT_SCORE the task stays unassigned and Recgon flags "no good fit".

import { skillWeight } from './fitLearning';
import type { AgentTask, BrainEntry, Teammate, TeammateWithStats, WorkingHours } from './types';

export const MIN_FIT_SCORE = 0.25;

const W_SKILL = 0.45;
const W_FIT = 0.30;
const W_AVAIL = 0.15;
const W_LOAD = 0.10;

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0.5; // no signal — neutral
  if (a.length === 0 || b.length === 0) return 0.1;
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  sa.forEach((x) => {
    if (sb.has(x)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function fitForKind(teammate: Teammate, kind: string): number {
  const score = teammate.fitProfile?.taskKindScores?.[kind];
  if (typeof score !== 'number') return 0.5; // newcomer — neutral, gets tried
  // EMA stored in [-1, 1] → normalise to [0, 1].
  return Math.max(0, Math.min(1, (score + 1) / 2));
}

export function isWithinWorkingHours(wh: WorkingHours | null, now: Date = new Date()): boolean {
  if (!wh) return true; // null = always available (AI default)
  const tz = wh.tz || 'UTC';
  // Format hour in target timezone using Intl. Cheap enough to do per-call.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase();
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const hour = parseInt(hourStr, 10);
  const map: Record<string, keyof WorkingHours> = {
    mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
  };
  const key = map[wd];
  if (!key) return false;
  const window = wh[key];
  if (!Array.isArray(window)) return false;
  return hour >= window[0] && hour < window[1];
}

function availabilityNow(teammate: Teammate, now: Date = new Date()): number {
  return isWithinWorkingHours(teammate.workingHours, now) ? 1 : 0.3;
}

function loadHeadroom(inFlightHours: number, capacityHours: number, taskHours: number): number {
  const headroom = 1 - (inFlightHours + taskHours) / Math.max(1, capacityHours);
  return Math.max(0, Math.min(1, headroom));
}

// Fallback when real summed hours aren't available (legacy callers / tests
// that pass only `inFlightCount`). Same constant the placeholder used.
const FALLBACK_HOURS_PER_TASK = 1.5;

export type Scoreable =
  | TeammateWithStats
  | (Teammate & { inFlightCount?: number; inFlightHours?: number });

export type MatchInput = Pick<AgentTask, 'kind' | 'requiredSkills' | 'estimatedHours'> &
  Partial<Pick<AgentTask, 'priority'>>;

export type MatchResult = {
  teammate: Scoreable;
  score: number;
  breakdown: {
    skillOverlap: number;
    fitForKind: number;
    availabilityNow: number;
    loadHeadroom: number;
  };
};

export function scoreTeammateForTask(
  teammate: Scoreable,
  task: MatchInput,
  now: Date = new Date(),
): MatchResult {
  const baseSkillOverlap = jaccard(task.requiredSkills ?? [], teammate.skills ?? []);
  // Per-skill learning: weight the skill score by the teammate's recent
  // track record on the specific skills this task needs. 1.0 = no signal.
  const weight = skillWeight(teammate.fitProfile, task.requiredSkills ?? []);
  const skillOverlap = Math.max(0, Math.min(1, baseSkillOverlap * weight));
  const fit = fitForKind(teammate, task.kind);
  const avail = availabilityNow(teammate, now);
  const stats = teammate as TeammateWithStats;
  // Prefer real summed in-flight hours from listTeammatesWithStats. Fall
  // back to count × rough-avg when hours weren't supplied (legacy callers,
  // unit tests). 0-hour aggregates are valid (no in-flight work) and must
  // not silently trigger the fallback — so we check `undefined`, not falsy.
  const inFlightHours =
    stats.inFlightHours !== undefined
      ? stats.inFlightHours
      : (stats.inFlightCount ?? 0) * FALLBACK_HOURS_PER_TASK;
  const load = loadHeadroom(inFlightHours, teammate.capacityHours, task.estimatedHours ?? 1);
  const score =
    W_SKILL * skillOverlap +
    W_FIT * fit +
    W_AVAIL * avail +
    W_LOAD * load;
  return {
    teammate,
    score,
    breakdown: {
      skillOverlap,
      fitForKind: fit,
      availabilityNow: avail,
      loadHeadroom: load,
    },
  };
}

export function pickBestMatch(
  candidates: Scoreable[],
  task: MatchInput,
  now: Date = new Date(),
): MatchResult | null {
  // AI teammates are not dispatched to (the AI-doer side was removed).
  const eligible = candidates.filter((c) => c.status === 'active' && c.kind !== 'ai');
  if (eligible.length === 0) return null;
  const scored = eligible.map((c) => scoreTeammateForTask(c, task, now));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score < MIN_FIT_SCORE) return null;
  return best;
}

// Convenience for brain entries (same shape as AgentTask for matching purposes).
export function pickBestForBrainEntry(
  candidates: Scoreable[],
  entry: BrainEntry,
  now: Date = new Date(),
): MatchResult | null {
  return pickBestMatch(
    candidates,
    {
      kind: entry.kind,
      requiredSkills: entry.requiredSkills,
      estimatedHours: entry.estimatedHours,
      priority: entry.priority,
    },
    now,
  );
}
