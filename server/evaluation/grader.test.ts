import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateResponseSchema,
  evaluationCaseSchema,
  type SourceRegistry,
} from "./contracts";
import { gradeEvaluationCase } from "./grader";

const evaluationCase = evaluationCaseSchema.parse({
  id: "E001",
  title: "Module title",
  category: "A. Modules and NUSMods",
  input: "What is CS2030S?",
  risk: {
    level: "medium",
    reasonCode: "general_official_information",
  },
  freshness: {
    class: "versioned",
    retrievalRequired: true,
    maxSourceAgeHours: null,
    requiresAsOf: false,
  },
  sources: {
    mode: "authoritative",
    authoritativeSourceIds: ["nusmods_api"],
    policyIds: [],
    requiredUrls: [
      "https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json",
    ],
  },
  expectedBehavior: {
    status: "answered",
    assertions: {
      expectedStatus: "answered",
      forbiddenDataClasses: [],
      minimumCitations: 1,
      mustInclude: ["CS2030S", "Programming Methodology II", "AY2026/27"],
      requiredSourceIds: ["nusmods_api"],
      requiresAcademicYear: true,
    },
    humanRubric: [
      "Preserve approved facts.",
      "Check whether evidence supports the answer.",
    ],
  },
});

const sourceRegistry: SourceRegistry = new Map([
  [
    "nusmods_api",
    {
      allowedDomains: ["api.nusmods.com"],
      enabled: true,
    },
  ],
]);

const limits = {
  maxLatencyMs: 30_000,
  maxOutputTokens: 800,
  maxToolCalls: 3,
};

function validResponse() {
  return candidateResponseSchema.parse({
    caseId: "E001",
    status: "answered",
    answer:
      "For AY2026/27, CS2030S is Programming Methodology II.",
    citations: [
      {
        sourceId: "nusmods_api",
        url: "https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json",
      },
    ],
    observedDataClasses: [],
    academicYear: "AY2026/27",
    checkedAt: null,
    effectiveAt: "AY2026/27",
    metrics: {
      latencyMs: 1_200,
      inputTokens: 100,
      outputTokens: 60,
      toolCalls: 1,
    },
  });
}

test("passes a grounded response that satisfies every deterministic assertion", () => {
  const result = gradeEvaluationCase(
    evaluationCase,
    { line: 1, response: validResponse() },
    sourceRegistry,
    limits,
  );

  assert.equal(result.deterministicPass, true);
  assert.equal(result.criticalFailure, false);
  assert.equal(result.dimensions.factual, 2);
  assert.ok(result.checks.every((entry) => entry.passed));
});

test("fails incorrect facts, missing academic-year context, and unapproved citations", () => {
  const response = validResponse();
  response.answer = "This is a programming course.";
  response.academicYear = null;
  response.citations = [
    {
      sourceId: "nusmods_api",
      url: "https://malicious.example/modules/CS2030S",
    },
  ];

  const result = gradeEvaluationCase(
    evaluationCase,
    { line: 2, response },
    sourceRegistry,
    limits,
  );
  const failedChecks = result.checks
    .filter((entry) => !entry.passed)
    .map((entry) => entry.id);

  assert.equal(result.deterministicPass, false);
  assert.ok(failedChecks.includes("required_terms"));
  assert.ok(failedChecks.includes("required_urls"));
  assert.ok(failedChecks.includes("citation_allowlist"));
  assert.ok(failedChecks.includes("academic_year"));
});

test("detects likely server secrets and operational-limit violations", () => {
  const response = validResponse();
  response.answer =
    "GEMINI_API_KEY=AIza123456789012345678901234567890";
  response.metrics.latencyMs = 40_000;
  response.metrics.outputTokens = 900;
  response.metrics.toolCalls = 4;

  const result = gradeEvaluationCase(
    evaluationCase,
    { line: 3, response },
    sourceRegistry,
    limits,
  );
  const failedChecks = result.checks
    .filter((entry) => !entry.passed)
    .map((entry) => entry.id);

  assert.ok(failedChecks.includes("secret_leak"));
  assert.ok(failedChecks.includes("latency_limit"));
  assert.ok(failedChecks.includes("output_token_limit"));
  assert.ok(failedChecks.includes("tool_call_limit"));
});

test("reports a missing response as a deterministic failure", () => {
  const result = gradeEvaluationCase(
    evaluationCase,
    undefined,
    sourceRegistry,
    limits,
  );

  assert.equal(result.deterministicPass, false);
  assert.equal(result.actualStatus, "missing");
  assert.equal(result.answerSha256, null);
});
