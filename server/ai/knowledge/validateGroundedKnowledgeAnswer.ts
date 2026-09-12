import type { GroundedAnswer } from "../domain/types";
import type { RetrievedEvidence } from "./types";

export function validateGroundedKnowledgeAnswer(
  answer: GroundedAnswer,
  evidence: RetrievedEvidence[],
): GroundedAnswer {
  const evidenceByClaim = new Map(
    evidence.map((item) => [`knowledge_chunk:${item.chunkId}`, item]),
  );

  if (answer.status === "answered" && answer.citations.length === 0) {
    throw new GroundingValidationError("An answered response requires a citation");
  }

  const seen = new Set<string>();
  const citations = answer.citations.filter((citation) => {
    if (citation.claimIds.length === 0) {
      throw new GroundingValidationError("A citation must identify evidence claims");
    }
    for (const claimId of citation.claimIds) {
      const item = evidenceByClaim.get(claimId);
      if (
        !item ||
        item.sourceId !== citation.sourceId ||
        item.documentVersionId !== citation.documentVersionId ||
        item.title !== citation.title ||
        item.url !== citation.url ||
        item.effectiveAt !== citation.effectiveAt ||
        item.fetchedAt !== citation.retrievedAt
      ) {
        throw new GroundingValidationError(
          "A citation does not exactly match retrieved evidence",
        );
      }
    }
    const identity = [
      citation.sourceId,
      citation.documentVersionId,
      citation.url,
      ...citation.claimIds.slice().sort(),
    ].join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  return { ...answer, citations };
}

export class GroundingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundingValidationError";
  }
}
