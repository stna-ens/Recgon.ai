---
phase: 2
slug: github-skill-inference
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-12
reviewed_at: 2026-05-12T00:00:00Z
---

# Phase 2 — UI Design Contract

> Visual and interaction contract for the GitHub skill inference surfaces on `/teams/[id]/me` (inline consent in the form column, "INFERRED FROM GITHUB" section in the right preview rail, review-banner over the form, optional team-owner depth control in team settings).
> Inherits Phase 1 design language (Apple Wabi / liquid glass / signature pink). NO new aesthetics introduced — D-22 in Phase 1 still binds.
> Phase 1 D-09 disabled "GitHub coming soon" card was REMOVED in the post-execution redesign (CONTEXT.md `<domain>`); Phase 2 has nothing to replace and nowhere to add new chrome — it ADDS one section to the existing rail + one inline section to the existing form + one banner.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (existing in-house token system in `src/app/globals.css`) |
| Preset | not applicable — shadcn intentionally NOT initialized (matches Phase 1; would parallel existing `.glass-card` / liquid glass tokens) |
| Component library | `@radix-ui/themes` (`Box`, `Flex`, `Text`) + Radix primitives (`@radix-ui/react-popover`, `@radix-ui/react-tooltip`, `@radix-ui/react-alert-dialog` for the Stop-mining confirm) + existing `useToast()` |
| Icon library | `lucide-react` (already in deps) — Phase 2 uses `Github`, `RefreshCw`, `Check`, `X`, `AlertCircle`, `Info`, `Sliders` |
| Font | Inter (300/400/500/600/700) + JetBrains Mono (400/500) — same as Phase 1 |

**Rationale:** No `components.json` exists. The Phase 1 UI-SPEC explicitly rejected shadcn initialization. Phase 2 keeps that decision — every new surface MUST consume `var(--glass-substrate)`, `var(--signature)`, `var(--r-md)`, etc. No parallel palette.

---

## Spacing Scale

Declared values (all multiples of 4, identical to Phase 1):

| Token | Value | Phase 2 usage |
|-------|-------|---------------|
| xs | 4px | Banner icon-to-text gap; per-pill toggle gap |
| sm | 8px | Inferred-skills pill row gap; banner internal padding-y; Re-scan icon-to-label gap |
| md | 16px | Consent section internal padding; rail-section header to content gap |
| lg | 24px | Consent section → next form field gap; gap between "Likely matched to" and "INFERRED FROM GITHUB" rail sections |
| xl | 32px | Page-edge padding on the consent glass-card (inherited) |
| 2xl | 48px | Reserved — not introduced in Phase 2 |
| 3xl | 64px | Reserved — not used |

**Border radii (inherited tokens, NOT spacing):** `--r-sm: 14px` for inferred-skill pills and review banner; `--r-md: 24px` for the inline consent card; `--r-pill: 999px` for the "COMMIT-MINED" provenance chip and the depth-control segmented selector.

**Exceptions:** Re-scan button hit-area is 32×32px (8px visual icon inside 12px padding) — matches Phase 1's pill X-button convention. Per-pill reject toggle uses the same 32px hit-area on a 16px visual circle.

---

## Typography

Three sizes + one display variant. Two weights only. **Exactly 4 sizes — identical budget to Phase 1, no expansion.**

| Role | Size | Weight | Line Height | Font | Phase 2 usage |
|------|------|--------|-------------|------|---------------|
| Display | 28px | 600 | 1.2 | Inter | (none — Phase 2 adds no new page heading) |
| Heading | 20px | 600 | 1.3 | Inter | Consent section heading ("What GitHub says about you"); team-settings depth-control heading |
| Body | 16px | 400 | 1.5 | Inter | Consent body copy; banner body; rail section body; pill raw text |
| Label | 12px | 500 | 1.4 | JetBrains Mono, uppercase, letter-spacing 0.04em | Rail section header (`INFERRED FROM GITHUB`); provenance chip (`COMMIT-MINED` / `LANGUAGE STATS` / `IMPORTS`); depth-control labels (`CHEAP` / `STANDARD` / `DEEP`); banner eyebrow (`NEW INFERENCES`); Re-scan button label |
| Label (annotation variant) | 12px | 400 | 1.4 | JetBrains Mono, normal case | `Last scanned 3 days ago` timestamp under rail header; rejected-pill strikethrough caption (`rejected`); "Stop mining" microcopy |

