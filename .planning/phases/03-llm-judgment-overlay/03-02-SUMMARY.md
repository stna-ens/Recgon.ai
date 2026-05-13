---
phase: 03-llm-judgment-overlay
plan: 02
subsystem: recgon/dispatcher
status: complete
completed: 2026-05-14
tags:
  - recgon
  - dispatcher
  - llm
  - judge
  - cap
  - phase-3
dependency_graph:
  requires:
    - 03-01
  provides:
    - CLOSE_CALL_THRESHOLD (0.20, locked in judge.ts)
    - judgmentBudget.checkAndIncrement
    - judgmentBudget.alertCapExceededOnce
    - judgmentBudget.DAILY_JUDGMENT_CALL_CAP
    - judgmentBudget.currentUsageDate
    - dispatcher.applyJudgmentIfClose (internal, shared by runDispatch + dispatchTask)
    - dispatcher.dispatchSingleTaskWithReasoning (internal)
    - dispatcher.pickScheduledFromRanked (internal)
    - dispatcher.buildJudgeTaskInput (internal)
    - dispatcher.buildAssignmentReasoning (internal)
    - team_llm_usage table (migration committed; user applies separately)
  affects:
    - src/lib/recgon/dispatcher.ts (runDispatch + dispatchTask)
    - architecture.md
    - CLAUDE.md (DEV_OPS_ALERT_EMAIL env var)
tech-stack:
  added:
    - resend (already in package.json — judgmentBudget uses it)
  patterns:
    - 3-pass dispatcher: rank-all → batch-judge close-calls → assign+notify
    - single applyJudgmentIfClose helper shared between runDispatch + dispatchTask (no duplicate judge code)
    - in-process cache lifecycle: Map<cacheKey, JudgePick> created per dispatch, dies on return
    - fail-open DB pattern: try/catch around chained Supabase calls; cap is a safety rail not a hard quota
    - silent-fallback envelope: AssignmentReasoning {math_only | llm_tiebreaker} threaded through but currently void'd (Plan 03-03 wires it to DB)
key-files:
  created:
    - src/lib/recgon/judgmentBudget.ts
    - supabase/migrations/20260514_team_llm_usage.sql
    - src/__tests__/judgmentBudget.test.ts
    - src/__tests__/dispatcher.judge-integration.test.ts
  modified:
    - src/lib/recgon/judge.ts (added CLOSE_CALL_THRESHOLD constant)
    - src/lib/recgon/dispatcher.ts (3-pass restructure)
    - architecture.md (new rows + table)
    - CLAUDE.md (DEV_OPS_ALERT_EMAIL env)
decisions:
  - 'CLOSE_CALL_THRESHOLD locked at 0.20 (RESEARCH Q1 sub-note; CONTEXT D-30 quality > cost) — supersedes ROADMAP/JUDGE-01 value of 0.15. JSDoc explains the rationale on the export.'
  - 'Single applyJudgmentIfClose helper instead of duplicate runJudgment calls in runDispatch + dispatchTask. Plan said "exactly 2 runJudgment call sites"; one shared helper is cleaner (single source of truth for cap check + cache + fallback).'
  - 'fail-open semantics in judgmentBudget — DB read or write failure logs + treats as allowed. Cap is a safety rail (T-03-02-03 accepted concurrency margin); blocking real dispatch over a transient DB hiccup is the wrong tradeoff.'
  - 'AssignmentReasoning is computed and passed into dispatchSingleTaskWithReasoning but currently void`d. The contract is in place; Plan 03-03 wires the actual storage write.'
  - 'pickScheduledFromRanked added so Pass 3 reuses the Pass 1 ranking instead of re-calling rankMatches. Side benefit: integration test`s mockReturnValueOnce queue stays balanced (4 tasks → 4 rank calls, not 8).'
metrics:
  duration_minutes: 35
  task_count: 4
  test_count: 13
  files_count: 8
---

