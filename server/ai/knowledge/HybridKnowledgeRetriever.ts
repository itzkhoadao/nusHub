import { getKnowledgeSource } from "./sourceRegistry";
import type {
  EmbeddingProvider,
  KnowledgeSearchQuery,
  KnowledgeSearchRepository,
  RetrievedEvidence,
} from "./types";

export type KnowledgeRetrievalTelemetry = {
  durationMs: number;
  resultCount: number;
  sourceCount: number;
};

export class HybridKnowledgeRetriever {
  constructor(
    private readonly repository: KnowledgeSearchRepository,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly options: {
      candidateLimit: number;
      maxSemanticDistance: number;
      recordTelemetry?: (event: KnowledgeRetrievalTelemetry) => void;
      resultLimit: number;
    },
  ) {
    if (
      !Number.isInteger(options.candidateLimit) ||
      options.candidateLimit < 1 ||
      !Number.isInteger(options.resultLimit) ||
      options.resultLimit < 1 ||
      options.candidateLimit < options.resultLimit ||
      options.maxSemanticDistance < 0 ||
      options.maxSemanticDistance > 2
    ) {
      throw new RangeError("Invalid knowledge retrieval limits");
    }
  }

  async search(query: KnowledgeSearchQuery, signal?: AbortSignal) {
    const text = query.text.trim();
    if (!text || text.length > 2_000) {
      throw new TypeError("Knowledge search text must contain 1 to 2,000 characters");
    }
    const filters = { ...(query.filters ?? {}) };
    if (filters.sourceIds) {
      filters.sourceIds = [...new Set(filters.sourceIds)].map(
        (sourceId) => getKnowledgeSource(sourceId).id,
      );
    }
    if (filters.metadata) {
      filters.metadata = validateMetadataFilters(filters.metadata);
    }
    const limit = Math.min(Math.max(query.limit ?? this.options.resultLimit, 1), 10);
    const startedAt = Date.now();
    const embedding = await this.embeddingProvider.embedQuery(text, signal);
    const candidates = await this.repository.hybridSearch({
      candidateLimit: this.options.candidateLimit,
      embedding,
      embeddingDimensions: this.embeddingProvider.dimensions,
      embeddingModel: this.embeddingProvider.model,
      filters,
      limit: Math.min(limit * 3, this.options.candidateLimit),
      maxSemanticDistance: this.options.maxSemanticDistance,
      text,
    });
    const results = diversify(candidates, limit);
    this.options.recordTelemetry?.({
      durationMs: Date.now() - startedAt,
      resultCount: results.length,
      sourceCount: new Set(results.map((result) => result.sourceId)).size,
    });
    return results;
  }
}

function validateMetadataFilters(metadata: Record<string, string>) {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      !/^[a-z][a-z0-9_]*$/.test(key) ||
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 500
    ) {
      throw new TypeError("Knowledge metadata filters are invalid");
    }
    safe[key] = value.trim();
  }
  return safe;
}

function diversify(candidates: RetrievedEvidence[], limit: number) {
  const results: RetrievedEvidence[] = [];
  const versionCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (
      results.some((result) =>
        nearDuplicate(result.content, candidate.content),
      )
    ) {
      continue;
    }
    const count = versionCounts.get(candidate.documentVersionId) ?? 0;
    if (count >= 2) continue;
    versionCounts.set(candidate.documentVersionId, count + 1);
    results.push(candidate);
    if (results.length === limit) break;
  }
  return results;
}

function nearDuplicate(left: string, right: string) {
  const leftTerms = terms(left);
  const rightTerms = terms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return false;
  let intersection = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) intersection += 1;
  const union = leftTerms.size + rightTerms.size - intersection;
  return intersection / union >= 0.88;
}

function terms(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}
