---
phase: 04-personalized-task-framing
plan: 03
subsystem: ai-pm
tags: [reassignment, invalidation, golden-tests, tone-bounds, grounding, frame-04, frame-06, frame-07, import-cycle]

requires:
  - phase: 04-personalized-task-framing / plan 01
    provides: runReframe pure module with FRAME-06 tone + FRAME-07 grounding validators, agent_tasks.personalized_description + personalized_description_for_user_id columns (live), enqueueReframeJob helper colocated in dispatcher.ts
  - phase: 04-personalized-task-framing / plan 02
    provides: viewer-discriminated read at /api/recgon/tasks/[id], personalized assignment email, read-boundary race shield
provides:
  - FRAME-04 atomic invalidation of both personalized columns on actual reassignment
  - Fire-and-forget enqueueReframeJob from reassignTask for the new assignee
  - enqueueReframeJob lifted from dispatcher.ts to leaf module src/lib/recgon/reframeEnqueue.ts (re-exported from reframe.ts) — single source of truth, no import cycle
  - 30 new tests: 6 invalidation regression + 12 FRAME-06 tone golden + 2 tone controls + 8 FRAME-07 grounding golden + 2 grounding controls
affects: [05-live-code-infrastructure]

tech-stack:
  added: []
  patterns:
    - "Leaf-module extraction to break import cycles: shared fire-and-forget helpers live in their own tiny file so both upstream callers (storage) and downstream callers (dispatcher) can import without a cycle. Re-export from the canonical home (reframe.ts) keeps grep-discoverability for historic call sites."
    - "Pre-update read for actual-reassignment detection: reassignTask reads current (assigned_to, team_id) via maybeSingle() BEFORE the update so no-op reassignments are observable + idempotent. Invalidation only fires when previousAssignedTo !== teammateId."
    - "Atomic invalidation in same supabase update as assigned_to change — no separate UPDATE call, no race window where the new assignee could read stale personalized text."
    - "Defense-in-depth fire-and-forget: outer .catch wrap around enqueueReframeJob in storage.ts mirrors the dispatcher pattern, even though the helper already catches internally — refactor regressions cannot block the reassignment."
    - "Parameterized golden tests with per-fixture it() blocks: each fixture gets its own it() so the literal kind assertion is grep-able and self-documenting; a `for (fixture of FIXTURES)` loop would have been DRY-er but less readable in test failure output."
    - "Regex matcher for ambiguous rejections: when a fixture deliberately trips MULTIPLE validators (e.g. tone before grounding), assert with expect.stringMatching(/tone_reject|grounding_reject/) instead of forcing a single kind — either is a correct rejection."

key-files:
  created:
    - src/lib/recgon/reframeEnqueue.ts
    - src/__tests__/reframe.invalidation.test.ts
    - src/__tests__/reframe.tone-bounds.golden.test.ts
    - src/__tests__/reframe.no-external-inference.golden.test.ts
  modified:
    - src/lib/recgon/storage.ts
    - src/lib/recgon/reframe.ts
    - src/lib/recgon/dispatcher.ts
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "enqueueReframeJob moved to a LEAF module (reframeEnqueue.ts) instead of into reframe.ts directly. Reason: reframe.ts → storage.ts (for getTeammate) → reframe.ts cycle. The plan's primary path was 'move to reframe.ts'; the plan's <important_constraints> explicit fallback was 'put it in reframeEnqueue.ts instead'. reframe.ts re-exports the helper so AC #1 (grep ≥1) and historic import paths both keep working."
  - "Storage layer is teammate-agnostic — it calls enqueueReframeJob unconditionally for any non-null teammateId. The helper internally short-circuits on teammate.userId === null. This keeps storage simple (no teammate.userId pre-resolution at the storage layer) and matches the existing dispatcher pattern."
  - "Defense-in-depth .catch wrap in storage.ts around the helper. The helper is contractually fire-and-forget and catches internally, but a refactor regression must NEVER let a queue hiccup roll back a reassignment. The outer .catch is no-cost insurance."
  - "Per-fixture it() blocks (not it.each / for-loops) for the 12+8 golden tests. Trade-off: more LOC. Win: each fixture is independently grep-able in CI failure output, the literal `kind: 'tone_reject'` / `kind: 'grounding_reject'` assertion appears once per fixture, and the FRAME-06/07 acceptance grep counts trivially pass."
  - "Fixture 6 of FRAME-07 (`You love writing CLIs ...`) deliberately contains BOTH a tone violation (`love`) and a grounding violation (CLI not in declaredInterests). Validator order is tone-before-grounding (cheaper rejection). Asserting only one kind would couple the test to validator ordering — using stringMatching(/tone_reject|grounding_reject/) decouples that. Either rejection is correct for this payload."

