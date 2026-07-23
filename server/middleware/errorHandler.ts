import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

type SafeErrorOptions = {
  code?: string;
  publicMessage?: string;
  statusCode?: number;
};

type ErrorDetails = {
  code: string;
  publicMessage: string;
  statusCode: number;
};

function getErrorDetails(
  error: unknown,
  fallback: SafeErrorOptions = {},
): ErrorDetails {
  if (error instanceof AppError) {
    return {
      code: error.code,
      publicMessage: error.message, // safe to return this
      statusCode: error.statusCode,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    return {
      code: "REQUEST_TOO_LARGE",
      publicMessage: "The request body is too large.",
      statusCode: 413,
    };
  }

  if (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    "body" in error
  ) {
    return {
      code: "INVALID_JSON",
      publicMessage: "The request body contains invalid JSON.",
      statusCode: 400,
    };
  }

  const statusCode = fallback.statusCode ?? 500;

  return {
    code:
      fallback.code ??
      (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST"),
    publicMessage:
      fallback.publicMessage ??
      (statusCode >= 500
        ? "Something went wrong while processing your request."
        : "The request could not be processed."),
    statusCode,
  };
}

function logUnexpectedError(req: Request, error: unknown, statusCode: number) {
  if (statusCode < 500) {
    return;
  }

  const internalMessage =
    error instanceof Error ? error.message : "Unknown non-Error failure";

  console.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    requestId: req.requestId,
    error: internalMessage,
    ...(env.NODE_ENV === "development" && error instanceof Error
      ? { stack: error.stack }
      : {}),
  }); // server logs this when there's an error
}

// browser only receives this when there's an error
function sendSafeError(
  req: Request,
  res: Response,
  error: unknown,
  fallback?: SafeErrorOptions,
) {
  const details = getErrorDetails(error, fallback);
  logUnexpectedError(req, error, details.statusCode);

  return res.status(details.statusCode).json({
    code: details.code,
    error: details.publicMessage,
    request_id: req.requestId,
  });
}

// Temporary bridge for legacy route catch blocks. New handlers should call next(error) 
// and let errorHandler respond.
export function respondWithCaughtError(
  req: Request,
  res: Response,
  error: unknown,
  fallback?: SafeErrorOptions,
) {
  return sendSafeError(req, res, error, fallback);
}

// if Express reaches this, none of the earlier routes matched
export function notFound(req: Request, res: Response) {
  return sendSafeError(
    req,
    res,
    new AppError(404, "ROUTE_NOT_FOUND", "The requested route was not found."),
  );
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(error);
  }

  return sendSafeError(req, res, error);
}
