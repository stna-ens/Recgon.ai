---
phase: 03-llm-judgment-overlay
plan: 07
subsystem: recgon/triage-surface
status: descoped
gap_closure: true
completed: 2026-05-15
descoped_at: 2026-05-15T01:50:00Z
descoped_reason: "UI scope superseded by Owner Task Board phase. User feedback 2026-05-15: don't pollute the personal /tasks view with team-wide triage info — instead build a proper owner-facing structured grid as its own phase."
descoped_to: "Owner Task Board phase (to be planned next)"
tags:
  - recgon
  - triage
  - manual-assign
  - api
  - descoped
  - gap-closure
dependency_graph:
  closes_partial:
    - "VERIFICATION phase_3_1_gaps — manual-assign API endpoint (the data plumbing) ships; UI surfacing routes to Owner Task Board phase"
  provides:
    - "src/app/api/recgon/tasks/[id]/assign/route.ts — POST endpoint, owner-only, body: { teammateId }; clears triage_note + writes manual_assignment reasoning"
    - "src/__tests__/tasks.manualAssign.api.test.ts — 9 scenarios covering owner-only, body validation, success, regression on non-existent task"
  defers:
    - "TASKS-page triage column — superseded (don't pollute personal view per user 2026-05-15)"
    - "TaskDetailPanel TriageBlock — defer to Owner Task Board phase so the visual treatment matches the new surface"
  affects:
    - "src/lib/recgon/storage.ts (logEvent union gains 'manually_assigned')"
key-files:
  created:
    - "src/app/api/recgon/tasks/[id]/assign/route.ts"
    - "src/__tests__/tasks.manualAssign.api.test.ts"
    - ".planning/phases/03-llm-judgment-overlay/03-07-SUMMARY.md"
  modified:
    - "src/lib/recgon/storage.ts (logEvent union)"
  descoped:
    - "src/app/tasks/page.tsx (NOT modified — kept personal-view contract)"
    - "src/components/v2/calendar/TaskDetailPanel.tsx (NOT modified — defer to Owner Task Board phase)"
    - "src/app/api/recgon/tasks/route.ts (NOT created — defer to Owner Task Board phase)"
decisions:
  - "User feedback 2026-05-15 verbatim: 'the tasks page on the top is supposed to be the personal tasks. So it will be unconvenient to put whole teams triages to there. Let's find or make this page actually useful... It should be like an Excel table — the owner should understand which task is attached to who for which time periods and why. And triages also.'"
  - "Pause Plan 03-07 UI work and open a dedicated Owner Task Board phase. The manual-assign endpoint (Task 1) IS shipped because it's foundational for the new phase — the Owner Task Board will call it."
  - "Tasks 2 (TASKS-page triage column) + 3 (TaskDetailPanel TriageBlock) are NOT shipped. They would have polluted the personal-task view. The Owner Task Board phase will handle the proper surfacing."
  - "Triage data exists in the DB (Plan 03-06 wired the dispatcher to write triage_note + defer scheduledDate) — it's functional end-to-end. The user-facing surface is what's deferred."
requirements-completed:
  - GAP-3.1-04  # Manual-assign endpoint (partial — surfaces in Owner Task Board phase)
requirements-deferred:
  - GAP-3.1-01_ui  # TASKS-page triage surface → Owner Task Board phase
  - GAP-3.1-02_ui  # TaskDetailPanel TriageBlock → Owner Task Board phase
metrics:
  duration_minutes: 12
  task_count: 1  # of 3 planned (Task 1 shipped; Tasks 2 + 3 descoped)
  test_count: 9
  files_count: 2
---

# Phase 3 Plan 07: Triage Surface — Descoped Summary

**One-liner:** Plan 03-07 originally aimed to surface triaged tasks on /tasks + TaskDetailPanel. After Task 1 (manual-assign endpoint) shipped, user feedback redirected the UI work to a dedicated Owner Task Board phase. The data plumbing is in place; the proper surface gets a phase of its own.

## What shipped (Task 1)

### `POST /api/recgon/tasks/[id]/assign` — manual-assign endpoint

Owner-only endpoint that lets a team owner explicitly assign a task that the dispatcher refused (any of the 4 triage states from Plan 03-06). On success:

1. Verifies session + owner role on the task's team
2. Validates body: `{ teammateId: string }`
3. Calls `assignTask` with a synthetic `AssignmentReasoning` of shape `{ kind: 'manual_assignment', actorUserId, note: 'Manually assigned by owner.' }`
4. Calls `clearTriageNote(taskId)` so the row reflects assigned state cleanly
5. Logs `manually_assigned` event via the existing logger pipeline

The endpoint is foundational for the upcoming Owner Task Board — that phase will wire UI affordances that call this same endpoint.

### Tests (9/9 green)

- Unauthorized (no session) → 401
- Authorized but not owner of the team → 403
- Body missing teammateId → 400
- Task doesn't exist → 404
- Teammate doesn't exist → 400
- Teammate not on the team → 400
- Success path → 200 with assigned task in response
- Triage note cleared after manual assign
- Event logged with correct shape

## What's deferred (Tasks 2 + 3)

Tasks 2 (TASKS-page triage column) and 3 (TaskDetailPanel TriageBlock) were **not** shipped — they would have crammed team-wide triage data into a personal-task view, which the user explicitly rejected:

> "the tasks page on the top is supposed to be the personal tasks. So it will be unconvenient to put whole teams triages to there."

Instead, the user requested a proper owner-facing surface — a structured grid showing every team task with who/what/when/why and triage state as a first-class column. That's a new phase.

## Status of triage end-to-end

| Layer | State |
|-------|-------|
| Dispatcher refuses zero-fit assignments (`triage_note='no_clear_fit'`) | SHIPPED — Plan 03-06 |
| Dispatcher defers booked-qualified candidates (4-week lookahead) | SHIPPED — Plan 03-06 |
| Dispatcher bypasses deferral for high-priority tasks | SHIPPED — Plan 03-06 |
| LLM-grounded Why-you (null → triage_note='no_grounded_reason') | SHIPPED — Plan 03-05 |
| Migration `triage_note` column | APPLIED to live Supabase 2026-05-15 |
| Manual-assign API endpoint | SHIPPED — Plan 03-07 Task 1 |
| Owner UI to view triaged + deferred tasks at a glance | DEFERRED — Owner Task Board phase |

Triaged tasks ARE being written correctly to the DB; the owner just can't yet see them in a structured view. They'd need to inspect individual tasks (or query the DB) to find triage_note rows today.

## Commits

1. `b64a570` test(03-07): RED — manual-assign API endpoint contract
2. `0992c1f` feat(03-07): manual-assign API endpoint (owner-only)
3. (this commit) docs(03-07): descope UI work — superseded by Owner Task Board phase

## Self-Check: PASSED (within descoped scope)

- Manual-assign endpoint shipped and tested (9/9 green)
- No edits to /tasks page or TaskDetailPanel — personal-view contract preserved
- Owner Task Board vision saved to project memory (`project_owner_task_board.md`) so it doesn't drift
- Phase 1/2 uncommitted profile WIP untouched
