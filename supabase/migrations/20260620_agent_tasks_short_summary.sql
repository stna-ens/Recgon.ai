-- quick-260620-mav — Compact task labels (short_summary).
-- Additive only. No data migration; existing rows get NULL on the new field.
--
-- ORCHESTRATOR APPLIES THIS — the executor only writes the file. Do NOT run
-- this migration as part of code execution. The orchestrator applies it to the
-- live database via the Supabase MCP after the plan completes, then runs the
-- one-time backfill (`npx tsx scripts/backfill-task-summaries.ts`).
--
-- Fail-soft contract: every reader/writer of this column tolerates its absence.
-- `mapTask` maps a missing column to `null`; `setTaskShortSummary` swallows the
-- write error (logger.warn) so a pre-migration environment never crashes task
-- creation — it simply leaves `short_summary` NULL.

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS short_summary TEXT NULL;

COMMENT ON COLUMN agent_tasks.short_summary IS
  'quick-260620-mav — LLM-written ~3-6 word compact-UI label for the calendar chip + command-center decision rows. NULL when not yet generated, when the LLM failed, or on pre-migration rows. The canonical `title` is unchanged and remains the source for the chip hover attribute + the task detail panel.';
