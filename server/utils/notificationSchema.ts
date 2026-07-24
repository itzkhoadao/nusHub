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
