create table if not exists analytics_insights (
  id text primary key default gen_random_uuid()::text,
  project_id text references projects(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  property_id text not null,
  days integer not null default 30,
  date_range text,
  overview jsonb not null default '{}'::jsonb,
  insights jsonb not null default '{}'::jsonb,
  raw_data jsonb,
  source text not null default 'gui' check (source in ('gui', 'terminal', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists analytics_insights_team_created_idx
  on analytics_insights(team_id, created_at desc);

create index if not exists analytics_insights_project_created_idx
  on analytics_insights(project_id, created_at desc);

alter table analytics_insights enable row level security;
alter table analytics_insights force row level security;
