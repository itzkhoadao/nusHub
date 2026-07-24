import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Pool, QueryResult } from "pg";
import { loadMigrations, runMigrations } from "./migrate";

test("loads the repository migrations in a continuous, checksummed order", async () => {
  const migrations = await loadMigrations();

  assert.deepEqual(
    migrations.map((migration) => migration.version),
    [1, 2, 3, 4, 5, 6, 7],
  );

  for (const migration of migrations) {
    assert.match(migration.filename, /^\d{3}_[a-z0-9_]+\.sql$/);
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.notEqual(migration.sql.trim(), "");
  }
});

test("rejects a migration sequence with a missing version", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nushub-migrations-"));

  try {
    await writeFile(path.join(directory, "001_first.sql"), "SELECT 1;");
    await writeFile(path.join(directory, "003_third.sql"), "SELECT 3;");

    await assert.rejects(
      () => loadMigrations(directory),
      /expected 002, found 003_third\.sql/,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("applies an unapplied migration inside a transaction and releases its lock", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nushub-migrations-"));
  const queries: string[] = [];
  let released = false;

  const client = {
    async query(sql: string): Promise<Partial<QueryResult>> {
      queries.push(sql.trim());

      if (sql.includes("SELECT version, name, checksum")) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const databasePool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  try {
    await writeFile(
      path.join(directory, "001_first.sql"),
      "CREATE TABLE migration_test (id INTEGER);",
    );
    await runMigrations(databasePool, directory);

    assert.ok(queries.some((query) => query.startsWith("SELECT pg_advisory_lock")));
    assert.ok(queries.includes("BEGIN"));
    assert.ok(
      queries.includes("CREATE TABLE migration_test (id INTEGER);"),
    );
    assert.ok(
      queries.some((query) => query.startsWith("INSERT INTO schema_migrations")),
    );
    assert.ok(queries.includes("COMMIT"));
    assert.ok(
      queries.some((query) => query.startsWith("SELECT pg_advisory_unlock")),
    );
    assert.equal(released, true);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a changed migration that the database already recorded", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nushub-migrations-"));
  const queries: string[] = [];
  let released = false;

  const client = {
    async query(sql: string): Promise<Partial<QueryResult>> {
      queries.push(sql.trim());

      if (sql.includes("SELECT version, name, checksum")) {
        return {
          rows: [{ checksum: "different", name: "first", version: 1 }],
        };
      }

      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const databasePool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  try {
    await writeFile(path.join(directory, "001_first.sql"), "SELECT 1;");

    await assert.rejects(
      () => runMigrations(databasePool, directory),
      /changed after it was applied/,
    );
    assert.equal(queries.includes("BEGIN"), false);
    assert.ok(
      queries.some((query) => query.startsWith("SELECT pg_advisory_unlock")),
    );
    assert.equal(released, true);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
