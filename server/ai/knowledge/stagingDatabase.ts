import { Pool } from "pg";
import { config } from "dotenv";
import path from "node:path";

export function createKnowledgeStagingPool(environment: NodeJS.ProcessEnv = process.env) {
  if (environment === process.env && !environment.STAGING_DATABASE_URL) {
    // Shell configuration wins. The private file never overrides existing variables.
    const loaded = config({ path: path.resolve(__dirname, "../../.env.staging"), quiet: true });
    if (loaded.error && (loaded.error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("Cannot read the private .env.staging file. Run staging commands as its owner with file access.");
    }
  }
  const value = environment.STAGING_DATABASE_URL;
  if (!value) {
    throw new Error("STAGING_DATABASE_URL is required; the default DATABASE_URL is never used for staging validation.");
  }
  let staging: URL;
  try {
    staging = new URL(value);
  } catch {
    throw new Error("STAGING_DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(staging.protocol)) {
    throw new Error("STAGING_DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (environment.DATABASE_URL && sameDatabaseTarget(value, environment.DATABASE_URL)) {
    throw new Error("STAGING_DATABASE_URL must point to a different host/database than DATABASE_URL.");
  }
  return new Pool({ connectionString: value, max: 2, connectionTimeoutMillis: 10_000 });
}

function sameDatabaseTarget(left: string, right: string) {
  const a = new URL(left);
  const b = new URL(right);
  return normalizedHost(a.hostname) === normalizedHost(b.hostname) &&
    (a.port || "5432") === (b.port || "5432") &&
    decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname);
}

function normalizedHost(host: string) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return ["localhost", "127.0.0.1", "[::1]"].includes(normalized) ? "loopback" : normalized;
}
