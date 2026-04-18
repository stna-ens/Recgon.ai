-- Shared circuit-breaker state for LLM providers.
--
-- Problem: when Gemini is regionally degraded, every Vercel instance
-- independently discovers the outage on its next request, burning
-- budget + latency on doomed calls before falling back to Claude.
--
-- Solution: coordinate breaker state across instances in Supabase.
-- First instance to hit N failures within a rolling window flips
-- state='open', and every other instance immediately short-circuits
-- to the next provider until the cooldown expires. During cooldown
-- expiry exactly ONE instance is allowed to probe (half_open) — the
-- rest keep skipping — to avoid a thundering herd slamming a still-
-- degraded provider.
--
-- Fail-open design: if Supabase itself is unreachable, TypeScript
-- callers default `shouldTry()` to true so LLM traffic keeps flowing.
-- A broken breaker must never block working providers.

create table if not exists llm_health (
  provider text primary key,
  state text not null default 'closed' check (state in ('closed', 'half_open', 'open')),
  failure_count int not null default 0,
  window_start timestamptz,
  opened_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Atomic "should we try this provider?" check.
-- Returns true on closed, false on open/half_open (except for the one
-- instance that wins the race to probe after cooldown expiry).
--
-- The FOR UPDATE inside the function serializes concurrent checkers on
-- the same provider row, so exactly one caller sees state='open' with
-- expired cooldown and performs the half_open transition.
create or replace function llm_health_try(p_provider text)
returns boolean
language plpgsql
as $$
declare
  row llm_health;
begin
  insert into llm_health (provider) values (p_provider)
  on conflict (provider) do nothing;

  select * into row from llm_health where provider = p_provider for update;

  if row.state = 'closed' then
    return true;
  elsif row.state = 'open' and row.opened_until > now() then
    return false;
  elsif row.state = 'open' and row.opened_until <= now() then
    -- Cooldown expired — the caller that got the row lock becomes the
    -- probe; everyone else will now see state='half_open' and skip.
    update llm_health
    set state = 'half_open', updated_at = now()
    where provider = p_provider;
    return true;
  elsif row.state = 'half_open' then
    return false;
  end if;
  return true;
end;
$$;

-- Clear breaker state after a successful call.
-- Idempotent — safe to call even when already closed.
create or replace function llm_health_record_success(p_provider text)
returns void
language plpgsql
as $$
begin
  update llm_health
  set state = 'closed',
      failure_count = 0,
      window_start = null,
      opened_until = null,
      updated_at = now()
  where provider = p_provider
    and (state != 'closed' or failure_count > 0);
end;
$$;

-- Record a recoverable failure (overload / rate-limit). Opens the breaker
-- if we cross the threshold within the rolling window, or if we were
-- currently probing (half_open) — a failed probe re-opens immediately.
create or replace function llm_health_record_failure(
  p_provider text,
  p_threshold int default 5,
  p_window_seconds int default 30,
  p_cooldown_seconds int default 60
)
returns void
language plpgsql
as $$
declare
  row llm_health;
begin
  insert into llm_health (provider) values (p_provider)
  on conflict (provider) do nothing;

  select * into row from llm_health where provider = p_provider for update;

  -- Failed probe → straight back to open with a fresh cooldown.
  if row.state = 'half_open' then
    update llm_health
    set state = 'open',
        opened_until = now() + make_interval(secs => p_cooldown_seconds),
        failure_count = 0,
        window_start = null,
        updated_at = now()
    where provider = p_provider;
    return;
  end if;

  -- Outside the rolling window → start fresh.
  if row.window_start is null or row.window_start < now() - make_interval(secs => p_window_seconds) then
    update llm_health
    set window_start = now(),
        failure_count = 1,
        state = 'closed',
        updated_at = now()
    where provider = p_provider;
    return;
  end if;

  -- Inside the window — increment, and trip the breaker if we hit the threshold.
  if row.failure_count + 1 >= p_threshold then
    update llm_health
    set state = 'open',
        opened_until = now() + make_interval(secs => p_cooldown_seconds),
        failure_count = 0,
        window_start = null,
        updated_at = now()
    where provider = p_provider;
  else
    update llm_health
    set failure_count = row.failure_count + 1,
        updated_at = now()
    where provider = p_provider;
  end if;
end;
$$;
