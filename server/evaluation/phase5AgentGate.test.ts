import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../ai/knowledge/chunkDocument";
import { listKnowledgeSources } from "../ai/knowledge/sourceRegistry";
import { evaluatePhase5AgentGate, PHASE5_AGENT_POLICY } from "./phase5AgentGate";

function fixture() {
  const date = new Date(Date.now() - 60_000).toISOString();
  const url = "https://nus.edu.sg/nuslibraries/spaces/24-hour-study-spaces";
  const dataset = { version: "test", reviewStatus: "pending_human_review", cases: [{
    id: "K001", question: "Which library study space is open?", expectedStatus: "answered", risk: "high",
    requiresContactAccuracy: true, sourceEvidence: "Source fixture", humanRubric: ["Check facts", "Check contacts"],
    retrieval: { expectedSourceIds: ["nus_libraries"], expectedUrls: [url], relevantTextTerms: ["Level 2"] },
  }] };
  const datasetText = JSON.stringify(dataset);
  const report = { completedAt: date, datasetVersion: "test", runManifest: { scope: "full_dataset", environment: "staging",
    datasetHash: sha256(datasetText), caseIds: ["K001"], excludedCaseIds: [] as string[] },
    cases: [{ caseId: "K001", question: dataset.cases[0].question, automaticPass: true,
      answer: { answer: "Level 2 is open.", status: "answered", citations: [{ claimIds: ["knowledge_chunk:1"],
        sourceId: "nus_libraries", documentVersionId: "v1", url, title: "Library", effectiveAt: null, retrievedAt: date }] },
      execution: { answerRetrievalCalls: 1, generationCalls: 1 },
      retrieval: { results: [{ chunkId: "1", content: "Level 2 is open.", sourceId: "nus_libraries",
        documentVersionId: "v1", url, title: "Library", effectiveAt: null, fetchedAt: date }] } }],
    summary: { automaticPassCount: 1, caseCount: 1, hitAt5: 1, evidenceHitAt5: 1, recallAt5: 1, noResultAccuracy: 1 } };
  const reportText = JSON.stringify(report);
  const sql = { environment: "staging", checks: { baselineRetrieval: true, wrongYearExcluded: true, staleExcluded: true,
    conflictsStopGeneration: true, snapshotPreserved: true, allSourcesExpireSafely: true, futureVerificationExcluded: true },
    monthlyExpiry: listKnowledgeSources().map(s => ({ sourceId: s.id, maxStalenessHours: s.maxStalenessHours,
      freshFixtureRetrieved: true, expiredExcluded: true, futureExcluded: true, expiredStatus: "not_verified", generationCalls: 0 })) };
  const api = { environment: "staging", checks: { ownership: true, clarificationFollowUp: true, groundedStreaming: true,
    exactPassages: true, idempotentReplay: true, keyConflict: true, atomicQuota: true, privateCacheHeaders: true,
    feedback: true, rename: true, cascadeDelete: true } };
  const refresh = { environment: "staging", failureCode: "SOURCE_APPROVAL_CHANGED", snapshotPreserved: true,
    failedRun: { status: "failed", error_code: "SOURCE_APPROVAL_CHANGED" } };
  const sqlText = JSON.stringify(sql), apiText = JSON.stringify(api), refreshText = JSON.stringify(refresh);
  const review = { policyId: PHASE5_AGENT_POLICY, reviewerKind: "agent", reviewer: "Codex", owner: "daoanhkhoa",
    reviewedAt: date, reportHash: sha256(reportText), datasetHash: sha256(datasetText),
    evidenceHashes: { sql: sha256(sqlText), api: sha256(apiText), refresh: sha256(refreshText) },
    reviews: [{ caseId: "K001", datasetApproved: true, answerText: "Level 2 is open.", factualCorrect: true,
      freshnessCorrectAtRun: true, behaviorCorrect: true, privacySafe: true, contactAccuracy: true,
      allMaterialClaimsCovered: true, notes: "Checked the entire answer against the cited fixture passage.",
      claims: [{ text: "Level 2 is open.", evidenceClaimIds: ["knowledge_chunk:1"], supported: true }] }] };
  return { report, review, sql, input: { datasetText, reportText, reviewText: JSON.stringify(review), sqlText, apiText, refreshText } };
}

test("agent policy accepts bound reviews without pretending human approval or enabling production", () => {
  const result = evaluatePhase5AgentGate(fixture().input);
  assert.equal(result.status, "agent_reviewed_pass");
  assert.equal(result.reviewerKind, "agent");
  assert.equal(result.productionAuthorized, false);
});

test("agent gate rejects changed report and dataset bytes", () => {
  const { input } = fixture();
  assert.throws(() => evaluatePhase5AgentGate({ ...input, reportText: input.reportText + " " }), /hash mismatch/);
  assert.throws(() => evaluatePhase5AgentGate({ ...input, datasetText: input.datasetText + " " }), /hash mismatch/);
});

test("agent gate rejects missing, duplicate, negative and future reviews", () => {
  for (const kind of ["missing", "duplicate", "negative", "future"] as const) {
    const { input, review } = fixture();
    if (kind === "missing") review.reviews = [];
    if (kind === "duplicate") review.reviews.push(review.reviews[0]);
    if (kind === "negative") review.reviews[0].factualCorrect = false;
    if (kind === "future") review.reviewedAt = new Date(Date.now() + 86_400_000).toISOString();
    assert.throws(() => evaluatePhase5AgentGate({ ...input, reviewText: JSON.stringify(review) }));
  }
});

test("agent gate rejects omitted contact judgments and uncited claim evidence", () => {
  const { input, review } = fixture();
  review.reviews[0].contactAccuracy = false;
  assert.throws(() => evaluatePhase5AgentGate({ ...input, reviewText: JSON.stringify(review) }), /contact review/);
  review.reviews[0].contactAccuracy = true;
  review.reviews[0].claims[0].evidenceClaimIds = ["knowledge_chunk:99"];
  assert.throws(() => evaluatePhase5AgentGate({ ...input, reviewText: JSON.stringify(review) }), /uncited evidence/);
});

test("agent gate rejects incomplete runs even when a review hash matches", () => {
  const { input, report, review } = fixture();
  report.runManifest.excludedCaseIds.push("K002");
  const reportText = JSON.stringify(report);
  review.reportHash = sha256(reportText);
  assert.throws(() => evaluatePhase5AgentGate({ ...input, reportText, reviewText: JSON.stringify(review) }));
});

test("agent gate rejects missing expiry coverage and mutated supporting reports", () => {
  const { input, sql, review } = fixture();
  assert.throws(() => evaluatePhase5AgentGate({ ...input, apiText: input.apiText + " " }), /supporting evidence changed/);
  sql.monthlyExpiry.pop();
  const sqlText = JSON.stringify(sql);
  review.evidenceHashes.sql = sha256(sqlText);
  assert.throws(() => evaluatePhase5AgentGate({ ...input, sqlText, reviewText: JSON.stringify(review) }), /every source/);
});

test("agent gate rejects expired citation evidence at evaluation time", () => {
  const { input, report, review } = fixture();
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  report.cases[0].answer.citations[0].retrievedAt = old;
  report.cases[0].retrieval.results[0].fetchedAt = old;
  const reportText = JSON.stringify(report);
  review.reportHash = sha256(reportText);
  assert.throws(() => evaluatePhase5AgentGate({ ...input, reportText, reviewText: JSON.stringify(review) }), /expired at run/);
});
