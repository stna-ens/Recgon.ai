---
quick_id: 260620-wnk
title: Redesign TeamSwitcher workspace-scope dropdown to match Recgon design system
status: complete
date: 2026-06-20
commit: f4afead
files_modified:
  - src/components/TeamSwitcher.tsx
---

# Quick Task 260620-wnk: Redesign TeamSwitcher dropdown — Summary

## What changed

Rebuilt the team-filter dropdown in `src/components/TeamSwitcher.tsx` so it reads as
a Recgon surface instead of generic SaaS UI. The root cause of the "vibe-coded" feel
turned out to be a real rendering defect, not only taste.

### Root cause (the "grayed-out Pixy row")
The dark panel had no solid background: inline styles referenced `var(--bg-card)`
(only defined inside `WorkspaceShell`, at 55% opacity) while a legacy
`.team-switcher-menu { background: var(--modal-bg) !important }` left it ~94% opaque.
The translucent panel let bright page content (the "Pixy" team chip, project-meta)
ghost through the blur — which looked like a broken/disabled second row. The header's
`1/1` confirmed there was only one real team; "Pixy" was bleed-through.

### Fixes
1. **Self-contained styles** — removed all four legacy `team-switcher-*` class names
   from the JSX (`trigger`, `menu`, `team-row`, `manage-link`). The inline
   `team-filter-*` styles are now the single source of truth; no more dual-system
   `!important` conflicts. Keyboard focus falls back to the global signature
   focus-ring (the classes were originally excluded from it precisely so they could
   self-style focus — now unnecessary).
2. **Solid panel** — `#18181b` (dark, the opaque form of `--modal-bg`) / `#fff`
   (light), `--shadow-deep`, and a signature top-rim hairline. No stacked glass.
   Bleed-through eliminated.
3. **recgon-label header** — single tight row: mono uppercase `// TEAM FILTER`
   (the real `// ` device) + mono `1/1` tally. Dropped the "Choose workspace scope"
   marketing heading (plain-copy rule; user flagged it).
4. **De-boxed rows** — flat list items using the signature left-edge bar
   (`inset 2px 0 0 var(--signature)`) on hover AND active, plus a subtle signature
   tint and a 2px `translateX` nudge on hover. Selection now reads as a selected list
   item, not a chip-card.
5. **Refinements** — sharper check (signature fill + glow when active), avatar tints
   to signature when active, role rendered in mono/faint/lowercase. The "Manage teams"
   footer lost its `↗` arrow (a banned "open →" pattern) and gained the same
   signature hover/left-bar.

## Verification
- `npx eslint src/components/TeamSwitcher.tsx` → clean (exit 0).
- Theme-class assumption confirmed: `next-themes` runs with `attribute="class"`
  (layout.tsx:78), so `html.light`/`html.dark` are set explicitly — the dark-base +
  `html.light`-override structure (identical to the original) is correct.
- No i18n keys removed (only `chooseTeams` is now unused — left in place, harmless).

## Iteration 2 (commit dea6bf5) — after user feedback "still looks vibe-coded"

v1 fixed the bleed-through but the row body was still generic against the app's
sharp monospace/terminal aesthetic: a rounded form-checkbox, a soft rounded-square
avatar, lowercase "owner", title-case "Manage Teams" — and the browser focus-ring
fell through on click, drawing the exact pink boxed-chip outline the redesign was
meant to remove.

Fix: stop hand-rolling and **reuse the app's own identity primitives** so the row is
made of the same parts as the calendar swimlane (`SwimLane.tsx`):
- Render the shared `<TeammateAvatar>` (circle, deterministic color, mono initials);
  `isIdle={!active}` dims unselected teams — the app's own selected/idle mechanism.
- Stack `MONO-UPPERCASE` name + `MONO-UPPERCASE` role, matching `.cal-lane-name` /
  `.cal-lane-title` (so "owner" → "OWNER", "ST&A" renders in JetBrains Mono).
- Remove the checkbox entirely; selection reads through avatar + signature left-bar.
- Override the row `:focus-visible` with the left-bar (`!important`) so a clicked row
  never shows the pink focus-ring box.
- "Manage Teams" footer → mono uppercase, like the nav links.

Lesson: matching design *tokens* wasn't enough — had to reuse the actual shared
*components* and conform to the app's dominant mono/terminal visual language.

## Notes / follow-ups
- `switcher.chooseTeams` is now an unused key in `messages/{en,tr}/teams.json`. Left
  as-is to avoid unrelated churn; safe to prune later.
- Visual confirmation in the running app is best verified by the user (per the
  screenshots-not-Playwright preference).
