ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();

UPDATE posts
SET published_at = created_at
WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS post_attachments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_attachments_post_id
  ON post_attachments(post_id, created_at);
