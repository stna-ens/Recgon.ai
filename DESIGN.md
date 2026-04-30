# Design System: Recgon — Vintage Editorial PM Workspace
**Version:** 2026.04 (redesign)
**Project:** Recgon — the AI product manager for solo founders

This file is the source of truth for Recgon's visual language. Every page, component, and 3D scene must trace back to a rule below. When in doubt, choose the option that feels more like a **printed product-management almanac** than a SaaS dashboard.

---

## 1. Visual Theme & Atmosphere

Recgon should feel like a **leather-bound product manager's notebook bound into a high-precision instrument panel**. Think Mercury bank dressed in 1970s editorial paper stock, intersected with the calm geometry of Linear and the depth of Vercel's hero scenes.

**Tone words:** Considered. Quiet. Assertive. Tactile. Editorial. Archival. Slightly nostalgic, never costume-y.

**Atmospheric anchors:**
- Warm cream paper as the default surface, not cool white.
- Ink-deep typography that breathes — generous leading, ragged-right justification by default, never centered body copy.
- **Stamps and chips** in JetBrains Mono read like archive labels (`PM_001`, `PROJECT_HEALTH`, `Q3_2026`).
- One **3D artifact per screen, max** — used as a centerpiece, never as decoration.
- Real **data visualization** displaces wall-of-text whenever a number, ranking, or trend is being communicated.

**Density:** Medium-high. Recgon is a workspace, not a marketing page. Inside the app, prioritize information density over whitespace; on the landing page, invert.

---

## 2. Color Palette & Roles

All colors are tokenized in CSS. The palette is **two warm neutrals + signature pink + three editorial accents**. Do not introduce a fourth accent without explicit approval.

### Light theme — "Cream Almanac"
| Token | Name | Hex | Role |
|---|---|---|---|
| `--paper` | Cream Almanac | `#faf6ef` | Default page background — warm paper, not cool gray |
| `--paper-deep` | Kraft Fold | `#f0e9dc` | Recessed surfaces, gutters, sidebars |
| `--paper-card` | Stationery White | `#fefcf8` | Card surfaces — slightly brighter than paper |
| `--ink` | Pressed Ink | `#1a1614` | Body text, headings, hard edges |
| `--ink-soft` | Faded Ink | `#3d342f` | Secondary text |
| `--ink-quiet` | Pencil Gray | `#857a72` | Tertiary text, captions, timestamps |
| `--rule` | Ledger Rule | `#d4cabb` | Hairline dividers, table rules |
| `--signature` | Signature Pink | `#e8a8c4` | Primary brand accent — sparingly, like a wax seal |
| `--ochre` | Library Ochre | `#c69147` | Warning, highlight, KPI emphasis |
| `--sage` | Map Sage | `#7d8a6e` | Healthy / positive metrics, growth |
| `--rust` | Errata Rust | `#a04a32` | Critical alerts, blockers, declines |

### Dark theme — "Inkwell at Midnight"
| Token | Name | Hex | Role |
|---|---|---|---|
| `--paper` | Inkwell | `#161311` | Background — warm dark, never pure black |
| `--paper-deep` | Cellar | `#0f0d0c` | Recessed surfaces |
| `--paper-card` | Lamplight | `#1f1a17` | Card surfaces |
| `--ink` | Bone | `#f0ede5` | Body text |
| `--ink-soft` | Vellum | `#c8c2b6` | Secondary text |
| `--ink-quiet` | Smoke | `#7f786d` | Tertiary text |
| `--rule` | Ash Line | `#332e29` | Dividers |
| `--signature` | Rose Gilt | `#f0b8d0` | Accent (slightly brighter for contrast) |
| `--ochre` | Brass | `#d4a558` | Warning |
| `--sage` | Moss | `#9ba88c` | Positive |
| `--rust` | Ember | `#c0654a` | Critical |

