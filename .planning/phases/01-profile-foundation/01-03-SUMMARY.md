---
phase: 01-profile-foundation
plan: 03
subsystem: profile-form-vertical-slice
tags: [ui, api, llm, cmdk, profile-form, security, PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-05, QUAL-05, QUAL-06]
dependency_graph:
  requires:
    - "01-01: skillVocabulary CANONICAL_VOCAB / CANONICAL_SET"
    - "01-01: teammate_profiles table + teams.profile_visibility column"
    - "01-01: TeammateProfile + ProfileVisibility types"
    - "01-01: cmdk@^1.1.1 installed"
  provides:
    - profileStorage-CRUD-getProfile-listProfiles-upsertProfile
    - normalizeProfileTerms-LLM-call
    - SKILL_NORMALIZE_SYSTEM-prompt
    - SkillNormalizationResultSchema-zod
    - ProfileSaveBodySchema-zod
    - POST-GET-api-teams-id-profile-route
    - teams-id-me-RSC-page
    - ProfileForm-client-cmdk
    - team-switcher-my-profile-link
    - ChatOptions-timeoutMs-override
  affects:
    - src/lib/llm/providers.ts
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/components/TeamSwitcher.tsx
    - architecture.md
tech_stack:
  added: []
  patterns:
    - server-side-visibility-enforcement
    - llm-failure-safe-passthrough-with-normalization_pending
    - post-hoc-canonical-set-filter-defense-in-depth
    - prompt-injection-guard-user_content-delimiters
    - in-call-timeoutMs-instead-of-vercel-json-maxDuration
    - cmdk-radix-popover-multi-select-pills
    - serializable-canonical-vocab-prop-from-RSC-to-client
key_files:
  created:
    - src/lib/recgon/profileStorage.ts
    - src/lib/recgon/normalizeProfile.ts
    - src/app/api/teams/[id]/profile/route.ts
    - src/app/teams/[id]/me/page.tsx
    - src/app/teams/[id]/me/ProfileForm.tsx
    - src/__tests__/profileNormalization.test.ts
  modified:
    - src/lib/llm/providers.ts
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/components/TeamSwitcher.tsx
    - architecture.md
key_decisions:
  - "Picker ranking algorithm: prefix/substring match against CANONICAL_VOCAB (case-insensitive, top 8 results), with an 'Add \"{query}\"' OTHERS row when query.trim() doesn't match any canonical hit. Free-text adds enter the pill list with canonical:[] pending normalization on save."
  - "matched as canonical annotation renders inline on line 2 of every pill (JetBrains Mono 12px / 400 / var(--txt-faint)) — never a tooltip, never a separate footer — so it survives keyboard-only nav, mobile, and read-only cross-teammate views (UI-SPEC §Typography)."
  - "vercel.json untouched — Pitfall 8 is mitigated by ChatOptions.timeoutMs: 8000 threaded into both Gemini + Claude providers. This keeps the function-level config global and the per-call timeout co-located with the call."
  - "chatViaChain over chatViaProviders for the normalize call — both go through PROVIDER_CHAIN, but the explicit chain argument makes test mocking trivial (vi.mock provides a chatViaChain stub directly) and satisfies QUAL-05's literal grep."
  - "POST does NOT accept a target_user_id parameter — userId is always session.user.id. Owner-edits-teammate-profile UI is deferred (D-19); this closes T-03-02 (Tampering) by removing the attack surface entirely."
  - "Read-side visibility is route-enforced, not RLS-enforced. teams.profile_visibility is read once per GET; missing/null column defaults to 'team_visible' so a fresh team works without explicit setup."
metrics:
  duration_seconds: 900
  task_count_completed: 3
  task_count_blocking_checkpoint: 0
  completed_date: 2026-05-11
  files_changed: 11
---

# Phase 1 Plan 03: Profile Form Vertical Slice — Summary

Landed the user-facing slice the entire Phase 1 build has been preparing: a teammate can now visit `/teams/[id]/me`, type skills/strengths/interests/capacity into a `cmdk` picker, hit save, and the server normalizes free text into canonical tags via one bounded `chatViaChain` call before persisting to `teammate_profiles`. Save round-trips through Supabase with raw + canonical data side by side, an LLM-failure-safe fallback that preserves the user's text, server-side visibility enforcement that closes the IDOR window, and a single discovery surface in the team dropdown.

