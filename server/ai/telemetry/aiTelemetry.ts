import type { AiProviderErrorCode } from "../domain/errors";

export type AiTelemetryEvent = {
  durationMs: number;
  errorCode?: AiProviderErrorCode;
  inputTokens?: number;
  model: string;
  operation: "generate_answer";
  outcome: "success" | "error";
  outputTokens?: number;
  provider: "gemini";
  requestId: string;
};

export type AiTelemetryRecorder = (event: AiTelemetryEvent) => void;

export const recordAiTelemetry: AiTelemetryRecorder = (event) => {
  // Deliberately excludes prompts, responses, user IDs, secrets, and headers.
  console.info("AI telemetry", event);
};

