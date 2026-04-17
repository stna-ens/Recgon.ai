-- Project privacy toggle.
--
-- When is_shared is true (default, preserves current team-wide visibility),
-- the project is visible to every member of the owning team.
-- When false, only the creator can see it — other team members still cannot
-- access it even though they share the team scope.
--
-- Existing rows default to shared so we don't silently hide pre-existing
-- projects from teammates.

alter table projects
  add column if not exists is_shared boolean not null default true;

create index if not exists idx_projects_team_shared
  on projects (team_id, is_shared);
