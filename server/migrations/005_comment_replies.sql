ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id
  ON comments(parent_comment_id);
