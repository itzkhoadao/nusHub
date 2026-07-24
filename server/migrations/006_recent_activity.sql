CREATE TABLE IF NOT EXISTS recent_activity (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('post', 'group')),
  item_id UUID NOT NULL,
  accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_recent_activity_user_accessed_at
  ON recent_activity(user_id, accessed_at DESC);
