---
phase: 01-profile-foundation
plan: 04
subsystem: dispatcher-wiring
tags: [dispatcher, integration, e2e-smoke, wiring, PROFILE-04, PROFILE-05, PROFILE-06]
dependency_graph:
  requires:
    - "01-02: profileMerge pure function + match.ts interest-nudge"
    - "01-03: listProfiles batch read in profileStorage.ts"
  provides:
    - dispatcher-runDispatch-threads-profileMerge
    - dispatcher-dispatchTask-threads-profileMerge
    - applyProfileMerge-local-helper
    - e2e-smoke-self-declared-skill-changes-assignment
  affects:
    - src/lib/recgon/dispatcher.ts
    - architecture.md
tech_stack:
  added: []
  patterns:
    - per-team-listProfiles-batch-read-once-per-dispatch
    - userId-keyed-Map-for-O1-profile-lookup-in-loop
    - schedule-backfill-exemption-from-merge-shape
key_files:
  created:
    - src/__tests__/dispatcherProfileMerge.test.ts
    - src/__tests__/profileE2E.smoke.test.ts
  modified:
    - src/lib/recgon/dispatcher.ts
    - architecture.md
key_decisions:
  - "applyProfileMerge as a local helper (not exported) — it's a thin O(n) loop over teammates with a Map<userId, TeammateProfile> lookup; no other module needs it in Phase 1. Phase 2 (GitHub-inferred layer) will widen it and may promote it."
  - "Schedule-backfill exemption: backfillLegacySchedules continues to receive the raw `teammates` (not mergedTeammates) — schedule math must not see profile-overridden capacity, otherwise existing-assignment scheduling regresses. Negative grep gate prevents accidental rebind."
  - "Real rankMatches in the smoke test (no vi.mock on match.ts) — per plan-checker note, mocking match would mask a missed dispatcher rebind. Smoke proves the production scoring path actually receives mergedTeammates."
  - "applyProfileMerge uses an inline generic constraint instead of accepting TeammateWithStats directly, so both runDispatch (TeammateWithStats[]) and dispatchTask (TeammateWithStats[]) can share the helper without widening profileMerge's signature."
  - "listProfiles called once per dispatch (not per teammate) — N+1 avoidance, matches Plan 02's handoff note pattern."
metrics:
  duration_seconds: 1200
  task_count_completed: 2
  task_count_blocking_checkpoint: 1
  completed_date: 2026-05-11
  files_changed: 4
---

# Phase 1 Plan 04: Dispatcher Wiring — Summary

The integration plan: thread `profileMerge` (Plan 02) and `listProfiles` (Plan 03) into the live dispatcher path so that a teammate saving a profile through the UI actually changes assignment behavior on the next cron cycle. Five new dispatcher lines + a unit test + an E2E smoke close PROFILE-04 / PROFILE-05 / PROFILE-06 end-to-end.

## What Was Built

### Task 4.1 — Dispatcher wiring + unit test (commit `57ceaff`)

- `src/lib/recgon/dispatcher.ts`:
  - Added imports at lines 18-19: `import { listProfiles } from './profileStorage';` and `import { profileMerge } from './profileMerge';`. `TeammateProfile` added to the type-only import block on the existing `./types` line.
  - Added local helper `applyProfileMerge` (lines 37-51) — generic over any teammate-shaped record with `userId | skills | capacityHours | fitProfile`, builds a `Map<userId, TeammateProfile>` once and maps each teammate through `profileMerge(t, byUserId.get(t.userId) ?? null, null, t.fitProfile)`. Returns the merged shape with `interests?: string[]` so the existing `dispatchSingleTask` parameter type (a structural superset) accepts it without widening.
  - **Cron entry (`runDispatch`)** — lines 140-141 insert `listProfiles(teamId)` + `applyProfileMerge` immediately after `listTeammatesWithStats(teamId)`; line 156 rebinds `dispatchSingleTask(teamId, task, mergedTeammates)`. The `backfillLegacySchedules(teamId, teammates)` call at line 152 deliberately keeps the raw `teammates` shape — schedule math must not see profile-overridden capacity (negative grep gate `backfillLegacySchedules(teamId, mergedTeammates) = 0` confirms).
  - **Manual entry (`dispatchTask`)** — lines 426-428 add the same two-line load + rebind, identical to the cron path. Both entry points covered.
- `src/__tests__/dispatcherProfileMerge.test.ts`: 5 tests covering (1) call order — `listProfiles` after `listTeammatesWithStats` before `rankMatches`, (2) profile applied — merged teammate exposes `skills: ['frontend']`, `capacityHours: 20`, `interests: ['video']`, (3) D-08 regression — empty profiles → owner-row teammates unchanged, (4) both entry points — `dispatchTask` also threads merge, (5) no double-merge — teammate count out = teammate count in, `listProfiles` called exactly once per dispatch.
- `architecture.md`: updated the `lib/recgon/dispatcher.ts` row to document the new PROFILE-04 wiring contract + the schedule-backfill exemption.

