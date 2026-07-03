import express from "express";
const router = express.Router();
import authenticate from "../middleware/authenticate";
import { getRecentActivity, saveRecentActivity } from "../utils/recentActivity"; // import backend utility functions

import { pool } from "../db";
async function itemExists(type, id) {
  const table = type === "post" ? "posts" : "study_groups"; // choose which table to search in
  const result = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  return result.rows.length > 0;
}

// GET /api/recent
// get the 3 most recently opened posts/groups for the logged-in user
router.get("/", authenticate, async (req, res) => {
  try {
    res.json(await getRecentActivity(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recent
// save one recently opened post/group for the logged-in user
router.post("/", authenticate, async (req, res) => {
  try {
    const { type, id } = req.body;

    if (!["post", "group"].includes(type) || !id) {
      return res.status(400).json({ error: "Recent item is invalid" });
    } // only items of type post and group are accepted

    const exists = await itemExists(type, id);

    if (!exists) {
      return res.status(404).json({ error: "Recent item not found" });
    }

    await saveRecentActivity(req.user.id, type, id);
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
