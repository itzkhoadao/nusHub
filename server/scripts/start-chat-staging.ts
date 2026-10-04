import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { createKnowledgeStagingPool } from "../ai/knowledge/stagingDatabase";

// Load and verify isolation before importing modules that construct the app pool.
async function main() {
  config({ quiet: true });
  const verificationPool = createKnowledgeStagingPool();
  try {
    const schema = await verificationPool.query("SELECT version FROM schema_migrations WHERE version = 12");
    if (schema.rowCount !== 1) throw new Error("Prepare the staging database first");
  } finally { await verificationPool.end(); }
  if (!process.env.GEMINI_API_KEY) throw new Error("A privately configured Gemini key is required");
  process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL;
  process.env.NODE_ENV = "development";
  process.env.PORT = process.env.STAGING_API_PORT || "5001";
  process.env.CLIENT_URL = process.env.STAGING_CLIENT_URL || "http://127.0.0.1:5178";
  process.env.AI_ENABLED = "true";
  process.env.JWT_SECRET = process.env.STAGING_JWT_SECRET || randomBytes(32).toString("hex");
  process.env.JWT_ISSUER = "nushub-staging-api";
  process.env.JWT_AUDIENCE = "nushub-staging-web";
  // A staging preview must not write to the normal application's object storage.
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_BASE_URL", "GOOGLE_CLIENT_ID"]) {
    process.env[key] = "";
  }
  const [{ createApp }, { configureSocketServer }, { pool }, { env }] = await Promise.all([
    import("../app"), import("../socket"), import("../db"), import("../config/env"),
  ]);
  const server = http.createServer(createApp());
  const sockets = configureSocketServer(server);
  server.listen(env.PORT, "127.0.0.1", () => console.log("Isolated chatbot staging API ready", {
    url: `http://127.0.0.1:${env.PORT}`, database: "separate staging", accounts: "staging only", aiEnabled: true,
  }));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    sockets.close(() => { void pool.end().then(() => { process.exitCode = 0; }); });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
void main().catch(() => {
  console.error("Staging startup failed. Check private staging configuration, database availability and migration 012.");
  process.exitCode = 1;
});
