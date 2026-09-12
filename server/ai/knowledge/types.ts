import { z } from "zod";

export const trustTierSchema = z.enum(["T1", "T2", "T3"]);

export const knowledgeSourceSchema = z
  .object({
    allowedDomains: z.array(z.string().min(1)).min(1),
    baseUrl: z.string().url(),
    contentTypes: z.array(z.enum(["text/html", "application/pdf"])).min(1),
    enabled: z.boolean(),
    highStakes: z.boolean(),
    id: z.string().regex(/^[a-z0-9_]{3,100}$/),
    maxStalenessHours: z.number().int().positive(),
    name: z.string().min(1),
    owner: z.string().min(1),
    requiredMetadata: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)),
    trustTier: trustTierSchema,
  })
  .strict();

export const sourceRegistrySchema = z
  .object({
    sources: z.array(knowledgeSourceSchema),
    version: z.string().min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    const seen = new Set<string>();
    for (const [index, source] of registry.sources.entries()) {
      if (seen.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate source ID: ${source.id}`,
          path: ["sources", index, "id"],
        });
      }
      seen.add(source.id);
    }
  });

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;

export type FetchedKnowledgeDocument = {
  bytes: Uint8Array;
  canonicalUrl: string;
  contentType: "text/html" | "application/pdf";
  etag: string | null;
  fetchedAt: string;
  lastModified: string | null;
};

export type ParsedKnowledgeDocument = {
  canonicalUrl: string;
  content: string;
  contentType: "text/html" | "application/pdf";
  effectiveAt: string | null;
  etag: string | null;
  fetchedAt: string;
  lastModified: string | null;
  metadata: Record<string, string>;
  title: string;
};

export type KnowledgeChunkDraft = {
  content: string;
  contentHash: string;
  heading: string | null;
  index: number;
  metadata: Record<string, string>;
  tokenEstimate: number;
};

export type EmbeddedKnowledgeChunk = KnowledgeChunkDraft & {
  embedding: number[];
};

export type KnowledgeDocumentDraft = Omit<ParsedKnowledgeDocument, "content"> & {
  chunks: EmbeddedKnowledgeChunk[];
  contentHash: string;
};

export type IngestionResult = {
  chunkCount: number;
  documentCount: number;
  runId: string;
  status: "published" | "unchanged";
  versionId: string | null;
};

export type KnowledgeSearchFilters = {
  academicYear?: string;
  highStakesOnly?: boolean;
  metadata?: Record<string, string>;
  sourceIds?: string[];
  trustTiers?: Array<z.infer<typeof trustTierSchema>>;
};

export type KnowledgeSearchQuery = {
  filters?: KnowledgeSearchFilters;
  limit?: number;
  text: string;
};

export type RetrievedEvidence = {
  chunkId: string;
  content: string;
  documentVersionId: string;
  effectiveAt: string | null;
  fetchedAt: string;
  heading: string | null;
  metadata: Record<string, unknown>;
  score: number;
  sourceId: string;
  title: string;
  trustTier: z.infer<typeof trustTierSchema>;
  url: string;
};

export interface EmbeddingProvider {
  readonly dimensions: number;
  readonly model: string;
  embedDocuments(
    inputs: string[],
    title: string,
    signal?: AbortSignal,
  ): Promise<number[][]>;
  embedQuery(input: string, signal?: AbortSignal): Promise<number[]>;
}

export interface KnowledgeSearchRepository {
  hybridSearch(input: {
    candidateLimit: number;
    embedding: number[];
    embeddingDimensions: number;
    embeddingModel: string;
    filters: KnowledgeSearchFilters;
    limit: number;
    maxSemanticDistance: number;
    text: string;
  }): Promise<RetrievedEvidence[]>;
}

export interface KnowledgeIngestionRepository {
  beginRun(input: {
    metadata: Record<string, unknown>;
    requestedUrl: string;
    source: KnowledgeSource;
    registryVersion: string;
  }): Promise<string>;
  failRun(runId: string, errorCode: string): Promise<void>;
  findVersion(sourceId: string, contentHash: string): Promise<{
    chunkCount: number;
    documentCount: number;
    id: string;
    status: "published" | "superseded";
  } | null>;
  publish(input: {
    contentHash: string;
    documents: KnowledgeDocumentDraft[];
    effectiveAt: string | null;
    embeddingDimensions: number;
    embeddingModel: string;
    fetchedAt: string;
    metadata: Record<string, string>;
    runId: string;
    source: KnowledgeSource;
  }): Promise<IngestionResult>;
  reuseVersion(input: {
    contentHash: string;
    runId: string;
    sourceId: string;
    versionId: string;
  }): Promise<IngestionResult>;
}
