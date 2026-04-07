-- Migration: 0007_domain_model
-- Purpose: SLICE-01 core domain tables — products, identities, signals,
--          conversations, cases, audit_events.
--
-- Design constraints:
--   - TEXT PKs with typed prefixes (prod_, id_, sig_, conv_, case_, ae_)
--   - TEXT CHECK constraints instead of Postgres enums (easier to extend)
--   - No FK constraints in DB (enforced at application layer)
--   - All timestamps TIMESTAMPTZ
--   - updated_at auto-maintained by trigger
--   - audit_events is append-only (no UPDATE path)

-- ── updated_at trigger function ───────────────────────────────────────────────
-- Shared by products, identities, conversations, cases.

CREATE OR REPLACE FUNCTION nestfleet_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── products ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  product_id        TEXT        PRIMARY KEY,                -- prefix: prod_
  name              TEXT        NOT NULL,
  stage             TEXT        NOT NULL DEFAULT 'pre-launch'
                    CHECK (stage IN ('pre-launch', 'beta', 'production', 'deprecated')),
  support_policy    JSONB       NOT NULL DEFAULT '{}',
  enabled_channels  TEXT[]      NOT NULL DEFAULT '{}',
  lead_assignments  JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

CREATE INDEX IF NOT EXISTS products_stage_idx ON products (stage);

