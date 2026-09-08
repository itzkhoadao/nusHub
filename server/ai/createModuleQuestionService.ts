import { env } from "../config/env";
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

export function createModuleQuestionService() {
  const client = new NusModsClient({
    cacheMaxEntries: env.AI_NUSMODS_CACHE_MAX_ENTRIES,
    cacheTtlMs: env.AI_NUSMODS_CACHE_TTL_MS,
    maxDocumentBytes: env.AI_NUSMODS_MAX_DOCUMENT_BYTES,
    maxStalenessMs: env.AI_NUSMODS_MAX_STALENESS_MS,
    recordTelemetry: recordNusModsTelemetry,
    timeoutMs: env.AI_NUSMODS_FETCH_TIMEOUT_MS,
  });
  const tool = new GetNusModuleTool(client);

  return (question: Parameters<typeof answerModuleQuestion>[0]) =>
    answerModuleQuestion(question, tool);
}
