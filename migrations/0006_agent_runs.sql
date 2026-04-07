-- Migration: agent_runs table — AE-05
-- ADR-026: immutable audit trail for every agent invocation.
-- ADR-028: product_llm_usage table for monthly token budget tracking.

-- ── agent_runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_runs (
  id                    TEXT PRIMARY KEY,                 -- UUID as TEXT (mc_ prefix not used here)
  job_id                TEXT NOT NULL,
  product_id            TEXT NOT NULL,
  case_id               TEXT,
  action_type           TEXT NOT NULL,                   -- ActionType enum value
  outcome               TEXT NOT NULL,                   -- success|abstain|error|validation_failure
  abstain_reason        TEXT,
  model_id              TEXT NOT NULL,
  input_tokens          INT,
  output_tokens         INT,
  duration_ms           INT,
  evidence_chunk_ids    TEXT[],                          -- references memory_chunks.chunk_id
  output_schema_version TEXT,
  output_valid          BOOLEAN,
  output_snapshot       JSONB,                           -- GDPR-sensitive; access-gated (audit:read)
  error_code            TEXT,
  error_message         TEXT,
  otel_trace_id         TEXT,
  otel_span_id          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: look up runs by job for worker correlation
CREATE INDEX IF NOT EXISTS agent_runs_job_id_idx ON agent_runs (job_id);

-- Index: look up runs by product + action type for per-product reporting
CREATE INDEX IF NOT EXISTS agent_runs_product_action_idx ON agent_runs (product_id, action_type);

-- Index: look up runs by case for explainability queries
CREATE INDEX IF NOT EXISTS agent_runs_case_id_idx ON agent_runs (case_id) WHERE case_id IS NOT NULL;

-- Index: OTel trace lookup
CREATE INDEX IF NOT EXISTS agent_runs_otel_trace_idx ON agent_runs (otel_trace_id) WHERE otel_trace_id IS NOT NULL;

-- ── product_llm_usage ──────────────────────────────────────────────────────
-- Monthly rolling token usage per product, action type, and model.
-- ADR-028: soft/hard limits enforced at dispatch time.

CREATE TABLE IF NOT EXISTS product_llm_usage (
  id              TEXT PRIMARY KEY DEFAULT ('plu_' || gen_random_uuid()::text),
  product_id      TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  month_year      TEXT NOT NULL,                         -- 'YYYY-MM' format, UTC
  input_tokens    BIGINT NOT NULL DEFAULT 0,
  output_tokens   BIGINT NOT NULL DEFAULT 0,
  call_count      INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index: one row per product/action/model/month for upsert
CREATE UNIQUE INDEX IF NOT EXISTS product_llm_usage_unique_idx
  ON product_llm_usage (product_id, action_type, model_id, month_year);

-- Index: look up all usage for a product
CREATE INDEX IF NOT EXISTS product_llm_usage_product_idx ON product_llm_usage (product_id, month_year);
