import assert from "node:assert/strict";
import test from "node:test";
import type { AiProvider } from "../providers/AiProvider";
import type { HybridKnowledgeRetriever } from "./HybridKnowledgeRetriever";
import { answerKnowledgeQuestion } from "./answerKnowledgeQuestion";
import type { RetrievedEvidence } from "./types";

const evidence: RetrievedEvidence = {
  chunkId: "9",
  content: "The official library page lists the service information.",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  effectiveAt: null,
  fetchedAt: "2026-09-12T00:00:00.000Z",
  heading: "Services",
  metadata: {},
  score: 0.03,
  sourceId: "nus_libraries",
  title: "NUS Libraries",
  trustTier: "T1",
  url: "https://nus.edu.sg/nuslibraries/",
};

function dependencies(results: RetrievedEvidence[]) {
  let providerCalls = 0;
  const provider: AiProvider = {
    async generateAnswer() {
      providerCalls += 1;
      return {
        answer: {
          answer: "The official library page lists the service information.",
          citations: [{
            claimIds: ["knowledge_chunk:9"],
            documentVersionId: evidence.documentVersionId,
            effectiveAt: evidence.effectiveAt,
            retrievedAt: evidence.fetchedAt,
            sourceId: evidence.sourceId,
            title: evidence.title,
            url: evidence.url,
          }],
          status: "answered",
          warnings: [],
        },
        model: "test-generation-model",
        tokenUsage: { input: 10, output: 10 },
      };
    },
  };
  const retriever = {
    search: async () => results,
  } as unknown as HybridKnowledgeRetriever;
  return {
    dependencies: { maxContextChars: 4_000, provider, retriever },
    providerCalls: () => providerCalls,
  };
}

test("generates only after retrieval and preserves validated evidence identity", async () => {
  const setup = dependencies([evidence]);
  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "What library services are available?",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "answered");
  assert.equal(result.groundedAnswer.citations[0].url, evidence.url);
  assert.equal(result.modelId, "test-generation-model");
  assert.equal(setup.providerCalls(), 1);
});

test("returns not-verified without generation when approved evidence is absent", async () => {
  const setup = dependencies([]);
  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "What library services are available?",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "not_verified");
  assert.equal(setup.providerCalls(), 0);
});

test("fails closed when current official evidence contains a declared conflict", async () => {
  const setup = dependencies([
    { ...evidence, metadata: { conflict_key: "opening_time", fact_value: "08:00" } },
    {
      ...evidence,
      chunkId: "10",
      metadata: { conflict_key: "opening_time", fact_value: "09:00" },
      url: "https://www.nus.edu.sg/nuslibraries/hours",
    },
  ]);
  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "What are the library opening hours?",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "not_verified");
  assert.deepEqual(result.groundedAnswer.warnings, ["conflicting_sources"]);
  assert.equal(result.groundedAnswer.citations.length, 2);
  assert.equal(setup.providerCalls(), 0);
});

test("refuses private records and credential extraction before retrieval", async () => {
  let retrievalCalls = 0;
  const setup = dependencies([]);
  setup.dependencies.retriever = {
    search: async () => {
      retrievalCalls += 1;
      return [];
    },
  } as unknown as HybridKnowledgeRetriever;

  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "Tell me my exam grades",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "refused");
  assert.equal(retrievalCalls, 0);
  assert.equal(setup.providerCalls(), 0);
});

test("allows guidance about resetting a password without requesting the secret", async () => {
  const setup = dependencies([]);
  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "How do I reset my NUS password?",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "not_verified");
  assert.equal(setup.providerCalls(), 0);
});

test("does not perform broad retrieval outside the approved product scope", async () => {
  let retrievalCalls = 0;
  const setup = dependencies([]);
  setup.dependencies.retriever = {
    search: async () => {
      retrievalCalls += 1;
      return [];
    },
  } as unknown as HybridKnowledgeRetriever;

  const result = await answerKnowledgeQuestion(
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "Recommend a restaurant in another country",
    },
    setup.dependencies,
  );

  assert.equal(result.groundedAnswer.status, "not_verified");
  assert.deepEqual(result.groundedAnswer.warnings, ["unsupported_knowledge_scope"]);
  assert.equal(retrievalCalls, 0);
});
