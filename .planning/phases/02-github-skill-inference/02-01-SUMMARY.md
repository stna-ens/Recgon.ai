---
phase: 02-github-skill-inference
plan: 01
subsystem: database
tags: [supabase, migration, schema, test-scaffold, recgon, skill-inference]

# Dependency graph
requires:
  - phase: 01-self-declared-profile
    provides: "teammate_profiles table, profileMerge(t, profile, null, ema) signature, canonical skill vocab, ProfileForm + /teams/[id]/me page"
provides:
  - "teammate_inferred_skills table (12 cols, unique (teammate_id, canonical_tag) + 2 partial indexes + touch_updated_at trigger)"
  - "teammate_profiles.github_mining_consent_at + last_scan_at additive columns"
  - "teams.inference_depth additive column (cheap/standard/deep, default 'standard')"
  - "src/lib/recgon/types.ts — InferredSkill, InferredSkillMap, InferredSkillSource, UpsertInferredSkillInput"
  - "src/lib/recgon/inferredSkillsStorage.ts — 9 service-role CRUD functions + mapInferredSkill mapper"
  - "Wave-0 RED test scaffolds — 7 vitest files + 2 shared mocks (Octokit + chatViaChain stub)"
affects: [02-02-worker, 02-03-ui, 02-04-merge, recgon-dispatcher]

# Tech tracking
tech-stack:
  added: []  # No new dependencies in Plan 02-01; @octokit/* + @testing-library/react land in Plans 02-02 / 02-03
  patterns:
    - "Two-step lookup-then-update/insert upsert that preserves rejected_at on conflict (vs single .upsert call which would null-overwrite preserved fields)"
    - "Service-role-only storage module pattern (matches profileStorage.ts; UI never imports)"

key-files:
  created:
    - supabase/migrations/20260513_inferred_skills.sql
    - src/lib/recgon/inferredSkillsStorage.ts
    - src/__tests__/mocks/octokit.ts
    - src/__tests__/mocks/llm.ts
    - src/__tests__/githubSkills.consent.test.ts
    - src/__tests__/githubSkills.mining.test.ts
    - src/__tests__/wrapUntrusted.test.ts
    - src/__tests__/inferredSkills.ui.test.tsx
    - src/__tests__/fitLearning.timeDecay.test.ts
    - src/__tests__/githubSkills.empty.test.ts
    - src/__tests__/profileMerge.inferred.test.ts
  modified:
    - src/lib/recgon/types.ts
    - .planning/codebase/ARCHITECTURE.md

key-decisions:
  - "D-21..D-24 baked into schema: consent timestamp on teammate_profiles; unique (teammate_id, canonical_tag) preserves rejected rows; teams.inference_depth enum; two partial indexes split dispatcher-read (rejected_at IS NULL) and worker-exclusion (rejected_at IS NOT NULL) hot paths"
  - "FK target corrected to teammates(id) — the actual table per 20260426_recgon_admin.sql:24; plan body and 02-RESEARCH.md DDL example referenced agent_teammates which does not exist in this codebase"
  - "Two-step upsert (lookup + update OR insert) instead of single .upsert(..., onConflict:...): the Supabase JS client does not support a per-column UPDATE list and a single upsert payload would null-overwrite preserved lifecycle fields (rejected_at/confirmed_at/user_reviewed_at). The two-step shape is the only way to honor D-22 (rejected stays rejected on re-scan)"

patterns-established:
  - "InferredSkillMap = Map<canonicalTag, InferredSkill> as the lookup shape for profileMerge (Plan 02-04)"
  - "Date columns stay as ISO strings on the camelCase side (matches profileMerge expectations; avoids Date serialization across server/client boundaries)"
  - "RED test scaffold strategy: tests import symbols that do not yet exist; subsequent plans hit GREEN expectations without re-deriving test contracts mid-stream"

requirements-completed: []  # Plan 02-01 is a foundation/scaffold plan. SKILL-01 and SKILL-03 are PARTIALLY supported (schema landed) but full completion lands when Plan 02-02 wires the worker (SKILL-01 consent gate) and Plan 02-03 wires the UI (SKILL-03 review surface).

# Metrics
duration: ~25min
completed: 2026-05-12
---

# Phase 2 Plan 01: Schema + Storage + Wave-0 Test Scaffolds Summary

