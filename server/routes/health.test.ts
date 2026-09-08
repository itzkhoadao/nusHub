import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { createHealthRouter } from "./health";

function createTestApp(query: Pool["query"]) {
  const app = express();
  app.use("/health", createHealthRouter({ query }));
  return app;
}

test("liveness does not depend on the database", async () => {
  let queries = 0;
  const app = createTestApp(async () => {
    queries += 1;
    throw new Error("database should not be queried");
  });

  const response = await request(app).get("/health/live").expect(200);

  assert.deepEqual(response.body, { status: "live" });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(queries, 0);
});

test("readiness succeeds when PostgreSQL accepts a query", async () => {
  const app = createTestApp(async (query) => {
    assert.equal(query, "SELECT 1");
    return { rows: [{ "?column?": 1 }] } as never;
  });

  const response = await request(app).get("/health/ready").expect(200);

  assert.deepEqual(response.body, { status: "ready" });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("readiness fails closed without exposing database errors", async () => {
  const app = createTestApp(async () => {
    throw new Error("postgresql://user:password@private-host/database");
  });

  const response = await request(app).get("/health/ready").expect(503);

  assert.deepEqual(response.body, { status: "unavailable" });
  assert.doesNotMatch(JSON.stringify(response.body), /password|private-host/);
});
