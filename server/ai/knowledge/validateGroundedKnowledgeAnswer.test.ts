import assert from "node:assert/strict";
import test from "node:test";
import type { GroundedAnswer } from "../domain/types";
import type { RetrievedEvidence } from "./types";
import { validateGroundedKnowledgeAnswer } from "./validateGroundedKnowledgeAnswer";

const evidence: RetrievedEvidence = {
  chunkId: "42",
  content: "Official grounded fact.",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  effectiveAt: "2026-08-01T00:00:00.000Z",
  fetchedAt: "2026-09-12T00:00:00.000Z",
  heading: "Fact",
  metadata: {},
  score: 0.02,
  sourceId: "nus_transport",
  title: "Transport",
  trustTier: "T1",
  url: "https://uci.nus.edu.sg/transport",
};

function answer(url = evidence.url): GroundedAnswer {
  return {
    answer: "Official grounded fact.",
    citations: [{
      claimIds: ["knowledge_chunk:42"],
      documentVersionId: evidence.documentVersionId,
      effectiveAt: evidence.effectiveAt,
      retrievedAt: evidence.fetchedAt,
      sourceId: evidence.sourceId,
      title: evidence.title,
      url,
    }],
    status: "answered",
    warnings: [],
  };
}

test("accepts exact evidence identities and rejects forged citation fields", () => {
  assert.deepEqual(validateGroundedKnowledgeAnswer(answer(), [evidence]), answer());
  assert.throws(
    () => validateGroundedKnowledgeAnswer(answer("https://attacker.example"), [evidence]),
    /does not exactly match retrieved evidence/,
  );
});

test("does not allow an answered response without evidence attribution", () => {
  assert.throws(
    () => validateGroundedKnowledgeAnswer({ ...answer(), citations: [] }, [evidence]),
    /requires a citation/,
  );
});