**Additive `teammate_inferred_skills` table with consent + scan + depth columns, full CRUD storage layer, and 7 RED Wave-0 vitest files that Plans 02-02..02-04 will progressively turn GREEN.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-12T12:31:00Z
- **Completed:** 2026-05-12T12:56:00Z
- **Tasks completed:** 3 of 4 (Task 4 = blocking human-action checkpoint for `supabase db push`)
- **Files created:** 11
- **Files modified:** 2

## Accomplishments

- **Schema:** Migration `20260513_inferred_skills.sql` ships the new `teammate_inferred_skills` table (12 cols, unique `(teammate_id, canonical_tag)` index, two partial indexes for active + rejected read paths, `touch_updated_at` trigger) plus additive columns on `teammate_profiles` (`github_mining_consent_at`, `last_scan_at`) and `teams` (`inference_depth`).
- **Type contracts:** `src/lib/recgon/types.ts` now exports the four Phase 2 contracts (`InferredSkill`, `InferredSkillMap`, `InferredSkillSource`, `UpsertInferredSkillInput`) so worker, storage, profileMerge, and UI consume the same shape.
- **Storage layer:** `src/lib/recgon/inferredSkillsStorage.ts` exports 9 service-role CRUD functions (`listInferredSkills`, `listActiveInferredSkills`, `getInferredSkill`, `upsertInferredSkill`, `rejectInferredSkill`, `undoRejection`, `listRejectedTags`, `markBannerReviewed`, `getTeammateUserId`) plus `mapInferredSkill`. The upsert preserves `rejected_at` on conflict (D-22).
- **Wave-0 RED scaffolds:** 7 vitest files + 2 shared mocks. The new files fail with 14 expected RED errors (TypeError: not a function / Module has no exported member) — exactly the targets Plans 02-02..02-04 will hit GREEN. Phase 1 suite stays green (162/162 tests passing).

## Task Commits

1. **Task 1: Write Wave-0 test scaffolds + shared mocks (RED)** — `933e41f` (test)
2. **Task 2: Write additive SQL migration** — `34eb7a9` (feat)
3. **Task 3: Implement inferredSkillsStorage.ts + extend types.ts** — `6614fec` (feat)
4. **Task 4: [BLOCKING] Push Supabase migration** — *pending human-action checkpoint; see "Pending Checkpoint" below*

## Files Created/Modified

### Created

- `supabase/migrations/20260513_inferred_skills.sql` — additive DDL: `teammate_inferred_skills` table + 2 partial indexes + `touch_updated_at` trigger; ALTER TABLE add columns on `teammate_profiles` and `teams`. Idempotent.
- `src/lib/recgon/inferredSkillsStorage.ts` — service-role CRUD module (9 functions + mapper).
- `src/__tests__/mocks/octokit.ts` — shared `createMockOctokit({ commitsByRepo, paginateImpl, throttleHooks, languagesByRepo })` + `makeCommit()` helper.
- `src/__tests__/mocks/llm.ts` — `stubChatViaChain` / `stubChatViaChainFailure` / `resetChatViaChain` helpers (Phase 1 mock pattern).
- `src/__tests__/githubSkills.consent.test.ts` — 3 RED cases (no_consent / no_token / no_team_repos).
- `src/__tests__/githubSkills.mining.test.ts` — 3 RED cases (6-month since param / personal-repo filter / 200-commit cap).
- `src/__tests__/wrapUntrusted.test.ts` — 4 RED cases (wrap / strip closing tag / strip opening tag / truncate 2000).
- `src/__tests__/inferredSkills.ui.test.tsx` — 1 RED integration-shape case (reject button → optimistic flip).
- `src/__tests__/fitLearning.timeDecay.test.ts` — 5 RED cases covering τ=90d math + ISO string input + injectable `now`.
- `src/__tests__/githubSkills.empty.test.ts` — 1 RED case (skipped=false, written=0).
- `src/__tests__/profileMerge.inferred.test.ts` — 4 RED cases (regression baseline / 3-source blend / rejected exclusion / decay before blending).

### Modified

- `src/lib/recgon/types.ts` — appended Phase 2 contracts. Existing exports untouched.
- `.planning/codebase/ARCHITECTURE.md` — added Phase 2 abstraction block (new table, columns, types, profileMerge read-time blend pattern); Storage modules list now includes `profileStorage.ts` and `inferredSkillsStorage.ts`.

## Decisions Made

