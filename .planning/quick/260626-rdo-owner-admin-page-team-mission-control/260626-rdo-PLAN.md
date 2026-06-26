---
phase: quick-260626-rdo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/v2/calendar/WeekCalendar.tsx
  - src/app/admin/page.tsx
  - src/components/v2/admin/ProjectRollup.tsx
  - src/components/v2/TopNavV2.tsx
  - src/app/command/page.tsx
  - src/app/page.tsx
  - messages/en/nav.json
  - messages/tr/nav.json
  - src/__tests__/admin-projectRollup.test.ts
  - src/__tests__/admin-calendarUrl.test.ts
autonomous: true
requirements: [QUICK-260626-rdo]
user_setup: []

must_haves:
  truths:
    - "An owner sees an 'Admin' tab in the top nav; a member/viewer does not."
    - "Owner /admin shows: stats row, team task board (DispatchFloor with working reassign/reschedule/approve), decisions stack, a team-wide calendar (one lane per teammate, all projects), and a per-project rollup linking to each project's tasks."
    - "A member/viewer visiting /admin sees the locked glass-card, not team data."
    - "/command redirects to /admin (deep links survive)."
    - "Home no longer shows the team board/portfolio; it is a personal cockpit."
    - "/projects/[id]/tasks calendar still scopes to its own project (no regression)."
  artifacts:
    - path: "src/app/admin/page.tsx"
      provides: "Owner-gated team mission-control page composing DispatchFloor + team calendar + ProjectRollup"
      min_lines: 80
    - path: "src/components/v2/admin/ProjectRollup.tsx"
      provides: "Client-derived per-project open/scheduled/overdue counts"
      min_lines: 40
  key_links:
    - from: "src/app/admin/page.tsx"
      to: "/api/teams/[id]/command"
      via: "useSWR fetch (copied from command/page.tsx)"
      pattern: "teams/\\$\\{teamId\\}/command"
    - from: "src/app/admin/page.tsx"
      to: "src/components/v2/calendar/WeekCalendar.tsx"
      via: "render <WeekCalendar /> with no projectId"
      pattern: "<WeekCalendar"
    - from: "src/components/v2/TopNavV2.tsx"
      to: "/admin"
      via: "owner-only nav item concat when isOwner"
      pattern: "'/admin'"
    - from: "src/app/command/page.tsx"
      to: "/admin"
      via: "redirect('/admin')"
      pattern: "redirect\\('/admin'\\)"
---

<objective>
Build an owner-only `/admin` page — team mission control — that consolidates the team task board, a team-wide calendar, a decisions/stuck queue, and a per-project rollup into one screen. Add an owner-only Admin nav tab, redirect `/command` → `/admin`, and slim Home into a personal cockpit. This is assembly + navigation: almost all data and components already exist.

Purpose: An owner can currently only answer "what is my team doing, when, and what's stuck" by bouncing between `/command`, `/calendar`, and 3-clicks-deep project tasks. One page fixes that. Home then answers a different question — "what should *I* work on now?"

Output: New `/admin` route + `ProjectRollup` component; `WeekCalendar` generalized to optional `projectId`; nav + redirect + slimmed Home; tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@/Users/eneskis/.claude/plans/i-don-t-think-a-witty-gosling.md

# THE approved spec is the plan file above. Build order, file paths, and the key
# discovery (team calendar is nearly free) all live there. Follow it.

# Reuse-source files (read before editing the matching task):
@src/app/command/page.tsx
@src/components/v2/calendar/WeekCalendar.tsx
@src/app/projects/[id]/tasks/page.tsx
@src/components/v2/command/DispatchFloor.tsx

