---
phase: quick-260620-mav
plan: 01
subsystem: recgon-tasks
tags: [llm, calendar, command-center, i18n, fail-soft]
requires:
  - agent_tasks table
  - chatViaProviders LLM chain
  - sanitizeTaskForClient Omit-spread serializer
provides:
  - agent_tasks.short_summary column (additive, nullable)
  - generateTaskSummaries batched fail-soft util
  - taskDisplayTitle display-fallback helper
  - inline short-summary generation at both creation paths
  - idempotent backfill script
affects:
  - week-calendar chips (regular + multi-day)
  - command-center decision rows
tech-stack:
  added: []
  patterns:
    - reframe.ts purity (lazy default chat adapter, adapter injection for tests)
    - localeDirective i18n (en | tr) appended at call site
    - fail-soft generation (never blocks/fails task creation)
key-files:
  created:
    - supabase/migrations/20260620_agent_tasks_short_summary.sql
    - src/lib/recgon/taskSummaries.ts
    - src/lib/recgon/displayTitle.ts
    - scripts/backfill-task-summaries.ts
    - src/__tests__/taskSummaries.test.ts
    - src/__tests__/displayTitle.test.ts
  modified:
    - src/lib/recgon/types.ts
    - src/lib/recgon/storage.ts
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/lib/recgon/taskMint.ts
    - src/lib/recgon/dispatcher.ts
    - src/lib/recgon/scheduled.ts
    - src/app/api/teams/[id]/tasks/route.ts
    - src/components/v2/calendar/EventChip.tsx
    - src/components/v2/command/types.ts
    - src/components/v2/command/DecisionStack.tsx
decisions:
  - "Task-5 fetch routes needed ZERO edits — all three already serialize via sanitizeTaskForClient (Omit-spread carries shortSummary)."
  - "Owner-language resolution centralized in dispatcher.resolveTeamLanguage(teamId) (getTeam().createdBy -> getUserById().language), reused by scheduled.ts."
  - "brain.ts was NOT edited — mintTasksFromBrain lives in taskMint.ts; the legacy title truncation in brain.ts stays untouched as required."
  - "Clamp (<=48 chars) is a last-resort visual guard only; the LLM prompt is the summarization mechanism."
metrics:
  duration: ~7 min
  completed: 2026-06-20
  tasks: 6
  files: 17
---

# Quick Task 260620-mav: Compact Task Labels Summary

AI-generated short summaries (real LLM rewrites, ~3-6 words) now label the
week-calendar chips and command-center decision rows, with the full title
preserved on hover and in the detail panel — generated inline, batched, and
fully fail-soft so an LLM outage never blocks task creation.

## What shipped

1. **Migration (`20260620_agent_tasks_short_summary.sql`)** — additive nullable
   `short_summary TEXT` column on `agent_tasks`, mirroring the 20260520
   convention (`ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN`). Header clearly
   states the orchestrator applies it.
2. **Storage plumbing** — `AgentTask.shortSummary`, `TaskRow.short_summary`,
   `mapTask` mapping, and a fail-soft `setTaskShortSummary(taskId, summary)`
   writer that `logger.warn`s and returns on any error (never throws into the
   create path).
3. **Batched generator (`taskSummaries.ts`)** — `generateTaskSummaries(items, opts)`:
   one LLM call for N tasks, language-aware (`localeDirective` appended at call
   site), lazy default chat adapter (reframe.ts purity), returns `(string|null)[]`
   aligned 1:1. Any error (throw / malformed JSON / wrong-length array) → N nulls.
   Prompt in `prompts.ts` (`TASK_SUMMARIES_SYSTEM` + `taskSummariesUserPrompt`
   with `wrapUntrusted`), schema in `schemas.ts` (`TaskSummariesResponseSchema`).
4. **Inline wiring at both creation paths** — `mintTasksFromBrain` (brain mint)
   and the manual `POST /api/teams/[id]/tasks` route each generate + persist a
   batched summary, every block try/catch-wrapped. Owner/creator language
   resolved fail-soft (`resolveTeamLanguage` / `getUserById().language`). No new
   `llm_jobs` worker kind, no cron involvement.
