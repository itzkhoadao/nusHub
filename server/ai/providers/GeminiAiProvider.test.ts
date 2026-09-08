import assert from "node:assert/strict";
import test from "node:test";
import type { AiTelemetryEvent } from "../telemetry/aiTelemetry";
import { GeminiAiProvider } from "./GeminiAiProvider";

const requestId = "6e6c0f3a-4ca9-4ed2-8378-ddba56cf67b4";

function validOutput() {
  return JSON.stringify({
    answer: "Gemini provider connection is working.",
    citations: [],
    status: "answered",
    warnings: ["non_grounded_probe"],
  });
}

test("uses a stateless structured interaction and records content-free metrics", async () => {
  const telemetry: AiTelemetryEvent[] = [];
  let capturedRequest;
  let capturedOptions;
  const provider = new GeminiAiProvider({
    apiKey: "test-only-key",
    createInteraction: async (request, options) => {
      capturedRequest = request;
      capturedOptions = options;
      return {
        output_text: validOutput(),
        usage: { total_input_tokens: 12, total_output_tokens: 8 },
      };
    },
    maxInputChars: 2_000,
    maxOutputTokens: 800,
    model: "stable-test-model",
    recordTelemetry: (event) => telemetry.push(event),
    requestTimeoutMs: 20_000,
  });

  const result = await provider.generateAnswer({
    input: "Connectivity probe content",
    requestId,
    systemInstruction: "System instruction content",
  });

  assert.equal(capturedRequest.store, false);
  assert.equal(capturedRequest.model, "stable-test-model");
  assert.equal(capturedRequest.response_format.mime_type, "application/json");
  assert.equal(capturedRequest.generation_config.max_output_tokens, 800);
  assert.deepEqual(capturedOptions, { maxRetries: 1, timeout: 20_000 });
  assert.equal("previous_interaction_id" in capturedRequest, false);
  assert.equal("tools" in capturedRequest, false);
  assert.equal(result.answer.status, "answered");
  assert.deepEqual(result.tokenUsage, { input: 12, output: 8 });
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0].outcome, "success");
  assert.doesNotMatch(JSON.stringify(telemetry[0]), /Connectivity|System instruction|connection is working/);
});

test("rejects provider JSON that does not match the answer contract", async () => {
  const telemetry: AiTelemetryEvent[] = [];
  const provider = new GeminiAiProvider({
    apiKey: "test-only-key",
    createInteraction: async () => ({
      output_text: JSON.stringify({ answer: "Unstructured answer" }),
    }),
    maxInputChars: 2_000,
    maxOutputTokens: 800,
    model: "stable-test-model",
    recordTelemetry: (event) => telemetry.push(event),
    requestTimeoutMs: 20_000,
  });

  await assert.rejects(
    () =>
      provider.generateAnswer({
        input: "Probe",
        requestId,
        systemInstruction: "Instructions",
      }),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "AI_PROVIDER_RESPONSE_INVALID",
  );

  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0].outcome, "error");
  assert.equal(telemetry[0].errorCode, "AI_PROVIDER_RESPONSE_INVALID");
});

test("normalizes timeout failures without leaking provider details", async () => {
  const provider = new GeminiAiProvider({
    apiKey: "test-only-key",
    createInteraction: async () => {
      throw new Error("request timed out while using secret-value");
    },
    maxInputChars: 2_000,
    maxOutputTokens: 800,
    model: "stable-test-model",
    recordTelemetry: () => undefined,
    requestTimeoutMs: 20_000,
  });

  await assert.rejects(
    () =>
      provider.generateAnswer({
        input: "Probe",
        requestId,
        systemInstruction: "Instructions",
      }),
    (error) => {
      assert.ok(error instanceof Error && "code" in error);
      assert.equal(error.code, "AI_PROVIDER_TIMEOUT");
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    },
  );
});