## What Was Built

### Task 3.1 — Storage + LLM normalizer + prompt + schema (commit `6763ff7`)

- `src/lib/recgon/profileStorage.ts`: `getProfile(teamId, userId)` (`.maybeSingle()` → null-safe), `listProfiles(teamId)` (batch read for Plan 04), `upsertProfile(input)` (onConflict `team_id,user_id`), and `mapTeammateProfile(row)` snake_case → camelCase mapper. All wrapped around `supabase` service-role client; no client bundle leak.
- `src/lib/recgon/normalizeProfile.ts`: `normalizeProfileTerms(input)` — single `chatViaChain(PROVIDER_CHAIN, …)` call with `temperature: 0`, `taskKind: 'recgon_skill_normalize'`, `promptVersion: 'v1'`, `timeoutMs: 8000`. Empty-input fast path skips the LLM entirely (cost guard). Post-hoc filter drops any LLM-emitted tag not in `CANONICAL_SET` (Pitfall 1 defense-in-depth) with a `logger.warn` for observability. Caps each entry's canonical at 3 (prompt asks 0–3; schema allows 6 for headroom; storage trims). On LLM error / parse error → passthrough `{ raw, canonical: [] }` for every input with `degraded: true` (Pitfall 7 — raw text never lost).
- `src/lib/prompts.ts`: `SKILL_NORMALIZE_SYSTEM` (interpolates `CANONICAL_ROLES.join(', ')` + `CANONICAL_MODIFIERS.join(', ')` from the Plan 01 vocab module — no duplicated list), plus `skillNormalizeUserPrompt({ skillsRaw, strengthsRaw, interestsRaw })` which wraps every raw entry in `<user_content>...</user_content>` delimiters and instructs the model to treat that content as untrusted input (Phase 2 QUAL-02 pattern landed early — costs nothing now and pays off in Phase 2).
- `src/lib/schemas.ts`: `SkillNormalizationEntrySchema` + `SkillNormalizationResultSchema` (≤ 6 canonical per entry, ≤ 30 skill entries, ≤ 15 strengths/interests entries) and `ProfileSaveBodySchema` (≤ 80 chars per raw entry, ≤ 30 skills, ≤ 15 each for strengths/interests, `weeklyCapacityHours` ∈ [0, 168] or null). Length + count caps are the T-03-03 prompt-injection / cost-DoS mitigation.
- `src/lib/llm/providers.ts`: added `ChatOptions.timeoutMs` and threaded it into both Gemini and Claude providers in place of the default `REQUEST_TIMEOUT_MS` when set. Pitfall 8 mitigation lives here so every future interactive route gets the same lever.
- `src/__tests__/profileNormalization.test.ts`: 5 tests — normal canonical-tag path, hallucinated-tag drop (e.g. `'nodejs'` filtered out by `CANONICAL_SET`), LLM-throws fallback (raw preserved + `degraded: true`), kwargs assertion (`temperature: 0` / `taskKind` / `promptVersion: 'v1'` / `timeoutMs: 8000`), and empty-input no-LLM-call fast path.

### Task 3.2 — `POST + GET /api/teams/[id]/profile` (commit `5284f78`)