**Rules:**
- Never use pure black (`#000`) or pure white (`#fff`) — both feel sterile and break the paper metaphor.
- Signature pink appears **once per fold** (above-the-screen view). It marks the most important interactive thing on the page. Stamps, the brand mark, the primary CTA accent, and a single hero pull-quote may use it; nothing else.
- Ochre, sage, rust are **data colors** — they tell users what a number *means*. Don't use them decoratively.
- Hairlines (`--rule`) are 1px and always present at section breaks. Replaces card shadows in dense layouts.

---

## 3. Typography Rules

Three families. No exceptions.

### Stack
| Role | Family | Weights | Usage |
|---|---|---|---|
| **Display** | Fraunces (variable) | 300, 400, 500, italic | Page titles, hero headlines, editorial pull-quotes, project names on detail pages |
| **UI Body** | Inter | 400, 500, 600 | All UI body, buttons, form fields, navigation, dashboard copy |
| **Label / Stamp** | JetBrains Mono | 400, 500 | Stamps, KPI labels, code, IDs, timestamps, terminal-style accents |

Fraunces should be tuned with `font-variation-settings: "SOFT" 100, "WONK" 1, "opsz" 144`. The wonk + soft give it the slightly *off*, slightly *vintage* personality that separates Recgon from generic editorial sites.

### Scale (rem-based, generous)
| Token | Size | Line | Used for |
|---|---|---|---|
| `--t-hero` | 4.5rem (72px) | 1.02 | Hero on landing only |
| `--t-display` | 2.75rem (44px) | 1.08 | Page H1 |
| `--t-h2` | 1.875rem (30px) | 1.2 | Section heads |
| `--t-h3` | 1.25rem (20px) | 1.35 | Card heads |
| `--t-body` | 0.9375rem (15px) | 1.55 | Default body |
| `--t-small` | 0.8125rem (13px) | 1.5 | Captions, helper |
| `--t-stamp` | 0.6875rem (11px) | 1.0 | All caps mono labels, +letter-spacing 0.12em |

### Setting rules
- **Body copy is never centered** (except inside a single column of an editorial pull-quote).
- **Headings sit on a baseline grid of 8px.** Display (Fraunces) headings get optical-size scaling and `text-wrap: balance`.
- **Stamps** (`.recgon-label`, `.stamp`) are always uppercase, JetBrains Mono, 11px, with 0.12em letter-spacing, and **never sit alone** — they always anchor a value or content beside them.
- Never use Inter italic. Italics belong to Fraunces — they're a feature of the editorial voice.

---

## 4. Surface System

Surfaces are the visual unit of the app. There are exactly **four** surface types, plus a 3D layer.

### `.paper-card` — the default container
- Background: `--paper-card`
- Border: 1px solid `--rule`
- Radius: 14px
- Shadow: none by default; on hover, a single `0 12px 30px -16px rgba(20,20,20,0.18)` to lift gently
- Corners: subtle, not pill-rounded. Rectangular shapes feel more like book pages.

### `.glass-card` — *legacy, deprecated.* Replace with `.paper-card` page-by-page during the redesign.

### `.ink-rule` — the editorial divider
- Single 1px line in `--rule`, always with breathing room above and below (24–48px). Replaces decorative card shadows in dense regions.

### `.vintage-chip` — the data badge
- Background: tinted `--paper-deep` (or theme color tinted at 8% alpha)
- Border: 1px solid `--rule`
- Padding: 4px 10px
- Type: JetBrains Mono 11px uppercase
- Use to tag status, source, project, time. Replaces colored "tags" of generic dashboards.

### `.label-stamp` — the wax-seal accent
- Used at most twice per page.
- Tilted 3° (always the same direction within a page), JetBrains Mono 11px, `--signature` color, with a 1px dotted border around it.
- Marks editorial moments: "Editor's note," "Mentor says," "PM brief."

### 3D layer
- Always `<canvas>` from `@react-three/fiber`, lazy-loaded with `next/dynamic`.
- Never blocks LCP — the 3D scene must mount *after* the hero copy is interactive.
- Prefers a fixed/contained box, not full-bleed, to behave like an artifact set into the page.

