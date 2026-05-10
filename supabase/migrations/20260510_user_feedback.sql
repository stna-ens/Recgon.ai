-- Help & Feedback submissions from the v2 avatar menu modal.
-- One row per submit. user_id may be null if a future surface allows
-- anonymous feedback, but the current API route requires an auth session.

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'question', 'other')),
  message TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at
  ON user_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id
  ON user_feedback (user_id);