### Task 4.2 — E2E smoke test (commit `e01ce3a`)

- `src/__tests__/profileE2E.smoke.test.ts`: 3 scenarios driving the real `dispatchTask` against fixture teammates Alice + Bob, with `rankMatches` deliberately NOT mocked (negative grep gate enforced).
  - **Scenario A (baseline):** Alice + Bob both have `skills: ['design']`, no profile rows, frontend task — neither is preferred via skill match; assignment falls to either (tie or owner_fallback).
  - **Scenario B (Bob declares 'frontend'):** Bob has a `teammate_profiles` row with `skillsCanonical: ['frontend']`; the frontend task is assigned to Bob. **Load-bearing assertion** — if Task 4.1 had forgotten to rebind `dispatchSingleTask` to `mergedTeammates`, this test would fail because Bob's owner-row `skills` would still be `['design']`.
  - **Scenario C (D-08 backwards compat):** empty profiles + a design task — assignment lands on Alice or Bob, both `['design']` teammates pass through profileMerge unchanged.

## Verification Results

| Check | Result |
|---|---|
| `npm run test -- --run src/__tests__/dispatcherProfileMerge.test.ts` | 5/5 pass |
| `npm run test -- --run src/__tests__/profileE2E.smoke.test.ts` | 3/3 pass |
| `npm run test -- --run` (full suite) | 154/154 pass (no regression — up from 146 by exactly +8 = 5 + 3) |
| `npx tsc --noEmit` | exits 0 |
| `npm run build` | exits 0 — all routes registered |
| `grep -c "import { listProfiles } from './profileStorage'" src/lib/recgon/dispatcher.ts` | 1 |
| `grep -c "import { profileMerge } from './profileMerge'" src/lib/recgon/dispatcher.ts` | 1 |
| `grep -c "applyProfileMerge" src/lib/recgon/dispatcher.ts` | 3 (1 def + 2 call sites) |
| `grep -c "await listProfiles(teamId)" src/lib/recgon/dispatcher.ts` | 2 (cron + manual) |
| `grep -c "mergedTeammates" src/lib/recgon/dispatcher.ts` | 4 (2 declarations + 2 call-site rebinds) |
| `grep -cE "dispatchSingleTask\(teamId, task, mergedTeammates" src/lib/recgon/dispatcher.ts` | 2 (load-bearing — both entry points) |
| `grep -c "backfillLegacySchedules(teamId, teammates)" src/lib/recgon/dispatcher.ts` | 1 (raw shape preserved) |
| `grep -c "backfillLegacySchedules(teamId, mergedTeammates)" src/lib/recgon/dispatcher.ts` | 0 (negative gate passes) |
| `grep -cE "vi\.mock\(['\"]@?/?(\.\./)*lib/recgon/match" src/__tests__/profileE2E.smoke.test.ts` | 0 (real match.ts exercised) |
| `git diff src/lib/recgon/match.ts` | empty (math unchanged) |

## must_haves.truths verification

- [x] Dispatcher loads `listProfiles(teamId)` immediately after `listTeammatesWithStats(teamId)` and threads each teammate through `profileMerge` BEFORE `rankMatches` runs — verified by Test 1 (call-order assertion).
- [x] `rankMatches` and `match.ts` are called with the merged teammate object — verified by Test 2 (`teammatesArg[0].skills` contains `'frontend'`, `capacityHours: 20`, `interests: ['video']`).
- [x] A teammate who saves a profile with a skill matching an open task's `requiredSkills` is preferred by the dispatcher — verified by smoke Scenario B (Bob is assigned the frontend task because his `skillsCanonical: ['frontend']` profile beats Alice's owner-row `['design']`).
- [x] Teams without `teammate_profiles` rows behave exactly as before — verified by Test 3 + smoke Scenario C (D-08 regression invariant).
- [x] Both dispatch entry points covered — verified by Test 1 (`runDispatch`) + Test 4 (`dispatchTask`) + smoke (drives `dispatchTask` end-to-end).

## key_links verification

- [x] `import { listProfiles } from './profileStorage'` in `dispatcher.ts`: 1 match.
- [x] `import { profileMerge } from './profileMerge'` in `dispatcher.ts`: 1 match.

## Downstream references rebound from `teammates` to `mergedTeammates`

| Entry point | Line (post-edit) | Call | Rebind |
|---|---|---|---|
| `runDispatch` | 156 | `dispatchSingleTask(teamId, task, …)` | `teammates` → `mergedTeammates` ✓ |
| `runDispatch` | 152 | `backfillLegacySchedules(teamId, …)` | **NOT rebound** — schedule math gets raw `teammates` (intentional D-08-adjacent guard) |
| `dispatchTask` | 428 | `dispatchSingleTask(teamId, task, …)` | `teammates` → `mergedTeammates` ✓ |

**Total rebinds: 2** (production call paths) + **0 over-rebinds** (schedule backfill preserved).

## Deviations from Plan

