import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { GroundedAnswer } from "../ai/domain/types";
import type { ModuleQuestionAnswer } from "../ai/orchestration/answerModuleQuestion";
import { routeKnowledgeQuery } from "../ai/knowledge/routeKnowledgeQuery";
import { getKnowledgeSource } from "../ai/knowledge/sourceRegistry";
import type { KnowledgeSearchQuery, RetrievedEvidence } from "../ai/knowledge/types";

const retrievalExpectationSchema = z.object({
  academicYear: z.string().regex(/^AY20\d{2}\/\d{2}$/).optional(),
  expectNoResults: z.boolean().default(false),
  expectedSourceIds: z.array(z.string().min(1)).min(1),
  expectedUrls: z.array(z.url()),
  relevantTextTerms: z.array(z.string().min(1)).optional(),
}).strict();

const caseSchema = z.object({
  expectedStatus: z.enum(["answered", "not_verified", "refused", "needs_clarification"]),
  humanRubric: z.array(z.string().min(1)).min(2),
  id: z.string().regex(/^K\d{3}$/),
  question: z.string().min(1).max(2_000),
  retrieval: retrievalExpectationSchema.optional(),
  risk: z.enum(["low", "medium", "high", "critical"]),
  requiresContactAccuracy: z.boolean().default(false),
  sourceEvidence: z.string().min(1),
}).strict();

export const knowledgeEvaluationDatasetSchema = z.object({
  cases: z.array(caseSchema).min(1).superRefine((cases, context) => {
    const ids = new Set<string>();
    for (const [index, testCase] of cases.entries()) {
      if (ids.has(testCase.id)) context.addIssue({
        code: "custom", message: `Duplicate case ${testCase.id}`, path: [index, "id"],
      });
      ids.add(testCase.id);
      if (testCase.expectedStatus === "answered" &&
        (!testCase.retrieval || testCase.retrieval.expectedUrls.length === 0 ||
          !testCase.retrieval.relevantTextTerms?.length)) {
        context.addIssue({
          code: "custom", message: "Answered cases need expected document URLs and relevant text terms", path: [index],
        });
      }
    }
  }),
  reviewStatus: z.enum(["pending_human_review", "approved"]),
  reviews: z.array(z.object({
    caseId: z.string().regex(/^K\d{3}$/),
    reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime(),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().min(1),
  }).strict()).default([]),
  version: z.string().min(1),
}).strict().superRefine((dataset, context) => {
  for (const review of dataset.reviews) {
    if (!dataset.cases.some((item) => item.id === review.caseId) || Date.parse(review.reviewedAt) > Date.now()) {
      context.addIssue({ code: "custom", message: "Review references an unknown case or a future date", path: ["reviews"] });
    }
  }
  if (dataset.reviewStatus === "approved") {
    for (const item of dataset.cases) {
      const reviews = dataset.reviews.filter((review) => review.caseId === item.id);
      const approved = new Set(reviews.filter((review) => review.decision === "approved")
        .map((review) => review.reviewer.trim().toLowerCase()));
      const required = item.risk === "high" || item.risk === "critical" ? 2 : 1;
      if (approved.size < required || reviews.some((review) => review.decision === "rejected")) {
        context.addIssue({ code: "custom", message: `${item.id} needs ${required} independent approvals and no unresolved rejection`, path: ["reviews"] });
      }
    }
  }
});

export type KnowledgeEvaluationDataset = z.infer<typeof knowledgeEvaluationDatasetSchema>;
export type KnowledgeEvaluationCase = KnowledgeEvaluationDataset["cases"][number];

export type KnowledgeEvaluationDependencies = {
  answer: (question: string, requestId: string) => Promise<ModuleQuestionAnswer>;
  search: (query: KnowledgeSearchQuery) => Promise<RetrievedEvidence[]>;
};