5. **Display wiring** — pure `taskDisplayTitle(task)` helper (`shortSummary ||
   title`); EventChip renders it for the visible label (regular + multi-day)
   while keeping `title={cleanTitle}` for hover; DecisionStack's four rows use
   it; `CommandTask` gained the field. TaskDetailPanel untouched.
6. **Backfill script (`backfill-task-summaries.ts`)** — idempotent
   (`short_summary IS NULL` only), chunked (30), language-per-creator (cached),
   grouped by language for batched calls, leaves genuine nulls for safe re-run.
   Header states the orchestrator runs it.

## Task 5 — fetch routes that needed an edit

**ZERO routes needed an edit.** All three task-returning feeds already serialize
through `sanitizeTaskForClient`, whose `Omit` + rest-spread automatically carries
any new `AgentTask` field (only `assignmentReasoning` + `personalizedDescription*`
are stripped):

- `/api/calendar` → `tasks.map(sanitizeTaskForClient)`
- `/api/teams/[id]/command` → `safeTasks = tasks.map(sanitizeTaskForClient)`
- `/api/teams/[id]/tasks` GET + POST → `sanitizeTaskForClient`

The task rows themselves come from `listTasks` / `getTask` /
`listScheduledTasksForUser`, all using `.select('*')` (so `short_summary` is
fetched + mapped). The `.select(column-list)` calls present in `/api/calendar`
are on OTHER tables (teams, teammates, projects) and do not touch task fields.
typecheck confirmed clean.

## Test + lint results (Task 6 gate)

- **`npm run test`** (full vitest suite): **554 passed | 6 skipped | 0 failed**
  (66 files passed, 1 skipped). The 6 skipped are the pre-existing env-gated
  real-LLM bias-regression tests (`JUDGE_BIAS_REAL_LLM` / `WHY_YOU_BIAS_REAL_LLM`),
  unrelated to this task. New suites: `taskSummaries.test.ts` (10) +
  `displayTitle.test.ts` (7) = 17 new tests, all green.
- **`npm run lint`**: **0 errors, 53 warnings.** All 53 warnings are pre-existing
  `react-hooks/set-state-in-effect` advisories in files NOT touched by this task
  (verified: none of the changed files appear in the warning list). Out of scope
  per the deviation scope boundary.

## TDD gate compliance

Task 2 (`tdd="true"`) followed RED → GREEN:
- RED: `test(quick-260620-mav)` commit `3090a16` — test failed to import the
  non-existent util (confirmed before implementation).
- GREEN: `feat(quick-260620-mav)` commit `b4bfec6` — 10/10 tests pass.
- No REFACTOR commit needed.

## Deviations from Plan

None affecting behavior. Two plan-vs-reality notes (not deviations):
- **brain.ts listed but not edited** — the plan's Task-3 `<files>` listed
  `brain.ts`, but the action text targets `mintTasksFromBrain` which lives in
  `taskMint.ts`. `brain.ts` (`readUnifiedBrain`) needed no change, and its
  legacy title truncation stays untouched exactly as the hard constraint requires.
- **Task-5 routes listed but unedited** — expected per the plan ("likely zero");
  the sanitizer already carries the field.

## Known Stubs

None. `shortSummary` is a real LLM rewrite; truncation exists only as a defensive
≤48-char visual clamp (with the `…` glyph), never as the summarization mechanism.

## ORCHESTRATOR — remaining manual steps

The orchestrator must: (1) apply the migration via the Supabase MCP, and (2) run
`npx tsx scripts/backfill-task-summaries.ts` to backfill existing rows. Until
both run, new tasks created in production will keep `short_summary` NULL (the
column won't exist yet) and the UI will fall back to the full title — no errors.

## Self-Check: PASSED

All 6 created files exist on disk; all 6 task commits
(`777b550`, `3090a16`, `b4bfec6`, `c4c2d9e`, `840f8ab`, `8667501`) are present
in git history.