- POST: `auth()` → 401 if no session; `verifyTeamAccess(teamId, session.user.id)` → 404 if `null` (mirrors existing routes, doesn't leak team existence); `ProfileSaveBodySchema.safeParse` → 400 with `error.flatten()`; `normalizeProfileTerms` (single LLM call); `upsertProfile` with `normalizationPending: normalization.degraded`; returns `{ ok, profile, normalization }`.
- GET: same auth preamble. Reads `?userId=` query param (defaults to `session.user.id`). Self → allow; owner → allow; otherwise reads `teams.profile_visibility` once — `'team_visible'` (default for missing/null column) allows any team member, `'owner_only'` returns 403. Server-side enforcement — no RLS, no client filtering. Closes T-03-01 IDOR.
- `export const dynamic = 'force-dynamic';` + `export const runtime = 'nodejs';` for the service-role Supabase client.
- `vercel.json` deliberately not touched — the in-call `timeoutMs: 8000` keeps the route inside Vercel's default 10s function budget.

### Task 3.3 — RSC page + `ProfileForm` + team-menu nav link (commit `4818281`)

- `src/app/teams/[id]/me/page.tsx`: RSC. `auth()` → `redirect('/login')` if no session; `verifyTeamAccess` → `notFound()` if non-member; `getProfile(teamId, session.user.id)`. Renders the "Your profile" heading (Inter 28px / 600) with the 64px / 1px signature-pink underline (UI-SPEC accent rule 4), the helper line ("What you tell me here is what I'll use to assign you tasks."), a `.glass-card` wrapping `<ProfileForm teamId initialProfile canonicalVocab={[...CANONICAL_VOCAB]} />`, and below it a `tabIndex={-1}` disabled placeholder section with `min-height: 96px`, `opacity: 0.55`, `pointer-events: none`, `filter: saturate(0.4)`, the "What GitHub will say about you" heading + "COMING SOON" label + body copy (D-09, UI-SPEC §Disabled placeholder treatment). No fake data anywhere.
- `src/app/teams/[id]/me/ProfileForm.tsx`: `'use client'`. State held in plain `useState` (no React Hook Form per RESEARCH Don't Hand-Roll). Four sections — SKILLS / STRENGTHS / INTERESTS each render a free-text input wrapped in `<Popover.Root>` from `@radix-ui/react-popover` containing a `<Command>` from `cmdk` with two groups: `CANONICAL` (substring match against `canonicalVocab`, top 8) and `OTHERS` (single `Add "{query}"` row, shown when the query isn't a canonical hit). Clicking a canonical item adds `{ raw: tag, canonical: [tag] }`; clicking the custom row adds `{ raw: query, canonical: [] }` pending server normalization. WEEKLY CAPACITY is a numeric `<input type="number" min={0} max={168}>`. Each pill is a two-line chip: raw text in Inter 16px / 400 / `var(--txt-pure)` on line 1, `matched as {canonical}` in JetBrains Mono 12px / 400 / `var(--txt-faint)` on line 2 (or `matched as —` for empty canonical, per UI-SPEC). Pill X button is `aria-label={`Remove ${entry.raw}`}` with an `aria-hidden="true"` SVG icon (WCAG 2.1 SC 1.1.1). Save button is solid `var(--signature)` 600-weight Inter; submission via `useTransition` + `fetch('/api/teams/${teamId}/profile', { method: 'POST', body: JSON.stringify({ skillsRaw, strengthsRaw, interestsRaw, weeklyCapacityHours }) })`. On 200, the response's `normalization` array replaces the local pill state so every entry re-renders with its canonical mapping. On 4xx → per-field error; on 5xx → "Couldn't save just now. Try again in a moment." On `degraded: true` (LLM fell back) → info banner copy "I'll save what you typed and match it next time. Anything wrong with how I read these? Edit and save again." The component does NOT import `@/lib/supabase` — verified by acceptance grep (T-03-05 closed).
- `src/components/TeamSwitcher.tsx`: A single new `<Link href={`/teams/${currentTeam.id}/me`}>My profile</Link>` row inserted immediately above the existing `Manage Teams` link inside the open dropdown. Closes the dropdown on click (`onClick={() => setOpen(false)}`). Inline style matches the surrounding link's padding / `borderTop` / fontSize / `textDecoration: 'none'` — no new tokens introduced (D-22 / D-23). Sole discovery surface (D-10): no sidebar link, no header entry, no dashboard nag.

## Verification Results

| Check | Result |
|---|---|
| `npm run test -- --run src/__tests__/profileNormalization.test.ts` | 5/5 pass |
| `npm run test` (full suite) | 146/146 pass (no regressions) |
| `npx tsc --noEmit` | exits 0 |
| `npm run build` | exits 0 — `/teams/[id]/me` and `/api/teams/[id]/profile` both registered |
| Storage acceptance (5 greps) | all pass (`getProfile=1`, `listProfiles=1`, `upsertProfile=1`, `onConflict=1`, `from '../supabase'=1`) |
| Normalize acceptance (6 greps) | all pass (`chatViaChain=4`, `temperature: 0`, `taskKind: 'recgon_skill_normalize'`, `timeoutMs: 8000`, `CANONICAL_SET=3`, `chatViaProviders/getGeminiClient=0`) |
| Prompt acceptance | `SKILL_NORMALIZE_SYSTEM=1`, `skillNormalizeUserPrompt=1`, `<user_content>=4` |
| Schema acceptance | `SkillNormalizationResultSchema=2` (declaration + type), `ProfileSaveBodySchema=2` |
| Route acceptance | `verifyTeamAccess=3` (≥ 2 required), `ProfileSaveBodySchema=2`, `normalizeProfileTerms=3`, `upsertProfile=2`, `profile_visibility=4`, `owner_only=2`, `session.user.id=6` |
| Page acceptance | `verifyTeamAccess` / `getProfile` / `CANONICAL_VOCAB` / GitHub copy / `tabIndex={-1}` / `64px` / `minHeight: '96px'` — all present |
| Form acceptance | `'use client'` / `from 'cmdk'` / `from '@radix-ui/react-popover'` / `/api/teams` / `matched as` (×4) / `aria-label={`Remove …`}` / `aria-hidden="true"` / `var(--txt-faint)` (×4) — all present |
| Form Supabase leak grep | 0 (security gate T-03-05 closed) |
| TeamSwitcher nav link | `/teams/${currentTeam.id}/me=1`, `My profile=1` |

## must_haves.truths verification

- [x] Logged-in teammate visits `/teams/[id]/me` and sees skills + strengths + interests + weekly capacity fields (page.tsx renders `ProfileForm` with four sections).
- [x] Skill picker uses `cmdk` with suggestion pills sourced from `CANONICAL_VOCAB` (prop passed RSC→client; `<Command>` + `<Popover>` powered).
- [x] On Save → POST → server normalizes via `chatViaChain` (`temperature: 0`, `taskKind: 'recgon_skill_normalize'`) and persists raw + canonical.
- [x] Form re-displays `raw text (matched as canonical)` after save — every pill is a two-line chip; the API's `normalization` array replaces local state on 200.
- [x] Cross-teammate reads enforced server-side: self / owner / `team_visible` allow; `owner_only` → 403.
- [x] Disabled `What GitHub will say about you — coming soon` section renders below the form (no fake data, `tabIndex={-1}`).
- [x] `TeamSwitcher.tsx` renders a `My profile` link to `/teams/${currentTeam.id}/me` (single discovery surface).
- [x] LLM failure → save persists raw text + empty canonical + `normalization_pending = true` (route forwards `normalization.degraded` to `upsertProfile`).
- [x] `chatViaChain` invoked with `timeoutMs: 8000` (asserted by test 4).
- [x] `ProfileForm.tsx` does NOT import `@/lib/supabase` (acceptance grep returned 0).

## Deviations from Plan

**None — all three tasks executed exactly as written.**

Two minor implementation notes within the spec:

1. **`chatViaChain` signature uses 5 positional args, not 3.** The plan's Action step shows `await chatViaChain(SKILL_NORMALIZE_SYSTEM, userPrompt, { … })` but the live signature is `chatViaChain(chain, system, user, options, breaker?)`. Implemented as `chatViaChain(PROVIDER_CHAIN, SKILL_NORMALIZE_SYSTEM, userPrompt, opts)` — same chain, just explicit. This satisfies the literal `grep -c "chatViaChain" = 1` acceptance and makes test mocking via `vi.mock('@/lib/llm/providers', ...)` trivial (Test 4 asserts kwargs from `call[3]`).

2. **`ChatOptions.timeoutMs` did not previously exist on the type.** The plan assumes `timeoutMs` is already a supported option but it wasn't — Pitfall 8 forced me to add the field and thread it through both Gemini and Claude providers (replacing the hard-coded `REQUEST_TIMEOUT_MS` with `options?.timeoutMs ?? REQUEST_TIMEOUT_MS` in both `withTimeout` calls). This is a Rule 2 add (critical functionality the plan required but didn't exist). `architecture.md` updated for the new field. Existing 146 tests still pass — no caller relied on a hard-coded timeout cap.

