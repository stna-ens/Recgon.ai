# Shell UI Review — AUTH / LANDING / APP-SHELL

**Audited:** 2026-06-13
**Baseline:** Abstract 6-pillar standards + house design system (glass-card, .recgon-label, JetBrains Mono, signature-pink-only accent, no emojis, no stacked glass)
**Screenshots:** Not captured — Playwright browser binaries not installed on this machine; code-only audit (per project convention: ask user for screenshots for visual verification)
**Goal bar:** Apple-grade first-impression polish

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Root metadata still ships the retired "Coach Solo Founders Don't Have" positioning (S-07) |
| 2. Visuals | 3/4 | Landing system is genuinely polished; localized defects — unstyled resend button (S-05), TeamSwitcher referencing 4 undefined tokens (S-06) |
| 3. Color | 2/4 | **BLOCKER:** white text on `var(--signature)` CTAs ≈ 1.4:1 contrast in dark mode across 5 landing files (S-01) |
| 4. Typography | 3/4 | Mono discipline consistent and hierarchy clear, but `--fs-*` scale exists and is ignored (~18 raw px sizes on these surfaces) |
| 5. Spacing | 2/4 | `body { overflow: hidden }` clips auth pages on short viewports with no scroll (S-08); fixed `gap: 10rem` overflows 880–970px (S-09) |
| 6. Experience Design | 2/4 | Auth form UX is excellent, but input focus rings are globally killed inside the workspace shell (S-03) and the hero h1 is invisible to screen readers (S-02) |

**Overall: 14/24**

---

## Top 3 Priority Fixes

1. **Dark-mode CTA contrast (S-01)** — Every primary CTA on the landing page (nav "Get started", hero CTA, footer CTA, mobile CTA, pipeline avatars) renders white text on pale pink `#f0b8d0` in dark mode (~1.4:1, WCAG fail; barely legible). Fix: add a `--signature-ink` token (`#ffffff` in light, `#1d1d1f` in dark) and use it wherever `background: var(--signature)` carries text.
2. **Screen-reader-empty hero (S-02)** — `DecryptedText` wraps ALL rendered text in `aria-hidden="true"` with no sr-only fallback; the landing `<h1>` and rotating audience line announce as empty to assistive tech. Fix: render a visually-hidden `<span>{text}</span>` sibling inside the component.
3. **Workspace focus-ring kill switch (S-03)** — `WorkspaceShell.tsx:93-99` sets `box-shadow: none !important; outline: none !important` on every `input`/`textarea` `:focus` and `:focus-visible` in the shell, defeating the carefully built global pink focus halo (globals.css:2594+). Keyboard users get zero focus indication on inputs app-wide in dark mode. Fix: delete the block or scope it to specific chat inputs that have their own ring.

---

## Findings Table

Severity: **BLOCKER** (breaks task/contract) · **HIGH** · **MEDIUM** · **LOW**
Fix type: `auto` = mechanically safe for an autonomous fixer · `design` = needs a design decision first

