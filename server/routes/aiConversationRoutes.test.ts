import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type { AiConfig } from "../ai/config/aiConfig";
import { AiQuotaExceededError } from "../ai/conversation/PostgresAiConversationStore";
import { AiRequestCoordinator } from "../ai/conversation/AiRequestCoordinator";
import type {
  AiConversationDetail,
  AiConversationStore,
  AiStoredMessage,
  CompleteAssistantInput,
  ModuleAnswerService,
} from "../ai/conversation/types";
import type { GroundedAnswer } from "../ai/domain/types";
import { createAccessToken } from "../auth/tokens";
import { errorHandler } from "../middleware/errorHandler";
import { requestId } from "../middleware/requestId";
import { createAiRouter } from "./ai";

const firstUser = "11111111-1111-4111-8111-111111111111";
const secondUser = "22222222-2222-4222-8222-222222222222";

const config: AiConfig = {
  dailyRequestLimitPerUser: 50,
  enabled: true,
  generationModel: "stable-test-model",
  maxConcurrentRequestsPerUser: 1,
  maxInputChars: 2_000,
  maxOutputTokens: 800,
  provider: "gemini",
  requestTimeoutMs: 20_000,
  storeInteractions: false,
};

class MemoryAiConversationStore implements AiConversationStore {
  readonly conversations = new Map<
    string,
    AiConversationDetail & { ownerId: string }
  >();
  readonly feedback = new Map<string, string>();
  readonly failed: Array<{ errorCode: string; interrupted: boolean }> = [];
  quotaExceeded = false;

  async createConversation(userId: string, title = "New module question") {
    const conversation = {
      created_at: new Date().toISOString(),
      id: randomUUID(),
      messages: [],
      ownerId: userId,
      title,
      updated_at: new Date().toISOString(),
    };
    this.conversations.set(conversation.id, conversation);
    return withoutOwner(conversation);
  }

  async listConversations(userId: string) {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.ownerId === userId)
      .map(({ messages: _messages, ownerId: _ownerId, ...summary }) => summary);
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = this.conversations.get(conversationId);
    return conversation?.ownerId === userId ? withoutOwner(conversation) : null;
  }

  async deleteConversation(conversationId: string, userId: string) {
    const conversation = this.conversations.get(conversationId);
    if (conversation?.ownerId !== userId) return false;
    return this.conversations.delete(conversationId);
  }

  async beginExchange(input: {
    content: string;
    conversationId: string;
    dailyLimit: number;
    idempotencyKey: string;
    requestId: string;
    userId: string;
  }) {
    const conversation = this.conversations.get(input.conversationId);
    if (conversation?.ownerId !== input.userId) {
      const { AiConversationNotFoundError } = await import(
        "../ai/conversation/PostgresAiConversationStore"
      );
      throw new AiConversationNotFoundError();
    }
    if (this.quotaExceeded) throw new AiQuotaExceededError();

    const existingUser = conversation.messages.find(
      (message) =>
        message.role === "user" &&
        (message as AiStoredMessage & { idempotencyKey?: string }).idempotencyKey ===
          input.idempotencyKey,
    ) as (AiStoredMessage & { idempotencyKey?: string }) | undefined;
    if (existingUser) {
      const assistant = conversation.messages.find(
        (message) =>
          (message as AiStoredMessage & { replyTo?: string }).replyTo === existingUser.id,
      );
      return {
        assistantMessageId: assistant!.id,
        replayed: true,
        userMessageId: existingUser.id,
      };
    }

    const userMessage = message("user", input.content) as AiStoredMessage & {
      idempotencyKey?: string;
    };
    userMessage.idempotencyKey = input.idempotencyKey;
    const assistant = message("assistant", "") as AiStoredMessage & {
      replyTo?: string;
    };
    assistant.delivery_status = "processing";
    assistant.replyTo = userMessage.id;
    conversation.messages.push(userMessage, assistant);
    return {
      assistantMessageId: assistant.id,
      replayed: false,
      userMessageId: userMessage.id,
    };
  }

  async completeAssistant(input: CompleteAssistantInput) {
    const stored = this.findMessage(input.assistantMessageId);
    if (!stored) throw new Error("missing message");
    stored.content = input.answer.answer;
    stored.answer_status = input.answer.status;
    stored.citations = input.answer.citations.map((citation, position) => ({
      ...citation,
      position,
    }));
    stored.follow_up_question = input.answer.followUpQuestion ?? null;
    stored.warnings = input.answer.warnings;
    stored.academic_year = input.academicYear;
    stored.module_code = input.moduleCode;
    stored.delivery_status = "completed";
  }

  async failAssistant(input: {
    assistantMessageId: string;
    errorCode: string;
    interrupted: boolean;
  }) {
    this.failed.push(input);
    const stored = this.findMessage(input.assistantMessageId);
    if (stored) {
      stored.error_code = input.errorCode;
      stored.delivery_status = input.interrupted ? "interrupted" : "failed";
    }
  }

  async getMessage(messageId: string, userId: string) {
    const conversation = [...this.conversations.values()].find(
      (entry) =>
        entry.ownerId === userId &&
        entry.messages.some((message_) => message_.id === messageId),
    );
    return conversation?.messages.find((message_) => message_.id === messageId) ?? null;
  }

  async setFeedback(input: {
    messageId: string;
    rating: "helpful" | "unhelpful";
    userId: string;
  }) {
    const stored = await this.getMessage(input.messageId, input.userId);
    if (!stored || stored.role !== "assistant") return false;
    this.feedback.set(input.messageId, input.rating);
    stored.feedback_rating = input.rating;
    return true;
  }

  private findMessage(messageId: string) {
    return [...this.conversations.values()]
      .flatMap((conversation) => conversation.messages)
      .find((message_) => message_.id === messageId);
  }
}

