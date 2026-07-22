import express from "express";
const router = express.Router();

import authenticate from "../middleware/authenticate";

import { pool } from "../db";
import {
  createAvatarUploadUrl,
  createCoverUploadUrl,
  createDownloadUrl,
  deleteStoredObject,
  getPublicFileUrl,
  validateAvatarMetadata,
  validateCoverMetadata,
  verifyUploadedObject,
} from "../utils/r2Storage";

const ACADEMIC_YEARS = new Set([
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Master", "PhD", "None",
]);
const AGE_RANGES = new Set([
  "Below 20", "20 - 25", "25 - 30", "30 - 40", "Above 40", "Not shared",
]);
const NUS_FACULTIES = new Set([
  "Faculty of Arts & Social Sciences",
  "NUS Business School",
  "School of Computing",
  "School of Continuing & Lifelong Education",
  "Faculty of Dentistry",
  "College of Design and Engineering",
  "Duke-NUS Medical School",
  "College of Humanities and Sciences",
  "NUS College",
  "NUS Graduate School",
  "Faculty of Law",
  "Yong Loo Lin School of Medicine (including Nursing)",
  "Yong Siew Toh Conservatory of Music",
  "Saw Swee Hock School of Public Health",
  "Lee Kuan Yew School of Public Policy",
  "Faculty of Science",
  "Institute of Systems Science",
]);

// ensure db has these
async function ensureUserAvatarColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS cover_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS cover_updated_at TIMESTAMPTZ,
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
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ
  `);
  await pool.query(`
    UPDATE users
    SET nusnet_id = NULL
    WHERE nusnet_id IS NOT NULL AND BTRIM(nusnet_id) = ''
  `);
  await pool.query(`
    WITH ranked_nusnet_ids AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY UPPER(BTRIM(nusnet_id))
               ORDER BY created_at ASC, id ASC
             ) AS occurrence
      FROM users
      WHERE nusnet_id IS NOT NULL AND BTRIM(nusnet_id) <> ''
    )
    UPDATE users AS user_record
    SET nusnet_id = NULL,
        onboarding_completed_at = NULL
    FROM ranked_nusnet_ids
    WHERE user_record.id = ranked_nusnet_ids.id
      AND ranked_nusnet_ids.occurrence > 1
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_nusnet_id_unique
    ON users (UPPER(BTRIM(nusnet_id)))
    WHERE nusnet_id IS NOT NULL AND BTRIM(nusnet_id) <> ''
  `);
}

// generates temporary signed download URL, returns new user object containing that URL
async function addAvatarUrlToUser(user: any) {
  if (!user) {
    return user;
  }

  if (user.avatar_storage_key) {
    const publicAvatarUrl = getPublicFileUrl(user.avatar_storage_key);

    if (publicAvatarUrl) {
      return {
        ...user,
        avatar_url: publicAvatarUrl,
      };
    }
  }

  if (user.avatar_storage_key && !user.avatar_url) {
    return {
      ...user,
      avatar_url: await createDownloadUrl(user.avatar_storage_key),
    };
  }

  return user;
}

// ensures the returned user has usable media URLs for both avatar and cover picture
async function addMediaUrlsToUser(user: any) {
  const userWithAvatar = await addAvatarUrlToUser(user);

  if (!userWithAvatar?.cover_storage_key) {
    return userWithAvatar;
  }

  const publicCoverUrl = getPublicFileUrl(userWithAvatar.cover_storage_key);
  return {
    ...userWithAvatar,
    cover_url:
      publicCoverUrl ||
      userWithAvatar.cover_url ||
      (await createDownloadUrl(userWithAvatar.cover_storage_key)),
  };
}

// get the user's profile
router.get("/me", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const userId = req.user.id;

    // Get user info
    const userResult = await pool.query(
      `SELECT id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at,
              cover_url, cover_storage_key, cover_updated_at,
              academic_year, is_teaching_assistant, is_professor, is_staff,
              stays_on_campus, age_range, faculty,
              COALESCE(faculties, CASE WHEN faculty IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[faculty] END) AS faculties,
              nusnet_id, nus_email,
              (onboarding_completed_at IS NOT NULL) AS onboarding_completed,
              created_at
       FROM users WHERE id = $1`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user's posts
    const postsResult = await pool.query(
      `SELECT id, title, topic, upvotes, is_anonymous, created_at
       FROM posts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    // Get user's comments
    const commentsResult = await pool.query(
      `SELECT c.id, c.content, c.upvotes, c.is_anonymous,
              c.created_at, p.title as post_title, p.id as post_id
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId],
    );

    // Get study groups the user has joined
    const groupsResult = await pool.query(
      `SELECT g.id, g.name, g.module_code, g.description,
              gm.joined_at,
              u.username as creator_name,
              COUNT(all_members.user_id) as member_count
       FROM group_members gm
       JOIN study_groups g ON g.id = gm.group_id
       LEFT JOIN users u ON u.id = g.creator_id
       LEFT JOIN group_members all_members ON all_members.group_id = g.id
       WHERE gm.user_id = $1
       GROUP BY g.id, gm.joined_at, u.username
       ORDER BY gm.joined_at DESC`,
      [userId],
    );

    res.json({
      user: await addMediaUrlsToUser(userResult.rows[0]),
      posts: postsResult.rows,
      comments: commentsResult.rows,
      groups: groupsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me/profile", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const hasUsername = req.body.username !== undefined;
    const hasBio = req.body.bio !== undefined;

    if (!hasUsername && !hasBio) {
      return res.status(400).json({ error: "No profile changes provided" });
    }

    const currentResult = await pool.query(
      `SELECT username, bio FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const username = hasUsername
      ? String(req.body.username).trim()
      : currentResult.rows[0].username;
    const bio = hasBio
      ? String(req.body.bio).trim()
      : currentResult.rows[0].bio;

    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–24 characters using letters, numbers, or underscores",
      });
    }
    if (bio && bio.length > 160) {
      return res.status(400).json({ error: "Bio must be 160 characters or fewer" });
    }

    const duplicate = await pool.query(
      `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2`,
      [username, req.user.id],
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: "That username is already taken" });
    }

    const result = await pool.query(
      `UPDATE users SET username = $1, bio = $2 WHERE id = $3
       RETURNING id, username, email, bio, avatar_url, avatar_storage_key,
                 avatar_updated_at, cover_url, cover_storage_key, cover_updated_at,
                 academic_year, is_teaching_assistant, is_professor, is_staff,
                 stays_on_campus, age_range, faculty,
                 COALESCE(faculties, CASE WHEN faculty IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[faculty] END) AS faculties,
                 (onboarding_completed_at IS NOT NULL) AS onboarding_completed,
                 created_at`,
      [username, bio || null, req.user.id],
    );

    res.json({ user: await addMediaUrlsToUser(result.rows[0]) });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "That username is already taken" });
    }
    res.status(500).json({ error: err.message });
  }
});

