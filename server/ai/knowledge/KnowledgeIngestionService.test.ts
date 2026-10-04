import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeIngestionService } from "./KnowledgeIngestionService";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import { parseKnowledgeDocument } from "./documentParser";
import { knowledgeManifestHash, type SourceApproval } from "./sourceApproval";
import { getKnowledgeSource } from "./sourceRegistry";
import { sha256 } from "./chunkDocument";
import type { KnowledgeManifest } from "./manifest";
import type { KnowledgeIngestionRepository } from "./types";

type PublishedInput = Parameters<KnowledgeIngestionRepository["publish"]>[0];
class MemoryRepository implements KnowledgeIngestionRepository {
  begun = 0;
  failed: string[] = [];
  published?: PublishedInput;
  reusable: Awaited<ReturnType<KnowledgeIngestionRepository["findVersion"]>> = null;
  async beginRun() { this.begun++; return "33333333-3333-4333-8333-333333333333"; }
  async failRun(_id: string, code: string) { this.failed.push(code); }
  async findVersion() { return this.reusable; }
  async publish(input: PublishedInput) {
    this.published = input;
    return { chunkCount: input.documents.reduce((sum, doc) => sum + doc.chunks.length, 0), documentCount: input.documents.length,
      runId: input.runId, status: "published" as const, versionId: "44444444-4444-4444-8444-444444444444" };
  }
  async reuseVersion(input: Parameters<KnowledgeIngestionRepository["reuseVersion"]>[0]) {
    return { chunkCount: this.reusable?.chunkCount ?? 0, documentCount: this.reusable?.documentCount ?? 0,
      runId: input.runId, status: "unchanged" as const, versionId: input.versionId };
  }
}
const single: KnowledgeManifest = { sourceId: "nus_libraries", documents: [
  { metadata: { page_type: "hours" }, url: "https://nus.edu.sg/nuslibraries/hours" },
] };
const multiple: KnowledgeManifest = { ...single, documents: [...single.documents,
  { metadata: { page_type: "services" }, url: "https://www.nus.edu.sg/nuslibraries/services" },
] };

async function fixture(manifest = single) {
  const repository = new MemoryRepository();
  let embeddings = 0;
  let broken = false;
  const fetcher = new SafeSourceFetcher({
    fetch: async (url) => broken ? new Response("Unavailable", { status: 503 }) : new Response(
      `<main><h1>Official ${new URL(String(url)).pathname}</h1><p>${"Current approved information. ".repeat(10)}</p></main>`,
      { headers: { "content-type": "text/html" } }),
    lookup: async () => [{ address: "93.184.216.34", family: 4 }], maxDocumentBytes: 20_000,
    now: () => Date.parse("2026-09-12T00:00:00.000Z"), timeoutMs: 1_000,
  });
  const documents = await Promise.all(manifest.documents.map(async (doc) => {
    const parsed = await parseKnowledgeDocument(await fetcher.fetch(getKnowledgeSource(manifest.sourceId), doc.url), { ...doc, metadata: doc.metadata ?? {} });
    return { canonicalUrl: parsed.canonicalUrl, contentHash: sha256(parsed.content) };
  }));
  const approval: SourceApproval = { sourceId: manifest.sourceId, manifestHash: knowledgeManifestHash(manifest),
    registryVersion: "test-registry", inspectedAt: "2026-09-12T00:00:00.000Z", reviewedAt: "2026-09-12T00:01:00.000Z",
    reviewer: "Test reviewer", decision: "approved", notes: "Synthetic test fixture only", documents };
  const options = { approval, now: () => new Date("2026-09-12T00:02:00.000Z"), embeddingBatchSize: 2,
    embeddingProvider: { dimensions: 768, model: "gemini-embedding-001",
      embedDocuments: async (inputs: string[]) => { embeddings++; return inputs.map(() => Array(768).fill(0.01) as number[]); },
      embedQuery: async () => [] }, fetcher, registryVersion: "test-registry", repository };
  return { options, repository, approval, service: new KnowledgeIngestionService(options),
    embeddings: () => embeddings, breakFetch: () => { broken = true; } };
}

test("approval cannot be bypassed through the service, before starting a run", async () => {
  const f = await fixture();
  const service = new KnowledgeIngestionService({ ...f.options, approval: undefined });
  await assert.rejects(service.ingestSource(single), /approval is required/);
  assert.equal(f.repository.begun, 0);
  assert.equal(f.embeddings(), 0);
});
test("manifest mismatch and expired approvals fail before embedding or publishing", async () => {
  const f = await fixture();
  await assert.rejects(f.service.ingestSource(multiple), /does not match/);
  const expired = new KnowledgeIngestionService({ ...f.options, now: () => new Date("2027-09-12T00:00:00.000Z") });
  await assert.rejects(expired.ingestSource(single), /freshness window/);
  assert.equal(f.repository.begun, 0);
  assert.equal(f.embeddings(), 0);
});
test("content drift fails before embeddings and immutable version reuse", async () => {
  const f = await fixture();
  f.approval.documents[0].contentHash = "0".repeat(64);
  f.repository.reusable = { id: "44444444-4444-4444-8444-444444444444", chunkCount: 1, documentCount: 1, status: "published" };
  await assert.rejects(f.service.ingestSource(single), /differs/);
  assert.equal(f.embeddings(), 0);
  assert.equal(f.repository.published, undefined);
  assert.deepEqual(f.repository.failed, ["SOURCE_APPROVAL_CHANGED"]);
});
test("publishes a complete multi-document snapshot with approval provenance", async () => {
  const f = await fixture(multiple);
  const result = await f.service.ingestSource(multiple);
  assert.equal(result.documentCount, 2);
  assert.equal(f.repository.published?.metadata.approval_manifest_hash, f.approval.manifestHash);
  assert.equal(f.repository.published?.embeddingModel, "gemini-embedding-001");
  assert.ok(f.embeddings() >= 2);
});
test("unchanged content reuses an immutable version without embedding again", async () => {
  const f = await fixture();
  const first = await f.service.ingestSource(single);
  const calls = f.embeddings();
  f.repository.reusable = { id: first.versionId as string, chunkCount: first.chunkCount, documentCount: first.documentCount, status: "published" };
  assert.equal((await f.service.ingestSource(single)).status, "unchanged");
  assert.equal(f.embeddings(), calls);
});
test("invalid metadata and a pre-cancelled request start no ingestion run", async () => {
  const f = await fixture();
  await assert.rejects(f.service.ingestSource({ sourceId: single.sourceId, documents: [{}] }), /missing page_type/);
  await assert.rejects(f.service.ingestSource({ ...single, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(f.repository.begun, 0);
});
test("failed refresh preserves the last published snapshot", async () => {
  const f = await fixture(multiple);
  await f.service.ingestSource(multiple);
  const published = f.repository.published;
  f.breakFetch();
  await assert.rejects(f.service.ingestSource(multiple), /approved source did not return/);
  assert.equal(f.repository.published, published);
  assert.deepEqual(f.repository.failed, ["SOURCE_FETCH_FAILED"]);
});
