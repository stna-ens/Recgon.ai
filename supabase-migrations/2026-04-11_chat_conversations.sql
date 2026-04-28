-- Chat conversations: group chat_messages into named threads (ChatGPT-style history)

CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_chat_conv_user ON chat_conversations(user_id, updated_at DESC);

ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE CASCADE;
CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id, ts);

-- Backfill: create a "Legacy chat" conversation per user with existing messages,
-- then attach those messages to it.
DO $$
DECLARE
  rec RECORD;
  new_id TEXT;
  now_ms BIGINT := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id FROM chat_messages WHERE conversation_id IS NULL
  LOOP
    new_id := 'legacy_' || rec.user_id || '_' || now_ms::TEXT;
    INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
    VALUES (new_id, rec.user_id, 'Legacy chat', now_ms, now_ms);
    UPDATE chat_messages SET conversation_id = new_id
    WHERE user_id = rec.user_id AND conversation_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE chat_messages ALTER COLUMN conversation_id SET NOT NULL;
