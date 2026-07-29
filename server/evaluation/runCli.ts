import path from "node:path";
import { runEvaluation } from "./runner";

function readOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function positiveNumber(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const responsesPath = readOption(args, "--responses");
  if (!responsesPath) {
    throw new Error(
      "Usage: npm run eval:ai -- --responses <responses.jsonl> [--cases E001,E002] [--output directory]",
    );
  }

  const repositoryRoot = path.resolve(process.cwd(), "..");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cases = readOption(args, "--cases")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const outputDirectory =
    readOption(args, "--output") ??
    path.join(process.cwd(), "evaluation-results", timestamp);
  const result = await runEvaluation({
    caseIds: cases,
    codeRevision: process.env.GIT_COMMIT_SHA ?? "local-uncommitted",
    datasetPath:
      readOption(args, "--dataset") ??
      path.join(
        repositoryRoot,
        "docs",
        "AI_EVALUATION_DATASET_DRAFT.jsonl",
      ),
    datasetVersion:
      readOption(args, "--dataset-version") ?? "1.0.0-rc.1",
    limits: {
      maxLatencyMs: positiveNumber(
        readOption(args, "--max-latency-ms"),
        30_000,
        "--max-latency-ms",
      ),
      maxOutputTokens: positiveNumber(
        readOption(args, "--max-output-tokens"),
        800,
        "--max-output-tokens",
      ),
      maxToolCalls: positiveNumber(
        readOption(args, "--max-tool-calls"),
        3,
        "--max-tool-calls",
      ),
    },
    modelId: readOption(args, "--model-id") ?? "recorded-responses",
    outputDirectory,
    promptVersion: readOption(args, "--prompt-version") ?? "not-recorded",
    responsesPath,
    sourceRegistryPath:
      readOption(args, "--source-registry") ??
      path.join(repositoryRoot, "docs", "AI_SOURCE_REGISTRY.yaml"),
  });

  console.log(
    `Evaluation ${result.passed ? "passed" : "failed"}: ${result.outputDirectory}`,
  );
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("AI evaluation failed:", error);
  process.exitCode = 1;
});
