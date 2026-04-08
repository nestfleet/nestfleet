-- FEAT-012: Owner Fleet — Reissue License
--
-- 1. Adds license state columns to provisionings (tier + expiry + in-progress flag).
--    Backfills license_tier from existing plan column.
-- 2. Creates license_reissues audit table.

-- ── Extend provisionings ──────────────────────────────────────────────────────

ALTER TABLE provisionings
  ADD COLUMN IF NOT EXISTS license_tier        text,
  ADD COLUMN IF NOT EXISTS license_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reissue_status      text NOT NULL DEFAULT 'idle'
                           CHECK (reissue_status IN ('idle', 'in_progress', 'failed'));

-- Backfill: derive license_tier from the originally provisioned plan.
-- license_expires_at stays NULL for existing rows (unknown — no JWT was tracked).
UPDATE provisionings
SET    license_tier = plan
WHERE  license_tier IS NULL;

-- ── license_reissues audit table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_reissues (
  id                  text        PRIMARY KEY DEFAULT ('reissue_' || gen_random_uuid()::text),
  provisioning_id     text        NOT NULL REFERENCES provisionings(id),
  performed_by        text        NOT NULL,   -- owner user ID
  previous_tier       text        NOT NULL,
  new_tier            text        NOT NULL,
  previous_expires_at timestamptz,
  new_expires_at      timestamptz NOT NULL,
  reason              text        NOT NULL,
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'complete', 'failed')),
  failed_reason       text,
  pending_jwt         text,                  -- pre-signed JWT retained on SSH failure
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS license_reissues_prov_id_idx
  ON license_reissues (provisioning_id, created_at DESC);
