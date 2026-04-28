-- Analysis quota tracking for METU users.
-- Each user gets 3 total project analyses, with at most 1 every 14 days.

CREATE TABLE IF NOT EXISTS analysis_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_count INTEGER NOT NULL DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ
);
