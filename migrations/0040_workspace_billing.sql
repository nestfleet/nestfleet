-- 0040_workspace_billing.sql
-- Singleton billing table for direct NestFleet Stripe integration.
-- One row per deployment — created empty, populated on first Stripe event.
--
-- plan:     community | starter | growth | scale
-- status:   active | trialing | past_due | canceled | incomplete
--
-- Phase 3 of NF-PIVOT: BILLING_ENABLED gate. This table is created on all
-- deployments; the API routes that write to it are only mounted when
-- BILLING_ENABLED=true.

CREATE TABLE IF NOT EXISTS workspace_billing (
  id                      SERIAL PRIMARY KEY,
  -- Stripe identifiers
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  -- Plan state
  plan                    TEXT NOT NULL DEFAULT 'community'
    CHECK (plan IN ('community', 'starter', 'growth', 'scale')),
  plan_interval           TEXT
    CHECK (plan_interval IN ('monthly', 'annual') OR plan_interval IS NULL),
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  -- Lifecycle timestamps
  trial_ends_at           TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at               TIMESTAMPTZ,
  -- Audit
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspace_billing IS
  'Singleton billing record for this NestFleet deployment (one row, managed by Stripe webhooks).';

COMMENT ON COLUMN workspace_billing.plan IS
  'Active plan tier. community = free/unlimited (AGPL self-host default).';

COMMENT ON COLUMN workspace_billing.status IS
  'Stripe subscription status. active = fully paid. past_due = payment failed (grace period).';
