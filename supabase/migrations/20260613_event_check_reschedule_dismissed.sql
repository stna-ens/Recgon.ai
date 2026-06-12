-- Mission Control (Phase A) — owner can now DENY a pending reschedule
-- request from the /command decision stack. The audit trail needs a
-- dedicated event type; 'rescheduled' would lie (nothing moved).
--
-- Also adds 'edited' ahead of the task-edit endpoint (Phase C) so both
-- event-type extensions ship in one constraint rebuild.
--
-- Additive only: rebuilds the CHECK with the existing list + two values.

ALTER TABLE teammate_event_log
  DROP CONSTRAINT IF EXISTS teammate_event_log_event_check;

ALTER TABLE teammate_event_log
  ADD CONSTRAINT teammate_event_log_event_check
  CHECK (event IN (
    'assigned', 'accepted', 'declined', 'completed',
    'rated', 'reassigned', 'reschedule_requested', 'rescheduled',
    'overloaded', 'no_fit',
    'triaged', 'deferred', 'manually_assigned',
    'nudged', 'escalated', 'auto_rescheduled', 'snoozed',
    -- Mission Control / task-edit additions.
    'reschedule_dismissed', 'edited'
  ));
