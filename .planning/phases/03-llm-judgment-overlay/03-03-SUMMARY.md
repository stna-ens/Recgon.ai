---
phase: 03-llm-judgment-overlay
plan: 03
subsystem: recgon/assignment-reasoning
status: complete
completed: 2026-05-14
tags:
  - recgon
  - storage
  - ui
  - email
  - jsonb
  - privacy
  - phase-3
dependency_graph:
  requires:
    - 03-01 (JudgePick + AssignmentReasoning types, runJudgment)
    - 03-02 (dispatcher computes + threads reasoning envelope through dispatchSingleTaskWithReasoning)
  provides:
    - "agent_tasks.assignment_reasoning JSONB column (migration committed; user applies)"
    - "src/lib/recgon/whyYou.ts — renderWhyYou(reasoning) renderer (single source of truth for Why you copy)"
    - "AssignmentReasoningSchema (Zod, kind-discriminated) in src/lib/schemas.ts"
    - "assignTask(..., reasoning?) persists the validated JSONB or null"
    - "notifyTeammateAssigned email body contains a one-line **Why you:** callout when reasoning is present"
    - "TaskDetailPanel WhyYouBlock sub-component (renders WHY YOU header + sentence inline)"
    - "GET /api/recgon/tasks/[id] privacy-filtered route (only assignee + owner see whyYouSentence; raw JSONB never returned)"
  affects:
    - "Phase 04 (task reframe consumes assignment_reasoning per ROADMAP D-29 contract)"
    - "src/lib/recgon/dispatcher.ts (now imports renderWhyYou + passes reasoning to assignTask)"
tech-stack:
  added: []
  patterns:
    - "Defense-in-depth Zod validation at storage boundary: invalid reasoning → log warn + write null (never fail the assignment)"
    - "Single rendering function for cross-surface copy (email body + UI block) — renderWhyYou is the only Why you string source"
    - "Server-side privacy filter strips PII at the network boundary: raw assignment_reasoning JSONB NEVER leaves the server; only the pre-rendered string"
key-files:
  created:
    - "supabase/migrations/20260514_assignment_reasoning.sql"
    - "src/lib/recgon/whyYou.ts"
    - "src/app/api/recgon/tasks/[id]/route.ts"
    - "src/__tests__/whyYou.test.ts"
    - "src/__tests__/assignmentReasoning.privacy.test.ts"
  modified:
    - "src/lib/recgon/dispatcher.ts (imports renderWhyYou; reasoning now reaches assignTask; email body includes Why you line)"
    - "src/lib/recgon/storage.ts (assignTask accepts reasoning?; Zod validate then write or null)"
    - "src/lib/schemas.ts (AssignmentReasoningSchema kind-discriminated union)"
    - "src/lib/recgon/types.ts (AssignmentReasoning type export consolidation)"
    - "src/components/v2/calendar/TaskDetailPanel.tsx (WhyYouBlock sub-component + TaskWithWhyYou type)"
decisions:
  - "Privacy filter renders the sentence server-side and strips the raw JSONB before the response leaves the server — defends against future schema additions accidentally leaking math scores or candidate user_ids (T-03-03-03)."
  - "renderWhyYou strips < and > defensively, even though React + React Email auto-escape (T-03-03-04 belt-and-suspenders). reason_sentence is rendered verbatim from the LLM (already post-validated in Plan 01) for non-math-only cases — no paraphrasing layer."
  - "On Zod parse failure of assignment_reasoning, log warn and write null instead of failing the assignment write. Mirrors Plan 02 fail-open posture (CONTEXT D-30, judgmentBudget pattern)."
  - "renderWhyYou is pure data → string (no LLM calls). Defense-in-depth math-only fallback if llm_tiebreaker arrives with empty reason_sentence."
requirements-completed:
  - JUDGE-07
  - JUDGE-08
metrics:
  duration_minutes: 45
  task_count: 4
  test_count: 16
  files_count: 10
---

# Phase 3 Plan 03: Assignment Reasoning + "Why you" UI Summary

**`assignment_reasoning` JSONB column on `agent_tasks` + `renderWhyYou` single-source renderer wired into assignment email and `TaskDetailPanel`, with server-side privacy filter that exposes the rendered sentence only to assignee + owner and never leaks the raw JSONB.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-14 (Task 1 commit `e9041a7`)
- **Completed:** 2026-05-14 (Task 4 commit `1193358`)
- **Tasks:** 4 of 5 (Task 5 is a manual UAT checkpoint — surfaced to user, not executed by agent)
- **Files modified:** 10 (5 created + 5 modified)
- **Tests:** 16/16 GREEN across `whyYou.test.ts` (Task 2 RED→GREEN, 11 cases) + `assignmentReasoning.privacy.test.ts` (Task 4, 5 cases)

