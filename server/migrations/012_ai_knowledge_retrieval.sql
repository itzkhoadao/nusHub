-- Phase 5: immutable, atomically published knowledge snapshots and hybrid search.
-- The deployment database must provide pgvector before this migration runs.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

ALTER TABLE ai_conversations
  ALTER COLUMN title SET DEFAULT 'New NUS question';

CREATE TABLE ai_sources (
  id VARCHAR(100) PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  trust_tier VARCHAR(2) NOT NULL,
  base_url TEXT NOT NULL,
  allowed_domains TEXT[] NOT NULL,
  content_types TEXT[] NOT NULL,
  max_staleness_hours INTEGER NOT NULL,
  high_stakes BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  registry_version VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_sources_trust_tier_check CHECK (trust_tier IN ('T1', 'T2', 'T3')),
  CONSTRAINT ai_sources_domains_check CHECK (cardinality(allowed_domains) > 0),
  CONSTRAINT ai_sources_content_types_check CHECK (cardinality(content_types) > 0),
  CONSTRAINT ai_sources_staleness_check CHECK (max_staleness_hours > 0)
);

CREATE TABLE ai_ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id VARCHAR(100) NOT NULL REFERENCES ai_sources(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  requested_url TEXT NOT NULL,
  document_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  content_hash CHAR(64),
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_ingestion_runs_status_check
    CHECK (status IN ('running', 'published', 'unchanged', 'failed')),
  CONSTRAINT ai_ingestion_runs_counts_check
    CHECK (document_count >= 0 AND chunk_count >= 0),
  CONSTRAINT ai_ingestion_runs_hash_check
    CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_ingestion_runs_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE ai_source_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id VARCHAR(100) NOT NULL REFERENCES ai_sources(id) ON DELETE RESTRICT,
  ingestion_run_id UUID NOT NULL UNIQUE REFERENCES ai_ingestion_runs(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'staged',
  content_hash CHAR(64) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  embedding_model VARCHAR(100) NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_source_versions_status_check
    CHECK (status IN ('staged', 'published', 'superseded')),
  CONSTRAINT ai_source_versions_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_source_versions_dimensions_check CHECK (embedding_dimensions = 768),
  CONSTRAINT ai_source_versions_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE(source_id, content_hash)
);

CREATE UNIQUE INDEX ai_source_versions_one_published_idx
  ON ai_source_versions(source_id)
  WHERE status = 'published';

CREATE INDEX ai_source_versions_source_status_idx
  ON ai_source_versions(source_id, status, verified_at DESC);

CREATE TABLE ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version_id UUID NOT NULL REFERENCES ai_source_versions(id) ON DELETE RESTRICT,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  effective_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_documents_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_documents_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE(source_version_id, canonical_url),
  UNIQUE(source_version_id, content_hash)
);

CREATE TABLE ai_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES ai_documents(id) ON DELETE RESTRICT,
  source_version_id UUID NOT NULL REFERENCES ai_source_versions(id) ON DELETE RESTRICT,
  source_id VARCHAR(100) NOT NULL REFERENCES ai_sources(id) ON DELETE RESTRICT,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  token_estimate INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_model VARCHAR(100) NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  embedding VECTOR(768) NOT NULL,
  search_document TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(heading, '')), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) STORED,
  CONSTRAINT ai_chunks_index_check CHECK (chunk_index >= 0),
  CONSTRAINT ai_chunks_content_check CHECK (length(trim(content)) > 0),
  CONSTRAINT ai_chunks_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_chunks_token_estimate_check CHECK (token_estimate > 0),
  CONSTRAINT ai_chunks_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT ai_chunks_dimensions_check
    CHECK (embedding_dimensions = 768 AND vector_dims(embedding) = 768),
  UNIQUE(document_id, chunk_index),
  UNIQUE(document_id, content_hash)
);

CREATE INDEX ai_chunks_search_document_idx
  ON ai_chunks USING GIN(search_document);

CREATE INDEX ai_chunks_metadata_idx
  ON ai_chunks USING GIN(metadata jsonb_path_ops);

CREATE INDEX ai_chunks_source_version_idx
  ON ai_chunks(source_id, source_version_id);

-- Keep model spaces isolated. A future model requires a controlled re-embed
-- and a new partial index rather than silently sharing this graph.
CREATE INDEX ai_chunks_gemini_embedding_001_hnsw_idx
  ON ai_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 96)
  WHERE embedding_model = 'gemini-embedding-001'
    AND embedding_dimensions = 768;

ALTER TABLE ai_message_citations
  ADD COLUMN knowledge_source_version_id UUID
  REFERENCES ai_source_versions(id) ON DELETE RESTRICT;

CREATE INDEX ai_message_citations_knowledge_version_idx
  ON ai_message_citations(knowledge_source_version_id)
  WHERE knowledge_source_version_id IS NOT NULL;

CREATE INDEX ai_ingestion_runs_source_started_idx
  ON ai_ingestion_runs(source_id, started_at DESC);
