---
phase: 01-profile-foundation
plan: 02
subsystem: dispatcher-substrate
tags: [pure-function, math, interest-nudge, profile-merge, PROFILE-04, PROFILE-06]
dependency_graph:
  requires:
    - "01-01: TeammateProfile type + ProfileVisibility type"
    - "01-01: skillVocabulary canonical set (for downstream Plan 03 picker)"
  provides:
    - profileMerge-pure-function
    - merged-Teammate-interests-field
    - MatchResult-breakdown-interestNudge-field
    - INTEREST_NUDGE_WEIGHT-constant
  affects:
    - src/lib/recgon/match.ts
    - src/lib/recgon/types.ts (read-only — interests is structural, not added to Teammate)
tech_stack:
  added: []
  patterns:
    - pure-function-merge-with-field-level-fallback
    - additive-math-term-after-weighted-sum
    - literal-null-type-locked-phase-1-parameter
key_files:
  created:
    - src/lib/recgon/profileMerge.ts
    - src/__tests__/profileMerge.test.ts
    - src/__tests__/matchInterestNudge.test.ts
  modified:
    - src/lib/recgon/match.ts
    - architecture.md
key_decisions:
  - "INTEREST_NUDGE_WEIGHT = 0.03 (≤ 0.05 hard cap per D-03; starting value picked from Pitfall 3 guidance — leaves headroom and keeps the nudge below any realistic skill-overlap delta)"
  - "MatchResult.breakdown.interestNudge: number (NOT optional) — back-compat path returns 0, never undefined, so consumers can sum / compare without `?? 0`"
  - "Merged Teammate's `interests` field is `string[]` (non-optional) — null profile returns `[]`, never undefined; match.ts still reads via `?? []` for double-defense back-compat"
  - "Strengths fold into skills (D-02): NO math change in match.ts; the existing 45%-Jaccard picks them up automatically once profileMerge unions them into the skills array"
  - "`inferred: null` literal type kept — Phase 2 must widen to `InferredSkills | null` which will produce a TS error at every call site, forcing migration visibility"
metrics:
  duration_seconds: 360
  task_count_completed: 2
  task_count_blocking_checkpoint: 0
  completed_date: 2026-05-11
  files_changed: 5
---

# Phase 1 Plan 02: Pure-Function Data Transform Layer — Summary

Landed the Phase 1 pure-function substrate: `profileMerge` consolidates owner row + self-declared profile with field-level fallback, and the only allowed math touch in Phase 1 — an additive interest-nudge in `scoreTeammateForTask` — ships behind a hard ≤ 0.05 cap and a back-compat path so existing callers see no behavior change.

## What Was Built

### Task 2.1 — `profileMerge` pure function (commit `179a90d`)

- Created `src/lib/recgon/profileMerge.ts` exporting the named function `profileMerge(teammate, profile, inferred=null, ema): Teammate & { interests: string[] }`.
- Field-level fallback (D-06): `profile.skillsCanonical` wins when filled; otherwise `teammate.skills`. `profile.weeklyCapacityHours` wins when `typeof === 'number'`; otherwise `teammate.capacityHours`. The `typeof number` guard explicitly handles the Supabase column being `null` (blank ≠ zero per D-06).
- Strengths fold into skills (D-02): `[...profile.skillsCanonical, ...profile.strengthsCanonical]` unions into the returned `skills` array — match.ts's existing 45%-Jaccard picks them up automatically, no math touch needed.
- Lowercase normalization throughout — guards against the canonical set comparing case-sensitively in match.ts.
- Null profile passthrough (D-08): `profile === null` returns `{...teammate, fitProfile: ema, interests: []}`. Owner view unchanged, EMA still passthrough, downstream consumers see a defined empty array.
- Interests carried as additive field (D-03): the returned object exposes `interests: string[]` (never undefined) for `match.ts` to read.
- EMA passthrough: `fitProfile: ema` overwrites the owner's stored `fitProfile` so the dispatcher always sees the freshest EMA layer. Reference-equality acceptable (Test 7 asserts this).
- `inferred: null` literal type — accepted but unused in Phase 1 (`void inferred;` keeps the parameter live in TS). Phase 2 will widen to `InferredSkills | null` and break every call site until they pass real inferred data — forced migration visibility.
- Pure function: zero Supabase imports, zero LLM imports, no `await`, no `Promise<...>`. Trivially unit-testable.
- Created `src/__tests__/profileMerge.test.ts`: 8 tests covering null passthrough, field-level skills fallback (filled + blank cases), strengths fold + dedup, capacity precedence + null fallback, interests passthrough + null default, EMA reference passthrough, lowercase normalization.

### Task 2.2 — Additive interest-nudge in `match.ts` (commit `6c6c90a`)

