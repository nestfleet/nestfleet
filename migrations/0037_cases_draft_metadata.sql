-- DEFERRED-24 (cont.): Add draft_metadata JSONB to cases for storing AI reply provenance
-- (confidenceScore, reasoning, sourceTiers, evidenceRefs, createdAt, createdBy)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS draft_metadata JSONB;
