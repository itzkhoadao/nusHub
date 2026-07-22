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

// ensure db has these
async function ensureUserAvatarColumns() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS cover_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS cover_updated_at TIMESTAMPTZ
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
      `SELECT id, username, email, avatar_url, avatar_storage_key, avatar_updated_at,
              cover_url, cover_storage_key, cover_updated_at, created_at
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
       RETURNING id, username, email, avatar_url, avatar_storage_key, avatar_updated_at, created_at`,
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
       RETURNING id, username, email, avatar_url, avatar_storage_key, avatar_updated_at, created_at`,
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
       RETURNING id, username, email, avatar_url, avatar_storage_key, avatar_updated_at,
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
       RETURNING id, username, email, avatar_url, avatar_storage_key, avatar_updated_at,
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
      `SELECT id, username, email, avatar_url, avatar_storage_key, avatar_updated_at,
              cover_url, cover_storage_key, cover_updated_at, created_at
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
