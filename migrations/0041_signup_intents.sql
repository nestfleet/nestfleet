-- FEAT-001: SaaS Fleet Provisioning — signup_intents table
-- Tracks a customer's intent to sign up before payment is confirmed.
-- Created by POST /api/v1/saas/signup; completed on checkout.session.completed.

CREATE TABLE signup_intents (
  id          text PRIMARY KEY DEFAULT ('si_' || gen_random_uuid()::text),
  email       text NOT NULL,
  org_slug    text NOT NULL,
  plan        text NOT NULL CHECK (plan IN ('starter', 'growth', 'scale')),
  status      text NOT NULL DEFAULT 'pending_payment'
              CHECK (status IN ('pending_payment', 'completed', 'abandoned')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON signup_intents (org_slug);
CREATE INDEX ON signup_intents (status, created_at);
