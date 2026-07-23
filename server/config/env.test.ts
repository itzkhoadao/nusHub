import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "./env";

const validEnvironment: NodeJS.ProcessEnv = {
  CLIENT_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:password@localhost:5432/nushub_test",
  JWT_SECRET: "a-development-secret",
  NODE_ENV: "development",
}; // fake env object to test

test("parses defaults and environment strings into typed configuration", () => {
  const environment = parseEnvironment(validEnvironment);

  assert.equal(environment.PORT, 5000);
  assert.equal(environment.AI_ENABLED, false);
  assert.equal(environment.AI_INTERACTIONS_STORE, false);
  assert.equal(environment.AI_REQUEST_TIMEOUT_MS, 20_000);
  assert.equal(environment.JWT_EXPIRES_IN, "7d");
});

test("requires a strong JWT secret in production", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    /JWT_SECRET must contain at least 32 characters in production/,
  );
});

test("requires a Gemini key before AI can be enabled", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...validEnvironment,
        AI_ENABLED: "true",
      }),
    /GEMINI_API_KEY is required when AI_ENABLED=true/,
  );
});

test("rejects provider-side interaction storage without a privacy review", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...validEnvironment,
        AI_INTERACTIONS_STORE: "true",
      }),
    /AI_INTERACTIONS_STORE must remain false/,
  );
});

test("rejects a partially configured R2 integration", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...validEnvironment,
        R2_ACCOUNT_ID: "account-id",
      }),
    /R2_ACCESS_KEY_ID is required when Cloudflare R2 is configured/,
  );
});
