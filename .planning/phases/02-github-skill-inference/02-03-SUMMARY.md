---
phase: 02-github-skill-inference
plan: 03
subsystem: github-skill-inference
tags: [ui, api, oauth, consent, rejection-ui]
provides:
  - GET /api/teams/[id]/inferred-skills
  - PATCH /api/teams/[id]/inferred-skills/[skillId]
  - POST /api/teams/[id]/inferred-skills/scan
  - POST/DELETE /api/teams/[id]/inferred-skills/consent
  - PATCH /api/teams/[id]/inferred-skills/mark-reviewed
  - "src/app/teams/[id]/me/InferredFromGitHub.tsx (named + default export)"
  - "src/app/teams/[id]/me/GithubConsentSection.tsx (default export)"
  - "src/app/teams/[id]/me/ReviewBanner.tsx (default export)"
  - "src/lib/recgon/inferredSkillsStorage.ts helpers: getTeammateByTeamUser, getMiningStatus, markInferredSkillReviewed, clearMiningConsent, setMiningConsent"
  - "InferredSkillPatchBodySchema in src/lib/schemas.ts"
requires:
  - Plan 02-01 (inferredSkillsStorage, types, migration)
  - Plan 02-02 (worker registered, weekly cron)
affects:
  - "src/app/teams/[id]/me/page.tsx (RSC initial-data load)"
  - "src/app/teams/[id]/me/ProfilePageClient.tsx (lifted state + 5 handlers + OAuth return useEffect)"
  - "src/app/teams/[id]/me/ProfileForm.tsx (single-prop additive consentSection?)"
  - "src/app/teams/[id]/me/ProfilePreview.tsx (single-prop additive inferredSection?)"
  - "src/app/api/auth/callback/github/route.ts (new skill-mining variant; existing flow untouched)"
  - "architecture.md (5 new route rows + callback branch note)"
tech-stack:
  added:
    - "@testing-library/react ^16.3.2 (devDep)"
    - "@testing-library/dom ^10.4.1 (devDep)"
    - "jsdom ^29.1.1 (devDep)"
  patterns:
    - "Next 15 async params: { params: Promise<{ id: string }> }"
    - "verifyTeamAccess 404 (never 403) for team mismatch"
    - "IDOR triple-check (team -> row.teamId -> teammate user)"
    - "Optimistic UI in InferredFromGitHub with local Set<string> for reject"
    - "credentials: 'include' on every fetch"
key-files:
  created:
    - src/app/api/teams/[id]/inferred-skills/route.ts
    - src/app/api/teams/[id]/inferred-skills/[skillId]/route.ts
    - src/app/api/teams/[id]/inferred-skills/scan/route.ts
    - src/app/api/teams/[id]/inferred-skills/consent/route.ts
    - src/app/api/teams/[id]/inferred-skills/mark-reviewed/route.ts
    - src/app/teams/[id]/me/InferredFromGitHub.tsx
    - src/app/teams/[id]/me/GithubConsentSection.tsx
    - src/app/teams/[id]/me/ReviewBanner.tsx
    - src/__tests__/inferredSkills.api.test.ts
  modified:
    - src/lib/schemas.ts
    - src/lib/recgon/inferredSkillsStorage.ts
    - src/app/api/auth/callback/github/route.ts
    - src/app/teams/[id]/me/page.tsx
    - src/app/teams/[id]/me/ProfilePageClient.tsx
    - src/app/teams/[id]/me/ProfileForm.tsx
    - src/app/teams/[id]/me/ProfilePreview.tsx
    - architecture.md
    - vitest.config.ts
    - package.json
    - package-lock.json
decisions:
  - "Used inline GithubMark SVG instead of `lucide-react`'s `Github` (brand glyph dropped in newer versions). 14px, currentColor — drop-in for the CTA."
  - "Set vitest `environment: 'jsdom'` globally (was Node-only). Vitest 4 deprecated `environmentMatchGlobs`; global jsdom is the simpler equivalent. Existing server tests use vi.mock and don't touch the DOM, so no regression."
  - "Added 5 helpers to `inferredSkillsStorage.ts` rather than scattering supabase reads across routes. Profile storage doesn't expose `github_mining_consent_at` / `last_scan_at` (they live on the same row but are owned by the mining flow); `getMiningStatus` is the dedicated reader; `setMiningConsent` upserts the profile row when consent is granted by a teammate who hasn't yet opened the profile form."
  - "Optimistic reject state lives inside `InferredFromGitHub` as a local `Set<string>`. Parent owns the 6-second undo timer + PATCH. This matches `inferredSkills.ui.test.tsx`'s expectation that a click flips the DOM `data-rejected='true'` synchronously."
metrics:
  duration_minutes: 18
  completed_at: 2026-05-12T10:15:00Z
  task_count: 3
  file_count: 15
---

# Phase 2 Plan 03: User-visible inferred-skills UI — Summary

Ships the user-visible half of Phase 2: teammate grants consent inline on `/teams/[id]/me`, watches inferred-skill pills land in the right rail, accepts (default) or rejects each, sees the review banner on each fresh scan, and can Re-scan on demand or Stop mining permanently. The 5 API routes are auth-gated + IDOR-checked; the inferred-skills UI test turns GREEN; the API test ships 4/4 PASS covering the 412/429/200/404 branches grep+build alone cannot prove.