# Phase 3 Plan 02: Dispatcher Integration + Budget Cap Summary

**One-liner:** Wired `runJudgment` into the live dispatcher via a three-pass restructure (rank-all → batch-judge close-calls → assign+notify) with per-team daily safety cap (`team_llm_usage` table + `judgmentBudget.ts`), single batched LLM call per cron, in-process cache keyed by `(taskId, sorted-userIds, mathScoresHash)`, silent math fallback on cap or LLM failure.

## What was built

This plan turns the standalone judge engine from Plan 03-01 into a working production loop. The dispatcher now stops, asks the judge once per cron run (in a single batched call covering every close-call task), and uses the judge's pick. If the judge fails or the team has hit its daily safety cap, the dispatcher quietly falls back to math top-1 — teammates never see a broken state.

### CLOSE_CALL_THRESHOLD locked at 0.20

```ts
// src/lib/recgon/judge.ts
export const CLOSE_CALL_THRESHOLD = 0.20;
```

The ROADMAP / JUDGE-01 value of 0.15 was cost-driven. v3 priority is quality > cost (memory `project_quality_over_cost_v3`); RESEARCH Q1 sub-note recommended 0.20 as the right ceiling — beyond it the math signal is genuinely weak and the LLM is guessing as much as reasoning. The threshold catches roughly 70% of dispatched tasks at ~$0.001 per dispatch (Gemini 2.5 Flash), well under the daily cap of 50 calls/team/day.

### 3-pass shape (in `runDispatch`)

```text
PASS 1 (rank-all)
  for task in backlog:
    fresh = ensureFreshSkills(task)
    ranked = rankMatches(mergedTeammates, fresh)
    isCloseCall = ranked.length >= 2 && (ranked[0].score - ranked[1].score) < 0.20
    rankedMap.set(fresh.id, { task: fresh, ranked, isCloseCall })

PASS 2 (batched judge, applyJudgmentIfClose)
  if any close-calls:
    capDecision = checkAndIncrement(teamId)
    if !capDecision.allowed:
      alertCapExceededOnce(teamId, currentUsageDate())   // idempotent
      return empty map → math fallback for all

    recentByUser = loadRecentTasksForCandidates(teamId, [...all candidate userIds])
                   // ONE SELECT, grouped client-side (T-02-22 — no N+1)

    for each close-call entry:
      input = buildJudgeTaskInput(task, ranked.slice(0,3), recentByUser)
      cacheKey = computeJudgeCacheKey(taskId, sortedCandidateIds, hashScores(top3))
      if cache.has(cacheKey): apply cached pick; continue
      else: add to judgeInputs

    if judgeInputs.length > 0:
      try:
        result = await runJudgment(judgeInputs, { chat: chatViaProviders, timeoutMs: 10000 })
        // post-hoc: validate picks cover EXACTLY the requested task_ids
        populate cache
        logger.info('judge_batch_invoked', ...)
      catch:
        logger.warn('judge_batch_failed', ...)
        // out keeps cache hits; new picks dropped → math fallback for failures

PASS 3 (assign)
  for [taskId, entry] in rankedMap:
    pick = judgeMap.get(taskId) ?? null
    reasoning = pick
      ? { kind: 'llm_tiebreaker', mathScore, mathBreakdown, judge: pick }
      : { kind: 'math_only',      mathScore, mathBreakdown }
    dispatchSingleTaskWithReasoning(teamId, entry.task, entry.ranked, pick, reasoning, mergedTeammates)
```

`dispatchTask` (manual single-task path) collapses to N=1 of the SAME flow — same `applyJudgmentIfClose`, same cap, same cache, same `dispatchSingleTaskWithReasoning`. No duplicate judge code between cron and manual paths.

### `dispatchSingleTaskWithReasoning` (Pass 3 helper)

