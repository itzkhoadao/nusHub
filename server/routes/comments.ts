import express from "express";
const router = express.Router({ mergeParams: true });
import jwt from "jsonwebtoken";
import authenticate from "../middleware/authenticate";

import { pool } from "../db";
import { addResolvedAvatarUrls } from "../utils/userAvatar";
async function ensureCommentRepliesColumn() {
  await pool.query(`
    ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE
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

// GET /api/posts/:postId/comments — get all comments, display ones with the most upvotes first
router.get("/", async (req, res) => {
  try {
    await ensureCommentRepliesColumn();

    const postId = (req.params as any).postId as string;
    const userId = getOptionalUserId(req);
    const params = [postId];

    const upvotedSelect = userId
      ? `EXISTS (
          SELECT 1 FROM comment_upvotes cu
          WHERE cu.comment_id = c.id AND cu.user_id = $${params.push(userId)}
        )`
      : "false";

    const result = await pool.query(
      `SELECT 
        c.*,
        CASE
          WHEN c.is_anonymous = true THEN 'Anonymous'
          WHEN c.user_id IS NULL THEN '[Deleted user]'
          ELSE u.username
        END as username,
        CASE
          WHEN c.is_anonymous = true THEN NULL
          ELSE u.avatar_url
        END as avatar_url,
        CASE
          WHEN c.is_anonymous = true THEN NULL
          ELSE u.avatar_storage_key
        END as avatar_storage_key,
        ${upvotedSelect} as upvoted
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY
        CASE WHEN c.parent_comment_id IS NULL THEN c.upvotes ELSE 0 END DESC,
        c.created_at ASC`,
      params,
    );

    res.json(await addResolvedAvatarUrls(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:postId/comments — post a comment to the post
router.post("/", authenticate, async (req, res) => {
  try {
    await ensureCommentRepliesColumn();

    const postId = (req.params as any).postId as string;
    const { content, is_anonymous, parent_comment_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    if (parent_comment_id) {
      const parentResult = await pool.query(
        `SELECT 1 FROM comments WHERE id = $1 AND post_id = $2`,
        [parent_comment_id, postId],
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: "Reply target is invalid" });
      }
    }

    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, content, is_anonymous, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [postId, req.user.id, content, is_anonymous || false, parent_comment_id || null],
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:postId/comments/:commentId/upvote — toggle upvote on a comment
router.post("/:commentId/upvote", authenticate, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const existing = await pool.query(
      "SELECT 1 FROM comment_upvotes WHERE user_id=$1 AND comment_id=$2",
      [userId, commentId],
    );

    if (existing.rows.length > 0) {
      // Already upvoted — remove it
      await pool.query(
        "DELETE FROM comment_upvotes WHERE user_id=$1 AND comment_id=$2",
        [userId, commentId],
      );
      await pool.query(
        "UPDATE comments SET upvotes = upvotes - 1 WHERE id=$1",
        [commentId],
      ); // update upvote count
      res.json({ upvoted: false });
    } else {
      // Not yet upvoted — add it
      await pool.query("INSERT INTO comment_upvotes VALUES ($1, $2)", [
        userId,
        commentId,
      ]);
      await pool.query(
        "UPDATE comments SET upvotes = upvotes + 1 WHERE id=$1",
        [commentId],
      ); // update upvote count
      res.json({ upvoted: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
