import express from "express";
const router = express.Router();
import jwt from "jsonwebtoken";
import authenticate from "../middleware/authenticate";
import { saveRecentActivity } from "../utils/recentActivity";

import { pool } from "../db";
import { createNotification } from "../utils/notificationSchema";
import { addResolvedAvatarUrl, addResolvedAvatarUrls } from "../utils/userAvatar";

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

// POST /api/posts — create a new post
router.post("/", authenticate, async (req, res) => {
  // use authenticate: only logged-in users can create posts
  try {
    await ensurePostPublishedAtColumn();
    const { title, content, topic, is_anonymous } = req.body;

    if (!title || !topic) {
      return res.status(400).json({ error: "Title and topic are required" });
    }

    const result = await pool.query(
      `INSERT INTO posts (user_id, title, content, topic, is_anonymous, published_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [req.user.id, title, content, topic, is_anonymous || false],
    );

    res.json(result.rows[0]);
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
    res.json(await addResolvedAvatarUrl(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
