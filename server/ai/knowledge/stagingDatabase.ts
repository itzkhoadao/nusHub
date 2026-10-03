import { Pool } from "pg";

export function createKnowledgeStagingPool(environment: NodeJS.ProcessEnv = process.env) {
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
  return a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    (a.port || "5432") === (b.port || "5432") &&
    decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname);
}
