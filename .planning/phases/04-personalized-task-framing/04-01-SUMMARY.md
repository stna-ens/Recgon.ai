---
phase: 04-personalized-task-framing
plan: 01
subsystem: ai-pm
tags: [reframe, llm-jobs, schema-migration, walking-skeleton, dispatcher, frame-06, frame-07]

requires:
  - phase: 03-llm-judgment-overlay
    provides: AssignmentReasoning shape + PRONOUN_DENY tone validator + adapter-injected LLM module precedent
provides:
  - task_reframe LLM job kind + worker (fail-soft on missing columns + reassignment race shield)
  - Pure adapter-injected runReframe module with FRAME-06 tone + FRAME-07 grounding validators
  - Dispatcher enqueueReframeJob helper wired into both assignScheduledTask call sites
  - agent_tasks.personalized_description + personalized_description_for_user_id columns (live)
  - llm_jobs.kind CHECK constraint extended to allow 'task_reframe'
affects: [04-02-render-personalized-description, 04-03-reassignment-invalidation, 05+]

tech-stack:
  added: []
  patterns:
    - "Pure adapter-injected LLM module (chat injected at call time, no SDK imports at module level)"
    - "Single-throw ReframeError with kind discriminator (llm_failure | schema_reject | tone_reject | grounding_reject)"
    - "Fail-soft worker on missing-migration columns (return { skipped, reason:'columns_missing' } instead of crash)"
    - "Reassignment race shield: worker re-reads agent_tasks.assigned_to → teammate.user_id and compares to payload.assigneeUserId"
    - "Cited-signal traceability: every cited_signals entry must originate from declaredSkills ∪ declaredInterests ∪ recentProjectState ∪ task body"

key-files:
  created:
    - src/lib/recgon/reframe.ts
    - src/__tests__/reframe.module.test.ts
    - src/__tests__/reframe.worker.test.ts
    - supabase/migrations/20260520_personalized_description_columns.sql
    - supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql
  modified:
    - src/lib/recgon/types.ts
    - src/lib/schemas.ts
    - src/lib/prompts.ts
    - src/lib/llm/jobQueue.ts
    - src/lib/llm/workers.ts
    - src/lib/recgon/dispatcher.ts
    - .planning/STATE.md
    - .planning/codebase/ARCHITECTURE.md

key-decisions:
  - "runReframe throws ReframeError (not null-on-failure) so the worker layer gets distinct error categories for retry policy — mirrors judge.ts, diverges from whyYouLLM.ts."
  - "Fire-and-forget enqueue from dispatcher: a failed enqueue must NEVER roll back an assignment (source of truth is the assignment row, reframe is enhancement)."
  - "Fail-soft worker on columns_missing returns { skipped, ... } as success so jobQueue doesn't infinite-retry in unmigrated environments."
  - "Tone whitelist enforced both in prompt text (LLM steering) AND post-hoc regex (defense in depth) — Zod enum on cited_moves is the third layer."
  - "Cited-signal traceability uses substring match against the union of declared profile + recent project state — rejects any signal the LLM might have inferred (FRAME-07)."

patterns-established:
  - "Pure-module + worker split: src/lib/recgon/<feature>.ts is adapter-injected pure code; src/lib/llm/workers.ts owns supabase I/O + payload validation."
  - "Helper-per-call-site for fire-and-forget enqueues: enqueueReframeJob colocates teammate→userId resolution + .catch(logger.warn) so both dispatcher paths use one call."
  - "Constraint-and-column migration pairs: when a new JobKind is added, the same migration batch must extend llm_jobs.kind CHECK (precedent: 2026-05-13 github_skill_inference)."

requirements-completed: [FRAME-01, FRAME-02, FRAME-06, FRAME-07]

duration: ~70min
completed: 2026-05-20
---

# Phase 4 Plan 01: Personalized Task Framing Walking Skeleton

**Walking skeleton for personalized task descriptions: pure adapter-injected `runReframe` module, `task_reframe` worker draining via cron, dispatcher fire-and-forget enqueue per assignment, and two additive nullable columns on `agent_tasks` (live).**

## Performance

- **Duration:** ~70 min (across two executor sessions, interrupted by checkpoint)
- **Started:** 2026-05-20T17:07:07Z (Task 1.1 commit)
- **Completed:** 2026-05-20T17:18:29Z (constraint-fix commit)
- **Tasks:** 4 of 4 (1 human-action checkpoint resolved by orchestrator)
- **Files modified:** 13 (5 created, 8 modified)

## Accomplishments

