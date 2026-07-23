// This class defines errors that are intentionally safe to show to users

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