function message(role: "user" | "assistant", content: string): AiStoredMessage {
  const now = new Date().toISOString();
  return {
    academic_year: null,
    answer_status: null,
    citations: [],
    content,
    created_at: now,
    delivery_status: "completed",
    error_code: null,
    feedback_rating: null,
    follow_up_question: null,
    id: randomUUID(),
    module_code: null,
    role,
    updated_at: now,
    warnings: [],
  };
}

function withoutOwner(
  conversation: AiConversationDetail & { ownerId: string },
): AiConversationDetail {
  const { ownerId: _ownerId, ...stored } = conversation;
  return structuredClone(stored);
}

function groundedAnswer(answer = "CS2030S is Programming Methodology II."): GroundedAnswer {
  return {
    answer,
    citations: [
      {
        claimIds: ["module_record"],
        documentVersionId: "nusmods:2026-2027:CS2030S:hash",
        effectiveAt: null,
        retrievedAt: "2026-09-08T01:00:00.000Z",
        sourceId: "nusmods_api",
        title: "CS2030S — NUSMods",
        url: "https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json",
      },
    ],
    status: "answered",
    warnings: ["test_warning"],
  };
}

function testApp(
  store: MemoryAiConversationStore,
  answer: ModuleAnswerService = async () => ({
    academicYear: "AY2026/27",
    groundedAnswer: groundedAnswer(),
    moduleCode: "CS2030S",
  }),
  coordinator?: AiRequestCoordinator,
) {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(
    "/api/ai",
    createAiRouter(config, {
      answerModuleQuestion: answer,
      coordinator,
      store,
    }),
  );
  app.use(errorHandler);
  return app;
}

function authorization(userId = firstUser) {
  return `Bearer ${createAccessToken(userId)}`;
}

async function createConversation(
  app: ReturnType<typeof testApp>,
  title = "My modules",
) {
  const response = await request(app)
    .post("/api/ai/conversations")
    .set("Authorization", authorization())
    .send({ title })
    .expect(201);
  return response.body.conversation.id as string;
}

test("creates, lists, reads, and deletes only owned conversations", async () => {
  const store = new MemoryAiConversationStore();
  const app = testApp(store);
  const conversationId = await createConversation(app);

  const list = await request(app)
    .get("/api/ai/conversations")
    .set("Authorization", authorization())
    .expect(200);
  assert.equal(list.body.conversations.length, 1);

  await request(app)
    .get(`/api/ai/conversations/${conversationId}`)
    .set("Authorization", authorization(secondUser))
    .expect(404);
  await request(app)
    .delete(`/api/ai/conversations/${conversationId}`)
    .set("Authorization", authorization(secondUser))
    .expect(404);

  await request(app)
    .delete(`/api/ai/conversations/${conversationId}`)
    .set("Authorization", authorization())
    .expect(204);
  assert.equal(store.conversations.size, 0);
});

