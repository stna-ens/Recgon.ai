# Roadmap: Recgon — Smarter AI Product Manager v3

## Overview

Recgon v3 evolves the dispatcher from pure math into an explainable, manager-feeling AI Product Manager. The journey: teammates first declare who they are (Phase 1), GitHub fills in the gaps (Phase 2), an LLM tiebreaker picks the best fit on close calls with reasoning (Phase 3), the AI reframes each task in the assignee's voice (Phase 4), then the brain finally sees live code changes and turns them into bounded tasks (Phases 5-6). Every phase is independently shippable end-to-end — at the end of Phase 1 a real teammate can already self-declare skills and the dispatcher already uses them.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Profile Foundation** — Teammates self-declare skills + capacity; dispatcher reads through `profileMerge`.
- [ ] **Phase 2: GitHub Skill Inference** — Commit history seeds skills with consent, confirm/reject UI, and time-decayed EMA.
- [ ] **Phase 3: LLM Judgment Overlay** — On close fit-score calls, an anonymized batched LLM tiebreaker picks the final assignee with a structured "why".
- [ ] **Phase 4: Personalized Task Framing** — Queued reframe job rewrites each assigned task in the assignee's voice with where-to-start pointers.
- [ ] **Phase 5: Live Code Infrastructure** — Incremental analyzer + per-file SHA cache; tree-sitter and Octokit added as server-only deps.
- [ ] **Phase 6: Brain Integration & Cost Guards** — Brain consumes `LiveCodeDelta[]`; mint caps, WIP gate, cool-down, and v3 telemetry land.

## Phase Details

### Phase 1: Profile Foundation
**Goal:** A teammate can self-declare skills, strengths, interests, and weekly capacity at `/teams/[id]/me`, and the dispatcher uses that data on the next cron cycle via a new pure `profileMerge` read-path — with zero schema mutation on `agent_teammates`.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, PROFILE-06, QUAL-05, QUAL-06
**Success Criteria** (what must be TRUE):
  1. A teammate navigates to `/teams/[id]/me`, fills in skills (using the shared canonical vocabulary), strengths, interests, and weekly capacity, saves, and sees the values reflected on reload.
  2. After saving, the very next dispatcher cron run assigns at least one task whose `requiredSkills` match the teammate's new self-declared skills using `match.ts` math that consumed the merged profile (verifiable via assignment audit + manually triggered cron).
  3. The skill picker in the profile UI and the task `requiredSkills` produced by `skillTagger` show the same labels for the same concepts — no parallel vocabulary drift.
  4. `agent_teammates` table schema is unchanged; `teammate_profiles` exists as a separate additive table; all dispatcher reads go through `profileMerge(self, inferred=null, ema)` so Phase 2 can slot in without touching Phase 1 code paths.
  5. Any new LLM call introduced in this phase (none expected, but reserved for prompt-driven helpers) routes through `chatViaChain` with `temperature: 0` — no direct `getGeminiClient()` calls in new code.
**Plans:** 4 plans
- [ ] `01-01-PLAN.md` — Extract canonical `skillVocabulary.ts`, write additive `teammate_profiles` migration + `teams.profile_visibility` column, install `cmdk@^1.1.1`, push migration. (Walking Skeleton.)
- [x] `01-02-PLAN.md` — Pure `profileMerge.ts` (field-level fallback, D-06/D-08) + additive interest-nudge term in `match.ts` (≤ 0.05, D-03). Pure-function unit tests. **Complete 2026-05-11** — see `.planning/phases/01-profile-foundation/01-02-SUMMARY.md`.
- [x] `01-03-PLAN.md` — `/teams/[id]/me` RSC + `ProfileForm` (cmdk pills, D-12/D-14), `POST + GET /api/teams/[id]/profile` (visibility enforcement, D-17..D-20), one `chatViaChain` normalization call (QUAL-05/06), `profileStorage.ts`, prompts + Zod schema, nav link. **Complete 2026-05-11** — see `.planning/phases/01-profile-foundation/01-03-SUMMARY.md`.
- [ ] `01-04-PLAN.md` — Wire `profileMerge` into both dispatcher entry points (`runDispatch` + `dispatchTask`), unit + E2E smoke test that a self-declared skill changes assignment, human-verify checkpoint.
**Research recommended:** skip — standard patterns (profileMerge weight ratios flagged for in-plan simulation, not full `/gsd-research-phase`).