**Strict weight palette:** 400 (body + label annotation) + 600 (heading + CTA). The Inter 500 weight already loaded for Phase 1 nav-link is NOT introduced into Phase 2 surfaces. JetBrains Mono uses 400 and 500 only (matches Phase 1).

**Rejected-pill rendering:** raw text in Inter 16px / 400 / `var(--txt-faint)` with `text-decoration: line-through` AND a "rejected" caption beneath in JetBrains Mono 12px / 400 / `var(--txt-faint)`. Distinguished from accepted state by color (`--txt-faint` vs `--txt-pure`) and the line-through decoration — NOT by a 5th type size.

**Why no 5th size for the timestamp:** "Last scanned 3 days ago" uses the same 12px JetBrains Mono as the section header, distinguished by weight (400 vs 500) and color (`--txt-muted` vs `--txt-pure`). Phase 1 already established this color+weight discrimination pattern; Phase 2 extends it without budget expansion.

---

## Color

Inherits Phase 1's two-mode token system. All surfaces MUST work in both `:root` (light, signature `#c2357a`) and `.dark` (signature `#f0b8d0`) without hardcoded hex.

| Role | Value | Phase 2 usage |
|------|-------|---------------|
| Dominant (60%) | `var(--bg-deep)` (light `#f5f5f7` / dark `#000000`) | Page background — unchanged from Phase 1 |
| Secondary (30%) | `var(--glass-substrate)` via `.glass-card` | Consent inline section; rail card (inherited from Phase 1); review banner uses `--btn-secondary-bg` (NOT a second glass surface — would violate "no stacked glass") |
| Accent (10%) | `var(--signature)` | **Reserved-for list below — exhaustive, EXTENDS Phase 1's 5-item list with Phase 2 items 6–9** |
| Destructive | `var(--danger)` (light `#FF3B30` / dark `#FF453A`) | Stop-mining confirm dialog CTA; mining-failed toast border |

**Accent reserved for (exhaustive — combines Phase 1 items 1–5 with Phase 2 items 6–9):**

1. *(Phase 1)* Primary CTA button ("Save profile") fill.
2. *(Phase 1)* Focused form-input border + focus ring.
3. *(Phase 1)* Selected suggestion item left-border in cmdk popover.
4. *(Phase 1)* "Your profile" heading underline (64px / 1px / 40% pink).
5. *(Phase 1)* Success toast left border.
6. **(Phase 2)** Accepted inferred-skill pill — filled background `rgba(var(--signature-rgb), 0.08)` + 1px border `rgba(var(--signature-rgb), 0.34)` + text `var(--signature)`. This is the ONLY surface on the page that paints pills pink; Phase 1 self-declared pills stay neutral (`--btn-secondary-bg`). The contrast is intentional — the teammate must see at a glance which pills are "what GitHub said" vs "what I told Recgon."
7. **(Phase 2)** Connect-GitHub primary CTA in the consent section (`Connect GitHub for skill mining`) — solid `var(--signature)` fill, identical visual to the Save profile CTA.
8. **(Phase 2)** Review-banner left 3px border `var(--signature)` + 14px circular `AlertCircle` icon in `var(--signature)`. Banner background stays `--btn-secondary-bg` (no pink fill).
9. **(Phase 2)** Depth-control segmented selector — active segment background `rgba(var(--signature-rgb), 0.08)` + 1px border `rgba(var(--signature-rgb), 0.34)`. Inactive segments stay `--btn-secondary-bg`.

**Rejected pills do NOT receive accent.** Rejected pills use `--btn-secondary-bg` background, `--txt-faint` text with line-through — explicit "this is no longer in play."

**Stop-mining link does NOT receive accent.** Rendered as text-button with `--txt-muted` color + underline-on-hover — destructive intent is signaled by the confirm dialog, not by pre-painting the link red.

**Provenance chip does NOT receive accent.** `COMMIT-MINED` / `LANGUAGE STATS` / `IMPORTS` chips use `--btn-secondary-bg` + `--txt-muted` — they are informational, not interactive.

---

## Copywriting Contract

Voice rule (inherited from Phase 1 D-21): Recgon IS the AI PM. First-person ("I'll look at…"), never "Powered by AI", never "the LLM scans…", never "model", never "Gemini" or "Claude". Tone = a smart manager explaining what they're going to look at.

