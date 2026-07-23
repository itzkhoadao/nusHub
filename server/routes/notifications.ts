import express from "express";
import authenticate from "../middleware/authenticate";
import { pool } from "../db";
import { respondWithCaughtError } from "../middleware/errorHandler";
import { ensureNotificationSchemaOnce } from "../utils/notificationSchema";

const router = express.Router();

// LOAD NOTIFICATIONS
router.get("/", authenticate, async (req, res) => {
  try {
    await ensureNotificationSchemaOnce();

    // fetch notifications and unread count at the same time
    const [notificationsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           n.*,
           actor.username AS actor_username
         FROM notifications n
         LEFT JOIN users actor ON actor.id = n.actor_id
         WHERE n.recipient_id = $1
         ORDER BY n.created_at DESC
         LIMIT 30`,
        [req.user.id],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM notifications
         WHERE recipient_id = $1 AND read_at IS NULL`,
        [req.user.id],
      ),
    ]);

    res.json({
      notifications: notificationsResult.rows,
      unread_count: countResult.rows[0]?.unread_count || 0,
    }); // return these 2 information
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// ONLY GET UNREAD COUNT (USED WHEN NO NEED TO LOAD WHOLE NOTI LIST)
router.get("/unread-count", authenticate, async (req, res) => {
  try {
    await ensureNotificationSchemaOnce();

    const result = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [req.user.id],
    );

    res.json({ unread_count: result.rows[0]?.unread_count || 0 });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// marks every currently unread notification as read
router.post("/read-all", authenticate, async (req, res) => {
  try {
    await ensureNotificationSchemaOnce();

    await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [req.user.id],
    ); // update read_at

    res.json({ ok: true });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

export default router;
