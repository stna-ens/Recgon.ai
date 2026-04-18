-- Persistent job queue for LLM-backed batch work.
--
-- Rationale: When Gemini is overloaded and the Claude fallback is also
-- unavailable (or costs a lot), long-running analyses (codebase, feedback,
-- competitor, idea) cannot retry past the serverless function timeout.
-- Moving them to a queue lets a cron-driven worker retry with unbounded
-- horizon (up to `max_attempts`) so a transient provider outage never
-- surfaces a failure to the user.
--
-- Claim logic (see src/lib/llm/jobQueue.ts):
--   update llm_jobs set status='running', locked_at=now(), ...
--   where id = (select id from llm_jobs
--               where status='pending' and next_retry_at <= now()
--               order by next_retry_at limit 1
--               for update skip locked)
--
-- `FOR UPDATE SKIP LOCKED` ensures multiple concurrent workers can't claim
-- the same row.

create extension if not exists pgcrypto;

create table if not exists llm_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in (
    'feedback_analysis',
    'codebase_analysis',
    'competitor_analysis',
    'idea_analysis'
  )),
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending',
    'running',
    'succeeded',
    'failed',
    'dead'
  )),
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 12, -- ~24h horizon with exponential backoff
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial index for fast worker claim (only scans pending rows).
create index if not exists idx_llm_jobs_claim
  on llm_jobs (next_retry_at)
  where status = 'pending';

-- Listing indexes for UI polling.
create index if not exists idx_llm_jobs_team
  on llm_jobs (team_id, created_at desc);

create index if not exists idx_llm_jobs_user
  on llm_jobs (user_id, created_at desc);

-- Keep updated_at honest.
create or replace function llm_jobs_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_llm_jobs_touch_updated_at on llm_jobs;
create trigger trg_llm_jobs_touch_updated_at
  before update on llm_jobs
  for each row execute function llm_jobs_touch_updated_at();

-- Atomic claim function for workers. Returns the claimed job or null.
-- Must be called via supabase.rpc('claim_next_llm_job', { worker_id }).
create or replace function claim_next_llm_job(worker_id text)
returns setof llm_jobs
language plpgsql
as $$
begin
  return query
  update llm_jobs j
  set status = 'running',
      locked_at = now(),
      locked_by = worker_id,
      attempts = j.attempts + 1,
      updated_at = now()
  where j.id = (
    select id from llm_jobs
    where status = 'pending'
      and next_retry_at <= now()
    order by next_retry_at asc
    limit 1
    for update skip locked
  )
  returning j.*;
end;
$$;