### Phase 2: GitHub Skill Inference
**Goal:** A teammate grants consent and Recgon mines their commit history in team-connected repos only, surfaces inferred skills in the profile UI for confirm/reject, and blends accepted inferences into `profileMerge` with time-decayed EMA so historical signal fades when a teammate moves stacks.
**Mode:** mvp
**Depends on:** Phase 1 (`profileMerge` read-path must exist; `skillVocabulary` must be canonical)
**Requirements:** SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, QUAL-02
**Success Criteria** (what must be TRUE):
  1. A teammate sees a "What GitHub says about you" section on `/teams/[id]/me` only after they explicitly grant consent; without consent, no commit mining ever runs and no row exists in `teammate_inferred_skills` for them.
  2. After consent, a `github_skill_inference` job mines the teammate's commits in the team's connected repos within a rolling 6-month window (never personal repos) and populates inferred skills the teammate can see, confirm, or reject per-skill in the UI.
  3. The dispatcher uses a three-source merged profile (self=0.5 / inferred=0.3 / EMA=0.2 by default) with rejected inferences excluded; a teammate who rejects "Python" never sees a Python task minted off the inferred-Python signal alone.
  4. A teammate who stopped writing React 6+ months ago sees their React EMA fade over subsequent dispatch runs (verifiable: `fitLearning.ts` applies `exp(-Δt/τ)` with τ≈90 days and the resulting weight is observably lower for old skills than recent ones).
  5. Any commit message or PR body passed into LLM calls in this phase is wrapped in `<user_content>...</user_content>` delimiters with a system instruction treating content as untrusted.
**Plans:** 4 plans hint — (1) `teammate_inferred_skills` migration + consent column on `teammate_profiles`, (2) `githubSkills.ts` lib + `github_skill_inference` worker using `@octokit/rest` + `@octokit/graphql`, (3) profile-UI "What GitHub says" section with confirm/reject toggles, (4) `profileMerge` 3-source blend + `fitLearning.ts` time-decay + `<user_content>` wrapping helper.
**Research recommended:** skip — standard patterns (Octokit + existing job-queue conventions).

### Phase 3: LLM Judgment Overlay
**Goal:** On close fit-score calls (gap < 0.15), the dispatcher invokes a single batched LLM tiebreaker per cron run that picks the final assignee from the math top-3 with anonymized labels and a structured schema, never breaking the assignment flow on LLM failure — and the resulting "why this person" line is visible in the task UI.
**Mode:** mvp
**Depends on:** Phase 2 (judgment uses the three-source merged profile)
**Requirements:** JUDGE-01, JUDGE-02, JUDGE-03, JUDGE-04, JUDGE-05, JUDGE-06, JUDGE-07, JUDGE-08, JUDGE-09, JUDGE-10, QUAL-01, QUAL-03
**Success Criteria** (what must be TRUE):
  1. Given 8 tasks in a single dispatch run where 3 of them have close fit-score gaps (< 0.15) and 5 have gaps ≥ 0.15, exactly ONE LLM call fires for the 3 close-call tasks and no LLM call fires for the 5 clear-winner tasks (verifiable via logs).
  2. The LLM judgment call receives `candidate_1 / candidate_2 / candidate_3` anonymized labels — never real names, emails, or pronouns; the bias-regression CI test (5 fixture scenarios where the same fit profile is coded with different names) yields roughly uniform picks across renamings.
  3. When the LLM provider chain fails, returns malformed JSON, or returns a `chosen_id` not present in the math-pre-filtered candidate set, the dispatcher silently falls back to the math top-1 candidate and the task is still assigned within the same cron run.
  4. Opening any AI-assigned task in the UI shows a human-readable "why this person" line built from math score breakdown plus (when used) the LLM tiebreaker factor — no black-box assignments anywhere in the product.
  5. Re-running the same cron drain on a task that already has an `assigneeId` does NOT re-judge or flip the assignee (cache key `(taskId, candidateIds-sorted, mathScoresHash)`); a per-team daily LLM budget cap, once exceeded, forces math-only assignment for the rest of that day.
**Plans:** 4 plans hint — (1) `judge.ts` + `JudgeResultSchema` + batched `JUDGE_ASSIGNMENT_*` prompts, (2) dispatcher integration with try/catch math fallback + cache + daily budget cap, (3) `assignment_reasoning` JSONB column + "why this person" UI line, (4) bias regression CI test + post-hoc `chosen_id` validation.
**Research recommended:** yes — `/gsd-research-phase` should prototype the batch judgment prompt design and bias-test fixture set before plan-check (flagged in SUMMARY.md Open Questions).

### Phase 4: Personalized Task Framing
**Goal:** When a task is assigned, a queued `task_reframe` job generates a personalized description for the assignee — why this fits them, where to start, how it ties to recent project state — stored alongside the original brain description and invalidated on reassignment, with tone bounded by the prompt registry.
**Mode:** mvp
**Depends on:** Phase 3 (reframe consumes `assignment_reasoning` for the "why this fits you" half)
**Requirements:** FRAME-01, FRAME-02, FRAME-03, FRAME-04, FRAME-05, FRAME-06, FRAME-07
**Success Criteria** (what must be TRUE):
  1. When a task is assigned, the assignee opens the task detail page within one cron cycle and sees a personalized description that explains why this task fits them, where in the codebase (file or folder) to start, and how it connects to recent project state — when those signals exist.
  2. The owner viewing the same task (or any other user the task is later reassigned to) sees the original brain-generated description, not the personalized version, until a new reframe completes for the new assignee.
  3. Reassigning a task to a different person automatically invalidates `personalized_description_for_user_id`, enqueues a new `task_reframe` job, and the new assignee sees their own personalized description after the next cron drain (the old description is never shown to the new assignee).
  4. The personalized description never references information the assignee did not declare in their profile (no inferred preferences from external data); content is bounded by the whitelisted rhetorical moves in `prompts.ts` (no flattery, no sycophancy, no false familiarity).
  5. The assignment email sent via Resend includes the personalized description for the assignee (not the original brain description), end-to-end.