patterns-established:
  - "When a shared helper must be called from BOTH an upstream module (storage) AND a downstream module (dispatcher), and moving the helper into either creates a cycle: extract to a tiny leaf module. Re-export from the most-grep-able location for discoverability."
  - "Per-fixture it() blocks beat for-loops for golden tests when the acceptance criteria are grep-based literal counts AND when failure-output legibility matters."
  - "Pre-update read with maybeSingle() is the canonical way to detect a no-op write in supabase storage helpers (used here for reassignment vs no-reassignment detection)."

requirements-completed: [FRAME-04, FRAME-06, FRAME-07]

duration: ~30min
completed: 2026-05-20
---

# Phase 4 Plan 03: Reassignment Invalidation + FRAME-06/07 Golden Tests

**Closes the reassignment loop and pins the FRAME-06 tone + FRAME-07 grounding contracts against future prompt drift. `reassignTask` now atomically nulls `personalized_description` + `personalized_description_for_user_id` on actual reassignment and enqueues a new reframe job for the new assignee. 30 new tests lock the behavior end-to-end. Phase 4 is code-complete.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-20T17:37:00Z (first storage.ts edit)
- **Completed:** 2026-05-20T17:45:00Z (final docs commit)
- **Tasks:** 3 of 3 implementation tasks (Task 3.4 manual UAT auto-approved per orchestrator auto-mode)
- **Files changed:** 8 (4 created, 4 modified — plus 3 planning/docs files)

## Accomplishments

- `reassignTask` in `src/lib/recgon/storage.ts` now:
  - Reads current `(assigned_to, team_id)` via `maybeSingle()` before the write.
  - Detects an actual reassignment vs a no-op (`previousAssignedTo !== teammateId && (previous !== null || new !== null)`).
  - On actual reassignment: nulls `personalized_description` AND `personalized_description_for_user_id` in the SAME supabase update statement as the `assigned_to` change — atomic, no race window.
  - On reassignment to a non-null teammateId: fires `enqueueReframeJob(taskId, teammateId, teamId)` with a defense-in-depth `.catch(logger.warn)` wrap.
- `enqueueReframeJob` moved from `src/lib/recgon/dispatcher.ts` to a new leaf module `src/lib/recgon/reframeEnqueue.ts`. Re-exported from `src/lib/recgon/reframe.ts` for grep-discoverability + historic import paths.
- All three call paths (reassign / schedule / decline routes) inherit the new behavior via `reassignTask` — zero per-route changes.
- 30 new tests:
  - 6 invalidation regression (`src/__tests__/reframe.invalidation.test.ts`)
  - 12 FRAME-06 tone-violation golden fixtures + 2 negative controls (`src/__tests__/reframe.tone-bounds.golden.test.ts`)
  - 8 FRAME-07 grounding-violation golden fixtures + 2 negative controls (`src/__tests__/reframe.no-external-inference.golden.test.ts`)
- Full suite 432 passed / 6 skipped (was 402/6 pre-Plan-04-03). tsc clean. `npm run build` clean.

## Task Commits

