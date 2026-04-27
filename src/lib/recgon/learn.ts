// Learning loop — update a teammate's `fit_profile.taskKindScores` from
// rating events. Uses an exponential moving average so recent ratings
// shift the score quickly while older ones still contribute.
//
// Mapping: rating ∈ {-1, +1} treated directly as the new sample. EMA stays
// in [-1, 1]; UI converts to 0..5 stars elsewhere.

import { getTeammate, updateTeammate } from './storage';
import type { FitProfile, TaskKind } from './types';

// Higher α = faster adaptation, more volatile. 0.30 means ~3 ratings to
// move halfway between an old score and a streak of new ones.
const LEARNING_RATE = 0.30;

export function updateScore(prev: number | undefined, rating: 1 | -1): number {
  const base = typeof prev === 'number' ? prev : 0;
  const next = base * (1 - LEARNING_RATE) + rating * LEARNING_RATE;
  // Clamp defensively in case of repeated NaNs upstream.
  return Math.max(-1, Math.min(1, next));
}

export function applyRatingToProfile(
  profile: FitProfile | null | undefined,
  kind: TaskKind,
  rating: 1 | -1,
): FitProfile {
  const scores = { ...(profile?.taskKindScores ?? {}) };
  scores[kind] = updateScore(scores[kind], rating);
  return {
    taskKindScores: scores,
    lastUpdated: new Date().toISOString(),
  };
}

export async function recordRatingForLearning(
  teammateId: string,
  kind: TaskKind,
  rating: 1 | -1,
): Promise<void> {
  const teammate = await getTeammate(teammateId);
  if (!teammate) return;
  const nextProfile = applyRatingToProfile(teammate.fitProfile, kind, rating);
  await updateTeammate(teammateId, { fitProfile: nextProfile });
}
