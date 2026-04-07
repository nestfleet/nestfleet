-- Migration: 0025_retention_index
-- Purpose: CG-03 — index supporting efficient retention sweep queries.
--          Scans closed cases per product older than the configured retention window.

CREATE INDEX IF NOT EXISTS cases_closed_at_idx
  ON cases (product_id, closed_at)
  WHERE closed_at IS NOT NULL;