**Settings = configuration, not metaphor** (project memory: feedback_settings_design). The depth control copy MUST describe what the system does, NOT use "briefing / sweep / deep dive" metaphors.

### Consent inline section (form column)

| Element | Copy |
|---------|------|
| Section heading | `What GitHub says about you` |
| Section eyebrow (JetBrains Mono 12px / 500 / `--txt-muted`) | `OPTIONAL` |
| Body (pre-consent) | `If you connect GitHub, I'll look at the commits you've authored in this team's repos over the last 6 months and suggest skills that match what you've actually been shipping. You stay in control — every suggestion is yours to keep or reject.` |
| Body — what we read | `I only read commits in repos already connected to this team. Commit titles only. Never your personal repos, never private notes.` |
| Body — what we don't (rendered as small list, body 16px) | `Personal repos · Pull request bodies · Anything outside commits` |
| Primary CTA (pre-consent) | `Connect GitHub for skill mining` |
| Body (post-consent, idle) | `Connected {githubUsername}. I'll re-check weekly and add new suggestions to your preview.` |
| Stop-mining link (post-consent, secondary) | `Stop mining` |
| Stop-mining tooltip (on hover, JetBrains Mono 12px) | `Disconnects GitHub. Keeps the skills you've already accepted.` |
| Stop-mining confirm dialog heading | `Stop mining your commits?` |
| Stop-mining confirm dialog body | `I'll keep the skills you've already accepted — they're real, even if you don't want me looking at new commits. The ones you've rejected stay rejected.` |
| Stop-mining confirm CTA | `Stop mining` (`var(--danger)` fill) |
| Stop-mining confirm cancel | `Keep mining` (`--btn-secondary-bg` fill) |
| OAuth-failed inline error | `Couldn't connect to GitHub. Try again in a moment.` |
| OAuth-cancelled inline notice | `Connection cancelled. No commits were read.` |

### Review banner (form column, above the consent section, appears when new unreviewed inferences exist)

| Element | Copy |
|---------|------|
| Eyebrow (JetBrains Mono 12px / 500 / `--signature`) | `NEW INFERENCES` |
| Banner heading (Body 16px / 600) | `{N} new inferred skills — review` (singular: `1 new inferred skill — review`) |
| Banner CTA (text-button, Body 16px / 600 / `--signature`) | `Review` |
| Banner dismiss icon (16px `X`, hit-area 32px) | `aria-label="Dismiss new inferences banner"` |

When the user clicks `Review`, the page smoothly scrolls so the "INFERRED FROM GITHUB" rail section is centered in the viewport (rail anchor). Clicking the dismiss icon marks all currently-unreviewed rows as `user_reviewed_at = now()` via `PATCH /api/teams/[id]/inferred-skills/mark-reviewed`. Banner does NOT auto-hide on scroll-into-view (per Open Question 2 — explicit dismiss is more predictable).

### Right preview rail — "INFERRED FROM GITHUB" section (added below "Likely matched to")