None — plan executed exactly as written. Two narrow implementation notes within the spec:

1. **Helper generic signature:** the plan suggested `<T extends { userId: string | null; fitProfile: any }>`. I tightened the constraint to `<T extends { userId: string | null; skills: string[]; capacityHours: number; fitProfile: FitProfile }>` so the cast inside the helper (`profileMerge(t as any, …)`) is documented narrowly rather than open-ended. Result-shape cast `as unknown as T & { interests?: string[] }` preserves any extra `TeammateWithStats` fields (stars, ratingCount, inFlightCount, etc.) that profileMerge spreads through.

2. **Smoke Scenario A — assignment outcome is permissive:** the plan said "top candidate is either Alice or Bob (tie-break implementation-defined)". With the real `rankMatches` + scheduler + owner-fallback chain, the tie can also resolve via owner-fallback. The test asserts that *if* `result === 'assigned'`, the assignee is one of {Alice, Bob} — not that any specific teammate wins. Scenario B is where the load-bearing assertion lives.

## Auth Gates

None — this plan touches only library code + tests; no auth/route changes.

## Open Questions / Phase 2 Carry-Over

- **Owner-edits-teammate-profile UI** (D-19) — deferred. Today, only the teammate themselves can save their profile; an owner wanting to nudge a teammate's tagging has no admin surface. Phase 2 may add it; for now, owners can `psql` the `teammate_profiles` row directly.
- **`profile_visibility = 'owner_only'` settings UI** — Plan 03 enforces the gate server-side, but there's no UI to set the column today. The default is `'team_visible'`. An owner can flip it via direct SQL update for now.
- **`inferred` parameter widening** — `profileMerge` accepts `inferred: null` as a literal type in Phase 1. Phase 2's GitHub-inferred layer will widen to `InferredSkills | null` and produce TS errors at every call site (including dispatcher.ts:49), forcing migration visibility.
- **N+1 perf at scale** — `listProfiles(teamId)` is one Supabase round-trip per dispatch run per team, bounded to ≤ teammate-count rows. At v3 team sizes (≤ 50) this is fine; if dispatcher fan-out grows, batch caching across waves becomes a follow-up.
- **`applyProfileMerge` not exported** — kept local for now (single caller). If Phase 2 wires another module (e.g. UI preview of "what the dispatcher sees about me"), promote it to `profileStorage.ts` or a new `dispatcherMerge.ts`.

## Commits

| Task | Commit | Description |
|---|---|---|
| 4.1 | `57ceaff` | feat(01-04): thread profileMerge through dispatcher entry points |
| 4.2 | `e01ce3a` | test(01-04): E2E smoke — self-declared skill changes assignment |

## Threat Flags

None — every surface touched is documented in this plan's `<threat_model>`. The PROFILE-04 wiring is purely internal computation; no new network endpoints, no auth paths, no schema changes.

## Phase 1 Loop Status

The four-plan loop is closed:

1. **Plan 01-01** (schema + types + vocabulary) — `teammate_profiles` table, `TeammateProfile` type, canonical vocab module ✓
2. **Plan 01-02** (pure-function substrate) — `profileMerge` + `match.ts` interest-nudge ✓
3. **Plan 01-03** (form vertical slice) — `/teams/[id]/me` page + API + cmdk picker + LLM normalizer ✓
4. **Plan 01-04** (dispatcher wiring, this plan) — `profileMerge` on the live read path for both `runDispatch` and `dispatchTask` ✓

**The end-to-end claim of Phase 1 is now verifiable:** a teammate fills the form on `/teams/[id]/me`, clicks save (Plan 03 persists the row through `upsertProfile`), the next manual or cron dispatch (Plan 04 reads through `listProfiles` + `profileMerge`) routes a matching task to that teammate.

## Note for Phase 1 Verifier (Task 4.3 human checkpoint)

The dispatcher diff is intentionally minimal:
- 2 new imports (`listProfiles`, `profileMerge`)
- 1 new local helper (`applyProfileMerge`, ~15 lines)
- 4 new lines inside `runDispatch` (2 declarations) + 1 rebind on the dispatchSingleTask call
- 4 new lines inside `dispatchTask` (2 declarations + 1 rebind)
- 0 changes to `match.ts`, `profileMerge.ts`, `profileStorage.ts`, scheduler, or any route

The CHECKPOINT-RETURN block below summarises this for human review.

## Self-Check: PASSED

- `src/lib/recgon/dispatcher.ts` (modified) — FOUND
- `src/__tests__/dispatcherProfileMerge.test.ts` — FOUND
- `src/__tests__/profileE2E.smoke.test.ts` — FOUND
- `architecture.md` (modified) — FOUND
- Commit `57ceaff` (Task 4.1) — FOUND in `git log`
- Commit `e01ce3a` (Task 4.2) — FOUND in `git log`
- `npm run test -- --run` — 154/154 pass
- `npx tsc --noEmit` — exits 0
- `npm run build` — exits 0
