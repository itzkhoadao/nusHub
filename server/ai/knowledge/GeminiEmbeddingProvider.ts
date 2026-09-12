import { GoogleGenAI } from "@google/genai";
import type { EmbeddingProvider } from "./types";

type EmbedResponse = { embeddings?: Array<{ values?: number[] }> };
type EmbedContent = (input: {
  config: {
    abortSignal?: AbortSignal;
    httpOptions: {
      retryOptions: {
        attempts: number;
        expBase: number;
        httpStatusCodes: number[];
        initialDelay: number;
        jitter: number;
        maxDelay: number;
      };
      timeout: number;
    };
    outputDimensionality: number;
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
    title?: string;
  };
  contents: string[];
  model: string;
}) => Promise<EmbedResponse>;

export type GeminiEmbeddingProviderOptions = {
  apiKey: string;
  dimensions: number;
  embedContent?: EmbedContent;
  model: string;
  requestTimeoutMs: number;
};

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly model: string;
  private readonly embedContent: EmbedContent;
  private readonly requestTimeoutMs: number;

  constructor(options: GeminiEmbeddingProviderOptions) {
    if (
      !options.model.trim() ||
      !Number.isInteger(options.dimensions) ||
      options.dimensions < 1 ||
      options.dimensions > 3_072 ||
      !Number.isInteger(options.requestTimeoutMs) ||
      options.requestTimeoutMs < 1
    ) {
      throw new RangeError("Invalid embedding provider configuration");
    }
    const client = options.embedContent
      ? null
      : new GoogleGenAI({ apiKey: options.apiKey });
    this.dimensions = options.dimensions;
    this.model = options.model;
    this.embedContent =
      options.embedContent ??
      ((input) => client!.models.embedContent(input));
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  embedDocuments(inputs: string[], title: string, signal?: AbortSignal) {
    return this.embed(inputs, "RETRIEVAL_DOCUMENT", signal, title);
  }

  async embedQuery(input: string, signal?: AbortSignal) {
    return (await this.embed([input], "RETRIEVAL_QUERY", signal))[0];
  }

  private async embed(
    inputs: string[],
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
    signal?: AbortSignal,
    title?: string,
  ) {
    if (inputs.length === 0 || inputs.some((input) => !input.trim())) {
      throw new EmbeddingProviderError(
        "EMBEDDING_INPUT_INVALID",
        "Embedding inputs must contain text.",
      );
    }
    if (signal?.aborted) {
      throw new EmbeddingProviderError(
        "EMBEDDING_CANCELLED",
        "Embedding was cancelled.",
      );
    }

    let response: EmbedResponse;
    try {
      response = await this.embedContent({
        config: {
          abortSignal: signal,
          httpOptions: {
            retryOptions: {
              attempts: 3,
              expBase: 2,
              httpStatusCodes: [408, 429, 500, 502, 503, 504],
              initialDelay: 0.5,
              jitter: 0.5,
              maxDelay: 4,
            },
            timeout: this.requestTimeoutMs,
          },
          outputDimensionality: this.dimensions,
          taskType,
          ...(title ? { title: title.slice(0, 500) } : {}),
        },
        contents: inputs,
        model: this.model,
      });
    } catch (error) {
      const cancelled = signal?.aborted ||
        (error instanceof Error && /abort|cancel/i.test(error.message));
      throw new EmbeddingProviderError(
        cancelled ? "EMBEDDING_CANCELLED" : "EMBEDDING_PROVIDER_FAILED",
        cancelled
          ? "Embedding was cancelled."
          : "The embedding provider request failed.",
        { cause: error },
      );
    }

    if (response.embeddings?.length !== inputs.length) {
      throw new EmbeddingProviderError(
        "EMBEDDING_RESPONSE_INVALID",
        "The embedding provider returned an unexpected result count.",
      );
    }

    return response.embeddings.map((embedding) =>
      validateAndNormalize(embedding.values, this.dimensions, this.model),
    );
  }
}

function validateAndNormalize(
  values: number[] | undefined,
  dimensions: number,
  model: string,
) {
  if (
    !values ||
    values.length !== dimensions ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new EmbeddingProviderError(
      "EMBEDDING_RESPONSE_INVALID",
      "The embedding provider returned an invalid vector.",
    );
  }
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbeddingProviderError(
      "EMBEDDING_RESPONSE_INVALID",
      "The embedding provider returned a zero vector.",
    );
  }

  // Gemini Embedding 001 requires manual normalization below 3072 dimensions.
  return model === "gemini-embedding-001" && dimensions !== 3_072
    ? values.map((value) => value / norm)
    : values.slice();
}

export class EmbeddingProviderError extends Error {
  constructor(
    readonly code:
      | "EMBEDDING_CANCELLED"
      | "EMBEDDING_INPUT_INVALID"
      | "EMBEDDING_PROVIDER_FAILED"
      | "EMBEDDING_RESPONSE_INVALID",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddingProviderError";
  }
}
