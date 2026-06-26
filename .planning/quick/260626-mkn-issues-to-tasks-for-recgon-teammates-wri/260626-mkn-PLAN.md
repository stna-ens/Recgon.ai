---
phase: quick-260626-mkn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260626_issues.sql
  - src/lib/recgon/types.ts
  - src/lib/issueStorage.ts
  - src/lib/prompts.ts
  - src/lib/schemas.ts
  - src/lib/recgon/issueToTasks.ts
  - src/lib/recgon/taskMint.ts
  - src/app/api/teams/[id]/issues/route.ts
  - src/app/api/teams/[id]/issues/[issueId]/route.ts
  - src/app/issues/page.tsx
  - src/app/issues/NewIssueModal.tsx
  - src/components/v2/TopNavV2.tsx
  - src/lib/tools/issues/issueCreate.ts
  - src/lib/tools/issues/issueList.ts
  - src/lib/tools/issues/issueGet.ts
  - src/lib/tools/issues/index.ts
  - src/lib/terminal/commands.ts
  - src/__tests__/issueToTasks.test.ts
autonomous: true
requirements: [ISSUES-01]
must_haves:
  truths:
    - "A teammate can write an issue (title + description) on /issues and see it listed"
    - "On submit, Recgon breaks the issue into 1-or-many tasks via one LLM call and shows the count"
    - "Each spawned task carries source='issue' and source_ref={issueId,index} linking back to the issue"
    - "An atomic issue yields exactly 1 task; a multi-part issue yields several (no over-split, max 8)"
    - "After conversion, runDispatch assigns the spawned tasks to best-fit teammates"
    - "If the breakdown LLM throws, the issue still yields exactly 1 task (the issue itself) — never lost"
    - "Re-running conversion on the same issue never duplicates tasks (unique source_ref index)"
    - "Issues are consumable from the terminal via issue_create / issue_list / issue_get"
  artifacts:
    - path: "supabase/migrations/20260626_issues.sql"
      provides: "issues table + idx_issues_team_status index"
      contains: "CREATE TABLE issues"
    - path: "src/lib/issueStorage.ts"
      provides: "Issue CRUD + listTasksForIssue, teamId-scoped"
      exports: ["createIssue", "listIssues", "getIssue", "updateIssueStatus", "closeIssue", "deleteIssue", "listTasksForIssue"]
    - path: "src/lib/recgon/issueToTasks.ts"
      provides: "breakDownIssue + convertIssueToTasks conversion engine"
      exports: ["breakDownIssue", "convertIssueToTasks"]
    - path: "src/app/api/teams/[id]/issues/route.ts"
      provides: "GET list + POST create-and-convert"
      exports: ["GET", "POST"]
    - path: "src/app/api/teams/[id]/issues/[issueId]/route.ts"
      provides: "GET issue+tasks, PATCH close/reopen, DELETE"
      exports: ["GET", "PATCH", "DELETE"]
    - path: "src/app/issues/page.tsx"
      provides: "Issues inbox UI"
      min_lines: 40
    - path: "src/__tests__/issueToTasks.test.ts"
      provides: "split-vs-single + dedupKey + fail-soft tests"
      contains: "breakDownIssue"
  key_links:
    - from: "src/app/api/teams/[id]/issues/route.ts"
      to: "convertIssueToTasks"
      via: "await on POST"
      pattern: "convertIssueToTasks"
    - from: "src/lib/recgon/issueToTasks.ts"
      to: "taskMint mintEntries/mintTasksFromIssue"
      via: "reused mint internals"
      pattern: "mintTasksFromIssue|mintEntries"
    - from: "src/lib/recgon/issueToTasks.ts"
      to: "runDispatch"
      via: "fire-and-forget after conversion"
      pattern: "runDispatch"
---

<objective>
Add an Issues system to Recgon: teammates write issues into an inbox; Recgon breaks each issue into 1-or-many right-sized tasks via a new LLM call, mints them as a new task `source='issue'` reusing the existing mint→dispatch pipeline, links tasks back to their issue, and runs dispatch — all inline and instant on submit.

