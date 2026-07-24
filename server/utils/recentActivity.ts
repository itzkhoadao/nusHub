import { pool } from "../db";
import { getErrorMessage } from "../types";

export async function saveRecentActivity(
  userId: string | null,
  type: "post" | "group",
  id: string,
) {
  if (!userId || !["post", "group"].includes(type) || !id) {
    return;
  } // only allow items of type post and group

  try {
    await pool.query(
      `
        INSERT INTO recent_activity (user_id, item_type, item_id, accessed_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, item_type, item_id)
        DO UPDATE SET accessed_at = NOW()
      `,
      [userId, type, id],
    ); // add new item to db

    await pool.query(
      `
        DELETE FROM recent_activity
        WHERE user_id = $1
          AND (item_type, item_id) NOT IN (
            SELECT item_type, item_id
            FROM recent_activity
            WHERE user_id = $1
            ORDER BY accessed_at DESC
            LIMIT 3
          )
      `,
      [userId],
    ); // delete oldest item in db
  } catch (err) {
    console.error("Failed to save recent activity:", getErrorMessage(err));
  }
}

export async function getRecentActivity(userId: string) {
  if (!userId) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          'post' AS type,
          p.id,
          p.title,
          '/posts/' || p.id AS path,
          ra.accessed_at
        FROM recent_activity ra
        JOIN posts p ON p.id = ra.item_id
        WHERE ra.user_id = $1 AND ra.item_type = 'post'

        UNION ALL

        SELECT
          'group' AS type,
          g.id,
          g.name AS title,
          '/groups/' || g.id AS path,
          ra.accessed_at
        FROM recent_activity ra
        JOIN study_groups g ON g.id = ra.item_id
        WHERE ra.user_id = $1 AND ra.item_type = 'group'
      ) recent_items
      ORDER BY accessed_at DESC
      LIMIT 3
    `,
    [userId],
  ); // get 3 most recent activities

  return result.rows;
}
