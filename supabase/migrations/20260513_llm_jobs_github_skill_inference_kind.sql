-- Phase 2 / Plan 02-02 follow-up fix.
--
-- Plan 02-02 added `github_skill_inference` as a new llm_jobs.kind in the
-- TypeScript layer (JobKind union, worker registry, scan route enqueue) but
-- did NOT extend the matching DB CHECK constraint. Every Re-scan POST hit a
-- 500 with `failed to enqueue scan` because the INSERT was rejected by
-- `llm_jobs_kind_check`.
--
-- This migration drops + re-adds the constraint with the new value appended.
-- Existing rows are unaffected (none use the new value yet). The full set is
-- the union of the previous list (verified via pg_get_constraintdef on
-- 2026-05-12) plus `github_skill_inference`.

alter table llm_jobs drop constraint if exists llm_jobs_kind_check;

alter table llm_jobs add constraint llm_jobs_kind_check
  check (kind = any (array[
    'feedback_analysis'::text,
    'codebase_analysis'::text,
    'competitor_analysis'::text,
    'idea_analysis'::text,
    'teammate_task'::text,
    'task_verification'::text,
    'commit_summary'::text,
    'github_skill_inference'::text
  ]));
