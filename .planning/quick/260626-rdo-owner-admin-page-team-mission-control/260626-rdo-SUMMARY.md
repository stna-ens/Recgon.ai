---
phase: quick-260626-rdo
plan: 01
subsystem: web-ui
tags: [admin, navigation, calendar, home, owner-gate]
requires:
  - /api/teams/[id]/command
  - /api/teams/[id]/calendar
  - src/components/v2/command/DispatchFloor.tsx
provides:
  - /admin owner mission-control page
  - ProjectRollup component + deriveProjectRollup helper
  - WeekCalendar team-wide mode (optional projectId)
  - buildCalendarUrl helper
affects:
  - src/app/page.tsx (Home slimmed to personal cockpit)
  - src/components/v2/TopNavV2.tsx (owner Admin tab)
  - src/app/command/page.tsx (redirect → /admin)
key-files:
  created:
    - src/app/admin/page.tsx
    - src/components/v2/admin/ProjectRollup.tsx
    - src/__tests__/admin-projectRollup.test.ts
    - src/__tests__/admin-calendarUrl.test.ts
  modified:
    - src/components/v2/calendar/WeekCalendar.tsx
    - src/components/v2/calendar/calendarUtils.ts
    - src/components/v2/TopNavV2.tsx
    - src/app/command/page.tsx
    - src/app/page.tsx
    - messages/en/nav.json
    - messages/tr/nav.json
    - messages/en/home.json
    - messages/tr/home.json
metrics:
  tasks: 6
  completed: 2026-06-26
---

# Phase quick-260626-rdo Plan 01: Owner Admin Page — Team Mission Control Summary

Built an owner-only `/admin` mission-control page (team board + team-wide calendar + decisions + per-project rollup), added an owner-gated Admin nav tab, redirected `/command` → `/admin`, and slimmed Home into a personal cockpit — all assembly of existing data/components, with unit tests for the two pure helpers.

## What was built (all 6 tasks)

**Task 1 — WeekCalendar.projectId optional (commit d05211c, prior run)**
`Props.projectId` is now optional. When omitted the calendar fetches every team task (the `/admin` view); when passed it scopes to one project (project tasks page, unchanged behaviour). API route already read `projectId` as optional — no backend change.

**Task 2 — Owner-gated /admin scaffold (commit e3f2b0c, prior run)**
`src/app/admin/page.tsx` copies the `command/page.tsx` body: SWR fetch of `/api/teams/[id]/command`, counts memo, stat row, loading skeletons, `DispatchFloor`, `CreateTaskModal`, help modal, and the `.v2-ops*` styles. Owner-gate (the `.v2-tasks-locked` glass-card with `tasks.ownerLock.*` keys) renders for non-owners. Server authz is already enforced by `verifyTeamAccess`; the client gate is UX-only.

**Task 3 — Team calendar + ProjectRollup on /admin (commit fa04cfa, prior run)**
`src/components/v2/admin/ProjectRollup.tsx` derives per-project open/scheduled/overdue counts from the command payload (exported pure `deriveProjectRollup`) and renders `<Link>` rows to each project's tasks board. `/admin` renders `<WeekCalendar />` with no `projectId` plus `<ProjectRollup />` below the board.

**Task 4 — Owner Admin nav tab + i18n + /command redirect (commit 648378a, prior run)**
`TopNavV2.tsx` removes the `/command` entry and inserts an owner-only `/admin` tab (after issues, before calendar). `nav.admin` added to `messages/en/nav.json` ("Admin") and `messages/tr/nav.json` ("Yönetim"). `src/app/command/page.tsx` is now just `redirect('/admin')` so deep links survive.

**Task 5 — Slim Home to a personal cockpit (commit a2da965, this run)**
Removed `HomeBoard` + `HomePortfolio` (now on `/admin`), the `RefinedHome`/`ClassicHome`/`PortfolioSnapshot` variant branching, the team-pulse SWR fetch and `mergeTeamPulses`, and now-dead imports/types/styles. `OverviewPayload` trimmed to `{ totalProjects, todayFocus, updates }`. Home now renders a single path: `HomeFocus` + a lean "your work" section (two glass-card links to `/tasks` and `/calendar`) using the pre-added `sections.yourWork` / `yourWork.*` i18n keys. First-run checklist + empty hero kept.

**Task 6 — Tests + helper extraction (commit d67fc31, this run)**
Extracted `buildCalendarUrl(teamId, projectId?)` into `calendarUtils.ts` and refactored WeekCalendar's inline URL to call it. Two vitest files: `admin-projectRollup.test.ts` (open/scheduled/overdue grouping + null-projectId exclusion + zeroed rows) and `admin-calendarUrl.test.ts` (with/without projectId + special-char encoding).

## Commits

- d05211c feat: make WeekCalendar projectId optional (Task 1)
- e3f2b0c feat: scaffold owner-gated /admin page (Task 2)
- fa04cfa feat: add team calendar + project rollup to /admin (Task 3)
- 648378a feat: owner-only Admin nav tab + /command redirect (Task 4)
- a2da965 feat: slim Home to a personal cockpit (Task 5)
- d67fc31 test: cover rollup counts + calendar URL builder (Task 6)

## Deviations from Plan

None for Tasks 5–6 — executed as written. The `deriveProjectRollup` helper required by Task 6 was already exported when ProjectRollup was built in Task 3, so only `buildCalendarUrl` needed extracting.

## Verification results

- `npm run build` — succeeds (all routes compile, including `/admin` and `/command`).
- `npm run test` — 570 passed, 6 skipped (pre-existing skips); the 2 new files contribute 6 passing tests.
- `npx eslint` on all touched files — 0 errors, 5 warnings (all pre-existing `react-hooks/set-state-in-effect` on unchanged `useEffect` bodies; out of scope).
- `npx tsc --noEmit` — clean for all touched files.

## TDD Gate Compliance

Task 6 is `tdd="true"`. The `test(...)` commit (d67fc31) bundles the helper extraction with its tests; both helpers are now covered by passing unit tests. `deriveProjectRollup` pre-existed from Task 3, so a separate RED-only commit was not produced — the tests were authored and verified green in the same commit as the minimal `buildCalendarUrl` extraction.

## Self-Check: PASSED

- src/app/admin/page.tsx — FOUND
- src/components/v2/admin/ProjectRollup.tsx — FOUND
- src/__tests__/admin-projectRollup.test.ts — FOUND
- src/__tests__/admin-calendarUrl.test.ts — FOUND
- Commits a2da965, d67fc31 — FOUND in git log
