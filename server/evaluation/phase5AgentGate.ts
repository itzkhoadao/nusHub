import { z } from "zod";
import { sha256 } from "../ai/knowledge/chunkDocument";
import { getKnowledgeSource, listKnowledgeSources } from "../ai/knowledge/sourceRegistry";
import { knowledgeEvaluationDatasetSchema } from "./knowledgeEvaluation";

export const PHASE5_AGENT_POLICY = "phase5-owner-agent-review-2026-10-05";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const citationSchema = z.object({
  claimIds: z.array(z.string()).min(1), sourceId: z.string(), documentVersionId: z.string(),
  url: z.url(), title: z.string(), effectiveAt: z.string().nullable(), retrievedAt: z.iso.datetime(),
});
const reportSchema = z.object({
  completedAt: z.iso.datetime(), datasetVersion: z.string(),
  runManifest: z.object({ scope: z.literal("full_dataset"), datasetHash: hash,
    environment: z.literal("staging"), caseIds: z.array(z.string()), excludedCaseIds: z.array(z.string()).length(0) }),
  cases: z.array(z.object({
    caseId: z.string(), question: z.string(), automaticPass: z.literal(true),
    answer: z.object({ answer: z.string(), status: z.string(), citations: z.array(citationSchema) }),
    execution: z.object({ answerRetrievalCalls: z.number(), generationCalls: z.number() }),
    retrieval: z.object({ results: z.array(z.object({ chunkId: z.string(), content: z.string(),
      sourceId: z.string(), documentVersionId: z.string(), url: z.url(), title: z.string(),
      fetchedAt: z.iso.datetime(), effectiveAt: z.string().nullable() })) }),
  })).min(1),
  summary: z.object({ automaticPassCount: z.number(), caseCount: z.number(), hitAt5: z.number().min(.99),
    evidenceHitAt5: z.number().min(.99), recallAt5: z.number().min(.95), noResultAccuracy: z.number().min(.95) }),
});
export const phase5AgentReviewSchema = z.object({
  policyId: z.literal(PHASE5_AGENT_POLICY), reviewerKind: z.literal("agent"),
  reviewer: z.literal("Codex"), owner: z.literal("daoanhkhoa"), reviewedAt: z.iso.datetime(),
  reportHash: hash, datasetHash: hash,
  evidenceHashes: z.object({ sql: hash, api: hash, refresh: hash }).strict(),
  reviews: z.array(z.object({
    caseId: z.string(), datasetApproved: z.literal(true), answerText: z.string(),
    factualCorrect: z.literal(true), freshnessCorrectAtRun: z.literal(true), behaviorCorrect: z.literal(true),
    privacySafe: z.literal(true), contactAccuracy: z.boolean().nullable(), allMaterialClaimsCovered: z.literal(true),
    notes: z.string().min(20),
    claims: z.array(z.object({ text: z.string().min(1), evidenceClaimIds: z.array(z.string()).min(1),
      supported: z.literal(true) }).strict()),
  }).strict()).min(1),
}).strict();