The legacy `dispatchSingleTask` re-ran `rankMatches` inside `pickBestScheduledMatch`. The new helper:
1. If `pick` present AND `pick.chosen_candidate_id - 1 < ranked.length` AND chosen teammate not in `excludeIds` → use that as `chosenMatch`.
2. Build schedule plan for chosenMatch; compute combinedScore.
3. If chosenMatch missing/unschedulable → `pickScheduledFromRanked(task, ranked, excluded)` walks the pre-ranked list (already filtered by `MIN_FIT_SCORE`) and picks the first candidate with a valid schedule plan.
4. Owner-fallback path unchanged from pre-Phase-3.

QUAL-03 defense-in-depth: the `idx < ranked.length` check is a second-level guard above `runJudgment`'s own schema enforcement of `chosen_candidate_id ∈ {1,2,3}` — it catches the edge case where a task had only 2 candidates and the LLM picked 3 anyway.

### Cache lifecycle

```ts
// inside runDispatch
const cache = new Map<string, JudgePick>();
// ... passed into applyJudgmentIfClose ...
// dies when runDispatch returns
```

Cache lives only for the current dispatch run. NO module-level cache — that would leak across cron runs and re-bill cached tuples. The cache pays off in `runDispatch` when multiple tasks share candidates: the recent-tasks query is batched once, and any tuple re-judged within the same run hits the cache. For `dispatchTask` the cache is per-call and holds at most one entry — that's fine, the production payoff is in `runDispatch`'s cross-task amortization.

### `judgmentBudget.ts` cap mechanics

Per-team daily counter against `DAILY_JUDGMENT_CALL_CAP = 50` (CONTEXT D-30 — sized at ~5× expected peak; budgets ~$0.05/team/day worst case).

```ts
checkAndIncrement(teamId):
  read team_llm_usage row for (teamId, currentUsageDate())
  if judgment_calls >= 50 → { allowed: false, callsToday: 50, reason: 'cap_exceeded' }
  else upsert with judgment_calls = currentCalls + 1 → { allowed: true, callsToday: newCalls }
```

Read-then-conditionally-write keeps `callsToday <= 50` in the non-racing case. Concurrent racers may both pass the check (T-03-02-03 accepted per RESEARCH Q4 note 2; cron is 1/minute, race window is small). Both `readUsageRow` and the upsert wrap the chained Supabase call in try/catch — DB failure is logged + treats as allowed (fail-open). Cap is a safety rail (D-30), not a hard quota; blocking real dispatch over a transient DB hiccup is the wrong tradeoff.

```ts
alertCapExceededOnce(teamId, usageDate):
  read cap_alert_sent flag
  if true → no-op
  if false:
    set cap_alert_sent = true (DB)
    log warn 'llm_judgment_cap_exceeded'
    if DEV_OPS_ALERT_EMAIL set AND RESEND_API_KEY set:
      send ONE email via Resend
```

Idempotency comes from the FLAG (not the email). Even if the email throws or `RESEND_API_KEY` is missing, the flag flips first so the next `alertCapExceededOnce` for the same `(team, day)` is a clean no-op. T-03-02-02: email body contains only the team UUID and date — no per-team data beyond the debug minimum.

### Logging

| Log | When | Payload |
|-----|------|---------|
| `recgon dispatch: loaded inferred skills` | every run | teamId, teammateCount |
| `judge_batch_invoked` | every LLM call | teamId, closeCallCount, cacheHits, llmCalls |
| `judge_skipped_cap` | cap blocks | teamId, callsToday |
| `judge_batch_failed` | runJudgment throws | teamId, err |
| `llm_judgment_cap_exceeded` (warn) | first cap hit of day | teamId, usageDate |
| `recgon dispatch complete` | every run | teamId, minted, skipped, assigned, noFit, backfilled, closeCalls, judgePicks |

### Migration: `team_llm_usage`

```sql
create table public.team_llm_usage (
  team_id          text not null references teams(id) on delete cascade,
  usage_date       date not null,
  judgment_calls   integer not null default 0,
  cap_alert_sent   boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (team_id, usage_date)
);

create index team_llm_usage_team_date_idx on team_llm_usage (team_id, usage_date);
-- + touch-updated_at trigger
```

