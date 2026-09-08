import { env } from "../../config/env";

export type AiConfig = {
  enabled: boolean;
  generationModel: string;
  maxInputChars: number;
  maxOutputTokens: number;
  provider: "gemini";
  requestTimeoutMs: number;
  storeInteractions: false;
};

export const aiConfig: AiConfig = Object.freeze({
  enabled: env.AI_ENABLED,
  generationModel: env.AI_GENERATION_MODEL,
  maxInputChars: env.AI_MAX_INPUT_CHARS,
  maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  provider: env.AI_PROVIDER,
  requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  storeInteractions: false,
});

