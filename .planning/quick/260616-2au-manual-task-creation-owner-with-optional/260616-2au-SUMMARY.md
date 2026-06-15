---
phase: quick-260616-2au
plan: 01
subsystem: recgon-tasks
tags: [tasks, manual-assign, i18n, command-center, ui]
requires: []
provides:
  - "Owner manual task creation (assignee + schedule per-task choice)"
  - "Shared MANUAL_ASSIGN_SENTENCE + buildManualAssignReasoning() helper"
  - "Global '+ New Task' surface (top bar + command palette + command center)"
affects:
  - "POST /api/teams/[id]/tasks"
  - "POST /api/recgon/tasks/[id]/assign"
tech-stack:
  added: []
  patterns: [shared-leaf-helper, window-customevent-host, self-fetching-modal]
key-files:
  created:
    - src/lib/recgon/manualAssign.ts
    - src/components/v2/tasks/CreateTaskModal.tsx
    - src/components/v2/CreateTaskHost.tsx
  modified:
    - src/app/api/recgon/tasks/[id]/assign/route.ts
    - src/app/api/teams/[id]/tasks/route.ts
    - src/components/v2/TopNavV2.tsx
    - src/components/v2/CommandPaletteHost.tsx
    - src/components/WorkspaceShell.tsx
    - src/app/command/page.tsx
    - messages/en/tasks.json
    - messages/tr/tasks.json
    - messages/en/shared.json
    - messages/tr/shared.json
    - messages/en/nav.json
    - messages/tr/nav.json
decisions:
  - "verifyTeamWriteAccess replaced by verifyTeamAccess in POST so the role string gates the owner-only person branch (viewers still 403)."
  - "nav.newTask added to nav.json (button label namespace) rather than reusing shared.json nav.newTask (an aria-label)."
metrics:
  duration_min: ~30
  completed: 2026-06-16
---

# Quick 260616-2au: Manual Task Creation (Owner, with optional assignee/schedule) Summary

Owner can now create a task by hand from any page via a global "+ New Task" button, choosing per-task whether a specific teammate (owner-gated) or Recgon auto-assigns, and whether to pin a schedule day or let Recgon schedule it. Tasks with no project (projectId null) are supported and still surface in /command.

## What shipped

- **Task 1** — `src/lib/recgon/manualAssign.ts` holds the single `MANUAL_ASSIGN_SENTENCE` + `buildManualAssignReasoning()` (math_only zero-math envelope), now imported by both `/api/recgon/tasks/[id]/assign` (pure extraction, behavior unchanged) and the extended `POST /api/teams/[id]/tasks`. The POST route handles all four assignee×schedule combinations: auto/auto (existing dispatch), auto/date (dispatch then `setTaskSchedule` override), person/auto (`planTaskSchedule` + `assignTask` + reframe enqueue), person/date (pinned schedule). The person branch is owner-gated (`role === 'owner'`) and validates the teammate against `listTeammates`.
- **Task 2** — `CreateTaskModal` (modeled on EditTaskModal; title/desc/project/kind/assignee/priority/schedule/deadline; self-fetches teammates+projects when not provided). `CreateTaskHost` global event listener for `v2:open-create-task` (seeds project id from `/projects/[id]`), mounted in `WorkspaceShell`. Owner-only "+ New Task" top-bar button in `TopNavV2` + `act-create-task` command-palette action both dispatch the event.
- **Task 3** — Owner-only "+ New Task" button in the `/command` hero passing already-loaded teammates/projects (no refetch) and refreshing via SWR `mutate`. Bilingual `createTask` block in en/tr tasks.json, `nav.newTask` in en/tr nav.json, `commandPalette.createTask` in en/tr shared.json.

## Deviations from Plan

**1. [Rule 3 - Blocking] Removed now-unused `verifyTeamWriteAccess` import**
- The POST route switched to `verifyTeamAccess` (needs the role string for the owner branch). Left the old boolean import → would have been an unused-import lint error. Removed it.
- Files modified: src/app/api/teams/[id]/tasks/route.ts

**2. [Adjustment] nav button label key placement**
- The plan suggested `ts('nav.newTask')` (shared namespace). That existing key is an aria-label ("new task"). To give the button a proper title-case label without changing the aria-label's meaning, `newTask` was added to the **nav** namespace (nav.json) and the top-bar button uses the page's existing `t = useTranslations('nav')`. `commandPalette.createTask` was still added to shared.json as specified.

## Verification

- `npm run lint` → 0 errors, 54 warnings (all pre-existing `react-hooks/set-state-in-effect` warnings, including 2 from CreateTaskModal's form-reseed effect which matches the established EditTaskModal pattern).
- `npm run test` → 521 passed, 6 skipped (no regressions).
- All six touched message JSON files parse as valid JSON; `createTask` present in en+tr tasks.json, `newTask` in en+tr nav.json, `commandPalette.createTask` in en+tr shared.json.

## Known Stubs

None.

## Self-Check: PASSED

- Created files exist: manualAssign.ts, CreateTaskModal.tsx, CreateTaskHost.tsx
- Commits exist: b932601 (Task 1), 8999b73 (Task 2), 0353fab (Task 3)