- Walking skeleton end-to-end: dispatcher enqueues `task_reframe` → cron drains → worker calls `chatViaProviders` once → writes `personalized_description` + `personalized_description_for_user_id` on `agent_tasks`.
- FRAME-06 (tone bounds) and FRAME-07 (no external inference) enforced at the pure-module boundary via post-hoc validators that run BEFORE persist, so a misbehaving LLM cannot poison the column.
- Live Supabase migration applied AND a critical follow-up gap (missing `task_reframe` in `llm_jobs.kind` CHECK constraint) discovered + fixed in the same session.
- 17 new tests (13 module + 4 worker), zero regressions, tsc clean.

## Task Commits

1. **Task 1.1 — RED tests + schemas/prompts/types** — `84147f8` (feat)
   - Extended `AgentTask` with two optional nullable fields; added `ReframeResultSchema` + `RHETORICAL_MOVES` to `schemas.ts`; added `TASK_REFRAME_SYSTEM` + `buildTaskReframeUserPrompt` + `RHETORICAL_MOVES_WHITELIST` to `prompts.ts` with PROHIBITED (flattery / shared_history_assumption / false_familiarity) and WHITELISTED (fit_acknowledgement / start_location / recent_state_link) moves enumerated explicitly in the prompt text. Wrote 8 RED test cases referencing not-yet-existing `runReframe`.

2. **Task 1.2 — runReframe + worker GREEN** — `b375e27` (feat, TDD-flavored)
   - Created `src/lib/recgon/reframe.ts` (~520 lines, adapter-injected, throws `ReframeError` with `kind` discriminator). Tone validators: `FORBIDDEN_FLATTERY_WORDS` + `FORBIDDEN_FAMILIARITY_PHRASES` + `PRONOUN_DENY` (re-exported from `judge.ts`). Grounding validator: per-move sentence checks plus union-traceability of every `cited_signals` entry against `declaredSkills ∪ declaredInterests ∪ recentProjectState ∪ task body`.
   - Extended `JobKind` with `'task_reframe'` in `jobQueue.ts`.
   - Added `runTaskReframe(job)` in `workers.ts` with: payload validation, reassignment race shield (re-reads `agent_tasks.assigned_to` → `teammates.user_id`), skip variants (`no_assignee`, `no_teammate`, `no_user`, `no_profile`, `task_not_found`, `reassigned`, `columns_missing`), and `WORKERS.task_reframe = runTaskReframe` registration.
   - 13 module tests + 4 worker tests, all GREEN. Full suite 388/6 (no regressions).

3. **Task 1.3 — Dispatcher hook (FRAME-01)** — `022db9b` (feat)
   - Added `enqueueReframeJob(taskId, teammateId, teamId)` helper at module top of `dispatcher.ts`. Resolves `teammate.userId` (since `agent_tasks.assigned_to` stores teammateId, not userId), skips silently with `logger.debug` when teammate has no userId (legacy/AI teammates), and is fire-and-forget: enqueue rejections are swallowed via `.catch(logger.warn)` and NEVER roll back the assignment.
   - Wired into both `assignScheduledTask` call sites in the dispatcher: owner-fallback path (~line 954) AND best-fit path (~line 1026). Each call sits AFTER `assignTask` succeeds and BEFORE `notifyTeammateAssigned`, so the assignment email goes out with the reframe job already in the queue.