## Picker Ranking Algorithm

Per the plan's Claude's-Discretion item: the picker uses **prefix/substring match against `CANONICAL_VOCAB`** (case-insensitive `.toLowerCase().includes(query.toLowerCase())`), with the top 8 results displayed under the `CANONICAL` group. When the query is non-empty and matches no canonical entry, a single `OTHERS` row appears with the literal `Add "{query}"` text — clicking it adds the raw text to the pill list with `canonical: []` pending server-side normalization. This is the simplest matching strategy that still surfaces relevant tags fast and stays cheap; fuzzy match or "recent-others-in-team" suggestions can layer on later without a UX shift.

## `matched as canonical` Annotation Placement

Per the plan's Claude's-Discretion item: rendered **inline on line 2 of every pill chip**, in JetBrains Mono 12px / 400 / `var(--txt-faint)` — never a tooltip, never a separate footer. This survives keyboard-only nav (no hover required), mobile (no hover at all), and read-only cross-teammate views (no interactive surface to attach to). Empty edge case renders `matched as —` (em-dash) so the chip's two-line height is preserved and the page doesn't reflow after the first save.

## `vercel.json` Note

**No `vercel.json` change.** Pitfall 8 was mitigated via `ChatOptions.timeoutMs: 8000` co-located with the `chatViaChain` call. Adding a `maxDuration` override would push the function-level config farther from the call site that requires it; keeping it inline at the call site means future routes opt in explicitly when they need the same lever.