| Element | Copy |
|---------|------|
| Section header (JetBrains Mono 12px / 500 / `--txt-pure`, uppercase) | `INFERRED FROM GITHUB` |
| Header timestamp (right-aligned, JetBrains Mono 12px / 400 / `--txt-muted`) | `Last scanned {relativeTime}` — e.g. `Last scanned 3 days ago`, `Last scanned just now`. If never scanned (consented but worker hasn't run): `Awaiting first scan`. |
| Re-scan button label | `Re-scan` (12px JetBrains Mono / 500, left-side 14px `RefreshCw` icon) |
| Re-scan rate-limited tooltip | `Already scanned recently. Next scan available in {minutes}m.` |
| Pre-consent empty state body | `Once you connect GitHub, I'll add suggested skills here based on the commits you've actually shipped.` |
| Post-consent empty state (consent + scan complete + zero results) | `I didn't find any new skills from your commits in the last 6 months. Try writing a few commits and I'll re-check.` |
| Scanning state | `Looking at your commits…` (with subtle pulse on the rail card border, no spinner — keeps the rail calm) |
| Scan-failed state | `Couldn't reach GitHub. I'll try again on the next weekly check.` |
| Accepted pill provenance chip (JetBrains Mono 12px / 500 / `--txt-muted`) | One of: `COMMIT-MINED` (LLM commit-tag inference), `LANGUAGE STATS` (Linguist), `EXTENSION` (file-extension map), `IMPORTS` (deep mode) — chip text matches `source` column value |
| Rejected pill annotation (JetBrains Mono 12px / 400 / `--txt-faint`) | `rejected` (lowercase, no period) |
| Per-pill reject tooltip (on hover of the reject toggle) | `Drop this from my profile. Permanent — I won't suggest it again.` |
| Per-pill accept tooltip (on hover of an already-accepted pill) | `I'm using this when matching tasks to you.` |

### Team-settings depth control (team-owner only, deferred to a small follow-up but copy locked here)

| Element | Copy |
|---------|------|
| Settings section heading | `What I read from GitHub` |
| Settings section body | `How deep should I look into your team's commits to infer skills? More depth = more accurate, slightly more cost.` |
| Segment 1 label (JetBrains Mono 12px / 500) | `CHEAP` |
| Segment 1 description (Body 16px / 400 / `--txt-muted`) | `File extensions and language stats only. No model calls.` |
| Segment 2 label | `STANDARD` |
| Segment 2 description | `Cheap, plus one batched read of recent commit titles to infer practice areas.` |
| Segment 3 label | `DEEP` |
| Segment 3 description | `Standard, plus a look at import statements in changed files to catch concrete tools.` |
| Settings save (uses existing team-settings CTA) | `Save settings` |

### Toast copy (uses existing `useToast()`)

| Outcome | Severity | Copy |
|---------|----------|------|
| Consent OAuth succeeds | success | `Connected. I'll start looking at your commits — first results land in a moment.` |
| Re-scan kicked off | info | `Scan queued. New skills will land in a moment.` |
| Re-scan rate-limited | info | `Already scanned recently. Try again in {minutes}m.` |
| Pill rejected | info | `Dropped. I won't suggest it again.` |
| Pill rejected — undo (toast action) | n/a | `Undo` — text-button on the toast, 6s window before commit. After undo, pill flips back to accepted state. |
| Stop-mining succeeded | success | `Stopped. I'll keep the skills you've accepted.` |
| Stop-mining failed | destructive | `Couldn't disconnect. Try again in a moment.` |

**Banned strings on Phase 2 surfaces (enforced by gsd-ui-checker — inherits Phase 1 ban list):**
- `AI`, `Powered by`, `LLM`, `Gemini`, `Claude`, `model`, `algorithm`, `machine learning` MUST NOT appear in any user-facing copy.
- `briefing`, `broadcast`, `sweep`, `deep dive`, `under the hood` MUST NOT appear in settings copy (settings-design ban).
- `Recgon` never appears in third person ("Recgon will…"). First-person ("I'll re-check weekly…") or direct second-person ("Connect GitHub…") only.
- No emoji. No exclamation marks (consent body uses period-ended sentences only).
- No "consent" in user-facing copy — too legal-formal. The CTA verb (`Connect GitHub for skill mining`) carries the consent semantics; the underlying audit field is `github_mining_consent_at` (internal only).

---

## Component Inventory & Interaction Contract

### Page layout addition

```
/teams/[id]/me  (existing two-column sticky layout from Phase 1)

┌── Form column (left, scrollable) ────────────────┐ ┌── Preview rail (right, sticky) ─┐
│                                                   │ │                                  │
│  Your profile                                     │ │  HOW I SEE YOU                   │
│  ─── (signature underline) ────                   │ │  Live preview                    │
│  What you tell me here…                           │ │  ┌──────────────────────────┐   │
│                                                   │ │  │ [identity + capacity bar]│   │
│  ┌─ banner (when N>0 unreviewed) ────────────┐   │ │  │                          │   │
│  │ ⓘ NEW INFERENCES                          │   │ │  │ Likely matched to        │   │
│  │ 5 new inferred skills — review     [×]    │   │ │  │ [pills…]                 │   │
│  └─────────────────────────────────────────────┘  │ │  │                          │   │
│                                                   │ │  │ ─── 24px gap ──          │   │
│  ┌─ existing form .glass-card ─────────────────┐ │ │  │                          │   │
│  │  SKILLS / STRENGTHS / INTERESTS / CAPACITY  │ │ │  │ INFERRED FROM GITHUB     │   │
│  │  …                                            │ │ │  │ Last scanned 3d ago      │   │
│  │  [Save profile]                               │ │ │  │ [Re-scan]                │   │
│  └───────────────────────────────────────────────┘ │ │  │                          │   │
│                                                   │ │  │ ┌─ accepted pills ─┐     │   │
│  24px gap                                         │ │  │ │ React  Python    │     │   │
│                                                   │ │  │ │ COMMIT-MINED     │     │   │
│  ┌─ NEW: Consent inline section .glass-card ────┐ │ │  │ └──────────────────┘     │   │
│  │  OPTIONAL                                     │ │ │  │ ┌─ rejected ───────┐     │   │
│  │  What GitHub says about you                   │ │ │  │ │ ~~PHP~~ rejected │     │   │
│  │  If you connect GitHub, I'll look at…         │ │ │  │ └──────────────────┘     │   │
│  │  Personal repos · PR bodies · Anything…       │ │ │  │                          │   │
│  │  [Connect GitHub for skill mining]            │ │ │  └──────────────────────────┘   │
│  │  (post-consent: Connected eneskis. ▾ Stop)    │ │ │                                  │
│  └───────────────────────────────────────────────┘ │ │                                  │
│                                                   │ │                                  │
└───────────────────────────────────────────────────┘ └──────────────────────────────────┘
```

**Max content width:** unchanged from Phase 1 (form column 680px, rail width inherited from existing `ProfilePreview.tsx`).

### Consent inline section (D-21)

A new `.glass-card` placed below the existing form `.glass-card`, 24px gap. Internal padding 32px (matches form card). Houses:

- Eyebrow `OPTIONAL` (JetBrains Mono 12px / 500 / `--txt-muted`, uppercase, letter-spacing 0.04em).
- Heading `What GitHub says about you` (Inter 20px / 600).
- Body copy + what-we-read line + what-we-don't pill-row (3 small `--btn-secondary-bg` chips inline).
- **Pre-consent:** Primary CTA `Connect GitHub for skill mining` (solid `var(--signature)`, left-side 14px `Github` lucide icon, `aria-label` matches text).
- **Post-consent:** Identity line `Connected {githubUsername}` (Body 16px / 400 / `--txt-pure`) + a small `var(--txt-muted)` text-button `Stop mining` to the right.
- **Click contract for primary CTA:** sets `github_connect_state` cookie + redirects to `https://github.com/login/oauth/authorize?...&scope=read:user user:email repo&state=...` (RESEARCH Pattern 1). After successful callback, page re-renders with post-consent state + `Connected.` toast. After failure, page re-renders with pre-consent state + inline error.
- **Stop-mining click contract:** opens `@radix-ui/react-alert-dialog` confirm with the locked copy above. `Stop mining` (destructive) calls `DELETE /api/teams/[id]/inferred-skills/consent` → server unsets `github_mining_consent_at`, revokes the elevated scope via GitHub API, leaves all `teammate_inferred_skills` rows untouched. UI re-renders with pre-consent state.

### Review banner (D-26)

Anchored ABOVE the form `.glass-card` (above the existing form card, not above the page heading — the banner is about new data, not page chrome). Surface: `--btn-secondary-bg` with 3px left border in `var(--signature)`, 1px border `--btn-secondary-border` on the other three sides, `--r-sm` corners. Internal padding 16px. Layout: `display: flex; align-items: center; gap: 12px;`.

- Left: 14px `AlertCircle` lucide icon in `var(--signature)`.
- Center: eyebrow + heading stacked. Eyebrow `NEW INFERENCES` (JetBrains Mono 12px / 500 / `var(--signature)`). Heading `{N} new inferred skills — review` (Inter 16px / 600 / `--txt-pure`).
- Right: `Review` text-button (Inter 16px / 600 / `var(--signature)`) + 16px `X` dismiss icon (32px hit-area, `aria-label="Dismiss new inferences banner"`, `aria-hidden="true"` on the icon).
- **Render condition:** `count(teammate_inferred_skills WHERE teammate_id = me AND user_reviewed_at IS NULL AND rejected_at IS NULL) > 0`. Banner does NOT render when count is zero. Banner does NOT render pre-consent (no rows can exist).
- **Click `Review`:** smooth-scroll the rail's "INFERRED FROM GITHUB" section into view (centered). Does NOT mark rows reviewed — the user must explicitly accept/reject each, or dismiss the banner.
- **Click dismiss:** PATCH bulk-update all the user's unreviewed rows → `user_reviewed_at = now()`. Banner collapses opacity 1→0 over `--dur-fast` then collapses height. Animation reuses `--ease-out`.
- **Singular form:** `1 new inferred skill — review` when N=1. Pluralization rule lives in the component, never hand-spliced into the copy.

### Right preview rail — "INFERRED FROM GITHUB" section (D-26)

Appended to the existing rail card (`ProfilePreview.tsx`), 24px below the existing "Likely matched to" section. Uses the existing `PreviewSection` component shape for consistency.

**Section header row:**
- Left: `INFERRED FROM GITHUB` (JetBrains Mono 12px / 500 / `--txt-pure`, uppercase, letter-spacing 0.04em).
- Right (compressed group): `Last scanned 3 days ago` (JetBrains Mono 12px / 400 / `--txt-muted`) + 8px gap + `Re-scan` button (text + 14px `RefreshCw` icon, color `--txt-muted` idle / `--txt-pure` hover, color `var(--signature)` while a scan is in-flight). When in-flight: icon spins at 0.8s linear infinite.
- Hover on Re-scan when rate-limited → tooltip with the locked copy.

**Pill grid:**
- `display: flex; flex-wrap: wrap; gap: 8px;`
- **Accepted pill (default state for any row where `rejected_at IS NULL`):**
  - Background `rgba(var(--signature-rgb), 0.08)`, 1px border `rgba(var(--signature-rgb), 0.34)`, text `var(--signature)`, `--r-sm` corners, padding 4px 8px 4px 12px.
  - Line 1: canonical tag text (Inter 16px / 400). Line 2: provenance chip (`COMMIT-MINED` / `LANGUAGE STATS` / `EXTENSION` / `IMPORTS` — JetBrains Mono 12px / 500 / `--txt-muted`, no chip border, inline).
  - Trailing 16px `X` reject toggle, 32px hit-area, `--txt-muted` idle / `--danger` hover. `aria-label="Reject inferred skill {canonical}"` on the button, `aria-hidden="true"` on the icon.
  - Hover on the pill body shows the accept-tooltip.
- **Rejected pill (`rejected_at IS NOT NULL`):**
  - Background `--btn-secondary-bg`, 1px border `--btn-secondary-border`, text `var(--txt-faint)` with `text-decoration: line-through`, padding 4px 8px 4px 12px.
  - Line 1: canonical tag text, struck through. Line 2: `rejected` (JetBrains Mono 12px / 400 / `--txt-faint`).
  - NO reject toggle. No accept toggle (rejection is permanent per D-24). Hovering does nothing.

**Reject interaction (the load-bearing one):**
1. User clicks the X on an accepted pill.
2. Optimistic UI: pill flips to rejected state instantly (opacity dip 1→0.7 over `--dur-fast`, then settles to rejected style).
3. PATCH `/api/teams/[id]/inferred-skills/{id}` with `{ rejected_at: now() }`.
4. Toast appears: `Dropped. I won't suggest it again.` with `Undo` text-button.
5. **Undo window:** 6 seconds. If clicked → PATCH again with `{ rejected_at: null }`, pill flips back to accepted.
6. **After 6s:** rejection is committed; the toast auto-dismisses. NO further undo affordance. To re-add the skill, the teammate uses the regular self-declared skill picker in the form column (the rejection only blocks re-inference, not self-declaration).
7. On PATCH failure (any 4xx/5xx): pill reverts to accepted, destructive toast `Couldn't update. Try again in a moment.`

**Empty states (render order):**
- Pre-consent: empty-state body copy in `--txt-muted`, NO Re-scan button, NO timestamp. Section header still renders.
- Post-consent + first scan in flight: scanning-state copy + subtle 1px border pulse on the rail card outer edge (`@keyframes` named `inferred-pulse`, 2s ease-in-out infinite, peak border-color `rgba(var(--signature-rgb), 0.25)`). No spinner — the pulse IS the indicator.
- Post-consent + scan complete + zero results: empty-state copy in `--txt-muted` + Re-scan button enabled + timestamp shown.
- Post-consent + scan failed: scan-failed copy in `--txt-muted` + Re-scan button enabled.

### Per-pill reject toggle — accessibility contract

- Wrapped in `<button type="button" aria-label="Reject inferred skill {canonical}">` — the `{canonical}` interpolation uses the canonical tag (e.g. `Reject inferred skill react`, `Reject inferred skill python`).
- Inner `<X>` lucide icon carries `aria-hidden="true"`.
- Keyboard reachable via tab; Enter or Space triggers reject. Focus ring uses the existing global `:focus-visible` rule (1px `rgba(var(--signature-rgb), 0.6)` outline).
- The accepted pill itself is NOT a button — clicking the pill body does nothing; only the trailing X is interactive. This prevents accidental rejection from a fat-finger tap on the pill text.

### Team-settings depth control (D-23 — optional Plan 4 surface)

Lives in `/teams/[id]/settings` (existing surface, NOT a new page). Adds one new section above existing settings:

- Section heading + body (typography roles above).
- Segmented selector: 3 horizontally-arranged segments inside a single `--btn-secondary-bg` container, `--r-pill` corners, padding 4px.
  - Each segment: 8px 16px padding, JetBrains Mono 12px / 500 uppercase label, `--r-sm` corners.
  - Active segment: `rgba(var(--signature-rgb), 0.08)` background + 1px border `rgba(var(--signature-rgb), 0.34)` + text `var(--signature)`.
  - Inactive segments: transparent background, text `--txt-muted`. Hover → `--btn-secondary-hover` background.
  - One-line description under the segmented selector updates live as the user clicks (Body 16px / 400 / `--txt-muted`).
- Save uses the team-settings page's existing save CTA — no new Save button in this section.
- **Visibility:** owner-only. For non-owners, the section renders as read-only (segmented selector disabled, current selection shown with `--txt-faint` color and a tooltip `Only the team owner can change this.`).
- **Default:** `STANDARD` (matches D-23 default + the `NOT NULL DEFAULT 'standard'` migration).

### Provenance chip — visual contract

A small inline chip rendered as line 2 of every accepted pill (NOT a separate row, NOT a tooltip). One of four values mapping 1:1 to the `teammate_inferred_skills.source` column:

| `source` column | Chip text | Tooltip on hover |
|-----------------|-----------|------------------|
| `linguist` | `LANGUAGE STATS` | `From the languages GitHub sees in this team's repos.` |
| `extension` | `EXTENSION` | `From file extensions in commits you authored.` |
| `llm_commit` | `COMMIT-MINED` | `From commit titles you authored in the last 6 months.` |
| `llm_import` | `IMPORTS` | `From import statements in files you've changed.` |

Chip styling: JetBrains Mono 12px / 500 / `--txt-muted`, uppercase, letter-spacing 0.04em — same Label role as Phase 1. No background, no border — purely text. The tooltip uses `@radix-ui/react-tooltip` (already in deps).

---

## Animations and Motion

All Phase 2 motion reuses Phase 1 tokens — `--dur-fast` (0.15s), `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`).

