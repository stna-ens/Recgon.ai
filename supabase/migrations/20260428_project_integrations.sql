-- Project integrations: per-project credentials for external platforms.
--
-- First user: Instagram Graph API for the verification source. Designed to
-- accept any future platform (TikTok, Twitter/X, LinkedIn, YouTube) by
-- writing a row with provider='<name>'.
--
-- Tokens are sensitive. Service-role-only access; never expose this table
-- through client-side queries.

create table if not exists project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  provider text not null,
  -- Provider-specific account identifier:
  --   instagram: IG Business Account ID (e.g. '17841401234567890')
  --   future:    whatever the platform calls its "account"
  account_id text,
  account_handle text,                     -- '@coolbrand' for display
  access_token text,                       -- long-lived where possible
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_by text,                       -- user id who connected
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One integration per project per provider. Reconnecting overwrites.
create unique index if not exists uq_project_integrations
  on project_integrations (project_id, provider);

create index if not exists idx_project_integrations_team
  on project_integrations (team_id, provider);

create or replace function project_integrations_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_project_integrations_touch_updated_at on project_integrations;
create trigger trg_project_integrations_touch_updated_at
  before update on project_integrations
  for each row execute function project_integrations_touch_updated_at();
