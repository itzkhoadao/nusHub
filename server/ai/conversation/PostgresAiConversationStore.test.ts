import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, QueryResult } from "pg";
import {
  AiConversationNotFoundError,
  AiQuotaExceededError,
  PostgresAiConversationStore,
} from "./PostgresAiConversationStore";

type QueryHandler = (
  sql: string,
  values?: unknown[],
) => Partial<QueryResult> | Promise<Partial<QueryResult>>;

function fakePool(handler: QueryHandler) {
  const queries: string[] = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      queries.push(sql.trim());
      return handler(sql, values);
    },
    release() {
      released = true;
    },
  };
  return {
    pool: { connect: async () => client } as unknown as Pool,
    queries,
    released: () => released,
  };
}

const exchangeInput = {
  content: "What is CS2030S in AY2026/27?",
  conversationId: "11111111-1111-4111-8111-111111111111",
  dailyLimit: 50,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  userId: "44444444-4444-4444-8444-444444444444",
};

test("checks ownership before consuming quota or storing an exchange", async () => {
  const database = fakePool((sql) => {
    if (sql.includes("SELECT id FROM ai_conversations")) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  const store = new PostgresAiConversationStore(database.pool);

  await assert.rejects(
    () => store.beginExchange(exchangeInput),
    AiConversationNotFoundError,
  );
  assert.ok(database.queries.includes("ROLLBACK"));
  assert.equal(
    database.queries.some((query) => query.includes("ai_request_usage")),
    false,
  );
  assert.equal(database.released(), true);
});

test("rolls back without messages when the atomic daily quota is exhausted", async () => {
  const database = fakePool((sql) => {
    if (sql.includes("SELECT id FROM ai_conversations")) {
      return { rowCount: 1, rows: [{ id: exchangeInput.conversationId }] };
    }
    if (sql.includes("FROM ai_messages u")) return { rowCount: 0, rows: [] };
    if (sql.includes("INSERT INTO ai_request_usage")) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  const store = new PostgresAiConversationStore(database.pool);

  await assert.rejects(
    () => store.beginExchange(exchangeInput),
    AiQuotaExceededError,
  );
  assert.ok(database.queries.includes("ROLLBACK"));
  assert.ok(
    database.queries.some((query) =>
      query.includes("(NOW() AT TIME ZONE 'UTC')::date"),
    ),
  );
  assert.equal(
    database.queries.some((query) => query.includes("VALUES ($1, 'user'")),
    false,
  );
});

test("replays an existing idempotent exchange without consuming quota", async () => {
  const database = fakePool((sql) => {
    if (sql.includes("SELECT id FROM ai_conversations")) {
      return { rowCount: 1, rows: [{ id: exchangeInput.conversationId }] };
    }
    if (sql.includes("FROM ai_messages u")) {
      return {
        rowCount: 1,
        rows: [
          {
            assistant_message_id: "55555555-5555-4555-8555-555555555555",
            user_message_id: "66666666-6666-4666-8666-666666666666",
          },
        ],
      };
    }
    return { rowCount: 0, rows: [] };
  });
  const store = new PostgresAiConversationStore(database.pool);

  const exchange = await store.beginExchange(exchangeInput);

  assert.equal(exchange.replayed, true);
  assert.ok(database.queries.includes("COMMIT"));
  assert.equal(
    database.queries.some((query) => query.includes("ai_request_usage")),
    false,
  );
});

test("persists generation provenance and links curated citations to source versions", async () => {
  const valuesByStatement = new Map<string, unknown[] | undefined>();
  const database = fakePool((sql, values) => {
    if (sql.includes("UPDATE ai_messages")) {
      valuesByStatement.set("message", values);
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("INSERT INTO ai_message_citations")) {
      valuesByStatement.set("citation", values);
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });
  const store = new PostgresAiConversationStore(database.pool);

  await store.completeAssistant({
    academicYear: null,
    answer: {
      answer: "Grounded answer",
      citations: [{
        claimIds: ["knowledge_chunk:12"],
        documentVersionId: "55555555-5555-4555-8555-555555555555",
        effectiveAt: null,
        retrievedAt: "2026-09-12T00:00:00.000Z",
        sourceId: "nus_libraries",
        title: "Library",
        url: "https://nus.edu.sg/nuslibraries/",
      }],
      status: "answered",
      warnings: [],
    },
    assistantMessageId: "66666666-6666-4666-8666-666666666666",
    modelId: "test-generation-model",
    moduleCode: null,
    promptVersion: "nus-knowledge-assistant.v1",
  });

  assert.equal(valuesByStatement.get("message")?.[7], "test-generation-model");
  assert.equal(valuesByStatement.get("message")?.[8], "nus-knowledge-assistant.v1");
  assert.ok(
    database.queries.some((sql) => sql.includes("knowledge_source_version_id")),
  );
  assert.equal(
    valuesByStatement.get("citation")?.[2],
    "55555555-5555-4555-8555-555555555555",
  );
});