## What shipped

### 5 API routes

| Route | Method | Behavior |
|-------|--------|----------|
| `/api/teams/[id]/inferred-skills` | GET | Lists requesting teammate's rows + `lastScanAt` + `githubMiningConsentAt`. Self-only (`?userId=` returns 404 unless = session). |
| `/api/teams/[id]/inferred-skills/[skillId]` | PATCH | `InferredSkillPatchBodySchema`-validated `{rejected?, reviewed?}`. IDOR triple-check: team -> row.teamId -> teammate user. 404 on team mismatch (T-02-15), 403 on user mismatch. |
| `/api/teams/[id]/inferred-skills/scan` | POST | 412 `{error:'consent required'}` if no consent. 429 `{error:'rate_limited', retryAfterMin}` if `lastScanAt < 1h` ago (T-02-18). Else enqueues `github_skill_inference` job, returns `{ok, jobId}`. |
| `/api/teams/[id]/inferred-skills/consent` | POST | Builds GitHub OAuth URL with `repo` scope + sets `github_skill_mining_state` cookie (T-02-14, distinct from `github_connect_state`). Returns `{redirectUrl}`. |
| `/api/teams/[id]/inferred-skills/consent` | DELETE | Unsets `github_mining_consent_at`; preserves accepted/rejected rows (D-22). |
| `/api/teams/[id]/inferred-skills/mark-reviewed` | PATCH | Bulk-clears unreviewed via `markBannerReviewed(teammateId)`. |

### GitHub OAuth callback extension

`src/app/api/auth/callback/github/route.ts` now detects `github_skill_mining_state` cookie BEFORE `github_connect_state` (existing project-import flow untouched). On success: persists token + writes `teammate_profiles.github_mining_consent_at = now()` via `setMiningConsent`, redirects `/teams/{teamId}/me?github_skill_mining=connected`. On failure / state mismatch: redirects `/teams/{teamId}/me?github_skill_mining=failed`. teamId is decoded from the state cookie value (`${randomToken}.${teamId}`), not the URL — leaked URL states cannot redirect to an attacker-controlled teamId.

### 3 new components

| Component | Prop contract |
|-----------|---------------|
| `InferredFromGitHub` | `{ items: InferredSkill[]; lastScanAt?: string\|null; consented?: boolean; isScanning?: boolean; onReject: (id) => void; onUndoReject: (id) => void; onRescan?: () => void; rescanRateLimitedUntil?: number\|null }` — local `optimisticRejects` Set syncs to incoming `items` so optimistic flip is instant + reconciles cleanly. Re-scan disabled when rate-limited, tooltip explains time remaining. Pulse animation on the section card when scanning. Provenance chip maps source -> COMMIT-MINED / LANGUAGE STATS / EXTENSION / IMPORTS with Radix tooltip. |
| `GithubConsentSection` | `{ githubUsername?: string\|null; consentedAt: string\|null; onConnect: () => void; onStopMining: () => Promise<void>\|void }` — pre/post-consent states. Stop-mining opens Radix `AlertDialog` with locked copy. Uses inline `GithubMark` SVG (lucide-react dropped the brand glyph). |
| `ReviewBanner` | `{ count: number; onReview: () => void; onDismiss: () => Promise<void>\|void }` — returns null when `count <= 0`. Pluralization rule lives inside (`'1 new inferred skill — review'` vs `'{N} new inferred skills — review'`). 14px AlertCircle in signature pink; 3px left border. |

### ProfilePageClient state additions

- `inferredSkills` (state), `consentedAt`, `lastScanAt`, `isScanning`, `rescanRateLimitedUntil`
- `unreviewedCount` (useMemo)
- `undoTimersRef`, `undoUsedRef` for 6-second undo window
- 5 handlers: `handleReject` (timer-deferred PATCH), `handleUndoReject`, `handleRescan` (handles 429), `handleConnect` (POST consent then `window.location.assign`), `handleStopMining` (DELETE consent), `handleDismissBanner` (optimistic mark-reviewed), `handleReviewBannerClick` (`scrollIntoView`)
- `useEffect` on mount: reads `?github_skill_mining=` param, surfaces success/failure toast, calls `router.replace(pathname)` to clean URL

## Tests

### inferredSkills.api.test.ts — 4/4 PASS (new file)

- **Case 1** — `/scan` 412 on no-consent + `enqueueJob` never called.
- **Case 2** — `/scan` 429 + `retryAfterMin in [25, 35]` when `lastScanAt = 30m ago` + `enqueueJob` never called.
- **Case 3** — `/scan` 200 + `jobId` when `lastScanAt = 2h ago` + `enqueueJob` called with `kind: 'github_skill_inference'`.
- **Case 4** — PATCH `[skillId]` returns 404 when the row's `teamId !== params.id` + `rejectInferredSkill` never called + downstream `getTeammateUserId` never called.