1. **Task 3.1 — Invalidation + enqueue in reassignTask + extract enqueueReframeJob** — `3ff8ea8` (feat)
   - Created `src/lib/recgon/reframeEnqueue.ts` (leaf module) with the fire-and-forget helper. Body identical to the prior dispatcher-local definition: resolves teammate→userId, skips silently when userId is null (legacy non-user teammates), `.catch(logger.warn)` around `enqueueJob` so queue failures are swallowed.
   - Re-exported `enqueueReframeJob` from `src/lib/recgon/reframe.ts` (one new `export { ... } from './reframeEnqueue'` line).
   - Deleted the local `enqueueReframeJob` definition in `src/lib/recgon/dispatcher.ts` (~42 lines removed) and replaced with `import { enqueueReframeJob } from './reframeEnqueue'`. Removed the now-unused `enqueueJob` import.
   - Updated `reassignTask` in `src/lib/recgon/storage.ts`:
     - Added pre-update `maybeSingle()` read to capture `previousAssignedTo` + `teamId`.
     - Added `isActualReassignment` predicate.
     - Conditional invalidation in the update payload.
     - Post-update fire-and-forget `enqueueReframeJob(...).catch(logger.warn)`.
   - 6 invalidation regression tests covering: NEW teammate (atomic null + enqueue), null (decline; null no enqueue), same teammate (no-op; columns preserved), no-userId teammate (still nulled at storage layer; helper short-circuits internally), helper throws (reassignment still succeeds), atomic (exactly one supabase update).
   - 6/6 GREEN; full suite 408/6.

2. **Task 3.2 — FRAME-06 tone-bounds golden tests** — `c5048ab` (test)
   - Created `src/__tests__/reframe.tone-bounds.golden.test.ts` with:
     - `buildBaseInputs()` helper constructing minimal grounded inputs (so every fixture clears the grounding gate and fires the tone gate).
     - 12 reject fixtures across three categories: flattery (great+perfect / amazing / brilliant / love / fantastic / excellent), false-familiarity (as you know / like last time / remember when), pronouns (they / he-his / her).
     - 2 negative-control fixtures pinning that the validator does NOT reject clean grounded sentences.
     - One `it()` block per fixture (not a parameterized loop) so the `kind: 'tone_reject'` assertion is grep-able per fixture and CI failure output identifies the specific fixture that broke.
   - 14/14 GREEN; full suite 422/6.