<interfaces>
<!-- The /api/teams/[id]/command payload shape (already typed). The /admin page -->
<!-- reuses this verbatim from command/page.tsx. No new types needed. -->
From src/components/v2/command/types.ts:
```typescript
export interface CommandTask {
  id: string; teamId: string; projectId: string | null; title: string;
  status: string; scheduledDate: string | null; overdueTier: number;
  /* ...plus many more fields — see file */
}
export interface CommandProject { id: string; name: string }
export interface CommandResponse {
  role: 'owner' | 'member' | 'viewer';
  decisions: CommandDecisions | null;
  tasks: CommandTask[];
  teammates: CommandTeammate[];
  projects: CommandProject[];
}
```

From src/components/v2/calendar/WeekCalendar.tsx (current signature — task 1 changes it):
```typescript
type Props = { projectId: string; onSwitchToList?: () => void };
export function WeekCalendar({ projectId, onSwitchToList }: Props) { ... }
```
The fetch URL today: `/api/teams/${teamId}/calendar?projectId=${encodeURIComponent(projectId)}`.

The calendar API route (src/app/api/teams/[id]/calendar/route.ts) ALREADY reads
projectId as optional (`url.searchParams.get('projectId') ?? undefined` → listTasks(teamId, { projectId })).
**No API change is needed** — omitting the query param returns every team task.

Owner-gate pattern (src/app/projects/[id]/tasks/page.tsx, copy verbatim):
```tsx
const { currentTeam, loading } = useTeam();
if (loading || !currentTeam) return null;
if (currentTeam.role !== 'owner') {
  return (<div className="v2-tasks-locked"><div className="glass-card is-static is-roomy">
    <span className="recgon-label v2-locked-eye">{t('ownerLock.eyebrow')}</span>
    <h2 className="v2-locked-title">{t('ownerLock.title')}</h2>
    <p className="v2-locked-body">{t('ownerLock.body')}</p>
  </div>{/* + its <style> block */}</div>);
}
```
(`t` = `useTranslations('tasks')`. Reuse the `tasks.ownerLock.*` keys + the `.v2-tasks-locked` <style> block as-is.)
</interfaces>

<conventions>
- Shared `ui/` primitives only: `Button`, `Modal`, `Skeleton`, `EmptyState`, `useConfirm` (from `@/components/ui`).
- Radix UI for any new interactive primitive (none expected here).
- Design tokens: `glass-card`, `recgon-label`, JetBrains Mono, signature pink (`var(--signature)` / `var(--signature-rgb)`). Copy exact tokens/spacing from `command/page.tsx` (`.v2-ops*`) and `DispatchFloor.tsx` (`.v2-floor-sec` section heads) — NO vibe-coded UI.
- IMPORTANT: `ActionIcon` / `src/components/ui/actionIcons.ts` does NOT exist in this codebase yet, and the buttons being copied from `command/page.tsx` are iconless `<Button>` components. This plan introduces ZERO net-new buttons — do NOT create ActionIcon infrastructure here, and do NOT add ad-hoc lucide icons to buttons. ProjectRollup rows are `<Link>` elements, not buttons. Keep button parity exactly as the copied source.
- i18n source of truth is `messages/<locale>/<ns>.json` (loaded by `src/i18n/request.ts`). The legacy combined `messages/en.json` is unused — do not edit it.
</conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make WeekCalendar.projectId optional (team-wide calendar, regression-safe)</name>
  <files>src/components/v2/calendar/WeekCalendar.tsx</files>
  <action>
Change the `Props` type `projectId: string` → `projectId?: string`. In `fetch_`, build the URL conditionally:
`const url = \`/api/teams/${teamId}/calendar${projectId ? \`?projectId=${encodeURIComponent(projectId)}\` : ''}\`;`
Grep the file for every other `projectId` reference (e.g. the `fetch_` useCallback dependency array, autoJump logic) and confirm each is null-safe when `projectId` is undefined — `fetch_`'s dep array can keep `projectId` (undefined is a stable dep). Do NOT touch the calendar API route. Everything else (lane-per-teammate, drag-reschedule via `/schedule`, unscheduled sidebar, WeekNav) stays unchanged. The project tasks page keeps passing a `projectId`, so it must behave identically.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx tsc --noEmit 2>&1 | grep -i "WeekCalendar\|calendar/" | head; echo "tsc-checked"</automated>
  </verify>
  <done>`projectId` is optional; calendar fetches all team tasks when omitted and project-scoped tasks when passed; tsc clean for the file.</done>
