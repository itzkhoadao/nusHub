import { randomUUID } from "crypto";
import { pool } from "../db";
import { getSocketServer } from "../socket";
import { getErrorMessage } from "../types";

export type NotificationType =
  | "comment_reply"
  | "comment_upvote"
  | "post_comment"
  | "post_upvote";

type CreateNotificationInput = {
  actorId: string;
  commentId?: string | null;
  linkPath: string;
  message: string;
  postId?: string | null;
  recipientId?: string | null;
  type: NotificationType;
}; // info needed to create a noti

let notificationSchemaReady: Promise<void> | null = null;

async function ensureNotificationSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
      comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      link_path TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
      ON notifications(recipient_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_at
      ON notifications(recipient_id, read_at)
  `);
}

export function ensureNotificationSchemaOnce() {
  // at first, null => run ensureNotificationSchema(), later reuse the same Promise
  notificationSchemaReady ??= ensureNotificationSchema();
  return notificationSchemaReady;
}

export async function createNotification({
  actorId,
  commentId = null,
  linkPath,
  message,
  postId = null,
  recipientId,
  type,
}: CreateNotificationInput) {
  if (!recipientId || recipientId === actorId) {
    return null;
  }

  try {
    await ensureNotificationSchemaOnce();

    const result = await pool.query(
      `INSERT INTO notifications (
         id,
         recipient_id,
         actor_id,
         type,
         post_id,
         comment_id,
         message,
         link_path
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        randomUUID(),
        recipientId,
        actorId,
        type,
        postId,
        commentId,
        message,
        linkPath,
      ],
    ); // insert into notifications table in db
    const notification = result.rows[0];

    // emit real-time notification
    getSocketServer()?.to(`user:${recipientId}`).emit("notification:new", notification);
    return notification;
  } catch (err) {
    console.error("Failed to create notification:", getErrorMessage(err));
    return null;
  }
}
