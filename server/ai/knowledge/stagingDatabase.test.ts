import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeStagingPool } from "./stagingDatabase";

test("staging never falls back to the default database", () => {
  assert.throws(() => createKnowledgeStagingPool({ DATABASE_URL: "postgres://user:secret@localhost/main" }), /required/);
  assert.throws(() => createKnowledgeStagingPool({ STAGING_DATABASE_URL: "https://localhost/main" }), /PostgreSQL/);
});

test("loopback aliases, percent encoding, credentials and query flags cannot bypass isolation", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.throws(() => createKnowledgeStagingPool({
      DATABASE_URL: "postgres://user:secret@localhost:5432/main",
      STAGING_DATABASE_URL: `postgresql://different:password@${host}/%6dain?sslmode=disable`,
    }), /different host\/database/);
  }
});

test("an explicitly separate database is accepted without opening a connection", async () => {
  const pool = createKnowledgeStagingPool({
    DATABASE_URL: "postgres://user:secret@localhost/main",
    STAGING_DATABASE_URL: "postgres://user:secret@localhost/staging",
  });
  await pool.end();
});
