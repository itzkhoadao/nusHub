import express from "express";
const router = express.Router();
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import authenticate from "../middleware/authenticate";
import { saveRecentActivity } from "../utils/recentActivity";

import { pool } from "../db";
import { createNotification } from "../utils/notificationSchema";
import { addResolvedAvatarUrl, addResolvedAvatarUrls } from "../utils/userAvatar";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  createDownloadUrl,
  createPostAttachmentUploadUrl,
  validateAttachmentMetadata,
  verifyUploadedObject,
} from "../utils/r2Storage";

type PendingPostAttachment = {
  file_size: number;
  file_url?: string;
  mime_type: string;
  original_name: string;
  storage_key: string;
};

async function ensurePostPublishedAtColumn() {
  await pool.query(`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await pool.query(`
    UPDATE posts
    SET published_at = created_at
    WHERE published_at IS NULL
  `);
}

async function ensurePostAttachmentSchema() {
  await pool.query(`
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
    )
  `); // post attachments table

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_post_attachments_post_id
      ON post_attachments(post_id, created_at)
  `);
}

async function addDownloadUrlsToPost(post: any) {
  if (!post?.attachments?.length) {
    return post;
  }

  const attachments = await Promise.all(
    post.attachments.map(async (attachment: any) => ({
      ...attachment,
      file_url:
        attachment.file_url ||
        (await createDownloadUrl(attachment.storage_key)),
    })),
  );

  return {
    ...post,
    attachments,
  };
}

function getOptionalUserId(req) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return null;
  }

  try {
    return (jwt.verify(token, process.env.JWT_SECRET || "") as any).id;
  } catch (err) {
    return null;
  }
}