| ID | Sev | Location | What's wrong | Concrete fix | Fix |
|----|-----|----------|--------------|--------------|-----|
| S-01 | BLOCKER | `LandingNav.tsx:134-135`, `HeroSection.tsx:218-219`, `FooterCta.tsx:183-184`, `MobileLanding.tsx:851,946`, `PipelineDiagram.tsx:307,366` | `color: white/#fff` on `background: var(--signature)`. Dark `--signature` = `#f0b8d0` → ~1.4:1 contrast on every primary CTA. MobileLanding force-scopes `.dark`, so mobile CTA always fails. | Add `--signature-ink: #fff` (`:root`/`.light`) and `--signature-ink: #1d1d1f` (`.dark`) to globals.css; replace all 6 `color` declarations. | auto |
| S-02 | BLOCKER | `DecryptedText.tsx:134` | Sole child is `aria-hidden="true"`; no accessible text. Hero `<h1>`, audience rotator, mobile hero all silent for AT. | Add `<span style={{position:'absolute',width:1,height:1,overflow:'hidden',clip:'rect(0,0,0,0)'}}>{text}</span>` before the aria-hidden span. | auto |
| S-03 | HIGH | `WorkspaceShell.tsx:93-99` | `input/textarea :focus, :focus-visible { box-shadow:none !important; outline:none !important }` removes all keyboard focus indication on inputs inside `.v2-shell` (light mode gets only a faint border change at :251-255; dark gets nothing). | Remove the rule, or narrow to `:focus:not(:focus-visible)` so mouse users keep the clean look while keyboard users get the ring. | auto |
| S-04 | HIGH | `AppShell.tsx:9` | `AUTH_PATHS = ['/login','/register','/landing']` — `/forgot-password` (public per `proxy.ts:35`) falls through to the full shell: `TeamProvider` + `SwrProvider` + `WorkspaceShell`. Logged-out visitors get the app TopNav, 84px shell padding, and team-fetch 401s on a password-reset page. | Add `'/forgot-password'` to `AUTH_PATHS`. | auto |
| S-05 | HIGH | `forgot-password/page.tsx:229` + `:248`, class defined only in `register/page.tsx:407-415` | Resend button uses `.auth-link-btn`, but the page injects only `authStyles`; `.auth-link-btn` lives in register's `registerExtraStyles`. Button renders with native browser chrome (border, gray bg) inline in a sentence. | Move `.auth-link-btn` rules into `authStyles`. | auto |
| S-06 | HIGH | `TeamSwitcher.tsx:38,40,48,52,118,139,152,170` | References four tokens that exist nowhere: `--border`, `--txt`, `--accent`, `--accent-faint`. Trigger border drops, team/check icons (`stroke="var(--accent)"`) resolve invalid, open-state ring is a no-op. The `!important` patch pile in globals.css:457-557 exists to paper over this. | Replace: `--border`→`--rule-strong`, `--txt`→`--txt-pure`, `--accent`→`--signature`, `--accent-faint`→`rgba(var(--signature-rgb),0.15)`. Then thin the globals patches. | auto |
| S-07 | HIGH | `src/app/layout.tsx:20-45` | Default/OG/Twitter metadata still says "Recgon — The Coach Solo Founders Don't Have" / "mentor and cofounder". Product repositioned to AI Product Manager for small teams. Any shared non-landing URL (login, register, app pages) shows retired positioning on WhatsApp/Twitter/Telegram. | Rewrite title/description/OG/Twitter to PM positioning, mirroring `landing/page.tsx` meta strings (ideally via `getTranslations`). | design |
| S-08 | HIGH | `globals.css:233-243` + missing override in auth layouts | `body { height:100vh; overflow:hidden }` applies to /login, /register, /forgot-password (only `landing/layout.tsx` overrides it). On short viewports (~≤760px height) or at 150% zoom, the register form clips with no scrollbar — fields below the fold are unreachable (WCAG 1.4.10 reflow fail). | Add the same body override (`overflow:auto; height:auto; display:block; min-height:100vh`) to a shared auth layout, or give `.auth-page` `max-height:100vh; overflow-y:auto`. | auto |
| S-09 | MEDIUM | `login/page.tsx:255` (`authStyles`, shared by all 3 auth pages) | `.auth-wrap { gap: 10rem }` + 400px form + 360px feature panel = 920px min-width, but the panel only hides below 880px → horizontal overflow/clipping between ~880-970px viewports. `10rem` is also off the 4px spacing scale. | `gap: clamp(3rem, 8vw, 10rem)` or raise the hide breakpoint to 1000px. | auto |
| S-10 | MEDIUM | `Toast.tsx:36-49,54-59` | (a) No `role="status"`/`aria-live` — toasts are invisible to screen readers. (b) 5s auto-dismiss with no pause-on-hover. (c) `TYPE_STYLES` hardcodes light-mode hexes (`#FF3B30`, `#007AFF`); dark mode has different semantic tokens (`#FF453A` etc.) that are ignored, and info-blue isn't in the token system at all. | Add `role="status" aria-live="polite"` to container; pause timer on mouseenter; replace hexes with `var(--danger)`/`var(--success)`/`var(--warning)` + add an `--info` token to both themes. | auto |
| S-11 | MEDIUM | `Select.tsx` (whole file), `TeamSwitcher.tsx` (whole file) | Hand-rolled dropdowns violate the project rule "use Radix primitives for all interactive UI". No `aria-expanded`/`aria-haspopup`/listbox roles, no Escape-to-close, no arrow-key nav. Select's inline `outline:'none'` + conditional inline `boxShadow` (`:95-98`) defeats the global focus-visible ring. | Migrate to `@radix-ui/react-select` and `@radix-ui/react-dropdown-menu` (restyle with existing inline looks). Interim auto-fix: add aria attrs + Escape handler + remove inline outline suppression. | design |
| S-12 | MEDIUM | `globals.css:1261-2643` (~215 rules), `globals.css:11-14,123-125`, `layout.tsx:73-77`, `SpotlightCard.tsx` | Dead code shipped to every visitor: the entire `.feedback-*` CSS block (feature deleted 2026-05-11, zero tsx references), unused `--aura-1/2/3` tokens, three `display:none` `.mesh-blob` divs in the root layout, and the 101-line `SpotlightCard.tsx` imported nowhere. | Delete all four. ~1,400 lines of CSS/TSX removed, smaller first paint. | auto |
| S-13 | MEDIUM | `globals.css:5-116` vs `:119-165`; `:50` vs `.light`; `TerminalPreviewSection.tsx:132` vs `PipelineDiagram.tsx:257` | Token drift: `:root` and `.light` are hand-duplicated 50-line blocks that have already diverged (`--accent-secondary` defined in `:root`+`.dark` but missing from `.light`). Parallel systems `--txt-muted`/`--text-muted` and `--text-secondary` coexist. `--success` fallbacks disagree (`#059669` vs `#34C759`). | Make `.light` only re-declare values that differ from `:root` (currently: none — it can be reduced to `--…` nothing or kept as an alias block generated from one source). Kill the `--text-*` aliases via grep-replace. Standardize fallback to `#34C759` or drop fallbacks entirely. | auto |
| S-14 | MEDIUM | `HeroSection.tsx:88` | `aria-live="polite"` on the rotating audience word — its contents are `aria-hidden` (announces nothing today); once S-02 is fixed it would announce every 2.6s forever. The rotator also never pauses for `prefers-reduced-motion` (DecryptedText has no reduced-motion path). | Remove `aria-live`; keep the static `aria-label` on the label span. In DecryptedText, skip scrambling and render final text when `matchMedia('(prefers-reduced-motion: reduce)')` matches. | auto |
| S-15 | LOW | `PipelineDiagram.tsx:115` | `{kind.replace('_',' ')}` renders raw enum keys ("dev prompt", "next step") as user-facing badge copy, bypassing i18n in an otherwise fully-translated section — TR visitors see English badges. | Add `tasks.kinds.*` message keys and render `t(\`tasks.kinds.${kind}\`)`. | auto |
| S-16 | LOW | `PipelineDiagram.tsx:342` | Hardcoded cyan `#0a7ea4` for the marketing badge — an off-palette hue outside the token system (house rule: signature pink is the only accent; semantic colors are tokens). | Either tokenize (`--badge-marketing`) in both themes or reuse `--warning`/`--signature` family. | design |
| S-17 | LOW | `ErrorBoundary.tsx:79`, `:82-90` | (a) Raw `error.message` shown to end users — can surface stack-y technical strings in the polished fallback. (b) Buttons use legacy `.btn .btn-primary` instead of the ui/ `Button` primitives mandated by the polish pass. | Always show `t('errorBoundary.defaultMessage')`; log `error.message` to console only. Swap to `ui-btn ui-btn--primary` classes (component is class-based, can't use the hook-y Button directly — classes are fine). | auto |
| S-18 | LOW | `register/page.tsx:10`, `forgot-password/page.tsx:9` | `import { authStyles } from '@/app/login/page'` — shared CSS lives in (and is exported from) a route page module. Fragile: Next.js route files should export route-only symbols; also re-injects the full style block per page. | Move `authStyles` to `src/components/auth/authStyles.ts` (or a CSS module) and import from all three pages. | auto |
| S-19 | LOW | `login/page.tsx:236`, `forgot-password/page.tsx:255` vs `register/page.tsx:439`; `login/page.tsx:171`, `register/page.tsx:267` | Inconsistent Suspense fallbacks (null = blank flash vs empty full-height div). GitHub OAuth buttons have no loading/disabled state — double-click fires duplicate sign-in redirects. | Use the full-height div fallback everywhere; add a `loading` state to the OAuth button (disable + spinner on click). | auto |
| S-20 | LOW | `Aurora.tsx:137` + whole file | Continuously-animating WebGL shader has no `prefers-reduced-motion` handling (FooterCta + mobile hero). Default `colorStops` are off-brand purple/green `#5227FF/#7cff67` — a footgun for future call sites. | Pause/render-once when reduced motion is preferred; change defaults to the brand stops used in FooterCta. | auto |
| S-21 | LOW | `src/app/forgot-password/` (no layout.tsx) | No metadata title — tab shows the stale root default ("…The Coach Solo Founders Don't Have"), while /login and /register set titles. | Add `layout.tsx` with `metadata = { title: 'Reset password' }` (mirror login/register pattern). | auto |
| S-22 | LOW | `LandingNav.tsx:148-152` vs `LandingV2Shell.tsx:14` | Nav hides section links AND the Sign-in link at ≤820px, but MobileLanding only takes over below 768px → 768-820px window where desktop landing has no sign-in in the nav (only in the footer). Pre-mount theme guess `'light'` (`:21`) can flash the wrong icon on dark systems. | Keep `.lnd-login` visible at 820px (only drop `.lnd-links`); render no icon until mounted. | auto |
| S-23 | LOW | `globals.css:360-373` (dup `.nav-link.active .nav-icon`), `:335+:355` (split `.nav-link:hover`), `:457-557` (team-switcher `!important` pile), `WorkspaceShell.tsx:103-426` (~300 lines of `html.light … !important` patches, `.v2-products-card` styled 3×) | CSS hygiene: duplicated selectors, split rules, and a light-theme implemented as a per-class `!important` override pile rather than tokens — the main source of light/dark parity bugs going forward. | Short term: dedupe the duplicated rules (auto). Long term: invert the v2 light patches into `--v2-*` token swaps (already half-done at `:47-68`) and delete the per-component overrides (design). | design |

---

## Per-Pillar Notes

### 1. Copywriting (2/4)
What's good: all three auth pages and the entire landing surface are fully wired through `next-intl` (`auth.*`, `landing.*` namespaces) — no hardcoded user-facing strings found on partially-translated surfaces, no generic "Submit/Click here" labels, error messages are mapped per error code (`login/page.tsx:49-55`), button labels change while loading ("Signing in…", "Sending code…"). The misses: S-07 (stale brand positioning in root metadata — the single highest-leverage copy bug in the repo), S-15 (raw enum badges), S-17a (raw error.message), S-21 (missing reset-password title).

### 2. Visuals (3/4)
The landing system (glass pills, dot field, aurora, terminal frame, pipeline diagram) is coherent, focal, and on-brand; glass effects correctly inherit `.glass-card` without stacking; no emojis anywhere in scope (Unicode glyphs only — `// `, `$`, `>` prompts). Deductions: S-05 (visibly broken native button on forgot-password), S-06 (TeamSwitcher icons/borders silently failing), S-04 (app chrome leaking onto a public auth page), dead `.mesh-blob` DOM.

### 3. Color (2/4)
Accent discipline is excellent — signature pink is used as the sole accent throughout landing/auth, semantic colors stay in iOS-system roles, and the 60/30/10 feel holds. But S-01 is a contrast BLOCKER on the most important elements on the page (primary CTAs) in the theme most visitors will get, S-13 shows the token system already drifting, S-16 introduces an off-palette hue, and S-10c means toasts ignore dark-mode semantics entirely.

### 4. Typography (3/4)
JetBrains Mono is consistently reserved for headings-as-data, labels, terminal content, and nav — matching the house system; Inter handles body; weights stay within 400-700. Deduction: the `--fs-*` type scale (globals.css:88-95) is defined but essentially unused on these surfaces — landing/auth hardcode ~18 distinct px/rem sizes (9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 17, 22, 28px, 0.78-2rem…). Visually coherent today, but nothing enforces it tomorrow.

### 5. Spacing (2/4)
A 4px-base scale (`--sp-1..8`) exists but is bypassed by raw values across all audited files; two concrete layout defects ship: S-08 (auth pages unscrollable when clipped — real task-completion risk on small laptops/zoom) and S-09 (880-970px overflow). Radii are mostly consistent (10/12px on landing, `--r-sm/md` elsewhere) with minor drift (38px icon tiles at radius 10 vs `--r-sm:14`).

### 6. Experience Design (2/4)
The auth forms are the best part of these surfaces: field-level validation on blur with error clearing on type, focus moved to first invalid field, `role="alert"`/`role="status"` regions, `aria-invalid` + `aria-describedby` via FormField (auto-id cloning), correct `autocomplete` (`email`, `current-password`, `new-password`, `one-time-code`, `nickname`), numeric OTP input with paste-friendly filtering, resend cooldown, open-redirect-safe callbackUrl handling, and a designed waitlist state. Deductions are systemic: S-03 (focus rings killed app-wide on inputs), S-02 (AT-invisible hero), S-10ab (silent, undismissable-by-keyboard toasts), S-11 (non-Radix dropdowns with no keyboard support), S-04, S-08.

---

## Light/Dark Parity Summary

- Signature tokens correct: `#c2357a` light / `#f0b8d0` dark (globals.css:53,175) — matches spec.
- `--accent-secondary` missing from `.light` block (drift, currently harmless).
- Toast colors (S-10) and FooterCta's blend-mode text colors are theme-aware by design; Toast is not.
- The v2 shell's light theme is an override pile, not a token swap (S-23) — parity bugs will keep coming from there.
- MobileLanding correctly flips tokens by scoping `.dark` locally (`mlnd-root dark`) — forced-dark mobile is intentional and token-safe.

## i18n Spot-Check (scoped per instructions)

All audited surfaces are already translated; the only bypasses found on otherwise-translated surfaces: `PipelineDiagram.tsx:115` raw enum badges (S-15) and root `layout.tsx` metadata (S-07, EN-only while landing metadata is localized). `MobileLanding.tsx:299` `{'// v2'}` is a version glyph, acceptable.

---

## Severity Counts

- BLOCKER: 2 (S-01, S-02)
- HIGH: 6 (S-03, S-04, S-05, S-06, S-07, S-08)
- MEDIUM: 6 (S-09, S-10, S-11, S-12, S-13, S-14)
- LOW: 9 (S-15 — S-23)
- Auto-fixable: 18 · Needs design decision: 5 (S-07, S-11, S-16, S-23 long-term; S-01 token values trivial but ink color choice should be eyeballed)

## Files Audited

`src/app/landing/{page,layout}.tsx`, `src/components/landing/{LandingV2Shell,LandingNav,Aurora,BlurText,DecryptedText,LandingDotField,MobileLanding,PipelineDiagram,SpotlightCard}.tsx`, `src/components/landing/sections/{HeroSection,CapabilitiesSection,HowItWorksSection,TerminalPreviewSection,FaqSection,FooterCta}.tsx`, `src/app/{login,register,forgot-password}/page.tsx` + layouts, `src/app/layout.tsx`, `src/app/globals.css` (tokens + targeted regions), `src/components/{AppShell,WorkspaceShell,TeamSwitcher,Toast,Select,ErrorBoundary,ThemeProvider,RecgonLogo}.tsx`, `src/components/ui/{FormField,Button,PasswordInput}.tsx` (spot-checks), `src/proxy.ts` (route classification), `src/components/v2/TopNavV2.tsx` (session gating spot-check).
