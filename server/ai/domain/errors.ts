export type AiProviderErrorCode =
  | "AI_PROVIDER_RESPONSE_INVALID"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;

  constructor(
    code: AiProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
    this.code = code;
  }
}

