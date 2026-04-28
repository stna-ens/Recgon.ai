-- Security & integrity hardening.
--
-- Enables RLS on every tenant table as defense-in-depth, fixes a missing
-- cascade on team_invitations.invited_by, and adds the indexes the audit
-- flagged as missing for hot-path queries.
--
-- The Recgon app talks to Supabase via the SERVICE_ROLE_KEY, which bypasses
-- RLS — so enabling RLS does NOT change how the app behaves today. What it
-- buys us:
--   * if the anon key is ever used by mistake, queries are denied by default
--   * if the service-role key leaks, an attacker still cannot use the anon
--     key path to dump data
--   * future migration to client-side Postgres roles is unblocked

-- ---------- RLS ----------

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_analyses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_configs   ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners — only the service role bypasses it.
ALTER TABLE users               FORCE ROW LEVEL SECURITY;
ALTER TABLE teams               FORCE ROW LEVEL SECURITY;
ALTER TABLE team_members        FORCE ROW LEVEL SECURITY;
ALTER TABLE team_invitations    FORCE ROW LEVEL SECURITY;
ALTER TABLE projects            FORCE ROW LEVEL SECURITY;
ALTER TABLE project_analyses    FORCE ROW LEVEL SECURITY;
ALTER TABLE marketing_content   FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_analyses   FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns           FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_configs   FORCE ROW LEVEL SECURITY;

-- Note: there are intentionally NO policies created here. With RLS on +
-- FORCE on, every non-service-role query is denied. The Recgon backend uses
-- the service role key (which bypasses RLS) so production traffic is
-- unaffected. If you later add a client-side query path, add explicit
-- policies for the relevant role at that point.

-- ---------- FK fixes ----------

-- Orphan invitations when the inviting user is deleted instead of breaking
-- the cascade.
ALTER TABLE team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_invited_by_fkey;
ALTER TABLE team_invitations
  ADD CONSTRAINT team_invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;

-- ---------- Indexes ----------

-- Hot-path: which teams am I in?
CREATE INDEX IF NOT EXISTS idx_team_members_user
  ON team_members(user_id);

-- Hot-path: invitation lookup by token / email.
CREATE INDEX IF NOT EXISTS idx_team_invitations_token
  ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email
  ON team_invitations(email);

-- Hot-path: chat history newest-first per user.
CREATE INDEX IF NOT EXISTS idx_chat_user_ts
  ON chat_messages(user_id, ts DESC);

-- Hot-path: rate-limit cleanup (expired rows).
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at
  ON rate_limits(reset_at);

-- Hot-path: project lookup by team + id (used by every getProject call).
CREATE INDEX IF NOT EXISTS idx_projects_id_team
  ON projects(id, team_id);

-- Hot-path: project relationships.
CREATE INDEX IF NOT EXISTS idx_marketing_project
  ON marketing_content(project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project
  ON feedback_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_project
  ON campaigns(project_id);