Purpose: Give teammates a direct way to say "here's something that needs doing" that flows through the same skill-tag → assign → why-you machinery as brain-generated tasks. Runs ALONGSIDE the existing brain (additive, nothing breaks).
Output: New `issues` table, issueStorage, breakdown prompt+schema, conversion engine, API routes, /issues page + nav, terminal tools, and a focused test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@/Users/eneskis/.claude/plans/we-need-an-issues-logical-haven.md

# Source-of-truth files to mirror (read before editing)
@src/lib/recgon/storage.ts
@src/lib/recgon/taskMint.ts
@src/lib/recgon/types.ts
@src/app/api/teams/[id]/tasks/route.ts
@src/app/projects/page.tsx
@src/app/projects/[id]/tasks/new-task-modal.tsx

<interfaces>
<!-- Key contracts the executor needs. Confirm exact signatures by reading the files above. -->

From src/lib/recgon/types.ts:
- `TaskSource` union (line ~148): `'brain' | 'user' | 'teammate' | 'schedule'` → add `'issue'`.
- `BrainEntry` / `BrainSnapshot` shape — each entry has title, description, kind (TaskKind), priority, estimatedHours, source, sourceRef, dedupKey, projectId.
- `TaskKind` value set — the breakdown schema's `kind` must be one of these.

From src/lib/recgon/storage.ts:
- `createTask(...)` — persists to `agent_tasks`, returns null on `uq_agent_tasks_source_ref` conflict (idempotent dedup).
- Row→type mapper pattern + teamId scoping via `.eq('team_id', teamId)`. Supabase: `import { supabase } from '@/lib/supabase'`.

From src/lib/recgon/taskMint.ts:
- `mintTasksFromBrain(teamId, snapshot, opts)` — internal body: tagTasksWithSkills (./skillTagger) → createTask loop → generateTaskSummaries (./taskSummaries). Refactor that shared body into private `mintEntries(teamId, entries, opts)` and add `mintTasksFromIssue` delegating to it.
- `mintUserTask(...)` — existing single-task mint with inline skill-tagging (precedent for inline conversion cost).

From src/lib/recgon/dispatcher.ts:
- `runDispatch(teamId)` (~line 199) — scores + assigns the unassigned backlog. Fire-and-forget per `src/lib/llm/workers.ts:219`.

From src/lib/llm/providers.ts:
- `chatViaProviders(...)` — Gemini→Claude chain. Prompts use injection-safe `<user_content>…</user_content>` (see `TAG_TASK_SKILLS_SYSTEM`). `OutputLanguage` type exported from `src/lib/prompts.ts`.

From src/lib/teamStorage.ts + src/auth.ts:
- `verifyTeamAccess(teamId, userId)` / `verifyTeamWriteAccess(teamId, userId)`; `auth()` from `@/auth`.

