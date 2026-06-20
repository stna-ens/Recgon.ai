---
quick_id: 260621-tpt
title: Fold Projects into the team dropdown as a collapsible team→projects tree
status: complete
date: 2026-06-21
files_modified:
  - src/components/TeamSwitcher.tsx
  - src/components/v2/projects/useTeamPortfolio.ts
  - src/app/projects/page.tsx
  - src/components/v2/TopNavV2.tsx
  - messages/en/teams.json
  - messages/tr/teams.json
---

# Quick Task 260621-tpt — Projects inside the team dropdown (collapsible tree)

## What changed

The standalone **Projects** top-nav tab is gone; each team's projects now live
**under the team** inside the `TeamSwitcher` dropdown, as a collapsible tree.
Follow-on to `260620-wnk` (the dropdown restyle).

### Interaction (standard tree pattern — Gmail/Slack/file explorer)
- **Left square checkbox** on each team row → toggles that team in the app-wide
  filter (`selectedTeamIds`). On-brand: hairline `--rule-strong` border, signature
  fill + white check when on (`.tf-box`) — not a browser checkbox.
- **Right disclosure chevron** (and clicking the team name/avatar) → expand/collapse
  that team's projects. Independent of the filter. State persisted per team in
  `localStorage['recgon_expanded_teams']` (default: selected teams open).
- **Project sub-row** → flat, indented, hairline; mono name + a colored **pulse dot**
  + lowercase pulse word; whole row links to `/projects/[id]`. No pills/chips
  (keeps the calendar-row aesthetic from 260620-wnk; reuses the `PortfolioRows`
  pulse→colour mapping as a dot, not a 92px pill).
- **Panel opens on hover** (120ms intent delay) and on click; a click *pins* it open
  so it doesn't close when the mouse drifts. Still closes on outside-click / Escape /
  mouse-leave (180ms grace, which also bridges the 9px trigger→menu gap). Touch uses
  the click path.
- **Footer**: two equal mono links — `ALL PROJECTS` (→ `/projects`) and `MANAGE TEAMS`.

### Data — shared, lazy, no extra cost
Extracted the Projects page's cross-team aggregation into a reusable hook
**`useTeamPortfolio(enabled)`** + a `groupByTeam()` helper. It pulls `/api/overview`
(pulse/triage) + `/api/projects` (records) per team, dedupes, and merges live GitHub
update flags — exactly what the page did inline. Both the page and the dropdown now
share one SWR cache (key `['portfolio', teamIds, userId]`). The dropdown passes
`enabled = false` until first opened, so the topnav never fetches the portfolio on
page load. No LLM calls; endpoints already cache 30s + SWR.

### Kept working (route lives on, only the tab was removed)
`/projects` + `/projects/[id]` still resolve. Untouched and still valid: post-delete
redirects (`projects/[id]`, `team/page`), the first-run "create project" CTA
(`FirstRunChecklist`), the terminal `/projects` command, and the command-palette
"Projects" entry.

## Verification
- `npx tsc --noEmit` → exit 0 (clean after the page refactor + new hook types).
- `npx eslint` on all changed files → 0 errors. The 3 warnings are the existing
  `react-hooks/set-state-in-effect` pattern (same one `TopNavV2` already uses for
  client-only init); here it hydrates `localStorage` after mount, which is the
  SSR-safe idiom.
- Both `messages/{en,tr}/teams.json` parse; added `switcher.allProjects`,
  `noProjects`, `loadingProjects`, `toggleFilterAria`, `toggleProjectsAria`.
- Visual confirmation in the running app left to the user (screenshots-not-Playwright
  preference), dark mode.

## Notes / follow-ups
- A team with zero projects: the chevron hides once the load confirms it's empty;
  if expanded mid-load it shows a faint "loading…/no projects" hint.
- `switcher.chooseTeams` remains an unused key (harmless; from 260620-wnk).
