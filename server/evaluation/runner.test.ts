import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluationCaseSchema } from "./contracts";
import { runEvaluation } from "./runner";

test("writes a repeatable manifest, results, summary, and human-review queue", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nushub-ai-eval-"));
  const datasetPath = path.join(directory, "dataset.jsonl");
  const responsesPath = path.join(directory, "responses.jsonl");
  const registryPath = path.join(directory, "sources.yaml");
  const outputDirectory = path.join(directory, "results");
  const evaluationCase = evaluationCaseSchema.parse({
    id: "E001",
    title: "Module title",
    category: "A. Modules",
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
        mustInclude: [
          "CS2030S",
          "Programming Methodology II",
          "AY2026/27",
        ],
        requiredSourceIds: ["nusmods_api"],
        requiresAcademicYear: true,
      },
      humanRubric: ["Check facts.", "Check citations."],
    },
  });
  const response = {
    caseId: "E001",
    status: "answered",
    answer: "AY2026/27: CS2030S is Programming Methodology II.",
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
      latencyMs: 500,
      inputTokens: 50,
      outputTokens: 30,
      toolCalls: 1,
    },
  };

  try {
    await writeFile(datasetPath, `${JSON.stringify(evaluationCase)}\n`);
    await writeFile(responsesPath, `${JSON.stringify(response)}\n`);
    await writeFile(
      registryPath,
      `sources:
  - id: nusmods_api
    enabled: true
    allowed_domains: [api.nusmods.com]
`,
    );

    const result = await runEvaluation({
      codeRevision: "test-revision",
      datasetPath,
      datasetVersion: "test-version",
      limits: {
        maxLatencyMs: 30_000,
        maxOutputTokens: 800,
        maxToolCalls: 3,
      },
      modelId: "fixture-model",
      outputDirectory,
      promptVersion: "fixture-prompt",
      responsesPath,
      sourceRegistryPath: registryPath,
    });

    assert.equal(result.passed, true);
    for (const filename of [
      "run-manifest.json",
      "case-results.jsonl",
      "summary.md",
      "human-review-queue.jsonl",
    ]) {
      assert.notEqual(
        (await readFile(path.join(outputDirectory, filename), "utf8")).trim(),
        "",
      );
    }
    const storedResults = await readFile(
      path.join(outputDirectory, "case-results.jsonl"),
      "utf8",
    );
    assert.doesNotMatch(storedResults, /Programming Methodology II/);
    assert.match(storedResults, /answerSha256/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
