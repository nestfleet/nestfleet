-- Migration: 0005_embedding_768
-- Purpose: Change embedding column from vector(1536) to vector(768).
--          Gemini text-embedding-004 outputs 768 dimensions.
--          Table is empty at this point (SPIKE-01 phase), so no data migration needed.

DROP INDEX IF EXISTS memory_chunks_embedding_idx;

ALTER TABLE memory_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE memory_chunks ADD COLUMN embedding vector(768);

-- Recreate ivfflat index for vector similarity search
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx
  ON memory_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
