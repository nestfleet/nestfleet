-- SLICE-13: CI Verification & Post-Merge Feedback Loop
-- Adds CI/deploy tracking columns to change_requests and ci_config to products.

-- ── change_requests: CI / deploy state columns ────────────────────────────────

ALTER TABLE change_requests
  ADD COLUMN IF NOT EXISTS ci_status     TEXT,                -- 'pending' | 'passed' | 'failed'
  ADD COLUMN IF NOT EXISTS ci_details    JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS merged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deploy_status TEXT,               -- 'pending' | 'success' | 'failed'
  ADD COLUMN IF NOT EXISTS deploy_details JSONB DEFAULT '{}';

COMMENT ON COLUMN change_requests.ci_status      IS 'CI run outcome after PR merge: pending | passed | failed';
COMMENT ON COLUMN change_requests.ci_details     IS 'Raw check_suite or workflow payload excerpt for debugging';
COMMENT ON COLUMN change_requests.merged_at      IS 'Timestamp when the linked GitHub PR was merged';
COMMENT ON COLUMN change_requests.deploy_status  IS 'Deployment outcome: pending | success | failed';
COMMENT ON COLUMN change_requests.deploy_details IS 'Raw deployment_status payload excerpt';

CREATE INDEX IF NOT EXISTS idx_cr_ci_status     ON change_requests(ci_status)     WHERE ci_status     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_deploy_status ON change_requests(deploy_status) WHERE deploy_status IS NOT NULL;

-- ── products: ci_config JSONB column ─────────────────────────────────────────
-- Stores per-product GitHub webhook secret and CI automation flags.
-- Shape: { enabled, github_webhook_secret, auto_complete_on_ci_pass, track_deployments }

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ci_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN products.ci_config IS 'CI integration config: { enabled, github_webhook_secret, auto_complete_on_ci_pass, track_deployments }';