---

## 5. 3D Usage Rules

3D is a tool to communicate **the product** (a PM that orbits multiple disciplines) and to add tactile depth — not for theatrics.

**Approved 3D moments (one per moment):**
1. **Landing hero**: a slow-rotating "Product Compass" — a centered orb (the product) with orbiting glass shards labeled with PM disciplines (analytics, feedback, marketing, roadmap). Subtle parallax on scroll.
2. **Dashboard hero**: a small floating "today" artifact — a 3D card stack representing the user's open priorities.
3. **Project detail**: a 3D health gauge — a tilted ring that fills with `--sage` / `--ochre` / `--rust` based on score.
4. **Empty states**: a single 3D book/object that fits the section (a closed notebook for "no projects," a paper plane for "no feedback yet").

**Never:**
- Background-filling 3D scenes that distract from the data.
- Fast-spinning, animated-by-default elements.
- More than one 3D canvas mounted per page.
- 3D where a static SVG would communicate the same idea (use SVG for icons, charts, and editorial flourishes).

**Performance budget:**
- 3D scene < 250KB gzipped extra JS, < 60fps on M1, lazy-loaded.
- All 3D scenes degrade to a styled SVG/CSS fallback when `prefers-reduced-motion: reduce`.

---

## 6. Data Visualization Primitives

The redesign **replaces wall-of-text with visualization wherever a number, ranking, or relationship is being shown**. Reserve prose for narrative — sentiment summaries, mentor advice, brand voice.

### Approved primitives (build once, reuse everywhere)
| Component | Use for | Library |
|---|---|---|
| `<ProgressRing />` | Single-percent metrics (project health, completion, sentiment) | Custom SVG |
| `<Sparkline />` | Trend over time, inline with a number | Custom SVG |
| `<BarSpark />` | Small bar comparison (3–7 items) | Custom SVG |
| `<NumberTicker />` | Animated count-ups for KPI hero numbers | `@number-flow/react` |
| `<ThemeBubbleMap />` | Feedback theme clusters | Custom SVG (force-directed, static) |
| `<TimelineRibbon />` | Project history, analyses, signals | Custom SVG |
| `<RechartsCard />` | Multi-line and area charts (analytics deep-dive) | `recharts` |

### Visualization rules
- Charts always include the **stamp** label of what they represent (`SESSIONS_7D`, `SENTIMENT_PCT`).
- Tooltips use `paper-card` styling.
- Color encoding is restricted to the data palette: `--sage` (positive), `--ochre` (warning), `--rust` (critical), `--ink-quiet` (neutral). Don't use signature pink for data.
- Numeric annotations are JetBrains Mono. Axis labels are JetBrains Mono uppercase 11px.
- Empty states for charts use the same warm tone as the surrounding page; never gray skeletons.

---

## 7. Motion Principles

Motion should feel like turning a page or sliding a drawer, not bouncing or springing.

| Token | Value | Use |
|---|---|---|
| `--ease-paper` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Default entrance/exit |
| `--ease-press` | `cubic-bezier(0.4, 0, 0.2, 1)` | Buttons, presses |
| `--ease-overshoot` | `cubic-bezier(0.34, 1.36, 0.64, 1)` | Reserved for empty-state arrivals only |
| `--dur-instant` | 90ms | Micro-feedback |
| `--dur-fast` | 180ms | Hover, focus |
| `--dur-base` | 280ms | Card mount, drawer slide |
| `--dur-slow` | 480ms | Hero reveal, page transitions |

**Rules:**
- Never use `cubic-bezier` springs over 300ms — the bouncier it gets, the more "vibe-coded" it feels.
- 3D rotation is always under 0.05 rad/s (very slow).
- Scroll-triggered animations use `useInView` once-only — no infinite parallax.
- View transitions API for theme toggle (already wired).

---

## 8. Layout Principles

