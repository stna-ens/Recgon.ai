---
phase: 02-github-skill-inference
verified: 2026-05-12T13:30:00Z
status: human_needed
score: 5/5 must-haves verified (3 pending end-to-end human UAT)
verdict: ACHIEVED (pending human-verify smoke)
re_verification:
  previous_status: null
  previous_score: null
human_verification:
  - test: "OAuth consent + scan + reject + dispatch end-to-end smoke"
    expected: "Connect GitHub on /teams/[id]/me → inferred-skill pills land after cron drain → reject a pill → dispatch never mints a task referencing that rejected tag"
    why_human: "OAuth callback redirects + visible pulse animation + cron-drained job completion cannot be replayed in CI; ROADMAP success criterion #5 is end-user observable"
  - test: "GithubConsentSection + ReviewBanner visual fidelity vs 02-UI-SPEC.md"
    expected: "Pre-consent CTA, post-consent meta strip, Stop-mining AlertDialog, ReviewBanner pluralization + signature pink border render per spec"
    why_human: "Visual fidelity / typography / signature-pink contrast cannot be grep'd"
  - test: "Operator: npm install + Vercel redeploy"
    expected: "@octokit/rest@^22 + plugin-throttling + plugin-paginate-rest installed; weekly cron at /api/cron/github-skill-inference Sunday 06:00 UTC registered; CRON_SECRET env var set in Vercel prod"
    why_human: "Deployment + env-var configuration are operator actions outside the codebase"
---

# Phase 2: GitHub Skill Inference — Verification Report

**Phase Goal:** A teammate grants consent on `/teams/[id]/me`; weekly cron drains the LLM job queue, mines their GitHub commits via Octokit, runs Standard-depth LLM inference, upserts to `teammate_inferred_skills`; new inferred-skill pills surface with accept/reject + review banner + Re-scan/Stop-mining; inferred skills affect dispatch via a three-source blend in `profileMerge`. **Success criterion:** a teammate who rejected Python never sees a Python task minted off the inferred-Python signal alone.

**Verified:** 2026-05-12T13:30:00Z
**Status:** ACHIEVED in code — 3 human-verify gates remain (expected per plan checkpoints)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A teammate can grant explicit consent to GitHub mining on `/teams/[id]/me`, with consent timestamp persisted to `teammate_profiles`.           | ✓ VERIFIED | `GithubConsentSection.tsx` renders pre/post-consent states; `POST /api/teams/[id]/inferred-skills/consent` returns GitHub OAuth URL; `/api/auth/callback/github/route.ts` writes `github_mining_consent_at` via `setMiningConsent`; `me/page.tsx` calls `getMiningStatus` server-side. |
| 2   | A weekly cron enqueues `github_skill_inference` jobs; the worker mines commits via Octokit (6-month window, team repos only) and runs Standard-depth LLM inference. | ✓ VERIFIED | `vercel.json` cron entry `{path:"/api/cron/github-skill-inference", schedule:"0 6 * * 0"}`; `runGithubSkillInference` worker registered in `src/lib/llm/workers.ts` `WORKERS` table; `JobKind` extended in `jobQueue.ts`; `githubSkills.ts` `mineCommitsForTeammate` enforces 6-month window + 200-commit cap; `resolveTeamConnectedRepos` filters by `team_id` (no personal repos). |
| 3   | Inferred-skill rows are upserted to `teammate_inferred_skills` and surface on `/teams/[id]/me` with accept (default) / reject controls.       | ✓ VERIFIED | `runScan` calls `upsertInferredSkill` (two-step lookup-then-update preserves `rejected_at`); `ProfilePageClient.tsx:388` renders `<InferredFromGitHub items={inferredSkills} …>`; `PATCH /api/teams/[id]/inferred-skills/[skillId]` accepts `{rejected, reviewed}`. |
| 4   | A review banner surfaces unreviewed pills + Re-scan / Stop-mining controls on the same page.                                                  | ✓ VERIFIED | `ReviewBanner.tsx` (returns null when count<=0); `ProfilePageClient.tsx:352` wires `<ReviewBanner count={unreviewedCount} onReview={…} onDismiss={…}>`; `POST /api/teams/[id]/inferred-skills/scan` returns 412/429/200; `DELETE /api/teams/[id]/inferred-skills/consent` for Stop-mining. |
| 5   | Inferred skills affect dispatch via a three-source blend (self 0.5 / inferred 0.3 / EMA 0.2) with read-time `applyTimeDecay` (τ=90d). Rejected rows excluded. | ✓ VERIFIED | `profileMerge.ts:42-51` exports `WEIGHT_SELF/INFERRED/EMA/BLEND_THRESHOLD`; `profileMerge.ts:121` `if (row.rejectedAt !== null) continue` (defense-in-depth on top of SQL `.is('rejected_at', null)`); `applyTimeDecay` applied to both inferred + EMA; `dispatcher.ts:149,440` calls `listActiveInferredSkillsForTeam` once per `runDispatch`/`dispatchTask`. |

