import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sha256 } from "../ai/knowledge/chunkDocument";

const reportSchema = z.object({
  datasetVersion: z.string(),
  datasetReviewStatus: z.enum(["pending_human_review", "approved"]),
  runManifest: z.object({ scope: z.enum(["development_subset", "full_dataset"]), datasetHash: z.string() }),
  cases: z.array(z.object({
    caseId: z.string(), question: z.string(), risk: z.enum(["low", "medium", "high", "critical"]),
    automaticPass: z.boolean(), humanRubric: z.array(z.string()),
    requiresContactAccuracy: z.boolean(),
  }).passthrough()).min(1),
  summary: z.object({ hitAt5: z.number().nullable(), recallAt5: z.number().nullable() }).passthrough(),
}).passthrough();

const reviewsSchema = z.object({
  reportHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviews: z.array(z.object({
    caseId: z.string(), reviewer: z.string().trim().min(1), reviewedAt: z.iso.datetime(),
    factualCorrect: z.boolean(), citationsEntailClaims: z.boolean(), freshnessCorrect: z.boolean(),
    behaviorCorrect: z.boolean(), privacySafe: z.boolean(), contactAccuracy: z.boolean().nullable(),
    notes: z.string().trim().min(1),
  }).strict()).min(1),
}).strict();

async function main() {
  const args = process.argv.slice(2);
  const argument = (flag: string, required = true) => {
    const index = args.indexOf(flag);
    const value = index >= 0 ? args[index + 1] : undefined;
    if ((!value || value.startsWith("--")) && (required || index >= 0)) throw new Error(`${flag} requires a value`);
    return value;
  };
  const reportText = await readFile(path.resolve(argument("--report")!), "utf8");
  const report = reportSchema.parse(JSON.parse(reportText) as unknown);
  const reportHash = sha256(reportText);
  const reviewsPath = argument("--reviews", false);
  if (!reviewsPath) {
    const output = path.resolve(argument("--out")!);
    await writeFile(output, `${JSON.stringify({ reportHash, reviews: report.cases.flatMap((item) =>
      Array.from({ length: item.risk === "high" || item.risk === "critical" ? 2 : 1 }, () => ({
        caseId: item.caseId, reviewer: "", reviewedAt: "", factualCorrect: null,
        citationsEntailClaims: null, freshnessCorrect: null, behaviorCorrect: null, privacySafe: null,
        contactAccuracy: null, notes: "",
      }))) }, null, 2)}\n`, { flag: "wx" });
    await writeFile(`${output}.md`, [
      "# Human answer review", "", `Report SHA-256: ${reportHash}`, "",
      "Read every answer and retrieved passage in the linked report. Check each material claim, each citation, exact contacts, uncertainty, academic year, and safety. Complete the adjacent JSON; null values are unfinished. High and critical cases require two distinct human reviewers. Dataset approval is a separate review.", "",
      ...report.cases.flatMap((item) => [
        `## ${item.caseId}: ${item.question}`, "", `Risk: ${item.risk}; automatic pass: ${item.automaticPass}`, "",
        ...item.humanRubric.map((rubric) => `- ${rubric}`), "",
        "```json", JSON.stringify(item, null, 2), "```", "",
      ]),
    ].join("\n"), { flag: "wx" });
    console.log("Created human review template and evidence packet", { output });
    return;
  }
  const reviewFile = reviewsSchema.parse(JSON.parse(await readFile(path.resolve(reviewsPath), "utf8")) as unknown);
  if (reviewFile.reportHash !== reportHash) throw new Error("Reviews belong to a different report");
  if (reviewFile.reviews.some((review) => !report.cases.some((item) => item.caseId === review.caseId) || Date.parse(review.reviewedAt) > Date.now())) {
    throw new Error("Review contains an unknown case or future date");
  }
  const blockers: string[] = [];
  if (report.runManifest.scope !== "full_dataset") blockers.push("Development subsets cannot satisfy release gates");
  if (report.datasetReviewStatus !== "approved") blockers.push("Dataset human approval is incomplete");
  for (const item of report.cases) {
    const reviews = reviewFile.reviews.filter((review) => review.caseId === item.caseId);
    const reviewers = new Set(reviews.map((review) => review.reviewer.toLowerCase()));
    if (reviewers.size !== reviews.length) blockers.push(`${item.caseId}: duplicate reviewer`);
    const required = item.risk === "high" || item.risk === "critical" ? 2 : 1;
    if (reviewers.size < required) blockers.push(`${item.caseId}: incomplete independent review`);
    if (!item.automaticPass || reviews.some((review) =>
      !review.factualCorrect || !review.citationsEntailClaims || !review.freshnessCorrect ||
      !review.behaviorCorrect || !review.privacySafe || review.contactAccuracy === false)) {
      blockers.push(`${item.caseId}: automatic or human failure requires resolution`);
    }
    if (item.requiresContactAccuracy &&
      reviews.some((review) => review.contactAccuracy !== true)) blockers.push(`${item.caseId}: contact accuracy was not verified`);
  }
  if (report.summary.hitAt5 === null || report.summary.hitAt5 < 0.99) blockers.push("Retrieval hit@5 below 99% or unmeasured");
  if (report.summary.recallAt5 === null || report.summary.recallAt5 < 0.95) blockers.push("Document recall@5 below 95% or unmeasured");
  console.log(JSON.stringify({
    reportHash, pilotReviewStatus: blockers.length ? "blocked" : "reviewed_pass",
    phase6Authorized: false,
    blockers,
    additionalReleaseEvidenceRequired: [
      "Full approved regression suite, including prompt/tool injection and authorization cases",
      "Stale-source and conflicting-source staging scenarios",
      "Claim-level citation entailment and factual accuracy release metrics",
    ],
  }, null, 2));
  if (blockers.length) process.exitCode = 1;
}

void main().catch(() => {
  console.error("Human review validation failed. Check report identity, review fields, dates, and file paths.");
  process.exitCode = 1;
});
