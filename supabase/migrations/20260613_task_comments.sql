-- Task threads (Phase B) — comments live ON the task, so discussion stops
-- leaking to WhatsApp and Recgon's brain can read it (reframe / judge /
-- verification context).
--
-- Design:
--   * author_user_id references the users table conceptually (no FK — same
--     soft-reference convention as agent_tasks.created_by).
--   * mentions holds an array of mentioned user ids (jsonb) parsed at POST
--     time; notification fan-out reads it.
--   * deleted_at is a soft delete — the thread keeps its shape ("comment
--     removed") and the AI context builder skips deleted rows.
--   * body capped at 4000 chars at the DB so no client can bloat the
--     prompt-context source.
--
-- Additive only; IF NOT EXISTS guards throughout.

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  team_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) <= 4000),
  mentions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments (task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_comments_team
  ON task_comments (team_id, created_at);

COMMENT ON TABLE task_comments IS
  'Phase B task threads — per-task discussion. Read by the UI thread AND by the AI context builders (reframe/judge/verify), which anonymize authors and wrap bodies as untrusted input.';
