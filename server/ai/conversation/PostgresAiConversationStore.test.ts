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
