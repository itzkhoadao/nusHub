// This uses Supertest to call Express without starting a real public server.

import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createApp } from "./app";
import { createApiRateLimiter } from "./middleware/apiSecurity";
import { errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";

test("adds a request ID and standard security headers", async () => {
  const response = await request(createApp()).get("/").expect(200);

  assert.match(response.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("allows the configured frontend origin", async () => {
  const response = await request(createApp())
    .get("/")
    .set("Origin", "http://localhost:5173")
    .expect(200);

  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
});

test("rejects an unapproved browser origin with a safe response", async () => {
  const response = await request(createApp())
    .get("/")
    .set("Origin", "https://malicious.example")
    .expect(403);

  assert.equal(response.body.code, "CORS_ORIGIN_DENIED");
  assert.equal(typeof response.body.request_id, "string");
});

test("returns stable errors for unknown routes and malformed JSON", async () => {
  const app = createApp();

  const missing = await request(app).get("/not-a-route").expect(404);
  assert.equal(missing.body.code, "ROUTE_NOT_FOUND");

  const malformed = await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);

  assert.equal(malformed.body.code, "INVALID_JSON");
  assert.equal(typeof malformed.body.request_id, "string");
});

test("rejects oversized JSON bodies before they reach a route", async () => {
  const response = await request(createApp())
    .post("/api/auth/login")
    .send({ padding: "x".repeat(1_100_000) })
    .expect(413);

  assert.equal(response.body.code, "REQUEST_TOO_LARGE");
  assert.equal(typeof response.body.request_id, "string");
});

test("returns a stable response when a client exceeds the API rate limit", async () => {
  const app = express();
  app.use(requestId);
  app.use(createApiRateLimiter({ limit: 1, windowMs: 60_000 }));
  app.get("/", (_req, res) => res.json({ ok: true }));

  await request(app).get("/").expect(200);
  const limited = await request(app).get("/").expect(429);

  assert.equal(limited.body.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(typeof limited.body.request_id, "string");
  assert.equal(typeof limited.headers.ratelimit, "string");
});

test("does not expose unexpected internal error details", async () => {
  const app = express();
  const loggedErrors: unknown[][] = [];
  const originalConsoleError = console.error;
  app.use(requestId);
  app.get("/failure", () => {
    throw new Error("database-password-should-never-leak");
  });
  app.use(errorHandler);

  console.error = (...arguments_) => loggedErrors.push(arguments_);
  let response;

  try {
    response = await request(app).get("/failure").expect(500);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.body.code, "INTERNAL_SERVER_ERROR");
  assert.equal(
    response.body.error,
    "Something went wrong while processing your request.",
  );
  assert.doesNotMatch(JSON.stringify(response.body), /database-password/);
  assert.equal(loggedErrors.length, 1);
});
