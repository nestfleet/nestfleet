-- Migration: 0003_knowledge_conflicts
-- Purpose: Knowledge conflict records created by conflict detection during ingestion.
--          ADR-018: conflict forces abstain regardless of confidence score.

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  -- Prefixed text ID: kc_<hex16>  (matches conflict-detector.ts generation)
  conflict_id      TEXT        PRIMARY KEY,
  product_id       TEXT        NOT NULL,
  chunk_id_a       TEXT        NOT NULL REFERENCES memory_chunks(chunk_id) ON DELETE CASCADE,
  chunk_id_b       TEXT        NOT NULL REFERENCES memory_chunks(chunk_id) ON DELETE CASCADE,
  conflict_summary TEXT        NOT NULL,  -- LLM-generated human-readable description
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,           -- set by operator when conflict is resolved
  resolution_note  TEXT,
  status           TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS knowledge_conflicts_product_idx  ON knowledge_conflicts (product_id, status);
CREATE INDEX IF NOT EXISTS knowledge_conflicts_chunk_a_idx  ON knowledge_conflicts (chunk_id_a);
CREATE INDEX IF NOT EXISTS knowledge_conflicts_chunk_b_idx  ON knowledge_conflicts (chunk_id_b);
