import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { aiConfig } from "../ai/config/aiConfig";
import { env } from "../config/env";
import { createAccessToken } from "../auth/tokens";
import { requestId } from "../middleware/requestId";
import { errorHandler } from "../middleware/errorHandler";
import { createAiRouter } from "../routes/ai";
import { PostgresAiConversationStore } from "../ai/conversation/PostgresAiConversationStore";
import { createKnowledgeStagingPool } from "../ai/knowledge/stagingDatabase";
import { PostgresKnowledgeRepository } from "../ai/knowledge/PostgresKnowledgeRepository";
import { HybridKnowledgeRetriever } from "../ai/knowledge/HybridKnowledgeRetriever";
import { GeminiEmbeddingProvider } from "../ai/knowledge/GeminiEmbeddingProvider";
import { GeminiAiProvider } from "../ai/providers/GeminiAiProvider";
import { answerKnowledgeQuestion } from "../ai/knowledge/answerKnowledgeQuestion";
import type { AiConversationDetail, AiEvidencePassage } from "../ai/conversation/types";

async function main() {
  const args = process.argv.slice(2);
  const output = args[args.indexOf("--out") + 1];
  if (!args.includes("--out") || !output || output.startsWith("--") || !env.GEMINI_API_KEY) throw new Error("Requires --out and a privately configured Gemini key");
  const pool = createKnowledgeStagingPool();
  const userId = randomUUID();
  const store = new PostgresAiConversationStore(pool);
  let generations = 0;
  const provider = new GeminiAiProvider({ apiKey: env.GEMINI_API_KEY, maxInputChars: env.AI_MAX_CONTEXT_CHARS,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS, model: env.AI_GENERATION_MODEL, requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    thinkingLevel: env.AI_THINKING_LEVEL });
  const retriever = new HybridKnowledgeRetriever(new PostgresKnowledgeRepository(pool), new GeminiEmbeddingProvider({
    apiKey: env.GEMINI_API_KEY, dimensions: env.AI_EMBEDDING_DIMENSIONS, model: env.AI_EMBEDDING_MODEL,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  }), { candidateLimit: 30, maxSemanticDistance: .55, resultLimit: 5 });
  const app = express();
  app.use(requestId, express.json({ limit: "16kb" }));
  app.use("/api/ai", createAiRouter({ ...aiConfig, enabled: true, dailyRequestLimitPerUser: 2 }, {
    store, answerModuleQuestion: question => answerKnowledgeQuestion({ text: question.originalText ?? "", requestId: question.requestId!, signal: question.signal,
      unsafeInput: question.unsafeInput }, { retriever, maxContextChars: env.AI_KNOWLEDGE_MAX_CONTEXT_CHARS,
      provider: { generateAnswer: request => { generations++; return provider.generateAnswer(request); } } }),
  }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/ai`;
  const ownerHeaders: Record<string, string> = { Authorization: `Bearer ${createAccessToken(userId)}`, "Content-Type": "application/json" };
  const otherHeaders = { ...ownerHeaders, Authorization: `Bearer ${createAccessToken(randomUUID())}` };
  const call = (route: string, method = "GET", body?: object, headers = ownerHeaders) =>
    fetch(base + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  try {
    await pool.query(`INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)`,
      [userId, `staging_${userId.slice(0, 8)}`, `${userId}@staging.invalid`, "unusable-staging-fixture"]);
    const created = await call("/conversations", "POST", { title: "Synthetic staging API check" });
    assert.equal(created.status, 201);
    const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const route = `/conversations/${conversationId}`;
    assert.equal((await call(route, "GET", undefined, otherHeaders)).status, 404);
    const firstKey = randomUUID();
    const send = (content: string, key: string) => call(route + "/messages", "POST", { content },
      { ...ownerHeaders, Accept: "text/event-stream", "Idempotency-Key": key });
    const first = await send("When is regular Semester 1 reading week?", firstKey);
    assert.equal(first.status, 200);
    assert.match(await first.text(), /needs_clarification/);
    const secondKey = randomUUID();
    const second = await send("AY2026/27", secondKey);
    assert.equal(second.status, 200);
    const stream = await second.text();
    assert.match(stream, /"status":"answered"/);
    assert.match(stream, /response.citation/);
    const replay = await send("AY2026/27", secondKey);
    assert.equal(replay.status, 200);
    assert.match(await replay.text(), /"replayed":true/);
    assert.equal(generations, 1);
    assert.equal((await send("Different question", secondKey)).status, 409);
    const overQuota = await send("What are library services?", randomUUID());
    assert.equal(overQuota.status, 429);
    assert.ok(overQuota.headers.get("Retry-After"));
    const usage = await pool.query<{ request_count: number }>("SELECT request_count FROM ai_request_usage WHERE user_id = $1", [userId]);
    assert.equal(usage.rows[0].request_count, 2);
    const detailResponse = await call(route);
    assert.match(detailResponse.headers.get("Cache-Control") ?? "", /private.*no-store/);
    const detail = ((await detailResponse.json()) as { conversation: AiConversationDetail }).conversation;
    const assistant = [...detail.messages].reverse().find(m => m.role === "assistant");
    assert.ok(assistant);
    const evidenceRoute = `/messages/${assistant.id}/evidence`;
    assert.equal((await call(evidenceRoute, "GET", undefined, otherHeaders)).status, 404);
    const passages = ((await (await call(evidenceRoute)).json()) as { passages: AiEvidencePassage[] }).passages;
    assert.ok(passages.length > 0 && passages.every((p: { content: string }) => p.content.length > 0));
    assert.equal((await call(`/messages/${assistant.id}/feedback`, "POST", { rating: "helpful" })).status, 200);
    assert.equal((await call(route, "PATCH", { title: "Reviewed staging fixture" })).status, 200);
    assert.equal((await call(route, "DELETE")).status, 204);
    assert.equal((await call(route)).status, 404);
    const report = { checkedAt: new Date().toISOString(), environment: "staging", method: "authenticated loopback HTTP; real PostgreSQL; real Gemini; synthetic account removed",
      checks: { ownership: true, clarificationFollowUp: true, groundedStreaming: true, exactPassages: true, idempotentReplay: true,
        keyConflict: true, atomicQuota: true, privateCacheHeaders: true, feedback: true, rename: true, cascadeDelete: true },
      generations, humanCitationReview: "pending", releaseApproval: false };
    await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log("Staging chatbot API acceptance passed", report.checks);
  } finally {
    try { await pool.query("DELETE FROM users WHERE id = $1", [userId]); }
    finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await pool.end();
    }
  }
}
void main().catch(error => {
  console.error("Staging chatbot API acceptance failed", { message: error instanceof Error ? error.message : "Unknown failure" });
  process.exitCode = 1;
});
