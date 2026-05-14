-- Phase 3 / Plan 06 — triage_note column on agent_tasks.
--
-- Recgon's dispatcher refuses to assign tasks when every candidate has zero
-- FIT signals (skillOverlap / fitForKind / interestNudge < SIGNAL_FLOOR=0.15),
-- when qualified candidates exist but none has capacity within the 4-week
-- lookahead (no_capacity_in_window), when high-priority tasks find no current
-- capacity (no_capacity_high_priority), or when the Plan 03-05 grounded
-- Why-you sentence cannot be produced (no_grounded_reason). In each case
-- the task stays `status='unassigned'` and `triage_note` records WHY so the
-- owner can see the pattern in the TASKS-page triage view (Plan 03-07).
--
-- Deferred tasks (qualified candidates exist but booked NOW, scheduledDate
-- moved forward) are the FOURTH outcome and keep `triage_note IS NULL` —
-- the deferral reason rides on `schedule_note` instead, since the task is
-- expected to be retried on the new scheduledDate.
--
-- Additive + nullable + default null → all existing rows + flows unaffected.
-- No backfill needed: pre-3.1 rows simply read as triageNote=null.

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS triage_note text;

-- Partial index for the upcoming TASKS-page triage view (Plan 03-07).
-- Only the owner-relevant slice (`unassigned` + triage_note set) is
-- indexed — keeps the index tiny and avoids polluting the planner for
-- normal assignment-write paths.
CREATE INDEX IF NOT EXISTS agent_tasks_triage_unassigned_idx
  ON agent_tasks(team_id)
  WHERE status = 'unassigned' AND triage_note IS NOT NULL;

COMMENT ON COLUMN agent_tasks.triage_note IS
  'Phase 3 / Plan 06 — explanation for why a task stays unassigned. One of: no_clear_fit (no FIT signal above SIGNAL_FLOOR among any candidate), no_grounded_reason (LLM could not ground a Why-you sentence even though math qualified), no_capacity_in_window (qualified candidates exist but none has capacity in DEFER_LOOKAHEAD_WEEKS=4), no_capacity_high_priority (priority>=3 task with qualified-but-booked-NOW candidates — bypasses deferral). Null for assigned tasks, deferred tasks (use schedule_note instead), or pre-3.1 rows.';
