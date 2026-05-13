---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Plan 03-04 code complete; awaiting user real-LLM bias baseline (Task 4 checkpoint)
last_updated: "2026-05-14T01:15:00.000Z"
last_activity: 2026-05-14 -- Plan 03-04 complete (bias regression CI + nightly real-LLM workflow + validator edge cases + Phase 3 roll-up); Phase 3 ship-readiness pending user Task 4 real-LLM run
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)

**Core value:** The right task gets to the right teammate at the right time, with reasoning the teammate can trust.
**Current focus:** Phase 03 — llm-judgment-overlay

## Current Position

Phase: 03 (llm-judgment-overlay) — CODE COMPLETE; awaiting user Task 4 baseline
Plan: 4 of 4 (DONE)
Status: Phase 03 all 4 plans complete; pending user real-LLM bias regression one-off run + Plan 03-03 Task 5 manual UAT before phase formally ships
Last activity: 2026-05-14 -- Plan 03-04 complete (bias regression test stubbed+real-LLM, nightly CI workflow, validator edge cases, Phase 3 roll-up, ROADMAP threshold-lock addendum)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 86 | 3 tasks | 7 files |
| Phase 01 P02 | 360 | 2 tasks | 5 files |
| Phase 01 P03 | 900 | 3 tasks | 11 files |
| Phase 01 P04 | 1200 | 2 tasks | 4 files |
| Phase 02 P01 | — | 3 tasks | 7 files |
| Phase 02 P02 | 25 | 3 tasks | 13 files |
| Phase 02 P03 | 16 | 3 tasks | 15 files |
| Phase 02 P04 | 720 | - tasks | - files |
| Phase 03 P01 | 8 | 2 tasks | 11 files |
| Phase 03 P02 | 35 | 4 tasks | 8 files |
| Phase 03 P03 | 45 | 4 tasks | 10 files |
| Phase 03 P04 | 12 | 5 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Canonical build order: A→B→C→D→E from SUMMARY.md (single-dev, sequential; FEATURES.md parallelization rejected).
- Phase 3 (LLM Judgment) and Phase 5 (Live Code Infrastructure) flagged for `/gsd-research-phase`.
- All v3 work is additive — no schema mutation on `agent_teammates`; `profileMerge` is the read-path.
- D-10 nav-link surface = `TeamSwitcher.tsx` dropdown (the planning artifacts originally assumed a non-existent `src/app/teams/[id]/page.tsx`).
- Phase 1 dispatcher rebind: `dispatchSingleTask` receives `mergedTeammates`; `backfillLegacySchedules` keeps raw `teammates` (scheduling ≠ assignment math).
- [Phase ?]: Plan 01-01 (Phase 1 foundation) implemented: canonical skill vocab module, additive teammate_profiles migration, cmdk@^1.1.1. Task 1.4 (supabase db push) pending operator.
- Plan 01-02: profileMerge pure function (field-level fallback, strengths-fold, interests passthrough) + additive interest-nudge in match.ts (INTEREST_NUDGE_WEIGHT=0.03, ≤ 0.05 cap, applied AFTER weighted sum, cannot flip strict-better-skill candidate). All 20 unit tests pass; tsc clean.
- Plan 01-03: full vertical slice — `/teams/[id]/me` RSC + cmdk-powered ProfileForm + POST/GET `/api/teams/[id]/profile` with server-side visibility enforcement (D-17..D-20, closes T-03-01 IDOR) + single `chatViaChain` normalize call (temperature: 0, taskKind: 'recgon_skill_normalize', timeoutMs: 8000 — Pitfall 8) + post-hoc CANONICAL_SET filter (defense-in-depth) + LLM-failure-safe passthrough fallback (Pitfall 7 — raw text never lost, normalization_pending=true) + My profile nav link in TeamSwitcher dropdown (D-10 single discovery surface). Added ChatOptions.timeoutMs to providers.ts (Rule 2 — required for in-call timeout safety). 146/146 tests pass; tsc + build clean.
- [Phase ?]: Dispatcher threads profileMerge through both runDispatch and dispatchTask; schedule-backfill exempt
- Plan 02-02: GitHub-skill-inference engine shipped. wrapUntrusted helper (QUAL-02 strip-then-truncate-then-wrap), Octokit deps + throttling plugin (retryCount<1 cap), JobKind union extended with 'github_skill_inference', runScan orchestrator in `src/lib/recgon/githubSkills.ts` (6-month window, 200/repo cap, title-only commits, standard-depth single chatViaChain with temperature=0 + post-hoc CANONICAL_SET filter), worker registered in `WORKERS`, weekly cron `/api/cron/github-skill-inference` (Sunday 06:00 UTC, D-25). 5 of 7 Wave-0 tests GREEN; 178/179 full suite passing (1 remaining failure is Plan 02-04's profileMerge RED). Operator action: `npm install` + redeploy to Vercel to register cron.
- [Phase ?]: [02-03] Used inline GithubMark SVG instead of lucide-react Github (lucide dropped brand glyphs in newer versions)
- [Phase ?]: [02-03] Set vitest environment: 'jsdom' globally; vitest 4 deprecated environmentMatchGlobs
- [Phase ?]: Plan 02-04: 3-source blend (0.5 self / 0.3 inferred / 0.2 ema) + BLEND_THRESHOLD=0.05 + read-time decay (tau=90d) on both inferred AND ema. Dispatcher loads inferred skills via team-scoped batch query (T-02-22 no N+1). Defense-in-depth rejected filter at SQL AND in-merge.
- Plan 03-01: pure `runJudgment` module in `src/lib/recgon/judge.ts` (366 lines, 0 direct LLM SDK imports — adapter injected via `opts.chat`). Throws single `JudgeError` for ALL failures so Plan 02 dispatcher catches one thing for math fallback (JUDGE-05). Post-hoc validator: pronoun deny-list (he|she|they|him|her|them|his|hers|theirs), cross-candidate ref reject (candidate_N), per-reason_code substring checks (skill_depth/recent_track_record/interest_match). `computeJudgeCacheKey(taskId, candidateUserIds[], mathScoresHash)` sorts ids in-key for order-independence (JUDGE-09). `JUDGE_ASSIGNMENT_BATCH_SYSTEM` + `buildJudgeBatchUserPrompt` in prompts.ts; `REASON_CODES` + `JudgePickSchema` + `JudgeResultSchema` (chosen_candidate_id literal 1|2|3, reason_sentence ≤25-word refine, picks.max(10)) in schemas.ts. 5 byte-identical-except-name bias fixtures (English-M / Turkish-F / Arabic-M / East-Asian-F / Spanish-mixed) committed for Plan 04 to consume. 13/13 unit tests GREEN; full suite 204 passed; tsc clean.
- Plan 03-02: Dispatcher wired to judge via 3-pass restructure (rank-all → batch-judge → assign+notify). CLOSE_CALL_THRESHOLD locked at 0.20 (RESEARCH Q1 sub-note; supersedes JUDGE-01 0.15 per CONTEXT D-30 quality > cost). Single `applyJudgmentIfClose` helper shared between runDispatch + dispatchTask (one source of truth — N=1 collapses to degenerate batch). In-process Map<cacheKey, JudgePick> cache lives per dispatch (no module-level state). `judgmentBudget.ts` per-team daily cap (DAILY_JUDGMENT_CALL_CAP=50, T-03-02-01) with idempotent dev-ops alert email AT-MOST-ONCE per (team, day) via cap_alert_sent flag (T-03-02-02). Fails-open on DB errors (T-03-02-03 accepted concurrency margin). `team_llm_usage` migration committed (additive, FK→teams.id text) — user applies before live cron picks up cap. AssignmentReasoning envelope computed + threaded through dispatchSingleTaskWithReasoning but void`d; Plan 03-03 wires it to storage. 217/217 tests pass (no regressions), tsc clean.
- [Phase ?]: Plan 03-03: assignment_reasoning JSONB column on agent_tasks (additive, default null, kind-discriminator partial index). renderWhyYou single-source renderer (5 LLM reason_codes + math-only template + defense-in-depth fallback for malformed llm_tiebreaker payloads). Server-side privacy filter at GET /api/recgon/tasks/[id]: assignee + owner see whyYouSentence pre-rendered; raw JSONB NEVER returned. assignTask Zod-validates reasoning at storage boundary; invalid -> log warn + write null (fail-open). Email body + TaskDetailPanel WhyYouBlock both consume renderWhyYou output. JUDGE-07 + JUDGE-08 complete. User must apply BOTH Plan 02 + Plan 03 migrations to live DB; Task 5 manual UAT pending.
- Plan 03-04: bias regression test (5 fixtures × 30 trials = 150 calls) in `src/__tests__/judge.bias-regression.test.ts` — two modes: stubbed (default; round-robin pick cycling guarantees 10/10/10 per fixture; verifies wiring) and real-LLM (`JUDGE_BIAS_REAL_LLM=1`; uses chatViaProviders; nightly only, ~$0.30/run, ~10 min). Three assertions: end-to-end anonymization (zero real names in any of 150 prompt bodies), top-pick-rate band ≤15pp across fixtures, no fixture >50% top-rate (real-LLM noise floor). PRONOUN_DENY extended with elle/il/sie/er (French/Spanish/German) — covers bias-fixture vocab scope; JSDoc warns against relaxing \\b boundary. 4 new validator edge-case tests added (empty sentence / unicode pronoun / capitalized Candidate_2 / numeric-word over-count). Nightly GitHub Actions workflow `.github/workflows/judge-bias-nightly.yml` (cron 0 4 * * * UTC + workflow_dispatch + concurrency:cancel-in-progress:false + secrets-only API keys + issue-on-failure with comment-dedup) — NOT a required PR check. CLAUDE.md documents JUDGE_BIAS_REAL_LLM env var. ROADMAP Phase 3 threshold-lock addendum: CLOSE_CALL_THRESHOLD=0.20 (planner-locked) supersedes 0.15 (cost-driven origin preserved). All 12 requirements (JUDGE-01..10 + QUAL-01 + QUAL-03) traced to delivering tasks. All 5 ROADMAP success criteria met. Phase 3 code-complete; pending user Task 4 real-LLM run for baseline + Plan 03 Task 5 manual UAT before formal ship. Initial stub used hash-mod-3 → drifted 16.7pp in stubbed mode (sample-size noise at N=30); replaced with round-robin → 0pp by construction.

### Pending Todos

None yet.

### Blockers/Concerns

- Open research questions surfaced for in-plan resolution (not blockers, but flagged):
  - profileMerge weight ratios (Phase 1) — needs simulation vs `agent_tasks` history during plan.
  - Batch judgment prompt design + bias-test fixture set (Phase 3) — needs `/gsd-research-phase`.
  - GitHub App vs user-OAuth for live analysis (Phase 5) — needs `/gsd-research-phase`.
  - `task_reframe` volume at scale (Phase 4) — verify Gemini Flash quota headroom during plan.

## Deferred Items

Items acknowledged and carried forward (from REQUIREMENTS.md v3):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Stretch | STRETCH-01 stretch / learning task flag | Deferred to v3 | 2026-05-11 |
| Delivery | DELIVERY-01..03 Slack / calendar / mobile | Deferred to v3 | 2026-05-11 |
| Brain | BRAIN-01..02 semantic dedup / cross-project deps | Deferred to v3 | 2026-05-11 |
| Feedback | FEEDBACK-01 rebuild feedback ingestion | Separate milestone | 2026-05-11 |

## Session Continuity

Last session: 2026-05-14T01:15:00.000Z
Stopped at: Plan 03-04 code-complete; awaiting user real-LLM bias regression baseline (Task 4 checkpoint) + Plan 03 Task 5 manual UAT before Phase 3 formally ships
Resume file: None
Resume command: After Task 4 baseline + UAT approval, `/gsd-execute-phase 4` to begin Phase 4 (personalized task framing)
User action pending:
  1. Run `JUDGE_BIAS_REAL_LLM=1 npx vitest run src/__tests__/judge.bias-regression.test.ts` once (~$0.30, ~10 min); record per-fixture pickCounts in `03-04-SUMMARY.md` Real-LLM Bias Baseline section; type "approved".
  2. Plan 03-03 Task 5 manual UAT — open one assignment task as assignee, owner, and other-teammate to verify "Why you" privacy filter renders correctly across 3 viewer roles.
  Both Phase 2 + Phase 3 Supabase migrations are already applied to the live project (verified upstream).
