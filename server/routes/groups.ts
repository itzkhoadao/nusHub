import express from "express";
const router = express.Router();
import jwt from "jsonwebtoken";
import authenticate from "../middleware/authenticate";
import { saveRecentActivity } from "../utils/recentActivity";

import { pool } from "../db";
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

// get all study groups
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;

    // get list of study groups to display
    let query = `
        SELECT 
            g.*,
            u.username as creator_name,
            COUNT(gm.user_id) as member_count
        FROM study_groups g
        LEFT JOIN users u ON g.creator_id = u.id
        LEFT JOIN group_members gm ON gm.group_id = g.id
        WHERE 1=1
        `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (g.name ILIKE $${params.length} OR g.module_code ILIKE $${params.length})`;
    }

    query += ` GROUP BY g.id, u.username ORDER BY g.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get a single group using id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getOptionalUserId(req);

    // get group info
    const groupResult = await pool.query(
      `SELECT g.*, u.username as creator_name
            FROM study_groups g
            LEFT JOIN users u ON g.creator_id = u.id
            WHERE g.id = $1`,
      [id],
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found!" });
    }

    // get members
    const membersResult = await pool.query(
      `SELECT u.id, u.username, gm.joined_at
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = $1
            ORDER BY gm.joined_at ASC`,
      [id],
    );

    await saveRecentActivity(userId, "group", id); // save for the recent activities part

    res.json({
      group: groupResult.rows[0],
      members: membersResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// post: create a new group
router.post("/", authenticate, async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const module_code = req.body.module_code?.trim() || null;
    const description = req.body.description?.trim() || null;

    if (!name) {
      return res.status(400).json({ error: "Please name your group!" });
    }

    if (module_code && module_code.length > 20) {
      return res.status(400).json({
        error: "Module code must be 20 characters or fewer, e.g. MA1521.",
      });
    }

    // create the group
    const result = await pool.query(
      `INSERT INTO study_groups (name, module_code, description, creator_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
      [name, module_code, description, req.user.id],
    );

    const group = result.rows[0];

    // automatically add creator as a user
    await pool.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
      [group.id, req.user.id],
    );

    res.json(group);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// post: join or leave a group
router.post("/:id/join", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await pool.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (existing.rows.length > 0) {
      // already a member => leave the group
      await pool.query(
        `DELETE FROM group_members WHERE group_id=$1 AND user_id=$2`,
        [id, userId],
      );
      res.json({ joined: false });
    } else {
      // not a member => join the group
      await pool.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
        [id, userId],
      );
      res.json({ joined: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
