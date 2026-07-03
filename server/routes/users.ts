import express from "express";
const router = express.Router();

import authenticate from "../middleware/authenticate";

import { pool } from "../db";
// get the user's profile
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
      user: userResult.rows[0],
      posts: postsResult.rows,
      comments: commentsResult.rows,
      groups: groupsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get a public profile by user id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get public user info
    const userResult = await pool.query(
      `SELECT id, username, email, avatar_url, created_at
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
      user: userResult.rows[0],
      posts: postsResult.rows,
      comments: commentsResult.rows,
      groups: groupsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
