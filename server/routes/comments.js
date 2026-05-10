const express = require("express");
const router = express.Router({ mergeParams: true });
const { Pool } = require("pg");
const authenticate = require("../middleware/authenticate");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET /api/posts/:postId/comments — get all comments, display ones with the most upvotes first
router.get("/", async (req, res) => {
  try {
    const { postId } = req.params;

    const result = await pool.query(
      `SELECT 
        c.*,
        CASE
          WHEN c.is_anonymous = true THEN 'Anonymous'
          WHEN c.user_id IS NULL THEN '[Deleted user]'
          ELSE u.username
        END as username
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.upvotes DESC, c.created_at ASC`,
      [postId],
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:postId/comments — post a comment to the post
router.post("/", authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, is_anonymous } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, content, is_anonymous)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [postId, req.user.id, content, is_anonymous || false],
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

module.exports = router;