export async function runKnowledgeEvaluation(
  dataset: KnowledgeEvaluationDataset,
  dependencies: KnowledgeEvaluationDependencies,
  now = new Date(),
) {
  const cases = [];
  for (const testCase of dataset.cases) {
    const startedAt = Date.now();
    let evidence: RetrievedEvidence[] = [];
    let answer: GroundedAnswer | null = null;
    let errorCode: string | null = null;
    let modelId: string | null = null;
    let promptVersion: string | null = null;
    try {
      const route = routeKnowledgeQuery(testCase.question);
      if (testCase.retrieval) {
        if (route.action !== "retrieve") {
          throw new Error("EVALUATION_ROUTE_MISMATCH");
        }
        evidence = await dependencies.search({
          filters: route.filters, limit: 5, text: testCase.question,
        });
      }
      const response = await dependencies.answer(testCase.question, randomUUID());
      answer = response.groundedAnswer;
      modelId = response.modelId;
      promptVersion = response.promptVersion;
    } catch (error) {
      errorCode = safeErrorCode(error);
    }
    const latencyMs = Date.now() - startedAt;
    const retrieval = evaluateRetrieval(testCase, evidence, now);
    const statusPass = answer?.status === testCase.expectedStatus;
    const citationPass = !answer ? false : testCase.expectedStatus === "answered"
      ? answer.citations.length > 0 && answer.citations.every((citation) =>
          evidence.some((item) =>
            item.sourceId === citation.sourceId &&
            item.documentVersionId === citation.documentVersionId &&
            item.url === citation.url,
          ),
        ) && answer.citations.some((citation) =>
          testCase.retrieval?.expectedUrls.includes(citation.url) &&
          testCase.retrieval.expectedSourceIds.includes(citation.sourceId),
        )
      : answer.citations.length === 0;
    cases.push({
      answer,
      automaticPass: !errorCode && statusPass && citationPass && retrieval.pass,
      caseId: testCase.id,
      citationPass,
      expectedStatus: testCase.expectedStatus,
      errorCode,
      humanReviewRequired: true as const,
      humanRubric: testCase.humanRubric,
      latencyMs,
      modelId,
      promptVersion,
      question: testCase.question,
      retrieval,
      risk: testCase.risk,
      requiresContactAccuracy: testCase.requiresContactAccuracy,
      sourceEvidence: testCase.sourceEvidence,
      statusPass,
    });
  }
  const positives = cases.map((entry) => entry.retrieval)
    .filter((entry) => entry.kind === "positive");
  const negatives = cases.map((entry) => entry.retrieval)
    .filter((entry) => entry.kind === "negative");
  return {
    cases,
    completedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    datasetReviewStatus: dataset.reviewStatus,
    releaseStatus: "pending_human_review" as const,
    summary: {
      automaticPassCount: cases.filter((entry) => entry.automaticPass).length,
      caseCount: cases.length,
      evidenceHitAt5: average(positives.map((entry) => entry.evidenceHit)),
      hitAt5: average(positives.map((entry) => entry.hit)),
      mrrAt5: average(positives.map((entry) => entry.reciprocalRank)),
      noResultAccuracy: average(negatives.map((entry) => Number(entry.pass))),
      recallAt5: average(positives.map((entry) => entry.recall)),
    },
  };
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && error.message === "EVALUATION_ROUTE_MISMATCH") {
    return "EVALUATION_ROUTE_MISMATCH";
  }
  if (error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^[A-Z0-9_]{3,64}$/.test(error.code)) {
    return error.code;
  }
  return "EVALUATION_CASE_FAILED";
}

function evaluateRetrieval(
  testCase: KnowledgeEvaluationCase,
  evidence: RetrievedEvidence[],
  now: Date,
) {
  const expectation = testCase.retrieval;
  if (!expectation) {
    return { kind: "none" as const, pass: true, results: [] };
  }
  const results = evidence.map((item) => ({
    chunkId: item.chunkId,
    content: item.content,
    documentVersionId: item.documentVersionId,
    effectiveAt: item.effectiveAt,
    fetchedAt: item.fetchedAt,
    heading: item.heading,
    metadata: item.metadata,
    sourceId: item.sourceId,
    title: item.title,
    url: item.url,
  }));
  const allSafe = evidence.every((item) => {
    const fetched = new Date(item.fetchedAt).getTime();
    return Number.isFinite(fetched) &&
      fetched <= now.getTime() &&
      now.getTime() - fetched <= getKnowledgeSource(item.sourceId).maxStalenessHours * 3_600_000 &&
      (!expectation.academicYear || item.metadata.academic_year === expectation.academicYear);
  });
  if (expectation.expectNoResults) {
    return {
      kind: "negative" as const,
      pass: evidence.length === 0,
      results,
      safe: allSafe,
    };
  }
  const expectedUrls = new Set(expectation.expectedUrls);
  const foundUrls = new Set(evidence
    .filter((item) => expectation.expectedSourceIds.includes(item.sourceId))
    .map((item) => item.url)
    .filter((url) => expectedUrls.has(url)));
  const rank = evidence.findIndex((item) => foundUrls.has(item.url) &&
    expectation.expectedSourceIds.includes(item.sourceId));
  const hit = Number(rank >= 0);
  const relevantTerms = expectation.relevantTextTerms?.map(normalizeText) ?? [];
  const evidenceRank = evidence.findIndex((item) =>
    expectedUrls.has(item.url) &&
    expectation.expectedSourceIds.includes(item.sourceId) &&
    relevantTerms.every((term) =>
      normalizeText(`${item.heading ?? ""} ${item.content}`).includes(term)),
  );
  const evidenceHit = Number(evidenceRank >= 0);
  const recall = expectedUrls.size ? foundUrls.size / expectedUrls.size : 0;
  const reciprocalRank = rank >= 0 ? 1 / (rank + 1) : 0;
  const identities = evidence.map((item) => `${item.documentVersionId}:${item.chunkId}`);
  const unique = new Set(identities).size === identities.length;
  const citationReady = evidence.every((item) =>
    Boolean(item.chunkId && item.documentVersionId && item.title && item.url && item.fetchedAt),
  );
  return {
    citationReady,
    evidenceHit,
    hit,
    kind: "positive" as const,
    pass: hit === 1 && evidenceHit === 1 && recall === 1 && allSafe && unique && citationReady,
    reciprocalRank,
    recall,
    results,
    safe: allSafe,
    unique,
  };
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
