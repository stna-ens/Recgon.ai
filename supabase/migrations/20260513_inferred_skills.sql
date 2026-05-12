-- Phase 2 (SKILL-01, SKILL-03, D-21..D-24). Additive table for GitHub-inferred
-- skills + consent + scan timestamps on teammate_profiles + per-team inference
-- depth on teams. Service-role-only; no RLS — CLAUDE.md key rule.
--
-- Foreign keys (verified against 20260426_recgon_admin.sql):
--   - teams.id and users.id are text
--   - teammates.id is uuid (the canonical teammate table; NOT agent_teammates).
--     teammate_inferred_skills.teammate_id references teammates(id).
--
-- Decisions:
--   D-21: schema enables inline-on-/teams/[id]/me consent via
--         teammate_profiles.github_mining_consent_at column.
--   D-22: schema separates consent state (github_mining_consent_at on
--         teammate_profiles) from skill state (teammate_inferred_skills rows
--         persist after revoke); unique (teammate_id, canonical_tag) index
--         preserves rejected rows across future scans.
--   D-23: teams.inference_depth (cheap | standard | deep) with default
--         'standard' enables per-team depth configuration.
--   D-24: status column on teammate_inferred_skills records permanent rejection
--         per (teammate_id, canonical_tag); unique index prevents accidental
--         resurfacing on the next scan (worker filters via listRejectedTags).

create extension if not exists pgcrypto;

-- ── teammate_inferred_skills ──────────────────────────────────────────────────

create table if not exists teammate_inferred_skills (
  id                uuid primary key default gen_random_uuid(),
  teammate_id       uuid not null references teammates(id) on delete cascade,
  team_id           text not null references teams(id) on delete cascade,
  canonical_tag     text not null,
  score             numeric(5,4) not null check (score >= 0 and score <= 1),
  source            text not null check (source in ('linguist','extension','llm_commit','llm_import')),
  last_seen_at      timestamptz not null default now(),
  confirmed_at      timestamptz null,
  rejected_at       timestamptz null,
  user_reviewed_at  timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- D-22 / T-02-01: unique (teammate_id, canonical_tag) prevents duplicate-tag
-- race AND preserves once-rejected rows across future scans (the worker's
-- upsertInferredSkill UPDATE list preserves rejected_at on conflict).
create unique index if not exists uq_tis_teammate_tag
  on teammate_inferred_skills (teammate_id, canonical_tag);

-- T-02-03 dispatcher read path: fetch active inferred skills per teammate.
create index if not exists idx_tis_teammate_active
  on teammate_inferred_skills (teammate_id) where rejected_at is null;

-- T-02-03 worker read path: listRejectedTags() filters next-scan emissions
-- so a once-rejected (teammate_id, canonical_tag) pair never re-suggests.
create index if not exists idx_tis_teammate_rejected
  on teammate_inferred_skills (teammate_id, canonical_tag) where rejected_at is not null;

create or replace function teammate_inferred_skills_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_teammate_inferred_skills_touch_updated_at
  on teammate_inferred_skills;
create trigger trg_teammate_inferred_skills_touch_updated_at
  before update on teammate_inferred_skills
  for each row execute function teammate_inferred_skills_touch_updated_at();

-- ── teammate_profiles: consent + last scan timestamps ─────────────────────────
-- D-21 (consent timestamp) + T-02-04 (gate). Worker early-returns when
-- github_mining_consent_at is null. last_scan_at is updated by every scan
-- (including empty-result scans) — banner suppression is driven by the
-- per-row user_reviewed_at field, NOT by last_scan_at (RESEARCH Pitfall 7).

alter table teammate_profiles
  add column if not exists github_mining_consent_at timestamptz null,
  add column if not exists last_scan_at             timestamptz null;

-- ── teams: per-team inference depth ───────────────────────────────────────────
-- D-23. cheap | standard | deep — default 'standard'. The worker switches
-- behavior by depth (Standard = 1 LLM call per teammate; Deep = N calls).

alter table teams
  add column if not exists inference_depth text not null default 'standard'
  check (inference_depth in ('cheap','standard','deep'));
