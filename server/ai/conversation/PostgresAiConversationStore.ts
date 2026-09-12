import type { Pool, PoolClient } from "pg";
import { pool } from "../../db";
import type {
  AiConversationDetail,
  AiConversationStore,
  AiConversationSummary,
  AiExchange,
  AiStoredCitation,
  AiStoredMessage,
  CompleteAssistantInput,
} from "./types";

type MessageRow = Omit<AiStoredMessage, "citations">;

export class AiQuotaExceededError extends Error {
  constructor() {
    super("The daily AI request limit has been reached");
    this.name = "AiQuotaExceededError";
  }
}

export class AiConversationNotFoundError extends Error {
  constructor() {
    super("The AI conversation was not found");
    this.name = "AiConversationNotFoundError";
  }
}

export class PostgresAiConversationStore implements AiConversationStore {
  constructor(private readonly databasePool: Pool = pool) {}

  async createConversation(userId: string, title = "New NUS question") {
    const result = await this.databasePool.query<AiConversationSummary>(
      `INSERT INTO ai_conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, created_at, updated_at`,
      [userId, title],
    );
    return result.rows[0];
  }

  async listConversations(userId: string) {
    const result = await this.databasePool.query<AiConversationSummary>(
      `SELECT id, title, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT 100`,
      [userId],
    );
    return result.rows;
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.databasePool.query<AiConversationSummary>(
      `SELECT id, title, created_at, updated_at
       FROM ai_conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    if (!conversation.rows[0]) return null;

    const messages = await this.databasePool.query<MessageRow>(
      `SELECT m.id, m.role, m.content, m.delivery_status, m.answer_status,
              m.error_code, m.follow_up_question, m.warnings,
              m.academic_year, m.module_code, m.created_at, m.updated_at,
              f.rating AS feedback_rating
       FROM ai_messages m
       LEFT JOIN ai_feedback f
         ON f.message_id = m.id AND f.user_id = $2
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [conversationId, userId],
    );
    const citations = await this.databasePool.query<
      AiStoredCitation & { message_id: string }
    >(
      `SELECT message_id, source_id AS "sourceId",
              document_version_id AS "documentVersionId", title, url,
              effective_at AS "effectiveAt", retrieved_at AS "retrievedAt",
              claim_ids AS "claimIds", position
       FROM ai_message_citations
       WHERE message_id = ANY($1::uuid[])
       ORDER BY message_id, position`,
      [messages.rows.map((message) => message.id)],
    );

    return {
      ...conversation.rows[0],
      messages: attachCitations(messages.rows, citations.rows),
    } satisfies AiConversationDetail;
  }

  async getMessage(messageId: string, userId: string) {
    const message = await this.databasePool.query<MessageRow>(
      `SELECT m.id, m.role, m.content, m.delivery_status, m.answer_status,
              m.error_code, m.follow_up_question, m.warnings,
              m.academic_year, m.module_code, m.created_at, m.updated_at,
              f.rating AS feedback_rating
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
       LEFT JOIN ai_feedback f
         ON f.message_id = m.id AND f.user_id = $2
       WHERE m.id = $1 AND c.user_id = $2`,
      [messageId, userId],
    );
    if (!message.rows[0]) return null;

    const citations = await this.databasePool.query<AiStoredCitation>(
      `SELECT source_id AS "sourceId",
              document_version_id AS "documentVersionId", title, url,
              effective_at AS "effectiveAt", retrieved_at AS "retrievedAt",
              claim_ids AS "claimIds", position
       FROM ai_message_citations
       WHERE message_id = $1
       ORDER BY position`,
      [messageId],
    );
    return { ...message.rows[0], citations: citations.rows };
  }