test("streams a versioned grounded response and persists its citation", async () => {
  const store = new MemoryAiConversationStore();
  let receivedQuestion;
  const app = testApp(store, async (question) => {
    receivedQuestion = question;
    return {
      academicYear: "AY2026/27",
      groundedAnswer: groundedAnswer(),
      moduleCode: "CS2030S",
    };
  });
  const conversationId = await createConversation(app);

  const response = await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Accept", "text/event-stream")
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect("Content-Type", /text\/event-stream/)
    .expect(200);

  assert.match(response.text, /event: response\.started/);
  assert.match(response.text, /event: response\.text\.delta/);
  assert.match(response.text, /event: response\.citation/);
  assert.match(response.text, /event: response\.warning/);
  assert.match(response.text, /event: response\.completed/);
  assert.match(response.text, /"version":1/);
  assert.deepEqual(
    {
      academicYear: receivedQuestion.academicYear,
      intent: receivedQuestion.intent,
      moduleCode: receivedQuestion.moduleCode,
    },
    {
      academicYear: "2026/27",
      intent: "summary",
      moduleCode: "CS2030S",
    },
  );
  const stored = [...store.conversations.values()][0].messages[1];
  assert.equal(stored.delivery_status, "completed");
  assert.equal(stored.citations[0].sourceId, "nusmods_api");
});

test("replays a completed stream without executing the answer service twice", async () => {
  const store = new MemoryAiConversationStore();
  let calls = 0;
  const app = testApp(store, async () => {
    calls += 1;
    return {
      academicYear: "AY2026/27",
      groundedAnswer: groundedAnswer(),
      moduleCode: "CS2030S",
    };
  });
  const conversationId = await createConversation(app);
  const key = randomUUID();
  const send = () =>
    request(app)
      .post(`/api/ai/conversations/${conversationId}/messages`)
      .set("Accept", "text/event-stream")
      .set("Authorization", authorization())
      .set("Idempotency-Key", key)
      .send({ content: "What is CS2030S in AY2026/27?" });

  await send().expect(200);
  const replay = await send().expect(200);

  assert.equal(calls, 1);
  assert.match(replay.text, /"replayed":true/);
});

test("carries verified module context into a follow-up question", async () => {
  const store = new MemoryAiConversationStore();
  const receivedQuestions: Array<{
    academicYear?: string;
    intent: string;
    moduleCode?: string;
  }> = [];
  const app = testApp(store, async (question) => {
    receivedQuestions.push(question);
    return {
      academicYear: "AY2026/27",
      groundedAnswer: groundedAnswer(),
      moduleCode: "CS2030S",
    };
  });
  const conversationId = await createConversation(app);
  const send = (content: string) =>
    request(app)
      .post(`/api/ai/conversations/${conversationId}/messages`)
      .set("Accept", "text/event-stream")
      .set("Authorization", authorization())
      .set("Idempotency-Key", randomUUID())
      .send({ content });

  await send("What is CS2030S in AY2026/27?").expect(200);
  await send("What about its prerequisites?").expect(200);

  assert.deepEqual(
    {
      academicYear: receivedQuestions[1].academicYear,
      intent: receivedQuestions[1].intent,
      moduleCode: receivedQuestions[1].moduleCode,
    },
    {
      academicYear: "AY2026/27",
      intent: "prerequisite",
      moduleCode: "CS2030S",
    },
  );
});

test("enforces stream negotiation, daily quota, and concurrency limits", async () => {
  const store = new MemoryAiConversationStore();
  const coordinator = new AiRequestCoordinator(1);
  const app = testApp(store, undefined, coordinator);
  const conversationId = await createConversation(app);

  await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect(406);

  store.quotaExceeded = true;
  const quota = await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Accept", "text/event-stream")
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect(429);
  assert.equal(quota.body.code, "AI_DAILY_QUOTA_EXCEEDED");
  assert.ok(Number(quota.headers["retry-after"]) > 0);

  store.quotaExceeded = false;
  const release = coordinator.acquire(firstUser);
  const concurrent = await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Accept", "text/event-stream")
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect(429);
  release();
  assert.equal(concurrent.body.code, "AI_CONCURRENT_LIMIT_EXCEEDED");
});

