-- Phase 3.5 / Plan 03.5-03 — owner_dock_dismissals: per-user dismissal of
-- deferred tasks from the Triage Dock.
--
-- Behavior (D-17):
--   - Triaged rows (triage_note IS NOT NULL) CANNOT be dismissed — they
--     represent dispatcher refusals that need an owner decision. The endpoint
--     guards this with a 400.
--   - Deferred rows (status='unassigned', triage_note IS NULL, scheduled_date
--     > today) CAN be dismissed. Dismissal is per-user: another owner of the
--     same team still sees the row until they dismiss it themselves.
--   - The chip stays in the calendar; dismissal only removes the dock row
--     for that user.
--
-- Cascade semantics:
--   - users.id is TEXT → user_id TEXT.
--   - agent_tasks.id is UUID → task_id UUID.
--   - Both FKs cascade on delete so dismissals clean up when users or tasks
--     are removed; no orphaned rows.
--
-- PK on (user_id, task_id) gives idempotent inserts via ON CONFLICT DO NOTHING
-- (or .upsert with ignoreDuplicates) — clicking dismiss twice is a no-op.
--
-- Index on user_id lets `listDismissedTaskIds(userId, teamId)` filter quickly
-- per-viewer; the join to agent_tasks for team scoping uses task_id (PK side).

CREATE TABLE IF NOT EXISTS owner_dock_dismissals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS owner_dock_dismissals_user_idx
  ON owner_dock_dismissals(user_id);

COMMENT ON TABLE owner_dock_dismissals IS
  'Phase 3.5 / Plan 03.5-03 — per-user dismissals of deferred tasks from the owner Triage Dock. Triaged tasks (triage_note IS NOT NULL) are never dismissable per D-17; the dismiss endpoint guards with a 400. Cascade deletes keep the table tidy.';
