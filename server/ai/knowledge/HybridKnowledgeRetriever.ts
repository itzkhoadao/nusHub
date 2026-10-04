import { getKnowledgeSource } from "./sourceRegistry";
export const KNOWLEDGE_RETRIEVAL_POLICY_VERSION = "phase5.2026-10-04.v2";
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
      !Number.isFinite(options.maxSemanticDistance) ||
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
    const requestedLimit = query.limit ?? this.options.resultLimit;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new TypeError("Invalid knowledge result limit");
    signal?.throwIfAborted();
    const limit = Math.min(requestedLimit, 10);
    const startedAt = Date.now();
    const embedding = await this.embeddingProvider.embedQuery(text, signal);
    signal?.throwIfAborted();
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
    signal?.throwIfAborted();
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
  // Surface declared disagreements before a document cap can hide the second value.
  const groups = new Map<string, Set<unknown>>();
  for (const item of candidates) {
    const key = item.metadata.conflict_key;
    if (typeof key !== "string" || typeof item.metadata.fact_value !== "string") continue;
    const values = groups.get(key) ?? new Set<unknown>();
    values.add(item.metadata.fact_value); groups.set(key, values);
  }
  candidates = [...candidates].sort((left, right) =>
    Number((groups.get(String(right.metadata.conflict_key))?.size ?? 0) > 1) -
    Number((groups.get(String(left.metadata.conflict_key))?.size ?? 0) > 1));
  const results: RetrievedEvidence[] = [];
  const versionCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (
      results.some((result) =>
        !(result.metadata.conflict_key && result.metadata.conflict_key === candidate.metadata.conflict_key &&
          result.metadata.fact_value !== candidate.metadata.fact_value) &&
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
  // Dates, times and small counts are meaningful even when most words match.
  if (JSON.stringify(left.match(/\d+(?:[.:/-]\d+)*/g) ?? []) !==
      JSON.stringify(right.match(/\d+(?:[.:/-]\d+)*/g) ?? [])) return false;
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
