---
phase: quick-260620-mav
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260620_agent_tasks_short_summary.sql
  - src/lib/recgon/types.ts
  - src/lib/recgon/storage.ts
  - src/lib/prompts.ts
  - src/lib/schemas.ts
  - src/lib/recgon/taskSummaries.ts
  - src/lib/recgon/taskMint.ts
  - src/lib/recgon/brain.ts
  - src/app/api/teams/[id]/tasks/route.ts
  - src/lib/recgon/displayTitle.ts
  - src/components/v2/calendar/EventChip.tsx
  - src/components/v2/command/types.ts
  - src/components/v2/command/DecisionStack.tsx
  - scripts/backfill-task-summaries.ts
  - src/__tests__/taskSummaries.test.ts
  - src/__tests__/displayTitle.test.ts
autonomous: true
requirements: [QUICK-260620-MAV]

must_haves:
  truths:
    - "agent_tasks rows can store a short_summary (nullable column exists)"
    - "AgentTask carries shortSummary end-to-end (storage -> API -> client) via the existing Omit-spread sanitizer"
    - "generateTaskSummaries returns one real LLM-written summary per input task in a SINGLE batched call, in the team's language"
    - "Brain-minted tasks and manually-created tasks get a shortSummary at creation time (inline, not via cron)"
    - "An LLM failure during summary generation NEVER blocks or fails task creation - shortSummary stays null and the row persists"
    - "Calendar chips (regular + multi-day) and command-center decision rows display shortSummary when present, falling back to the full clean title otherwise"
    - "The chip title= hover attribute and the task detail panel still show the FULL title (never the short summary)"
    - "Existing rows can be backfilled idempotently by a one-time script the orchestrator runs"
  artifacts:
    - path: "supabase/migrations/20260620_agent_tasks_short_summary.sql"
      provides: "Additive nullable short_summary column on agent_tasks"
      contains: "ADD COLUMN IF NOT EXISTS short_summary"
    - path: "src/lib/recgon/taskSummaries.ts"
      provides: "Batched, language-aware, fail-soft generateTaskSummaries()"
      exports: ["generateTaskSummaries"]
    - path: "src/lib/recgon/displayTitle.ts"
      provides: "Pure helper picking shortSummary || cleanTitle for display surfaces"
      exports: ["taskDisplayTitle"]
    - path: "scripts/backfill-task-summaries.ts"
      provides: "Idempotent chunked backfill of null short_summary rows"
  key_links:
    - from: "src/lib/recgon/taskMint.ts"
      to: "src/lib/recgon/taskSummaries.ts"
      via: "mintTasksFromBrain + mintUserTask call generateTaskSummaries then persist via setTaskShortSummary"
      pattern: "generateTaskSummaries"
    - from: "src/components/v2/calendar/EventChip.tsx"
      to: "src/lib/recgon/displayTitle.ts"
      via: "chip text = shortSummary || cleanTitle, hover title stays cleanTitle"
      pattern: "shortSummary"
    - from: "src/components/v2/command/DecisionStack.tsx"
      to: "task.shortSummary"
      via: "v2-mc-ds-title renders shortSummary || title"
      pattern: "shortSummary"
---

<objective>
Add AI-generated SHORT SUMMARIES of tasks for compact UI surfaces (primarily the
week calendar chips, secondarily the command-center decision rows), where the
full task title is too long to read at a glance.

The short version is a REAL LLM-written summary (~3-6 words, <= ~40 chars,
imperative, no trailing punctuation, no markdown) - NOT string truncation.
Example: "Implement OAuth token refresh logic in the analytics engine to prevent
session expiry during long report generation" -> "Refresh expiring OAuth tokens".

Purpose: glanceable calendar / command-center labels without losing the full
title (which still lives on hover + in the detail panel).
Output: a nullable `short_summary` column, a batched fail-soft generation util,
inline wiring at both task-creation paths, a display-fallback helper used by the
chip + command center, a one-time backfill script, and unit tests.

HARD CONSTRAINTS (from design intent - do not violate):
- The short text is produced by the LLM. NEVER produce it by word-boundary /
  character truncation. (The existing `title` truncation in brain.ts stays
  untouched for back-compat - that is a separate, legacy field.)
- Summary generation is GRACEFUL: any LLM error is caught, `shortSummary` is left
  null, and task creation proceeds. It must never block or fail a create.