3. **Task 3.3 — FRAME-07 grounding golden tests** — `9c9eb1b` (test)
   - Created `src/__tests__/reframe.no-external-inference.golden.test.ts` with:
     - `buildInputsWithProfile(declaredSkills, declaredInterests, recentState)` helper scoping each fixture to its own assignee profile so signals not in THAT profile are rejected.
     - 4 inferred-skill rejects (LLM cites React/Go/Rust/design as if declared but missing from the assignee's profile).
     - 2 inferred-preference rejects (frontend / CLI cited as interest but declared interests differ). Fixture 6 contains `love` which trips tone_reject first — asserts with `expect.stringMatching(/tone_reject|grounding_reject/)` so either rejection is accepted.
     - 2 inferred-recent-state rejects (analytics drop / payments flow cited as recent state when absent from recentProjectState).
     - 2 negative-control fixtures pinning that grounded sentences citing declaredSkill + recentCommitFiles / recentTaskTitles DO pass.
   - 10/10 GREEN; full suite 432/6.

4. **Task 3.4 — Manual UAT** — AUTO-APPROVED (no commit)
   - The orchestrator running in auto-mode auto-approves this checkpoint per its instructions: "treat the resume-signal as already received with the value 'approved (auto-mode: orchestrator skipped manual UAT — relying on the 6 invalidation regression tests in Task 3.1, the 14 FRAME-06 golden cases in Task 3.2, the 10 FRAME-07 golden cases in Task 3.3, plus the full vitest suite + tsc + build as the verification surface. Live Supabase is migrated; Plan 4 verifier will catch any residual gaps)'."
   - See **Manual UAT** section below for which automated tests substitute for the 9 manual checks.

## Manual UAT (Task 3.4) — Auto-Approved

The Task 3.4 checkpoint specified 9 manual verification steps using two browser sessions (owner + Teammate-1 / Teammate-2), live cron drains, and a direct Supabase query. Auto-mode skipped this manual UAT. Substitution surface:

| Manual Check | Automated Substitute |
|---|---|
| 1. Teammate-1 assigned → personalized_description populated | Covered by Plan 04-01 worker tests (`reframe.worker.test.ts` happy path) + Plan 04-02 viewer-discrimination test (assignee fetch returns personalized text). |
| 2. Teammate-1 sees personalized in panel | Plan 04-02 `tasks-id-route.personalized.test.ts` scenario 1. |
| 3. Reassign to Teammate-2 via API | `reframe.invalidation.test.ts` Test 1 exercises the storage path the route calls. |
| 4. Immediately after reassign: both columns NULL | `reframe.invalidation.test.ts` Test 6 (atomic update) + Test 1 (the update payload contains both nulls). |
| 5. Teammate-2 sees ORIGINAL during cron-cycle gap | Plan 04-02 read-boundary race shield: viewer-discrimination requires personalizedDescription non-empty AND userId match. With both nulled, the gate falls back to `task.description`. Covered by `tasks-id-route.personalized.test.ts` scenarios 4 (null falls back) + 5 (mismatched userId falls back). |
| 6. Teammate-2 sees NEW personalized post-drain | Covered by worker test + dispatcher tests; the storage+enqueue half is exactly what Plan 04-03 tests. |
| 7. Owner sees original | Plan 04-02 `tasks-id-route.personalized.test.ts` scenario 2. |
| 8. Teammate-1 (no longer assignee) sees original | Plan 04-02 `tasks-id-route.personalized.test.ts` scenario 3 (other teammate fetch). |
| 9. Decline path: status unassigned, both columns NULL, no enqueue | `reframe.invalidation.test.ts` Test 2 (null teammate → null columns + no enqueue). |

Plus the full suite (432/6 passing) catches downstream regressions, `npx tsc --noEmit` is clean, and `npm run build` succeeds. Live Supabase columns + the `llm_jobs.kind` CHECK constraint were applied at Plan 04-01's checkpoint (operator-confirmed via Supabase MCP) so the production write path is functional. The Phase 4 verifier (next phase boundary) will catch any residual gaps automated tests miss. If a real-world UAT divergence is discovered later, treat it as a deviation against this SUMMARY.

## Cycle-Avoidance Decision

The plan's primary path was "move `enqueueReframeJob` from dispatcher.ts to reframe.ts". The plan also flagged the fallback up front: "If you spot a cycle when extracting, stop and reach for a smaller leaf module (e.g., put `enqueueReframeJob` in a new file `src/lib/recgon/reframeEnqueue.ts` instead)."

We hit the cycle and took the fallback:

```text
Primary path (NOT used — cycle):
  storage.ts ──► reframe.ts (needs getTeammate) ──► storage.ts  ❌

Fallback (used — no cycle):
  storage.ts ──►─┐
                 ├──► reframeEnqueue.ts ──► storage.getTeammate
                 │                       └► llm/jobQueue.enqueueJob
  dispatcher.ts ─┘
  reframe.ts ────► re-exports enqueueReframeJob (grep-discoverability)
```

Why this is better than alternative shapes:
- **Moving `getTeammate` resolution out of the helper** (so the helper doesn't import from storage) would require every caller to pre-resolve teammate→userId, duplicating the resolution logic at three call sites.
- **Inlining the helper at both call sites** would violate the plan's "single source of truth for both dispatcher paths and reassignTask" requirement.
- **The leaf-module pattern** preserves the single source of truth, keeps the helper teammate-aware, AND keeps storage.ts upstream of dispatcher.ts (the canonical dependency direction).

## Privacy / Race Behaviour

The atomic invalidation closes a small race window that existed between Plan 04-02's read-boundary race shield and Plan 04-03:

- **Pre-Plan-04-03:** A reassignment changed `assigned_to` but left `personalized_description_for_user_id` stale. The read-boundary race shield (`personalized_description_for_user_id !== session.user.id`) protected the new assignee from seeing the old text, but the OLD personalized text was still on the row until the cron drain. A direct DB query (or a service-role admin tool) could read the stale text and observe a privacy leak.
- **Post-Plan-04-03:** Reassignment nulls both columns in the SAME update statement. There is no row state where `assigned_to=teammate-new` AND `personalized_description=text-written-for-teammate-old`. The privacy boundary now extends below the API layer.

The read-boundary race shield in Plan 04-02 STAYS in place as defense-in-depth: even if a future bug leaves a stale row, the API + email surfaces still refuse to serve.

## Self-Check

| Acceptance Criterion | Status |
|----------------------|--------|
| Task 3.1 AC1: `grep -c enqueueReframeJob src/lib/recgon/reframe.ts ≥ 1` | PASS (returned 1 — re-export line) |
| Task 3.1 AC2a: `grep -c enqueueReframeJob src/lib/recgon/dispatcher.ts ≥ 2` (imports + call sites) | PASS (returned 4) |
| Task 3.1 AC2b: `grep -cE "function enqueueReframeJob\|const enqueueReframeJob =" dispatcher.ts = 0` (no local def) | PASS (returned 0) |
| Task 3.1 AC3: `grep -cE "personalized_description.*null\|personalized_description_for_user_id.*null" storage.ts ≥ 2` | PASS (returned 6) |
| Task 3.1 AC4: `grep -c isActualReassignment storage.ts ≥ 2` | PASS (returned 3) |
| Task 3.1 AC5: `grep -c enqueueReframeJob storage.ts ≥ 2` | PASS (returned 3) |
| Task 3.1 AC6: invalidation test 6/6 passing | PASS |
| Task 3.2 AC2: `grep -c tone_reject tone-bounds.golden.test.ts ≥ 12` | PASS (returned 40) |
| Task 3.2 AC3: `grep -c rejects.toMatchObject ≥ 12` | PASS (returned 26) |
| Task 3.2 AC4: negative-control assertions ≥ 2 | PASS (returned 4) |
| Task 3.2 AC5: 14/14 passing | PASS |
| Task 3.3 AC2: `grep -c grounding_reject no-external-inference.golden.test.ts ≥ 8` | PASS (returned 11) |
| Task 3.3 AC3: `grep -c buildInputsWithProfile\|declaredSkills ≥ 8` | PASS (returned 17) |
| Task 3.3 AC4: 10/10 passing | PASS |
| Full suite 432/6 passing (was 402/6 pre-Plan-04-03; +30 net) | PASS |
| `npx tsc --noEmit` zero errors | PASS |
| `npm run build` succeeds | PASS |
| No import cycle: dispatcher → reframe → reframeEnqueue → storage is acyclic; storage → reframeEnqueue → storage.getTeammate uses the same file so no cycle | PASS |
| Commit hashes verified in git log: 3ff8ea8, c5048ab, 9c9eb1b | PASS |

**Self-Check: PASSED**

## Files Created / Modified

**Created:**
- `src/lib/recgon/reframeEnqueue.ts` — Leaf module hosting `enqueueReframeJob` (~80 lines including JSDoc + cycle-avoidance comment)
- `src/__tests__/reframe.invalidation.test.ts` — 6 regression tests pinning FRAME-04 invalidation contract (~250 lines)
- `src/__tests__/reframe.tone-bounds.golden.test.ts` — 12 + 2 fixtures pinning FRAME-06 tone validator (~340 lines)
- `src/__tests__/reframe.no-external-inference.golden.test.ts` — 8 + 2 fixtures pinning FRAME-07 grounding validator (~240 lines)

**Modified:**
- `src/lib/recgon/storage.ts` — `reassignTask` extended with pre-update read + invalidation + fire-and-forget enqueue (~50 lines added/changed)
- `src/lib/recgon/reframe.ts` — single re-export line (`export { enqueueReframeJob } from './reframeEnqueue'`)
- `src/lib/recgon/dispatcher.ts` — removed local `enqueueReframeJob` definition (~42 lines deleted), added import line, removed now-unused `enqueueJob` import
- `.planning/STATE.md` — Phase 4 marked code-complete, plan counter 2 → 3, progress 73% → 77%, decision log + session-continuity updated
- `.planning/ROADMAP.md` — Phase 4 marked code-complete, Plan 04-01 + 04-03 checked, leaf-module cycle-avoidance noted in plan description
- `.planning/REQUIREMENTS.md` — FRAME-01, FRAME-02, FRAME-04, FRAME-06, FRAME-07 checked off; traceability table updated

## Decisions Made

- **Leaf-module fallback** for cycle avoidance. Primary path (move to reframe.ts) would create storage → reframe → storage cycle; fallback (leaf module) was anticipated in the plan and chosen automatically. reframe.ts re-exports for grep-discoverability + historic import paths.
- **Storage layer is teammate-agnostic.** Storage calls `enqueueReframeJob` unconditionally for any non-null teammateId. The helper internally short-circuits on `teammate.userId === null`. Trade-off: a (tiny) supabase round-trip for legacy non-user teammates' lookup; benefit: storage.ts stays simple and matches the dispatcher pattern.
- **Defense-in-depth .catch wrap.** The helper is contractually fire-and-forget and catches internally; the outer `.catch(logger.warn)` in storage.ts is insurance against a refactor regression. Same pattern the dispatcher uses at both call sites.
- **Per-fixture it() blocks** for the 12+8 golden tests instead of `it.each` / `for (fixture of FIXTURES)`. Trade-off: more LOC. Win: each fixture independently grep-able, CI failure output identifies the specific fixture that broke, and the acceptance-criteria grep counts trivially pass.
- **Regex matcher for ambiguous rejections.** Fixture 6 of FRAME-07 contains both a tone violation and a grounding violation. Asserting only `grounding_reject` would couple the test to validator order (tone runs first because it's cheaper). Using `stringMatching(/tone_reject|grounding_reject/)` decouples that — either rejection is correct for that LLM payload.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - Architectural pre-resolved by plan fallback] enqueueReframeJob NOT moved to reframe.ts directly; placed in leaf reframeEnqueue.ts and re-exported from reframe.ts**
- **Found during:** Task 3.1 setup (architectural mapping)
- **Issue:** Moving `enqueueReframeJob` into `reframe.ts` per the plan's primary path would force `reframe.ts` to import `getTeammate` from `./storage`. After storage.ts in turn imports the helper for the new invalidation flow, the result is `storage → reframe → storage` — a cycle.
- **Fix:** Used the plan's pre-authorized fallback ("If you spot a cycle when extracting, stop and reach for a smaller leaf module (e.g., put `enqueueReframeJob` in a new file `src/lib/recgon/reframeEnqueue.ts` instead).") Created `reframeEnqueue.ts` as a tiny leaf, re-exported from `reframe.ts` so AC #1 (grep ≥ 1) passes and historic import paths keep working.
- **Files modified:** `src/lib/recgon/reframeEnqueue.ts` (created), `src/lib/recgon/reframe.ts` (re-export added)
- **Verification:** All 8 ACs of Task 3.1 pass; tsc clean; no import cycle.
- **Pre-authorized by:** Plan's `<important_constraints>` block.
- **Committed in:** `3ff8ea8`

**2. [Rule 2 - Missing Critical] storage.reassignTask did not catch enqueueReframeJob throws (regression from Test 5)**
- **Found during:** Task 3.1 RED→GREEN (Test 5 failed on first run because the bare `await enqueueReframeJob(...)` would propagate a thrown error and cause reassignTask to reject).
- **Issue:** The helper is contractually fire-and-forget, but a refactor regression (or test stub that bypasses internal catches) could let a throw escape. Without a defense-in-depth wrap at the call site, a queue hiccup could roll back the assignment — violating FRAME-04 (assignment is source of truth, reframe is enhancement).
- **Fix:** Added `.catch(logger.warn)` around the `enqueueReframeJob` call in storage.ts, mirroring the dispatcher pattern.
- **Files modified:** `src/lib/recgon/storage.ts`
- **Verification:** Test 5 passes; reassignment success is independent of queue health.
- **Committed in:** `3ff8ea8` (same commit as Task 3.1)

---

**Total deviations:** 2 auto-fixed (1 pre-authorized architectural fallback / Rule 4 resolved by plan, 1 missing critical / Rule 2).
**Impact on plan:** Both deviations strengthen the plan's invariants without changing its scope. The leaf-module decision was anticipated in the plan; the defense-in-depth catch is consistent with the dispatcher's existing pattern.

## Threat Flags

None — this plan tightened existing surfaces (atomic invalidation closes a race window; defense-in-depth catch hardens the fire-and-forget contract) without introducing new auth paths, endpoints, file access, or trust boundaries.

## Issues Encountered

- Test 5 (`enqueueReframeJob throwing does NOT prevent reassignTask from completing`) failed on first run because the storage helper didn't wrap the `await enqueueReframeJob(...)` call. Fix: added `.catch(logger.warn)`, mirroring the dispatcher's existing call-site pattern. See Deviation #2 above.
- `sed` mass-edit on the tone-bounds test missed the `'flattery', // unused for accept'` lines in the negative-control fixtures (sed pattern was `'flattery',$`). Manually added `expectedKind: null` to both. Cosmetic — both versions ran the same assertion path.
- AC for FRAME-06 / FRAME-07 (grep-counts of literal `kind: 'tone_reject'` and `rejects.toMatchObject`) was written assuming a non-parameterized layout. My initial parameterized loop satisfied the SPIRIT of the AC (14 + 10 passing tests with the correct kind assertion) but only had a single literal occurrence per assertion type. Restructured to per-fixture `it()` blocks so each fixture has its own literal assertion line — improves CI failure-output legibility and trivially satisfies the grep counts.

## User Setup Required

None for Plan 04-03. The migrations from Plan 04-01 are already live (operator confirmed via Supabase MCP `apply_migration` + `list_tables` at the Plan 04-01 checkpoint). This plan only modifies server-side code that reads + writes the existing columns.

Carry-over from prior sessions still pending (unchanged from Plan 04-02 SUMMARY):
1. Apply `supabase/migrations/20260518_drop_owner_dock_dismissals.sql` (Phase 3.5 reversal — owner_dock_dismissals table exists but no code references it)
2. Real-LLM bias regression baseline (`JUDGE_BIAS_REAL_LLM=1`) — Phase 3 carry-over
3. Apply `supabase/migrations/20260516_triage_note_column.sql` if not already applied — Phase 3 / Plan 06
4. Apply Phase 3.6 migration (`overdue_tier`, `last_overdue_action_at`, `overdue_pressure_enabled` columns) if not already applied
5. Unrelated stash `@{0}` (`phase-3-profile-refactor-wip`) is still in place

## Next Phase Readiness

Phase 5 (Live Code Infrastructure) can start planning immediately. Its inputs:
- Phase 4 is code-complete — all 7 FRAME requirements closed.
- The `task_reframe` walking skeleton + viewer-discriminated read + atomic invalidation are all in place. Phase 5's `live_code_summary` job will run alongside `task_reframe` in the existing `llm_jobs` queue with no contention concerns (each kind has its own worker registration).
- ROADMAP flags Phase 5 as research-recommended: consider `/gsd-research-phase 5` before planning to surface tree-sitter WASM choices, Octokit compareCommitsWithBasehead patterns, and per-file SHA cache layout decisions.

No blockers for Phase 5.

---
*Phase: 04-personalized-task-framing*
*Completed: 2026-05-20*
