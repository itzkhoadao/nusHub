import assert from "node:assert/strict";
import test from "node:test";
import { GeminiEmbeddingProvider } from "./GeminiEmbeddingProvider";

test("uses asymmetric retrieval tasks and normalizes 768-dimensional embeddings", async () => {
  const calls: Array<{ taskType: string; title?: string }> = [];
  const provider = new GeminiEmbeddingProvider({
    apiKey: "test-key",
    dimensions: 768,
    embedContent: async (input) => {
      calls.push({ taskType: input.config.taskType, title: input.config.title });
      return {
        embeddings: input.contents.map(() => ({
          values: [3, 4, ...Array.from({ length: 766 }, () => 0)],
        })),
      };
    },
    model: "gemini-embedding-001",
    requestTimeoutMs: 1_000,
  });

  const documents = await provider.embedDocuments(["document"], "Official page");
  const query = await provider.embedQuery("question");

  assert.deepEqual(calls, [
    { taskType: "RETRIEVAL_DOCUMENT", title: "Official page" },
    { taskType: "RETRIEVAL_QUERY", title: undefined },
  ]);
  assert.equal(Math.hypot(...documents[0]), 1);
  assert.equal(Math.hypot(...query), 1);
});

test("fails closed when the provider returns the wrong vector shape", async () => {
  const provider = new GeminiEmbeddingProvider({
    apiKey: "test-key",
    dimensions: 768,
    embedContent: async () => ({ embeddings: [{ values: [1, 2] }] }),
    model: "gemini-embedding-001",
    requestTimeoutMs: 1_000,
  });

  await assert.rejects(
    provider.embedQuery("question"),
    (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && error.code === "EMBEDDING_RESPONSE_INVALID"),
  );
});
