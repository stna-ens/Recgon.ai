-- Recgon Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  nickname TEXT NOT NULL,
  github_access_token TEXT,
  github_username TEXT,
  avatar_url TEXT,
  social_profiles JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Teams
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Team membership with roles
CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- Invitations
CREATE TABLE team_invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects belong to teams
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  is_github BOOLEAN DEFAULT false,
  github_url TEXT,
  last_analyzed_commit_sha TEXT,
  analytics_property_id TEXT,
  social_profiles JSONB DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_projects_team ON projects(team_id);

-- Analysis as JSONB blob
CREATE TABLE project_analyses (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Marketing content
CREATE TABLE marketing_content (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Feedback analyses
CREATE TABLE feedback_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  raw_feedback JSONB NOT NULL,
  sentiment TEXT NOT NULL,
  sentiment_breakdown JSONB NOT NULL,
  themes JSONB NOT NULL,
  feature_requests JSONB NOT NULL,
  bugs JSONB NOT NULL,
  praises JSONB NOT NULL,
  developer_prompts JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  goal TEXT NOT NULL,
  duration TEXT NOT NULL,
  name TEXT NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat conversations (ChatGPT-style threads)
CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_chat_conv_user ON chat_conversations(user_id, updated_at DESC);

-- Chat history (per user, personal mentor), scoped by conversation
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX idx_chat_user ON chat_messages(user_id);
CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id, ts);

-- Analytics config (per user, personal OAuth tokens)
CREATE TABLE analytics_configs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT DEFAULT '',
  service_account_json TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at BIGINT,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('service_account', 'oauth')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Analysis quota tracking (per user, limits project analyses)
CREATE TABLE analysis_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_count INTEGER NOT NULL DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ
);
