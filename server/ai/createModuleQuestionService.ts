import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { createAiProvider } from "./createAiProvider";
import { answerKnowledgeQuestion } from "./knowledge/answerKnowledgeQuestion";
import { GeminiEmbeddingProvider } from "./knowledge/GeminiEmbeddingProvider";
import { HybridKnowledgeRetriever } from "./knowledge/HybridKnowledgeRetriever";
import { PostgresKnowledgeRepository } from "./knowledge/PostgresKnowledgeRepository";
import { routeKnowledgeQuery } from "./knowledge/routeKnowledgeQuery";
import { answerModuleQuestion } from "./orchestration/answerModuleQuestion";
import {
  NusModsClient,
  type NusModsTelemetryEvent,
} from "./retrieval/NusModsClient";
import { GetNusModuleTool } from "./tools/getNusModule";

function recordNusModsTelemetry(event: NusModsTelemetryEvent) {
  // Deliberately excludes query text, module data, URLs, and user identifiers.
  console.info("NUSMods retrieval telemetry", event);
}

export type UnifiedQuestionServiceDependencies = {
  answerKnowledge?: (
    input: Parameters<typeof answerKnowledgeQuestion>[0],
  ) => ReturnType<typeof answerKnowledgeQuestion>;
};

const MODULE_LANGUAGE =
  /\b(module|course|prerequisites?|preclusions?|corequisites?|timetable|lecture|tutorial|seminar|workload|units?)\b/i;

export function createModuleQuestionService(
  dependencies: UnifiedQuestionServiceDependencies = {},
) {
  const client = new NusModsClient({
    cacheMaxEntries: env.AI_NUSMODS_CACHE_MAX_ENTRIES,
    cacheTtlMs: env.AI_NUSMODS_CACHE_TTL_MS,
    maxDocumentBytes: env.AI_NUSMODS_MAX_DOCUMENT_BYTES,
    maxStalenessMs: env.AI_NUSMODS_MAX_STALENESS_MS,
    recordTelemetry: recordNusModsTelemetry,
    timeoutMs: env.AI_NUSMODS_FETCH_TIMEOUT_MS,
  });
  const tool = new GetNusModuleTool(client);
  let knowledgeService: UnifiedQuestionServiceDependencies["answerKnowledge"] =
    dependencies.answerKnowledge;

  return (question: Parameters<typeof answerModuleQuestion>[0]) => {
    const originalText = question.originalText?.trim() ?? "";
    const useKnowledge = shouldUseKnowledgeQuestion(question);

    if (!useKnowledge) return answerModuleQuestion(question, tool);
    knowledgeService ??= createKnowledgeService();
    return knowledgeService(
      {
        requestId: question.requestId ?? randomUUID(),
        signal: question.signal,
        text: originalText,
        unsafeInput: question.unsafeInput,
      },
    );
  };
}

export function shouldUseKnowledgeQuestion(
  question: Parameters<typeof answerModuleQuestion>[0],
) {
  const originalText = question.originalText?.trim() ?? "";
  const route = routeKnowledgeQuery(originalText);
  return (
    route.action === "refuse" ||
    (route.action === "retrieve" && Boolean(route.filters.sourceIds?.length)) ||
    (!question.moduleCode && !MODULE_LANGUAGE.test(originalText))
  );
}

let sharedKnowledgeDependencies:
  | Parameters<typeof answerKnowledgeQuestion>[1]
  | undefined;

function createKnowledgeDependencies() {
  sharedKnowledgeDependencies ??= (() => {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is unavailable for knowledge retrieval");
    }
    const embeddingProvider = new GeminiEmbeddingProvider({
      apiKey: env.GEMINI_API_KEY,
      dimensions: env.AI_EMBEDDING_DIMENSIONS,
      model: env.AI_EMBEDDING_MODEL,
      requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    });
    const repository = new PostgresKnowledgeRepository();
    const retriever = new HybridKnowledgeRetriever(repository, embeddingProvider, {
      candidateLimit: env.AI_KNOWLEDGE_CANDIDATE_LIMIT,
      maxSemanticDistance: env.AI_KNOWLEDGE_MAX_SEMANTIC_DISTANCE,
      recordTelemetry: (event) => {
        // Deliberately excludes query text, vectors, document text, and user IDs.
        console.info("Knowledge retrieval telemetry", event);
      },
      resultLimit: env.AI_KNOWLEDGE_RETRIEVAL_LIMIT,
    });
    return {
      maxContextChars: env.AI_KNOWLEDGE_MAX_CONTEXT_CHARS,
      provider: createAiProvider(),
      retriever,
    };
  })();
  return sharedKnowledgeDependencies;
}

function createKnowledgeService() {
  return (input: Parameters<typeof answerKnowledgeQuestion>[0]) =>
    answerKnowledgeQuestion(input, createKnowledgeDependencies());
}
