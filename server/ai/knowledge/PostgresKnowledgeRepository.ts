import type { Pool, PoolClient } from "pg";
import { pool } from "../../db";
import type {
  IngestionResult,
  KnowledgeDocumentDraft,
  KnowledgeIngestionRepository,
  KnowledgeSearchRepository,
  RetrievedEvidence,
} from "./types";

type VersionRow = {
  chunk_count: string | number;
  document_count: string | number;
  id: string;
  status: "published" | "superseded";
};

type SearchRow = Omit<RetrievedEvidence, "score"> & {
  score: string | number;
};

export class PostgresKnowledgeRepository
  implements KnowledgeIngestionRepository, KnowledgeSearchRepository
{
  constructor(private readonly databasePool: Pool = pool) {}

  async beginRun(input: Parameters<KnowledgeIngestionRepository["beginRun"]>[0]) {
    const result = await this.databasePool.query<{ id: string }>(
      `WITH registered_source AS (
         INSERT INTO ai_sources (
           id, name, owner, trust_tier, base_url, allowed_domains,
           content_types, max_staleness_hours, high_stakes, enabled,
           registry_version
         ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9, TRUE, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           owner = EXCLUDED.owner,
           trust_tier = EXCLUDED.trust_tier,
           base_url = EXCLUDED.base_url,
           allowed_domains = EXCLUDED.allowed_domains,
           content_types = EXCLUDED.content_types,
           max_staleness_hours = EXCLUDED.max_staleness_hours,
           high_stakes = EXCLUDED.high_stakes,
           enabled = EXCLUDED.enabled,
           registry_version = EXCLUDED.registry_version,
           updated_at = NOW()
         RETURNING id
       )
       INSERT INTO ai_ingestion_runs (source_id, requested_url, metadata)
       SELECT id, $11, $12::jsonb FROM registered_source
       RETURNING id`,
      [
        input.source.id,
        input.source.name,
        input.source.owner,
        input.source.trustTier,
        input.source.baseUrl,
        input.source.allowedDomains,
        input.source.contentTypes,
        input.source.maxStalenessHours,
        input.source.highStakes,
        input.registryVersion,
        input.requestedUrl,
        JSON.stringify(input.metadata),
      ],
    );
    return result.rows[0].id;
  }

  async failRun(runId: string, errorCode: string) {
    await this.databasePool.query(
      `UPDATE ai_ingestion_runs
       SET status = 'failed', error_code = $2, completed_at = NOW()
       WHERE id = $1 AND status = 'running'`,
      [runId, errorCode.slice(0, 64)],
    );
  }

  async findVersion(sourceId: string, contentHash: string) {
    const result = await this.databasePool.query<VersionRow>(
      `SELECT sv.id, sv.status,
              COUNT(DISTINCT d.id) AS document_count,
              COUNT(c.id) AS chunk_count
       FROM ai_source_versions sv
       LEFT JOIN ai_documents d ON d.source_version_id = sv.id
       LEFT JOIN ai_chunks c ON c.document_id = d.id
       WHERE sv.source_id = $1 AND sv.content_hash = $2
         AND sv.status IN ('published', 'superseded')
       GROUP BY sv.id, sv.status`,
      [sourceId, contentHash],
    );
    const row = result.rows[0];
    return row
      ? {
          chunkCount: Number(row.chunk_count),
          documentCount: Number(row.document_count),
          id: row.id,
          status: row.status,
        }
      : null;
  }

  async reuseVersion(
    input: Parameters<KnowledgeIngestionRepository["reuseVersion"]>[0],
  ) {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      await lockSource(client, input.sourceId);
      const version = await client.query<Pick<VersionRow, "id" | "status">>(
        `SELECT sv.id, sv.status
         FROM ai_source_versions sv
         WHERE sv.id = $1 AND sv.source_id = $2 AND sv.content_hash = $3
           AND sv.status IN ('published', 'superseded')
         FOR UPDATE`,
        [input.versionId, input.sourceId, input.contentHash],
      );
      const row = version.rows[0];
      if (!row) throw new Error("The reusable knowledge version no longer exists");
      const reused = await reuseStoredVersion(client, {
        contentHash: input.contentHash,
        runId: input.runId,
        sourceId: input.sourceId,
        version: row,
      });
      await client.query("COMMIT");
      return reused;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async publish(input: Parameters<KnowledgeIngestionRepository["publish"]>[0]) {
    if (
      input.documents.length === 0 ||
      input.documents.some((item) => item.chunks.length === 0)
    ) {
      throw new Error("A knowledge version cannot be published without documents and chunks");
    }
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      await lockSource(client, input.source.id);
      const run = await client.query(
        `SELECT id FROM ai_ingestion_runs
         WHERE id = $1 AND source_id = $2 AND status = 'running'
         FOR UPDATE`,
        [input.runId, input.source.id],
      );
      if (run.rowCount !== 1) throw new Error("The ingestion run is not publishable");

      // Another worker may have published this exact snapshot after the
      // pre-embedding hash check. Reuse it under the same source lock rather
      // than failing the unique constraint or creating duplicate vectors.
      const existing = await client.query<Pick<VersionRow, "id" | "status">>(
        `SELECT id, status
         FROM ai_source_versions
         WHERE source_id = $1 AND content_hash = $2
           AND status IN ('published', 'superseded')
         FOR UPDATE`,
        [input.source.id, input.contentHash],
      );
      if (existing.rows[0]) {
        const reused = await reuseStoredVersion(client, {
          contentHash: input.contentHash,
          runId: input.runId,
          sourceId: input.source.id,
          version: existing.rows[0],
        });
        await client.query("COMMIT");
        return reused;
      }

      const version = await client.query<{ id: string }>(
        `INSERT INTO ai_source_versions (
           source_id, ingestion_run_id, content_hash, fetched_at, verified_at,
           effective_at, embedding_model, embedding_dimensions, metadata
         ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8::jsonb)
         RETURNING id`,
        [
          input.source.id,
          input.runId,
          input.contentHash,
          input.fetchedAt,
          input.effectiveAt,
          input.embeddingModel,
          input.embeddingDimensions,
          JSON.stringify(input.metadata),
        ],
      );

      let chunkCount = 0;
      for (const document of input.documents) {
        const storedDocument = await insertDocument(client, version.rows[0].id, document);
        await insertChunks(client, {
          document,
          documentId: storedDocument,
          embeddingDimensions: input.embeddingDimensions,
          embeddingModel: input.embeddingModel,
          sourceId: input.source.id,
          versionId: version.rows[0].id,
        });
        chunkCount += document.chunks.length;
      }

      await client.query(
        `UPDATE ai_source_versions
         SET status = 'superseded', superseded_at = NOW()
         WHERE source_id = $1 AND status = 'published'`,
        [input.source.id],
      );
      await client.query(
        `UPDATE ai_source_versions
         SET status = 'published', published_at = NOW()
         WHERE id = $1 AND status = 'staged'`,
        [version.rows[0].id],
      );
      await completeRun(client, {
        chunkCount,
        contentHash: input.contentHash,
        documentCount: input.documents.length,
        runId: input.runId,
        status: "published",
      });
      await client.query("COMMIT");
      return {
        chunkCount,
        documentCount: input.documents.length,
        runId: input.runId,
        status: "published",
        versionId: version.rows[0].id,
      } satisfies IngestionResult;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async hybridSearch(input: Parameters<KnowledgeSearchRepository["hybridSearch"]>[0]) {
    const result = await this.databasePool.query<SearchRow>(
      `WITH query_input AS (
         SELECT websearch_to_tsquery('english', $1) AS text_query,
                $2::vector(768) AS query_embedding
       ),
       keyword_ranked AS (
         SELECT c.id,
                ROW_NUMBER() OVER (
                  ORDER BY ts_rank_cd(c.search_document, q.text_query) DESC, c.id
                ) AS rank
         FROM ai_chunks c
         JOIN ai_source_versions sv ON sv.id = c.source_version_id
         JOIN ai_sources s ON s.id = c.source_id
         CROSS JOIN query_input q
         WHERE sv.status = 'published' AND s.enabled = TRUE
           AND c.embedding_model = 'gemini-embedding-001'
           AND c.embedding_dimensions = 768
           AND c.embedding_model = $3 AND c.embedding_dimensions = $4
           AND sv.verified_at >= NOW() - make_interval(hours => s.max_staleness_hours)
           AND ($5::text[] IS NULL OR c.source_id = ANY($5::text[]))
           AND ($6::text[] IS NULL OR s.trust_tier = ANY($6::text[]))
           AND ($7::boolean IS NULL OR s.high_stakes = $7)
           AND ($8::text IS NULL OR c.metadata->>'academic_year' = $8)
           AND c.metadata @> $9::jsonb
           AND c.search_document @@ q.text_query
         ORDER BY ts_rank_cd(c.search_document, q.text_query) DESC, c.id
         LIMIT $11
       ),
       semantic_ranked AS (
         SELECT c.id,
                ROW_NUMBER() OVER (
                  ORDER BY c.embedding <=> q.query_embedding, c.id
                ) AS rank
         FROM ai_chunks c
         JOIN ai_source_versions sv ON sv.id = c.source_version_id
         JOIN ai_sources s ON s.id = c.source_id
         CROSS JOIN query_input q
         WHERE sv.status = 'published' AND s.enabled = TRUE
           AND c.embedding_model = 'gemini-embedding-001'
           AND c.embedding_dimensions = 768
           AND c.embedding_model = $3 AND c.embedding_dimensions = $4
           AND sv.verified_at >= NOW() - make_interval(hours => s.max_staleness_hours)
           AND ($5::text[] IS NULL OR c.source_id = ANY($5::text[]))
           AND ($6::text[] IS NULL OR s.trust_tier = ANY($6::text[]))
           AND ($7::boolean IS NULL OR s.high_stakes = $7)
           AND ($8::text IS NULL OR c.metadata->>'academic_year' = $8)
           AND c.metadata @> $9::jsonb
           AND (c.embedding <=> q.query_embedding) <= $10
         ORDER BY c.embedding <=> q.query_embedding, c.id
         LIMIT $11
       ),
       fused AS (
         SELECT COALESCE(k.id, v.id) AS id,
                (COALESCE(0.55 / (60 + k.rank), 0) +
                 COALESCE(0.45 / (60 + v.rank), 0))::double precision AS score
         FROM keyword_ranked k FULL OUTER JOIN semantic_ranked v ON v.id = k.id
       )
       SELECT c.id::text AS "chunkId", c.content,
              c.source_version_id::text AS "documentVersionId",
              d.effective_at AS "effectiveAt", sv.verified_at AS "fetchedAt",
              c.heading, c.metadata, f.score, c.source_id AS "sourceId",
              d.title, s.trust_tier AS "trustTier", d.canonical_url AS url
       FROM fused f
       JOIN ai_chunks c ON c.id = f.id
       JOIN ai_documents d ON d.id = c.document_id
       JOIN ai_source_versions sv ON sv.id = c.source_version_id
       JOIN ai_sources s ON s.id = c.source_id
       ORDER BY f.score DESC, c.id
       LIMIT $12`,
      [
        input.text,
        vectorLiteral(input.embedding, input.embeddingDimensions),
        input.embeddingModel,
        input.embeddingDimensions,
        input.filters.sourceIds?.length ? input.filters.sourceIds : null,
        input.filters.trustTiers?.length ? input.filters.trustTiers : null,
        input.filters.highStakesOnly ? true : null,
        input.filters.academicYear ?? null,
        JSON.stringify(input.filters.metadata ?? {}),
        input.maxSemanticDistance,
        input.candidateLimit,
        input.limit,
      ],
    );
    return result.rows.map((row) => ({
      ...row,
      effectiveAt: toIsoString(row.effectiveAt),
      fetchedAt: toIsoString(row.fetchedAt) as string,
      metadata: isRecord(row.metadata) ? row.metadata : {},
      score: Number(row.score),
    }));
  }
}

async function reuseStoredVersion(
  client: PoolClient,
  input: {
    contentHash: string;
    runId: string;
    sourceId: string;
    version: Pick<VersionRow, "id" | "status">;
  },
) {
  const counts = await client.query<
    Pick<VersionRow, "chunk_count" | "document_count">
  >(
    `SELECT COUNT(DISTINCT d.id) AS document_count,
            COUNT(c.id) AS chunk_count
     FROM ai_documents d
     LEFT JOIN ai_chunks c ON c.document_id = d.id
     WHERE d.source_version_id = $1`,
    [input.version.id],
  );
  const documentCount = Number(counts.rows[0].document_count);
  const chunkCount = Number(counts.rows[0].chunk_count);

  if (input.version.status === "superseded") {
    await client.query(
      `UPDATE ai_source_versions
       SET status = 'superseded', superseded_at = NOW()
       WHERE source_id = $1 AND status = 'published'`,
      [input.sourceId],
    );
    await client.query(
      `UPDATE ai_source_versions
       SET status = 'published', published_at = NOW(), superseded_at = NULL,
           verified_at = NOW()
       WHERE id = $1`,
      [input.version.id],
    );
  } else {
    await client.query(
      `UPDATE ai_source_versions SET verified_at = NOW() WHERE id = $1`,
      [input.version.id],
    );
  }

  const status = input.version.status === "published" ? "unchanged" : "published";
  await completeRun(client, {
    chunkCount,
    contentHash: input.contentHash,
    documentCount,
    runId: input.runId,
    status,
  });
  return {
    chunkCount,
    documentCount,
    runId: input.runId,
    status,
    versionId: input.version.id,
  } satisfies IngestionResult;
}

async function insertDocument(
  client: PoolClient,
  versionId: string,
  document: KnowledgeDocumentDraft,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO ai_documents (
       source_version_id, canonical_url, title, content_type, content_hash,
       effective_at, fetched_at, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id`,
    [
      versionId,
      document.canonicalUrl,
      document.title,
      document.contentType,
      document.contentHash,
      document.effectiveAt,
      document.fetchedAt,
      JSON.stringify({
        ...document.metadata,
        ...(document.etag ? { http_etag: document.etag } : {}),
        ...(document.lastModified ? { http_last_modified: document.lastModified } : {}),
      }),
    ],
  );
  return result.rows[0].id;
}

async function insertChunks(
  client: PoolClient,
  input: {
    document: KnowledgeDocumentDraft;
    documentId: string;
    embeddingDimensions: number;
    embeddingModel: string;
    sourceId: string;
    versionId: string;
  },
) {
  const chunks = input.document.chunks;
  await client.query(
    `INSERT INTO ai_chunks (
       document_id, source_version_id, source_id, chunk_index, heading,
       content, content_hash, token_estimate, metadata, embedding_model,
       embedding_dimensions, embedding
     )
     SELECT $1, $2, $3, rows.chunk_index, rows.heading, rows.content,
            rows.content_hash, rows.token_estimate, rows.metadata_text::jsonb,
            $4, $5, rows.embedding_text::vector(768)
     FROM UNNEST(
       $6::integer[], $7::text[], $8::text[], $9::text[], $10::integer[],
       $11::text[], $12::text[]
     ) AS rows(
       chunk_index, heading, content, content_hash, token_estimate,
       metadata_text, embedding_text
     )`,
    [
      input.documentId,
      input.versionId,
      input.sourceId,
      input.embeddingModel,
      input.embeddingDimensions,
      chunks.map((chunk) => chunk.index),
      chunks.map((chunk) => chunk.heading),
      chunks.map((chunk) => chunk.content),
      chunks.map((chunk) => chunk.contentHash),
      chunks.map((chunk) => chunk.tokenEstimate),
      chunks.map((chunk) => JSON.stringify(chunk.metadata)),
      chunks.map((chunk) => vectorLiteral(chunk.embedding, input.embeddingDimensions)),
    ],
  );
}

async function lockSource(client: PoolClient, sourceId: string) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('ai-knowledge:' || $1))",
    [sourceId],
  );
}

async function completeRun(
  client: PoolClient,
  input: {
    chunkCount: number;
    contentHash: string;
    documentCount: number;
    runId: string;
    status: "published" | "unchanged";
  },
) {
  const result = await client.query(
    `UPDATE ai_ingestion_runs
     SET status = $2, document_count = $3, chunk_count = $4,
         content_hash = $5, completed_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [
      input.runId,
      input.status,
      input.documentCount,
      input.chunkCount,
      input.contentHash,
    ],
  );
  if (result.rowCount !== 1) throw new Error("The ingestion run is no longer active");
}

function vectorLiteral(values: number[], dimensions: number) {
  if (
    values.length !== dimensions ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new TypeError("The embedding does not match its configured dimensions");
  }
  return `[${values.join(",")}]`;
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("The knowledge repository returned an invalid timestamp");
  }
  return date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function rollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}
