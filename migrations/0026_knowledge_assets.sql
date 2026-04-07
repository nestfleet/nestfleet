-- SLICE-24: Knowledge Capture — stores AI-proposed knowledge assets for Knowledge Lead review.
-- Each resolved case may produce 0-N knowledge asset proposals.

CREATE TABLE IF NOT EXISTS knowledge_assets (
  asset_id         TEXT        PRIMARY KEY,
  product_id       TEXT        NOT NULL REFERENCES products(product_id),
  case_id          TEXT        NOT NULL REFERENCES cases(case_id),
  asset_type       TEXT        NOT NULL CHECK (asset_type IN ('faq', 'known_issue', 'runbook_update', 'docs_update')),
  status           TEXT        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'published')),
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL,
  source_refs      JSONB       NOT NULL DEFAULT '[]',   -- evidence chunk IDs / case IDs that informed this proposal
  confidence       REAL        NOT NULL DEFAULT 0.0,     -- agent confidence in the proposal (0.0–1.0)
  review_note      TEXT,                                  -- Knowledge Lead's review comment
  reviewed_by      TEXT,                                  -- user_id of reviewer
  reviewed_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ka_product_status ON knowledge_assets(product_id, status);
CREATE INDEX IF NOT EXISTS idx_ka_case ON knowledge_assets(case_id);
