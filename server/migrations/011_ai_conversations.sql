CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL DEFAULT 'New module question',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  reply_to_message_id UUID REFERENCES ai_messages(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  delivery_status VARCHAR(12) NOT NULL DEFAULT 'processing',
  answer_status VARCHAR(24),
  follow_up_question TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code VARCHAR(64),
  academic_year VARCHAR(9),
  module_code VARCHAR(16),
  request_id UUID NOT NULL,
  idempotency_key VARCHAR(128),
  prompt_version VARCHAR(64),
  model_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_messages_role_check
    CHECK (role IN ('user', 'assistant')),
  CONSTRAINT ai_messages_delivery_status_check
    CHECK (delivery_status IN ('processing', 'completed', 'failed', 'interrupted')),
  CONSTRAINT ai_messages_answer_status_check
    CHECK (
      answer_status IS NULL OR answer_status IN (
        'answered', 'needs_clarification', 'not_verified', 'refused'
      )
    ),
  CONSTRAINT ai_messages_warnings_check CHECK (jsonb_typeof(warnings) = 'array'),
  CONSTRAINT ai_messages_request_shape_check
    CHECK (
      (role = 'user' AND idempotency_key IS NOT NULL AND reply_to_message_id IS NULL)
      OR
      (role = 'assistant' AND idempotency_key IS NULL AND reply_to_message_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX ai_messages_conversation_idempotency_unique
  ON ai_messages(conversation_id, idempotency_key)
  WHERE role = 'user';

CREATE UNIQUE INDEX ai_messages_reply_unique
  ON ai_messages(reply_to_message_id)
  WHERE role = 'assistant';

CREATE INDEX ai_conversations_user_updated_idx
  ON ai_conversations(user_id, updated_at DESC);

CREATE INDEX ai_messages_conversation_created_idx
  ON ai_messages(conversation_id, created_at, id);

CREATE TABLE ai_message_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  source_id VARCHAR(100) NOT NULL,
  document_version_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  effective_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL,
  claim_ids JSONB NOT NULL,
  position INTEGER NOT NULL,
  CONSTRAINT ai_message_citations_claim_ids_check
    CHECK (jsonb_typeof(claim_ids) = 'array'),
  CONSTRAINT ai_message_citations_position_check CHECK (position >= 0),
  UNIQUE(message_id, position)
);

CREATE TABLE ai_feedback (
  message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating VARCHAR(12) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT ai_feedback_rating_check CHECK (rating IN ('helpful', 'unhelpful'))
);

CREATE TABLE ai_request_usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT ai_request_usage_count_check CHECK (request_count >= 0)
);
