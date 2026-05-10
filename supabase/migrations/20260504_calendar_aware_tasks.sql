-- Calendar-aware Recgon assignment.
--
-- `deadline` is no longer just user input. Recgon can now reserve concrete
-- calendar time for a task, then derive the practical deadline from the final
-- reserved block. The separate block table lets one task occupy several
-- timetable windows without pretending the whole multi-day span is busy.

alter table agent_tasks
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists schedule_note text;

create index if not exists idx_agent_tasks_schedule
  on agent_tasks (assigned_to, scheduled_start, scheduled_end)
  where assigned_to is not null and scheduled_start is not null;

create table if not exists teammate_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(id) on delete cascade,
  teammate_id uuid not null references teammates(id) on delete cascade,
  task_id uuid references agent_tasks(id) on delete cascade,
  kind text not null default 'task' check (kind in ('task', 'busy', 'manual', 'external')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_teammate_calendar_blocks_lookup
  on teammate_calendar_blocks (team_id, teammate_id, starts_at, ends_at);

create index if not exists idx_teammate_calendar_blocks_task
  on teammate_calendar_blocks (task_id)
  where task_id is not null;

create or replace function teammate_calendar_blocks_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_teammate_calendar_blocks_touch_updated_at on teammate_calendar_blocks;
create trigger trg_teammate_calendar_blocks_touch_updated_at
  before update on teammate_calendar_blocks
  for each row execute function teammate_calendar_blocks_touch_updated_at();