// validate and update user's info after filling in Onboarding Page
router.put("/me/background", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const {
      academic_year,
      age_range,
      faculties,
      is_professor,
      is_staff,
      is_teaching_assistant,
      nus_email,
      nusnet_id,
      stays_on_campus,
    } = req.body;

    if (!ACADEMIC_YEARS.has(academic_year)) {
      return res.status(400).json({ error: "Choose a valid year of study" });
    }
    if (!AGE_RANGES.has(age_range)) {
      return res.status(400).json({ error: "Choose a valid age range" });
    }
    if (
      !Array.isArray(faculties) ||
      faculties.length < 1 ||
      faculties.length > 3 ||
      new Set(faculties).size !== faculties.length ||
      faculties.some((faculty) => !NUS_FACULTIES.has(faculty))
    ) {
      return res.status(400).json({
        error: "Choose between one and three valid NUS faculties or schools",
      });
    }
    if (
      typeof is_professor !== "boolean" ||
      typeof is_staff !== "boolean" ||
      typeof is_teaching_assistant !== "boolean" ||
      typeof stays_on_campus !== "boolean"
    ) {
      return res.status(400).json({ error: "Invalid background information" });
    }

    const usesNusEmail = is_professor || is_staff;
    const normalizedNusnetId = String(nusnet_id || "").trim().toUpperCase();
    const normalizedNusEmail = String(nus_email || "").trim().toLowerCase();

    if (usesNusEmail) {
      if (!/^[^\s@]+@(?:[a-z0-9-]+\.)*nus\.edu\.sg$/i.test(normalizedNusEmail)) {
        return res.status(400).json({
          error: "Enter a valid NUS email ending in nus.edu.sg",
        });
      }
    } else if (!/^E\d{7}$/.test(normalizedNusnetId)) {
      return res.status(400).json({
        error: "NUSNET ID must use the format E1234567",
      });
    }

    if (!usesNusEmail) {
      const existingNusnetId = await pool.query(
        `SELECT 1 FROM users
         WHERE UPPER(nusnet_id) = $1 AND id <> $2`,
        [normalizedNusnetId, req.user.id],
      );
      if (existingNusnetId.rows.length > 0) {
        return res.status(409).json({
          error: "That NUSNET ID is already linked to another account",
        });
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET academic_year = $1,
           is_teaching_assistant = $2,
           is_professor = $3,
           is_staff = $4,
           stays_on_campus = $5,
           age_range = $6,
           faculty = $7,
           faculties = $8,
           nusnet_id = $9,
           nus_email = $10,
           onboarding_completed_at = NOW()
       WHERE id = $11
       RETURNING id, username, email, avatar_url, academic_year,
                 is_teaching_assistant, is_professor, is_staff,
                 stays_on_campus, age_range, faculty, faculties,
                 (onboarding_completed_at IS NOT NULL) AS onboarding_completed`,
      [
        academic_year,
        is_teaching_assistant,
        is_professor,
        is_staff,
        stays_on_campus,
        age_range,
        faculties[0],
        faculties,
        usesNusEmail ? null : normalizedNusnetId,
        usesNusEmail ? normalizedNusEmail : null,
        req.user.id,
      ],
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err?.code === "23505" && err?.constraint === "users_nusnet_id_unique") {
      return res.status(409).json({
        error: "That NUSNET ID is already linked to another account",
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// PRESIGN ENDPOINT
// receives metadata and returns temporary upload permission
router.post("/me/avatar/presign", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();

    const file = {
      file_size: Number(req.body.file_size),
      mime_type: req.body.mime_type,
      original_name: req.body.original_name,
    };

    validateAvatarMetadata(file);

    const upload = await createAvatarUploadUrl({
      mimeType: file.mime_type,
      originalName: file.original_name,
      userId: req.user.id,
    }); // create temporary signed upload URL

    res.json({
      file_size: file.file_size,
      file_url: upload.fileUrl,
      mime_type: file.mime_type,
      original_name: file.original_name,
      storage_key: upload.storageKey,
      upload_url: upload.uploadUrl,
    }); // return upload info
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// browser uploads directly to R2, then this endpoint confirms the upload
router.post("/me/avatar/confirm", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();

    const file = {
      file_size: Number(req.body.file_size),
      mime_type: req.body.mime_type,
      original_name: req.body.original_name,
    };
    const storageKey = req.body.storage_key;

    validateAvatarMetadata(file);

    if (!storageKey?.startsWith(`avatars/${req.user.id}/`)) {
      return res.status(400).json({ error: "Avatar upload key is invalid" });
    }

    await verifyUploadedObject({
      fileSize: file.file_size,
      mimeType: file.mime_type,
      storageKey,
    });

    const publicAvatarUrl = getPublicFileUrl(storageKey);
    const result = await pool.query(
      `UPDATE users
       SET avatar_url = $1,
           avatar_storage_key = $2,
           avatar_updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at, created_at`,
      [publicAvatarUrl, storageKey, req.user.id],
    ); // update user records

    res.json({ user: await addAvatarUrlToUser(result.rows[0]) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// deleting avatar
router.delete("/me/avatar", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();

    const currentUser = await pool.query(
      `SELECT avatar_storage_key FROM users WHERE id = $1`,
      [req.user.id],
    );
    const previousStorageKey = currentUser.rows[0]?.avatar_storage_key; // storage key in R2

    const result = await pool.query(
      `UPDATE users
       SET avatar_url = NULL,
           avatar_storage_key = NULL,
           avatar_updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at, created_at`,
      [req.user.id],
    ); // update db to delete avatar for that user

    if (previousStorageKey) {
      deleteStoredObject(previousStorageKey).catch(() => {
        // avatar removal should still succeed even if old object cleanup fails
      });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PRESIGN ENDPOINT
// receives metadata and returns temporary upload permission
router.post("/me/cover/presign", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const file = {
      file_size: Number(req.body.file_size),
      mime_type: req.body.mime_type,
      original_name: req.body.original_name,
    };
    validateCoverMetadata(file);

    const upload = await createCoverUploadUrl({
      mimeType: file.mime_type,
      originalName: file.original_name,
      userId: req.user.id,
    });

    res.json({
      file_size: file.file_size,
      file_url: upload.fileUrl,
      mime_type: file.mime_type,
      original_name: file.original_name,
      storage_key: upload.storageKey,
      upload_url: upload.uploadUrl,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// browser uploads directly to R2, then this endpoint confirms the upload
router.post("/me/cover/confirm", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const file = {
      file_size: Number(req.body.file_size),
      mime_type: req.body.mime_type,
      original_name: req.body.original_name,
    };
    const storageKey = req.body.storage_key;
    validateCoverMetadata(file); // validates confirmation data

    if (!storageKey?.startsWith(`covers/${req.user.id}/`)) {
      return res.status(400).json({ error: "Cover upload key is invalid" });
    }

    await verifyUploadedObject({
      fileSize: file.file_size,
      mimeType: file.mime_type,
      storageKey,
    }); // verify object in R2

    // find previous cover picture's key in R2
    const currentUser = await pool.query(
      `SELECT cover_storage_key FROM users WHERE id = $1`,
      [req.user.id],
    );
    const previousStorageKey = currentUser.rows[0]?.cover_storage_key;

    // update with new cover's info
    const result = await pool.query(
      `UPDATE users
       SET cover_url = $1, cover_storage_key = $2, cover_updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at,
                 cover_url, cover_storage_key, cover_updated_at, created_at`,
      [getPublicFileUrl(storageKey), storageKey, req.user.id],
    );

    // delete previous R2 object
    if (previousStorageKey && previousStorageKey !== storageKey) {
      deleteStoredObject(previousStorageKey).catch(() => {});
    }

    res.json({ user: await addMediaUrlsToUser(result.rows[0]) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// delete cover picture
router.delete("/me/cover", authenticate, async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const currentUser = await pool.query(
      `SELECT cover_storage_key FROM users WHERE id = $1`,
      [req.user.id],
    );
    const previousStorageKey = currentUser.rows[0]?.cover_storage_key;
    const result = await pool.query(
      `UPDATE users
       SET cover_url = NULL, cover_storage_key = NULL, cover_updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at,
                 cover_url, cover_storage_key, cover_updated_at, created_at`,
      [req.user.id],
    ); // set to null

    if (previousStorageKey) {
      deleteStoredObject(previousStorageKey).catch(() => {});
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// get a public profile by user id
router.get("/:id", async (req, res) => {
  try {
    await ensureUserAvatarColumns();
    const { id } = req.params;

    // Get public user info
    const userResult = await pool.query(
      `SELECT id, username, email, bio, avatar_url, avatar_storage_key, avatar_updated_at,
              cover_url, cover_storage_key, cover_updated_at,
              academic_year, is_teaching_assistant, is_professor, is_staff,
              stays_on_campus, age_range, faculty,
              COALESCE(faculties, CASE WHEN faculty IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[faculty] END) AS faculties,
              (onboarding_completed_at IS NOT NULL) AS onboarding_completed,
              created_at
       FROM users WHERE id = $1`,
      [id],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // In their profile, get user's public posts only, anonymous posts won't show
    const postsResult = await pool.query(
      `SELECT id, title, topic, upvotes, is_anonymous, created_at
       FROM posts
       WHERE user_id = $1 AND is_anonymous = false
       ORDER BY created_at DESC`,
      [id],
    );

    // Get user's public comments only
    const commentsResult = await pool.query(
      `SELECT c.id, c.content, c.upvotes, c.is_anonymous,
              c.created_at, p.title as post_title, p.id as post_id
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.user_id = $1 AND c.is_anonymous = false
       ORDER BY c.created_at DESC`,
      [id],
    );

    // Get study groups this user has joined
    const groupsResult = await pool.query(
      `SELECT g.id, g.name, g.module_code, g.description,
              gm.joined_at,
              u.username as creator_name,
              COUNT(all_members.user_id) as member_count
       FROM group_members gm
       JOIN study_groups g ON g.id = gm.group_id
       LEFT JOIN users u ON u.id = g.creator_id
       LEFT JOIN group_members all_members ON all_members.group_id = g.id
       WHERE gm.user_id = $1
       GROUP BY g.id, gm.joined_at, u.username
       ORDER BY gm.joined_at DESC`,
      [id],
    );

    res.json({
      user: await addMediaUrlsToUser(userResult.rows[0]),
      posts: postsResult.rows,
      comments: commentsResult.rows,
      groups: groupsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
