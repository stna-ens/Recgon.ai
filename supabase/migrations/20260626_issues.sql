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
