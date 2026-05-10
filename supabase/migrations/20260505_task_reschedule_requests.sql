-- Let teammates ask for a better slot while owners keep direct calendar control.

alter table agent_tasks
  add column if not exists reschedule_request_status text not null default 'none',
  add column if not exists reschedule_requested_at timestamptz,
  add column if not exists reschedule_requested_by text,
  add column if not exists reschedule_request_note text,
  add column if not exists reschedule_requested_start timestamptz,
  add column if not exists reschedule_requested_end timestamptz;

alter table agent_tasks
  drop constraint if exists agent_tasks_reschedule_request_status_check;

alter table agent_tasks
  add constraint agent_tasks_reschedule_request_status_check
  check (reschedule_request_status in ('none', 'pending', 'resolved', 'dismissed'));

create index if not exists idx_agent_tasks_reschedule_pending
  on agent_tasks (team_id, reschedule_requested_at desc)
  where reschedule_request_status = 'pending';

alter table teammate_event_log
  drop constraint if exists teammate_event_log_event_check;

alter table teammate_event_log
  add constraint teammate_event_log_event_check
  check (event in (
    'assigned', 'accepted', 'declined', 'completed',
    'rated', 'reassigned', 'reschedule_requested', 'rescheduled',
    'overloaded', 'no_fit'
  ));
