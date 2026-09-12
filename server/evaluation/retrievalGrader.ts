import { getKnowledgeSource } from "../ai/knowledge/sourceRegistry";
import type { RetrievedEvidence } from "../ai/knowledge/types";

export type RetrievalEvaluationCase = {
  expectedAcademicYear?: string;
  expectedSourceIds: string[];
  id: string;
  relevantChunkIds?: string[];
  results: RetrievedEvidence[];
};

export type RetrievalEvaluationSummary = {
  caseCount: number;
  citationReadyRate: number;
  duplicateResultRate: number;
  hitRateAtK: number;
  meanReciprocalRank: number;
  recallAtK: number;
  staleResultRate: number;
  wrongAcademicYearRate: number;
};

export function gradeRetrieval(
  cases: RetrievalEvaluationCase[],
  options: { now?: Date } = {},
): RetrievalEvaluationSummary {
  if (cases.length === 0) throw new RangeError("Retrieval evaluation requires cases");
  const now = options.now ?? new Date();
  let hits = 0;
  let reciprocalRank = 0;
  let recall = 0;
  let citationReady = 0;
  let duplicateResults = 0;
  let staleResults = 0;
  let wrongAcademicYear = 0;
  let resultCount = 0;

  for (const testCase of cases) {
    if (testCase.expectedSourceIds.length === 0) {
      throw new RangeError(`Retrieval case ${testCase.id} has no expected source`);
    }
    const relevantChunks = new Set(testCase.relevantChunkIds ?? []);
    const firstRelevant = testCase.results.findIndex(
      (result) =>
        testCase.expectedSourceIds.includes(result.sourceId) &&
        (relevantChunks.size === 0 || relevantChunks.has(result.chunkId)),
    );
    if (firstRelevant >= 0) {
      hits += 1;
      reciprocalRank += 1 / (firstRelevant + 1);
    }
    if (relevantChunks.size > 0) {
      const found = new Set(
        testCase.results
          .map((result) => result.chunkId)
          .filter((chunkId) => relevantChunks.has(chunkId)),
      );
      recall += found.size / relevantChunks.size;
    } else {
      const foundSources = new Set(
        testCase.results
          .map((result) => result.sourceId)
          .filter((sourceId) => testCase.expectedSourceIds.includes(sourceId)),
      );
      recall += foundSources.size / testCase.expectedSourceIds.length;
    }

    const seen = new Set<string>();
    for (const result of testCase.results) {
      resultCount += 1;
      const identity = `${result.documentVersionId}:${result.chunkId}`;
      if (seen.has(identity)) duplicateResults += 1;
      seen.add(identity);
      if (isCitationReady(result)) citationReady += 1;
      if (isStale(result, now)) staleResults += 1;
      if (
        testCase.expectedAcademicYear &&
        result.metadata.academic_year !== testCase.expectedAcademicYear
      ) {
        wrongAcademicYear += 1;
      }
    }
  }

  return {
    caseCount: cases.length,
    citationReadyRate: ratio(citationReady, resultCount),
    duplicateResultRate: ratio(duplicateResults, resultCount),
    hitRateAtK: hits / cases.length,
    meanReciprocalRank: reciprocalRank / cases.length,
    recallAtK: recall / cases.length,
    staleResultRate: ratio(staleResults, resultCount),
    wrongAcademicYearRate: ratio(wrongAcademicYear, resultCount),
  };
}

function isCitationReady(result: RetrievedEvidence) {
  return Boolean(
    result.chunkId &&
      result.documentVersionId &&
      result.fetchedAt &&
      result.sourceId &&
      result.title &&
      result.url,
  );
}

function isStale(result: RetrievedEvidence, now: Date) {
  const fetchedAt = new Date(result.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) return true;
  const maximumAge = getKnowledgeSource(result.sourceId).maxStalenessHours * 60 * 60 * 1_000;
  return now.getTime() - fetchedAt.getTime() > maximumAge;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}
