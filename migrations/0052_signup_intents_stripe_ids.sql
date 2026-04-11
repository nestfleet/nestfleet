-- FEAT-017-A: Add Stripe IDs to signup_intents table
-- Captured at checkout.session.completed and copied to provisionings by the
-- provisioning worker when it creates the provisioning row.

ALTER TABLE signup_intents
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