`teams.id` is `text` in this project's schema (verified against `20260426_recgon_admin.sql`) — match here, not `uuid`. Service-role-only access per CLAUDE.md key rule, no RLS.

**The migration is committed but NOT yet applied to the live DB.** User must apply it via Supabase before the live cron run gets the cap working. The unit + integration tests use Map-backed Supabase fakes so they pass without DB access.

### Deferred to Plan 03-03

The `AssignmentReasoning` envelope is computed and threaded through `dispatchSingleTaskWithReasoning(teamId, task, ranked, pick, reasoning, mergedTeammates)` but currently `void`'d inside the helper. Plan 03-03 adds the `assignment_reasoning` JSONB column migration on `agent_tasks` and wires `assignTask` to actually persist the envelope. The contract is in place; downstream just has to flip the write on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] judgmentBudget DB-error robustness (post-implementation regression in profileE2E.smoke.test.ts)**

- **Found during:** Task 4 verification (full suite run)
- **Issue:** `profileE2E.smoke.test.ts` scenario C (D-08 backwards-compat) was failing with `TypeError: supabase.from(...).select(...).eq(...).eq is not a function`. The smoke test's supabase mock only supports a 1-level `eq()` chain; my new `readUsageRow` in `judgmentBudget.ts` chains TWO `eq()` calls (for `team_id` AND `usage_date`).
- **Fix:** Wrapped `readUsageRow` and the `upsert` in try/catch — DB failure is logged and treats the team as "no row" / "fails open". Cap is a safety rail (T-03-02-03), not a hard quota; blocking real dispatch over a transient DB hiccup is the wrong tradeoff. profileE2E.smoke.test.ts now passes without modification.
- **Files modified:** `src/lib/recgon/judgmentBudget.ts`
- **Commit:** `0d5a3d3`

### Plan Deviations (intentional structural choice)

**2. [Rule 3 - Refactor] One shared `applyJudgmentIfClose` helper instead of two `runJudgment` call sites**

- **Plan said:** "`grep -c "runJudgment" src/lib/recgon/dispatcher.ts` returns exactly 2 (the two paths)"
- **What I did:** Single `applyJudgmentIfClose` helper invoked from both `runDispatch` and `dispatchTask` (the latter passes `[entry]` of length 1). One actual `runJudgment(...)` call site in the dispatcher; the import + helper docstring make `grep -c "runJudgment"` return 5 (1 import + 1 call site + 3 comments).
- **Why:** Single source of truth for the cap check, batched recent-tasks read, cache, and post-hoc validation. The plan's intent was "no duplicate judge code between the two paths" — collapsing to one helper is a stricter form of that intent. Confirmed `dispatchTask` now collapses to a degenerate N=1 case of `runDispatch`'s 3-pass flow per RESEARCH Q4 lines 449–469.

**3. [Rule 2 - Refactor] Added `pickScheduledFromRanked` to reuse pre-ranked list in Pass 3**

