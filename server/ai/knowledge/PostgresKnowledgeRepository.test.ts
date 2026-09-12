import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresKnowledgeRepository } from "./PostgresKnowledgeRepository";

test("performs filtered reciprocal-rank fusion in the configured embedding space", async () => {
  let sql = "";
  let parameters: unknown[] = [];
  const databasePool = {
    async query(query: string, values: unknown[]) {
      sql = query;
      parameters = values;
      return {
        rows: [{
          chunkId: "12",
          content: "Official information",
          documentVersionId: "11111111-1111-4111-8111-111111111111",
          effectiveAt: null,
          fetchedAt: new Date("2026-09-12T00:00:00.000Z"),
          heading: null,
          metadata: { page_type: "hours" },
          score: "0.03",
          sourceId: "nus_libraries",
          title: "Library",
          trustTier: "T1",
          url: "https://nus.edu.sg/nuslibraries/",
        }],
      };
    },
  } as unknown as Pool;
  const repository = new PostgresKnowledgeRepository(databasePool);

  const results = await repository.hybridSearch({
    candidateLimit: 50,
    embedding: Array.from({ length: 768 }, () => 0.01),
    embeddingDimensions: 768,
    embeddingModel: "gemini-embedding-001",
    filters: {
      metadata: { page_type: "hours" },
      sourceIds: ["nus_libraries"],
      trustTiers: ["T1"],
    },
    limit: 5,
    maxSemanticDistance: 0.55,
    text: "library opening hours",
  });

  assert.match(sql, /websearch_to_tsquery/);
  assert.match(sql, /FULL OUTER JOIN semantic_ranked/);
  assert.match(sql, /embedding_model = 'gemini-embedding-001'/);
  assert.match(sql, /sv\.status = 'published'/);
  assert.equal(parameters[4]?.toString(), "nus_libraries");
  assert.equal(parameters[9], 0.55);
  assert.equal(results[0].fetchedAt, "2026-09-12T00:00:00.000Z");
  assert.equal(results[0].score, 0.03);
});
