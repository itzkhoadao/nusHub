CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  state VARCHAR(10) NOT NULL DEFAULT 'processing',
  response_status INTEGER,
  response_body JSONB,
  response_headers JSONB,
  locked_until TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (scope, idempotency_key),
  CONSTRAINT idempotency_keys_state_check
    CHECK (state IN ('processing', 'completed')),
  CONSTRAINT idempotency_keys_completed_response_check
    CHECK (
      (state = 'processing' AND response_status IS NULL AND completed_at IS NULL)
      OR
      (state = 'completed' AND response_status IS NOT NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_idempotency_keys_expires_at
  ON idempotency_keys(expires_at);
