-- Security hardening from Supabase advisor scan (production-readiness audit F-04/F-05/F-06)

-- F-04: teammate_stats view executed with owner privileges, letting PostgREST
-- clients read through it without RLS. security_invoker makes it run with the
-- caller's privileges; the app's service-role queries are unaffected.
alter view public.teammate_stats set (security_invoker = true);

-- F-05: rls_auto_enable() is SECURITY DEFINER and was callable by anon and
-- authenticated roles via /rest/v1/rpc. It is an internal maintenance helper.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- F-06: pin search_path on all flagged functions so a malicious schema cannot
-- shadow the objects they reference. public stays first (bodies use unqualified
-- names); pg_temp is forced last so temp objects cannot shadow either.
alter function public.llm_jobs_touch_updated_at() set search_path = public, pg_temp;
alter function public.teammates_touch_updated_at() set search_path = public, pg_temp;
alter function public.team_llm_usage_touch_updated_at() set search_path = public, pg_temp;
alter function public.teammate_profiles_touch_updated_at() set search_path = public, pg_temp;
alter function public.teammate_inferred_skills_touch_updated_at() set search_path = public, pg_temp;
alter function public.claim_next_llm_job(worker_id text) set search_path = public, pg_temp;
alter function public.llm_health_try(p_provider text) set search_path = public, pg_temp;
alter function public.llm_health_record_success(p_provider text) set search_path = public, pg_temp;
alter function public.llm_health_record_failure(p_provider text, p_threshold integer, p_window_seconds integer, p_cooldown_seconds integer) set search_path = public, pg_temp;
alter function public.rls_auto_enable() set search_path = public, pg_temp;
