-- Phase 3 Plan 02 (JUDGE-10). Per-team daily safety cap for the LLM judgment
-- overlay. Additive table — no existing rows touched, no breaking changes.
--
-- Decisions:
--   D-30 (CONTEXT.md): cap is a SAFETY rail (runaway-detection), not a
--   quality knob. Owners don't see it. Cap value lives in code
--   (DAILY_JUDGMENT_CALL_CAP=50 in src/lib/recgon/judgmentBudget.ts).
--   T-03-02-01: cap is the SINGLE budget-enforcement surface — silent
--   math-fallback when exhausted (no banner, no owner email).
--   T-03-02-02: cap_alert_sent flag enforces AT-MOST-ONE dev-ops email
--   per (team_id, usage_date). Check-then-set pattern in
--   alertCapExceededOnce() — idempotent on repeat cap hits.
--
-- Foreign keys (verified against 20260426_recgon_admin.sql):
--   - teams.id is text — match here.

create table if not exists team_llm_usage (
  team_id          text not null references teams(id) on delete cascade,
  usage_date       date not null,
  judgment_calls   integer not null default 0,
  cap_alert_sent   boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (team_id, usage_date)
);

-- Service-role-only read path: checkAndIncrement(teamId) and
-- alertCapExceededOnce(teamId, usageDate) both filter by (team_id, usage_date).
-- The PRIMARY KEY already gives us this index, but an explicit name makes
-- intent obvious to future readers.
create index if not exists team_llm_usage_team_date_idx
  on team_llm_usage (team_id, usage_date);

-- updated_at trigger so callers don't have to set it manually.
create or replace function team_llm_usage_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_llm_usage_touch_updated_at
  on team_llm_usage;
create trigger trg_team_llm_usage_touch_updated_at
  before update on team_llm_usage
  for each row execute function team_llm_usage_touch_updated_at();
