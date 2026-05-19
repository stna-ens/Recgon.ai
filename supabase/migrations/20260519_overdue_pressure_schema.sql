-- Phase 3.6 / Plan 01 — Overdue task pressure schema.
--
-- Recgon today does NOTHING when a task's scheduled_date passes and it isn't
-- in a terminal status: no chip, no email, no auto-reschedule. This migration
-- adds the bookkeeping fields the daily overdue-sweep cron (Plan 03) needs
-- to apply graduated pressure (nudge → escalate → auto_reschedule) without
-- duplicate-firing the same tier twice in a 24h window.
--
-- Design notes:
--   * Overdue is DERIVED, not stored. `overdue_tier` records the LAST tier
--     we acted on (0=none, 1=nudged, 2=escalated, 3=auto_rescheduled) so we
--     can enforce per-tier cool-down — it does NOT replace the status enum.
--   * `last_overdue_action_at` is the cool-down timestamp; nullable until
--     the first action lands.
--   * `teams.overdue_pressure_enabled` is the per-team kill-switch; default
--     true so existing teams pick up the behavior, but they can opt out.
--   * Four new event types extend `teammate_event_log` for owner-board audit
--     trails — `nudged`, `escalated`, `auto_rescheduled`, `snoozed`.
--   * Partial index covers the sweep's hot path: scan active-status tasks
--     by team_id + scheduled_date and skip completed/cancelled rows.
--
-- All additions are additive + nullable-or-defaulted → no backfill required.

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS overdue_tier int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_overdue_action_at timestamptz;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS overdue_pressure_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE teammate_event_log
  DROP CONSTRAINT IF EXISTS teammate_event_log_event_check;

ALTER TABLE teammate_event_log
  ADD CONSTRAINT teammate_event_log_event_check
  CHECK (event IN (
    'assigned', 'accepted', 'declined', 'completed',
    'rated', 'reassigned', 'reschedule_requested', 'rescheduled',
    'overloaded', 'no_fit',
    -- Phase 3 / Plan 06–07 — refusal/override audit events.
    'triaged', 'deferred', 'manually_assigned',
    -- Phase 3.6 / Plan 01 — graduated overdue pressure.
    'nudged', 'escalated', 'auto_rescheduled', 'snoozed'
  ));

-- Hot path for `sweepOverdueTeams()` (Plan 02/03): given a team_id, find all
-- tasks whose scheduled_date is in the past AND whose status is still in the
-- active set. The partial WHERE keeps the index small (terminal rows are
-- excluded) and the planner doesn't have to scan completed/declined work.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_overdue_sweep
  ON agent_tasks (team_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL
    AND status IN ('assigned', 'accepted', 'in_progress', 'awaiting_review');

COMMENT ON COLUMN agent_tasks.overdue_tier IS
  'Phase 3.6 / Plan 01 — last overdue-pressure tier acted on. 0 = none, 1 = nudged (teammate email), 2 = escalated (owner email), 3 = auto_rescheduled. Enforces per-tier cool-down via last_overdue_action_at.';

COMMENT ON COLUMN agent_tasks.last_overdue_action_at IS
  'Phase 3.6 / Plan 01 — timestamp of the most recent overdue-pressure action. 24h cool-down per tier — sweep cron skips tasks whose last action was within the window.';

COMMENT ON COLUMN teams.overdue_pressure_enabled IS
  'Phase 3.6 / Plan 01 — per-team kill switch for overdue-pressure cron. Default true so teams pick up the behavior automatically; owners can opt out per team.';
