-- Task verification: three-tier verdict pipeline.
--
-- New columns on agent_tasks track Recgon's verification state without
-- breaking the existing flow. status remains the user-facing state, and
-- verification_status is the parallel "did the work actually happen"
-- judgement Recgon makes when a task hits awaiting_review.
--
-- proof:                 teammate-submitted payload (text, links, metric refs)
-- verification_status:   none, auto_running, auto_passed, auto_inconclusive,
--                        proof_requested, proof_evaluating, passed, failed,
--                        owner_override
-- verification_evidence: what Recgon found (commit shas, metric deltas, eval notes)
-- verified_at, verified_by: 'recgon' or 'owner_override'
--
-- llm_jobs.kind gains 'task_verification' so the verification worker can be
-- claimed by the existing drain loop.

alter table agent_tasks
  add column if not exists proof jsonb,
  add column if not exists verification_status text not null default 'none'
    check (verification_status in (
      'none',
      'auto_running',
      'auto_passed',
      'auto_inconclusive',
      'proof_requested',
      'proof_evaluating',
      'passed',
      'failed',
      'owner_override'
    )),
  add column if not exists verification_evidence jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text;

create index if not exists idx_agent_tasks_verification_status
  on agent_tasks (team_id, verification_status)
  where verification_status not in ('none', 'passed', 'failed', 'owner_override');

alter table llm_jobs drop constraint if exists llm_jobs_kind_check;
alter table llm_jobs add constraint llm_jobs_kind_check check (kind in (
  'feedback_analysis',
  'codebase_analysis',
  'competitor_analysis',
  'idea_analysis',
  'teammate_task',
  'task_verification'
));
