-- Phase 4 Plan 01 — Personalized task framing columns.
-- Additive only. No data migration; existing rows get NULL on both fields.
-- The worker (`runTaskReframe` in src/lib/llm/workers.ts) fails-soft when
-- these columns are absent, so test/staging environments without this
-- migration applied do not crash cron — they emit
-- `{ skipped: true, reason: 'columns_missing' }` and the job completes as
-- a no-op success (no infinite retry storm).

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS personalized_description TEXT NULL,
  ADD COLUMN IF NOT EXISTS personalized_description_for_user_id TEXT NULL;

-- Partial index supports the reassignment-invalidation lookup pattern
-- Plan 04-03 uses: "find tasks where personalized_description IS NOT NULL
-- AND personalized_description_for_user_id != assigned_to.userId".
-- Conservative — only indexes rows that already have a personalized
-- description, keeping write amplification minimal on pre-Phase-4 rows.
CREATE INDEX IF NOT EXISTS agent_tasks_personalized_for_user_id_idx
  ON agent_tasks (personalized_description_for_user_id)
  WHERE personalized_description IS NOT NULL;

COMMENT ON COLUMN agent_tasks.personalized_description IS
  'Phase 4 — LLM-generated assignee-specific description. Written by task_reframe worker. NULL when not yet generated, when LLM failed all retries, or when the row is unassigned.';
COMMENT ON COLUMN agent_tasks.personalized_description_for_user_id IS
  'Phase 4 — userId the personalized_description was generated for. Invalidated to NULL on reassignment (Plan 04-03).';
