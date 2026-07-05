import express from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import authenticate from "../middleware/authenticate";
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
       last_sender.username AS last_sender_username
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
     WHERE c.id = $1`,
    [conversationId, userId],
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
         last_sender.username AS last_sender_username
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
         m.body,
         m.created_at,
         m.edited_at,
         m.deleted_at
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
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

// POST /api/conversations/:id/messages
// Sends a message by saving it to the database.
router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    await ensureChatSchemaOnce();

    const id = req.params.id as string;
    const body = req.body.body?.trim();

    if (!body) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const isParticipant = await ensureConversationParticipant(id, req.user.id);

    if (!isParticipant) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, sender_id, body, created_at, edited_at, deleted_at`,
      [id, req.user.id, body],
    );

    await pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [id],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

export default router;
