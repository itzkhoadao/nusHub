// Run migrations manually: npm run migrate

import { pool } from "../db";
import { runMigrations } from "./migrate";

async function main() {
  try {
    await runMigrations();
    console.log("Database migrations are up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1; // failure
});