-- ── identities ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS identities (
  identity_id       TEXT        PRIMARY KEY,                -- prefix: id_
  product_id        TEXT        NOT NULL,
  type              TEXT        NOT NULL
                    CHECK (type IN ('end_user', 'operator', 'lead', 'system')),
  display_name      TEXT,
  email_addresses   TEXT[]      NOT NULL DEFAULT '{}',
  telegram_handles  TEXT[]      NOT NULL DEFAULT '{}',
  external_refs     JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER identities_updated_at
  BEFORE UPDATE ON identities
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Dedup: one identity per (product, type, primary email).
-- Partial: only applies when email_addresses[1] is non-null.
CREATE UNIQUE INDEX IF NOT EXISTS identities_dedup_idx
  ON identities (product_id, type, (email_addresses[1]))
  WHERE email_addresses[1] IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_product_idx
  ON identities (product_id);

CREATE INDEX IF NOT EXISTS identities_product_type_idx
  ON identities (product_id, type);

-- ── signals ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS signals (
  signal_id           TEXT        PRIMARY KEY,              -- prefix: sig_
  product_id          TEXT        NOT NULL,
  source_type         TEXT        NOT NULL
                      CHECK (source_type IN ('email', 'telegram', 'github_webhook', 'scheduled', 'manual')),
  source_ref          TEXT,                                 -- message-id, webhook delivery id, etc.
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload         JSONB       NOT NULL,
  normalized_payload  JSONB       NOT NULL DEFAULT '{}',
  identity_id         TEXT,                                 -- resolved after normalization
  conversation_id     TEXT,                                 -- resolved after conversation matching
  case_id             TEXT,                                 -- set after case creation/linking
  processing_status   TEXT        NOT NULL DEFAULT 'received'
                      CHECK (processing_status IN ('received', 'normalizing', 'normalized', 'linked', 'failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: signal raw data is immutable; mutable fields use explicit updates
);

-- Dedup by source ref (partial — source_ref may be null for manual/scheduled).
CREATE UNIQUE INDEX IF NOT EXISTS signals_dedup_idx
  ON signals (source_type, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS signals_product_idx
  ON signals (product_id);

-- Worker queue: find unprocessed signals for a product.
CREATE INDEX IF NOT EXISTS signals_status_idx
  ON signals (product_id, processing_status, received_at ASC)
  WHERE processing_status NOT IN ('linked', 'failed');

CREATE INDEX IF NOT EXISTS signals_case_idx
  ON signals (case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS signals_conversation_idx
  ON signals (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ── conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id  TEXT        PRIMARY KEY,                 -- prefix: conv_
  product_id       TEXT        NOT NULL,
  channel          TEXT        NOT NULL
                   CHECK (channel IN ('email', 'telegram', 'internal')),
  subject          TEXT,
  thread_key       TEXT,
  participant_ids  TEXT[]      NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'resolved', 'closed')),
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Dedup: one conversation per product+channel+thread_key.
-- Partial: thread_key may be null for manual/internal conversations.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dedup_idx
  ON conversations (product_id, channel, thread_key)
  WHERE thread_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_product_idx
  ON conversations (product_id);

CREATE INDEX IF NOT EXISTS conversations_product_status_idx
  ON conversations (product_id, status);

-- ── cases ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cases (
  case_id                TEXT        PRIMARY KEY,           -- prefix: case_
  product_id             TEXT        NOT NULL,
  title                  TEXT,
  summary                TEXT,
  reporter_identity_id   TEXT,
  conversation_ids       TEXT[]      NOT NULL DEFAULT '{}',
  status                 TEXT        NOT NULL DEFAULT 'new'
                         CHECK (status IN (
                           'new', 'enriching', 'triaged',
                           'awaiting-user', 'awaiting-lead',
                           'in-resolution', 'in-change', 'pr-drafting',
                           'resolved', 'closed'
                         )),
  type                   TEXT
                         CHECK (type IN ('user_request', 'bug_report', 'outage_report', 'user_feedback')),
  severity               TEXT
                         CHECK (severity IN ('critical', 'high', 'normal', 'low')),
  urgency                TEXT
                         CHECK (urgency IN ('immediate', 'high', 'normal', 'low')),
  confidence             REAL,
  current_persona        TEXT
                         CHECK (current_persona IN ('frontline', 'steward', 'change', 'none')),
  assigned_lead_role     TEXT
                         CHECK (assigned_lead_role IN ('support_lead', 'product_lead', 'change_lead', 'knowledge_lead')),
  triage_output          JSONB,
  github_issue_ref       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ
);

CREATE OR REPLACE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Primary lookup: product's cases by recency (operator queue)
CREATE INDEX IF NOT EXISTS cases_product_idx
  ON cases (product_id, created_at DESC);

-- Filter by status (worker queue, dashboard filters)
CREATE INDEX IF NOT EXISTS cases_product_status_idx
  ON cases (product_id, status);

-- Filter by severity (escalation queries)
CREATE INDEX IF NOT EXISTS cases_product_severity_idx
  ON cases (product_id, severity)
  WHERE severity IS NOT NULL;

-- Filter by assigned lead (lead dashboard)
CREATE INDEX IF NOT EXISTS cases_lead_role_idx
  ON cases (product_id, assigned_lead_role)
  WHERE assigned_lead_role IS NOT NULL;

-- ── audit_events ──────────────────────────────────────────────────────────────
-- Append-only. No updated_at. Never UPDATE this table.

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id  TEXT        PRIMARY KEY,                  -- prefix: ae_
  product_id      TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL,                     -- 'case', 'signal', 'conversation', etc.
  entity_ref      TEXT        NOT NULL,                     -- entity PK value
  actor_type      TEXT        NOT NULL,                     -- 'agent', 'lead', 'system', 'user'
  actor_ref       TEXT        NOT NULL,                     -- agent name, email, 'system', etc.
  action          TEXT        NOT NULL,                     -- 'case.created', 'case.status_changed', etc.
  before_state    JSONB,
  after_state     JSONB,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary: all events for a specific entity (case timeline)
CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON audit_events (product_id, entity_type, entity_ref, occurred_at DESC);

-- Lookup by action type (reporting)
CREATE INDEX IF NOT EXISTS audit_events_action_idx
  ON audit_events (product_id, action, occurred_at DESC);

-- Lookup by actor (agent accountability)
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON audit_events (product_id, actor_type, actor_ref, occurred_at DESC);
