import cors, { type CorsOptions } from "cors";
import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { getOptionalAuthenticatedUser } from "../auth/tokens";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

const allowedClientOrigin = new URL(env.CLIENT_URL).origin; // accepts browser requests from here

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    // allow requests without origin (same-origin/server-to-server clients)
    if (!origin || origin === allowedClientOrigin) {
      callback(null, true); // accept
      return;
    }

    callback(
      new AppError(
        403,
        "CORS_ORIGIN_DENIED",
        "This website is not allowed to access the API.",
      ),
    ); // reject
  },
};

// identifying clients
function clientKey(req: Request) {
  const user = getOptionalAuthenticatedUser(req.headers.authorization);

  if (user) {
    return `user:${user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

// runs when exceeding limit
function rateLimitHandler(req: Request, res: import("express").Response) {
  return res.status(429).json({
    code: "RATE_LIMIT_EXCEEDED",
    error: "Too many requests. Please wait and try again.",
    request_id: req.requestId,
  });
}

// general API rate limiter
export function createApiRateLimiter(
  options: { limit?: number; windowMs?: number } = {},
) {
  return rateLimit({
    handler: rateLimitHandler,
    keyGenerator: clientKey,
    legacyHeaders: false,
    limit: options.limit ?? env.API_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    windowMs: options.windowMs ?? env.API_RATE_LIMIT_WINDOW_MS,
  });
}

export const apiRateLimiter = createApiRateLimiter();

// auth-related rate limiter
export const authRateLimiter = rateLimit({
  handler: rateLimitHandler,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  legacyHeaders: false,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
});

export const apiCors = cors(corsOptions);
