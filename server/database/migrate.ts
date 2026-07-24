import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db";

const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/; // for ex: 002_chat_schema.sql
const MIGRATION_LOCK_NAME = "nushub_schema_migrations";

export type Migration = {
  checksum: string;
  filename: string;
  name: string;
  sql: string;
  version: number;
};

type AppliedMigration = {
  checksum: string;
  name: string;
  version: number;
};

// directory in our folder: server/migrations
function migrationDirectory() {
  return path.resolve(__dirname, "..", "migrations");
}

export async function loadMigrations(
  directory = migrationDirectory(),
): Promise<Migration[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
    .sort(); // asks for migration files in migrations directory

  const migrations = await Promise.all(
    filenames.map(async (filename) => {
      const match = filename.match(MIGRATION_FILE_PATTERN);

      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const sql = await readFile(path.join(directory, filename), "utf8");
      const normalizedSql = sql.replace(/\r\n/g, "\n"); // normalizes for Windows and Linux

      return {
        checksum: createHash("sha256").update(normalizedSql).digest("hex"), // hash then return hexadecimal text
        filename,
        name: match[2],
        sql,
        version: Number(match[1]),
      };
    }),
  ); // turns migrations into a list of Migration type objects

  for (const [index, migration] of migrations.entries()) {
    const expectedVersion = index + 1;

    if (migration.version !== expectedVersion) {
      throw new Error(
        `Migration sequence must be continuous: expected ${String(expectedVersion).padStart(3, "0")}, found ${migration.filename}`,
      );
    }
  }

  return migrations;
}

// schema_migrations: log table that remembers which migration files have been applied
async function prepareMigrationLedger(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function validateAppliedMigration(
  migration: Migration,
  applied: AppliedMigration,
) {
  if (
    applied.name !== migration.name ||
    applied.checksum !== migration.checksum
  ) {
    throw new Error(
      `Migration ${migration.filename} was changed after it was applied. Create a new migration instead of editing applied migrations.`,
    );
  }
}

async function applyMigration(client: PoolClient, migration: Migration) {
  await client.query("BEGIN");

  try {
    await client.query(migration.sql); // apply the SQL
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum],
    ); // records the migration
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Failed to apply migration ${migration.filename}`, {
      cause: error,
    });
  }
}

export async function runMigrations(
  databasePool: Pool = pool,
  directory = migrationDirectory(),
) {
  // load files and create connection
  const migrations = await loadMigrations(directory);
  const client = await databasePool.connect();

  try {
    // prevents many app instances from running migrations at the same time
    // must wait until the current server releases the lock to run migrations
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      MIGRATION_LOCK_NAME,
    ]);

    await prepareMigrationLedger(client);

    const result = await client.query<AppliedMigration>(
      `SELECT version, name, checksum
       FROM schema_migrations
       ORDER BY version`,
    ); // loads existing migration records

    // Database says migration 004 was applied, but no 004 file available => error
    const appliedByVersion = new Map(
      result.rows.map((migration) => [migration.version, migration]),
    );
    const availableVersions = new Set(
      migrations.map((migration) => migration.version),
    );

    for (const applied of result.rows) {
      if (!availableVersions.has(applied.version)) {
        throw new Error(
          `Database migration ${applied.version} (${applied.name}) is not present in this release.`,
        );
      }
    }

    for (const migration of migrations) {
      const applied = appliedByVersion.get(migration.version);

      if (applied) {
        // for an applied migration, validate its name and checksum
        validateAppliedMigration(migration, applied);
        continue;
      }

      await applyMigration(client, migration); // if not applied, apply migration now
      console.log(`Applied database migration ${migration.filename}`);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        MIGRATION_LOCK_NAME,
      ]); // release lock
    } finally {
      client.release();
    }
  }
}