Mirrors the vi.mock + supabase-chain pattern from `profileMerge.test.ts` and the auth-gating analog from `02-PATTERNS.md`.

### inferredSkills.ui.test.tsx — 1/1 PASS (Plan 02-01 RED -> Plan 02-03 GREEN)

The pre-existing RED test now passes: click on the reject button fires `onReject('inf-1')` AND the pill DOM gains `data-rejected="true"` synchronously (optimistic flip).

### Regression — 183 / 184 passing

Only `profileMerge.inferred.test.ts` remains RED — that's the explicit Plan 02-04 SKILL-04 contract, not a Plan 02-03 regression. All other Phase 1 + Plan 02-02 tests stay GREEN.

## Test count delta from Plan 02 baseline

- Plan 02-02 closed with 180/181 passing (including 5 new githubSkills tests).
- Plan 02-03 closes with 183/184 passing — net +3 tests (the 4-case `inferredSkills.api.test.ts` minus the 1 fixed UI test, plus 0 regressions).
- The single remaining RED test (`profileMerge.inferred.test.ts (b)`) is Plan 02-04's responsibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Missing dependency] Installed @testing-library/react + jsdom**
- **Found during:** Task 2 (component compilation).
- **Issue:** `inferredSkills.ui.test.tsx` already shipped in Plan 02-01 imports `@testing-library/react` and `render()` — but neither the testing-library packages nor a DOM environment were installed in `package.json` / `vitest.config.ts`. The test failed with `Cannot find package '@testing-library/react'` then `ReferenceError: document is not defined`.
- **Fix:** `npm i -D @testing-library/react @testing-library/dom jsdom` + set `vitest.config.ts` `test.environment: 'jsdom'` globally (vitest 4 deprecated `environmentMatchGlobs`; the existing server tests use vi.mock and don't read the DOM, so global jsdom doesn't regress them).
- **Files modified:** `package.json`, `package-lock.json`, `vitest.config.ts`.
- **Commit:** 46d7281.

**2. [Rule 3 — Missing icon] lucide-react dropped the `Github` brand glyph**
- **Found during:** Task 2 build.
- **Issue:** `import { Github } from 'lucide-react'` failed: `Module '"lucide-react"' has no exported member 'Github'`. lucide-react removed brand icons in a recent major.
- **Fix:** Inline a small 14px `GithubMark` SVG component inside `GithubConsentSection.tsx`. Matches `currentColor`, so it inherits the CTA white text. No new deps.
- **Files modified:** `src/app/teams/[id]/me/GithubConsentSection.tsx`.
- **Commit:** 46d7281.

### Architecture.md updates (per CLAUDE.md hook)

All 5 new routes added under the existing "Recgon Admin / Profile" route table; OAuth callback row updated with the new skill-mining branch note. No DB schema changes (Plan 01 already shipped `github_mining_consent_at` + `last_scan_at` columns).

### Authentication gates

The OAuth scope-upgrade flow (consent click → GitHub authorize → callback) is verified manually in Task 4 (human-verify checkpoint). CI cannot replay OAuth — see `02-VALIDATION.md`.

## Known Stubs

None. Every component renders real data fed from the server-side initial load (`page.tsx`'s `Promise.all([profile, team, teammate, mining, userRow])`) and the live API.

## Known follow-ups (intentional deferrals, NOT stubs)

- **Job-completion polling after Re-scan.** After POST `/scan` returns `{jobId}`, the UI sets `isScanning=true` (pulse animation) but does NOT poll `GET /api/llm/jobs/[id]` for completion. The user can refresh the page when the cron drain finishes; the pulse signals "scan is queued". Logged as `TODO(follow-up)` inline at the `handleRescan` callsite.
- **GitHub scope revocation on Stop-mining.** Today's `DELETE /consent` route unsets `github_mining_consent_at` only — that's enough to gate the worker (defense-in-depth per RESEARCH). A future enhancement could also call GitHub's `DELETE /applications/{client_id}/grant` to actively revoke the elevated `repo` scope.
- **Threat flag — token freshness.** `handleSkillMiningConsent` in the callback always overwrites `githubAccessToken` on the user row. If the user already had a `public_repo` token from Phase 1, the new `repo` token replaces it. This is intentional (broader scope is a superset), but if a user later revokes the elevated scope on GitHub's side without using our Stop-mining flow, the worker may keep trying. The breaker + per-job `{skipped: true, reason: 'no_token'}` path handles this gracefully.

## Threat Flags

None. The new routes consume existing trust boundaries (`session + verifyTeamAccess`); the OAuth flow lives behind a separate, validated cookie (`github_skill_mining_state`); the IDOR check is deterministic across the 5 routes.

## Self-Check: PASSED

- 5 API routes exist + compile (verified `npm run build`).
- 3 new components exist + compile + UI test GREEN.
- Architecture.md updated with new route rows + callback branch.
- Plan 02-03 commits in `main`: f6b1129, 46d7281, f1edde2.
- Banned-copy grep clean across all 3 new .tsx files.
- 183/184 tests GREEN (the 1 RED test is the intentional Plan 02-04 boundary).
- npm run build succeeds.
- npm run lint clean for every Plan 02-03 file.
