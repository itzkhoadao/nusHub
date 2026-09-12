import { KnowledgeSourcePolicyError, getKnowledgeSource } from "./sourceRegistry";
import { chunkDocument, sha256 } from "./chunkDocument";
import { parseKnowledgeDocument } from "./documentParser";
import type {
  EmbeddingProvider,
  KnowledgeDocumentDraft,
  KnowledgeIngestionRepository,
} from "./types";
import type { SafeSourceFetcher } from "./SafeSourceFetcher";

export type KnowledgeIngestionServiceOptions = {
  embeddingBatchSize: number;
  embeddingProvider: EmbeddingProvider;
  fetcher: SafeSourceFetcher;
  registryVersion: string;
  repository: KnowledgeIngestionRepository;
};

export type KnowledgeDocumentInput = {
  effectiveAt?: string;
  metadata?: Record<string, string>;
  title?: string;
  url?: string;
};

export type KnowledgeSourceIngestionInput = {
  documents: KnowledgeDocumentInput[];
  metadata?: Record<string, string>;
  signal?: AbortSignal;
  sourceId: string;
};

export class KnowledgeIngestionService {
  constructor(private readonly options: KnowledgeIngestionServiceOptions) {
    if (!Number.isInteger(options.embeddingBatchSize) || options.embeddingBatchSize < 1) {
      throw new RangeError("The embedding batch size must be a positive integer");
    }
  }

  ingest(input: KnowledgeDocumentInput & { signal?: AbortSignal; sourceId: string }) {
    const { signal, sourceId, ...document } = input;
    return this.ingestSource({
      documents: [document],
      metadata: input.metadata,
      signal,
      sourceId,
    });
  }

  async ingestSource(input: KnowledgeSourceIngestionInput) {
    const source = getKnowledgeSource(input.sourceId);
    if (input.documents.length === 0 || input.documents.length > 100) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID",
        "An ingestion snapshot must contain 1 to 100 documents.",
      );
    }
    const sourceMetadata = validateMetadata([], input.metadata ?? {});
    const documentInputs = input.documents.map((document) => ({
      ...document,
      effectiveAt: validateOptionalTimestamp(document.effectiveAt),
      metadata: validateMetadata(source.requiredMetadata, {
        ...(document.metadata ?? {}),
        ...(document.effectiveAt ? { effective_at: document.effectiveAt } : {}),
      }),
      url: document.url ?? source.baseUrl,
    }));
    const runId = await this.options.repository.beginRun({
      metadata: {
        ...sourceMetadata,
        requested_document_count: documentInputs.length,
      },
      requestedUrl:
        documentInputs.length === 1 ? documentInputs[0].url : source.baseUrl,
      source,
      registryVersion: this.options.registryVersion,
    });

    try {
      throwIfAborted(input.signal);
      const parsedDocuments = [];
      for (const document of documentInputs) {
        const fetched = await this.options.fetcher.fetch(
          source,
          document.url,
          input.signal,
        );
        throwIfAborted(input.signal);
        parsedDocuments.push(
          await parseKnowledgeDocument(fetched, {
            effectiveAt: document.effectiveAt ?? undefined,
            metadata: document.metadata,
            title: document.title,
          }),
        );
      }
      const canonicalUrls = parsedDocuments.map((document) => document.canonicalUrl);
      if (new Set(canonicalUrls).size !== canonicalUrls.length) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_METADATA_INVALID",
          "An ingestion snapshot cannot contain duplicate canonical URLs.",
        );
      }
      const documentHashes = parsedDocuments.map((document) => sha256(document.content));
      if (new Set(documentHashes).size !== documentHashes.length) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_METADATA_INVALID",
          "An ingestion snapshot cannot contain duplicate document content.",
        );
      }
      const contentHash = sha256(
        JSON.stringify(
          parsedDocuments
            .map((document, index) => ({
              contentHash: documentHashes[index],
              effectiveAt: document.effectiveAt,
              metadata: document.metadata,
              title: document.title,
              url: document.canonicalUrl,
            }))
            .sort((left, right) => left.url.localeCompare(right.url)),
        ),
      );
      const reusable = await this.options.repository.findVersion(
        source.id,
        contentHash,
      );
      if (reusable) {
        return await this.options.repository.reuseVersion({
          contentHash,
          runId,
          sourceId: source.id,
          versionId: reusable.id,
        });
      }

      const documents: KnowledgeDocumentDraft[] = [];
      for (const parsed of parsedDocuments) {
        const chunkDrafts = chunkDocument(parsed.content, parsed.metadata);
        if (chunkDrafts.length === 0) {
          throw new KnowledgeSourcePolicyError(
            "SOURCE_DOCUMENT_EMPTY",
            "The parsed source did not produce any publishable chunks.",
          );
        }
        const embeddings: number[][] = [];
        for (
          let offset = 0;
          offset < chunkDrafts.length;
          offset += this.options.embeddingBatchSize
        ) {
          throwIfAborted(input.signal);
          const batch = chunkDrafts.slice(
            offset,
            offset + this.options.embeddingBatchSize,
          );
          embeddings.push(
            ...(await this.options.embeddingProvider.embedDocuments(
              batch.map((chunk) => chunk.content),
              parsed.title,
              input.signal,
            )),
          );
        }
        if (embeddings.length !== chunkDrafts.length) {
          throw new Error("Embedding count does not match the chunk count");
        }
        documents.push({
          canonicalUrl: parsed.canonicalUrl,
          chunks: chunkDrafts.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings[index],
          })),
          contentHash: sha256(parsed.content),
          contentType: parsed.contentType,
          effectiveAt: parsed.effectiveAt,
          etag: parsed.etag,
          fetchedAt: parsed.fetchedAt,
          lastModified: parsed.lastModified,
          metadata: parsed.metadata,
          title: parsed.title,
        });
      }
      return await this.options.repository.publish({
        contentHash,
        documents,
        effectiveAt: latestTimestamp(documents.map((item) => item.effectiveAt)),
        embeddingDimensions: this.options.embeddingProvider.dimensions,
        embeddingModel: this.options.embeddingProvider.model,
        fetchedAt: latestTimestamp(documents.map((item) => item.fetchedAt)) as string,
        metadata: sourceMetadata,
        runId,
        source,
      });
    } catch (error) {
      await this.options.repository.failRun(runId, classifyIngestionError(error));
      throw error;
    }
  }
}

function latestTimestamp(values: Array<string | null>) {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length === 0
    ? null
    : present.sort((left, right) => right.localeCompare(left))[0];
}

function validateMetadata(
  required: string[],
  metadata: Record<string, string>,
) {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || typeof value !== "string") {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID",
        "Source metadata contains an invalid field.",
      );
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > 500) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID",
        "Source metadata values must contain 1 to 500 characters.",
      );
    }
    safe[key] = normalized;
  }
  const missing = required.filter((key) => {
    if (key === "fetched_at" || key === "content_hash") return false;
    return !safe[key];
  });
  if (missing.length > 0) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_METADATA_INVALID",
      `Required source metadata is missing: ${missing.join(", ")}.`,
    );
  }
  return Object.fromEntries(
    Object.entries(safe).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function validateOptionalTimestamp(value?: string) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_METADATA_INVALID",
      "The effective date must be an ISO-8601 timestamp.",
    );
  }
  return timestamp.toISOString();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Knowledge ingestion was cancelled", "AbortError");
  }
}

function classifyIngestionError(error: unknown) {
  if (error instanceof KnowledgeSourcePolicyError) return error.code;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "INGESTION_CANCELLED";
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 64);
  }
  return "INGESTION_FAILED";
}
