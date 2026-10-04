import path from "node:path";
import { env } from "../../config/env";
import { GeminiEmbeddingProvider } from "./GeminiEmbeddingProvider";
import { KnowledgeIngestionService } from "./KnowledgeIngestionService";
import { loadKnowledgeManifest } from "./manifest";
import { PostgresKnowledgeRepository } from "./PostgresKnowledgeRepository";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import { KNOWLEDGE_SOURCE_REGISTRY_VERSION } from "./sourceRegistry";
import { createKnowledgeStagingPool } from "./stagingDatabase";
import { assertSourceApproval, loadSourceApproval } from "./sourceApproval";
import { getKnowledgeSource } from "./sourceRegistry";

async function main() {
  const args = process.argv.slice(2);
  const staging = args.includes("--staging");
  const production = args.includes("--production");
  if (staging === production) {
    throw new Error("Specify exactly one of --staging or --production for knowledge ingestion.");
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for knowledge ingestion.");
  }
  const manifestPath = readManifestArgument(args);
  const manifest = await loadKnowledgeManifest(path.resolve(manifestPath));
  const approvalIndex = args.indexOf("--approval");
  const approvalPath = approvalIndex >= 0 ? args[approvalIndex + 1] : undefined;
  if (!approvalPath || approvalPath.startsWith("--")) {
    throw new Error("Ingestion requires --approval path/to/human-source-approval.json after preview review.");
  }
  const approval = await loadSourceApproval(path.resolve(approvalPath));
  assertSourceApproval(approval, manifest, KNOWLEDGE_SOURCE_REGISTRY_VERSION,
    getKnowledgeSource(manifest.sourceId).maxStalenessHours);
  const databasePool = staging ? createKnowledgeStagingPool() : (await import("../../db")).pool;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);

  try {
    const embeddingProvider = new GeminiEmbeddingProvider({
      apiKey: env.GEMINI_API_KEY,
      dimensions: env.AI_EMBEDDING_DIMENSIONS,
      model: env.AI_EMBEDDING_MODEL,
      requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    });
    const service = new KnowledgeIngestionService({
      approval,
      embeddingBatchSize: env.AI_KNOWLEDGE_EMBEDDING_BATCH_SIZE,
      embeddingProvider,
      fetcher: new SafeSourceFetcher({
        maxDocumentBytes: env.AI_KNOWLEDGE_MAX_DOCUMENT_BYTES,
        timeoutMs: env.AI_KNOWLEDGE_FETCH_TIMEOUT_MS,
      }),
      registryVersion: KNOWLEDGE_SOURCE_REGISTRY_VERSION,
      repository: new PostgresKnowledgeRepository(databasePool),
    });
    const result = await service.ingestSource({ ...manifest, signal: controller.signal });
    console.log("Knowledge snapshot ingestion completed", result);
  } finally {
    process.off("SIGINT", cancel);
    await databasePool.end();
  }
}

function readManifestArgument(arguments_: string[]) {
  const position = arguments_.indexOf("--manifest");
  const value = position >= 0 ? arguments_[position + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: npm run ai:ingest -- --staging|--production --manifest path/to/manifest.json");
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error("Knowledge ingestion failed", {
    code:
      error && typeof error === "object" && "code" in error
        ? error.code
        : "INGESTION_FAILED",
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  process.exitCode = 1;
});