test("turns internal answer failures into stable SSE errors", async () => {
  const store = new MemoryAiConversationStore();
  const app = testApp(store, async () => {
    throw new Error("provider leaked secret-value");
  });
  const conversationId = await createConversation(app);

  const response = await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Accept", "text/event-stream")
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect(200);

  assert.match(response.text, /event: response\.failed/);
  assert.match(response.text, /AI_RESPONSE_FAILED/);
  assert.doesNotMatch(response.text, /secret-value/);
  assert.equal(store.failed[0].interrupted, false);
});

test("cancels in-flight work and marks the message interrupted on disconnect", async () => {
  const store = new MemoryAiConversationStore();
  let serviceObservedAbort = false;
  const app = testApp(store, (question) =>
    new Promise<never>((_resolve, reject) => {
      question.signal?.addEventListener(
        "abort",
        () => {
          serviceObservedAbort = true;
          reject(new Error("cancelled"));
        },
        { once: true },
      );
    }),
  );
  const conversation = await store.createConversation(firstUser, "Disconnect test");
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/ai/conversations/${conversation.id}/messages`,
      {
        body: JSON.stringify({ content: "What is CS2030S in AY2026/27?" }),
        headers: {
          Accept: "text/event-stream",
          Authorization: authorization(),
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        method: "POST",
        signal: controller.signal,
      },
    );
    assert.equal(response.status, 200);
    await response.body?.getReader().read();
    controller.abort();

    for (let attempt = 0; attempt < 30 && store.failed.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(serviceObservedAbort, true);
    assert.equal(store.failed[0]?.interrupted, true);
    assert.equal(store.failed[0]?.errorCode, "AI_REQUEST_CANCELLED");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("does not persist completion after a disconnect during answer delivery", async () => {
  const store = new MemoryAiConversationStore();
  const app = testApp(store, async () => ({
    academicYear: "AY2026/27",
    groundedAnswer: groundedAnswer("CS2030S ".repeat(20_000)),
    moduleCode: "CS2030S",
  }));
  const conversation = await store.createConversation(firstUser, "Delivery test");
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/ai/conversations/${conversation.id}/messages`,
      {
        body: JSON.stringify({ content: "What is CS2030S in AY2026/27?" }),
        headers: {
          Accept: "text/event-stream",
          Authorization: authorization(),
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        method: "POST",
        signal: controller.signal,
      },
    );
    assert.equal(response.status, 200);
    await response.body?.getReader().read();
    controller.abort();

    for (let attempt = 0; attempt < 50 && store.failed.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const stored = store.conversations.get(conversation.id)?.messages[1];
    assert.equal(store.failed[0]?.interrupted, true);
    assert.equal(stored?.delivery_status, "interrupted");
    assert.equal(stored?.content, "");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("accepts feedback only for an owned assistant message", async () => {
  const store = new MemoryAiConversationStore();
  const app = testApp(store);
  const conversationId = await createConversation(app);
  await request(app)
    .post(`/api/ai/conversations/${conversationId}/messages`)
    .set("Accept", "text/event-stream")
    .set("Authorization", authorization())
    .set("Idempotency-Key", randomUUID())
    .send({ content: "What is CS2030S in AY2026/27?" })
    .expect(200);
  const assistantId = [...store.conversations.values()][0].messages[1].id;

  await request(app)
    .post(`/api/ai/messages/${assistantId}/feedback`)
    .set("Authorization", authorization(secondUser))
    .send({ rating: "helpful" })
    .expect(404);
  await request(app)
    .post(`/api/ai/messages/${assistantId}/feedback`)
    .set("Authorization", authorization())
    .send({ rating: "helpful" })
    .expect(200);
  assert.equal(store.feedback.get(assistantId), "helpful");

  const conversation = await request(app)
    .get(`/api/ai/conversations/${conversationId}`)
    .set("Authorization", authorization())
    .expect(200);
  assert.equal(conversation.body.conversation.messages[1].feedback_rating, "helpful");
});
