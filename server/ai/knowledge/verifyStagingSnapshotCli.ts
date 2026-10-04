import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { KnowledgeIngestionService } from "./KnowledgeIngestionService";
import { loadKnowledgeManifest } from "./manifest";
import { PostgresKnowledgeRepository } from "./PostgresKnowledgeRepository";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import { assertSourceApproval, loadSourceApproval } from "./sourceApproval";
import { getKnowledgeSource, KNOWLEDGE_SOURCE_REGISTRY_VERSION } from "./sourceRegistry";
import { createKnowledgeStagingPool } from "./stagingDatabase";

async function main() {
  const args = process.argv.slice(2);
  const argument = (flag: string) => {
    const index = args.indexOf(flag);
    const value = index >= 0 ? args[index + 1] : undefined;
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  const manifest = await loadKnowledgeManifest(path.resolve(argument("--manifest")));
  const approval = await loadSourceApproval(path.resolve(argument("--approval")));
  assertSourceApproval(approval, manifest, KNOWLEDGE_SOURCE_REGISTRY_VERSION,
    getKnowledgeSource(manifest.sourceId).maxStalenessHours);
  const pool = createKnowledgeStagingPool();
  try {
    const snapshot = async () => (await pool.query(
      `SELECT sv.id, sv.content_hash, sv.status, d.id AS document_id, c.id AS chunk_id, c.content_hash AS chunk_hash
       FROM ai_source_versions sv JOIN ai_documents d ON d.source_version_id = sv.id
       JOIN ai_chunks c ON c.document_id = d.id
       WHERE sv.source_id = $1 AND sv.status = 'published' ORDER BY d.id, c.id`, [manifest.sourceId],
    )).rows;
    const before = await snapshot();
    if (!before.length) throw new Error("Publish an approved source to staging before verification");
    // Intentional mismatch exercises the real fetch/parser/approval path and actual database run ledger.
    // This is failure injection, not a new human approval, and can never publish the fetched text.
    const service = new KnowledgeIngestionService({
      runMetadata: { staging_test: "approval_content_drift_failure_injection" },
      approval: { ...approval, documents: approval.documents.map((document) => ({ ...document, contentHash: "0".repeat(64) })) },
      embeddingBatchSize: 1,
      embeddingProvider: { dimensions: 768, model: "gemini-embedding-001",
        embedDocuments: async () => { throw new Error("Failure injection unexpectedly reached embeddings"); },
        embedQuery: async () => { throw new Error("Failure injection unexpectedly reached embeddings"); },
      },
      fetcher: new SafeSourceFetcher({ maxDocumentBytes: 10 * 1024 * 1024, timeoutMs: 15_000 }),
      registryVersion: KNOWLEDGE_SOURCE_REGISTRY_VERSION, repository: new PostgresKnowledgeRepository(pool),
    });
    let failureCode: string | null = null;
    try {
      await service.ingestSource(manifest);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && typeof error.code === "string") failureCode = error.code;
      else throw error;
    }
    const after = await snapshot();
    const snapshotPreserved = JSON.stringify(before) === JSON.stringify(after);
    if (failureCode !== "SOURCE_APPROVAL_CHANGED" || !snapshotPreserved) throw new Error("Failed-refresh preservation verification failed");
    const failures = await pool.query<{ id: string; status: string; error_code: string }>(
      `SELECT id, status, error_code FROM ai_ingestion_runs WHERE source_id = $1
       AND metadata->>'staging_test' = 'approval_content_drift_failure_injection'
       ORDER BY started_at DESC LIMIT 1`, [manifest.sourceId],
    );
    if (failures.rows[0]?.status !== "failed" || failures.rows[0]?.error_code !== failureCode) throw new Error("Failed run was not recorded correctly");
    const report = { checkedAt: new Date().toISOString(), environment: "staging", sourceId: manifest.sourceId,
      scenario: "approved_content_drift_failure_injection", failureCode, snapshotPreserved,
      publishedChunkCount: after.length, versionId: after[0].id, failedRun: failures.rows[0],
    };
    await writeFile(path.resolve(argument("--out")), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log("Real staging failed-refresh preservation verified", report);
  } finally { await pool.end(); }
}

void main().catch(() => {
  console.error("Staging snapshot verification failed; inspect configuration, approved corpus and database ledger.");
  process.exitCode = 1;
});
