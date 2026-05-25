const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const authenticate = require("../middleware/authenticate");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// get the user's profile when logging in
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user info
    const userResult = await pool.query(
      `SELECT id, username, email, avatar_url, created_at
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

    res.json({
      user: userResult.rows[0],
      posts: postsResult.rows,
      comments: commentsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
