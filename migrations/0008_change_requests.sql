-- Migration 0008: change_requests table
-- Implements the Change Request lifecycle from case-and-change-lifecycle.md §6
-- States: draft → analysis → approval-pending → approved → implementation-prep → pr-drafted → completed | rejected

CREATE TABLE IF NOT EXISTS change_requests (
  change_request_id   TEXT        PRIMARY KEY,
  product_id          TEXT        NOT NULL,
  case_id             TEXT        NOT NULL,      -- originating case

  -- Identity
  title               TEXT,
  problem_statement   TEXT,

  -- State machine
  status              TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'analysis', 'approval-pending', 'approved',
      'implementation-prep', 'pr-drafted', 'completed', 'rejected'
    )),

  -- Analysis fields
  impact_summary      TEXT,
  risk_level          TEXT
    CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high', 'critical')),
  proposed_scope      TEXT,
  affected_surfaces   TEXT[]      NOT NULL DEFAULT '{}',
  implementation_notes TEXT,

  -- GitHub linkage
  github_repo         TEXT,
  github_issue_number INTEGER,
  github_issue_url    TEXT,
  github_pr_number    INTEGER,
  github_pr_url       TEXT,

  -- Approval
  approval_record     JSONB,      -- { approver_id, role, rationale, approved_at }

  -- Validation artifact
  validation_record   JSONB,

  -- Terminal timestamps
  approved_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rejection_rationale TEXT,
  completed_at        TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep updated_at current
CREATE TRIGGER set_change_requests_updated_at
  BEFORE UPDATE ON change_requests
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Index: look up all change requests for a case
CREATE INDEX IF NOT EXISTS change_requests_case_id_idx
  ON change_requests (case_id);

-- Index: list open change requests for a product
CREATE INDEX IF NOT EXISTS change_requests_product_status_idx
  ON change_requests (product_id, status, created_at DESC);
