CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL DEFAULT 'direct',
  direct_key TEXT UNIQUE,
  study_group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group')),
  CONSTRAINT conversations_direct_key_check CHECK (
    (type = 'direct' AND direct_key IS NOT NULL AND study_group_id IS NULL)
    OR
    (type = 'group' AND direct_key IS NULL AND study_group_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  CONSTRAINT messages_body_check CHECK (length(trim(body)) > 0)
);

-- create index: creates a shortcut so the database does not need to search every row manually
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
  ON conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON messages(sender_id);
