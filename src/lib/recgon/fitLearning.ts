// Per-skill learning loop — extends learn.ts (per-kind EMA) with running
// stats per required-skill of the rated task. Used by match.ts to weight
// the skill-overlap score so a strong teammate keeps getting routed work in
// their wheelhouse and a struggling teammate is biased toward different work.
//
// Why both? per-kind tells us "is Alice good at marketing tasks?", per-skill
// tells us "is Alice good at the *Instagram* slice of marketing tasks?"

import { getTeammate, updateTeammate } from './storage';
import type { FitProfile, SkillStat } from './types';

const ALPHA = 0.30;            // EMA learning rate (matches learn.ts)
const ROLLING_WINDOW_DAYS = 30;
const PRUNE_DAYS = 90;

export function applySkillRating(
  prev: SkillStat | undefined,
  rating: 1 | -1,
  now: Date = new Date(),
): SkillStat {
  const prevAvg = typeof prev?.avgRating === 'number' ? prev.avgRating : 0;
  const avgRating = Math.max(-1, Math.min(1, prevAvg * (1 - ALPHA) + rating * ALPHA));
  const tasksDone = (prev?.tasksDone ?? 0) + 1;
  // For the rolling 30d we can't store raw ratings without growing the row,
  // so we approximate with a faster-decaying EMA whose half-life ≈ 30 days
  // assuming roughly one rating per day. Good enough for matching weight.
  const rolling = typeof prev?.rolling30dAvg === 'number' ? prev.rolling30dAvg : 0;
  const rolling30dAvg = Math.max(-1, Math.min(1, rolling * 0.7 + rating * 0.3));
  return {
    tasksDone,
    avgRating,
    rolling30dAvg,
    lastRatedAt: now.toISOString(),
  };
}

export function applySkillRatingsToProfile(
  profile: FitProfile | null | undefined,
  skills: string[],
  rating: 1 | -1,
  now: Date = new Date(),
): FitProfile {
  const stats = { ...(profile?.skillStats ?? {}) };
  for (const raw of skills) {
    const skill = raw.trim().toLowerCase();
    if (!skill) continue;
    stats[skill] = applySkillRating(stats[skill], rating, now);
  }
  // Prune skills not rated in PRUNE_DAYS — keep the row from accumulating
  // entries forever as a teammate's responsibilities shift.
  const cutoff = new Date(now.getTime() - PRUNE_DAYS * 24 * 60 * 60 * 1000);
  for (const key of Object.keys(stats)) {
    const lastRated = new Date(stats[key].lastRatedAt);
    if (Number.isFinite(lastRated.getTime()) && lastRated < cutoff) {
      delete stats[key];
    }
  }
  return {
    ...(profile ?? {}),
    skillStats: stats,
    lastUpdated: now.toISOString(),
  };
}

export async function recordSkillRating(
  teammateId: string,
  skills: string[],
  rating: 1 | -1,
): Promise<void> {
  if (skills.length === 0) return;
  const teammate = await getTeammate(teammateId);
  if (!teammate) return;
  const next = applySkillRatingsToProfile(teammate.fitProfile, skills, rating);
  await updateTeammate(teammateId, { fitProfile: next });
}

// Match-time helper: a multiplicative weight in [0.5, 1.5] derived from the
// rolling 30d avg of the task's required skills. Bounded so newcomers
// (no signal) aren't shut out and one bad rating doesn't tank a strong
// teammate. Returns 1.0 when there's no signal.
export function skillWeight(profile: FitProfile | null | undefined, skills: string[]): number {
  const stats = profile?.skillStats;
  if (!stats || skills.length === 0) return 1.0;
  const samples: number[] = [];
  for (const raw of skills) {
    const s = stats[raw.trim().toLowerCase()];
    if (!s || s.tasksDone === 0) continue;
    samples.push(s.rolling30dAvg);
  }
  if (samples.length === 0) return 1.0;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  // avg ∈ [-1, 1] → weight ∈ [0.5, 1.5]
  return Math.max(0.5, Math.min(1.5, 1 + avg * 0.5));
}

export const __testing = { ALPHA, ROLLING_WINDOW_DAYS, PRUNE_DAYS };
