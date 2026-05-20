-- Phase 4 / Plan 04-01 follow-up fix.
--
-- Plan 04-01 added `task_reframe` as a new llm_jobs.kind in the TypeScript
-- layer (JobKind union in src/lib/llm/jobQueue.ts + worker registry in
-- src/lib/llm/workers.ts + dispatcher enqueue helper) but the matching DB
-- CHECK constraint must also be extended, otherwise every
-- `enqueueReframeJob` call would be rejected by `llm_jobs_kind_check` and
-- the dispatcher would emit a 23514 constraint violation.
--
-- This migration drops + re-adds the constraint with `task_reframe`
-- appended. Existing rows are unaffected (none use the new value yet). The
-- full set is the union of the previous list (verified via pg_get_constraintdef
-- on 2026-05-20) plus `task_reframe`.

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
    'github_skill_inference'::text,
    'task_reframe'::text
  ]));
