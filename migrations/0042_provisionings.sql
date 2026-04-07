-- FEAT-001: SaaS Fleet Provisioning — provisionings table
-- One row per customer VPS. Tracks every step of the provisioning saga.
-- Columns act as step-completion markers for idempotent retry:
--   hetzner_server_id IS NOT NULL  → VPS created (step 3 done)
--   cloudflare_record_id IS NOT NULL → DNS record created (step 4 done)
--   status = 'active'              → fully provisioned
--
-- secrets_enc stores AES-encrypted JSON: { postgresPassword, jwtSecret, encryptionKey }
-- so ops can reconstruct context for a VPS without re-running provisioning.

CREATE TABLE provisionings (
  id                     text PRIMARY KEY DEFAULT ('prov_' || gen_random_uuid()::text),
  intent_id              text NOT NULL REFERENCES signup_intents(id),
  org_slug               text UNIQUE NOT NULL,
  customer_email         text NOT NULL,
  plan                   text NOT NULL CHECK (plan IN ('starter', 'growth', 'scale')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Saga step markers — null means step not yet completed
  hetzner_server_id      bigint,
  hetzner_server_ip      text,
  cloudflare_record_id   text,
  secrets_enc            text,   -- AES-encrypted JSON of per-VPS secrets
  -- Lifecycle status
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending',         -- payment captured, not yet processed
                           'provisioning',    -- VPS creation in progress
                           'active',          -- VPS up, welcome email sent
                           'failed',          -- provisioning error, ops alerted
                           'deprovisioning',  -- subscription cancelled, 30-day window active
                           'deprovisioned'    -- VPS + DNS deleted
                         )),
  provisioned_at         timestamptz,
  deprovision_after      timestamptz,       -- set on cancellation: now() + 30 days
  deprovisioned_at       timestamptz,
  last_health_check_at   timestamptz,
  last_health_status     text CHECK (last_health_status IN ('ok', 'degraded', 'unreachable')),
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON provisionings (status);
CREATE INDEX ON provisionings (intent_id);
-- Partial index for nightly deprovisioning scheduler query
CREATE INDEX ON provisionings (deprovision_after)
  WHERE status = 'deprovisioning';
