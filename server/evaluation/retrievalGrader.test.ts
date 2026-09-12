import assert from "node:assert/strict";
import test from "node:test";
import type { RetrievedEvidence } from "../ai/knowledge/types";
import { gradeRetrieval } from "./retrievalGrader";

function evidence(overrides: Partial<RetrievedEvidence> = {}): RetrievedEvidence {
  return {
    chunkId: "1",
    content: "Official content",
    documentVersionId: "11111111-1111-4111-8111-111111111111",
    effectiveAt: null,
    fetchedAt: "2026-09-12T00:00:00.000Z",
    heading: null,
    metadata: { academic_year: "AY2026/27" },
    score: 0.1,
    sourceId: "nus_registrar_calendar",
    title: "Academic calendar",
    trustTier: "T1",
    url: "https://www.nus.edu.sg/registrar/calendar",
    ...overrides,
  };
}

test("reports retrieval quality, freshness, duplication, and metadata isolation", () => {
  const stale = evidence({
    chunkId: "old",
    fetchedAt: "2026-08-01T00:00:00.000Z",
    metadata: { academic_year: "AY2025/26" },
  });
  const matching = evidence();
  const summary = gradeRetrieval(
    [{
      expectedAcademicYear: "AY2026/27",
      expectedSourceIds: ["nus_registrar_calendar"],
      id: "calendar-1",
      relevantChunkIds: ["1"],
      results: [stale, matching, matching],
    }],
    { now: new Date("2026-09-12T01:00:00.000Z") },
  );

  assert.equal(summary.hitRateAtK, 1);
  assert.equal(summary.meanReciprocalRank, 0.5);
  assert.equal(summary.recallAtK, 1);
  assert.equal(summary.citationReadyRate, 1);
  assert.equal(summary.duplicateResultRate, 1 / 3);
  assert.equal(summary.staleResultRate, 1 / 3);
  assert.equal(summary.wrongAcademicYearRate, 1 / 3);
});
