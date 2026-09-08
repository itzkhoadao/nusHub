import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import { getOptionalAuthenticatedUser } from "../auth/tokens";
import { pool } from "../db";
import { AppError } from "../errors/AppError";

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const REPLAY_TTL_MS = 24 * 60 * 60 * 1_000;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type StoredResponse = {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
};

export type AcquireResult =
  | { kind: "acquired" }
  | { kind: "conflict" }
  | { kind: "processing" }
  | ({ kind: "replay" } & StoredResponse);

export interface IdempotencyStore {
  acquire(input: {
    key: string;
    requestHash: string;
    scope: string;
  }): Promise<AcquireResult>;
  complete(input: {
    key: string;
    requestHash: string;
    response: StoredResponse;
    scope: string;
  }): Promise<void>;
}

type IdempotencyRow = {
  request_hash: string;
  response_body: unknown;
  response_headers: Record<string, string> | null;
  response_status: number | null;
  state: "processing" | "completed";
};

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly databasePool: Pool = pool) {}

  async acquire(input: {
    key: string;
    requestHash: string;
    scope: string;
  }): Promise<AcquireResult> {
    await this.databasePool.query(
      `DELETE FROM idempotency_keys
       WHERE (scope, idempotency_key) IN (
         SELECT scope, idempotency_key
         FROM idempotency_keys
         WHERE expires_at <= NOW()
         ORDER BY expires_at
         LIMIT 100
       )`,
    );

    const expiresAt = new Date(Date.now() + REPLAY_TTL_MS);
    const acquired = await this.databasePool.query<IdempotencyRow>(
      `INSERT INTO idempotency_keys (
         scope, idempotency_key, request_hash, locked_until, expires_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope, idempotency_key) DO UPDATE
       SET request_hash = EXCLUDED.request_hash,
           state = 'processing',
           response_status = NULL,
           response_body = NULL,
           response_headers = NULL,
           locked_until = EXCLUDED.locked_until,
           expires_at = EXCLUDED.expires_at,
           completed_at = NULL,
           created_at = NOW()
       WHERE idempotency_keys.state = 'processing'
         AND idempotency_keys.locked_until <= NOW()
         AND idempotency_keys.request_hash = EXCLUDED.request_hash
       RETURNING request_hash, state, response_status, response_body,
                 response_headers`,
      [input.scope, input.key, input.requestHash, expiresAt, expiresAt],
    );

    if (acquired.rowCount === 1) {
      return { kind: "acquired" };
    }

    const existing = await this.databasePool.query<IdempotencyRow>(
      `SELECT request_hash, state, response_status, response_body,
              response_headers
       FROM idempotency_keys
       WHERE scope = $1 AND idempotency_key = $2`,
      [input.scope, input.key],
    );
    const row = existing.rows[0];

    if (!row) {
      // A cleanup racing this request removed the row; the client can safely retry.
      return { kind: "processing" };
    }

    if (row.request_hash !== input.requestHash) {
      return { kind: "conflict" };
    }

    if (row.state === "processing") {
      return { kind: "processing" };
    }

    return {
      body: row.response_body,
      headers: row.response_headers ?? {},
      kind: "replay",
      statusCode: row.response_status ?? 500,
    };
  }

  async complete(input: {
    key: string;
    requestHash: string;
    response: StoredResponse;
    scope: string;
  }): Promise<void> {
    const result = await this.databasePool.query(
      `UPDATE idempotency_keys
       SET state = 'completed',
           response_status = $4,
           response_body = $5,
           response_headers = $6,
           completed_at = NOW()
       WHERE scope = $1
         AND idempotency_key = $2
         AND request_hash = $3
         AND state = 'processing'`,
      [
        input.scope,
        input.key,
        input.requestHash,
        input.response.statusCode,
        JSON.stringify(input.response.body ?? null),
        JSON.stringify(input.response.headers),
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error("The idempotency lease was lost before completion");
    }
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nestedValue]) => nestedValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${canonicalize(nestedValue)}`)
    .join(",")}}`;
}

export function requestFingerprint(req: Request) {
  return createHash("sha256")
    .update(req.method)
    .update("\n")
    .update(req.originalUrl)
    .update("\n")
    .update(canonicalize(req.body))
    .digest("hex");
}

export function readRequiredIdempotencyKey(req: Request) {
  const key = req.get("Idempotency-Key")?.trim();

  if (!key) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key is required for mutation requests.",
    );
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AppError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must be 8 to 128 URL-safe characters.",
    );
  }

  return key;
}

function isAiMessageStream(req: Request) {
  const path = req.originalUrl.split("?", 1)[0];
  return (
    req.method === "POST" &&
    req.get("Accept")?.toLowerCase().includes("text/event-stream") === true &&
    /^\/api\/ai\/conversations\/[0-9a-f-]{36}\/messages$/i.test(path)
  );
}

function requestScope(req: Request) {
  const user = getOptionalAuthenticatedUser(req.headers.authorization);

  if (user) {
    return `user:${user.id}`;
  }

  return "anonymous";
}

function replayResponse(res: Response, replay: Extract<AcquireResult, { kind: "replay" }>) {
  res.set(replay.headers);
  res.set("Idempotency-Replayed", "true");
  return res.status(replay.statusCode).json(replay.body);
}

export function createIdempotencyMiddleware(
  store: IdempotencyStore = new PostgresIdempotencyStore(),
): RequestHandler {
  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (!UNSAFE_METHODS.has(req.method)) {
      return next();
    }

    // This one endpoint uses a database uniqueness constraint because SSE is
    // not a replayable JSON response. Every other mutation uses this store.
    if (isAiMessageStream(req)) return next();

    let key: string;
    try {
      key = readRequiredIdempotencyKey(req);
    } catch (error) {
      return next(error);
    }

    const scope = requestScope(req);
    const requestHash = requestFingerprint(req);

    try {
      const result = await store.acquire({ key, requestHash, scope });

      if (result.kind === "conflict") {
        return next(
          new AppError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This Idempotency-Key was already used for a different request.",
          ),
        );
      }

      if (result.kind === "processing") {
        res.set("Idempotency-Status", "processing");
        res.set("Retry-After", "1");
        return next(
          new AppError(
            409,
            "IDEMPOTENCY_REQUEST_IN_PROGRESS",
            "A request with this Idempotency-Key is still processing.",
          ),
        );
      }

      if (result.kind === "replay") {
        return replayResponse(res, result);
      }

      const originalJson = res.json.bind(res);
      let completionStarted = false;

      res.json = ((body: unknown) => {
        if (completionStarted) {
          return originalJson(body);
        }

        completionStarted = true;
        const response: StoredResponse = {
          body,
          headers: {
            ...(res.get("Location") ? { location: res.get("Location")! } : {}),
          },
          statusCode: res.statusCode,
        };

        void store
          .complete({ key, requestHash, response, scope })
          .then(() => originalJson(body))
          .catch(next);

        return res;
      }) as Response["json"];

      return next();
    } catch (error) {
      return next(
        new AppError(
          503,
          "IDEMPOTENCY_STORE_UNAVAILABLE",
          "This mutation could not be safely started. Please try again.",
          { cause: error },
        ),
      );
    }
  };
}

export const idempotency = createIdempotencyMiddleware();
