-- Persistent cache of Recgon's plain-English summaries of GitHub commits.
-- Keyed on (github_url, sha) so the same commit isn't re-summarized across
-- sessions. Generated asynchronously by the `commit_summary` LLM worker
-- and read by the home cockpit's "updates" column.
create table if not exists commit_summaries (
  id uuid primary key default gen_random_uuid(),
  github_url text not null,
  sha text not null,
  raw_message text not null,
  summary text not null,
  committed_at timestamptz,
  generated_at timestamptz not null default now(),
  unique (github_url, sha)
);

create index if not exists idx_commit_summaries_lookup
  on commit_summaries(github_url, sha);

-- Allow the new `commit_summary` job kind in llm_jobs.
alter table llm_jobs drop constraint if exists llm_jobs_kind_check;
alter table llm_jobs add constraint llm_jobs_kind_check check (kind in (
  'feedback_analysis',
  'codebase_analysis',
  'competitor_analysis',
  'idea_analysis',
  'teammate_task',
  'task_verification',
  'commit_summary'
));
