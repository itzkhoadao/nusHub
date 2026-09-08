export type NusModsErrorCode =
  | "SOURCE_INVALID_RESPONSE"
  | "SOURCE_RESPONSE_TOO_LARGE"
  | "SOURCE_TIMEOUT"
  | "SOURCE_UNAVAILABLE";

export class NusModsError extends Error {
  readonly code: NusModsErrorCode;

  constructor(code: NusModsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NusModsError";
    this.code = code;
  }
}