| Element | Animation |
|---------|-----------|
| Banner appear | opacity 0→1 + translateY 4px→0 over `--dur-fast` |
| Banner dismiss | opacity 1→0 over `--dur-fast`, then collapse height (`max-height` 80px→0 over `--dur-fast`) |
| Pill reject (optimistic) | opacity 1→0.7 over `--dur-fast`, then settle to rejected style |
| Pill reject (rolling back on PATCH fail) | reverse: opacity 0.7→1 + style flip |
| Re-scan button spin | `RefreshCw` icon `animation: spin 0.8s linear infinite` |
| Rail card pulse (scanning state) | `@keyframes inferred-pulse` — border-color `rgba(var(--signature-rgb), 0.04)` → `rgba(var(--signature-rgb), 0.25)` → back, 2s ease-in-out infinite |
| Stop-mining confirm | Radix AlertDialog default — backdrop fade + content scale (already-tuned by Radix) |
| Smooth-scroll to rail section (Review CTA) | `scrollIntoView({behavior: 'smooth', block: 'center'})` — browser-native |

**Motion bans:**
- No bounce, no overshoot, no spring physics. Phase 1 deliberately picked the calm `--ease-out` curve; Phase 2 sticks with it.
- No confetti, no shake, no celebratory animation on accept/reject. Settings = calm, configuration only.
- No glass shimmer on the new sections. "No stacked glass" rule applies — the consent card sits on the page background, the banner sits on the page background (NOT on top of the form card). The rail card is the existing glass surface; new sections inside it add nothing visual.

