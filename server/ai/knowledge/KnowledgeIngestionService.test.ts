import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeIngestionService } from "./KnowledgeIngestionService";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import type {
  KnowledgeIngestionRepository,
} from "./types";

type PublishedInput = Parameters<KnowledgeIngestionRepository["publish"]>[0];

class MemoryRepository implements KnowledgeIngestionRepository {
  failed: string[] = [];
  published?: PublishedInput;
  reusable: Awaited<ReturnType<KnowledgeIngestionRepository["findVersion"]>> = null;

  async beginRun() { return "33333333-3333-4333-8333-333333333333"; }
  async failRun(_runId: string, errorCode: string) { this.failed.push(errorCode); }
  async findVersion() { return this.reusable; }
  async publish(input: PublishedInput) {
    this.published = input;
    return {
      chunkCount: input.documents.reduce((sum, item) => sum + item.chunks.length, 0),
      documentCount: input.documents.length,
      runId: input.runId,
      status: "published" as const,
      versionId: "44444444-4444-4444-8444-444444444444",
    };
  }
  async reuseVersion(input: Parameters<KnowledgeIngestionRepository["reuseVersion"]>[0]) {
    return {
      chunkCount: this.reusable?.chunkCount ?? 0,
      documentCount: this.reusable?.documentCount ?? 0,
      runId: input.runId,
      status: "unchanged" as const,
      versionId: input.versionId,
    };
  }
}

function createService(repository: MemoryRepository, onEmbed: () => void) {
  const fetcher = new SafeSourceFetcher({
    fetch: async (url) => {
      const value = url instanceof Request ? url.url : url;
      return new Response(
        `<main><h1>Official ${new URL(value).pathname}</h1><p>${"Current approved information. ".repeat(10)}</p></main>`,
        { headers: { "content-type": "text/html" } },
      );
    },
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    maxDocumentBytes: 20_000,
    now: () => Date.parse("2026-09-12T00:00:00.000Z"),
    timeoutMs: 1_000,
  });
  return new KnowledgeIngestionService({
    embeddingBatchSize: 2,
    embeddingProvider: {
      dimensions: 768,
      async embedDocuments(inputs) {
        onEmbed();
        return inputs.map(() => Array.from({ length: 768 }, () => 0.01));
      },
      async embedQuery() { return []; },
      model: "gemini-embedding-001",
    },
    fetcher,
    registryVersion: "test-registry",
    repository,
  });
}

test("publishes a multi-document source snapshot atomically", async () => {
  const repository = new MemoryRepository();
  let embeddingCalls = 0;
  const service = createService(repository, () => { embeddingCalls += 1; });

  const result = await service.ingestSource({
    documents: [
      { metadata: { page_type: "hours" }, url: "https://nus.edu.sg/nuslibraries/hours" },
      { metadata: { page_type: "services" }, url: "https://www.nus.edu.sg/nuslibraries/services" },
    ],
    sourceId: "nus_libraries",
  });

  assert.equal(result.documentCount, 2);
  assert.equal(repository.published?.documents.length, 2);
  assert.equal(repository.published?.embeddingModel, "gemini-embedding-001");
  assert.ok(embeddingCalls >= 2);
  assert.deepEqual(repository.failed, []);
});

test("reuses an identical immutable version without embedding", async () => {
  const repository = new MemoryRepository();
  let embeddingCalls = 0;
  const service = createService(repository, () => { embeddingCalls += 1; });
  const first = await service.ingest({
    metadata: { page_type: "hours" },
    sourceId: "nus_libraries",
  });
  const callsAfterFirstIngestion = embeddingCalls;
  repository.reusable = {
    chunkCount: first.chunkCount,
    documentCount: first.documentCount,
    id: first.versionId as string,
    status: "published",
  };
  repository.published = undefined;

  const second = await service.ingest({
    metadata: { page_type: "hours" },
    sourceId: "nus_libraries",
  });

  assert.equal(second.status, "unchanged");
  assert.equal(repository.published, undefined);
  assert.equal(embeddingCalls, callsAfterFirstIngestion);
});

test("rejects required metadata before starting a source run", async () => {
  const repository = new MemoryRepository();
  const service = createService(repository, () => undefined);
  await assert.rejects(
    service.ingest({ sourceId: "nus_libraries" }),
    /Required source metadata is missing: page_type/,
  );
});
