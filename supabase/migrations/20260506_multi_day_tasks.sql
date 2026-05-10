-- Multi-day tasks: a scheduled task can span a range of consecutive days.
-- `scheduled_until_date` is nullable; null = single-day task on scheduled_date.

alter table agent_tasks add column if not exists scheduled_until_date date;

create index if not exists idx_agent_tasks_scheduled_range
  on agent_tasks (assigned_to, scheduled_date, scheduled_until_date)
  where assigned_to is not null and scheduled_date is not null;