4. **Task 1.4 — Migration file (BLOCKING checkpoint)** — `ace2122` (feat)
   - Wrote `supabase/migrations/20260520_personalized_description_columns.sql`:
     - `ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS personalized_description TEXT NULL`
     - `ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS personalized_description_for_user_id TEXT NULL`
     - `CREATE INDEX IF NOT EXISTS agent_tasks_personalized_for_user_id_idx ON agent_tasks (personalized_description_for_user_id) WHERE personalized_description IS NOT NULL` (partial index supporting Plan 04-03's reassignment-invalidation lookup).
     - Column comments documenting Phase 4 / Plan 01 ownership + the fail-soft contract.
   - Also updated `.planning/STATE.md` and `.planning/codebase/ARCHITECTURE.md` to reflect Phase 4 / Plan 1 of 3 in flight.
   - Executor stopped here for human-action checkpoint (cannot self-apply to live DB).

5. **Follow-up fix — llm_jobs.kind CHECK extension** — `80b501a` (fix)
   - Orchestrator-applied via Supabase MCP `apply_migration` at the checkpoint. Mirrors the 2026-05-13 `github_skill_inference` precedent file. Without this, every `enqueueReframeJob` call from the dispatcher would 23514 in production.
   - Migration file `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql` committed to repo for parity with live schema.

## Operator's Migration-Applied Confirmation

- **Time:** 2026-05-20 (at checkpoint resolution)
- **Project:** Recgon Supabase project `hrgyrtgpgvsgvxmozcax`
- **Method:** Supabase MCP `apply_migration` (web environment, no shell)
- **Verification:** `list_tables` confirmed both columns present on `agent_tasks`:
  - `personalized_description text NULL` (with Phase 4 comment)
  - `personalized_description_for_user_id text NULL` (with Phase 4 comment)
  - Partial index `agent_tasks_personalized_for_user_id_idx` exists.
- **Constraint check:** `llm_jobs_kind_check` now includes `'task_reframe'`.

## runReframe Module Shape

`src/lib/recgon/reframe.ts` (~520 lines):

```typescript
export class ReframeError extends Error {
  readonly kind: 'llm_failure' | 'schema_reject' | 'tone_reject' | 'grounding_reject';
  readonly cause?: unknown;
}

export type ReframeChatAdapter = (
  system: string, user: string, opts?: { temperature?: number; timeoutMs?: number; taskKind?: string }
) => Promise<string>;

export async function runReframe(
  inputs: ReframeInputs,
  opts?: { chat?: ReframeChatAdapter; timeoutMs?: number },
): Promise<ReframeResult>;
```

Execution order inside `runReframe`:

1. Build user prompt via `buildTaskReframeUserPrompt(inputs)`.
2. Call adapter (default: lazy `chatViaProviders` at temperature=0, `responseMimeType='application/json'`, `taskKind='recgon_task_reframe'`). Throw on adapter error → `kind:'llm_failure'`.
3. JSON parse → throw `kind:'schema_reject'` on failure.
4. `ReframeResultSchema.safeParse` → throw `kind:'schema_reject'` on failure.
5. **Tone validator (FRAME-06)** — runs before persist:
   - `PRONOUN_DENY` (imported from `judge.ts` — same regex used by judge bias)
   - `FORBIDDEN_FLATTERY_WORDS = /\b(great|amazing|perfect|brilliant|love|fantastic|excellent|awesome)\b/i`
   - `FORBIDDEN_FAMILIARITY_PHRASES = /\b(as you know|like last time|remember when|I know how)\b/i`
   - Defense-in-depth: re-check `cited_moves` is subset of `RHETORICAL_MOVES_WHITELIST` (even though Zod enum should already catch it)
   - Any match → throw `kind:'tone_reject'`.
6. **Grounding validator (FRAME-07)** — runs before persist:
   - For each move in `cited_moves`:
     - `fit_acknowledgement`: sentence must contain at least one `declaredSkill` substring (case-insensitive) OR a reason_code from `assignmentReasoning`. Else reject.
     - `start_location`: at least one `cited_signal` must appear in `recentProjectState.recentCommitFiles` OR `task.description`.
     - `recent_state_link`: at least one `cited_signal` must match a key in `recentProjectState` (analytics change / task titles / commit files).
   - Defense in depth: every entry in `cited_signals` must be present in `declaredSkills ∪ declaredInterests ∪ flatten(recentProjectState) ∪ task.title/description`. Any orphan signal → reject as inferred data.
   - Any grounding failure → throw `kind:'grounding_reject'`.
7. Return validated result.

Module never imports `chatViaProviders` at module top — the default adapter is built lazily inside `runReframe` so test stubs can fully replace it.

## Worker Registration

`src/lib/llm/workers.ts` adds `runTaskReframe(job)` with payload `{ taskId, assigneeUserId, teamId }`:

1. Validate payload shape (throw on missing field → job queue retries with backoff).
2. Load task row + teammate row + declared profile + recent project state (best-effort; nulls do NOT block).
3. **Reassignment race shield:** re-read `agent_tasks.assigned_to` → `teammates.user_id`; if it doesn't match `payload.assigneeUserId`, return `{ skipped: true, reason: 'reassigned' }` (no write).
4. Call `runReframe(inputs)`. `ReframeError` propagates → jobQueue retries with exponential backoff.
5. Persist: `supabase.from('agent_tasks').update({ personalized_description, personalized_description_for_user_id })`. If error message contains `"column"` + `"does not exist"` → `logger.warn('reframe_columns_missing')` and return `{ skipped: true, reason: 'columns_missing' }` (fail-soft, success-shaped to prevent infinite retry).
6. Skip variants also covered: `no_assignee`, `no_teammate`, `no_user`, `no_profile`, `task_not_found`.

Registered in the `WORKERS` table: `task_reframe: runTaskReframe`.

## Dispatcher Hook

`src/lib/recgon/dispatcher.ts` adds:

```typescript
async function enqueueReframeJob(taskId, teammateId, teamId): Promise<void> {
  // Resolve teammate.userId (assigned_to stores teammateId, not userId)
  // Skip silently when userId is null (legacy non-user / AI teammates)
  // Fire-and-forget: .catch(logger.warn) — never rolls back the assignment
}
```

Wired into both call sites in `assignScheduledTask`:
- Owner-fallback path (~line 954)
- Best-fit path (~line 1026)

Both calls land AFTER `assignTask` succeeds and BEFORE `notifyTeammateAssigned`, so by the time the assignment email is sent the reframe job is already queued (Plan 04-02 will switch the email to read the personalized description when populated).

## llm_jobs.kind Constraint Gap (Critical Fix)

**Discovered at checkpoint, not in plan.**

The plan correctly extended the TypeScript `JobKind` union with `'task_reframe'` but did NOT extend the database CHECK constraint `llm_jobs_kind_check`. Without the constraint fix, every `enqueueReframeJob` call would fail in production with PostgreSQL error 23514 (constraint violation).

This is the **same gap** that was hit and fixed for `github_skill_inference` on 2026-05-13. Treating this as a permanent pattern: any new `JobKind` addition requires a paired migration extending the CHECK.

**Migration `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql`** added the kind to the CHECK list and was applied to live Supabase via MCP at the same checkpoint as the columns migration.

## Files Created/Modified

**Created:**
- `src/lib/recgon/reframe.ts` — Pure adapter-injected reframe module with tone + grounding validators (~520 lines).
- `src/__tests__/reframe.module.test.ts` — 13 unit tests across happy path, schema reject, tone reject (flattery / familiarity / pronouns), grounding reject (orphan signal / inferred skill), empty profile, llm_failure, adapter injection.
- `src/__tests__/reframe.worker.test.ts` — 4 worker integration tests: happy-path write, columns_missing fail-soft, reassignment race shield, no_assignee short-circuit.
- `supabase/migrations/20260520_personalized_description_columns.sql` — Two ADD COLUMN statements + partial index + column comments.
- `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql` — CHECK constraint extension for the new JobKind.

**Modified:**
- `src/lib/recgon/types.ts` — Added `personalizedDescription` + `personalizedDescriptionForUserId` to `AgentTask`; added `ReframeInputs`, `ReframeResult`, `RhetoricalMove` exports.
- `src/lib/schemas.ts` — Added `ReframeResultSchema` (Zod) + `RHETORICAL_MOVES` const.
- `src/lib/prompts.ts` — Added `TASK_REFRAME_SYSTEM` + `buildTaskReframeUserPrompt` + `RHETORICAL_MOVES_WHITELIST` with PROHIBITED/WHITELISTED moves enumerated explicitly in prompt text.
- `src/lib/llm/jobQueue.ts` — Extended `JobKind` union with `'task_reframe'`.
- `src/lib/llm/workers.ts` — Added `runTaskReframe` worker + `WORKERS.task_reframe` registration.
- `src/lib/recgon/dispatcher.ts` — Added `enqueueReframeJob` helper, wired into both `assignScheduledTask` call sites.
- `.planning/STATE.md` — Phase 04 / Plan 1 of 3, progress 73%.
- `.planning/codebase/ARCHITECTURE.md` — Phase 4 / Plan 01 paragraph under dispatcher overlay.

## Decisions Made

- **Throw, don't return null:** `runReframe` throws `ReframeError` (mirroring `judge.ts`, diverging from `whyYouLLM.ts`) because the worker layer needs distinct error categories to drive retry policy. Tone/grounding rejects shouldn't infinitely retry the same prompt; LLM failures should.
- **Fail-soft on columns_missing:** Returning `{ skipped, reason }` as success shape (instead of throwing) prevents the job queue from infinite-retrying in unmigrated dev/staging environments. The trade-off: a misconfigured production environment silently no-ops instead of paging — accepted because the columns_missing path is monitored via `logger.warn` aggregation.
- **Fire-and-forget enqueue from dispatcher:** A failed enqueue must NEVER roll back the assignment. Assignment is the source of truth; reframe is enhancement. `.catch(logger.warn)` is mandatory at every call site.
- **Tone validator runs server-side before persist (not client-side after read):** This is a **mitigation** for T-04-01-06 (Elevation of Privilege: LLM emits tone outside whitelist). A client-side check would let the bad sentence get persisted and rendered to a different reader who lacks the validator.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] llm_jobs.kind CHECK constraint did not include 'task_reframe'**
- **Found during:** Task 1.4 checkpoint resolution (orchestrator inspection of live schema)
- **Issue:** Plan extended the TypeScript `JobKind` union but missed the paired DB CHECK constraint. Every `enqueueReframeJob` call would fail in production with PostgreSQL 23514. This is critical missing functionality for FRAME-01.
- **Fix:** Added `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql` mirroring the 2026-05-13 `github_skill_inference` precedent file. Applied to live Supabase via Supabase MCP `apply_migration` at the same checkpoint as the columns migration.
- **Files modified:** `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql` (created)
- **Verification:** Live constraint `llm_jobs_kind_check` now lists `'task_reframe'`; smoke enqueue path works end-to-end.
- **Committed in:** `80b501a`

