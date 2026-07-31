import express from "express";
import { randomUUID } from "crypto";
import authenticate from "../middleware/authenticate";
import { getOptionalAuthenticatedUser } from "../auth/tokens";
import { pool } from "../db";
import { respondWithCaughtError } from "../middleware/errorHandler";
import { saveRecentActivity } from "../utils/recentActivity";
import { addResolvedAvatarUrls } from "../utils/userAvatar";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
  createDownloadUrl,
  createPostAttachmentUploadUrl,
  createSignedDownloadUrl,
  validateAttachmentMetadata,
  verifyUploadedObject,
} from "../utils/r2Storage";

const router = express.Router();

type PendingGroupPostAttachment = {
  file_size: number;
  file_url?: string;
  mime_type: string;
  original_name: string;
  storage_key: string;
};

function getOptionalUserId(req) {
  return getOptionalAuthenticatedUser(req.headers.authorization)?.id ?? null;
}

async function getMembership(groupId: string, userId: string) {
  const result = await pool.query(
    `SELECT gm.role, g.creator_id
     FROM study_groups g
     LEFT JOIN group_members gm
       ON gm.group_id = g.id AND gm.user_id = $2
     WHERE g.id = $1`,
    [groupId, userId],
  );

  return result.rows[0] ?? null;
}

function memberBadges(member) {
  if (member.is_creator) return ["Group Creator", "Admin"];
  return member.role === "admin" ? ["Admin"] : ["Member"];
}

function validateGroupPostAttachment(attachment: {
  file_size: number;
  mime_type: string;
  original_name: string;
}) {
  validateAttachmentMetadata(attachment, {
    maxFileSizeBytes: MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
    maxFileSizeLabel: "15 MB",
  });
}

async function addDownloadUrlsToGroupPost(post) {
  if (!post?.attachments?.length) return post;

  return {
    ...post,
    attachments: await Promise.all(
      post.attachments.map(async (attachment) => ({
        ...attachment,
        file_url:
          post.group_privacy === "private"
            ? await createSignedDownloadUrl(attachment.storage_key)
            : attachment.file_url ||
              (await createDownloadUrl(attachment.storage_key)),
      })),
    ),
  };
}

