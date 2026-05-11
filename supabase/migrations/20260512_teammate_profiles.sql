-- Teammate self-declared profiles. Additive layer over the existing teammates
-- row; field-level fallback handled by profileMerge. Phase 1: PROFILE-03, D-04.
--
-- Type note: per 20260426_recgon_admin.sql, teams.id and users.id are `text`
-- (not uuid). New tables here use uuid PKs but reference these as text.
-- Service-role-only access; no RLS — CLAUDE.md key rule.

create extension if not exists pgcrypto;

create table if not exists teammate_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  skills_raw text[] not null default '{}'::text[],
  strengths_raw text[] not null default '{}'::text[],
  interests_raw text[] not null default '{}'::text[],
  skills_canonical text[] not null default '{}'::text[],
  strengths_canonical text[] not null default '{}'::text[],
  interests_canonical text[] not null default '{}'::text[],
  weekly_capacity_hours numeric,
  -- Pitfall 7: set true when LLM degraded and canonical arrays are empty;
  -- a follow-up worker can backfill normalization without losing raw text.
  normalization_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- D-04: one self-declared profile row per teammate per team.
create unique index if not exists uq_teammate_profiles_team_user
  on teammate_profiles (team_id, user_id);

create index if not exists idx_teammate_profiles_team
  on teammate_profiles (team_id);

create or replace function teammate_profiles_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_teammate_profiles_touch_updated_at on teammate_profiles;
create trigger trg_teammate_profiles_touch_updated_at
  before update on teammate_profiles
  for each row execute function teammate_profiles_touch_updated_at();

-- D-17/D-18: team-level visibility toggle, default collaborative.
alter table teams
  add column if not exists profile_visibility text not null default 'team_visible'
  check (profile_visibility in ('team_visible','owner_only'));
