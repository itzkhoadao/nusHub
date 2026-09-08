import { env } from "../../config/env";

export type AiConfig = {
  dailyRequestLimitPerUser: number;
  enabled: boolean;
  generationModel: string;
  maxConcurrentRequestsPerUser: number;
  maxInputChars: number;
  maxOutputTokens: number;
  provider: "gemini";
  requestTimeoutMs: number;
  storeInteractions: false;
};

export const aiConfig: AiConfig = Object.freeze({
  dailyRequestLimitPerUser: env.AI_DAILY_REQUEST_LIMIT_PER_USER,
  enabled: env.AI_ENABLED,
  generationModel: env.AI_GENERATION_MODEL,
  maxInputChars: env.AI_MAX_INPUT_CHARS,
  maxConcurrentRequestsPerUser: env.AI_MAX_CONCURRENT_REQUESTS_PER_USER,
  maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  provider: env.AI_PROVIDER,
  requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  storeInteractions: false,
});
