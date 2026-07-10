import express from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import authenticate from "../middleware/authenticate";
import { getSocketServer } from "../socket";
import { getErrorMessage } from "../types";
import { ensureChatSchema } from "../utils/chatSchema";

const router = express.Router();

// ensure conversation tables are created only once
// first request runs ensureChatSchema(), later reuse the same Promise
let chatSchemaReady: Promise<void> | null = null;

function ensureChatSchemaOnce() {
  chatSchemaReady ??= ensureChatSchema();
  return chatSchemaReady;
}

// creates a unique key for a direct chat between 2 users
function createDirectKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join(":");
}

// check if a particular user is in a particular conversation
async function ensureConversationParticipant(
  conversationId: string,
  userId: string,
) {
  const result = await pool.query(
    `SELECT 1
     FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );

  return result.rows.length > 0;
}

// adds both users into the DIRECT conversation
async function addDirectParticipants(
  client: PoolClient,
  conversationId: string,
  currentUserId: string,
  otherUserId: string,
) {
  await client.query(
    `INSERT INTO conversation_participants (conversation_id, user_id)
     VALUES ($1, $2), ($1, $3)
     ON CONFLICT (conversation_id, user_id) DO NOTHING`,
    [conversationId, currentUserId, otherUserId],
  );
}

// gets conversation info to return to frontend
// returns info like conversation id, conversation type, other user info, last message, last sender
// only return this conversation if the current user is a participant
// returns the newest non-deleted message of the conversation
async function getConversationSummary(conversationId: string, userId: string) {
  const result = await pool.query(
    `SELECT
       c.id,
       c.type,
       c.created_at,
       c.updated_at,
       other_user.id AS other_user_id,
       other_user.username AS other_username,
       other_user.email AS other_email,
       other_user.avatar_url AS other_avatar_url,
       last_message.id AS last_message_id,
       last_message.body AS last_message_body,
       last_message.created_at AS last_message_created_at,
       last_sender.id AS last_sender_id,
       last_sender.username AS last_sender_username,
       COALESCE(unread_state.unread_count, 0)::int AS unread_count
     FROM conversations c
     JOIN conversation_participants current_participant
       ON current_participant.conversation_id = c.id
      AND current_participant.user_id = $2
     LEFT JOIN conversation_participants other_participant
       ON other_participant.conversation_id = c.id
      AND other_participant.user_id <> $2
     LEFT JOIN users other_user
       ON other_user.id = other_participant.user_id
     LEFT JOIN LATERAL (
       SELECT id, sender_id, body, created_at
       FROM messages
       WHERE conversation_id = c.id AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
     ) last_message ON true
     LEFT JOIN users last_sender
       ON last_sender.id = last_message.sender_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS unread_count
       FROM messages unread_message
       WHERE unread_message.conversation_id = c.id
         AND unread_message.deleted_at IS NULL
         AND unread_message.sender_id IS DISTINCT FROM $2
         AND (
           current_participant.last_read_at IS NULL
           OR unread_message.created_at > current_participant.last_read_at
         )
     ) unread_state ON true
     WHERE c.id = $1`,
    [conversationId, userId],
  );

  return result.rows[0];
}

async function getMessageById(messageId: string) {
  const result = await pool.query(
    `SELECT
       m.id,
       m.conversation_id,
       m.sender_id,
       u.username AS sender_username,
       u.avatar_url AS sender_avatar_url,
       m.reply_to_message_id,
       reply_message.body AS reply_to_body,
       reply_message.sender_id AS reply_to_sender_id,
       reply_sender.username AS reply_to_sender_username,
       m.body,
       m.created_at,
       m.edited_at,
       m.deleted_at,
       COALESCE(read_state.seen_by_count, 0)::int AS seen_by_count,
       COALESCE(read_state.recipient_count, 0)::int AS recipient_count,
       read_state.last_seen_at,
       CASE
         WHEN COALESCE(read_state.recipient_count, 0) > 0
          AND COALESCE(read_state.seen_by_count, 0) >= read_state.recipient_count
         THEN 'seen'
         ELSE 'sent'
       END AS status
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN messages reply_message
       ON reply_message.id = m.reply_to_message_id
      AND reply_message.deleted_at IS NULL
     LEFT JOIN users reply_sender
       ON reply_sender.id = reply_message.sender_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (
           WHERE cp.user_id IS DISTINCT FROM m.sender_id
             AND cp.last_read_at IS NOT NULL
             AND cp.last_read_at >= m.created_at
         ) AS seen_by_count,
         COUNT(*) FILTER (
           WHERE cp.user_id IS DISTINCT FROM m.sender_id
         ) AS recipient_count,
         MAX(cp.last_read_at) FILTER (
           WHERE cp.user_id IS DISTINCT FROM m.sender_id
             AND cp.last_read_at IS NOT NULL
             AND cp.last_read_at >= m.created_at
         ) AS last_seen_at
       FROM conversation_participants cp
       WHERE cp.conversation_id = m.conversation_id
     ) read_state ON true
     WHERE m.id = $1`,
    [messageId],
  );

  return result.rows[0];
}

// POST /api/conversations/direct/:userId
// finds or creates the one-to-one conversation between the logged-in user and another user.
router.post("/direct/:userId", authenticate, async (req, res) => {
  await ensureChatSchemaOnce();

  const currentUserId = req.user.id;
  const otherUserId = req.params.userId as string;

  if (currentUserId === otherUserId) {
    return res.status(400).json({ error: "You cannot start a chat with yourself" });
  }

  const client = await pool.connect();

  try {
    const otherUserResult = await client.query(
      "SELECT id FROM users WHERE id = $1",
      [otherUserId],
    );

    if (otherUserResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const directKey = createDirectKey(currentUserId, otherUserId);

    await client.query("BEGIN");

    const conversationResult = await client.query(
      `INSERT INTO conversations (type, direct_key)
       VALUES ('direct', $1)
       ON CONFLICT (direct_key)
       DO UPDATE SET updated_at = conversations.updated_at
       RETURNING id`,
      [directKey],
    );

    const conversationId = conversationResult.rows[0].id;
    await addDirectParticipants(
      client,
      conversationId,
      currentUserId,
      otherUserId,
    );

    await client.query("COMMIT");

    const conversation = await getConversationSummary(
      conversationId,
      currentUserId,
    );

    res.json({ conversation });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: getErrorMessage(err) });
  } finally {
    client.release();
  }
});

// GET /api/conversations
// Lists all conversations for the logged-in user, newest activity first.
router.get("/", authenticate, async (req, res) => {
  try {
    await ensureChatSchemaOnce();

    const result = await pool.query(
      `SELECT
         c.id,
         c.type,
         c.created_at,
         c.updated_at,
         other_user.id AS other_user_id,
         other_user.username AS other_username,
         other_user.email AS other_email,
         other_user.avatar_url AS other_avatar_url,
         last_message.id AS last_message_id,
         last_message.body AS last_message_body,
         last_message.created_at AS last_message_created_at,
         last_sender.id AS last_sender_id,
         last_sender.username AS last_sender_username,
         COALESCE(unread_state.unread_count, 0)::int AS unread_count
       FROM conversations c
       JOIN conversation_participants current_participant
         ON current_participant.conversation_id = c.id
        AND current_participant.user_id = $1
       LEFT JOIN conversation_participants other_participant
         ON other_participant.conversation_id = c.id
        AND other_participant.user_id <> $1
       LEFT JOIN users other_user
         ON other_user.id = other_participant.user_id
       LEFT JOIN LATERAL (
         SELECT id, sender_id, body, created_at
         FROM messages
         WHERE conversation_id = c.id AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       ) last_message ON true
       LEFT JOIN users last_sender
         ON last_sender.id = last_message.sender_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread_count
         FROM messages unread_message
         WHERE unread_message.conversation_id = c.id
           AND unread_message.deleted_at IS NULL
           AND unread_message.sender_id IS DISTINCT FROM $1
           AND (
             current_participant.last_read_at IS NULL
             OR unread_message.created_at > current_participant.last_read_at
           )
       ) unread_state ON true
       ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// GET /api/conversations/:id/messages