- Generate INLINE at creation, batched (one LLM call for N tasks). Do NOT add a
  new `llm_jobs` worker kind and do NOT route this through the daily cron (that
  has a documented up-to-24h lag).
- Per-task LLM cost stays bounded: batched calls only; summaries generated once
  and stored; never per-render.
- Design system: NO new aesthetics, NO restyle. Text-source change only - reuse
  existing tokens / classes. If any ellipsis is ever needed use the '…' glyph.
  No emojis anywhere.
</objective>

<orchestrator_vs_executor>
The EXECUTOR (you) writes ALL code and files below, including the migration .sql
file and the backfill .ts script. The EXECUTOR must NOT run the migration and
must NOT run the backfill script.

The ORCHESTRATOR (not you) handles, AFTER this plan completes:
  1. Applying the migration to the live DB via the Supabase MCP.
  2. Running `npx tsx scripts/backfill-task-summaries.ts` to backfill existing rows.

In Task 1 and Task 6, leave a clear note in the file header that application /
execution is the orchestrator's job.
</orchestrator_vs_executor>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from the codebase. Use these directly - no exploration needed. -->

AgentTask (src/lib/recgon/types.ts ~217-285) - add ONE new field near the
Phase-4 personalizedDescription block:
  shortSummary?: string | null;
  // LLM-written ~3-6 word label for the calendar chip + command rows. NULL on
  // pre-migration rows, when the LLM failed, or before generation. Canonical
  // `title` is unchanged and remains the source for hover + the detail panel.

TaskRow (src/lib/recgon/storage.ts ~90-132) - add the snake_case column:
  short_summary?: string | null;

mapTask() (src/lib/recgon/storage.ts ~134-191) - add:
  shortSummary: row.short_summary ?? null,

createTask() (storage.ts ~373) already strips markdown via stripMd() on title +
description and returns a mapped AgentTask. Its INSERT does NOT include
short_summary (the column is patched AFTER insert, once the summary is generated).
The unique-violation path returns null = "already minted".

sanitizeTaskForClient (src/lib/recgon/taskSanitizer.ts) uses Omit + rest-spread:
it strips ONLY assignmentReasoning + personalizedDescription*. Therefore any NEW
field on AgentTask (shortSummary) flows to clients automatically - no edit to
the sanitizer is required. Both the calendar feed and the command feed pass tasks
through this sanitizer, so shortSummary reaches `card.task.shortSummary` and the
command payload tasks.

localeDirective(lang) (src/lib/prompts.ts ~19) - the i18n pattern every existing
generator follows: caller takes `language?: OutputLanguage` and appends
`localeDirective(language)` to the SYSTEM prompt. JSON keys stay English; only
string VALUES translate. wrapUntrusted is already imported in prompts.ts.

chatViaProviders (src/lib/llm/providers.ts ~281) - Gemini->Claude fallback chain.
ChatOptions supports { temperature, maxTokens, taskKind, responseMimeType:
'application/json' | 'text/plain', timeoutMs }. Pattern to mirror is
src/lib/recgon/reframe.ts (runReframe): temperature 0, JSON mode, Zod-validate
the response, short timeout (this runs off the interactive request, and reframe
uses a lazy default adapter so module-load never drags in the LLM SDK during a
unit test).

User.language (src/lib/userStorage.ts) is 'en' | 'tr'; getUserById(id) returns a
User. This is how we resolve OutputLanguage for the create paths (there is NO
team-level language column - language is per-user).

CalendarCard (src/components/v2/calendar/calendarTypes.ts) carries BOTH `title`
(currently = task.title, set in calendarUtils.ts ~102) AND the full `task:
AgentTask`. EventChip already computes `cleanTitle = stripMd(card.title)` (~56),
renders it in `.cal-chip-title` (~124) for BOTH regular and multi-day variants
(same JSX span), and sets `title={cleanTitle}` (~112) as the hover attribute. The
multi-day CSS clamp is around line 294 - leave CSS alone.

DecisionStack (src/components/v2/command/DecisionStack.tsx) renders `{task.title}`
inside `.v2-mc-ds-title` at FOUR call sites (~173, ~217, ~252, ~291). `task` is a
`CommandTask` (src/components/v2/command/types.ts ~5) - add `shortSummary?:
string | null` there. The command page (src/app/command/page.tsx) passes the
sanitized payload straight through (no field-picking), so the new field arrives
intact.

