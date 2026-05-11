// Phase 1 (PROFILE-04, D-06, D-08): pure field-level merge of owner row +
// self-declared profile. `inferred` is reserved for Phase 2 GitHub-inferred
// layer and is typed `null` in Phase 1.
//
// Policy summary:
// - D-02: strengths fold into the merged `skills` array (existing 45%-Jaccard
//   in match.ts picks them up automatically; no math touch needed).
// - D-03: `interests` is carried as an additive field on the returned object
//   so match.ts can read it for the tie-breaker nudge (separately from skills).
// - D-06: self wins when filled; owner row fills the blanks — field-level,
//   not row-level.
// - D-08: when profile is null, return the owner `teammate` unchanged
//   (with `fitProfile: ema` and `interests: []` for downstream consumers).
//
// Pure function: no Supabase, no LLM, no IO. Trivially unit-testable.
//
// Phase 2 will widen this to InferredSkills | null.

import type { Teammate, TeammateProfile } from './types';

export function profileMerge(
  teammate: Teammate,
  profile: TeammateProfile | null,
  inferred: null,
  ema: Teammate['fitProfile'],
): Teammate & { interests: string[] } {
  // `inferred` is intentionally accepted but unused in Phase 1; reading it
  // here keeps the parameter live in TS so callers can't accidentally drop it.
  void inferred;

  // D-08: no profile row → owner view unchanged + EMA passthrough + empty interests.
  if (!profile) {
    return { ...teammate, fitProfile: ema, interests: [] };
  }

  // D-02 strengths fold + lowercase normalization (guards against
  // case-sensitive comparisons downstream in match.ts).
  const declaredSkills = new Set<string>(
    [
      ...(profile.skillsCanonical ?? []),
      ...(profile.strengthsCanonical ?? []),
    ].map((s) => s.toLowerCase()),
  );

  // D-06 field-level: self wins when filled; otherwise owner skills.
  const skills = declaredSkills.size > 0 ? [...declaredSkills] : teammate.skills;

  // D-06 field-level: profile.weeklyCapacityHours wins when it is a real
  // number; blank/null falls back to the owner row. `typeof === 'number'`
  // explicitly guards against `null` coming from the Supabase column.
  const capacityHours =
    typeof profile.weeklyCapacityHours === 'number'
      ? profile.weeklyCapacityHours
      : teammate.capacityHours;

  // D-03: interests are a separate signal (NOT folded into skills). Same
  // lowercase normalization to keep the match.ts comparison case-insensitive.
  const interests = (profile.interestsCanonical ?? []).map((s) => s.toLowerCase());

  return {
    ...teammate,
    skills,
    capacityHours,
    fitProfile: ema,
    interests,
  };
}
