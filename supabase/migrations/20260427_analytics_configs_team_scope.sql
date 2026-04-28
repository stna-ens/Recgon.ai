-- Team + personal scoping for analytics_configs.
-- Existing rows keep user_id and get team_id = NULL, becoming personal configs.

alter table analytics_configs
  add column if not exists id text not null default gen_random_uuid()::text;

alter table analytics_configs
  add column if not exists team_id text references teams(id) on delete cascade;

alter table analytics_configs drop constraint if exists analytics_configs_pkey;
alter table analytics_configs add primary key (id);

create unique index if not exists analytics_configs_personal_unique
  on analytics_configs (user_id) where team_id is null;

create unique index if not exists analytics_configs_team_unique
  on analytics_configs (team_id) where team_id is not null;

create index if not exists analytics_configs_team_idx
  on analytics_configs (team_id);
