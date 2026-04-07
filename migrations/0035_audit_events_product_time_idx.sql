-- PERF: composite index on audit_events(product_id, occurred_at DESC)
--
-- Covers:
--   - Dashboard activity feed: WHERE product_id=? ORDER BY occurred_at DESC LIMIT 15
--   - Analytics overview:      WHERE product_id=? (any time-ordered scan)
--
-- CONCURRENTLY avoids a full table lock on live deployments.
-- Cannot run inside a transaction block — run standalone or via migration runner
-- that issues each statement outside BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_product_time_idx
  ON audit_events (product_id, occurred_at DESC);