**Plans:** 3 plans hint — (1) `reframe.ts` + `task_reframe` worker + `personalized_description` + `personalized_description_for_user_id` columns, (2) task detail UI + assignment email read personalized vs original based on viewer, (3) reassignment-invalidation hooks + bounded-tone prompt registry + golden tests for FRAME-06/07.
**Research recommended:** skip — standard patterns (existing `llm_jobs` queue + `chatViaChain` + prompt registry).

### Phase 5: Live Code Infrastructure
**Goal:** Tree-sitter WASM + Octokit are wired server-only; a new `live_code_summary` job analyzes only files changed since the last brain run via `compareCommitsWithBasehead`, caches per-file summaries by `(project_id, file_path, file_sha)`, and the stale `project_analyses.analysis` blob continues to work unchanged as a fallback source.
**Mode:** mvp
**Depends on:** Phase 4 (FRAME pointers benefit from richer live signal but framing must already ship without it; sequencing keeps live-code as the last, riskiest milestone)
**Requirements:** LIVECODE-01, LIVECODE-02, LIVECODE-07, LIVECODE-08
**Success Criteria** (what must be TRUE):
  1. After a teammate pushes 3 commits touching 5 files to a connected repo, the next cron drain produces summaries for exactly those 5 files (or fewer if SHAs are unchanged from cache) and no other files in the repo are re-analyzed.
  2. Running the same `live_code_summary` job twice with no new commits produces zero new LLM calls — every file SHA matches the `project_file_summaries` cache.
  3. The existing brain path still works exactly as it does today when `live_code_summary` returns empty — the dispatcher continues to mint tasks from `project_analyses.analysis` + GA4 + GitHub diffs with no observable regression.
  4. The client bundle size does not change measurably; `web-tree-sitter`, `tree-sitter-typescript`, `tree-sitter-python`, `@octokit/rest`, `@octokit/graphql` all live in `serverExternalPackages` in `next.config.js` and never appear in the client bundle.
**Plans:** 4 plans hint — (1) `project_file_summaries` migration + `projects.last_analyzed_sha` column, (2) `next.config.js` `serverExternalPackages` + tree-sitter WASM bundling smoke test on Vercel, (3) `liveCode.ts` diff fetch + per-file cache lookup, (4) `live_code_summary` worker + LiveCodeDelta type + fallback-source preservation tests.
**Research recommended:** yes — `/gsd-research-phase` should resolve the GitHub App vs user-OAuth rate-limit decision before plan-check (flagged in SUMMARY.md Open Questions).

### Phase 6: Brain Integration & Cost Guards
**Goal:** The brain consumes `LiveCodeDelta[]` alongside GA4 + GitHub-diff inputs; per-dispatch mint caps, capacity-aware WIP gates, and 7-day per-source cool-downs prevent task explosion; v3 telemetry (cost per run, LLM judgment count, fallback count, reframe count) is observable end-to-end via the existing logger.
**Mode:** mvp
**Depends on:** Phase 5 (live code summaries must exist before the brain can consume them)
**Requirements:** LIVECODE-03, LIVECODE-04, LIVECODE-05, LIVECODE-06, QUAL-04
**Success Criteria** (what must be TRUE):
  1. After a code push that would generate 12 candidate tasks, a single dispatch run mints at most 5 (default cap; configurable per team) and the rest are deferred to the next cron cycle — no task explosion.
  2. When the team's open WIP exceeds 1.5× combined declared capacity hours, the brain skips new minting entirely for that run (no new assignments, no new emails) and resumes once WIP drops back below the threshold.
  3. The same signal family (same file family or same analytics drop) firing repeatedly over 7 days mints exactly one task in that window — not one task per cron run.
  4. Running a full dispatch cycle, an operator can query the logger and observe: total cost in USD for the run, count of LLM judgment calls (with fallback events broken out), count of `task_reframe` jobs queued, count of `live_code_summary` jobs queued.
  5. With live code disabled (feature flag off per team), the brain still mints tasks from the pre-v3 sources — live code remains purely additive.
**Plans:** 4 plans hint — (1) `brain.ts` integration of `LiveCodeDelta[]` + feature flag, (2) per-dispatch mint cap + capacity-aware WIP gate in `dispatcher.ts`, (3) per-source 7-day cool-down via brain-entry dedupKey family hash, (4) telemetry: cost/judgment/fallback/reframe counters wired through existing `logger`.
**Research recommended:** skip — standard patterns (extends existing `brain.ts` + `dispatcher.ts` + logger).

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Profile Foundation | 0/4 | Not started | - |
| 2. GitHub Skill Inference | 0/4 | Not started | - |
| 3. LLM Judgment Overlay | 0/4 | Not started | - |
| 4. Personalized Task Framing | 0/3 | Not started | - |
| 5. Live Code Infrastructure | 0/4 | Not started | - |
| 6. Brain Integration & Cost Guards | 0/4 | Not started | - |
