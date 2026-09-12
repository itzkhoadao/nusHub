import assert from "node:assert/strict";
import test from "node:test";
import { HybridKnowledgeRetriever } from "./HybridKnowledgeRetriever";
import type { KnowledgeSearchRepository, RetrievedEvidence } from "./types";

const baseEvidence: RetrievedEvidence = {
  chunkId: "1",
  content: "The library opens at the published official time.",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  effectiveAt: null,
  fetchedAt: "2026-09-12T00:00:00.000Z",
  heading: "Hours",
  metadata: {},
  score: 0.03,
  sourceId: "nus_libraries",
  title: "Library hours",
  trustTier: "T1",
  url: "https://nus.edu.sg/nuslibraries/",
};

test("binds embedding identity and diversifies near-duplicate results", async () => {
  let received: Parameters<KnowledgeSearchRepository["hybridSearch"]>[0] | undefined;
  const repository: KnowledgeSearchRepository = {
    async hybridSearch(input) {
      received = input;
      return [baseEvidence, { ...baseEvidence, chunkId: "2" }];
    },
  };
  const retriever = new HybridKnowledgeRetriever(
    repository,
    {
      dimensions: 768,
      embedDocuments: async () => [],
      embedQuery: async () => Array.from({ length: 768 }, () => 0.01),
      model: "gemini-embedding-001",
    },
    { candidateLimit: 30, maxSemanticDistance: 0.55, resultLimit: 5 },
  );

  const results = await retriever.search({
    filters: { sourceIds: ["nus_libraries", "nus_libraries"] },
    text: "When does the library open?",
  });

  assert.equal(results.length, 1);
  assert.equal(received?.embeddingModel, "gemini-embedding-001");
  assert.equal(received?.embeddingDimensions, 768);
  assert.deepEqual(received?.filters.sourceIds, ["nus_libraries"]);
});
