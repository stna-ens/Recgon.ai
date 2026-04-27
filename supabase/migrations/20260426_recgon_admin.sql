-- Recgon Admin overhaul.
--
-- Reframes the team around Recgon as the dispatcher (manager) sitting above
-- a unified roster of human + AI teammates. Recgon reads a "unified brain" of
-- open work, mints tasks, and assigns each one to the best-fit teammate.
--
-- New tables:
--   teammates             -- humans + AI as one entity (work-assignment dim)
--   agent_tasks           -- first-class persisted tasks
--   agent_task_ratings    -- thumbs up/down feedback (idempotent per task)
--   recgon_state          -- per-team dispatcher memory
--   teammate_event_log    -- append-only audit trail
--
-- Also extends llm_jobs.kind enum with 'teammate_task' for AI execution.
--
-- Type note: in this database `teams.id`, `users.id`, and `projects.id` are
-- `text` (not `uuid`); only `llm_jobs.id` is `uuid`. New tables here use
-- `uuid` PKs but reference the external tables with `text` columns.

create extension if not exists pgcrypto;

-- ── teammates ───────────────────────────────────────────────────────────────

create table if not exists teammates (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(id) on delete cascade,
  kind text not null check (kind in ('human', 'ai')),
  user_id text references users(id) on delete cascade, -- only when kind='human'
  display_name text not null,
  avatar_color text,
  avatar_url text,
  title text,
  skills text[] not null default '{}',
  system_prompt text,
  model_pref text check (model_pref in ('gemini', 'claude') or model_pref is null),
  capacity_hours numeric not null default 168,
  working_hours jsonb,
  fit_profile jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_teammates_team_user
  on teammates (team_id, user_id)
  where user_id is not null;

create index if not exists idx_teammates_team
  on teammates (team_id, status);

create index if not exists idx_teammates_user
  on teammates (user_id)
  where user_id is not null;

create or replace function teammates_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_teammates_touch_updated_at on teammates;
create trigger trg_teammates_touch_updated_at
  before update on teammates
  for each row execute function teammates_touch_updated_at();

-- Backfill existing human team_members into teammates. Default human capacity
-- is 10h/week (a fraction of typical work hours; users edit if they want more).
insert into teammates (team_id, kind, user_id, display_name, avatar_color, avatar_url, title, capacity_hours, status)
select
  tm.team_id,
  'human' as kind,
  tm.user_id,
  coalesce(u.nickname, split_part(u.email, '@', 1), 'Teammate') as display_name,
  null as avatar_color,
  u.avatar_url,
  case tm.role
    when 'owner' then 'Founder'
    when 'member' then 'Teammate'
    when 'viewer' then 'Observer'
    else 'Teammate'
  end as title,
  10 as capacity_hours,
  'active' as status
from team_members tm
left join users u on u.id = tm.user_id
on conflict (team_id, user_id) where user_id is not null do nothing;

-- ── agent_tasks ─────────────────────────────────────────────────────────────

create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  kind text not null check (kind in (
    'next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'
  )),
  source text not null check (source in ('brain', 'user', 'teammate', 'schedule')),
  source_ref jsonb not null default '{}'::jsonb,
  required_skills text[] not null default '{}',
  priority int not null default 2,
  estimated_hours numeric not null default 1,
  deadline timestamptz,
  assigned_to uuid references teammates(id) on delete set null,
  assigned_by text, -- 'recgon' or user id (text)
  assigned_at timestamptz,
  status text not null default 'unassigned' check (status in (
    'unassigned', 'assigned', 'accepted', 'in_progress',
    'awaiting_review', 'completed', 'declined', 'failed', 'cancelled'
  )),
  job_id uuid references llm_jobs(id) on delete set null,
  result jsonb,
  created_by text, -- user id, or null when source='brain'/'schedule'
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_agent_tasks_team_status
  on agent_tasks (team_id, status, created_at desc);

create index if not exists idx_agent_tasks_assigned
  on agent_tasks (assigned_to, status)
  where assigned_to is not null;

create index if not exists idx_agent_tasks_project
  on agent_tasks (project_id)
  where project_id is not null;

-- Idempotency for scheduled / brain sources: a unique key per source_ref hash
-- prevents minting the same brain entry twice. We use a partial unique index
-- on the digest of source_ref for sources that need dedup.
create unique index if not exists uq_agent_tasks_source_ref
  on agent_tasks (team_id, kind, (source_ref->>'dedupKey'))
  where source_ref ? 'dedupKey';

-- ── agent_task_ratings ──────────────────────────────────────────────────────

create table if not exists agent_task_ratings (
  task_id uuid primary key references agent_tasks(id) on delete cascade,
  teammate_id uuid not null references teammates(id) on delete cascade,
  rating int not null check (rating in (-1, 1)),
  note text,
  rated_by text not null,
  rated_at timestamptz not null default now()
);

create index if not exists idx_ratings_teammate
  on agent_task_ratings (teammate_id, rated_at desc);

-- ── recgon_state ────────────────────────────────────────────────────────────

create table if not exists recgon_state (
  team_id text primary key references teams(id) on delete cascade,
  brain_snapshot jsonb not null default '{}'::jsonb,
  last_dispatch_at timestamptz,
  assignment_log jsonb not null default '[]'::jsonb,
  roster_proposal jsonb,
  updated_at timestamptz not null default now()
);

-- Seed recgon_state for existing teams.
insert into recgon_state (team_id)
select id from teams
on conflict (team_id) do nothing;

-- ── teammate_event_log ──────────────────────────────────────────────────────

create table if not exists teammate_event_log (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(id) on delete cascade,
  teammate_id uuid references teammates(id) on delete cascade,
  task_id uuid references agent_tasks(id) on delete cascade,
  event text not null check (event in (
    'assigned', 'accepted', 'declined', 'completed',
    'rated', 'reassigned', 'overloaded', 'no_fit'
  )),
  payload jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index if not exists idx_event_log_team_ts
  on teammate_event_log (team_id, ts desc);

create index if not exists idx_event_log_teammate
  on teammate_event_log (teammate_id, ts desc)
  where teammate_id is not null;

-- ── Extend llm_jobs.kind enum ───────────────────────────────────────────────

alter table llm_jobs drop constraint if exists llm_jobs_kind_check;
alter table llm_jobs add constraint llm_jobs_kind_check check (kind in (
  'feedback_analysis',
  'codebase_analysis',
  'competitor_analysis',
  'idea_analysis',
  'teammate_task'
));

-- ── Rolled-up rating view ───────────────────────────────────────────────────

create or replace view teammate_stats as
select
  t.id as teammate_id,
  t.team_id,
  count(r.task_id) as rating_count,
  coalesce(sum(case when r.rating > 0 then 1 else 0 end), 0) as up_count,
  coalesce(sum(case when r.rating < 0 then 1 else 0 end), 0) as down_count,
  coalesce(avg(r.rating), 0)::numeric as avg_rating,
  -- Map [-1, 1] avg → [0, 5] stars. Default to 3.5 (slightly positive) when
  -- no ratings yet, to give new teammates a fair shot.
  case
    when count(r.task_id) = 0 then 3.5
    else round(((coalesce(avg(r.rating), 0) + 1) * 2.5)::numeric, 2)
  end as stars,
  (
    select count(*) from agent_tasks at
    where at.assigned_to = t.id
      and at.status in ('assigned', 'accepted', 'in_progress')
  ) as in_flight_count
from teammates t
left join agent_task_ratings r on r.teammate_id = t.id
group by t.id, t.team_id;