// GET /api/posts — fetch all posts
router.get("/", async (req, res) => {
  // do not use authenticate => can view posts without logging in
  try {
    await ensurePostPublishedAtColumn();
    const { topic, sort, search } = req.query;
    const userId = getOptionalUserId(req);
    const params = [];

    const upvotedSelect = userId
      ? `EXISTS (
          SELECT 1 FROM post_upvotes pu
          WHERE pu.post_id = p.id AND pu.user_id = $${params.push(userId)}
        )`
      : "false";

    let query = `
      SELECT 
        p.*,
        COALESCE(p.published_at, p.created_at) as post_date,
        CASE 
          WHEN p.is_anonymous = true THEN 'Anonymous'
          WHEN p.user_id IS NULL THEN '[Deleted user]'
          ELSE u.username
        END as username,
        CASE
          WHEN p.is_anonymous = true THEN NULL
          ELSE u.avatar_url
        END as avatar_url,
        CASE
          WHEN p.is_anonymous = true THEN NULL
          ELSE u.avatar_storage_key
        END as avatar_storage_key,
        COUNT(c.id) as comment_count,
        ${upvotedSelect} as upvoted
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN comments c ON c.post_id = p.id
      WHERE 1=1
    `;

    if (topic && topic !== "All") {
      params.push(topic);
      query += ` AND p.topic = $${params.length}`; // add to query condition
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.title ILIKE $${params.length} OR p.content ILIKE $${params.length})`;
    }

    query += ` GROUP BY p.id, u.username, u.avatar_url, u.avatar_storage_key`;
    query +=
      sort === "popular"
        ? " ORDER BY p.upvotes DESC, COALESCE(p.published_at, p.created_at) DESC"
        : " ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC";

    const result = await pool.query(query, params);
    res.json(await addResolvedAvatarUrls(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/attachments/presign", authenticate, async (req, res) => {
  try {
    const files = Array.isArray(req.body.files) ? req.body.files : [];

    if (files.length === 0) {
      return res.status(400).json({ error: "No files selected" });
    }

    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) { // validate
      return res.status(400).json({ error: "You can attach up to 5 files" });
    }

    const uploads = await Promise.all(
      files.map(
        async (file: {
          client_id?: string;
          file_size: number;
          mime_type: string;
          original_name: string;
        }) => {
          validateAttachmentMetadata(file); // validates each proposed file

          const upload = await createPostAttachmentUploadUrl({
            mimeType: file.mime_type,
            originalName: file.original_name,
            userId: req.user.id,
          });

          return {
            client_id: file.client_id,
            file_size: file.file_size,
            file_url: upload.fileUrl, // public url
            mime_type: file.mime_type,
            original_name: file.original_name,
            storage_key: upload.storageKey,
            upload_url: upload.uploadUrl,
          };
        },
      ),
    );

    res.json({ uploads });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/posts — create a new post
router.post("/", authenticate, async (req, res) => {
  // use authenticate: only logged-in users can create posts
  try {
    await ensurePostPublishedAtColumn();
    await ensurePostAttachmentSchema();
    const { title, content, topic, is_anonymous } = req.body;
    const attachments: PendingPostAttachment[] = Array.isArray(
      req.body.attachments,
    )
      ? req.body.attachments
      : [];

    if (!title || !topic) {
      return res.status(400).json({ error: "Title and topic are required" });
    }

    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return res.status(400).json({ error: "You can attach up to 5 files" });
    }

    try {
      attachments.forEach((attachment) => {
        validateAttachmentMetadata(attachment);

        if (!attachment.storage_key.startsWith(`posts/${req.user.id}/`)) {
          throw new Error("Attachment upload key is invalid");
        }
      });

      await Promise.all(
        attachments.map((attachment) =>
          verifyUploadedObject({
            fileSize: attachment.file_size,
            mimeType: attachment.mime_type,
            storageKey: attachment.storage_key,
          }),
        ),
      );
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO posts (user_id, title, content, topic, is_anonymous, published_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [req.user.id, title, content, topic, is_anonymous || false],
      );
      const post = result.rows[0];

      // insert post upload metadata to db
      for (const attachment of attachments) {
        await client.query(
          `INSERT INTO post_attachments (
             id,
             post_id,
             original_name,
             storage_provider,
             storage_key,
             mime_type,
             file_size,
             file_url
           )
           VALUES ($1, $2, $3, 'r2', $4, $5, $6, $7)`,
          [
            randomUUID(),
            post.id,
            attachment.original_name,
            attachment.storage_key,
            attachment.mime_type,
            attachment.file_size,
            attachment.file_url || "",
          ],
        );
      }

      await client.query("COMMIT");
      res.json(post);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/upvote — toggle upvote
router.post("/:id/upvote", authenticate, async (req, res) => {
  try {
    await ensurePostPublishedAtColumn();
    const id = req.params.id as string;
    const userId = req.user.id;

    const existing = await pool.query(
      "SELECT 1 FROM post_upvotes WHERE user_id=$1 AND post_id=$2",
      [userId, id],
    );

    if (existing.rows.length > 0) {
      // already upvoted => remove upvote
      await pool.query(
        "DELETE FROM post_upvotes WHERE user_id=$1 AND post_id=$2",
        [userId, id],
      );
      await pool.query("UPDATE posts SET upvotes = upvotes - 1 WHERE id=$1", [
        id,
      ]); // decreases the upvote count by 1
      res.json({ upvoted: false });
    } else {
      await pool.query("INSERT INTO post_upvotes VALUES ($1, $2)", [
        userId,
        id,
      ]);
      await pool.query("UPDATE posts SET upvotes = upvotes + 1 WHERE id=$1", [
        id,
      ]);

      // send notification to the user whose post is being upvoted
      const notificationTarget = await pool.query(
        `SELECT p.user_id, p.title, u.username AS actor_username
         FROM posts p
         JOIN users u ON u.id = $1
         WHERE p.id = $2`,
        [userId, id],
      );
      const target = notificationTarget.rows[0];

      await createNotification({
        actorId: userId,
        linkPath: `/posts/${id}`,
        message: `${target.actor_username} upvoted your post "${target.title}"`,
        postId: id,
        recipientId: target.user_id,
        type: "post_upvote",
      });

      res.json({ upvoted: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:id — get a single post by its post id
router.get("/:id", async (req, res) => {
  try {
    await ensurePostAttachmentSchema();
    const { id } = req.params;
    const userId = getOptionalUserId(req);
    const params = [id];

    const upvotedSelect = userId
      ? `EXISTS (
          SELECT 1 FROM post_upvotes pu
          WHERE pu.post_id = p.id AND pu.user_id = $${params.push(userId)}
        )`
      : "false";

    const result = await pool.query(
      `SELECT 
        p.*,
        COALESCE(p.published_at, p.created_at) as post_date,
        CASE
          WHEN p.is_anonymous = true THEN 'Anonymous'
          WHEN p.user_id IS NULL THEN '[Deleted user]'
          ELSE u.username
        END as username,
        CASE
          WHEN p.is_anonymous = true THEN NULL
          ELSE u.avatar_url
        END as avatar_url,
        CASE
          WHEN p.is_anonymous = true THEN NULL
          ELSE u.avatar_storage_key
        END as avatar_storage_key,
        ${upvotedSelect} as upvoted
       FROM posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    await saveRecentActivity(userId, "post", id); // for the recent activities part
    
    // loading attachments for a post
    const attachmentsResult = await pool.query(
      `SELECT id, original_name, storage_key, mime_type, file_size, file_url, created_at
       FROM post_attachments
       WHERE post_id = $1
       ORDER BY created_at ASC`,
      [id],
    );
    const post = await addDownloadUrlsToPost({
      ...result.rows[0],
      attachments: attachmentsResult.rows,
    });

    res.json(await addResolvedAvatarUrl(post));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
