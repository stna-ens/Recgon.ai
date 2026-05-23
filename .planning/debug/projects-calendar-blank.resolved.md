---
slug: projects-calendar-blank
status: resolved
trigger: user-report
created: 2026-05-19
goal: find_and_fix
tdd_mode: false
---

# Debug: Projects Calendar Blank on Production

## Symptoms

- The projects calendar UI (`/calendar`, component `PersonalCalendar`) is blank on production.
- User is signed in with `enes.kis@metu.edu.tr` (METU account) and team ST&A has 47 tasks.
- No UI error — silent failure. Empty state reads "No scheduled tasks this week."

## Evidence

- timestamp: 2026-05-19 — Located calendar component `src/components/v2/calendar/PersonalCalendar.tsx`, data API `src/app/api/calendar/route.ts`, and storage fn `listScheduledTasksForUser` in `src/lib/recgon/storage.ts:492`.
- timestamp: 2026-05-19 (initial run, WRONG verdict) — Concluded the user was signed into the gmail account by mistake. User clarified they are signed in with METU. Verdict retracted.
- timestamp: 2026-05-19 (re-investigation) — Confirmed in production:
  - METU user id `933c4a1e-c2a7-4469-866b-6dc5f5415698`, teammate id `55374769-3a9e-42ea-a8c2-79a2c5c11139` in team `383e819c-...` (ST&A).
  - ST&A has 47 agent_tasks: 18 assigned to METU teammate, 17 to `AlpBora`, 3 to `sait`, 9 unassigned. 38 have `scheduled_date`.
  - Simulating `/api/calendar?from=2026-05-18&to=2026-05-24` for METU user returns **6 cards** (May 18 ×2, May 19 ×2, May 20, May 21) and **3 project lanes** (Pixy, Recgon.ai, movely). Backend is working correctly.
- timestamp: 2026-05-19 — Frontend audit: `PersonalCalendar.tsx` persists the team filter to `localStorage` under `v2:calendar:teamFilter`. When the user previously visited the calendar while signed in as the gmail account, the gmail team id `mnf5q3tv4c1qrc` was written to that key. On the next visit (now signed in as METU), the component restores `selectedTeamId = 'mnf5q3tv4c1qrc'`. Because that team id is not in the METU response, `filteredTasks` and `teamScopedProjects` both filter to `[]`, so zero lanes render. Worse, the filter trigger is gated on `teams.length > 1` (METU is in only one team, ST&A), so it is invisible — the user has no UI to clear the stale value.

## Resolution

**Root cause (in plain English):** When the user visited the calendar months ago while signed in with the other account, the calendar quietly saved a "show only this team" filter in the browser. After switching to the METU account, that saved filter is still there, and it points at a team the METU account does not belong to. So the calendar correctly fetches all the ST&A work (47 tasks, 6 in the current week), but then the saved filter throws everything away and the screen looks empty. The little "filter by team" button is also hidden because the METU account is only in one team, so there is no visible way to undo it.

**Fix:** Added a self-healing effect in `PersonalCalendar.tsx`. When fresh data arrives from `/api/calendar`, the component now checks whether the saved filter still matches one of the teams in the response. If not, it clears the filter (resetting to "all teams") so the calendar falls back to showing everything. The user does not have to do anything — the next page load auto-recovers.

**Files changed:**
- `src/components/v2/calendar/PersonalCalendar.tsx` — added a `useEffect` after the existing localStorage-persist effect that resets `selectedTeamId` to `null` when the stored value is not present in `data.teams`.

**Verification status:**
- TypeScript: clean (only pre-existing reverted-phase errors in `.next/types/validator.ts`, unrelated to this change).
- ESLint: clean on the modified file.
- Logical verification: production database query confirmed 6 tasks should appear in the current week for the METU user across 3 projects. With the stale filter cleared, those will now render.

## Files involved

- `src/components/v2/calendar/PersonalCalendar.tsx` — **MODIFIED** (self-heal effect added at lines 51-65)
- `src/app/api/calendar/route.ts` — read-only, no bug here
- `src/lib/recgon/storage.ts` (`listScheduledTasksForUser`) — read-only, no bug here