  async deleteConversation(conversationId: string, userId: string) {
    const result = await this.databasePool.query(
      `DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    return result.rowCount === 1;
  }

  async beginExchange(input: {
    content: string;
    conversationId: string;
    dailyLimit: number;
    idempotencyKey: string;
    requestId: string;
    userId: string;
  }): Promise<AiExchange> {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      await this.requireOwner(client, input.conversationId, input.userId);

      const existing = await client.query<{
        assistant_message_id: string;
        user_message_id: string;
      }>(
        `SELECT u.id AS user_message_id, a.id AS assistant_message_id
         FROM ai_messages u
         JOIN ai_messages a ON a.reply_to_message_id = u.id
         WHERE u.conversation_id = $1
           AND u.role = 'user'
           AND u.idempotency_key = $2`,
        [input.conversationId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return {
          assistantMessageId: existing.rows[0].assistant_message_id,
          replayed: true,
          userMessageId: existing.rows[0].user_message_id,
        };
      }

      const usage = await client.query(
        `INSERT INTO ai_request_usage (user_id, usage_date, request_count)
         VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE
         SET request_count = ai_request_usage.request_count + 1,
             updated_at = NOW()
         WHERE ai_request_usage.request_count < $2
         RETURNING request_count`,
        [input.userId, input.dailyLimit],
      );
      if (usage.rowCount !== 1) throw new AiQuotaExceededError();

      const userMessage = await client.query<{ id: string }>(
        `INSERT INTO ai_messages (
           conversation_id, role, content, delivery_status, request_id,
           idempotency_key
         )
         VALUES ($1, 'user', $2, 'completed', $3, $4)
         RETURNING id`,
        [
          input.conversationId,
          input.content,
          input.requestId,
          input.idempotencyKey,
        ],
      );
      const assistantMessage = await client.query<{ id: string }>(
        `INSERT INTO ai_messages (
           conversation_id, reply_to_message_id, role, request_id,
           prompt_version
         )
         VALUES ($1, $2, 'assistant', $3, 'nusmods-structured.v1')
         RETURNING id`,
        [input.conversationId, userMessage.rows[0].id, input.requestId],
      );
      await client.query(
        `UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`,
        [input.conversationId],
      );
      await client.query("COMMIT");
      return {
        assistantMessageId: assistantMessage.rows[0].id,
        replayed: false,
        userMessageId: userMessage.rows[0].id,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeAssistant(input: CompleteAssistantInput) {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      const update = await client.query(
        `UPDATE ai_messages
         SET content = $2, delivery_status = 'completed', answer_status = $3,
             follow_up_question = $4, warnings = $5::jsonb,
             academic_year = $6, module_code = $7, model_id = $8,
             prompt_version = COALESCE($9, prompt_version), updated_at = NOW()
         WHERE id = $1 AND role = 'assistant' AND delivery_status = 'processing'`,
        [
          input.assistantMessageId,
          input.answer.answer,
          input.answer.status,
          input.answer.followUpQuestion ?? null,
          JSON.stringify(input.answer.warnings),
          input.academicYear,
          input.moduleCode,
          input.modelId ?? null,
          input.promptVersion ?? null,
        ],
      );
      if (update.rowCount !== 1) {
        throw new Error("The assistant message is no longer processing");
      }

      for (const [position, citation] of input.answer.citations.entries()) {
        await client.query(
          `INSERT INTO ai_message_citations (
             message_id, source_id, document_version_id, title, url,
             effective_at, retrieved_at, claim_ids, position,
             knowledge_source_version_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
             (SELECT id FROM ai_source_versions
              WHERE id::text = $3 AND source_id = $2)
           )`,
          [
            input.assistantMessageId,
            citation.sourceId,
            citation.documentVersionId,
            citation.title,
            citation.url,
            citation.effectiveAt,
            citation.retrievedAt,
            JSON.stringify(citation.claimIds),
            position,
          ],
        );
      }
      await client.query(
        `UPDATE ai_conversations c
         SET updated_at = NOW()
         FROM ai_messages m
         WHERE m.id = $1 AND c.id = m.conversation_id`,
        [input.assistantMessageId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async failAssistant(input: {
    assistantMessageId: string;
    errorCode: string;
    interrupted: boolean;
  }) {
    await this.databasePool.query(
      `UPDATE ai_messages
       SET delivery_status = $2, error_code = $3, updated_at = NOW()
       WHERE id = $1 AND role = 'assistant' AND delivery_status = 'processing'`,
      [
        input.assistantMessageId,
        input.interrupted ? "interrupted" : "failed",
        input.errorCode,
      ],
    );
  }

  async setFeedback(input: {
    messageId: string;
    rating: "helpful" | "unhelpful";
    userId: string;
  }) {
    const result = await this.databasePool.query(
      `INSERT INTO ai_feedback (message_id, user_id, rating)
       SELECT m.id, $2, $3
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND m.role = 'assistant' AND c.user_id = $2
       ON CONFLICT (message_id, user_id) DO UPDATE
       SET rating = EXCLUDED.rating, updated_at = NOW()
       RETURNING message_id`,
      [input.messageId, input.userId, input.rating],
    );
    return result.rowCount === 1;
  }

  private async requireOwner(
    client: PoolClient,
    conversationId: string,
    userId: string,
  ) {
    const owner = await client.query(
      `SELECT id FROM ai_conversations
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [conversationId, userId],
    );
    if (owner.rowCount !== 1) throw new AiConversationNotFoundError();
  }
}

function attachCitations(
  messages: MessageRow[],
  citations: Array<AiStoredCitation & { message_id: string }>,
) {
  const byMessage = new Map<string, AiStoredCitation[]>();
  for (const { message_id: messageId, ...citation } of citations) {
    const entries = byMessage.get(messageId) ?? [];
    entries.push(citation);
    byMessage.set(messageId, entries);
  }
  return messages.map((message) => ({
    ...message,
    citations: byMessage.get(message.id) ?? [],
  }));
}

async function rollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original database error; the pool discards broken clients.
  }
}
