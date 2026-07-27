CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  reason TEXT NOT NULL CHECK (
    reason IN (
      'harassment',
      'hate',
      'threat',
      'sexual',
      'privacy',
      'self_harm',
      'spam',
      'other'
    )
  ),
  affected_party TEXT NOT NULL CHECK (
    affected_party IN ('me', 'someone_else', 'community')
  ),
  details TEXT,
  immediate_risk BOOLEAN NOT NULL DEFAULT FALSE,
  content_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON content_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON content_reports(reporter_id, created_at DESC);