---

## Light + Dark Mode Parity

Every surface above MUST work in both modes without hardcoded hex. The two operational differences:

| Token | Light value | Dark value | Notes |
|-------|-------------|------------|-------|
| `--signature` | `#c2357a` (saturated pink, project memory locks this against the pastel `#e8a8c4`) | `#f0b8d0` (soft pink for legibility on near-black) | Both feed `--signature-rgb` for translucent fills |
| Accepted pill fill | `rgba(194, 53, 122, 0.08)` (resolves at runtime via `var(--signature-rgb)`) | `rgba(240, 184, 208, 0.08)` | Same opacity, different RGB tuple |
| Accepted pill border | `rgba(194, 53, 122, 0.34)` | `rgba(240, 184, 208, 0.34)` | Same opacity, different RGB tuple |
| Accepted pill text | `var(--signature)` | `var(--signature)` | Inherits mode |
| `--txt-faint` (rejected pill) | `#a1a1a6` | `#636366` | Already mode-aware |

**Verification rule for the executor:** Grep the implemented Phase 2 files for hex literals (`grep -Pn '#[0-9a-fA-F]{3,8}'`) — must return zero matches on the new component files. All color references via `var(--…)` tokens.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none — shadcn NOT initialized in Phase 2 (matches Phase 1) | not applicable |
| Third-party registries | none | not applicable |

