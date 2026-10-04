import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { answerKnowledgeQuestion } from "../ai/knowledge/answerKnowledgeQuestion";
import { GeminiEmbeddingProvider } from "../ai/knowledge/GeminiEmbeddingProvider";
import { HybridKnowledgeRetriever, KNOWLEDGE_RETRIEVAL_POLICY_VERSION } from "../ai/knowledge/HybridKnowledgeRetriever";
import { PostgresKnowledgeRepository } from "../ai/knowledge/PostgresKnowledgeRepository";
import { createKnowledgeStagingPool } from "../ai/knowledge/stagingDatabase";
import { GeminiAiProvider } from "../ai/providers/GeminiAiProvider";
import { knowledgeEvaluationDatasetSchema, runKnowledgeEvaluation } from "./knowledgeEvaluation";
import { sha256 } from "../ai/knowledge/chunkDocument";
import { KNOWLEDGE_SOURCE_REGISTRY_VERSION } from "../ai/knowledge/sourceRegistry";

async function main() {
  const args = process.argv.slice(2);
  const datasetPath = path.resolve(argument(args, "--dataset") ??
    "evaluation/knowledge-cases.v1.json");
  const datasetText = await readFile(datasetPath, "utf8");
  const dataset = knowledgeEvaluationDatasetSchema.parse(JSON.parse(datasetText) as unknown);
  const selection = argument(args, "--cases")?.split(",");
  if (selection && (new Set(selection).size !== selection.length ||
    selection.some((id) => !dataset.cases.some((item) => item.id === id)))) {
    throw new Error("--cases must list unique case IDs from the dataset");
  }
  const selectedDataset = selection ? { ...dataset, cases: dataset.cases.filter((item) => selection.includes(item.id)) } : dataset;
  if (!args.includes("--run")) {
    console.log("Knowledge evaluation dataset validated", {
      cases: dataset.cases.length,
      reviewStatus: dataset.reviewStatus,
      version: dataset.version,
    });
    return;
  }
  const outputPath = argument(args, "--out");
  if (!outputPath) throw new Error("--run requires --out path/to/report.json");
  const pool = createKnowledgeStagingPool();
  try {
    const { env } = await import("../config/env");
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for live evaluation");
    await assertCorpusReady(pool, selectedDataset.cases.flatMap((item) => item.retrieval?.expectedUrls ?? []));
    const embeddingProvider = new GeminiEmbeddingProvider({
      apiKey: env.GEMINI_API_KEY,
      dimensions: env.AI_EMBEDDING_DIMENSIONS,
      model: env.AI_EMBEDDING_MODEL,
      requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    });
    const retriever = new HybridKnowledgeRetriever(
      new PostgresKnowledgeRepository(pool), embeddingProvider, {
        candidateLimit: env.AI_KNOWLEDGE_CANDIDATE_LIMIT,
        maxSemanticDistance: env.AI_KNOWLEDGE_MAX_SEMANTIC_DISTANCE,
        resultLimit: 5,
      },
    );
    const provider = new GeminiAiProvider({
      apiKey: env.GEMINI_API_KEY,
      maxInputChars: env.AI_MAX_CONTEXT_CHARS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      model: env.AI_GENERATION_MODEL,
      requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
      thinkingLevel: env.AI_THINKING_LEVEL,
    });
    const executionCounts = { answerRetrievalCalls: 0, generationCalls: 0 };
    const startedAt = new Date().toISOString();
    const sourceSnapshot = (await pool.query(
      `SELECT source_id, id AS version_id, content_hash, verified_at FROM ai_source_versions
       WHERE status = 'published' ORDER BY source_id, id`,
    )).rows;
    const codeRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    const results = await runKnowledgeEvaluation(selectedDataset, {
      answer: (text, requestId) => answerKnowledgeQuestion(
        { requestId, text },
        { maxContextChars: env.AI_KNOWLEDGE_MAX_CONTEXT_CHARS,
          provider: { generateAnswer: request => {
            executionCounts.generationCalls++;
            return provider.generateAnswer(request);
          } },
          retriever: { search: (query, signal) => {
            executionCounts.answerRetrievalCalls++;
            return retriever.search(query, signal);
          } },
        },
      ),
      search: (query) => retriever.search(query),
      executionCounts: () => ({ ...executionCounts }),
    });
    const report = {
      ...results,
      datasetSnapshot: dataset,
      runManifest: {
        runId: randomUUID(), startedAt, codeRevision, workingTreeDirty, sourceSnapshot,
        datasetHash: sha256(datasetText),
        caseIds: selectedDataset.cases.map((item) => item.id),
        excludedCaseIds: dataset.cases.filter((item) => !selectedDataset.cases.includes(item)).map((item) => item.id),
        scope: selection ? "development_subset" : "full_dataset",
        generationModel: env.AI_GENERATION_MODEL,
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        thinkingLevel: env.AI_THINKING_LEVEL,
        embeddingModel: env.AI_EMBEDDING_MODEL,
        embeddingDimensions: env.AI_EMBEDDING_DIMENSIONS,
        sourceRegistryVersion: KNOWLEDGE_SOURCE_REGISTRY_VERSION,
        retrievalPolicyVersion: KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
        requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
        maxContextChars: env.AI_KNOWLEDGE_MAX_CONTEXT_CHARS,
        candidateLimit: env.AI_KNOWLEDGE_CANDIDATE_LIMIT,
        maxSemanticDistance: env.AI_KNOWLEDGE_MAX_SEMANTIC_DISTANCE,
        environment: "staging",
      },
    };
    const resolved = path.resolve(outputPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8", flag: "wx",
    });
    console.log("Knowledge evaluation completed", {
      output: resolved,
      summary: report.summary,
      releaseStatus: report.releaseStatus,
    });
    if (report.summary.automaticPassCount !== report.summary.caseCount) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function assertCorpusReady(pool: ReturnType<typeof createKnowledgeStagingPool>, urls: string[]) {
  const expected = [...new Set(urls)];
  const migrated = await pool.query<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = 12",
  );
  if (migrated.rowCount !== 1) throw new Error("Knowledge migration 012 is missing on staging");
  const found = await pool.query<{ canonical_url: string }>(
    `SELECT d.canonical_url FROM ai_documents d
     JOIN ai_source_versions sv ON sv.id = d.source_version_id
     WHERE sv.status = 'published' AND d.canonical_url = ANY($1::text[])`,
    [expected],
  );
  const present = new Set(found.rows.map((row) => row.canonical_url));
  const missing = expected.filter((url) => !present.has(url));
  if (missing.length) {
    throw new Error(`Staging corpus is missing ${missing.length} expected documents: ${missing.join(", ")}`);
  }
}

function argument(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

void main().catch((error: unknown) => {
  console.error("Knowledge evaluation failed", {
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  process.exitCode = 1;
});