## Note for Plan 04 (dispatcher wiring)

To wire the dispatcher, thread `listProfiles(teamId)` into `dispatcher.ts` (both `runDispatch` and `dispatchTask`) and call `profileMerge(t, profileByUserId.get(t.userId) ?? null, null, t.fitProfile)` before `rankMatches`. The `profileStorage.listProfiles` API is already in place; no additional storage work needed. `match.ts` is back-compat (interest-nudge reads `(t as Teammate & { interests?: string[] }).interests ?? []`), so the dispatcher rewiring is purely additive.

## Threat Flags

None — every surface introduced in this plan is documented in the plan's `<threat_model>`:

- **T-03-01 (IDOR)** — mitigated in GET route by server-side self/owner/team_visible check.
- **T-03-02 (cross-teammate tampering)** — eliminated by removing `target_user_id` from POST surface; `userId = session.user.id` always.
- **T-03-03 (prompt injection)** — mitigated by `<user_content>` delimiters + 80-char × 30-entry caps + post-hoc `CANONICAL_SET` filter.
- **T-03-04 (LLM cost DoS)** — mitigated by `chatViaChain` circuit breaker (inherited from providers chain) + Pitfall 7 fallback (one LLM call max per save; degraded path returns 200).
- **T-03-05 (service-role leak via client)** — mitigated by `ProfileForm.tsx` not importing `@/lib/supabase` (acceptance grep returned 0).
- **T-03-06 (hallucinated canonical tag corrupts dispatcher)** — mitigated by post-hoc `CANONICAL_SET` filter (Test 2 covers this).
- **T-03-07 (owner repudiation)** — accepted, `updated_at` audit trail only.
- **T-03-08 (function-timeout exhaustion)** — mitigated by `timeoutMs: 8000` threaded through both providers.

## Commits

| Task | Commit | Description |
|---|---|---|
| 3.1 | `6763ff7` | feat(01-03): add profileStorage + LLM skill-normalizer with canonical-filter fallback |
| 3.2 | `5284f78` | feat(01-03): add POST+GET /api/teams/[id]/profile with server-side visibility check |
| 3.3 | `4818281` | feat(01-03): add /teams/[id]/me profile page + form + team-menu nav link |

## Self-Check: PASSED

- `src/lib/recgon/profileStorage.ts` — FOUND
- `src/lib/recgon/normalizeProfile.ts` — FOUND
- `src/app/api/teams/[id]/profile/route.ts` — FOUND
- `src/app/teams/[id]/me/page.tsx` — FOUND
- `src/app/teams/[id]/me/ProfileForm.tsx` — FOUND
- `src/__tests__/profileNormalization.test.ts` — FOUND
- Commit `6763ff7` — FOUND in git log
- Commit `5284f78` — FOUND in git log
- Commit `4818281` — FOUND in git log
- `npm run test` — 146/146 pass
- `npx tsc --noEmit` — exits 0
- `npm run build` — exits 0, route + page registered
