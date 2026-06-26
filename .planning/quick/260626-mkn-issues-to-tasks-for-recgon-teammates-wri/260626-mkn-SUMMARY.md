---
phase: quick-260626-mkn
plan: 01
subsystem: recgon-issues
tags: [issues, task-minting, dispatcher, llm, terminal-tools]
requires:
  - "agent_tasks table + source/source_ref columns + uq_agent_tasks_source_ref index"
  - "mintTasksFromBrain skill-tag → create → summarize pipeline"
  - "runDispatch best-fit assignment"
provides:
  - "issues table + issueStorage CRUD"
  - "breakDownIssue + convertIssueToTasks conversion engine"
  - "issues REST API + /issues inbox UI + nav link"
  - "issue_create / issue_list / issue_get terminal tools + /issue //issues slash commands"
affects:
  - "src/lib/recgon/storage.ts (exported mapTask + TaskRow)"
  - "src/lib/recgon/taskMint.ts (extracted mintEntries shared body)"
  - "src/lib/recgon/types.ts (TaskSource += 'issue')"
tech-stack:
  added: []
  patterns:
    - "injectable chat adapter + lazy default (purity for unit tests, mirrors taskSummaries.ts)"
    - "fail-soft LLM with single-task fallback (issue never lost)"
    - "stable dedupKey issue|<id>|<index> + unique source_ref index for idempotent mint"
key-files:
  created:
    - supabase/migrations/20260626_issues.sql
    - src/lib/issueStorage.ts
    - src/lib/recgon/issueToTasks.ts
    - src/app/api/teams/[id]/issues/route.ts
    - src/app/api/teams/[id]/issues/[issueId]/route.ts
    - src/app/issues/page.tsx
    - src/app/issues/NewIssueModal.tsx
    - src/lib/tools/issues/issueCard.ts
    - src/lib/tools/issues/issueCreate.ts
    - src/lib/tools/issues/issueList.ts
    - src/lib/tools/issues/issueGet.ts
    - src/lib/tools/issues/index.ts
    - src/__tests__/issueToTasks.test.ts
  modified:
    - src/lib/recgon/types.ts
    - src/lib/recgon/storage.ts
    - src/lib/recgon/taskMint.ts
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/components/v2/TopNavV2.tsx
    - src/lib/tools/registry.ts
    - src/lib/terminal/commands.ts
    - messages/en/nav.json
    - messages/tr/nav.json
decisions:
  - "task_count = entries.length (intended count), not freshly-inserted rows, so an idempotent re-run that dedups everything never zeroes the count"
  - "no tombstoning on the issue path — issue entries carry their own dedupKey + the unique source_ref index is the dedup guarantee"
  - "issues UI uses hardcoded English copy (no new i18n namespace) — only the nav label is i18n'd; consistent with deferred Turkish full-UI extraction"
metrics:
  duration: ~35m
  completed: 2026-06-26
---

# Quick Task 260626-mkn: Issues → Tasks for Recgon Teammates Summary

Teammates file free-text issues into an inbox; Recgon breaks each into 1-or-many right-sized tasks via one Gemini Flash call, mints them with `source='issue'` reusing the existing skill-tag → create → summarize → dispatch pipeline, links each task back to its issue via `source_ref={issueId,index}`, and runs dispatch — all inline on submit. Runs ALONGSIDE the existing brain; nothing in brain readers changed.

## What shipped

