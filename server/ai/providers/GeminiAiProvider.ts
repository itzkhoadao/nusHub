import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AiProviderError } from "../domain/errors";
import {
  groundedAnswerSchema,
  type AiProviderRequest,
  type AiProviderResult,
} from "../domain/types";
import type { AiProvider } from "./AiProvider";
import {
  recordAiTelemetry,
  type AiTelemetryRecorder,
} from "../telemetry/aiTelemetry";

type InteractionRequest = {
  generation_config: { max_output_tokens: number };
  input: string;
  labels: Record<string, string>;
  model: string;
  response_format: {
    mime_type: "application/json";
    schema: Record<string, unknown>;
    type: "text";
  };
  store: false;
  system_instruction: string;
};

type InteractionResponse = {
  output_text?: string;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
};

type CreateInteraction = (
  request: InteractionRequest,
  options: { maxRetries: number; timeout: number },
) => Promise<InteractionResponse>;

export type GeminiAiProviderOptions = {
  apiKey: string;
  createInteraction?: CreateInteraction;
  maxInputChars: number;
  maxOutputTokens: number;
  model: string;
  recordTelemetry?: AiTelemetryRecorder;
  requestTimeoutMs: number;
};

const providerRequestSchema = z.object({
  input: z.string().trim().min(1),
  requestId: z.string().uuid(),
  systemInstruction: z.string().trim().min(1),
});

const groundedAnswerJsonSchema: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    citations: {
      items: {
        additionalProperties: false,
        properties: {
          claimIds: { items: { type: "string" }, type: "array" },
          documentVersionId: { type: "string" },
          effectiveAt: { type: ["string", "null"] },
          retrievedAt: { type: "string" },
          sourceId: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
        },
        required: [
          "claimIds",
          "documentVersionId",
          "effectiveAt",
          "retrievedAt",
          "sourceId",
          "title",
          "url",
        ],
        type: "object",
      },
      type: "array",
    },
    followUpQuestion: { type: "string" },
    status: {
      enum: [
        "answered",
        "needs_clarification",
        "not_verified",
        "refused",
      ],
      type: "string",
    },
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: ["answer", "citations", "status", "warnings"],
  type: "object",
};

function classifyProviderError(error: unknown) {
  if (error instanceof AiProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown provider failure";
  const timedOut = /abort|timeout|timed out/i.test(message);

  return new AiProviderError(
    timedOut ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE",
    timedOut ? "The AI provider request timed out." : "The AI provider request failed.",
    { cause: error },
  );
}

export class GeminiAiProvider implements AiProvider {
  private readonly createInteraction: CreateInteraction;
  private readonly maxInputChars: number;
  private readonly maxOutputTokens: number;
  private readonly model: string;
  private readonly recordTelemetry: AiTelemetryRecorder;
  private readonly requestTimeoutMs: number;

  constructor(options: GeminiAiProviderOptions) {
    const client = options.createInteraction
      ? null
      : new GoogleGenAI({ apiKey: options.apiKey });

    this.createInteraction =
      options.createInteraction ??
      ((request, requestOptions) =>
        client!.interactions.create(request, requestOptions));
    this.maxInputChars = options.maxInputChars;
    this.maxOutputTokens = options.maxOutputTokens;
    this.model = options.model;
    this.recordTelemetry = options.recordTelemetry ?? recordAiTelemetry;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  async generateAnswer(request: AiProviderRequest): Promise<AiProviderResult> {
    const startedAt = Date.now();
    let errorCode: AiProviderError["code"] | undefined;

    try {
      const input = providerRequestSchema.parse(request);

      if (input.input.length > this.maxInputChars) {
        throw new AiProviderError(
          "AI_PROVIDER_RESPONSE_INVALID",
          "The AI provider input exceeds its configured limit.",
        );
      }

      const interaction = await this.createInteraction(
        {
          generation_config: { max_output_tokens: this.maxOutputTokens },
          input: input.input,
          labels: { request_id: input.requestId },
          model: this.model,
          response_format: {
            mime_type: "application/json",
            schema: groundedAnswerJsonSchema,
            type: "text",
          },
          store: false,
          system_instruction: input.systemInstruction,
        },
        { maxRetries: 1, timeout: this.requestTimeoutMs },
      );

      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(interaction.output_text ?? "");
      } catch (error) {
        throw new AiProviderError(
          "AI_PROVIDER_RESPONSE_INVALID",
          "The AI provider returned invalid JSON.",
          { cause: error },
        );
      }

      const answer = groundedAnswerSchema.safeParse(parsedOutput);
      if (!answer.success) {
        throw new AiProviderError(
          "AI_PROVIDER_RESPONSE_INVALID",
          "The AI provider response did not match the required contract.",
          { cause: answer.error },
        );
      }

      this.recordTelemetry({
        durationMs: Date.now() - startedAt,
        inputTokens: interaction.usage?.total_input_tokens,
        model: this.model,
        operation: "generate_answer",
        outcome: "success",
        outputTokens: interaction.usage?.total_output_tokens,
        provider: "gemini",
        requestId: input.requestId,
      });

      return {
        answer: answer.data,
        model: this.model,
        tokenUsage: {
          input: interaction.usage?.total_input_tokens ?? null,
          output: interaction.usage?.total_output_tokens ?? null,
        },
      };
    } catch (error) {
      const providerError = classifyProviderError(error);
      errorCode = providerError.code;
      this.recordTelemetry({
        durationMs: Date.now() - startedAt,
        errorCode,
        model: this.model,
        operation: "generate_answer",
        outcome: "error",
        provider: "gemini",
        requestId: request.requestId,
      });
      throw providerError;
    }
  }
}

