import type { Pool, PoolClient } from "pg";
import { pool } from "../db";

// an object with Pool.query method or PoolClient.query method
type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type GroupPostAccess = {
  group_id: string | null;
  group_privacy: "private" | "public" | null;
  is_member: boolean;
};

// checks whether a post belongs to a group and whether current user is a member of that group
export async function getGroupPostAccess(
  postId: string,
  userId: string | null,
  database: Queryable = pool,
): Promise<GroupPostAccess | null> {
  const result = await database.query(
    `SELECT
       p.group_id,
       p.group_privacy,
       CASE
         WHEN $2::uuid IS NULL OR p.group_id IS NULL THEN FALSE
         ELSE EXISTS (
           SELECT 1
           FROM group_members gm
           WHERE gm.group_id = p.group_id AND gm.user_id = $2
         )
       END AS is_member
     FROM posts p
     WHERE p.id = $1`,
    [postId, userId],
  );

  return result.rows[0] ?? null;
}

export function canViewPost(access: GroupPostAccess | null) {
  if (!access) return false;
  if (!access.group_id) return true;
  return access.group_privacy === "public" || access.is_member;
}

export function canCommentOnPost(access: GroupPostAccess | null) {
  if (!access) return false;
  if (!access.group_id) return true;
  return access.is_member;
}

export function postLinkPath(
  postId: string,
  groupId: string | null | undefined,
) {
  return groupId
    ? `/groups/${groupId}?post=${postId}`
    : `/posts/${postId}`;
}
