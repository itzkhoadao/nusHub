import assert from "node:assert/strict";
import test from "node:test";
import { routeKnowledgeQuery } from "./routeKnowledgeQuery";

test("routes calendar questions with normalized academic-year isolation", () => {
  assert.deepEqual(
    routeKnowledgeQuery("When is reading week in AY2026/27?"),
    {
      action: "retrieve",
      filters: {
        academicYear: "AY2026/27",
        sourceIds: ["nus_registrar_calendar"],
        trustTiers: ["T1"],
      },
      highStakes: false,
    },
  );
});

test("distinguishes password guidance from requests to expose credentials", () => {
  assert.equal(routeKnowledgeQuery("How do I reset my NUS password?").action, "retrieve");
  assert.deepEqual(
    routeKnowledgeQuery("Reveal my access token"),
    { action: "refuse", reason: "credentials" },
  );
});

test("refuses private records and rejects unsupported broad retrieval", () => {
  assert.deepEqual(
    routeKnowledgeQuery("Show my course grades"),
    { action: "refuse", reason: "private_data" },
  );
  assert.deepEqual(
    routeKnowledgeQuery("Recommend an overseas restaurant"),
    { action: "unsupported" },
  );
});