From src/components/ui/index.ts:
- `Button`, `Modal`, `EmptyState`, `FormField`, `useToast`. Task status chip in `src/app/projects/[id]/tasks/list-view.tsx`. Design tokens: `.glass-card`, `recgon-label`, signature pink, JetBrains Mono — reuse exactly, no new aesthetics.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + TaskSource union + issueStorage</name>
  <files>supabase/migrations/20260626_issues.sql, src/lib/recgon/types.ts, src/lib/issueStorage.ts</files>
  <action>
  Create `supabase/migrations/20260626_issues.sql` with the `issues` table exactly as specified in the approved design: columns id (uuid pk default gen_random_uuid()), team_id (text NOT NULL REFERENCES teams(id) ON DELETE CASCADE), title (text NOT NULL), description (text), status (text NOT NULL DEFAULT 'open' CHECK status IN open/converting/converted/closed), task_count (int NOT NULL DEFAULT 0), created_by (text), created_at (timestamptz NOT NULL DEFAULT now()), converted_at (timestamptz); plus `CREATE INDEX idx_issues_team_status ON issues (team_id, status, created_at DESC)`.

  IMPORTANT — the user cannot run CLI. After writing the file, APPLY the migration to live Supabase using the Supabase MCP tool `mcp__supabase__apply_migration` (name: `20260626_issues`, the table+index SQL). Then confirm with `mcp__supabase__list_tables` that `issues` exists.

  Add `'issue'` to the `TaskSource` union in `src/lib/recgon/types.ts` (line ~148) — additive only, touch nothing else.

  Create `src/lib/issueStorage.ts` mirroring the CRUD style of `src/lib/recgon/storage.ts` (teamId-scoped `.eq('team_id', teamId)`, a row→Issue type mapper, `import { supabase } from '@/lib/supabase'`). Export an `Issue` type and: `createIssue(teamId, {title, description, createdBy})`, `listIssues(teamId)`, `getIssue(id)`, `updateIssueStatus(id, status, taskCount?)` (also set converted_at=now() when status='converted'), `closeIssue(id)`, `deleteIssue(id)`, and `listTasksForIssue(issueId)` which queries `agent_tasks` where `source='issue'` and `source_ref->>'issueId' = issueId` (use the same mapTask row→AgentTask mapper that storage.ts exposes — reuse, do not reimplement).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Migration file exists and is applied to live Supabase (issues table confirmed via list_tables); TaskSource includes 'issue'; issueStorage exports all 7 functions + Issue type; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Breakdown prompt+schema, taskMint refactor, conversion engine</name>
  <files>src/lib/prompts.ts, src/lib/schemas.ts, src/lib/recgon/taskMint.ts, src/lib/recgon/issueToTasks.ts</files>
  <action>
  In `src/lib/schemas.ts` add `IssueBreakdownResponseSchema`: `{ tasks: [{ title, description, kind, priority, estimatedHours }] }` — `kind` constrained to the TaskKind value set, `priority` int 0–3, `estimatedHours` positive number, the tasks array `.min(1).max(8)` (over-split guard rail). Mirror the existing `TaskSkillTagsResponseSchema` style.

  In `src/lib/prompts.ts` add `ISSUE_BREAKDOWN_SYSTEM` (persona: Recgon the AI PM; core instruction: "Decide whether this issue is a single task or is better delivered as a few smaller, independently-shippable tasks. Prefer the FEWEST tasks that are each clearly scoped — do not over-split. Return 1 task when it's already atomic.") and `issueBreakdownUserPrompt(title, description, lang)`. Wrap the issue text in `<user_content>…</user_content>` (injection-safe convention from `TAG_TASK_SKILLS_SYSTEM`). Thread `OutputLanguage` through like the other prompts.

  Refactor `src/lib/recgon/taskMint.ts`: extract the shared mint body of `mintTasksFromBrain` (skill-tag batch via tagTasksWithSkills → createTask loop → short-summary batch via generateTaskSummaries) into a private `mintEntries(teamId, entries, opts)`. Make `mintTasksFromBrain` call it. Add an exported `mintTasksFromIssue(teamId, entries, opts)` that delegates to `mintEntries`. Do NOT duplicate the mint logic and do NOT change `mintTasksFromBrain`'s external behavior.

  Create `src/lib/recgon/issueToTasks.ts`:
  - `breakDownIssue(issue, opts)` → calls `chatViaProviders` with ISSUE_BREAKDOWN_SYSTEM + issueBreakdownUserPrompt, validates against IssueBreakdownResponseSchema, returns the task list. FAIL-SOFT: on any LLM/parse error, return a single task derived from the issue itself (title=issue.title, description=issue.description, sensible default kind/priority/estimatedHours) so an issue is never lost.
  - `convertIssueToTasks(issueId)`: (1) load issue, `updateIssueStatus(issueId, 'converting')`; (2) `breakDownIssue` → build `BrainEntry[]` with `source: 'issue'`, `projectId: null`, `sourceRef: { issueId, index }`, and stable `dedupKey = issue|<issueId>|<index>`; (3) mint via `mintTasksFromIssue(teamId, entries, opts)`; (4) `updateIssueStatus(issueId, 'converted', mintedCount)`; (5) fire-and-forget `runDispatch(teamId)` (same pattern as `workers.ts:219`, with a `.catch`). Return `{ taskCount }`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Schema + prompts added; taskMint exposes mintTasksFromIssue delegating to a private mintEntries (mintTasksFromBrain unchanged externally); issueToTasks exports breakDownIssue (fail-soft) + convertIssueToTasks (build entries → mint → status → dispatch); tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: API routes (list/create-and-convert + issue detail)</name>
  <files>src/app/api/teams/[id]/issues/route.ts, src/app/api/teams/[id]/issues/[issueId]/route.ts</files>
  <action>
  Mirror `src/app/api/teams/[id]/tasks/route.ts` (same `auth()` + teamId param + verifyTeamAccess/verifyTeamWriteAccess pattern, same error/response shape).

  `src/app/api/teams/[id]/issues/route.ts`:
  - `GET`: verifyTeamAccess → `listIssues(teamId)` → return `{ issues }`.
  - `POST`: verifyTeamWriteAccess → parse `{ title, description }` → `createIssue(teamId, {title, description, createdBy: session.user.id})` → `await convertIssueToTasks(issue.id)` → return `{ issue, taskCount }`. Inline conversion is one Gemini Flash call (consistent with mintUserTask's inline skill-tagging) — keep it awaited so the client gets the real count.

  `src/app/api/teams/[id]/issues/[issueId]/route.ts`:
  - `GET`: verifyTeamAccess → `getIssue(issueId)` + `listTasksForIssue(issueId)` → return `{ issue, tasks }`.
  - `PATCH`: verifyTeamWriteAccess → close/reopen via `updateIssueStatus`/`closeIssue` based on body `{ status }`.
  - `DELETE`: verifyTeamWriteAccess → `deleteIssue(issueId)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Both routes export their handlers with team auth enforced; POST creates+converts+returns taskCount; detail route returns issue+linked tasks and supports PATCH/DELETE; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 4: Issues page, NewIssueModal, nav link</name>
  <files>src/app/issues/page.tsx, src/app/issues/NewIssueModal.tsx, src/components/v2/TopNavV2.tsx</files>
  <action>
  Create `src/app/issues/page.tsx` mirroring `src/app/projects/page.tsx`: `'use client'`, `useTeam()` for currentTeam, `useSWR('/api/teams/<id>/issues')` keyed by teamId. "New issue" button opens `NewIssueModal`. On successful POST, `mutate()` and toast "Recgon split this into N task(s)." Render issue rows: title, `recgon-label` status chip (open / converting / converted / closed), task_count, created_by, date. Row expands to show linked tasks (fetch via the issue detail route or lazy-load) — title + assignee + status chip, reusing the task status chip from `src/app/projects/[id]/tasks/list-view.tsx`. `EmptyState` when no issues. STRICTLY reuse existing tokens (`.glass-card`, `recgon-label`, signature pink, JetBrains Mono) — no new aesthetics. Read the nearby components first and reuse exact spacing/hover patterns.

  Create `src/app/issues/NewIssueModal.tsx` copying the structure of `src/app/projects/[id]/tasks/new-task-modal.tsx`: `Modal` + `FormField` for title (required) + description (textarea), submit calls POST, surfaces loading state, returns taskCount to the page for the toast.

  Add an "Issues" nav link to `src/components/v2/TopNavV2.tsx` beside Tasks (match the existing link markup/active-state exactly).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20 && npm run lint 2>&1 | tail -15</automated>
  </verify>
  <done>/issues renders the inbox with SWR list, New issue modal posts and toasts the task count, rows show status chip + expandable linked tasks, nav has an Issues link; tsc + lint clean; design tokens reused (no new aesthetics).</done>
</task>

<task type="auto">
  <name>Task 5: Terminal tools + slash commands</name>
  <files>src/lib/tools/issues/issueCreate.ts, src/lib/tools/issues/issueList.ts, src/lib/tools/issues/issueGet.ts, src/lib/tools/issues/index.ts, src/lib/terminal/commands.ts</files>
  <action>
  Create the `src/lib/tools/issues/` barrel mirroring `src/lib/tools/tasks/` (same tool definition shape, team-scoped, same return/card conventions):
  - `issueCreate.ts` — creates the issue then calls `convertIssueToTasks`, returns the issue + spawned task count (reuse the engine, do not reimplement).
  - `issueList.ts` — `listIssues(teamId)`.
  - `issueGet.ts` — `getIssue` + `listTasksForIssue` (issue + its spawned tasks).
  - `index.ts` — export the barrel and register the tools where the tasks-tools barrel is registered (mirror that registration site exactly).

  In `src/lib/terminal/commands.ts` add `/issue` and `/issues` entries to `SLASH_COMMANDS` mapping to the issue create/list directives, matching the existing slash-command structure.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>issue_create / issue_list / issue_get tools exist, are registered alongside the task tools, and /issue //issues slash commands are present; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: breakDownIssue test + full lint/test gate</name>
  <files>src/__tests__/issueToTasks.test.ts</files>
  <behavior>
    - Multi-part issue (stubbed chatViaProviders returns 3 tasks) → breakDownIssue yields 3 entries; convertIssueToTasks builds 3 BrainEntries with stable dedupKeys issue|<id>|0..2 and source='issue'.
    - Atomic issue (stub returns 1 task) → exactly 1 entry (no over-split).
    - Fail-soft: stub chatViaProviders to throw → breakDownIssue returns exactly 1 task derived from the issue itself (issue never lost).
  </behavior>
  <action>
  Create `src/__tests__/issueToTasks.test.ts` mirroring the existing `taskMint` / brain tests. Stub `chatViaProviders` (inject or vi.mock per the existing test convention) for the three cases above. Assert entry counts, stable dedupKeys, and source='issue'. Do NOT hit the real LLM or live DB — stub the storage/mint boundary the way existing tests do.

  Then run the full gate: `npm run test` and `npm run lint` must pass with no regressions to the existing suite.
  </action>
  <verify>
    <automated>npm run test 2>&1 | tail -25 && npm run lint 2>&1 | tail -10</automated>
  </verify>
  <done>New test covers split / atomic / fail-soft with stable dedupKey assertions; full suite green (no regressions); lint clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/teams/[id]/issues | Untrusted issue title/description crosses here; user-scoped team access must be enforced |
| issue text → breakdown LLM | Untrusted free text reaches the LLM prompt (prompt-injection surface) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mkn-01 | Elevation/Information | issues API routes | mitigate | verifyTeamAccess (GET) + verifyTeamWriteAccess (POST/PATCH/DELETE) on every handler; createdBy from session, never body. teamId-scoped queries via .eq('team_id', teamId). |
| T-mkn-02 | Tampering | breakdown LLM prompt | mitigate | Wrap issue text in `<user_content>…</user_content>` (injection-safe convention); validate LLM output against IssueBreakdownResponseSchema (.min(1).max(8)); kind constrained to TaskKind set. |
| T-mkn-03 | Denial of service | inline conversion on POST | accept | One Gemini Flash call per submit, well within Vercel limits and consistent with mintUserTask; max(8) caps task fan-out. |
| T-mkn-04 | Repudiation/data-loss | conversion engine | mitigate | Fail-soft: LLM error → single task from the issue itself; idempotent dedupKey `issue|<id>|<index>` + unique source_ref index prevents duplicate tasks on re-run. |
</threat_model>

<verification>
End-to-end (from the approved design):
1. Migration applied via Supabase MCP; `issues` table + index confirmed via list_tables.
2. Multi-part issue ("Add dark mode: theme toggle, persisted preference, updated docs") → toast reports ~3 tasks, status converted, linked tasks visible, then assigned after dispatch.
3. Atomic issue ("Fix typo on login button") → exactly 1 task (no over-split).
4. Idempotency: re-trigger conversion → no duplicate tasks (unique source_ref index holds).
5. Fail-soft: breakdown stubbed to throw → still exactly 1 task, status converted, never lost.
6. Terminal: issue_create then issue_get returns the issue + its tasks.
7. `npm run test` + `npm run lint` pass; breakDownIssue split-vs-single test added.
</verification>

<success_criteria>
- Issues run ALONGSIDE the existing brain — readUnifiedBrain and brain readers untouched.
- A teammate writes an issue → Recgon splits it inline → tasks minted with source='issue' and source_ref linkage → dispatch assigns them.
- Existing mint/skilltag/summary/dispatch helpers reused (no reimplementation); mintEntries shared between brain and issue paths.
- All 6 tasks' automated verifications pass (tsc, lint, full test suite green).
</success_criteria>

<output>
After completion, create `.planning/quick/260626-mkn-issues-to-tasks-for-recgon-teammates-wri/260626-mkn-SUMMARY.md`
</output>