---

**Total deviations:** 1 auto-fixed (1 missing critical / Rule 2).
**Impact on plan:** The fix was essential — without it Plan 04-01 would have shipped broken to production. Discovered during the human-action checkpoint resolution, so the executor was already paused.

## Self-Check

| Acceptance Criterion | Status |
|----------------------|--------|
| Pure `runReframe` module shipped with adapter injection (no chatViaProviders import at module top) | PASS |
| `task_reframe` JobKind extended in `jobQueue.ts` | PASS |
| `task_reframe` worker registered in `WORKERS` table | PASS |
| Worker fails-soft on missing columns (returns `{ skipped, reason:'columns_missing' }`) | PASS |
| Worker reassignment race shield (re-reads `assigned_to → user_id`, returns `{ skipped, reason:'reassigned' }`) | PASS |
| Dispatcher enqueues exactly one task_reframe job per assignment | PASS |
| Single shared helper `enqueueReframeJob` for both dispatcher call sites | PASS |
| Helper is fire-and-forget (catches enqueue errors with logger.warn) | PASS |
| Helper resolves teammate → userId, skips when userId is null | PASS |
| Migration file `20260520_personalized_description_columns.sql` exists with both columns + partial index | PASS |
| Migration applied to live Supabase (project hrgyrtgpgvsgvxmozcax) | PASS (operator confirmed via MCP list_tables at checkpoint) |
| `llm_jobs.kind` CHECK constraint extended to allow 'task_reframe' (live) | PASS (orchestrator-discovered + fixed) |
| FRAME-01 (job enqueued, never inline) enforced | PASS |
| FRAME-02 (column persists) enforced | PASS |
| FRAME-06 (tone bounds) enforced at module boundary via `FORBIDDEN_FLATTERY_WORDS`, `FORBIDDEN_FAMILIARITY_PHRASES`, `PRONOUN_DENY`, `cited_moves` whitelist check | PASS |
| FRAME-07 (no external inference) enforced via per-move grounding + cited_signals traceability | PASS |
| 17 reframe tests green (13 module + 4 worker) | PASS |
| `npx tsc --noEmit` clean | PASS |
| Full suite no regressions (388 pass / 6 skip) | PASS |
| Commit hashes verified: 84147f8, b375e27, 022db9b, ace2122, 80b501a present in `git log` | PASS |

