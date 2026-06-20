---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 4 (Personalized Task Framing) code-complete, all 3 plans shipped (Plans 04-01, 04-02, 04-03). Reassignment invalidation atomic; FRAME-04 closed. 30 new golden fixtures (12 FRAME-06 tone + 8 FRAME-07 grounding + 6 invalidation + 4 negative controls). enqueueReframeJob extracted to leaf module reframeEnqueue.ts to break the storage→dispatcher import cycle. Manual UAT auto-approved per orchestrator auto-mode. Phase 5 (Live Code Infrastructure) is next.
last_updated: "2026-06-20T13:03:27.158Z"
last_activity: 2026-06-20 -- Completed quick task 260620-mav: AI-generated short task summaries for compact UI (calendar chips + command rows)
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 26
  completed_plans: 20
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)

**Core value:** The right task gets to the right teammate at the right time, with reasoning the teammate can trust.
**Current focus:** Phase 04 — personalized-task-framing

## Current Position

Phase: 5
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-21 - Completed quick task 260621-tpt: folded Projects into the team dropdown as a collapsible team→projects tree (removed top-nav Projects tab; checkbox=filter, chevron=expand, project sub-rows with pulse dots; hover-open; shared useTeamPortfolio hook)

Progress: [████████░░] 77%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 4 | - | - |
| 03 | 4 | - | - |
| 4 | 3 | - | - |

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
| Phase 03 P05 | 35 | 5 tasks | 14 files |
| Phase 03 P06 | 14 | 3 tasks | 12 files |
| Phase 04 P02 | 8 | 2 tasks | 5 files |
| Phase 04 P03 | 10 | 3 tasks | 6 files |

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
- Plan 03-05: LLM-grounded Why-you. Math-only template path DELETED entirely; renderer rewritten as async thin reader over pre-rendered envelope. WHY_YOU_GROUNDED prompt + WhyYouGroundedSchema + generateWhyYouSentence in `whyYouLLM.ts` (adapter-injected, post-hoc grounding validator, returns sentence: null when ungrounded → Plan 03-06's refusal trigger). Bias regression env-gated (WHY_YOU_BIAS_REAL_LLM=1) mirrors JUDGE pattern. 268/268 tests green.
- Plan 03-06: Dispatcher 4-outcome decision tree (refuse / defer / triage / assign) — closes Gap 1 (zero-signal refusal, VERIFICATION phase_3_1_gaps#1) AND Gap 3 (user rule 2026-05-15: never assign by availability alone). Constants SIGNAL_FLOOR=0.15 / DEFER_FLOOR=0.3 / DEFER_LOOKAHEAD_WEEKS=4 / HIGH_PRIORITY_THRESHOLD=3 (boundary-locked by tests). hasMinimumFit + findEarliestCapacityWindow pure helpers in match.ts. Storage helpers markTaskForTriage / deferTaskScheduledDate / clearTriageNote. New triage_note column (additive nullable; partial index). TriageNote union (4 values: no_clear_fit / no_grounded_reason / no_capacity_in_window / no_capacity_high_priority). DispatchResult.triaged + DispatchResult.deferred counters. routeTaskOrTriage centralised in dispatcher shared by runDispatch + dispatchTask. whyYouSentence===null couples to triage no_grounded_reason. Owner-fallback path preserved as structurally separate safety net. 298/298 tests green; tsc clean; build succeeds. User must apply 20260516_triage_note_column.sql migration before production cron uses the new column. NOTE: findEarliestCapacityWindow default projection is conservative (reads availabilityNow as future-week value); a follow-up plan should wire loadHoursByDateFor* for real calendar lookahead.
- Phase 3.5 (Owner Task Board) was ATTEMPTED AND REVERSED on 2026-05-16. All 4 plans (16 atomic implementation commits + 4 SUMMARY docs + 1 VERIFICATION doc) shipped cleanly to main with 401/401 tests passing, verifier verdict COMPLETE. After review, user decided the direction was not right and asked to reverse it. Single revert commit (b724fb1) rolled back all 20 Phase 3.5 commits (skipping user's interleaved landing commits 25f5263 + 91dfdf1). Planning docs retained as record (CONTEXT, RESEARCH, UI-SPEC, PATTERNS, VALIDATION, 4 PLAN files) — IMPLEMENTATION removed (OwnerWorkloadBoard, OwnerWorkloadGrid, TriageDock, TriageDockRow, CapacityBar, AssignTeammatePicker, ReschedulePicker, TableBoard, NonOwnerProjectsView, ConfirmDialog, 3 new owner-only routes, dock dismissals migration, dnd-kit deps, SwimLane dragMode prop). Drop migration `supabase/migrations/20260518_drop_owner_dock_dismissals.sql` ships with the revert because user had already applied the create migration. Test count back to 307 (pre-3.5 baseline). What to learn: future Owner Task Board work should re-examine the premise (vision doc `project_owner_task_board` was the driver) before re-investing — the implementation worked but the direction was wrong; investigate WHY before redesigning.
- Plan 03.6-01: Walking skeleton for overdue task pressure (`69fb566`). Schema migration columns `overdue_tier`, `last_overdue_action_at`, `overdue_pressure_enabled`, event-log values added; `/api/cron/overdue-sweep` route shell with `CRON_SECRET` auth; `vercel.json` daily schedule; type scaffolding. No behaviour yet — just the skeleton.
- Plan 03.6-02: Pure `decideOverdueAction(task, today)` policy function (`b457394`) in `src/lib/recgon/overduePolicy.ts`. Decision tree returns one of `nudge_teammate | escalate_to_owner | auto_reschedule | none`. No-skip tier escalation, 24h cool-down enforcement, feature-flag respect. Comprehensive unit tests with injected clock — adapter pattern keeps it pure and testable.
- Plan 03.6-03: Wired sweep (`72f6995`). Replaced stub `sweepOverdueTeams` with real iterator; `overdueRunner.executeOverdueAction` performs email send (Resend templates in `prompts.ts`) + storage update + event log write; `buildSchedulePlan`-driven auto-reschedule with reassignment fallback when original assignee out of capacity; owner-only `POST /api/recgon/tasks/[id]/snooze` route with day-count body validation.
- Plan 03.6-04: UI surfacing + telemetry (`fb3205a`). Tiered overdue chip on `/tasks` cards, calendar cards, and project Calendar tab; owner-only tier badge on owner board surfaces; `SnoozeControl` in task detail (owner-only, day picker); `/tasks` overdue filter + empty state; logger counters wired (`overdue.nudged`, `overdue.escalated`, `overdue.auto_rescheduled`, `overdue.snoozed`). Phase 3.6 complete.
- Plan 04-02: viewer-discriminated description (`1369dc3`, `43fc7c2`). `mapTask` now maps `personalized_description` + `personalized_description_for_user_id` from row to AgentTask (snake→camel boundary). API route `/api/recgon/tasks/[id]` adds `shouldServePersonalized` gate (assignee + non-empty personalized text + userId match) and explicit destructure+overwrite (NEVER spread the task — T-04-02-01 mitigation). FRAME-04 read-boundary race shield: stale mid-reassignment rows refuse to serve to a userId that doesn't match the column. notifications.ts picks personalized when bound; escapeHtml now wraps the description in the email body (T-04-02-03 defense in depth). TaskDetailPanel already read task.description directly — zero client change needed; the API is the single source of truth post-Plan-02. 14 new tests, 402/6 suite, tsc clean, build clean. Manual UAT auto-approved (orchestrator auto-mode) — relying on automated test surface. FRAME-03 + FRAME-05 closed.
- Plan 04-03: reassignment invalidation + FRAME-06/07 golden tests (`3ff8ea8`, `c5048ab`, `9c9eb1b`). enqueueReframeJob extracted from dispatcher.ts to leaf module `reframeEnqueue.ts` and re-exported from reframe.ts for grep-discoverability — breaks the storage→dispatcher import cycle that would result from storage.reassignTask now needing the helper. storage.reassignTask reads current assigned_to + team_id, detects actual reassignment vs no-op, and on actual reassignment nulls personalized_description AND personalized_description_for_user_id in the SAME supabase update (atomic — no cron-cycle gap where new assignee could read stale text). Then fires enqueueReframeJob (defense-in-depth .catch around the fire-and-forget helper). 6 invalidation regression tests + 12 FRAME-06 tone-violation golden fixtures (flattery / false-familiarity / pronouns) + 2 negative controls + 8 FRAME-07 grounding fixtures (inferred-skill / inferred-preference / inferred-recent-state — one fixture deliberately accepts either tone_reject OR grounding_reject because the LLM payload contains "love" which trips tone first) + 2 negative controls = 30 new fixtures total. All three call paths (reassign/schedule/decline routes) inherit the new behavior via reassignTask — no per-route changes. 432/6 suite, tsc clean, build clean. Manual UAT auto-approved (orchestrator auto-mode). FRAME-04 + FRAME-06 + FRAME-07 closed; FRAME-01 + FRAME-02 retroactively marked complete (Plan 04-01 closure). Phase 4 code-complete.

### Pending Todos

None yet.

### Blockers/Concerns

- Open research questions surfaced for in-plan resolution (not blockers, but flagged):
  - profileMerge weight ratios (Phase 1) — needs simulation vs `agent_tasks` history during plan.
  - Batch judgment prompt design + bias-test fixture set (Phase 3) — needs `/gsd-research-phase`.
  - GitHub App vs user-OAuth for live analysis (Phase 5) — needs `/gsd-research-phase`.
  - `task_reframe` volume at scale (Phase 4) — verify Gemini Flash quota headroom during plan.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260616-2au | Manual task creation (owner) with optional auto-assign + auto-schedule | 2026-06-15 | 0353fab | [260616-2au-manual-task-creation-owner-with-optional](./quick/260616-2au-manual-task-creation-owner-with-optional/) |
| 260620-mav | AI-generated short task summaries for compact UI (calendar chips + command rows); migration applied + 48 existing tasks backfilled | 2026-06-20 | 716311b | [260620-mav-compact-task-labels](./quick/260620-mav-compact-task-labels/) |
| 260620-wnk | Redesign TeamSwitcher dropdown to match Recgon system — solid opaque panel fixes dark-mode bleed-through (the ghost "Pixy" row), recgon-label header, signature left-bar rows, self-contained styles | 2026-06-20 | f4afead | [260620-wnk-redesign-teamswitcher-workspace-scope-dr](./quick/260620-wnk-redesign-teamswitcher-workspace-scope-dr/) |
| 260621-tpt | Fold Projects into the team dropdown as a collapsible team→projects tree (removed the top-nav Projects tab; left checkbox = filter, right chevron = expand, project sub-rows with pulse dots → /projects/[id]); hover-open; extracted shared `useTeamPortfolio` hook so dropdown + page share one cache | 2026-06-21 | 2675892 | [260621-tpt-projects-tree-in-team-switcher](./quick/260621-tpt-projects-tree-in-team-switcher/) |

## Deferred Items

Items acknowledged and carried forward (from REQUIREMENTS.md v3):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Stretch | STRETCH-01 stretch / learning task flag | Deferred to v3 | 2026-05-11 |
| Delivery | DELIVERY-01..03 Slack / calendar / mobile | Deferred to v3 | 2026-05-11 |
| Brain | BRAIN-01..02 semantic dedup / cross-project deps | Deferred to v3 | 2026-05-11 |
| Feedback | FEEDBACK-01 rebuild feedback ingestion | Separate milestone | 2026-05-11 |

## Session Continuity

Last session: 2026-05-20T17:45:00.000Z
Stopped at: Phase 4 Plan 03 complete — Phase 4 code-complete. reassignTask now invalidates personalized_description + personalized_description_for_user_id atomically (same supabase update as assigned_to change) and enqueues a new reframe job for the new assignee. enqueueReframeJob extracted to leaf module reframeEnqueue.ts (avoids storage→dispatcher cycle); re-exported from reframe.ts for discoverability. All three call paths (reassign/schedule/decline routes) inherit the new behavior — no per-route changes. 30 new tests pin FRAME-04 invalidation + FRAME-06 tone bounds (12 flattery/familiarity/pronoun fixtures + 2 negative controls) + FRAME-07 grounding (8 inferred-data fixtures + 2 negative controls). Manual UAT (Task 3.4) auto-approved per orchestrator (relying on the 30 new fixtures + full 432/6 suite + tsc + build as verification surface). Phase 5 (Live Code Infrastructure) is next.
Resume file: None
Resume command: `/gsd-plan-phase 5` to begin planning Phase 5 (Live Code Infrastructure). Phase 5 docs to read first: `.planning/ROADMAP.md` (Phase 5 success criteria) and `.planning/REQUIREMENTS.md` (LIVECODE-01..08). Note: Phase 5 is research-recommended per ROADMAP — consider `/gsd-research-phase` before planning.
User action pending:

  1. Apply `supabase/migrations/20260518_drop_owner_dock_dismissals.sql` to live Supabase (carry-over from Phase 3.5 reversal — owner_dock_dismissals table exists but no code references it).
  2. Carry-over from Phase 3 (still pending): real-LLM bias regression baseline (`JUDGE_BIAS_REAL_LLM=1 npx vitest run src/__tests__/judge.bias-regression.test.ts`, ~$0.30, ~10 min) + Plan 03-03 Task 5 manual UAT for "Why you" privacy filter across 3 viewer roles.
  3. Apply `supabase/migrations/20260516_triage_note_column.sql` if not already applied (Phase 3 Plan 06 — triage_note column for the 4-outcome decision tree).
  4. Apply Phase 3.6 migration (`overdue_tier`, `last_overdue_action_at`, `overdue_pressure_enabled` columns) if not already applied — without it, the daily overdue-sweep cron will no-op.
  5. Unrelated stash @{0} (`phase-3-profile-refactor-wip`) is still in place — your /teams/[id]/me profile refactor is preserved untouched, run `git stash pop` when ready to resume that work.