</task>

<task type="auto">
  <name>Task 2: Scaffold owner-gated /admin page with command fetch + DispatchFloor + stats</name>
  <files>src/app/admin/page.tsx</files>
  <action>
Create `src/app/admin/page.tsx` as a `'use client'` page. Copy the `command/page.tsx` body almost verbatim: the `CommandPageInner` SWR fetch of `/api/teams/${teamId}/command` (30s refresh), the `counts` useMemo, `currentTeammateId`, the stat row, the loading skeletons, the `<DispatchFloor data={data} teamId={teamId} currentTeammateId={...} isOwner={...} onChanged={mutate} />` render, the `CreateTaskModal` wiring, the `?`-help Modal, and the entire `.v2-ops*` <style> block. Keep the `Suspense` boundary wrapper.
Add the owner-gate BEFORE rendering team data, using the exact pattern from `src/app/projects/[id]/tasks/page.tsx`: pull `loading` from `useTeam()`; if `loading || !currentTeam` return null; if `currentTeam.role !== 'owner'` render the `.v2-tasks-locked` glass-card with `useTranslations('tasks')` `ownerLock.*` keys + its `<style>` block (copy that block too). Reuse the `command` translation namespace for headline/stats/sub as command/page.tsx does. The page-level section eyebrow stays `recgon-label`. (Server-side authorization is already enforced by `/api/teams/[id]/command` via `verifyTeamAccess` — this client gate is UX only.)
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && test -f src/app/admin/page.tsx && grep -q "DispatchFloor" src/app/admin/page.tsx && grep -q "role !== 'owner'" src/app/admin/page.tsx && npx tsc --noEmit 2>&1 | grep -i "admin/page" | head; echo "ok"</automated>
  </verify>
  <done>Owner sees DispatchFloor + stats at /admin (parity with /command); non-owner sees the locked card; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Add team calendar + ProjectRollup sections to /admin</name>
  <files>src/components/v2/admin/ProjectRollup.tsx, src/app/admin/page.tsx</files>
  <action>
First create `src/components/v2/admin/ProjectRollup.tsx` (`'use client'`). Props: `{ tasks: CommandTask[]; projects: CommandProject[] }` (import types from `@/components/v2/command/types`). Group `tasks` by `projectId`, join to `projects` by id. Per project derive three counts: `open` = status in `{assigned, accepted, in_progress, unassigned}`; `scheduled` = `scheduledDate != null`; `overdue` = `(overdueTier ?? 0) > 0`. Tasks with `projectId == null` are skipped (or grouped under a "No project" row — pick skip for simplicity). Render a `glass-card` section: a `recgon-label` head (reuse the `.v2-floor-sec` head pattern from DispatchFloor) and a list of rows, each a `next/link` `<Link href={\`/projects/${p.id}/tasks\`}>` showing project name + the three monospace counts (JetBrains Mono, tabular-nums; overdue earns `var(--danger)` only when > 0). Use `EmptyState` from `@/components/ui` when there are no projects. Self-contained `<style>` reusing the tokens/spacing from `command/page.tsx`. Rows are links, not buttons (no ActionIcon).
Then in `src/app/admin/page.tsx`, below DispatchFloor add two sections wrapped in the same `.v2-ops` flow: (1) a team calendar section rendering `<WeekCalendar />` with NO `projectId`, and (2) `<ProjectRollup tasks={data.tasks} projects={data.projects} />`. Each section gets a `recgon-label` eyebrow (add `nav`-free copy via the `command` namespace or inline literals consistent with existing labels). Only render them when `data && teamId` and owner.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && test -f src/components/v2/admin/ProjectRollup.tsx && grep -q "ProjectRollup" src/app/admin/page.tsx && grep -q "<WeekCalendar" src/app/admin/page.tsx && grep -q "projects/\${" src/components/v2/admin/ProjectRollup.tsx && npx tsc --noEmit 2>&1 | grep -i "admin" | head; echo "ok"</automated>
  </verify>
  <done>/admin shows a team-wide calendar (one lane per teammate, all projects) and a project rollup with rows linking to /projects/[id]/tasks; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 4: Nav — owner-only Admin tab + nav.admin i18n + /command redirect</name>
  <files>src/components/v2/TopNavV2.tsx, messages/en/nav.json, messages/tr/nav.json, src/app/command/page.tsx</files>
  <action>