// GET /api/groups?scope=all|mine
// can filter to see all groups or groups that the user is a member of
router.get("/", async (req, res) => {
  try {
    const { search, scope = "all" } = req.query;
    const userId = getOptionalUserId(req);

    if (scope !== "all" && scope !== "mine") {
      return res.status(400).json({ error: "Group scope must be all or mine" });
    }

    if (scope === "mine" && !userId) {
      return res.status(401).json({ error: "Log in to view your groups" });
    }

    const params: any[] = [];
    const viewerMembershipSelect = userId
      ? `EXISTS (
          SELECT 1 FROM group_members viewer_gm
          WHERE viewer_gm.group_id = g.id
            AND viewer_gm.user_id = $${params.push(userId)}
        )`
      : "FALSE";

    let query = `
      SELECT
        g.*,
        u.username AS creator_name,
        COUNT(gm.user_id) AS member_count,
        ${viewerMembershipSelect} AS is_member
      FROM study_groups g
      LEFT JOIN users u ON g.creator_id = u.id
      LEFT JOIN group_members gm ON gm.group_id = g.id
      WHERE 1=1
    `;

    if (scope === "mine") {
      params.push(userId);
      query += `
        AND EXISTS (
          SELECT 1 FROM group_members mine_gm
          WHERE mine_gm.group_id = g.id
            AND mine_gm.user_id = $${params.length}
        )
      `;
    }

    if (typeof search === "string" && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += `
        AND (
          g.name ILIKE $${params.length}
          OR g.module_code ILIKE $${params.length}
        )
      `;
    }

    query += `
      GROUP BY g.id, u.username
      ORDER BY g.created_at DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// GET /api/groups/:id/posts — group feed; private posts are member-only.
router.get("/:id/posts", async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const userId = getOptionalUserId(req);
    const params: any[] = [groupId];
    const upvotedSelect = userId
      ? `EXISTS (
          SELECT 1 FROM post_upvotes pu
          WHERE pu.post_id = p.id AND pu.user_id = $${params.push(userId)}
        )`
      : "FALSE";
    const memberSelect = userId
      ? `EXISTS (
          SELECT 1 FROM group_members viewer_gm
          WHERE viewer_gm.group_id = p.group_id
            AND viewer_gm.user_id = $${params.push(userId)}
        )`
      : "FALSE";

    const result = await pool.query(
      `SELECT
         p.*,
         COALESCE(p.published_at, p.created_at) AS post_date,
         u.username,
         u.avatar_url,
         u.avatar_storage_key,
         COUNT(DISTINCT c.id) AS comment_count,
         COUNT(DISTINCT pa.id) AS attachment_count,
         COALESCE(
           jsonb_agg(
             DISTINCT jsonb_build_object(
               'id', pa.id,
               'original_name', pa.original_name,
               'storage_key', pa.storage_key,
               'mime_type', pa.mime_type,
               'file_size', pa.file_size,
               'file_url', pa.file_url
             )
           ) FILTER (WHERE pa.id IS NOT NULL),
           '[]'::jsonb
         ) AS attachments,
         ${upvotedSelect} AS upvoted,
         ${memberSelect} AS can_comment
       FROM posts p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN comments c ON c.post_id = p.id
       LEFT JOIN post_attachments pa ON pa.post_id = p.id
       WHERE p.group_id = $1
         AND (
           p.group_privacy = 'public'
           OR ${memberSelect}
         )
       GROUP BY p.id, u.username, u.avatar_url, u.avatar_storage_key
       ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC`,
      params,
    );

    const posts = await Promise.all(
      result.rows.map(addDownloadUrlsToGroupPost),
    );
    res.json(await addResolvedAvatarUrls(posts));
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// POST /api/groups/:id/posts/attachments/presign — admins only, 15 MB each.
router.post(
  "/:id/posts/attachments/presign",
  authenticate,
  async (req, res) => {
    try {
      const groupId = req.params.id as string;
      const files = Array.isArray(req.body.files) ? req.body.files : [];
      const membership = await getMembership(groupId, req.user.id);

      if (!membership) {
        return res.status(404).json({ error: "Group not found" });
      }

      if (
        membership.role !== "admin" &&
        String(membership.creator_id) !== String(req.user.id)
      ) {
        return res
          .status(403)
          .json({ error: "Only group admins can upload post files" });
      }

      if (files.length === 0) {
        return res.status(400).json({ error: "No files selected" });
      }

      if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return res.status(400).json({
          error: `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files`,
        });
      }

      const uploads = await Promise.all(
        files.map(
          async (file: {
            client_id?: string;
            file_size: number;
            mime_type: string;
            original_name: string;
          }) => {
            validateGroupPostAttachment(file);
            const upload = await createPostAttachmentUploadUrl({
              mimeType: file.mime_type,
              originalName: file.original_name,
              userId: req.user.id,
            });

            return {
              client_id: file.client_id,
              file_size: file.file_size,
              file_url: upload.fileUrl,
              mime_type: file.mime_type,
              original_name: file.original_name,
              storage_key: upload.storageKey,
              upload_url: upload.uploadUrl,
            };
          },
        ),
      );

      res.json({ uploads });
    } catch (err) {
      respondWithCaughtError(req, res, err, { statusCode: 400 });
    }
  },
);

// POST /api/groups/:id/posts — admins only; group authors are never anonymous.
router.post("/:id/posts", authenticate, async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const title = req.body.title?.trim();
    const content = req.body.content?.trim() || "";
    const privacy = req.body.privacy;
    const attachments: PendingGroupPostAttachment[] = Array.isArray(
      req.body.attachments,
    )
      ? req.body.attachments
      : [];

    if (!title) {
      return res.status(400).json({ error: "Post title is required" });
    }

    if (!["public", "private"].includes(privacy)) {
      return res
        .status(400)
        .json({ error: "Choose public or group-only privacy" });
    }

    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return res.status(400).json({
        error: `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files`,
      });
    }

    const membership = await getMembership(groupId, req.user.id);

    if (!membership) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (
      membership.role !== "admin" &&
      String(membership.creator_id) !== String(req.user.id)
    ) {
      return res.status(403).json({ error: "Only group admins can post" });
    }

    try {
      attachments.forEach((attachment) => {
        validateGroupPostAttachment(attachment);

        if (!attachment.storage_key.startsWith(`posts/${req.user.id}/`)) {
          throw new Error("Attachment upload key is invalid");
        }
      });

      await Promise.all(
        attachments.map((attachment) =>
          verifyUploadedObject({
            fileSize: attachment.file_size,
            mimeType: attachment.mime_type,
            storageKey: attachment.storage_key,
          }),
        ),
      );
    } catch (err) {
      return respondWithCaughtError(req, res, err, { statusCode: 400 });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO posts (
           user_id,
           title,
           content,
           topic,
           is_anonymous,
           published_at,
           group_id,
           group_privacy
         )
         VALUES ($1, $2, $3, 'Group', FALSE, NOW(), $4, $5)
         RETURNING *`,
        [req.user.id, title, content, groupId, privacy],
      );
      const post = result.rows[0];

      for (const attachment of attachments) {
        await client.query(
          `INSERT INTO post_attachments (
             id,
             post_id,
             original_name,
             storage_provider,
             storage_key,
             mime_type,
             file_size,
             file_url
           )
           VALUES ($1, $2, $3, 'r2', $4, $5, $6, $7)`,
          [
            randomUUID(),
            post.id,
            attachment.original_name,
            attachment.storage_key,
            attachment.mime_type,
            attachment.file_size,
            privacy === "public" ? attachment.file_url || "" : "",
          ],
        );
      }

      await client.query("COMMIT");
      res.status(201).json(post);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// PATCH /api/groups/:id/members/:userId/admin — promote or demote a member.
router.patch("/:id/members/:userId/admin", authenticate, async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const isAdmin = req.body.is_admin;

    if (typeof isAdmin !== "boolean") {
      return res.status(400).json({ error: "is_admin must be true or false" });
    }

    const actorMembership = await getMembership(groupId, req.user.id);

    if (!actorMembership) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (
      actorMembership.role !== "admin" &&
      String(actorMembership.creator_id) !== String(req.user.id)
    ) {
      return res
        .status(403)
        .json({ error: "Only group admins can manage admin badges" });
    }

    if (String(actorMembership.creator_id) === String(targetUserId)) {
      return res
        .status(400)
        .json({ error: "The group creator must remain an admin" });
    }

    const result = await pool.query(
      `UPDATE group_members
       SET role = $3
       WHERE group_id = $1 AND user_id = $2
       RETURNING group_id, user_id, role`,
      [groupId, targetUserId, isAdmin ? "admin" : "member"],
    ); // update in db

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Group member not found" });
    }

    res.json({
      ...result.rows[0],
      badges: isAdmin ? ["Admin"] : ["Member"],
    });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// DELETE /api/groups/:id/members/:userId — admins can remove anyone except creator.
router.delete("/:id/members/:userId", authenticate, async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const actorMembership = await getMembership(groupId, req.user.id);

    if (!actorMembership) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (
      actorMembership.role !== "admin" &&
      String(actorMembership.creator_id) !== String(req.user.id)
    ) {
      return res
        .status(403)
        .json({ error: "Only group admins can remove members" });
    }

    if (String(actorMembership.creator_id) === String(targetUserId)) {
      return res
        .status(400)
        .json({ error: "The group creator cannot be removed" });
    }

    const result = await pool.query(
      `DELETE FROM group_members
       WHERE group_id = $1 AND user_id = $2
       RETURNING user_id`,
      [groupId, targetUserId],
    ); // update to db

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Group member not found" });
    }

    res.json({ removed: true, user_id: result.rows[0].user_id });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// GET /api/groups/:id
router.get("/:id", async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const userId = getOptionalUserId(req);

    const groupResult = await pool.query(
      `SELECT g.*, u.username AS creator_name
       FROM study_groups g
       LEFT JOIN users u ON g.creator_id = u.id
       WHERE g.id = $1`,
      [groupId],
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const membersResult = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.avatar_url,
         u.avatar_storage_key,
         gm.joined_at,
         gm.role,
         (u.id = g.creator_id) AS is_creator
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       JOIN study_groups g ON g.id = gm.group_id
       WHERE gm.group_id = $1
       ORDER BY
         (u.id = g.creator_id) DESC,
         (gm.role = 'admin') DESC,
         gm.joined_at ASC`,
      [groupId],
    );

    const group = groupResult.rows[0];
    const members = (await addResolvedAvatarUrls(membersResult.rows)).map(
      (member) => ({
        ...member,
        badges: memberBadges(member),
      }),
    );
    const viewer = userId
      ? members.find((member) => String(member.id) === String(userId))
      : null;
    const isAdmin =
      Boolean(viewer?.role === "admin") ||
      String(group.creator_id) === String(userId);

    await saveRecentActivity(userId, "group", groupId);

    res.json({
      group,
      members,
      viewer: {
        can_post: isAdmin,
        is_admin: isAdmin,
        is_member: Boolean(viewer),
      },
    });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// POST /api/groups — create group and make creator an admin atomically.
router.post("/", authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const name = req.body.name?.trim();
    const moduleCode = req.body.module_code?.trim() || null;
    const description = req.body.description?.trim() || null;

    if (!name) {
      return res.status(400).json({ error: "Please name your group" });
    }

    if (moduleCode && moduleCode.length > 20) {
      return res.status(400).json({
        error: "Module code must be 20 characters or fewer, e.g. MA1521.",
      });
    }

    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO study_groups (name, module_code, description, creator_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, moduleCode, description, req.user.id],
    );
    const group = result.rows[0];

    await client.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [group.id, req.user.id],
    );
    await client.query("COMMIT");

    res.status(201).json(group);
  } catch (err) {
    await client.query("ROLLBACK");
    respondWithCaughtError(req, res, err);
  } finally {
    client.release();
  }
});

// POST /api/groups/:id/join — join, or leave when already a member.
router.post("/:id/join", authenticate, async (req, res) => {
  try {
    const groupId = req.params.id as string;
    const userId = req.user.id;
    const groupResult = await pool.query(
      "SELECT creator_id FROM study_groups WHERE id = $1",
      [groupId],
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const existing = await pool.query(
      `SELECT role
       FROM group_members
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );

    if (existing.rows.length > 0) {
      if (String(groupResult.rows[0].creator_id) === String(userId)) {
        return res
          .status(400)
          .json({ error: "The group creator cannot leave the group" });
      }

      await pool.query(
        "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
        [groupId, userId],
      );
      return res.json({ joined: false });
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [groupId, userId],
    );
    res.json({ joined: true });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

export default router;
