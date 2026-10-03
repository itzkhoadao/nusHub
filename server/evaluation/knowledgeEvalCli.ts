import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerKnowledgeQuestion } from "../ai/knowledge/answerKnowledgeQuestion";
import { GeminiEmbeddingProvider } from "../ai/knowledge/GeminiEmbeddingProvider";
import { HybridKnowledgeRetriever } from "../ai/knowledge/HybridKnowledgeRetriever";
import { PostgresKnowledgeRepository } from "../ai/knowledge/PostgresKnowledgeRepository";
import { createKnowledgeStagingPool } from "../ai/knowledge/stagingDatabase";
import { GeminiAiProvider } from "../ai/providers/GeminiAiProvider";
import { knowledgeEvaluationDatasetSchema, runKnowledgeEvaluation } from "./knowledgeEvaluation";

async function main() {
  const args = process.argv.slice(2);
  const datasetPath = path.resolve(argument(args, "--dataset") ??
    "evaluation/knowledge-cases.v1.json");
  const datasetText = await readFile(datasetPath, "utf8");
  const dataset = knowledgeEvaluationDatasetSchema.parse(JSON.parse(datasetText) as unknown);
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
    await assertCorpusReady(pool, dataset.cases.flatMap((item) => item.retrieval?.expectedUrls ?? []));
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
    });
    const report = await runKnowledgeEvaluation(dataset, {
      answer: (text, requestId) => answerKnowledgeQuestion(
        { requestId, text },
        { maxContextChars: env.AI_KNOWLEDGE_MAX_CONTEXT_CHARS, provider, retriever },
      ),
      search: (query) => retriever.search(query),
    });
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