## Accomplishments

- Additive `assignment_reasoning JSONB default null` column migration on `agent_tasks` — backwards compatible, pre-Phase-3 rows untouched.
- `whyYou.ts` renderer with reason-code template table (5 LLM codes + math-only fallback + defense-in-depth math fallback for malformed llm_tiebreaker payloads) — single source of truth for "Why you" copy.
- `assignTask` extended to accept and persist the validated `AssignmentReasoning` envelope (or `null` on invalid shape — never fails the assignment).
- Dispatcher's `notifyTeammateAssigned` now includes a one-line `**Why you:** <sentence>` callout in the assignment email when reasoning is present.
- `TaskDetailPanel` renders a `WhyYouBlock` (header + sentence, inline with title/status/skills) — only when the API supplies `whyYouSentence`.
- New `GET /api/recgon/tasks/[id]` route enforces privacy server-side: assignee OR owner of the task's team see `whyYouSentence`; everyone else gets the task without the field; raw `assignment_reasoning` JSONB never appears in the response.

## Task Commits

1. **Task 1: assignment_reasoning migration** — `e9041a7` (feat) — `supabase/migrations/20260514_assignment_reasoning.sql`. Migration file committed; **NOT yet applied to live DB** (see User Actions Required below).
2. **Task 2 RED: whyYou.ts failing tests** — `1970f88` (test) — `src/__tests__/whyYou.test.ts`.
3. **Task 2 GREEN: whyYou.ts renderer** — `99b511a` (feat) — `src/lib/recgon/whyYou.ts`.
4. **Task 3: wire assignTask + dispatcher + email** — `c9d34e6` (feat) — `src/lib/recgon/storage.ts`, `src/lib/recgon/dispatcher.ts`, `src/lib/schemas.ts`, `src/lib/recgon/types.ts`.
5. **Task 4: privacy-filtered route + TaskDetailPanel WhyYouBlock** — `1193358` (feat) — `src/app/api/recgon/tasks/[id]/route.ts`, `src/__tests__/assignmentReasoning.privacy.test.ts`, `src/components/v2/calendar/TaskDetailPanel.tsx`.

**Plan metadata commit:** added below as the final commit after this SUMMARY.

## What was built

### Migration: `assignment_reasoning`

```sql
alter table public.agent_tasks
  add column if not exists assignment_reasoning jsonb default null;
create index if not exists agent_tasks_assignment_reasoning_kind_idx
  on public.agent_tasks ((assignment_reasoning->>'kind'))
  where assignment_reasoning is not null;
```

Additive, `default null`, fully backwards compatible. Partial index on the `kind` discriminator (math_only vs llm_tiebreaker) speeds future analytics queries without bloating the index for the (still-large) pre-Phase-3 row population.

### `renderWhyYou` template table

| reason_code | rendered template |
|-------------|-------------------|
| `recent_track_record` | `Recent track record — {reason_sentence}` |
| `interest_match` | `Interest match — {reason_sentence}` |
| `skill_depth` | `Skill depth — {reason_sentence}` |
| `task_kind_familiarity` | `Familiar work — {reason_sentence}` |
| `capacity_headroom` | `Clearest week — {reason_sentence}` |
| `math_only` | `Your fit score was strongest among teammates available this week ({skillBand}/{availabilityBand}).` |
| llm_tiebreaker with empty reason_sentence | falls through to math-only template (defense-in-depth) |

Skill/availability bands: `< 0.4 → low`, `0.4–0.7 → medium`, `≥ 0.7 → high`. Output is pure text — `<` and `>` are stripped defensively even though React + React Email auto-escape.

### Privacy filter in `route.ts`

```ts
// 1. Fetch task by id (service-role).
// 2. Hydrate whyYouSentence ONLY if reasoning != null:
//    renderWhyYou(task.assignment_reasoning) → out.sentence
// 3. Determine viewer authorization:
//    isAssignee = session.userId === task.assignee_id
//    isOwner    = verifyTeamAccess(session.userId, task.team_id).role === 'owner'
// 4. Response shape:
//    authorized → { ...task, whyYouSentence: out.sentence }   // raw JSONB stripped
//    other      → { ...task }                                  // no whyYouSentence at all
//    unauth     → 401
// Raw assignment_reasoning JSONB is NEVER in the response (defense against future schema additions leaking math scores or candidate user_ids).
```