// Loads message history for a conversation the logged-in user belongs to.
router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    await ensureChatSchemaOnce();

    const id = req.params.id as string;
    const isParticipant = await ensureConversationParticipant(id, req.user.id);

    if (!isParticipant) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const result = await pool.query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         u.username AS sender_username,
         u.avatar_url AS sender_avatar_url,
         m.reply_to_message_id,
         reply_message.body AS reply_to_body,
         reply_message.sender_id AS reply_to_sender_id,
         reply_sender.username AS reply_to_sender_username,
         m.body,
         m.created_at,
         m.edited_at,
         m.deleted_at,
         COALESCE(read_state.seen_by_count, 0)::int AS seen_by_count,
         COALESCE(read_state.recipient_count, 0)::int AS recipient_count,
         read_state.last_seen_at,
         CASE
           WHEN COALESCE(read_state.recipient_count, 0) > 0
            AND COALESCE(read_state.seen_by_count, 0) >= read_state.recipient_count
           THEN 'seen'
           ELSE 'sent'
         END AS status
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN messages reply_message
         ON reply_message.id = m.reply_to_message_id
        AND reply_message.deleted_at IS NULL
       LEFT JOIN users reply_sender
         ON reply_sender.id = reply_message.sender_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (
             WHERE cp.user_id IS DISTINCT FROM m.sender_id
               AND cp.last_read_at IS NOT NULL
               AND cp.last_read_at >= m.created_at
           ) AS seen_by_count,
           COUNT(*) FILTER (
             WHERE cp.user_id IS DISTINCT FROM m.sender_id
           ) AS recipient_count,
           MAX(cp.last_read_at) FILTER (
             WHERE cp.user_id IS DISTINCT FROM m.sender_id
               AND cp.last_read_at IS NOT NULL
               AND cp.last_read_at >= m.created_at
           ) AS last_seen_at
         FROM conversation_participants cp
         WHERE cp.conversation_id = m.conversation_id
       ) read_state ON true
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [id],
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// POST /api/conversations/:id/read
// Marks the current user's read position in a conversation and notifies other participants
router.post("/:id/read", authenticate, async (req, res) => {
  try {
    await ensureChatSchemaOnce(); // ensure chat tables exist

    const id = req.params.id as string; // get conversation id
    const isParticipant = await ensureConversationParticipant(id, req.user.id);

    if (!isParticipant) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const result = await pool.query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING conversation_id, user_id, last_read_at`,
      [id, req.user.id],
    ); // update conversation's last_read_at

    // frontend receives this as MessageReadReceipt
    const readReceipt = result.rows[0];

    const participants = await pool.query(
      `SELECT user_id
       FROM conversation_participants
       WHERE conversation_id = $1 AND user_id <> $2`,
      [id, req.user.id],
    ); // elects everyone in the conversation except current user

    const io = getSocketServer();
    participants.rows.forEach((participant) => {
      io?.to(`user:${participant.user_id}`).emit("message:read", readReceipt);
    }); // emits "message:read" event to every other users

    res.json(readReceipt);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// POST /api/conversations/:id/messages
// Sends a message by saving it to the database.
router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    await ensureChatSchemaOnce();

    const id = req.params.id as string;
    const body = req.body.body?.trim();

    // the message that this message is replying to
    const replyToMessageId = req.body.reply_to_message_id || null;

    if (!body) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const isParticipant = await ensureConversationParticipant(id, req.user.id);

    if (!isParticipant) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (replyToMessageId) {
      const replyTarget = await pool.query(
        `SELECT 1
         FROM messages
         WHERE id = $1
           AND conversation_id = $2
           AND deleted_at IS NULL`,
        [replyToMessageId, id],
      ); // find the message that this message is replying to

      if (replyTarget.rows.length === 0) { // if not found, return error right here
        return res.status(400).json({ error: "Reply target is invalid" });
      }
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, reply_to_message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, req.user.id, body, replyToMessageId],
    );
    const messageId = result.rows[0].id;

    await pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [id],
    );

    await pool.query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [id, req.user.id],
    );

    const message = await getMessageById(messageId); // the message being sent

    const participants = await pool.query(
      `SELECT user_id
       FROM conversation_participants
       WHERE conversation_id = $1`,
      [id],
    );

    const io = getSocketServer(); // get current socket server
    participants.rows.forEach((participant) => {
      io?.to(`user:${participant.user_id}`).emit("message:new", message);
    }); // send a message:new event to this user's active socket connections

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

export default router;