- Added module-level constant `INTEREST_NUDGE_WEIGHT = 0.03` (`≤ 0.05` hard cap per D-03 / Pitfall 3 — starting value of 0.03 leaves headroom and respects skill-first selection).
- Modified `scoreTeammateForTask` to compute the existing weighted-sum into `baseScore` first, then apply `interestNudge` AFTER: `score = baseScore + interestNudge`. The four weighted constants (`W_SKILL = 0.45`, `W_FIT = 0.30`, `W_AVAIL = 0.15`, `W_LOAD = 0.10`) are unchanged.
- Interest-nudge reads `(teammate as Teammate & { interests?: string[] }).interests ?? []` — back-compat: a teammate without the `interests` field gets 0 nudge, so existing callers (`recgonMatch.test.ts`, the legacy scheduler backfill in `dispatcher.ts`) see no behavior change.
- Overlap test: `candidateInterests.some(i => taskTags.includes(i.toLowerCase()))` — single Boolean (1 or 0), multiplied by `INTEREST_NUDGE_WEIGHT`. NOT proportional to the number of overlapping tags (that would let interest-stuffing inflate the nudge above the cap).
- Extended `MatchResult.breakdown` with `interestNudge: number` (non-optional) — exposes the term separately for debugging and tie-break inspection. The top-level `score` already includes it.
- Created `src/__tests__/matchInterestNudge.test.ts`: 5 tests asserting (1) cap enforced ≤ 0.05, (2) additive-after-the-sum ordering verifiable from breakdown components, (3) cannot flip strict-better-skill candidate, (4) no nudge when interests disjoint from task tags, (5) back-compat — teammate without `interests` field scores identically to pre-change math.
- Updated `architecture.md` row for `match.ts` to document the new scoring formula and the `interestNudge` breakdown field; added a new row for `lib/recgon/profileMerge.ts`.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run src/__tests__/profileMerge.test.ts` | 8/8 pass |
| `npx vitest run src/__tests__/matchInterestNudge.test.ts` | 5/5 pass |
| `npx vitest run src/__tests__/recgonMatch.test.ts` (back-compat) | 7/7 pass |
| `npx tsc --noEmit` | exits 0 |
| `grep -c 'export function profileMerge' src/lib/recgon/profileMerge.ts` | 1 |
| `grep -c 'inferred: null' src/lib/recgon/profileMerge.ts` | 1 |
| `grep -c "from './types'" src/lib/recgon/profileMerge.ts` | 1 |
| `grep -cE '\bawait\b\|Promise<' src/lib/recgon/profileMerge.ts` | 0 (pure sync) |
| Supabase imports in profileMerge.ts | 0 |
| `grep -c 'INTEREST_NUDGE_WEIGHT' src/lib/recgon/match.ts` | 3 |
| `INTEREST_NUDGE_WEIGHT = 0.0[0-5]` regex match | passes (0.03) |
| `grep -c 'interests' src/lib/recgon/match.ts` | 4 |
| `git diff src/lib/recgon/match.ts` removed `W_*` constants | 0 (additions-only) |

## must_haves.truths verification

- [x] `profileMerge(teammate, profile, inferred=null, ema)` is a pure function with field-level fallback — verified by Test 2 / Test 3 / Test 5.
- [x] When `profile` is `null`, returns owner unchanged — verified by Test 1.
- [x] Strengths fold into merged skills — verified by Test 4.
- [x] Merged object exposes `interests: string[]` for match.ts — verified by Test 6 + match.ts reads via `(teammate as Teammate & { interests?: string[] }).interests`.
- [x] Interest-nudge applied AFTER the weighted sum, ≤ 0.05 — verified by Tests 1, 2; constant set to 0.03.
- [x] Interest-nudge cannot flip a candidate with strictly better skill overlap — verified by Test 3.

## key_links verification

- [x] `from './types'` in `profileMerge.ts`: 1 match.
- [x] `teammate.interests` pattern in `match.ts`: present (`(teammate as Teammate & { interests?: string[] }).interests`).

## Deviations from Plan

None — plan executed exactly as written.

The only design choice within the plan's spec: `MatchResult.breakdown.interestNudge` is a non-optional `number` (always set, never undefined). The plan's action step said "if there is no such field, add a new top-level field" — the field landed inside `breakdown` to keep the inspection surface coherent (all per-component contributions live there), and was made non-optional because the back-compat path returns `0` rather than skipping the field.

## Note for Plan 04 (dispatcher wiring)

The dispatcher (`runDispatch` and `dispatchTask`) must wrap `listTeammatesWithStats` output through `profileMerge(t, profileByUserId.get(t.userId) ?? null, null, t.fitProfile)` before passing to `rankMatches`. The `profileByUserId` map should come from a new `listProfiles(teamId)` batch call (Plan 03 ships `profileStorage.ts`). Untouched teammates (no profile row) pass straight through unchanged. `match.ts` is now fully back-compat — old callers without `interests` get 0 nudge.

## Threat Flags

None — both files added/modified introduce only internal computation (no new network endpoints, no auth paths, no schema changes at trust boundaries beyond what Plan 01 already documented in its threat model).

## Self-Check: PASSED

- `src/lib/recgon/profileMerge.ts` — FOUND
- `src/lib/recgon/match.ts` (modified) — FOUND
- `src/__tests__/profileMerge.test.ts` — FOUND
- `src/__tests__/matchInterestNudge.test.ts` — FOUND
- Commit `179a90d` (Task 2.1) — FOUND in `git log`
- Commit `6c6c90a` (Task 2.2) — FOUND in `git log`
- `npx vitest run` against all three test files — PASSES
- `npx tsc --noEmit` — exits 0
