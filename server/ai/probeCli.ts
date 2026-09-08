import { randomUUID } from "node:crypto";
import { aiConfig } from "./config/aiConfig";
import { createAiProvider } from "./createAiProvider";
import {
  NUS_ASSISTANT_SYSTEM_INSTRUCTION,
  PROVIDER_PROBE_INPUT,
} from "./prompts/nusAssistant.v1";

async function runProbe() {
  const provider = createAiProvider();
  const result = await provider.generateAnswer({
    input: PROVIDER_PROBE_INPUT,
    requestId: randomUUID(),
    systemInstruction: NUS_ASSISTANT_SYSTEM_INSTRUCTION,
  });

  console.log("Validated Gemini provider probe", {
    answer: result.answer.answer,
    model: result.model,
    status: result.answer.status,
    tokenUsage: result.tokenUsage,
  });
}

runProbe().catch((error: unknown) => {
  console.error("Gemini provider probe failed", {
    code:
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : "AI_PROBE_FAILED",
    enabled: aiConfig.enabled,
    model: aiConfig.generationModel,
  });
  process.exitCode = 1;
});