// A scoped owner-authorized gate. It never rewrites historic human-review status
// or treats an agent judgment as independent human certification.
export function evaluatePhase5AgentGate(input: {
  datasetText: string; reportText: string; reviewText: string; sqlText: string; apiText: string; refreshText: string;
}, now = new Date()) {
  const dataset = knowledgeEvaluationDatasetSchema.parse(JSON.parse(input.datasetText) as unknown);
  const report = reportSchema.parse(JSON.parse(input.reportText) as unknown);
  const review = phase5AgentReviewSchema.parse(JSON.parse(input.reviewText) as unknown);
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  require(review.reportHash === sha256(input.reportText), "Review/report hash mismatch");
  require(review.datasetHash === sha256(input.datasetText) && report.runManifest.datasetHash === review.datasetHash,
    "Frozen dataset hash mismatch");
  require(report.datasetVersion === dataset.version, "Dataset version mismatch");
  require(Date.parse(report.completedAt) <= Date.parse(review.reviewedAt) && Date.parse(review.reviewedAt) <= now.getTime(),
    "Review must follow the run and cannot be future-dated");
  const expected = dataset.cases.map(c => c.id).sort();
  for (const ids of [report.cases.map(c => c.caseId), report.runManifest.caseIds, review.reviews.map(c => c.caseId)]) {
    require(JSON.stringify([...ids].sort()) === JSON.stringify(expected), "Missing, duplicate, or unexpected case");
  }
  require(report.summary.caseCount === expected.length && report.summary.automaticPassCount === expected.length,
    "Summary counts do not match frozen cases");
  let claimCount = 0;
  let answeredCount = 0;
  for (const item of report.cases) {
    const groundTruth = dataset.cases.find(c => c.id === item.caseId)!;
    const judgment = review.reviews.find(c => c.caseId === item.caseId)!;
    require(item.question === groundTruth.question && item.answer.status === groundTruth.expectedStatus,
      `${item.caseId}: question or status mismatch`);
    require(judgment.answerText === item.answer.answer, `${item.caseId}: reviewed answer changed`);
    require(judgment.contactAccuracy !== false && (!groundTruth.requiresContactAccuracy || judgment.contactAccuracy === true),
      `${item.caseId}: contact review missing or failed`);
    if (groundTruth.expectNoExternalCalls) require(item.execution.answerRetrievalCalls === 0 && item.execution.generationCalls === 0,
      `${item.caseId}: unexpected external calls`);
    const citedIds = new Set<string>();
    for (const citation of item.answer.citations) {
      const source = getKnowledgeSource(citation.sourceId);
      const url = new URL(citation.url);
      require(url.protocol === "https:" && !url.username && !url.password &&
        source.allowedDomains.includes(url.hostname), `${item.caseId}: unapproved citation URL`);
      const age = Date.parse(report.completedAt) - Date.parse(citation.retrievedAt);
      require(age >= 0 && age <= source.maxStalenessHours * 3_600_000, `${item.caseId}: citation expired at run`);
      for (const claimId of citation.claimIds) {
        const evidence = item.retrieval.results.find(e => `knowledge_chunk:${e.chunkId}` === claimId &&
          e.documentVersionId === citation.documentVersionId && e.sourceId === citation.sourceId);
        require(!!evidence && evidence.url === citation.url && evidence.title === citation.title &&
          evidence.fetchedAt === citation.retrievedAt && evidence.effectiveAt === citation.effectiveAt,
        `${item.caseId}: citation identity mismatch`);
        citedIds.add(claimId);
      }
    }
    if (item.answer.status === "answered") {
      answeredCount++;
      require(judgment.claims.length > 0 && citedIds.size > 0, `${item.caseId}: claim review missing`);
    }
    for (const claim of judgment.claims) {
      require(claim.evidenceClaimIds.every(id => citedIds.has(id)), `${item.caseId}: reviewed claim uses uncited evidence`);
      claimCount++;
    }
  }
  for (const name of ["sql", "api", "refresh"] as const) {
    require(review.evidenceHashes[name] === sha256(input[`${name}Text`]), `${name}: supporting evidence changed`);
  }
  const sql = z.object({ environment: z.literal("staging"), checks: z.object({
    baselineRetrieval: z.literal(true), wrongYearExcluded: z.literal(true), staleExcluded: z.literal(true),
    conflictsStopGeneration: z.literal(true), snapshotPreserved: z.literal(true),
    allSourcesExpireSafely: z.literal(true), futureVerificationExcluded: z.literal(true),
  }), monthlyExpiry: z.array(z.object({ sourceId: z.string(), maxStalenessHours: z.number(),
    freshFixtureRetrieved: z.literal(true), expiredExcluded: z.literal(true), futureExcluded: z.literal(true),
    expiredStatus: z.literal("not_verified"), generationCalls: z.literal(0) })) }).parse(JSON.parse(input.sqlText) as unknown);
  require(JSON.stringify(sql.monthlyExpiry.map(s => s.sourceId).sort()) === JSON.stringify(listKnowledgeSources().map(s => s.id).sort()),
    "Expiry checks must cover every source once");
  require(sql.monthlyExpiry.every(s => s.maxStalenessHours === getKnowledgeSource(s.sourceId).maxStalenessHours),
    "Expiry policy mismatch");
  z.object({ environment: z.literal("staging"), checks: z.object({ ownership: z.literal(true),
    clarificationFollowUp: z.literal(true), groundedStreaming: z.literal(true), exactPassages: z.literal(true),
    idempotentReplay: z.literal(true), keyConflict: z.literal(true), atomicQuota: z.literal(true),
    privateCacheHeaders: z.literal(true), feedback: z.literal(true), rename: z.literal(true), cascadeDelete: z.literal(true),
  }) }).parse(JSON.parse(input.apiText) as unknown);
  z.object({ environment: z.literal("staging"), failureCode: z.literal("SOURCE_APPROVAL_CHANGED"),
    snapshotPreserved: z.literal(true), failedRun: z.object({ status: z.literal("failed"),
      error_code: z.literal("SOURCE_APPROVAL_CHANGED") }) }).parse(JSON.parse(input.refreshText) as unknown);
  return { policyId: PHASE5_AGENT_POLICY, status: "agent_reviewed_pass", reviewerKind: "agent",
    caseCount: expected.length, answeredCount, reviewedMaterialClaims: claimCount,
    observedMetrics: { ...report.summary, agentFactualCorrectness: 1, agentClaimEntailment: 1, agentContactAccuracy: 1 },
    sourceUpdateCadence: "monthly_manual", expiredSourceBehavior: "not_verified",
    productionAuthorized: false, reportHash: review.reportHash, datasetHash: review.datasetHash,
    limitation: "Observed finite-suite results and owner-accepted agent judgments; not independent human review or a population reliability guarantee." };
}
