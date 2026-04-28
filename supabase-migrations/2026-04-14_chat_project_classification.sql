-- Link chat conversations to projects for classification/grouping in sidebar

ALTER TABLE chat_conversations
  ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_chat_conv_project ON chat_conversations(project_id);
