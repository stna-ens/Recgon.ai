-- Replace hour-precision scheduling with day-precision.
--
-- Recgon is a dispatcher, not a meeting tool. Tasks have a target day and
-- estimated hours; "this happens at 2pm Tuesday" is over-engineering and
-- creates a timezone bug for cross-TZ teammates. Hour-of-day fields and the
-- separate calendar-blocks table are removed; working_hours is reduced to a
-- list of working weekdays (daily capacity is derived from capacity_hours).

-- agent_tasks: schedule columns
alter table agent_tasks add column if not exists scheduled_date date;
alter table agent_tasks add column if not exists reschedule_requested_date date;

update agent_tasks
  set scheduled_date = (scheduled_start at time zone 'UTC')::date
  where scheduled_date is null and scheduled_start is not null;

-- Reschedule columns may not exist on every environment (the prior
-- reschedule-requests migration was skipped on some DBs). Guard the backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_tasks' AND column_name = 'reschedule_requested_start'
  ) THEN
    EXECUTE $upd$
      update agent_tasks
        set reschedule_requested_date = (reschedule_requested_start at time zone 'UTC')::date
        where reschedule_requested_date is null and reschedule_requested_start is not null
    $upd$;
  END IF;
END $$;

drop index if exists idx_agent_tasks_schedule;

alter table agent_tasks drop column if exists scheduled_start;
alter table agent_tasks drop column if exists scheduled_end;
alter table agent_tasks drop column if exists reschedule_requested_start;
alter table agent_tasks drop column if exists reschedule_requested_end;

create index if not exists idx_agent_tasks_scheduled_date
  on agent_tasks (assigned_to, scheduled_date)
  where assigned_to is not null and scheduled_date is not null;

-- teammate_calendar_blocks: removed entirely
drop index if exists idx_teammate_calendar_blocks_lookup;
drop index if exists idx_teammate_calendar_blocks_task;
drop table if exists teammate_calendar_blocks cascade;
drop function if exists teammate_calendar_blocks_touch_updated_at();

-- teammates.working_hours: shape change
-- old: { tz: string, mon: [start, end], tue: [start, end], ... }
-- new: { days: ['mon', 'tue', ...] }
update teammates
  set working_hours = jsonb_build_object(
    'days',
    (
      select coalesce(jsonb_agg(d), '[]'::jsonb)
      from unnest(array['mon','tue','wed','thu','fri','sat','sun']) as d
      where working_hours ? d
    )
  )
  where working_hours is not null
    and not (working_hours ? 'days');