- **FK target corrected:** Plan body and 02-RESEARCH.md `<DDL>` example reference `agent_teammates(id)`, but the canonical table per `supabase/migrations/20260426_recgon_admin.sql:24` is `teammates(id)` (uuid). I used `teammates(id)` — without this fix the migration would fail on push.
- **Two-step upsert vs `.upsert(..., { onConflict })`:** Supabase JS does not expose a per-column UPDATE list. A single `.upsert` would null-overwrite `rejected_at` / `confirmed_at` / `user_reviewed_at` on the worker's re-write, violating D-22. Implemented as `select` lookup → `update` worker-owned fields (or `insert` when absent) so lifecycle columns are only ever written by the user action paths.
- **Two partial indexes instead of one:** Added `idx_tis_teammate_rejected (teammate_id, canonical_tag) WHERE rejected_at IS NOT NULL` alongside the active-row index. This serves the worker's `listRejectedTags()` exclusion-filter path (T-02-03) — the cleanest way to satisfy the plan's `grep -c "rejected_at" >= 3` requirement and the 02-RESEARCH.md proposed shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FK target `agent_teammates(id)` does not exist in this codebase**
- **Found during:** Task 2 (migration write)
- **Issue:** PLAN.md task 2 behavior block and 02-RESEARCH.md DDL example both reference `agent_teammates(id)`. Grepping the migrations directory and `src/lib/recgon/storage.ts` confirms there is no `agent_teammates` table — the canonical table per `supabase/migrations/20260426_recgon_admin.sql:24` is `teammates`. Running the migration as written would fail with `relation "agent_teammates" does not exist`.
- **Fix:** Used `references teammates(id) on delete cascade` (uuid PK type matches per the same migration).
- **Files modified:** `supabase/migrations/20260513_inferred_skills.sql`
- **Verification:** SQL passes shape-level sanity (`grep` contract — except a stricter-than-intended `grep -q "^1$"` for `github_mining_consent_at` / `inference_depth` which over-counts due to header-comment references). Operator will catch any remaining FK error on `supabase db push`.
- **Committed in:** `34eb7a9` (Task 2 commit)

**2. [Rule 2 - Missing critical] Added second partial index `idx_tis_teammate_rejected`**
- **Found during:** Task 2 (migration write)
- **Issue:** Plan behavior only required `uq_tis_teammate_tag` + `idx_tis_teammate_active`, but the worker's `listRejectedTags()` exclusion-filter path (T-02-03) would table-scan without an index on `(teammate_id, canonical_tag) WHERE rejected_at IS NOT NULL`. 02-RESEARCH.md §"Suggested SQL DDL" explicitly listed this as the worker's hot read path.
- **Fix:** Added the second partial index. Cost: a few bytes per rejected row (rare) for free O(log n) lookup of rejected tags on every weekly scan.
- **Files modified:** `supabase/migrations/20260513_inferred_skills.sql`
- **Committed in:** `34eb7a9` (Task 2 commit)

**3. [Rule 3 - Doc consistency] Updated `.planning/codebase/ARCHITECTURE.md` for new schema + types**
- **Found during:** Task 3 (storage write — PostToolUse hook flagged that `types.ts` / `inferredSkillsStorage.ts` are covered by ARCHITECTURE.md)
- **Issue:** ARCHITECTURE.md had no entry for Phase 2 types / table / storage module; new DB tables, type fields, and storage modules must be reflected per the hook contract.
- **Fix:** Added a `TeammateProfile / InferredSkill` abstraction block citing the new table, the additive columns (`github_mining_consent_at`, `last_scan_at`, `inference_depth`), the four new types, and the read-time blend pattern in `profileMerge`. Storage modules list now includes `profileStorage.ts` (Phase 1) and `inferredSkillsStorage.ts` (Phase 2).
- **Files modified:** `.planning/codebase/ARCHITECTURE.md`
- **Committed in:** `6614fec` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug fix, 1 missing critical, 1 doc consistency)
**Impact on plan:** All three are required for the plan to ship correctly. (1) without the FK fix the migration cannot apply; (2) without the second partial index the worker's exclusion filter degrades to a sequential scan on every weekly drain; (3) without the ARCHITECTURE.md update the codebase reference diverges from runtime reality. No scope creep — all work is inside the plan's `files_modified` quota plus the explicitly-permitted CLAUDE.md / ARCHITECTURE.md doc surface.

## Issues Encountered

