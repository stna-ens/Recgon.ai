-- quick-260626-mkn — Issues inbox.
--
-- A teammate writes an issue (title + free-text description). On submit Recgon
-- breaks it into 1-or-many right-sized tasks (one LLM call) and mints them with
-- source='issue', source_ref={issueId,index}. This table is the inbox + the
-- conversion bookkeeping (status + task_count). It runs ALONGSIDE the existing
-- brain — nothing here touches agent_tasks' schema (the link lives in the
-- already-existing source/source_ref columns + the unique source_ref index).
--
-- status lifecycle:
--   open       — written, not yet converted (transient; POST converts inline)
--   converting — conversion in flight (set before the breakdown LLM call)
--   converted  — tasks minted; task_count holds how many; converted_at stamped
--   closed     — teammate archived the issue

CREATE TABLE IF NOT EXISTS issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'converting', 'converted', 'closed')),
  task_count   int NOT NULL DEFAULT 0,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_issues_team_status
  ON issues (team_id, status, created_at DESC);

-- Issue-spawned tasks are minted with source='issue'. The original
-- agent_tasks_source_check predates this and only allowed
-- brain/user/teammate/schedule, so the insert was rejected and the issue
-- stranded in 'converting'. Widen the constraint to include 'issue'.
ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_source_check;
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_source_check
  CHECK (source = ANY (ARRAY['brain'::text, 'user'::text, 'teammate'::text, 'schedule'::text, 'issue'::text]));

-- An issue can target a project; tasks Recgon mints from it inherit that
-- project. ON DELETE SET NULL detaches issues when a project is removed.
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS project_id text REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues (project_id);