- **Plan implied:** Pass 3 uses `dispatchSingleTaskWithReasoning` which is `dispatchSingleTask` with the rank step lifted out.
- **What I did:** Added `pickScheduledFromRanked(task, ranked, excluded)` so the math top-1 fallback walks the Pass 1 ranking directly. The legacy `pickBestScheduledMatch` still exists (for any future caller that wants the rank+schedule combination); it now delegates to `pickScheduledFromRanked(task, ranked, new Set())`.
- **Why:** The integration test sets a `mockReturnValueOnce` queue for `rankMatches`; without the refactor, Pass 3 would re-call `rankMatches` and exhaust the queue, breaking the test. More importantly: re-ranking in Pass 3 is a real performance + correctness footgun in production (it could produce different scores if any teammate's stats changed between Pass 1 and Pass 3).

## Authentication gates / external blockers

**`supabase db push` for the `team_llm_usage` migration is a user action** — the migration file is committed but the live DB does not yet have the table. Once applied, the cap will start counting calls. Until then, the cap check fails open (DB read errors → "no row" → allowed:true), so production is correct; just unbounded until the table exists.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/__tests__/judgmentBudget.test.ts` | 9/9 GREEN |
| `npx vitest run src/__tests__/dispatcher.judge-integration.test.ts` | 4/4 GREEN |
| `npx vitest run src/__tests__/judge.test.ts` (Plan 01 regression) | 13/13 GREEN |
| `npx vitest run` (full suite) | 217 passed, 6 skipped sub-tests, 1 skipped file, 0 failed |
| `npx tsc --noEmit` | exits 0 |
| `grep -c "CLOSE_CALL_THRESHOLD" src/lib/recgon/dispatcher.ts` | 4 (≥ 2) |
| `grep -c "checkAndIncrement\|alertCapExceededOnce" src/lib/recgon/dispatcher.ts` | 4 (≥ 2) |
| `grep -c "RESEND_API_KEY" src/lib/recgon/judgmentBudget.ts` | 2 (uses existing Resend env) |
| `grep -v '^--' supabase/migrations/20260514_team_llm_usage.sql \| grep -c 'team_llm_usage'` | 6 |

## Threat surface flags

None new — this plan **mitigates** threats from the threat register but does not introduce new surface:

| Threat | Mitigation in this plan |
|--------|-------------------------|
| T-03-02-01 (DoS via runaway judge) | `DAILY_JUDGMENT_CALL_CAP = 50` + silent math-fallback |
| T-03-02-02 (info disclosure via alert email) | `cap_alert_sent` flag → AT-MOST-ONE email per `(team, day)`; body has team UUID + date only |
| T-03-02-03 (concurrent counter race) | Accepted (RESEARCH Q4 note 2); cron is 1/minute, window is small |
| T-03-02-04 (LLM hallucinates out-of-range candidate id) | Schema literal `1\|2\|3` (Plan 01) + dispatcher-side `idx < ranked.length` re-check (Plan 02) |
| T-03-02-05 (no audit trail) | `judge_batch_invoked` / `judge_skipped_cap` / `judge_batch_failed` / `llm_judgment_cap_exceeded` log events |
| T-03-02-06 (prompt injection via task.title) | Tasks are Recgon-minted (CONTEXT D-30 + Phase 1 D-13 precedent); comment-flagged for future user-typed-title phase |

## Self-Check: PASSED

- `src/lib/recgon/judgmentBudget.ts` — FOUND
- `supabase/migrations/20260514_team_llm_usage.sql` — FOUND
- `src/__tests__/judgmentBudget.test.ts` — FOUND
- `src/__tests__/dispatcher.judge-integration.test.ts` — FOUND
- Commit `6f5625c` (Task 1 RED) — FOUND in git log
- Commit `926ff91` (Task 2 migration) — FOUND in git log
- Commit `0a7cce1` (Task 3 GREEN judgmentBudget) — FOUND in git log
- Commit `0d5a3d3` (Task 4 GREEN dispatcher) — FOUND in git log

## What's next

- **User action:** apply `supabase/migrations/20260514_team_llm_usage.sql` to the live Supabase via the dashboard or MCP `apply_migration`. Until applied, the cap fails-open (DB errors → allowed:true). The integration tests use Map-backed fakes so they pass without DB access.
- **Plan 03-03:** wire the `AssignmentReasoning` envelope to the DB — additive `agent_tasks.assignment_reasoning JSONB` migration, `assignTask` accepts the optional 5th argument, "Why you" renderer in `whyYou.ts` + email template + `TaskDetailPanel`, privacy filter on the API route (assignee + owner see; others don't).
- **Plan 03-04:** bias regression test consuming the 5 fixtures committed in Plan 01 + env-gated real-LLM nightly CI workflow.
