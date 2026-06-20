---
quick_id: 260620-wnk
title: Redesign TeamSwitcher workspace-scope dropdown to match Recgon design system
status: in-progress
date: 2026-06-20
---

# Quick Task 260620-wnk: Redesign TeamSwitcher dropdown

## Problem (why it feels "vibe-coded")

Forensic read of `src/components/TeamSwitcher.tsx` + `src/app/globals.css` found three concrete defects, not just taste:

1. **Translucent panel bleed-through.** The dark menu background resolves through legacy
   `.team-switcher-menu { background: var(--modal-bg) !important }` (≈94% opaque) while the
   inline `.team-filter-menu` tries `color-mix(... var(--bg-card) ...)` — and `--bg-card` is
   only defined inside `WorkspaceShell` (at 55% opacity). Net result: the panel is not fully
   opaque, so bright page content (the "Pixy" chip, project-meta) ghosts through the blur and
   reads as a broken/disabled row. This is the "grayed-out Pixy" the user saw. Header shows
   `1/1`, confirming there is only ONE real team — "Pixy" is bleed-through, not a list item.
2. **Two style systems fighting.** JSX applies BOTH legacy `.team-switcher-*` (globals, full of
   `!important`) and inline `.team-filter-*`. They conflict on background, hover, animation.
3. **Generic choices.** Boxed chip-card rows, marketing copy "Choose workspace scope", and a
   `↗` arrow on "Manage Teams" — all on the project's no-vibe-coded-UI banned list.

## Approach

Make the component **fully self-contained** and lean on real Recgon signature devices.

- **Drop all 4 legacy `team-switcher-*` class names** from the JSX. Safe: the global
  `:focus-visible` rule (globals.css ~1715) excluded those classes because they self-styled
  focus; without them the rows/link inherit the global signature focus-ring — good a11y, on-brand.
- **Solid opaque panel** (dark `#18181b` = opaque form of `--modal-bg`; light `#fff`) +
  `--shadow-deep` + a signature top-rim hairline (`inset 0 1px 0 rgba(--signature-rgb,.14)`).
  Kills bleed-through entirely. No stacked glass (per design rule).
- **recgon-label header**: single tight row — mono uppercase `// TEAM FILTER` eyebrow (the real
  `.recgon-label` `// ` device) on the left + mono `1/1` tally on the right. Remove the
  "Choose workspace scope" marketing heading (plain-copy rule; user flagged it).
- **De-box the rows** → flat list items using the signature **left-edge bar**
  (`inset 2px 0 0 var(--signature)`) on hover AND active, with a subtle signature tint and a
  2px `translateX` nudge on hover. This is the same device globals use for `.team-switcher-team-row`
  hover — now applied to the selected state too, so selection reads as a list item, not a chip.
- **Refine** the check (sharper square, signature fill + glow when active), avatar (mono initial,
  signature tint when active), and role (mono, faint, lowercase).
- **Footer**: "Manage teams" as a full-width footer action with a top hairline + signature
  hover/left-bar. **Remove the `↗` arrow** (banned "open →" pattern).

## Tasks

### Task 1 — Rewrite TeamSwitcher markup + styles
- **files:** `src/components/TeamSwitcher.tsx`
- **action:** Remove legacy `team-switcher-trigger|menu|team-row|manage-link` class names;
  collapse header to eyebrow + tally (drop `chooseTeams`); drop the manage-link arrow span;
  rewrite the inline `<style>` block to a self-contained, token-driven system per Approach.
- **verify:** `npm run lint`; visually confirm opaque panel, no bleed-through, left-bar
  hover/active, mono `// TEAM FILTER` header, no arrow.
- **done:** Panel is fully opaque in dark mode; rows read as a clean list with the signature
  left-edge bar; header is a terse mono label; no `↗`; lint clean.

## must_haves
- truths:
  - Dark-mode panel is fully opaque (no page bleed-through).
  - No JSX element carries a legacy `team-switcher-*` class.
  - Selected + hovered rows use the `inset 2px 0 0 var(--signature)` left-edge bar.
- artifacts:
  - `src/components/TeamSwitcher.tsx` (rewritten markup + styles)
- key_links:
  - `src/app/globals.css` (token + recgon-label source of truth — unchanged)