- **Plan verification `grep -q "^1$"` over-counts header comments:** The Task 2 `<verify>` block expects exactly 1 occurrence of `github_mining_consent_at` and `inference_depth`, but the migration legitimately mentions each in (a) the header-comment decision block and (b) the actual `add column` / `alter table` lines. The check fails for a correct migration. Schema is verified by hand against `must_haves.truths` (all 5 pass). Logged as a plan-verification spec issue, not a code bug — left for plan-checker to refine in a future phase.
- **TypeScript on RED tests:** `tsc --noEmit` reports expected RED errors on all 7 new test files (`Module has no exported member 'runGithubSkillInference'`, etc.) and one out-of-tree dep miss (`@testing-library/react` not installed — Plan 02-03 will add it when it goes GREEN on the inferred-skills UI). Production code (`types.ts`, `inferredSkillsStorage.ts`) compiles cleanly with zero errors.

## Pending Checkpoint (Task 4 — BLOCKING human-action)

**Task 4 cannot be automated.** It requires the operator to run `supabase db push` (which authenticates via `SUPABASE_ACCESS_TOKEN` from the operator's Supabase Dashboard) against the linked project, then prove the push landed via four `information_schema` / `pg_indexes` queries.

### How to resume

1. Export `SUPABASE_ACCESS_TOKEN` in your shell (Supabase Dashboard → Account → Access Tokens).
2. Run from repo root:
   ```bash
   supabase db push
   ```
   Confirm CLI reports `Applying migration 20260513_inferred_skills.sql...` and exits 0.
3. Run drift assertion:
   ```bash
   supabase db diff --schema public --linked
   ```
   Expected: empty output, exit 0.
4. Run four SQL queries (via `supabase db query --linked` or `psql`) per PLAN.md task 4 step 7. All four must return their expected results:
   - Q1: `teammate_inferred_skills` column count = **12**
   - Q2: `teammate_profiles` returns 2 rows for `github_mining_consent_at` + `last_scan_at`, both `timestamptz`, both nullable
   - Q3: `teams.inference_depth` exists with default `'standard'`, NOT NULL
   - Q4: `pg_indexes` returns 2 rows for `uq_tis_teammate_tag` + `idx_tis_teammate_active`
5. Type "pushed" with the actual SQL outputs pasted, or paste the CLI error / diff content if anything failed.

After resume, append the four query outputs to this SUMMARY under a new `## Migration Push Verification` section.

## User Setup Required

None - no external service configuration in Plan 02-01 itself. The Supabase migration push (Task 4) is the only operator step and is gated by the checkpoint above.

## Next Phase Readiness

- **Plan 02-02 (worker + Octokit mining):** Type contracts + storage exist; will turn `githubSkills.consent.test.ts`, `githubSkills.mining.test.ts`, `wrapUntrusted.test.ts`, `githubSkills.empty.test.ts` GREEN. Requires `@octokit/rest` + `@octokit/plugin-throttling` + `@octokit/plugin-paginate-rest` install.
- **Plan 02-03 (UI section):** Will create `src/app/teams/[id]/me/InferredFromGitHub.tsx` and turn `inferredSkills.ui.test.tsx` GREEN. Requires `@testing-library/react` install (currently flagged as RED dep miss).
- **Plan 02-04 (profileMerge blend + applyTimeDecay):** Will widen `profileMerge` signature to `InferredSkillMap | null` and add `applyTimeDecay` to `fitLearning.ts`; turns `profileMerge.inferred.test.ts` + `fitLearning.timeDecay.test.ts` GREEN.

**Blocker:** Task 4 (`supabase db push`) must complete before Plan 02-02 worker writes can land row data.

## Self-Check: PASSED

- [x] `supabase/migrations/20260513_inferred_skills.sql` — FOUND
- [x] `src/lib/recgon/inferredSkillsStorage.ts` — FOUND
- [x] `src/lib/recgon/types.ts` modified (4 new exports) — FOUND
- [x] 9 test/mock files under `src/__tests__/` — FOUND (verified via `ls`)
- [x] Commit `933e41f` (Task 1) — FOUND in `git log`
- [x] Commit `34eb7a9` (Task 2) — FOUND in `git log`
- [x] Commit `6614fec` (Task 3) — FOUND in `git log`
- [ ] Task 4 (`supabase db push`) — PENDING operator action

---
*Phase: 02-github-skill-inference*
*Plan: 01*
*Completed: 2026-05-12 (Tasks 1–3); Task 4 pending operator)*
