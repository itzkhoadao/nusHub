import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import type { AiConfig } from "../ai/config/aiConfig";
import { createAccessToken } from "../auth/tokens";
import { requestId } from "../middleware/requestId";
import { createAiRouter } from "./ai";

function testApp(config: AiConfig) {
  const app = express();
  app.use(requestId);
  app.use("/api/ai", createAiRouter(config));
  return app;
}

const enabledConfig: AiConfig = {
  enabled: true,
  generationModel: "stable-test-model",
  maxInputChars: 2_000,
  maxOutputTokens: 800,
  provider: "gemini",
  requestTimeoutMs: 20_000,
  storeInteractions: false,
};

test("protects the AI health endpoint with authentication", async () => {
  const response = await request(testApp(enabledConfig))
    .get("/api/ai/health")
    .expect(401);

  assert.match(response.body.error, /log in/i);
});

test("reports only safe AI configuration state", async () => {
  const response = await request(testApp(enabledConfig))
    .get("/api/ai/health")
    .set("Authorization", `Bearer ${createAccessToken("user-123")}`)
    .expect(200);

  assert.deepEqual(
    Object.keys(response.body).sort(),
    ["enabled", "model", "provider", "request_id", "status"],
  );
  assert.equal(response.body.status, "configured");
  assert.equal(response.body.model, "stable-test-model");
  assert.equal(JSON.stringify(response.body).includes("key"), false);
});

test("fails closed when AI is disabled", async () => {
  const response = await request(
    testApp({ ...enabledConfig, enabled: false }),
  )
    .get("/api/ai/health")
    .set("Authorization", `Bearer ${createAccessToken("user-123")}`)
    .expect(503);

  assert.equal(response.body.status, "disabled");
  assert.equal(response.body.enabled, false);
});

