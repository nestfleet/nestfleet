-- FEAT-019: SaaS waitlist — pre-launch interest capture
-- Stores email + optional metadata for users who express interest in managed hosting.
-- No UNIQUE constraint on email — one person may enquire about multiple plans.

CREATE TABLE IF NOT EXISTS waitlist (
  id         BIGSERIAL    PRIMARY KEY,
  email      TEXT         NOT NULL,
  name       TEXT,
  company    TEXT,
  plan       TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email      ON waitlist (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist (created_at DESC);