**Self-Check: PASSED**

## Issues Encountered

- The plan didn't catch the `llm_jobs.kind` CHECK constraint gap — discovered by the orchestrator during checkpoint resolution. Documented as a Rule 2 deviation. Pattern is now explicit (see "patterns-established" frontmatter): any new `JobKind` addition requires a paired migration.

## User Setup Required

None — operator confirmed both migrations applied to live Supabase via MCP at the checkpoint. No client-side configuration or env vars needed for this plan.

## Next Phase Readiness

Plan 04-02 (viewer-discriminated read) can start immediately. Its inputs:
- `agent_tasks.personalized_description` column is live and writable.
- `personalized_description_for_user_id` column is live for viewer-discrimination check (only show the personalized description to the user it was generated for).
- The walking skeleton is queueing + writing; Plan 04-02 owns the read-side rendering in the assignment email + task detail view.

Plan 04-03 (reassignment invalidation + golden tests) also has its dependencies satisfied:
- Partial index `agent_tasks_personalized_for_user_id_idx` is live to support the invalidation lookup.
- Worker's reassignment race shield is in place — Plan 04-03 layers the proactive invalidation on top (sweep that nulls the column when `assigned_to` changes).

No blockers for Wave 2.

---
*Phase: 04-personalized-task-framing*
*Completed: 2026-05-20*
