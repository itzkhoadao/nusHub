import { env } from "../config/env";
import { aiConfig } from "./config/aiConfig";
import { GeminiAiProvider } from "./providers/GeminiAiProvider";

export function createAiProvider() {
  if (!aiConfig.enabled || !env.GEMINI_API_KEY) {
    throw new Error("AI is disabled or GEMINI_API_KEY is unavailable");
  }

  return new GeminiAiProvider({
    apiKey: env.GEMINI_API_KEY,
    maxInputChars: aiConfig.maxContextChars,
    maxOutputTokens: aiConfig.maxOutputTokens,
    model: aiConfig.generationModel,
    requestTimeoutMs: aiConfig.requestTimeoutMs,
  });
}
