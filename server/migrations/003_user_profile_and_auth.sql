ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS cover_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS is_teaching_assistant BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_professor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stays_on_campus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS faculty TEXT,
  ADD COLUMN IF NOT EXISTS faculties TEXT[],
  ADD COLUMN IF NOT EXISTS nusnet_id TEXT,
  ADD COLUMN IF NOT EXISTS nus_email TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE users
SET nusnet_id = NULL
WHERE nusnet_id IS NOT NULL
  AND BTRIM(nusnet_id) = '';

-- Keep the earliest account when historical data contains duplicate NUSNET IDs.
-- Other affected accounts must complete onboarding again with a unique value.
WITH ranked_nusnet_ids AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(BTRIM(nusnet_id))
      ORDER BY created_at ASC, id ASC
    ) AS occurrence
  FROM users
  WHERE nusnet_id IS NOT NULL
    AND BTRIM(nusnet_id) <> ''
)
UPDATE users AS user_record
SET nusnet_id = NULL,
    onboarding_completed_at = NULL
FROM ranked_nusnet_ids
WHERE user_record.id = ranked_nusnet_ids.id
  AND ranked_nusnet_ids.occurrence > 1;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique
  ON users (google_id)
  WHERE google_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_nusnet_id_unique
  ON users (UPPER(BTRIM(nusnet_id)))
  WHERE nusnet_id IS NOT NULL
    AND BTRIM(nusnet_id) <> '';
