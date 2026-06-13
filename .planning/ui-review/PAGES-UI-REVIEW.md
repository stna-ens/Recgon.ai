# Recgon — Project / Team / Data Pages UI Review

**Audited:** 2026-06-13
**Baseline:** Abstract 6-pillar standards + house design system (glass-card, .recgon-label, JetBrains Mono, signature pink #c2357a light / #f0b8d0 dark as sole accent, no emojis, no stacked glass, plain config copy)
**Method:** Code-only audit (pages are auth-gated; per project policy no Playwright login automation). ~18k lines across 40+ files read/grepped.
**Scope notes:** `src/app/marketing`, `src/app/analytics`, `src/app/account`, `src/app/teams/[id]/page.tsx` do not exist (marketing/analytics live under `projects/[id]/`; profile is `teams/[id]/me/`). Audited what exists.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Fully i18n'd, plain, no metaphors/emojis — but hardcoded `toLocaleLowerCase('tr')` corrupts names for EN users ("Insight" → "ınsight") |
| 2. Visuals | 3/4 | Strong editorial identity and hierarchy; 12-color rainbow avatar palette is alien to the single-accent system |
| 3. Color | 2/4 | Danger red exists in THREE different values across pages; hardcoded traffic-light hexes; export page uses the deprecated pastel pink #e8a8c4 |
| 4. Typography | 2/4 | 25 distinct px font sizes incl. six half-pixel sizes (10.5/12.5/13.5…) and 9–9.5px text; rem vs px mixed across pages |
| 5. Spacing | 3/4 | Per-page rhythm is tight, but 18 distinct border radii; inputs are 12px radius on teams vs 8px on projects; primary buttons pill vs square on adjacent pages |
| 6. Experience Design | 3/4 | Analytics/marketing/projects-list are exemplary (Skeleton + designed empty/error). But RecgonAdminPanel and team admin silently swallow load failures; project detail shows "not found" for network errors |

**Overall: 16/24**

What passes cleanly: no emojis anywhere (✓ › × ↑ ↓ glyphs only); no stacked glass (`is-static` modifiers used correctly); `glass-card`/`recgon-label`/mono tokens adopted in 24–31 files; no native `confirm()`/`alert()`; destructive actions all have inline-confirm or modal; icon-only buttons consistently carry `aria-label`; global `:focus-visible` fallback (globals.css:2940) covers unstyled buttons; copy is plain-config style with zero metaphor drift.

---

## Top 3 Priority Fixes

1. **Unify danger red (P-02)** — three different reds read as three different products — define `--danger-rgb` and replace all hardcoded rgba reds.
2. **Silent failure states (P-04, P-05, P-11)** — failed loads render empty consoles or "not found"; users can't distinguish outage from deletion — add designed error states with retry.
3. **Kill the rainbow avatar palette duplication (P-01)** — 12 off-palette hexes pasted into two files; either curate to a signature-adjacent set or extract one shared constant.

---

## Findings

Severity: **high** = breaks trust/correctness or violates a hard design rule · **med** = visible quality gap · **low** = polish.
Fix type: **auto** = mechanically safe for a fix pipeline · **design** = needs a human design decision first.

| ID | Sev | Location | What's wrong | Concrete fix | Fix type |
|----|-----|----------|--------------|--------------|----------|
| P-01 | high | `src/app/teams/page.tsx:9-13`, `src/app/team/page.tsx:46-50` | `AVATAR_COLORS` — 12 off-palette rainbow hexes (#6366f1, #22c55e, …) duplicated verbatim in two files. Violates "signature pink only accent"; identity colors may be allowed, but the set is uncurated and the duplication guarantees drift. | Extract to one shared constant (e.g. `src/lib/avatarColors.ts`); curate the set against the house palette (muted, equal-luminance tones). | design |
| P-02 | high | `src/app/teams/page.tsx:236-237` (rgba(255,59,48)), `src/app/teams/setup/page.tsx:235-236` (rgba(239,68,68)), `src/app/team/page.tsx:1278-1279` (rgba(248,113,113)), `src/app/projects/[id]/settings/page.tsx:1538-1541` (rgba(255,59,48)) | Danger red is three different colors depending on page — iOS red, Tailwind red-500, and red-400. | Add `--danger-rgb` next to `--signature-rgb` in globals.css; replace every hardcoded red rgba with `rgba(var(--danger-rgb), …)`. | auto |
| P-03 | high | `src/app/projects/[id]/page.tsx:853` | Inline traffic-light hexes `#10b981 / #f59e0b / #ef4444` for the acted-on completion ring instead of `var(--success)/var(--warning)/var(--danger)`. | `const tone = pct >= 60 ? 'var(--success)' : pct >= 30 ? 'var(--warning)' : 'var(--danger)';` | auto |
| P-04 | high | `src/components/recgon/RecgonAdminPanel.tsx:172-185` | `refresh()` has try/finally but no catch — if the three fetches reject, loading clears, the rejection goes unhandled, and the dispatch console renders empty with zero feedback. | Add catch → `setLoadError(true)` and render a designed error block with a Retry button (mirror `AnalyticsError`). | auto |
| P-05 | high | `src/app/projects/[id]/page.tsx:266-274` | `projectError` (network/500) falls through to the `!project` branch and shows the "not found" copy — an outage looks like a deleted project. | Branch on `projectError` first: render an error card with retry (`mutateProject()`); keep "not found" only for 404. | auto |
| P-06 | med | `src/app/projects/[id]/export/page.tsx:73,82` | Export brand color is `#e8a8c4` — the deprecated pastel signature. Dark-fixed export should use `#f0b8d0` (dark-mode signature). | Replace both occurrences with `#f0b8d0`. | auto |
| P-07 | med | `src/app/projects/[id]/page.tsx:524,724` | `.toLocaleLowerCase('tr')` hardcodes Turkish casing for ALL locales — Turkish dotless-i rules turn "Insight" into "ınsight" for English users. | Use CSS `text-transform: lowercase` on `.v2-pov-name-text`/`.v2-inv-chip` (locale-aware by `lang` attr), or pass the active locale. | auto |
| P-08 | med | `src/app/teams/page.tsx:592-613` | No loading guard from TeamProvider — `teams.length === 0` flashes the empty state during initial load; and the empty state is hand-rolled (`v2t-empty`) instead of `ui/EmptyState`. | Gate on a provider loading flag (render Skeleton rows); replace `v2t-empty` markup with `<EmptyState icon title description action>`. | auto |
| P-09 | med | `src/app/teams/page.tsx:196-229,514-535` | Create-team form hand-rolls `v2t-input`/`v2t-create-submit` instead of `ui/FormField` + `ui/Button` (polish-pass rule: shared primitives for all UI); focus shadow uses `!important` (line 212). | Swap to `ui-input` + `<Button variant="primary" loading={loading}>`; drop the `!important`. | auto |
| P-10 | med | `src/app/team/page.tsx:599` vs `:903` | Same page mixes two input systems: name editor uses custom `rec-input`, invite email uses shared `ui-input`. | Convert `rec-input` instances to `ui-input` (keep the textarea variant via `ui-input` styling). | auto |
| P-11 | med | `src/app/team/page.tsx:230-254` | `refresh()` swallows all fetch errors (`catch { /* swallowed */ }`) — hero stats render "—" and roster renders the "none loaded" empty copy on failure, indistinguishable from an actually empty team. | On catch, `addToast` + set an error flag; render a retry strip instead of the empty copy. | auto |
| P-12 | med | `src/app/team/page.tsx:777-786`, `src/app/projects/[id]/settings/page.tsx:931-978`, `src/app/projects/[id]/page.tsx:254-264` | Three hand-rolled skeleton implementations (`rec-roster-skel`, `SpecSkeleton`, `v2-skel-line`) while `PortfolioRows`/`FeaturedNeedsAttention`/`AnalyticsSkeleton` correctly use `ui/Skeleton`. | Replace each with `<Skeleton width height radius>` compositions. | auto |
| P-13 | med | `src/app/projects/page.tsx:338-373` | Scope strip uses `role="tablist"`/`role="tab"`/`aria-selected` but has no arrow-key navigation or roving tabindex — broken ARIA contract. CLAUDE.md mandates Radix primitives for interactive UI. | Either drop the tab roles (these are filters — `role="group"` + `aria-pressed` is honest) or wrap in `@radix-ui/react-tabs`. | auto |
| P-14 | med | `src/app/projects/page.tsx:716-723` | `.v2-spinner` border is `rgba(255,255,255,0.30)` + white top — invisible in light mode inside the ghost upload button (line 404). | Use `currentColor`: `border-color: color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor;` | auto |
| P-15 | med | `src/app/teams/page.tsx:144` (999px pill) vs `src/app/projects/page.tsx:684` (8px) vs `src/app/projects/[id]/settings/page.tsx:1515` (8px) vs `ui/Button` | Primary button geometry differs between adjacent nav pages — pill on teams index, 8px square mono-uppercase on projects/settings, plus the shared `ui-btn`. Three-plus button systems in scope. | Pick one primary-button grammar (recommend `ui/Button`); migrate `v2t-new-btn`, `v2-btn`, `v2-pset-btn` call sites. | design |
| P-16 | med | scope-wide (grep: 25 distinct `font-size` px values) | Type scale sprawl: 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17… incl. 8 uses of 9px and 16 of 9.5px (below the 10px legibility floor for data UI). | Define a token scale (10/11/12/13/14/16/20/28 + hero clamp); round half-pixel sizes to it; raise 9–9.5px labels to 10px. | design |
| P-17 | med | scope-wide (grep: 18 distinct `border-radius` values, 1–24px + 99/999) | Radius sprawl; same-purpose elements differ: inputs 12px (`teams/page.tsx:201`) vs 8px (`projects/page.tsx:820`); cards 18px vs 10px vs 8px. | Token scale: `--r-sm: 4px, --r-md: 8px, --r-lg: 12px, 999px pills, 50% circles`; map outliers (1,2,3,5,7,9,14,16,18,24) onto it. | design |
| P-18 | med | `src/components/MarketingPreview.tsx:115,247,250` | Caption "more"/"less" expanders are clickable `<span>`s — no role, no tabindex, not keyboard reachable. | Replace with `<button type="button" className="ui-unbutton">` (globals.css already ships `.ui-unbutton` for exactly this). | auto |
| P-19 | low | `src/components/MarketingPreview.tsx:325,334` | Uses legacy `.btn .btn-primary` classes — yet another button system, styling depends on legacy global CSS surviving. | Swap to `ui/Button` (or `v2-btn` if modal context requires). | auto |
| P-20 | low | `src/app/projects/[id]/settings/page.tsx:1657,1661` | Hardcoded light-mode text hexes `#6e6b76` / `#1d1d1f` instead of `--txt-muted`/`--txt-pure` (the light theme already redefines those tokens). | Replace with the tokens; delete the overrides if redundant. | auto |
| P-21 | low | `src/app/team/page.tsx:168` | `<Suspense fallback={null}>` — blank frame on first paint of a major page. | Render a minimal hero skeleton as fallback. | auto |
| P-22 | low | `src/app/team/page.tsx:940` | Pending-invites list renders `null` while loading; members tab gets skeleton rows — inconsistent loading treatment within one page. | Add 2 skeleton rows matching `rec-pending-item` (with `ui/Skeleton` per P-12). | auto |
| P-23 | low | `src/app/teams/invite/[token]/page.tsx:82` | Loading state is a bare muted paragraph; acceptable for a leaf page but off-pattern. Error states (`role="alert"`) are good. | Optional: swap to a small Skeleton block. | auto |
| P-24 | low | `src/app/teams/setup/page.tsx:189-242`, `src/app/teams/invite/[token]/page.tsx:133-195` | These two pages use rem font sizes (0.85–1.5rem) while the rest of the scope is px-based — two sizing systems. | Convert to the px token scale chosen in P-16. | auto |
| P-25 | low | `src/app/projects/page.tsx:298` (20px mono `$` title) vs `src/app/teams/page.tsx:115-122` (32px Inter + `//` eyebrow) vs `src/app/team/page.tsx:1106-1116` (clamp 40–84px mono lowercase hero) vs `teams/[id]/me/page.tsx:106-112` (30px Inter) | Four different page-header grammars across sibling nav destinations; `ui/PageHeader` exists but is unused in scope. | Decide: heroes (team, profile) may stay editorial, but list pages (projects, teams) should share one header pattern — adopt `ui/PageHeader` or the `$`-prompt mono style for both. | design |
| P-26 | low | `src/app/projects/page.tsx:153-163`, `src/app/projects/[id]/page.tsx:240-250` | Manual document-level Escape handlers duplicate `ui/Modal`'s built-in dismissal (Radix) — double-handling risk if a nested overlay opens. | Delete both effects; Modal already closes on Esc. | auto |
| P-27 | low | `src/app/projects/[id]/analytics/page.tsx:312-317` | Connect-vs-error screen decided by substring-matching the error message (`error.includes('property')`) — breaks the moment API copy changes (or is translated). | Return a machine-readable `code` field from `/api/analytics/data`; branch on it. | design |

---

## Per-page state-coverage matrix

| Surface | Loading | Empty | Error | Verdict |
|---------|---------|-------|-------|---------|
| projects (list) | shared Skeleton via PortfolioRows/Featured | shared EmptyState + dual CTA | toast on SWR error | Good (P-13, P-14 only) |
| projects/[id] (overview) | hand-rolled skel (P-12) | designed "no analysis" card | conflated with not-found (P-05) | Needs P-05 |
| projects/[id]/settings | custom SpecSkeleton (P-12) | n/a | n/a (form-level) | OK |
| projects/[id]/analytics | AnalyticsSkeleton | AnalyticsConnect + no-insight card | AnalyticsError w/ retry + disconnect | Exemplary |
| projects/[id]/marketing | shared Skeleton | shared EmptyState | shared EmptyState + retry | Exemplary |
| projects/[id]/export | print-style static | conditional sections | n/a | OK (P-06) |
| team (admin) | skeleton roster, "—" stats | designed per-tab | swallowed (P-11) | Needs P-11 |
| team dispatcher (RecgonAdminPanel) | boot dots | designed | none (P-04) | Needs P-04 |
| teams (index) | none (P-08) | hand-rolled (P-08) | inline error + toast | Needs P-08 |
| teams/setup | Button loading | n/a | role=alert block | Good |
| teams/invite/[token] | text (P-23) | n/a | role=alert | Good |
| teams/[id]/me (+ InferredFromGitHub) | server-rendered | 6 diagnostic-branched empty states | rate-limit aware retry | Exemplary |

---

## Files Audited

Full read: `src/app/teams/page.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/team/page.tsx` (1–1380), `src/app/projects/[id]/analytics/page.tsx`, `src/app/teams/invite/[token]/page.tsx`, `src/app/teams/setup/page.tsx`, `src/app/teams/[id]/me/page.tsx`, `src/components/recgon/RecgonAdminPanel.tsx` (165–240 + grep).
Targeted read/grep: `projects/[id]/settings/page.tsx`, `projects/[id]/export/page.tsx`, `projects/[id]/marketing/page.tsx`, `overview.css`, `teams/[id]/me/{ProfilePageClient,ProfileForm,ProfilePreview,InferredFromGitHub,GithubConsentSection,ReviewBanner}.tsx`, `components/MarketingPreview.tsx`, `components/v2/projects/**` (PortfolioRows, FeaturedNeedsAttention, analytics/*, marketing/*, overview/*), `components/ui/*`, `globals.css` (focus-visible system).