In `TopNavV2.tsx`: split the static `NAV` array into a base list (home, tasks, issues, calendar, terminal — REMOVE the `/command` entry) and an owner-only list `[{ href: '/admin', key: 'admin', matchPrefix: true }]`. Build the rendered list as `isOwner ? [...base-with-admin-inserted] : base` — insert the Admin item where `/command` used to sit (after `issues`, before `calendar`) so its position reads naturally. `isOwner` is already computed (`currentTeam?.role === 'owner'`). Keep `/calendar` for everyone (personal). Nothing else in the nav changes.
Add `"admin"` key to `messages/en/nav.json` (`"admin": "Admin"`) and `messages/tr/nav.json` (`"admin": "Yönetim"`). Do NOT edit the legacy `messages/en.json`.
In `src/app/command/page.tsx`: replace the ENTIRE file body with a redirect so deep links survive — `import { redirect } from 'next/navigation';` and `export default function CommandPage() { redirect('/admin'); }`. Do not delete the file.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && grep -q "'/admin'" src/components/v2/TopNavV2.tsx && ! grep -q "key: 'command'" src/components/v2/TopNavV2.tsx && grep -q '"admin"' messages/en/nav.json && grep -q '"admin"' messages/tr/nav.json && grep -q "redirect('/admin')" src/app/command/page.tsx && npx tsc --noEmit 2>&1 | grep -iE "TopNavV2|command/page" | head; echo "ok"</automated>
  </verify>
  <done>Owners see an Admin tab (and no Operations/command tab); members don't; /command redirects to /admin; nav.admin localized in en + tr.</done>
</task>

<task type="auto">
  <name>Task 5: Slim Home to a personal cockpit</name>
  <files>src/app/page.tsx</files>
  <action>
