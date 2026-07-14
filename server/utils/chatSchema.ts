import { pool } from "../db";

export async function ensureChatSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(20) NOT NULL DEFAULT 'direct',
      direct_key TEXT UNIQUE,
      study_group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_read_at TIMESTAMPTZ,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
      reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'r2',
      storage_key TEXT,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

    ALTER TABLE messages
      ALTER COLUMN body SET DEFAULT '';

    ALTER TABLE messages
      DROP CONSTRAINT IF EXISTS messages_body_check;

    ALTER TABLE message_attachments
      ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'r2',
      ADD COLUMN IF NOT EXISTS storage_key TEXT;

    UPDATE message_attachments
    SET storage_key = stored_name
    WHERE storage_key IS NULL;

    ALTER TABLE message_attachments
      ALTER COLUMN storage_key SET NOT NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE conversations
          ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
          ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_participants'
          AND column_name = 'joined_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE conversation_participants
          ALTER COLUMN joined_at TYPE TIMESTAMPTZ USING joined_at AT TIME ZONE 'UTC',
          ALTER COLUMN last_read_at TYPE TIMESTAMPTZ USING last_read_at AT TIME ZONE 'UTC';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE messages
          ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
          ALTER COLUMN edited_at TYPE TIMESTAMPTZ USING edited_at AT TIME ZONE 'UTC',
          ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
      ON conversation_participants(user_id);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_messages_sender_id
      ON messages(sender_id);

    CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
      ON messages(reply_to_message_id);

    CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
      ON message_attachments(message_id);
  `);
}
