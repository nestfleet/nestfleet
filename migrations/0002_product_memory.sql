-- Migration: 0002_product_memory
-- Purpose: Product memory — chunks table with full metadata schema per
--          product-memory-specification.md section 5 (ADR-018, ADR-019, ADR-021)
--
-- IMPORTANT: EMBEDDING_DIMENSIONS must match the embedding model configured.
-- Default: 1536 (OpenAI text-embedding-3-small / text-embedding-ada-002).
-- If you change the model, drop and recreate this table with the correct dimension.

CREATE TABLE IF NOT EXISTS memory_chunks (
  -- Deterministic text ID: mc_<sha256(product_id:source_uri:section_path:content_hash)[:20]>
  chunk_id           TEXT        PRIMARY KEY,
  product_id         TEXT        NOT NULL,

  -- Source classification (ADR-018: tier governs ranking AND policy gating)
  source_type        TEXT        NOT NULL,   -- e.g. product_spec, faq, github_issue
  source_subtype     TEXT,                   -- e.g. auto_generated, curated, raw
  tier               SMALLINT    NOT NULL CHECK (tier BETWEEN 1 AND 4),
  source_uri         TEXT        NOT NULL,   -- file path, GitHub URL, etc.

  -- Structure (ADR-019: content type determines chunking + retrieval method)
  section_path       TEXT        NOT NULL DEFAULT '',  -- e.g. "Installation > Docker"
  content_type       TEXT        NOT NULL CHECK (content_type IN ('prose', 'code', 'structured')),
  content            TEXT        NOT NULL,

  -- Versioning and freshness (ADR-021)
  product_version    TEXT        NOT NULL DEFAULT '*', -- '*' = version-agnostic
  source_updated_at  TIMESTAMPTZ NOT NULL,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  freshness_score    REAL        NOT NULL DEFAULT 1.0 CHECK (freshness_score BETWEEN 0.0 AND 1.0),

  -- Access control
  audience           TEXT        NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'internal')),
  language           TEXT        NOT NULL DEFAULT 'en',

  -- Conflict detection
  conflict_flag      BOOLEAN     NOT NULL DEFAULT false,

  -- Vector embedding (dimension must match EMBEDDING_DIMENSIONS config)
  embedding          vector(1536),

  -- Deduplication key — same chunk re-ingested is a no-op if content unchanged
  content_hash       TEXT        NOT NULL,

  -- Pre-computed full-text search vector (used for BM25 hybrid retrieval)
  fts_vector         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Idempotency index for upsert
CREATE UNIQUE INDEX IF NOT EXISTS memory_chunks_dedup_idx
  ON memory_chunks (product_id, source_uri, section_path, content_hash);

-- Vector similarity search (ivfflat — good default for spikes; switch to hnsw for production)
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
  ON memory_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search index on the generated fts_vector column
CREATE INDEX IF NOT EXISTS memory_chunks_fts_idx
  ON memory_chunks USING GIN (fts_vector);

-- Metadata filter indexes
CREATE INDEX IF NOT EXISTS memory_chunks_product_idx    ON memory_chunks (product_id);
CREATE INDEX IF NOT EXISTS memory_chunks_tier_idx       ON memory_chunks (product_id, tier);
CREATE INDEX IF NOT EXISTS memory_chunks_audience_idx   ON memory_chunks (product_id, audience);
CREATE INDEX IF NOT EXISTS memory_chunks_version_idx    ON memory_chunks (product_id, product_version);
CREATE INDEX IF NOT EXISTS memory_chunks_freshness_idx  ON memory_chunks (product_id, freshness_score);
CREATE INDEX IF NOT EXISTS memory_chunks_conflict_idx   ON memory_chunks (product_id, conflict_flag) WHERE conflict_flag = true;
