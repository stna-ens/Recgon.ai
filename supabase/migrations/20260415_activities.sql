-- Shared activity log: every tool run from GUI or terminal is recorded here,
-- so both surfaces can see what the other surface just did.

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  project_id uuid,
  user_id uuid not null,
  source text not null check (source in ('gui', 'terminal', 'system')),
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  result_summary text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists activities_team_created_idx
  on activities (team_id, created_at desc);

create index if not exists activities_project_created_idx
  on activities (project_id, created_at desc);