- **Sidebar**: 248px fixed width, `--paper-deep` background, hairline right rule. Collapsible on hover-out is fine; never auto-collapse.
- **Page container**: max-width 1200px, gutter 32px desktop / 20px mobile.
- **Section grid**: 12-col with 16px gutter. Editorial sections may break to 8/4 or 7/5 split for asymmetric balance.
- **Headers always have a stamp + display heading + ink-rule sequence** (e.g., `PM_001 / overview` then `<hr class="ink-rule">`). This is the page-grammar that ties the app together.
- **Index everything**: every page top-right shows `LAST_SYNC: 14:32` or equivalent — the small mono details that signal craft.

---

## 9. Anti-Patterns (Things That Make It Vibe-Coded)

Forbidden. If you catch yourself doing one of these, stop.

1. **Gradient-heavy backgrounds** — no purple/pink gradients, no animated mesh gradients on default surfaces. Mesh blobs may exist *behind* the 3D hero only.
2. **Glass-on-glass nesting** — at most one frosted/glass element per region.
3. **Lucide icons used decoratively at small sizes** — icons must mean something. If a heading needs a "✨" sparkle, the heading is wrong.
4. **Centered marketing copy on app pages.** Recgon is a workspace inside the app.
5. **AI-styled gradient borders, neon glow, or "iridescent" surfaces.** Vintage means the opposite.
6. **Lorem ipsum or "Welcome to..." placeholder copy.** All copy must reflect the PM voice.
7. **Skeleton loaders that pulse with bright gray.** Use a faint paper-grain shimmer in `--paper-deep` instead.
8. **Mixing radii.** Cards 14px, buttons 10px, chips 999px. That's the whole system.
9. **Stamp without a value.** `PM_001` floating alone is a vibe; `PM_001 / overview` is a design.
10. **3D where a number would do.** If a sparkline tells the story, don't ship a 3D scene.

---

## 10. Component Stylings

### Buttons
- **Primary**: `--ink` background, `--paper` text, 10px radius, 12px x 20px padding, Inter 500. On hover, subtle scale 1.01 + ink darkens. On press, scale 0.99.
- **Secondary**: `--paper-card` background, `--rule` border, `--ink` text. Same shape.
- **Tertiary / link**: text only, underline on hover, never bold. JetBrains Mono allowed for terminal-style actions ("$ run analysis").
- **Pink CTA**: `--signature` background, `--ink` text. **Used at most once per page.** Reserved for the single most important action.

### Inputs
- 1px `--rule` border, no inner shadow. Focus ring is 2px `--signature` at 35% alpha. Inter 500 for value, mono 11px for placeholder if it's a system/code field.

### Cards / containers
- `.paper-card` (see §4). The hairline border is what makes them feel like ledger entries — keep the border even on dark mode.

### Navigation (sidebar)
- Items: 14px Inter 500, `--ink-soft` color, 10px y padding.
- Active: `--ink` text, `--paper-card` background pill (10px radius), 1px `--rule` border. **No left bar, no glow.**
- Stamps next to items showing counts (`14`, `99+`) are `--vintage-chip`.

### Tables
- Inter 14px body, JetBrains Mono 13px for numerics. Hairline rules between rows; alternating shade is **forbidden** (too dashboard-y). Sticky header gets `--paper-deep` background.

---

## 11. Implementation Notes for the LLM Coder

- This DESIGN.md compiles into `src/app/redesign.css` (tokens + utilities) and `src/components/visual/*` and `src/components/viz/*` (primitives).
- Existing `globals.css` is **not deleted** — `redesign.css` loads after it and overrides what's needed. Pages are migrated one at a time to use the new utilities.
- When updating a page: replace `glass-card` with `paper-card`, replace inline-styled headings with the `<PageHeader stamp="PM_001" title="overview" />` component, replace text walls of numbers with viz primitives, and check the page against the anti-patterns list (§9) before marking it done.
- Every new page must be reviewed against §9 — anti-patterns are the most common drift.

End of spec.