Remove the team-level board + portfolio from Home (now on /admin). Delete the `HomeBoard` and `HomePortfolio` imports + their type imports, the `PortfolioSnapshot` helper, the `mergeTeamPulses`/team-pulse SWR fetch and `BoardTeamPulse` plumbing, and the `RefinedHome`/`ClassicHome` branching that renders board/portfolio. Keep: the `HomeFocus` section (personal focus), the first-run checklist, and the empty-hero state. Collapse to a single render path (drop the `home=refined|classic` variant switch) that shows `HomeFocus` + a compact "your work" pointer linking out to `/tasks` and `/calendar` (do NOT rebuild those views — link only, reuse existing copy/tokens). Remove now-unused imports, helpers (`mergeOverviewPayloads` can stay if still used by HomeFocus's overview fetch; trim what's dead), and `<style>` rules that only styled the removed sections. tsc + lint must be clean (no unused vars). Leave `HomeBoard.tsx`/`HomePortfolio.tsx` on disk (retired later, not deleted this pass).
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && ! grep -q "HomeBoard" src/app/page.tsx && ! grep -q "HomePortfolio" src/app/page.tsx && npx tsc --noEmit 2>&1 | grep -i "app/page" | head && npx eslint src/app/page.tsx 2>&1 | grep -i "error" | head; echo "ok"</automated>
  </verify>
  <done>Home renders only personal focus + first-run/empty states, links out to /tasks and /calendar; no team board/portfolio; tsc + eslint clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Tests — rollup count derivation + calendar URL builder</name>
  <files>src/__tests__/admin-projectRollup.test.ts, src/__tests__/admin-calendarUrl.test.ts</files>
  <behavior>
    - ProjectRollup count logic: given a fixed CommandTask[] across 2 projects + 1 null-projectId task, the derived per-project {open, scheduled, overdue} counts match expected; null-projectId tasks are excluded.
    - Calendar URL builder: with a projectId → URL contains `?projectId=<encoded>`; without → URL has no query string. (Extract the URL-building expression into a tiny exported pure helper, e.g. `buildCalendarUrl(teamId, projectId?)` in WeekCalendar or a sibling util, so it is unit-testable; refactor task 1's inline expression to call it.)
  </behavior>
  <action>
If ProjectRollup's grouping/counting is inline JSX, extract it into a small exported pure function (e.g. `deriveProjectRollup(tasks, projects)`) so it can be unit-tested without rendering. Likewise extract `buildCalendarUrl(teamId, projectId?)` (used by both task 1's fetch and the test). Write the two vitest files in `src/__tests__/` (globals enabled, `@` → `./src`). Cover: rollup counts (open/scheduled/overdue + null-projectId exclusion) and the URL builder with/without projectId. Also assert owner-gate behavior is testable at the helper level if cheap; otherwise the count + URL tests are sufficient.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx vitest run src/__tests__/admin-projectRollup.test.ts src/__tests__/admin-calendarUrl.test.ts 2>&1 | tail -15</automated>
  </verify>
  <done>Both test files pass; rollup counts and calendar URL builder are covered by unit tests.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/teams/[id]/command | A non-owner could navigate to /admin and trigger the same team data fetch the page makes. |
| browser → /api/teams/[id]/calendar | Team-wide (no projectId) fetch exposes all teammates' tasks. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rdo-01 | Information disclosure | /admin client owner-gate | mitigate | Client gate (`role !== 'owner'` → locked card) is UX only; real enforcement is server-side `verifyTeamAccess` on `/api/teams/[id]/command` (returns 403 for non-members) and the payload's own `role` field. No new endpoint added. |
| T-rdo-02 | Information disclosure | team-wide calendar | accept | `/api/teams/[id]/calendar` already strips reasoning/personalized columns via `sanitizeTaskForClient` (CR-01) before returning; team members are authorized to see team task scheduling. No new exposure beyond existing /command surface. |
| T-rdo-03 | Elevation of privilege | /command → /admin redirect | accept | Redirect is a client/route concern; both pages enforce owner UX gate + server authz. A deep link to /command lands on the same gated /admin. |
</threat_model>

<verification>
`npm run dev`, then:
- **As owner** — nav shows Admin tab (no Operations); `/admin` shows stats row, team board with working reassign/reschedule/approve, decisions stack, a team calendar with one lane per member spanning all projects (drag a card across days → `/schedule` POST → toast), project rollup rows linking to `/projects/[id]/tasks`. `/command` redirects to `/admin`. Home shows only personal focus + your-work pointers.
- **As member/viewer** — no Admin tab; `/admin` shows the locked glass-card; Home is still personal.
- **No regression** — `/projects/[id]/tasks` calendar still scopes to its own project.
- `npx tsc --noEmit` clean; `npm run test` green; `npm run build` succeeds.
</verification>

<success_criteria>
- `/admin` exists, owner-gated, composing DispatchFloor + team WeekCalendar + ProjectRollup.
- Owner-only Admin nav tab; `nav.admin` localized (en + tr); `/command` redirects to `/admin`.
- Home slimmed to personal cockpit (no team board/portfolio).
- WeekCalendar `projectId` optional; project tasks page unchanged behavior.
- Rollup-count + calendar-URL unit tests pass; tsc + lint + build clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260626-rdo-owner-admin-page-team-mission-control/260626-rdo-SUMMARY.md`
</output>
