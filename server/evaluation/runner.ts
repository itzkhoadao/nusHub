// This file controls one complete evaluation run

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CaseEvaluationResult,
  EvaluationLimits,
} from "./contracts";
import { gradeEvaluationCase } from "./grader";
import {
  loadCandidateResponses,
  loadEvaluationCases,
  loadSourceRegistry,
} from "./loaders";

// defines every configuration value needed to perform one run
export type EvaluationRunOptions = {
  caseIds?: string[];
  codeRevision: string;
  datasetPath: string;
  datasetVersion: string;
  limits: EvaluationLimits;
  modelId: string;
  outputDirectory: string;
  promptVersion: string;
  responsesPath: string;
  sourceRegistryPath: string;
};

// converts result into compact JSON string
function resultJson(result: CaseEvaluationResult) {
  return JSON.stringify(result);
}

// creates the contents of summary.md
function summaryMarkdown(
  results: CaseEvaluationResult[],
  manifest: Record<string, unknown>,
) {
  // count passed and failed cases
  const passed = results.filter((result) => result.deterministicPass).length;
  const criticalFailures = results.filter(
    (result) => result.criticalFailure,
  );
  const failures = results.filter((result) => !result.deterministicPass);

  return `# NUSHub AI Evaluation Run

| Field | Value |
| --- | --- |
| Run ID | \`${manifest.runId}\` |
| Dataset | \`${manifest.datasetVersion}\` |
| Model | \`${manifest.modelId}\` |
| Cases | ${results.length} |
| Deterministic pass | ${passed}/${results.length} |
| Critical failures | ${criticalFailures.length} |
| Human review pending | ${results.length} |

## Release status

${criticalFailures.length === 0 && failures.length === 0
    ? "Deterministic checks passed. Release approval still requires human review."
    : "Failed. Resolve deterministic failures before release review."}

## Failed cases

${failures.length === 0
    ? "None."
    : failures // listing failed cases
        .map((result) => {
          const failedChecks = result.checks
            .filter((entry) => !entry.passed) 
            .map((entry) => entry.id)
            .join(", ");
          return `- \`${result.caseId}\`: ${failedChecks}`;
        })
        .join("\n")}
`;
}

// MAIN FUNCTION
export async function runEvaluation(options: EvaluationRunOptions) {
  const startedAt = new Date();
  const runId = randomUUID();
  const [casesById, responsesById, sourceRegistry] = await Promise.all([
    loadEvaluationCases(options.datasetPath),
    loadCandidateResponses(options.responsesPath),
    loadSourceRegistry(options.sourceRegistryPath),
  ]); // loaded at the same time
  const selectedCaseIds =
    options.caseIds && options.caseIds.length > 0
      ? options.caseIds
      : [...casesById.keys()]; // chooses valid cases to evaluate

  // validates selected cases
  for (const caseId of selectedCaseIds) {
    if (!casesById.has(caseId)) {
      throw new Error(`Unknown evaluation case ${caseId}`);
    }
  }
  for (const caseId of responsesById.keys()) {
    if (!casesById.has(caseId)) {
      throw new Error(`Response file contains unknown case ${caseId}`);
    }
  }

  const results = selectedCaseIds.map((caseId) =>
    gradeEvaluationCase(
      casesById.get(caseId)!,
      responsesById.get(caseId),
      sourceRegistry,
      options.limits,
    ),
  ); // grade selected cases
  const completedAt = new Date();
  const manifest = {
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    datasetVersion: options.datasetVersion,
    caseIds: selectedCaseIds,
    modelId: options.modelId,
    promptVersion: options.promptVersion,
    codeRevision: options.codeRevision,
    limits: options.limits,
    responseFile: path.resolve(options.responsesPath),
    rawResponsesCopied: false,
  }; // manifest records metadata about the complete run

  // creates human-review queue
  const reviewQueue = selectedCaseIds.map((caseId) => {
    const evaluationCase = casesById.get(caseId)!;
    const result = results.find((entry) => entry.caseId === caseId)!;
    return {
      caseId,
      answerSha256: result.answerSha256,
      responseFile: path.resolve(options.responsesPath),
      responseLine: result.responseLine,
      risk: evaluationCase.risk.level,
      rubric: evaluationCase.expectedBehavior.humanRubric,
      secondaryReviewerRequired:
        evaluationCase.risk.level === "high" ||
        evaluationCase.risk.level === "critical",
    };
  });

  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(options.outputDirectory, "run-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(options.outputDirectory, "case-results.jsonl"),
      `${results.map(resultJson).join("\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(options.outputDirectory, "human-review-queue.jsonl"),
      `${reviewQueue.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(options.outputDirectory, "summary.md"),
      summaryMarkdown(results, manifest),
      "utf8",
    ),
  ]); // writing files concurrently

  return {
    manifest,
    outputDirectory: options.outputDirectory,
    passed: results.every((result) => result.deterministicPass),
    results,
  };
}