**Score:** 5/5 truths verified (success criterion provably honored by `profileMerge.inferred.test.ts` Case 5 + `dispatcher.threeSourceBlend.test.ts` Case 2 — both GREEN).

---

## Required Artifacts

| Artifact                                                                | Expected                                            | Status      | Details                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260513_inferred_skills.sql`                      | DDL: table + indexes + trigger + additive cols      | ✓ VERIFIED  | Applied to production DB (eu-west-1); column count = 12; 3 indexes verified via `pg_indexes`.        |
| `src/lib/recgon/types.ts`                                               | 4 new exports                                       | ✓ VERIFIED  | `InferredSkill`, `InferredSkillMap`, `InferredSkillSource`, `UpsertInferredSkillInput` present.       |
| `src/lib/recgon/inferredSkillsStorage.ts`                               | 9 CRUD fns + `listActiveInferredSkillsForTeam`      | ✓ VERIFIED  | 14k file. `listActiveInferredSkillsForTeam` SQL `.eq('team_id').is('rejected_at', null)`.            |
| `src/lib/recgon/githubSkills.ts`                                        | `runScan` + cheap/standard/deep + Octokit factory   | ✓ VERIFIED  | 23k file. `wrapUntrusted` applied at prompt-build time; `listRejectedTags` consulted BEFORE upsert.   |
| `src/lib/recgon/profileMerge.ts`                                        | 3-source blend math                                 | ✓ VERIFIED  | Weighted sum + decay + threshold + rejected-row exclusion confirmed.                                  |
| `src/lib/recgon/dispatcher.ts`                                          | Threads `inferredByTeammate` through both entry pts | ✓ VERIFIED  | `listActiveInferredSkillsForTeam` called at lines 149 (`runDispatch`) and 440 (`dispatchTask`).      |
| `src/lib/llm/utils.ts` (`wrapUntrusted`)                                | Strip → truncate → wrap                             | ✓ VERIFIED  | Strip order is load-bearing; replacement glyph `⟦⟧`; 2000-char cap.                                  |
| `src/lib/llm/workers.ts` (`runGithubSkillInference`)                    | Worker registered in `WORKERS`                      | ✓ VERIFIED  | Token re-fetched at run time (T-02-07); payload contains only `{teammateId, teamId, userId}`.        |
| `src/app/api/cron/github-skill-inference/route.ts`                      | Weekly enqueue with `CRON_SECRET` gate              | ✓ VERIFIED  | `isAuthorized` checks `Authorization: Bearer ${CRON_SECRET}` (dev skipped); both GET/POST handlers.   |
| 5 `/api/teams/[id]/inferred-skills/**` routes                            | session + verifyTeamAccess on all                   | ✓ VERIFIED  | All 5 files import `verifyTeamAccess`; PATCH `[skillId]` does IDOR triple-check (team→row.teamId→teammate user). |
| `InferredFromGitHub.tsx`, `GithubConsentSection.tsx`, `ReviewBanner.tsx` | Real-data components                                | ✓ VERIFIED  | All three exist; `ProfilePageClient.tsx` imports + renders all three.                                 |
| `vercel.json`                                                           | functions config + weekly cron                      | ✓ VERIFIED  | `maxDuration:60` on cron route; `schedule:"0 6 * * 0"` (Sunday 06:00 UTC).                           |

---

## Key Link Verification

| From                              | To                                                | Via                                                          | Status   |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `runDispatch`                     | `profileMerge` (3-source)                         | `listActiveInferredSkillsForTeam` → `applyProfileMerge`      | ✓ WIRED |
| `dispatchTask`                    | `profileMerge` (3-source)                         | `listActiveInferredSkillsForTeam` → `applyProfileMerge`      | ✓ WIRED |
| Cron route                        | `llm_jobs` queue                                   | `enqueueJob({kind:'github_skill_inference', payload:...})`    | ✓ WIRED |
| Per-minute drain                  | `runGithubSkillInference` worker                  | `WORKERS['github_skill_inference']` table entry              | ✓ WIRED |
| Worker                            | Octokit                                           | `createThrottledOctokit(token)` + 200-commit cap             | ✓ WIRED |
| Worker LLM call                   | `chatViaChain` w/ `taskKind:'github_skill_inference'` | `standardLLMInference` + post-hoc CANONICAL_SET filter         | ✓ WIRED |
| Worker upsert                     | `teammate_inferred_skills`                        | `upsertInferredSkill` (two-step, preserves `rejected_at`)    | ✓ WIRED |
| `/me` page initial load           | `getMiningStatus` server-side                     | `me/page.tsx:42`                                              | ✓ WIRED |
| Reject UI click                   | `PATCH .../[skillId]` w/ IDOR triple-check        | `handleReject` → 6s undo → fetch PATCH                       | ✓ WIRED |
| GitHub OAuth callback (mining)    | `setMiningConsent(teamId, userId)`                | distinct `github_skill_mining_state` cookie (vs `github_connect_state`) | ✓ WIRED |

---

## Requirements Coverage

| Req       | Description                                                                                       | Status                | Evidence                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SKILL-01  | Explicit consent on profile page; consent timestamp stored.                                       | ✓ SATISFIED           | `GithubConsentSection.tsx`; callback writes `github_mining_consent_at`; `teammate_profiles` additive column.                                        |
| SKILL-02  | `github_skill_inference` job kind mines team-connected repos in rolling 6-month window.           | ✓ SATISFIED           | `JobKind` extended; `mineCommitsForTeammate` 6-month + 200-commit cap; `resolveTeamConnectedRepos` filters by `team_id`. (REQUIREMENTS.md table is stale — labelled Pending but code ships.) |
| SKILL-03  | Inferred skills stored in `teammate_inferred_skills`, separate from self-declared.                | ✓ SATISFIED           | Migration applied; storage module 9 CRUD fns; upsert preserves lifecycle cols.                                                                      |
| SKILL-04  | `profileMerge` 3-source blend without overwriting any source.                                     | ✓ SATISFIED           | `profileMerge.ts:42-51` weights; `profileMerge.inferred.test.ts` 5/5 GREEN.                                                                         |
| SKILL-05  | Inferred-skill review UI + per-row reject; rejected excluded from `profileMerge`.                 | ✓ SATISFIED           | `InferredFromGitHub.tsx` reject UI; SQL filter + in-merge guard; `dispatcher.threeSourceBlend.test.ts` Case 2.                                       |
| SKILL-06  | `applyTimeDecay` with τ=90d in `fitLearning.ts`.                                                  | ✓ SATISFIED           | `fitLearning.ts` exports `DECAY_TAU_DAYS=90` + `applyTimeDecay`; `fitLearning.timeDecay.test.ts` 5/5 GREEN.                                          |
| QUAL-02   | User-controlled content wrapped in `<user_content>` before LLM calls.                             | ✓ SATISFIED           | `wrapUntrusted` strip-then-truncate-then-wrap; `wrapUntrusted.test.ts` 4/4 GREEN; system prompt restates the contract. (REQUIREMENTS.md table stale.) |

**Note:** REQUIREMENTS.md status table at lines marking SKILL-02 + QUAL-02 as "Pending" is stale relative to shipped code — recommend table refresh post-UAT.

---

## Test Status

| Suite                                                  | Result               |
| ------------------------------------------------------ | -------------------- |
| Full `npm run test` (vitest run)                       | **189 passed, 6 skipped, 0 failed** (30 files passed, 1 skipped) |
| `npx tsc --noEmit`                                     | Clean (no output)    |
| `profileMerge.inferred.test.ts`                        | 5/5 GREEN (incl. rejected-Python case)                |
| `dispatcher.threeSourceBlend.test.ts`                  | 4/4 GREEN            |
| `inferredSkills.api.test.ts`                           | 4/4 GREEN (412/429/200/404 branches)                 |
| `inferredSkills.ui.test.tsx`                           | 1/1 GREEN            |
| `githubSkills.mining.test.ts` / `consent` / `empty`   | 7/7 GREEN            |
| `wrapUntrusted.test.ts`                                | 4/4 GREEN            |
| `fitLearning.timeDecay.test.ts`                        | 5/5 GREEN            |
| `inferredSkillsStorage.listActiveForTeam.test.ts`     | 6 skipped (env-gated `LOCAL_SUPABASE_TEST=1`) — acceptable per plan |

---

## Security Gate Checklist

| Gate                                                                                              | Status     |
| ------------------------------------------------------------------------------------------------- | ---------- |
| All 5 inferred-skills API routes verify `auth()` + `verifyTeamAccess` (404 not 403 on mismatch).  | ✓ PASS    |
| `PATCH .../[skillId]` performs IDOR triple-check (team → row.teamId → teammate user).             | ✓ PASS    |
| Cron route requires `Authorization: Bearer ${CRON_SECRET}` in prod (dev skip preserved).          | ✓ PASS    |
| `wrapUntrusted` applied to every Octokit-fetched commit before LLM prompt (`githubSkillInferenceUserPrompt`). | ✓ PASS    |
| `wrapUntrusted` order = strip → truncate → wrap (smuggled `</user_content>` neutralized).         | ✓ PASS    |
| Rejected rows filtered at SQL level (`.is('rejected_at', null)`) AND in `profileMerge` loop.      | ✓ PASS (defense-in-depth) |
| `listRejectedTags` consulted BEFORE worker upsert (T-02-11).                                      | ✓ PASS    |
| GitHub OAuth mining callback uses distinct cookie (`github_skill_mining_state`) vs project-import flow. | ✓ PASS    |
| Worker token re-fetched via `getUserById` at run time (never in job payload — T-02-07).           | ✓ PASS    |
| `resolveTeamConnectedRepos` filters by `team_id` — personal repos cannot leak (T-02-08).          | ✓ PASS    |
| Octokit throttle hooks cap retries at 1 — no runaway cost (T-02-12).                              | ✓ PASS    |
| Single batch SQL load for inferred skills (no N+1 — T-02-22).                                     | ✓ PASS    |

---

## Anti-Patterns Scan

| Concern                                              | Result                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TODOs / FIXMEs / placeholder copy in Phase 2 files   | One acknowledged `TODO(follow-up)` at `ProfilePageClient.tsx` `handleRescan` (job-completion polling — explicit deferral, see Plan 02-03 §Known follow-ups). Not a stub. |
| Hardcoded empty arrays / `return []` stubs           | None in Phase 2 surface. (`resolveTeamConnectedRepos` returns `[]` only in catch-path defensive guard, routed to `no_team_repos` skip — by design.) |
| Console-log-only handlers                            | None.                                                                                                                                |
| Static returns where DB queries expected             | None.                                                                                                                                |
| Lint warnings introduced                             | 4 pre-existing errors + 7 pre-existing `no-img-element` warnings logged to `deferred-items.md` (all OUTSIDE Phase 2 allow-list).    |

---

## Deep-Depth Stub (Acknowledged)

`deepImportInference` (`githubSkills.ts`) is a wired stub — the branch executes when `teams.inference_depth='deep'` but only emits canonical tags via a small filename-extension package map. The full blob walker is logged as a follow-up in `deferred-items.md`. Phase 2's vertical slice runs at **Standard** depth (default) and is unaffected. Not a goal-failure.

---

## Pending Human Verification

| # | Item                                                                                                                                                                                                                                                       | Owner             |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1 | **End-to-end smoke** (Plan 02-04 Task 3): Connect GitHub on `/teams/[id]/me` → wait for cron drain → confirm pills appear → reject one → run dispatch → verify rejected tag never appears in mint reasoning. ROADMAP success criterion #5.                  | Operator (manual) |
| 2 | **OAuth visual UAT** (Plan 02-03 Task 4): Click "Connect GitHub" → GitHub authorize page → callback redirects to `/teams/{teamId}/me?github_skill_mining=connected` → toast surfaces.                                                                       | Operator (manual) |
| 3 | **Operator action**: `npm install` (Octokit deps) + Vercel redeploy (so the weekly cron entry registers) + verify `CRON_SECRET` env var in Vercel prod.                                                                                                    | Operator (deploy) |

---

## Recommendations / Next-Phase Readiness

1. **Phase 2 is code-complete.** All five must-haves verified; success criterion provably honored in code + tests. Tests/tsc/build clean.
2. Run the three pending UAT items before considering the phase fully shipped.
3. Refresh REQUIREMENTS.md status table — SKILL-02 and QUAL-02 are mislabelled Pending.
4. Phase 3 may proceed in parallel with the UAT smoke — there are no code-blocking gaps.

---

_Verified: 2026-05-12T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
