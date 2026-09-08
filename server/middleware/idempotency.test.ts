import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { errorHandler } from "./errorHandler";
import {
  createIdempotencyMiddleware,
  type AcquireResult,
  type IdempotencyStore,
} from "./idempotency";
import { requestId } from "./requestId";

type Entry = {
  requestHash: string;
  response?: Extract<AcquireResult, { kind: "replay" }>;
};

class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  async acquire(input: {
    key: string;
    requestHash: string;
    scope: string;
  }): Promise<AcquireResult> {
    const storageKey = `${input.scope}:${input.key}`;
    const existing = this.entries.get(storageKey);

    if (!existing) {
      this.entries.set(storageKey, { requestHash: input.requestHash });
      return { kind: "acquired" };
    }

    if (existing.requestHash !== input.requestHash) {
      return { kind: "conflict" };
    }

    return existing.response ?? { kind: "processing" };
  }

  async complete(input: {
    key: string;
    requestHash: string;
    response: {
      body: unknown;
      headers: Record<string, string>;
      statusCode: number;
    };
    scope: string;
  }) {
    this.entries.set(`${input.scope}:${input.key}`, {
      requestHash: input.requestHash,
      response: { kind: "replay", ...input.response },
    });
  }
}

function testApp(store: IdempotencyStore = new MemoryIdempotencyStore()) {
  const app = express();
  let mutationCount = 0;

  app.use(requestId);
  app.use(express.json());
  app.use(createIdempotencyMiddleware(store));
  app.post("/items", (req, res) => {
    mutationCount += 1;
    res.status(201).json({ mutationCount, value: req.body?.value });
  });
  app.use(errorHandler);

  return { app, mutationCount: () => mutationCount };
}

test("requires a valid idempotency key for mutations", async () => {
  const { app, mutationCount } = testApp();

  const missing = await request(app).post("/items").send({ value: 1 }).expect(400);
  assert.equal(missing.body.code, "IDEMPOTENCY_KEY_REQUIRED");

  const invalid = await request(app)
    .post("/items")
    .set("Idempotency-Key", "short")
    .send({ value: 1 })
    .expect(400);
  assert.equal(invalid.body.code, "INVALID_IDEMPOTENCY_KEY");
  assert.equal(mutationCount(), 0);
});

test("delegates the exact AI SSE message route to its database idempotency", async () => {
  let acquisitions = 0;
  const store: IdempotencyStore = {
    async acquire() {
      acquisitions += 1;
      return { kind: "acquired" };
    },
    async complete() {},
  };
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(createIdempotencyMiddleware(store));
  app.post(
    "/api/ai/conversations/:conversationId/messages",
    (_req, res) => res.status(202).json({ delegated: true }),
  );

  const response = await request(app)
    .post(
      "/api/ai/conversations/11111111-1111-4111-8111-111111111111/messages",
    )
    .set("Accept", "text/event-stream")
    .set("Idempotency-Key", "12345678")
    .send({ content: "question" })
    .expect(202);

  assert.equal(response.body.delegated, true);
  assert.equal(acquisitions, 0);
});

test("replays a completed response without executing the mutation twice", async () => {
  const { app, mutationCount } = testApp();
  const key = "3dbbe7be-90e1-4472-9c18-19dc4f06b405";

  const first = await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: 1 })
    .expect(201);
  const replay = await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: 1 })
    .expect(201);

  assert.deepEqual(replay.body, first.body);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  assert.equal(mutationCount(), 1);
});

test("rejects reusing a key for a different request", async () => {
  const { app, mutationCount } = testApp();
  const key = "f372d9ea-3624-4dfa-9209-6e566713ce47";

  await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: 1 })
    .expect(201);
  const conflict = await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: 2 })
    .expect(409);

  assert.equal(conflict.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(mutationCount(), 1);
});

test("treats equivalent JSON objects as the same request", async () => {
  const { app, mutationCount } = testApp();
  const key = "f51958e8-5523-459c-8541-68ca31073c39";

  await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: { first: 1, second: 2 } })
    .expect(201);
  await request(app)
    .post("/items")
    .set("Idempotency-Key", key)
    .send({ value: { second: 2, first: 1 } })
    .expect(201);

  assert.equal(mutationCount(), 1);
});

test("replays bodyless mutations", async () => {
  const { app, mutationCount } = testApp();
  const key = "60efb127-39be-4360-8f46-d7876154951e";

  await request(app).post("/items").set("Idempotency-Key", key).expect(201);
  await request(app).post("/items").set("Idempotency-Key", key).expect(201);

  assert.equal(mutationCount(), 1);
});

test("reports an in-flight duplicate without running the handler", async () => {
  const store: IdempotencyStore = {
    async acquire() {
      return { kind: "processing" };
    },
    async complete() {},
  };
  const { app, mutationCount } = testApp(store);
  const response = await request(app)
    .post("/items")
    .set("Idempotency-Key", "b6e746d9-f7e7-4426-8b1f-c95516fe3890")
    .expect(409);

  assert.equal(response.body.code, "IDEMPOTENCY_REQUEST_IN_PROGRESS");
  assert.equal(response.headers["idempotency-status"], "processing");
  assert.equal(response.headers["retry-after"], "1");
  assert.equal(mutationCount(), 0);
});

test("fails closed when idempotency storage is unavailable", async () => {
  const store: IdempotencyStore = {
    async acquire() {
      throw new Error("database unavailable");
    },
    async complete() {},
  };
  const { app, mutationCount } = testApp(store);
  const originalConsoleError = console.error;
  let response;

  console.error = () => undefined;
  try {
    response = await request(app)
      .post("/items")
      .set("Idempotency-Key", "8fb47ec7-06c3-4880-beeb-2ce2a96ead1e")
      .expect(503);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.body.code, "IDEMPOTENCY_STORE_UNAVAILABLE");
  assert.equal(mutationCount(), 0);
});
