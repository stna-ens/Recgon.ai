// Phase 2 / Plan 02-04 — shared fixture factories for InferredSkill rows.
//
// Used by profileMerge.inferred.test.ts and dispatcher.threeSourceBlend.test.ts
// to build deterministic accepted / rejected / decayed inferred-skill rows
// without copy-pasting the full InferredSkill shape in every test.
//
// All factories return a complete InferredSkill so tests can pass them
// straight into profileMerge's InferredSkillMap or into Supabase-fixture
// inserts (after the camelCase→snake_case shim the storage test does).
//
// `daysAgo` is interpreted relative to a `nowAnchor` argument so tests can
// pin a deterministic clock and assert exact decay math (RESEARCH
// Validation §Landmines — never internal Date.now()).

import type { InferredSkill, InferredSkillSource } from '../types';

const DEFAULT_NOW = () => new Date();

function isoDaysBefore(daysAgo: number, now: Date = new Date()): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
}

export interface MakeAcceptedOpts {
  score?: number;
  daysAgo?: number;
  source?: InferredSkillSource;
  teammateId?: string;
  teamId?: string;
  id?: string;
  confirmedAt?: string | null;
  now?: Date;
}

export function makeAccepted(
  canonicalTag: string,
  opts: MakeAcceptedOpts = {},
): InferredSkill {
  const now = opts.now ?? DEFAULT_NOW();
  const lastSeenAt = isoDaysBefore(opts.daysAgo ?? 30, now);
  const created = isoDaysBefore(opts.daysAgo ?? 30, now);
  return {
    id: opts.id ?? `inf-${canonicalTag}-${Math.random().toString(36).slice(2, 8)}`,
    teammateId: opts.teammateId ?? 'tm-1',
    teamId: opts.teamId ?? 't',
    canonicalTag,
    score: opts.score ?? 0.8,
    source: opts.source ?? 'llm_commit',
    lastSeenAt,
    confirmedAt: opts.confirmedAt ?? null,
    rejectedAt: null,
    userReviewedAt: null,
    createdAt: created,
    updatedAt: created,
  };
}

export interface MakeRejectedOpts extends MakeAcceptedOpts {
  rejectedDaysAgo?: number;
}

export function makeRejected(
  canonicalTag: string,
  opts: MakeRejectedOpts = {},
): InferredSkill {
  const now = opts.now ?? DEFAULT_NOW();
  return {
    ...makeAccepted(canonicalTag, opts),
    rejectedAt: isoDaysBefore(opts.rejectedDaysAgo ?? 1, now),
  };
}

export interface MakeOldOpts extends MakeAcceptedOpts {}

/**
 * Accepted but stale — `lastSeenAt` defaults to 180 days ago. The decay
 * multiplier at τ=90 is exp(-180/90) = exp(-2) ≈ 0.1353, so a score=1.0
 * row collapses to ~0.135 after applyTimeDecay.
 */
export function makeOld(
  canonicalTag: string,
  opts: MakeOldOpts = {},
): InferredSkill {
  return makeAccepted(canonicalTag, { ...opts, daysAgo: opts.daysAgo ?? 180 });
}
