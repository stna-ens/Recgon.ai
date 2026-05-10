-- Remove AI-teammate side entirely.
-- App code stopped reading `kind`, but the seeded AI rows (Strategy Lead,
-- Feedback Analyst, Marketing Lead, Analytics Watcher, Dev Coach) still
-- show up on the calendar and roster. Wipe them, drop the column.

-- 1. Reset status of any open task currently sitting on an AI teammate so
--    it goes back into the unassigned pool. The FK on assigned_to is
--    SET NULL — that handles the column itself, but status would be left
--    in a broken half-state without this update.
UPDATE agent_tasks
SET status = 'unassigned',
    assigned_at = NULL,
    assigned_by = 'recgon'
WHERE assigned_to IN (SELECT id FROM teammates WHERE kind = 'ai')
  AND status IN ('assigned', 'accepted', 'in_progress', 'awaiting_review');

-- 2. Delete the AI teammates. CASCADE clears agent_task_ratings,
--    teammate_event_log, teammate_calendar_blocks; agent_tasks.assigned_to
--    nulls out via SET NULL.
DELETE FROM teammates WHERE kind = 'ai';

-- 3. Drop the kind column + its enum so nothing can ever recreate one.
ALTER TABLE teammates DROP COLUMN IF EXISTS kind;
ALTER TABLE teammates DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE teammates DROP COLUMN IF EXISTS model_pref;
DROP TYPE IF EXISTS teammate_kind;

-- 4. Drop the orphaned roster_proposal column on recgon_state — proposer
--    code is gone, the JSON sitting in this column is dead weight.
ALTER TABLE recgon_state DROP COLUMN IF EXISTS roster_proposal;