**Net-new npm dependencies authorized by this UI-SPEC:**

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `@radix-ui/react-alert-dialog` | latest compatible with React 19 | Stop-mining confirm dialog (destructive intent) | Standard Radix primitive; CLAUDE.md mandates Radix for accessible interactive UI. Confirm: not yet in `package.json` — planner verifies and installs as part of Plan 3. Other Radix primitives in this spec (`Popover`, `Tooltip`) are already installed per Phase 1 footprint. |

**No third-party blocks. No registry vetting gate required.** Phase 2 introduces zero shadcn or external-registry surface area — the new sections are hand-rolled against the existing `globals.css` token system, exactly as Phase 1 did.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — voice locked to first-person Recgon-as-manager; banned strings list extended (consent, briefing, broadcast); all 4 surfaces (banner, consent, rail section, settings) have explicit copy for every state including singular/plural; pill reject button `aria-label` contract specified.
- [ ] Dimension 2 Visuals: PASS — every visual surface mapped to an existing `globals.css` token; no new aesthetic; "no stacked glass" rule preserved (banner uses `--btn-secondary-bg`, NOT a second `.glass-card`); animation reuses Phase 1 `--dur-fast` + `--ease-out`.
- [ ] Dimension 3 Color: PASS — 60/30/10 split inherited from Phase 1; accent reserved-for list extended from 5 to 9 items, with the 4 new items (accepted pill fill, Connect-GitHub CTA, banner left-border, depth-control active segment) called out specifically; both light + dark modes covered via existing tokens, no hardcoded hex.
- [ ] Dimension 4 Typography: PASS — exactly 4 sizes (28 / 20 / 16 / 12) and 2 weights (400 + 600); rejected-pill state distinguished by color + decoration, NOT a 5th size; timestamp uses the Label-annotation variant established in Phase 1.
- [ ] Dimension 5 Spacing: PASS — all values multiples of 4; Re-scan and reject toggle hit-areas (32px) documented; existing `--r-*` radius tokens used throughout.
- [ ] Dimension 6 Registry Safety: PASS — no shadcn / third-party registries; one new Radix package (`@radix-ui/react-alert-dialog`) authorized for the destructive confirm dialog only.

**Approval:** pending

---

## Revision Log

| Rev | Date | Changes |
|-----|------|---------|
| 0 | 2026-05-12 | Initial Phase 2 spec — covers consent inline section (D-21), Stop-mining flow (D-22), depth control (D-23), per-pill reject (D-24), Re-scan + weekly cron UX (D-25), and the "INFERRED FROM GITHUB" rail section + review banner (D-26). Extends Phase 1's color/typography/spacing budgets without expansion. |
