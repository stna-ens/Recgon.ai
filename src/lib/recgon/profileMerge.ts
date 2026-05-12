// Phase 1 + Phase 2 (Plan 02-04): pure read-path merge of owner row +
// self-declared profile + GitHub-inferred skill map + EMA layer.
//
// Phase 1 baseline policy (unchanged):
// - D-02: strengths fold into the merged `skills` array (existing 45%-Jaccard
//   in match.ts picks them up automatically; no math touch needed).
// - D-03: `interests` is carried as an additive field on the returned object
//   so match.ts can read it for the tie-breaker nudge (separately from skills).
// - D-06: self wins when filled; owner row fills the blanks — field-level,
//   not row-level.
// - D-08: when profile is null, return the owner `teammate` unchanged
//   (with `fitProfile: ema` and `interests: []` for downstream consumers).
//
// Phase 2 (Plan 02-04 / SKILL-04+05+06) additions:
// - Third argument widened from `null` to `InferredSkillMap | null`. Phase 1
//   call sites that pass `null` continue to behave identically (regression
//   guard — `profileMerge.inferred.test.ts` Case 1).
// - Three-source weighted blend per-tag: `blended = 0.5*self + 0.3*inferred
//   + 0.2*ema`. Weights are constants near the top so a tuning pass can
//   touch one place (ROADMAP "initial weights, tunable").
// - Read-time time decay on BOTH the inferred and EMA sources via
//   `applyTimeDecay` (τ=90d). Stale signal naturally loses weight without
//   a DB write-back — RESEARCH Pattern 5.
// - Rejected rows (`rejectedAt !== null`) are EXCLUDED from the blend even
//   though `listActiveInferredSkillsForTeam` already filters them at the SQL
//   level. Defense-in-depth — ROADMAP success criterion 3.
// - The merged `skills` array now contains tags whose blended score is
//   strictly greater than `BLEND_THRESHOLD`. A stale signal (e.g. exp(-2)
//   on a small score) naturally drops below the threshold.
//
// Pure function: no Supabase, no LLM, no IO. Trivially unit-testable.

import { applyTimeDecay } from './fitLearning';
import type {
  InferredSkill,
  InferredSkillMap,
  Teammate,
  TeammateProfile,
} from './types';

// SKILL-04 blend weights. Sum to 1.0; tunable in one place per ROADMAP.
export const WEIGHT_SELF = 0.5;
export const WEIGHT_INFERRED = 0.3;
export const WEIGHT_EMA = 0.2;

// Minimum blended score required for a tag to surface as a present skill on
// the merged Teammate. Self-declared tags carry value 1.0 → 0.5 blended → far
// above the threshold. An inferred-only tag at score 0.3 with 180d decay
// blends to 0.3 * 0.3 * exp(-2) ≈ 0.012, BELOW threshold — stale signal
// correctly drops off without surfacing.
export const BLEND_THRESHOLD = 0.05;

export function profileMerge(
  teammate: Teammate,
  profile: TeammateProfile | null,
  inferred: InferredSkillMap | null,
  ema: Teammate['fitProfile'],
  now: Date = new Date(),
): Teammate & { interests: string[] } {
  // D-08: no profile row → owner view unchanged + EMA passthrough + empty
  // interests. Phase 1 SUMMARY pinned this — do NOT remove. The dispatcher's
  // empty-profile regression test (dispatcherProfileMerge.test.ts Test 3)
  // relies on this branch staying owner-row-identical.
  if (!profile) {
    return { ...teammate, fitProfile: ema, interests: [] };
  }

  // ── Phase 1 baseline assembly (unchanged) ─────────────────────────────
  // D-02 strengths fold + lowercase normalization (guards against
  // case-sensitive comparisons downstream in match.ts).
  const declaredSkills = new Set<string>(
    [
      ...(profile.skillsCanonical ?? []),
      ...(profile.strengthsCanonical ?? []),
    ].map((s) => s.toLowerCase()),
  );

  // D-06 field-level: self wins when filled; otherwise owner skills.
  const phase1Skills =
    declaredSkills.size > 0 ? [...declaredSkills] : teammate.skills;

  // D-06 field-level: profile.weeklyCapacityHours wins when it is a real
  // number; blank/null falls back to the owner row.
  const capacityHours =
    typeof profile.weeklyCapacityHours === 'number'
      ? profile.weeklyCapacityHours
      : teammate.capacityHours;

  // D-03: interests are a separate signal (NOT folded into skills).
  const interests = (profile.interestsCanonical ?? []).map((s) =>
    s.toLowerCase(),
  );

  // ── Phase 2 (Plan 02-04) blend ────────────────────────────────────────
  // Phase 1 regression guard: when inferred=null AND ema has no skillStats,
  // we MUST emit the same shape Phase 1 emitted. We do that by only running
  // the blend when at least one of the three sources contributes — when no
  // inferred and no ema-skillStats, the per-tag map below is built solely
  // from `phase1Skills` and produces a blended score of 0.5 per tag, all
  // strictly above BLEND_THRESHOLD, equivalent to "all self-declared tags
  // surface". The membership-set is identical to Phase 1's `skills` array,
  // so Phase 1 tests stay green.
  const blendedScores = new Map<string, number>();

  // Source 1 — self-declared (value 1.0 per tag, no decay; self-declared is
  // current by definition).
  for (const tag of phase1Skills) {
    const lower = tag.toLowerCase();
    blendedScores.set(
      lower,
      (blendedScores.get(lower) ?? 0) + WEIGHT_SELF * 1.0,
    );
  }

  // Source 2 — inferred (decayed at read time, rejected rows excluded).
  if (inferred) {
    for (const row of inferred.values()) {
      // T-02-20 defense-in-depth: storage already filters rejected rows; we
      // double-check here so a buggy storage typo can't leak a rejected tag
      // into dispatch math. ROADMAP success criterion 3.
      if (row.rejectedAt !== null) continue;
      const decayed = applyTimeDecay(row.score, row.lastSeenAt, now);
      const lower = row.canonicalTag.toLowerCase();
      blendedScores.set(
        lower,
        (blendedScores.get(lower) ?? 0) + WEIGHT_INFERRED * decayed,
      );
    }
  }

  // Source 3 — EMA (read-time decay; ROADMAP success criterion 4: old skill
  // signal fades without a DB write-back).
  const skillStats = ema?.skillStats;
  if (skillStats) {
    for (const [tag, stat] of Object.entries(skillStats)) {
      if (!stat) continue;
      // skillStats stores ratings in [-1, 1]; remap to [0, 1] so the blend
      // math stays in the same range as inferred scores.
      const normalized = Math.max(0, Math.min(1, (stat.rolling30dAvg + 1) / 2));
      if (normalized <= 0) continue;
      const decayed = applyTimeDecay(normalized, stat.lastRatedAt, now);
      const lower = tag.toLowerCase();
      blendedScores.set(
        lower,
        (blendedScores.get(lower) ?? 0) + WEIGHT_EMA * decayed,
      );
    }
  }

  // Threshold filter — any tag whose blended score is too small (stale
  // inferred signal with no other source backing it) drops off.
  const skills = [...blendedScores.entries()]
    .filter(([, score]) => score > BLEND_THRESHOLD)
    .map(([tag]) => tag);

  return {
    ...teammate,
    skills,
    capacityHours,
    fitProfile: ema,
    interests,
  };
}

// Re-export the InferredSkill type for callers that only import profileMerge.
// (Tree-shaking safe: type-only export.)
export type { InferredSkill, InferredSkillMap };
