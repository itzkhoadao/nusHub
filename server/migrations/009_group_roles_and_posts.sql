ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_members_role_check'
  ) THEN
    ALTER TABLE group_members
      ADD CONSTRAINT group_members_role_check
      CHECK (role IN ('admin', 'member'));
  END IF;
END
$$;

UPDATE group_members gm
SET role = 'admin'
FROM study_groups g
WHERE gm.group_id = g.id
  AND gm.user_id = g.creator_id;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_privacy VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_group_privacy_check'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_group_privacy_check
      CHECK (
        (group_id IS NULL AND group_privacy IS NULL)
        OR
        (group_id IS NOT NULL AND group_privacy IN ('public', 'private'))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_group_not_anonymous_check'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_group_not_anonymous_check
      CHECK (group_id IS NULL OR is_anonymous = FALSE);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_group_members_user_group
  ON group_members(user_id, group_id);

CREATE INDEX IF NOT EXISTS idx_posts_group_published
  ON posts(group_id, published_at DESC)
  WHERE group_id IS NOT NULL;
