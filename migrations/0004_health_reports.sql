-- Migration: 0004_health_reports
-- Purpose: Documentation Health Report — computed after every ingestion run.
--          ADR-020: health assessment is a first-class product feature.
--
-- Column naming mirrors health-report.ts insert statement exactly.

CREATE TABLE IF NOT EXISTS documentation_health_reports (
  -- Prefixed text ID: hr_<hex16>  (matches health-report.ts generation)
  report_id              TEXT        PRIMARY KEY,
  product_id             TEXT        NOT NULL,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Health dimensions (each: 'good' | 'warn' | 'fail')
  t1_coverage            TEXT        NOT NULL CHECK (t1_coverage IN ('good', 'warn', 'fail')),
  faq_coverage           TEXT        NOT NULL CHECK (faq_coverage IN ('good', 'warn', 'fail')),
  known_issues           TEXT        NOT NULL CHECK (known_issues IN ('good', 'warn', 'fail')),
  architecture           TEXT        NOT NULL CHECK (architecture IN ('good', 'warn', 'fail')),
  technical_spec         TEXT        NOT NULL CHECK (technical_spec IN ('good', 'warn', 'fail')),
  freshness              TEXT        NOT NULL CHECK (freshness IN ('good', 'warn', 'fail')),
  conflicts              TEXT        NOT NULL CHECK (conflicts IN ('good', 'warn', 'fail')),
  language               TEXT        NOT NULL CHECK (language IN ('good', 'warn')),

  -- Capability gates (each: 'enabled' | 'degraded' | 'disabled')
  auto_reply_gate        TEXT        NOT NULL CHECK (auto_reply_gate IN ('enabled', 'degraded', 'disabled')),
  known_issue_match_gate TEXT        NOT NULL CHECK (known_issue_match_gate IN ('enabled', 'degraded', 'disabled')),
  change_prep_gate       TEXT        NOT NULL CHECK (change_prep_gate IN ('enabled', 'degraded', 'disabled')),
  pr_draft_gate          TEXT        NOT NULL CHECK (pr_draft_gate IN ('enabled', 'degraded', 'disabled')),
  outage_routing_gate    TEXT        NOT NULL CHECK (outage_routing_gate IN ('enabled', 'degraded', 'disabled')),

  -- Raw dimension metrics (for display in operator console)
  metrics                JSONB       NOT NULL DEFAULT '{}'
);

-- Only keep the latest report per product for quick lookup
CREATE INDEX IF NOT EXISTS health_reports_product_idx
  ON documentation_health_reports (product_id, computed_at DESC);