EXISTING migration convention (supabase/migrations/20260520_personalized_description_columns.sql):
  ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS <col> TEXT NULL;
  + a COMMENT ON COLUMN. Additive, no data migration, IF NOT EXISTS guards.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + AgentTask/storage field (storage plumbing)</name>
  <files>supabase/migrations/20260620_agent_tasks_short_summary.sql, src/lib/recgon/types.ts, src/lib/recgon/storage.ts</files>
  <action>
    1. Create supabase/migrations/20260620_agent_tasks_short_summary.sql mirroring
       the 20260520 convention EXACTLY: a header comment noting it is additive +
       fail-soft + that APPLICATION IS HANDLED BY THE ORCHESTRATOR (do not run it),
       then `ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS short_summary TEXT
       NULL;`, then a `COMMENT ON COLUMN agent_tasks.short_summary IS '...'`
       describing it as the LLM-written compact-UI label (quick-260620-mav), NULL
       when not yet generated / LLM failed / pre-migration. No index needed.
    2. In src/lib/recgon/types.ts add `shortSummary?: string | null;` to AgentTask
       next to the Phase-4 personalizedDescription block, with a short comment per
       the interfaces block above.
    3. In src/lib/recgon/storage.ts: add `short_summary?: string | null;` to the
       TaskRow type, and add `shortSummary: row.short_summary ?? null,` to
       mapTask(). Then add a fail-soft writer used by the create paths:
       `export async function setTaskShortSummary(taskId: string, summary: string):
       Promise<void>` that updates agent_tasks SET short_summary = stripMd(summary)
       WHERE id = taskId. Import stripMd the same way createTask does. On any error,
       logger.warn and return (NEVER throw) so a write failure cannot bubble into
       the create path. Do NOT touch createTask's insert payload.
    Do NOT run the migration. Executor only writes the file.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "types.ts|storage.ts|short_summary|shortSummary" || echo "no type errors in changed files"</automated>
  </verify>
  <done>Migration file exists with `ADD COLUMN IF NOT EXISTS short_summary` + a header note that the orchestrator applies it; AgentTask has `shortSummary?`; TaskRow + mapTask map the column; `setTaskShortSummary` exists and is fail-soft; project still typechecks.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Batched summary prompt + schema + generateTaskSummaries util</name>
  <files>src/lib/prompts.ts, src/lib/schemas.ts, src/lib/recgon/taskSummaries.ts, src/__tests__/taskSummaries.test.ts</files>
  <behavior>
    - N inputs in -> exactly N summaries out (order preserved, 1:1).
    - Injected chat adapter throws -> returns an array of N nulls (never throws).
    - LLM returns malformed JSON / wrong-length array -> returns N nulls (fail-soft).
    - language='tr' appends the Turkish localeDirective to the system prompt; language defaults to 'en' (no directive).
    - Each returned summary is trimmed, markdown-stripped, has no trailing '.', and is clamped defensively to <= ~48 chars as a LAST-RESORT visual guard ONLY (the prompt asks the LLM to stay <= ~40 chars; clamping is a safety net, never the summarization mechanism). Empty/whitespace coerces to null.
  </behavior>
  <action>
    1. In src/lib/prompts.ts add `TASK_SUMMARIES_SYSTEM` instructing: "You write
       ultra-short glanceable labels for a calendar. For each task, output a label
       of ~3-6 words, <= 40 characters, imperative voice, no trailing punctuation,
       no markdown, capturing the single core action. Do NOT truncate the title -
       rewrite it concisely." Specify EXACT JSON output `{ "summaries": ["...",
       "..."] }`, one entry per input in the same order. Also add
       `taskSummariesUserPrompt(items: { title: string; description?: string }[])`
       emitting a numbered list (title + a short slice of description for context)
       wrapped with `wrapUntrusted` (already imported) so task text cannot hijack
       the instructions. (localeDirective is appended at the CALL site in the util.)
    2. In src/lib/schemas.ts add `TaskSummariesResponseSchema = z.object({
       summaries: z.array(z.string()) })` and export its inferred type.
    3. Create src/lib/recgon/taskSummaries.ts exporting
       `generateTaskSummaries(items, opts?: { language?: OutputLanguage; chat?: <chat adapter> }):
       Promise<(string | null)[]>`. Mirror reframe.ts purity: do NOT import
       chatViaProviders at top level; lazily construct the default adapter inside
       the function when opts.chat is undefined. Empty input -> return []. Build the
       system prompt as `TASK_SUMMARIES_SYSTEM + localeDirective(opts.language)`,
       call the adapter at temperature 0 with JSON mode + timeoutMs ~10_000, parse
       via TaskSummariesResponseSchema. If parse fails OR array length !==
       items.length -> return `items.map(() => null)`. On any thrown error -> catch,
       logger.warn, return `items.map(() => null)`. For each valid string: stripMd,
       trim, strip a single trailing '.', clamp to <= 48 chars (word boundary,
       append '…' only if actually cut), coerce '' -> null.
    4. Write src/__tests__/taskSummaries.test.ts (vitest) covering every <behavior>
       bullet using an injected STUB chat adapter (no network). Assert N-in/N-out,
       null-on-throw, null-on-malformed, language passthrough (the stub received a
       system prompt containing the Turkish directive marker when language='tr'),
       and that a clean string passes through trimmed + de-punctuated.
    Keep prompts in prompts.ts and the schema in schemas.ts ONLY.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx vitest run src/__tests__/taskSummaries.test.ts 2>&1 | tail -25</automated>
  </verify>
  <done>generateTaskSummaries is batched (one call for N), language-aware, and fail-soft (N nulls on any error); prompt lives in prompts.ts, schema in schemas.ts; the new test passes.</done>
</task>

<task type="auto">
  <name>Task 3: Wire generation into both creation paths (brain mint + manual)</name>
  <files>src/lib/recgon/taskMint.ts, src/lib/recgon/brain.ts, src/app/api/teams/[id]/tasks/route.ts</files>
  <action>
    Generate INLINE at creation, batched, fail-soft. Keep title/description EXACTLY
    as today (do NOT alter the legacy title truncation in brain.ts).

    1. BRAIN MINT - in src/lib/recgon/taskMint.ts `mintTasksFromBrain(teamId,
       snapshot, opts?)`: add an optional `opts?: { language?: OutputLanguage }`
       param. After the loop builds `minted: AgentTask[]`, if minted.length > 0 call
       `generateTaskSummaries(minted.map(t => ({ title: t.title, description:
       t.description })), { language: opts?.language })` ONCE, then for each minted
       task with a non-null summary `await setTaskShortSummary(task.id, summary)`
       and set `task.shortSummary = summary` on the in-memory object. Wrap the whole
       summary block in try/catch -> logger.warn and continue (NEVER throw). Import
       generateTaskSummaries, setTaskShortSummary, and the OutputLanguage type.
    2. CALLERS - the two mint callers are src/lib/recgon/dispatcher.ts (~185) and
       src/lib/recgon/scheduled.ts (~112). Resolve the team's language from the team
       OWNER's user record (owner lookup -> getUserById(ownerUserId).language),
       default 'en' on any miss, and pass `{ language }`. Keep the resolution cheap
       and fail-soft. If a clean owner->language lookup is not readily available in a
       caller, default to 'en' there rather than adding heavy plumbing - note the
       choice in the SUMMARY.
    3. MANUAL CREATE - in src/app/api/teams/[id]/tasks/route.ts POST, after
       `mintUserTask(...)` returns `task` (~110-121) and BEFORE the assign/dispatch
       branches, resolve language via `(await
       getUserById(session.user.id))?.language ?? 'en'`, then call
       `generateTaskSummaries([{ title: task.title, description: task.description }],
       { language })`; if the single result is non-null, `await
       setTaskShortSummary(task.id, summary)` and set `task.shortSummary = summary`.
       Wrap in try/catch -> logger.warn, never block the response. The final
       `getTask(task.id)` re-read already re-maps short_summary, so the returned
       payload reflects it. Import generateTaskSummaries, setTaskShortSummary,
       getUserById.
    Do NOT add an llm_jobs worker kind. Do NOT touch the cron.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "taskMint.ts|brain.ts|tasks/route.ts|dispatcher.ts|scheduled.ts" || echo "no type errors in changed files"</automated>
  </verify>
  <done>Brain-minted and manually-created tasks attempt a batched shortSummary at creation and persist it via setTaskShortSummary; every summary block is try/catch-wrapped and never blocks/fails creation; no new worker kind; title/description unchanged; project typechecks.</done>
</task>

<task type="auto">
  <name>Task 4: Display helper + render wiring (calendar chips + command center)</name>
  <files>src/lib/recgon/displayTitle.ts, src/components/v2/calendar/EventChip.tsx, src/components/v2/command/types.ts, src/components/v2/command/DecisionStack.tsx, src/__tests__/displayTitle.test.ts</files>
  <action>
    Display-only. Reuse existing tokens/classes - text-source change ONLY. Keep the
    FULL title on hover + in the detail panel.

    1. Create src/lib/recgon/displayTitle.ts exporting a PURE helper
       `taskDisplayTitle(task: { shortSummary?: string | null; title: string }):
       string` that returns `task.shortSummary?.trim() || task.title`. Keep it
       dependency-free so it unit-tests trivially.
    2. EventChip.tsx: the visible chip text currently renders `{cleanTitle}` in
       `.cal-chip-title` (~124). Change the SOURCE only: compute `const display =
       stripMd(card.task.shortSummary?.trim() || card.title)` (reuse the existing
       stripMd import) and render `{display}` in that span. This applies to BOTH the
       regular and multi-day chip (same JSX span). Leave `title={cleanTitle}` (the
       hover attribute, ~112) UNCHANGED so hover still shows the FULL clean title.
       Do NOT change any CSS / clamp / class.
    3. CommandTask type (src/components/v2/command/types.ts ~5): add `shortSummary?:
       string | null;`.
    4. DecisionStack.tsx: at the FOUR `.v2-mc-ds-title` render sites (~173, ~217,
       ~252, ~291) replace `{task.title}` with `{task.shortSummary?.trim() ||
       task.title}` (or import taskDisplayTitle and use `{taskDisplayTitle(task)}` -
       pick one and stay consistent). No style/class changes.
    5. Do NOT touch TaskDetailPanel.tsx (must keep full title/description).
    6. Write src/__tests__/displayTitle.test.ts asserting: shortSummary present ->
       returned; shortSummary null/undefined/empty/whitespace -> falls back to
       title; title returned verbatim when no summary.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx vitest run src/__tests__/displayTitle.test.ts 2>&1 | tail -15</automated>
  </verify>
  <done>taskDisplayTitle exists + is unit-tested; calendar regular + multi-day chips show shortSummary||cleanTitle while the hover title= stays the full clean title; DecisionStack's four rows show shortSummary||title; CommandTask has the field; TaskDetailPanel untouched.</done>
</task>

<task type="auto">
  <name>Task 5: Verify fetch paths return shortSummary (calendar + command)</name>
  <files>src/app/api/calendar/route.ts, src/app/api/teams/[id]/tasks/route.ts, src/app/api/teams/[id]/command/route.ts</files>
  <action>
    A common miss: the new field silently dropped by a `.select(...)` column list or
    a hand-built response object. Verify (and patch ONLY if needed) that
    shortSummary actually reaches the calendar + command clients.

    1. Storage reads already use `.select('*')` in listTasks (~405) and getTask, so
       short_summary IS fetched + mapped. The risk is purely at the API
       serialization boundary.
    2. CALENDAR feed = `/api/calendar` (PersonalCalendar uses useSWR('/api/calendar?...')).
       Open src/app/api/calendar/route.ts and confirm returned tasks go through
       `sanitizeTaskForClient` (Omit-spread carries shortSummary) OR are spread
       whole. If - and only if - it hand-picks task fields into a literal object,
       ADD `shortSummary: task.shortSummary ?? null` to that object. If it already
       spreads / sanitizes, change NOTHING.
    3. COMMAND feed = src/app/api/teams/[id]/command/route.ts - it maps tasks via
       `sanitizeTaskForClient` (safeTasks, ~77). Confirm tasks are returned through
       that sanitizer. If it later narrows fields into a literal, add shortSummary
       there; otherwise change nothing.
    4. The manual `/api/teams/[id]/tasks` GET + POST already return via
       sanitizeTaskForClient - no change expected; just confirm.
    Make the SMALLEST possible change. Prefer "no edit" when the sanitizer/spread
    already carries the field. Record in the SUMMARY which routes needed an edit
    (likely zero).
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && grep -rn "shortSummary|sanitizeTaskForClient|\.select\(" src/app/api/calendar/route.ts "src/app/api/teams/[id]/command/route.ts" | head -20; npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "calendar/route.ts|command/route.ts|tasks/route.ts" || echo "ok: fetch paths typecheck"</automated>
  </verify>
  <done>It is confirmed (and patched only where a literal field-pick dropped it) that shortSummary is returned by the calendar feed (/api/calendar) and the command feed; the manual tasks feed already carries it; project typechecks.</done>
</task>

<task type="auto">
  <name>Task 6: Idempotent backfill script + final test/lint gate</name>
  <files>scripts/backfill-task-summaries.ts</files>
  <action>
    1. Create scripts/backfill-task-summaries.ts runnable via `npx tsx`. Header
       comment MUST state: ONE-TIME, idempotent (fills NULLs only), chunked, and
       that THE ORCHESTRATOR RUNS THIS (the executor must NOT run it).
    2. Logic: using the service-role supabase client (src/lib/supabase.ts), select
       agent_tasks rows where short_summary IS NULL (columns: id, title,
       description, created_by). Process in chunks of ~30. Resolve language per row
       from the row's creator: getUserById(created_by)?.language ?? 'en' (cache by
       userId to avoid duplicate lookups; default 'en' when created_by is null -
       brain tasks). Because a chunk may mix languages, group the chunk BY language
       and call generateTaskSummaries once per language-group (still batched),
       preserving id<->summary alignment. For each non-null summary call
       setTaskShortSummary(id, summary). Skip rows whose summary came back null
       (leave NULL -> idempotent re-run can retry). Log progress (logger.info:
       processed N, filled M, skipped K per chunk) + a final total.
    3. Safe to run repeatedly: it only ever targets short_summary IS NULL, so a
       re-run fills only the still-empty rows. No deletes, no title edits.
    4. After writing the script, run the gates and report results in the SUMMARY:
       - `npm run test` (at minimum the two new suites must pass; report the full result).
       - `npm run lint`.
    DO NOT execute the backfill script. Writing it is the deliverable.
  </action>
  <verify>
    <automated>cd /Users/eneskis/Documents/Projects/Recgon && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "backfill-task-summaries" ; npx vitest run src/__tests__/taskSummaries.test.ts src/__tests__/displayTitle.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Backfill script exists, is idempotent (short_summary IS NULL only), chunked, language-aware per creator, and clearly marked "orchestrator runs this"; both new test suites pass; `npm run lint` clean (report results in SUMMARY).</done>
</task>

</tasks>

<verification>
- Migration file present with additive `ADD COLUMN IF NOT EXISTS short_summary`.
- `npx tsc --noEmit` passes for all changed files.
- `npx vitest run src/__tests__/taskSummaries.test.ts src/__tests__/displayTitle.test.ts` passes.
- `npm run lint` clean.
- Manual spot check (described, not required to run): a long-titled task created
  via the brain or the "+ New Task" modal stores a short LLM summary; the calendar
  chip shows the short label while hovering shows the full title; killing the LLM
  (simulated in the unit test) leaves shortSummary null and the task still creates.
</verification>

<success_criteria>
- shortSummary is a REAL batched LLM summary (never truncation) generated INLINE at
  both creation paths, persisted once, and rendered on the calendar chip (regular +
  multi-day) and command-center rows with full-title fallback.
- LLM failure never blocks/fails task creation (graceful degradation).
- No new llm_jobs worker kind; no cron involvement; per-task cost bounded (batched,
  stored once).
- Full title preserved on hover + detail panel; no restyle, existing tokens only.
- Backfill script written (idempotent, chunked) for the orchestrator to run.
- Migration application + backfill execution are the orchestrator's responsibility,
  clearly flagged in the relevant files.
</success_criteria>

<output>
After completion, create
`.planning/quick/260620-mav-compact-task-labels/260620-mav-SUMMARY.md`.
Report: which Task-5 fetch routes (if any) needed an edit; the `npm run test` +
`npm run lint` results; and a one-line reminder that the ORCHESTRATOR must (1)
apply the migration via Supabase MCP and (2) run
`npx tsx scripts/backfill-task-summaries.ts`.
</output>