- **Data layer** — `issues` table migration + `issueStorage.ts` (teamId-scoped CRUD + `listTasksForIssue`). `TaskSource` gained `'issue'`. Exported `mapTask` + `TaskRow` from `recgon/storage.ts` so `listTasksForIssue` reuses the canonical mapper.
- **Conversion engine** — `IssueBreakdownResponseSchema` (`.min(1).max(8)` over-split guard, TaskKind-constrained), `ISSUE_BREAKDOWN_SYSTEM` + `issueBreakdownUserPrompt` (`<user_content>`-wrapped, injection-safe). `taskMint.ts` refactored: shared body extracted to private `mintEntries`; `mintTasksFromBrain` delegates to it (unchanged externally); new `mintTasksFromIssue` delegates too. `issueToTasks.ts`: `breakDownIssue` (fail-soft → 1 task from the issue itself), `buildIssueEntries` (pure, stable dedupKeys), `convertIssueToTasks` (status → breakdown → mint → status → fire-and-forget `runDispatch`).
- **API** — `GET/POST /api/teams/[id]/issues` (list + create-and-convert, awaited, returns `taskCount`) and `GET/PATCH/DELETE /api/teams/[id]/issues/[issueId]`. Team auth on every handler; `createdBy` from session; team-scoped issue guard; linked tasks sanitized at the boundary.
- **UI** — `/issues` inbox: SWR list keyed by teamId, expandable rows with lazy-loaded linked tasks (`TaskStatusChip` + assignee name), status pill, `EmptyState`, design-token styling (`glass-card`, `recgon-label`, signature pink, JetBrains Mono). `NewIssueModal` mirrors `new-task-modal`. Issues nav link in `TopNavV2` + en/tr i18n keys.
- **Terminal** — `issue_create` / `issue_list` / `issue_get` tools registered alongside `taskTools`; `/issue` (file + split) and `/issues` (list) slash commands.
- **Test** — `issueToTasks.test.ts`: split / atomic / fail-soft (throw + malformed JSON) + dedupKey + idempotency, via injected stub chat adapter (no live LLM/DB). 7/7 pass.

## Verification

- `npx tsc --noEmit` clean after every task.
- `npm run test`: **563 passed, 6 skipped** (68 files) — no regressions.
- `npm run lint`: **0 errors**, 55 pre-existing warnings (all `react-hooks/set-state-in-effect` in unrelated files). None of the new/modified files introduce warnings.

## Deviations from Plan

### Auto-fixed / additive

**1. [Rule 3 - Blocking] Exported `mapTask` + `TaskRow` from `recgon/storage.ts`**
- Plan said reuse "the same mapTask row→AgentTask mapper that storage.ts exposes" — but both were private. Exported them (additive) so `listTasksForIssue` reuses the canonical mapper instead of reimplementing it.
- Commit: 27df2a4

**2. [Rule 2 - Correctness] POST conversion wrapped in try/catch with soft warning**
- `convertIssueToTasks` is fail-soft on the LLM, but a storage/mint throw would otherwise 500 and lose the just-created issue. The POST handler now returns the saved issue with `taskCount: 0` + a warning so the issue is never lost.
- Commit: 80180ae

## Manual follow-up required (migration not applied)

**The `issues` table migration was written but NOT applied to live Supabase from this environment.** The Supabase MCP tools (`apply_migration` / `list_tables`) could not be loaded — `ToolSearch` is disabled in this context and the MCP tools are not directly registered. There is also no SQL-exec RPC (`exec_sql` etc.) on the project and no direct Postgres connection string in `.env.local` (only the REST service-role key), so DDL cannot be run programmatically. A `PROBE` confirmed the `issues` table does not yet exist.

The migration_application instructions explicitly permit this fallback: file written and correct, flagged here as a manual follow-up rather than guessing.

**Action for the user:** apply `supabase/migrations/20260626_issues.sql` to the live database (Supabase dashboard SQL editor, or `supabase db push`). Until then the `/issues` page and the issue tools will error on read/write because the table is missing — all other code (tsc/lint/test) is correct and the gate passed without touching the DB.

## TDD Gate Compliance

Task 6 is `tdd="true"`, but the implementation (Tasks 1–5) was ordered before the test per the plan, so the RED phase would pass immediately (code already existed). This is expected for a feature-closing test task — the test documents and pins existing behavior. The `test(...)` commit (9b01aef) lands after the `feat(...)` commits, which is the intended order for this plan structure.

## Self-Check: PASSED

All 9 spot-checked artifacts exist on disk; all 6 task commits (27df2a4, 5cb7f08, 80180ae, 7aeff17, 1e6c616, 9b01aef) are present in the git log.
