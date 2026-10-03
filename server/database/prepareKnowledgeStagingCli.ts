import "dotenv/config";
import { runMigrations } from "./migrate";
import { createKnowledgeStagingPool } from "../ai/knowledge/stagingDatabase";

async function main() {
  const pool = createKnowledgeStagingPool();
  try {
    const identity = await pool.query<{ current_database: string; inet_server_addr: string | null }>(
      "SELECT current_database(), inet_server_addr()::text",
    );
    console.log("Preparing explicitly configured staging database", identity.rows[0]);
    await runMigrations(pool);
    const check = await pool.query<{ extension: string | null; migration: number | null }>(
      `SELECT (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS extension,
              (SELECT MAX(version) FROM schema_migrations) AS migration`,
    );
    if (!check.rows[0]?.extension || Number(check.rows[0].migration) < 12) {
      throw new Error("Staging is missing pgvector or knowledge migration 012.");
    }
    console.log("Knowledge staging schema is ready", check.rows[0]);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Knowledge staging preparation failed", {
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  process.exitCode = 1;
});