### Defense-in-depth at the storage boundary

`assignTask(teamId, taskId, assigneeId, schedule, reasoning?)` now validates `reasoning` via `AssignmentReasoningSchema` (kind-discriminated Zod union) before writing. On parse failure: log `logger.warn('invalid_assignment_reasoning', { taskId, err })` and write `null` for the column. The assignment itself succeeds — we never block the right-task-to-right-person loop on a bad reasoning payload.

### Email body integration

`notifyTeammateAssigned` imports `renderWhyYou` and inserts a one-line `**Why you:** <sentence>` callout between the task metadata block and the CTA button, per CONTEXT D-29 mock. When `reasoning` is null/missing (legacy assignment or upstream LLM dropped), the line is omitted entirely — no empty header, no placeholder.

### TaskDetailPanel WhyYouBlock

Sub-component renders a `recgon-label` header (`WHY YOU`) + body sentence in the existing Inter style, inline with title/status/skills per the mock. When `task.whyYouSentence` is falsy the entire block is skipped (no empty header, no placeholder). Uses ONLY existing design tokens — `recgon-label` class + Inter — per the design-system constraint (memory `feedback_design_system_constraint`).

## Decisions Made

- **Server-side rendering of `whyYouSentence`, raw JSONB never returned.** Defends against future schema additions (math breakdown details, candidate user_ids, judge confidence) accidentally leaking via the same payload. The client always receives `whyYouSentence: string | undefined`, never the raw envelope.
- **Fail-open Zod validation on the storage write.** Mirrors Plan 02's `judgmentBudget` posture — the assignment is the load-bearing operation; the reasoning audit trail is best-effort. Invalid → log warn + null. The right task still gets to the right person.
- **No paraphrasing layer.** `reason_sentence` from the LLM is rendered VERBATIM (already post-validated in Plan 01's `runJudgment` for pronouns / cross-candidate refs / per-code substring hits). The renderer prepends the human label only.
- **Defense-in-depth math fallback inside `renderWhyYou`.** If an `llm_tiebreaker` payload arrives with an empty `judge.reason_sentence`, fall through to the math-only template using the embedded `mathBreakdown`. The dispatcher should never emit this, but if it does, the user still sees a populated line — no black-box assignments anywhere.
- **`<` / `>` stripped defensively** in the rendered sentence even though React + React Email both auto-escape JSX interpolation (T-03-03-04 belt-and-suspenders).

## Deviations from Plan

None — plan executed exactly as written. The four executable tasks (1–4) followed the RED→GREEN flow specified. Task 5 is a manual UAT checkpoint reserved for the user.

## Issues Encountered

None.

## User Actions Required

Two manual checkpoints are surfaced to the user before Plan 03-03 can be considered fully live:

1. **Apply BOTH migrations to the live Supabase database:**
   - `supabase/migrations/20260514_team_llm_usage.sql` (Plan 03-02 — judgment budget cap)
   - `supabase/migrations/20260514_assignment_reasoning.sql` (Plan 03-03 — assignment_reasoning JSONB column)

   Without these applied:
   - Plan 02 cap counter writes fail-open (logged + treated as allowed; no actual quota enforcement).
   - Plan 03 reasoning writes fail at runtime — `assignTask` will log a warning and write `null` for the column per the defense-in-depth posture in `storage.ts`, so the assignment still succeeds, but every "Why you" surface goes dark (email line + pop-up block omitted).

   Apply via Supabase MCP `apply_migration` or `supabase db push`. After applying, verify with `list_tables` that `agent_tasks.assignment_reasoning` (jsonb, nullable) and `team_llm_usage` (table) both exist.

2. **Manual UAT for Task 5** — visual confirmation of email body + `TaskDetailPanel` pop-up copy under the three viewer roles (assignee, owner, other teammate). See `03-03-PLAN.md` Task 5 for the six-step UAT script. The orchestrator surfaces this checkpoint separately; the user types "approved" when the visual + privacy checks pass.

## What this enables for Wave 4 (Plan 03-04)

- **Bias regression test** can now read populated `assignment_reasoning` rows end-to-end (math fallback rows have full `mathBreakdown`; llm_tiebreaker rows have the full `judge` envelope including `chosen_candidate_id` + `reason_sentence` + `confidence`).
- **ROC tuning** on `CLOSE_CALL_THRESHOLD` and `DAILY_JUDGMENT_CALL_CAP` can use the `assignment_reasoning.kind` discriminator (now indexed) to measure the math-only vs llm-tiebreaker split per team per day.
- **Nightly CI** consuming the 5 bias fixtures from Plan 03-01 can now assert end-to-end: math input → dispatcher → judge → assignTask write → API GET → rendered sentence, with the privacy filter exercised on every fixture.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/__tests__/whyYou.test.ts` | 11/11 GREEN |
| `npx vitest run src/__tests__/assignmentReasoning.privacy.test.ts` | 5/5 GREEN |
| `npx vitest run src/__tests__/assignmentReasoning.privacy.test.ts src/__tests__/whyYou.test.ts` | 16/16 GREEN |
| `npx tsc --noEmit` | exits 0 |
| `grep -c "renderWhyYou" src/lib/recgon/dispatcher.ts` | ≥ 1 (email body integration) |
| `grep -c "renderWhyYou" src/components/v2/calendar/TaskDetailPanel.tsx` | not required — UI consumes pre-rendered `task.whyYouSentence` from API, per privacy contract |
| `grep -c "assignment_reasoning" src/app/api/recgon/tasks/\[id\]/route.ts` | ≥ 1 (reads column, then strips before response) |
| Raw `assignment_reasoning` in API response payload | NEVER (verified by privacy test scenarios) |

## Threat surface flags

None new — this plan **mitigates** every threat in its threat register without introducing new attack surface:

| Threat | Mitigation in this plan |
|--------|-------------------------|
| T-03-03-01 (tampering of reasoning writes) | Service-role-only write surface + Zod `AssignmentReasoningSchema` validation; invalid → write null |
| T-03-03-02 (info disclosure of whyYouSentence) | Server-side viewer check in `route.ts`: assignee OR owner only |
| T-03-03-03 (raw JSONB leaking to client) | API NEVER returns the raw column; only the rendered string |
| T-03-03-04 (HTML/script injection via reason_sentence) | `renderWhyYou` strips `<` and `>`; React + React Email auto-escape |
| T-03-03-05 (no audit of who saw the line) | Accepted — existing API request logs cover forensics if ever needed |
| T-03-03-06 (session spoofing) | Same `session.userId` server-side trust model as every other Recgon API route; no new attack surface |

## Self-Check: PASSED

- `supabase/migrations/20260514_assignment_reasoning.sql` — FOUND (committed in `e9041a7`)
- `src/lib/recgon/whyYou.ts` — FOUND (committed in `99b511a`)
- `src/__tests__/whyYou.test.ts` — FOUND (committed in `1970f88`)
- `src/lib/recgon/storage.ts` — modified (committed in `c9d34e6`)
- `src/lib/recgon/dispatcher.ts` — modified (committed in `c9d34e6`)
- `src/lib/schemas.ts` — modified (committed in `c9d34e6`)
- `src/lib/recgon/types.ts` — modified (committed in `c9d34e6`)
- `src/components/v2/calendar/TaskDetailPanel.tsx` — modified (committed in `1193358`)
- `src/app/api/recgon/tasks/[id]/route.ts` — FOUND (committed in `1193358`)
- `src/__tests__/assignmentReasoning.privacy.test.ts` — FOUND (committed in `1193358`)
- Commit `e9041a7` (Task 1 migration) — FOUND in git log
- Commit `1970f88` (Task 2 RED) — FOUND in git log
- Commit `99b511a` (Task 2 GREEN) — FOUND in git log
- Commit `c9d34e6` (Task 3 GREEN) — FOUND in git log
- Commit `1193358` (Task 4 GREEN) — FOUND in git log
- 16/16 tests pass across `whyYou.test.ts` + `assignmentReasoning.privacy.test.ts`
- `npx tsc --noEmit` exits 0

## Next Phase Readiness

Phase 3 is now 3-of-4 plans complete (Plan 03-01 ✓, 03-02 ✓, 03-03 ✓). **Plan 03-04** can begin: bias regression test consuming the 5 fixtures committed in Plan 03-01 + env-gated real-LLM nightly CI workflow. The end-to-end audit trail (`agent_tasks.assignment_reasoning.kind` indexed) is now in place for ROC tuning of `CLOSE_CALL_THRESHOLD` (0.20) and `DAILY_JUDGMENT_CALL_CAP` (50) once real-world usage data lands.

**Pending user actions** (do not block Plan 03-04 planning, but DO block the live-DB rollout of Phase 3):
- Apply both Plan 02 + Plan 03 migrations to live Supabase.
- Approve Task 5 manual UAT.

---
*Phase: 03-llm-judgment-overlay*
*Plan: 03*
*Completed: 2026-05-14*
