import express from "express";
import authenticate from "../middleware/authenticate";
import { pool } from "../db";
import { respondWithCaughtError } from "../middleware/errorHandler";

const router = express.Router();
const REASONS = new Set([
  "harassment",
  "hate",
  "threat",
  "sexual",
  "privacy",
  "self_harm",
  "spam",
  "other",
]);
const AFFECTED_PARTIES = new Set(["me", "someone_else", "community"]);

router.post("/", authenticate, async (req, res) => {
  try {
    const {
      target_type,
      target_id,
      reason,
      affected_party,
      details = "",
      immediate_risk = false,
    } = req.body;

    // validate request body
    if (!["post", "comment"].includes(target_type)) {
      return res.status(400).json({ error: "Invalid report target" });
    }
    if (!REASONS.has(reason)) {
      return res.status(400).json({ error: "Choose a valid report reason" });
    }
    if (!AFFECTED_PARTIES.has(affected_party)) {
      return res.status(400).json({ error: "Tell us who is affected" });
    }
    if (typeof details !== "string" || details.length > 1500) {
      return res
        .status(400)
        .json({ error: "Report details must be 1,500 characters or fewer" });
    }
    if (reason === "other" && !details.trim()) {
      return res
        .status(400)
        .json({ error: "Add a short explanation for this report" });
    }

    const target =
      target_type === "post"
        ? await pool.query(
            `SELECT p.id, p.id AS post_id, NULL::uuid AS comment_id, p.user_id,
                    CONCAT(p.title, E'\n\n', COALESCE(p.content, '')) AS snapshot
             FROM posts p
             WHERE p.id = $1`,
            [target_id],
          )
        : await pool.query(
            `SELECT c.id, c.post_id, c.id AS comment_id, c.user_id,
                    c.content AS snapshot
             FROM comments c
             WHERE c.id = $1`,
            [target_id],
          ); // target post/comment/reply being reported

    if (target.rowCount === 0) {
      return res.status(404).json({ error: "This content is no longer available" });
    }

    const item = target.rows[0];
    const result = await pool.query(
      `INSERT INTO content_reports (
         reporter_id,
         reported_user_id,
         post_id,
         comment_id,
         target_type,
         reason,
         affected_party,
         details,
         immediate_risk,
         content_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, status, created_at`,
      [
        req.user.id,
        item.user_id,
        item.post_id,
        item.comment_id,
        target_type,
        reason,
        affected_party,
        details.trim() || null,
        Boolean(immediate_risk),
        item.snapshot,
      ],
    ); // insert into report db

    res.status(201).json(result.rows[0]);
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

export default router;
