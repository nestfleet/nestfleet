-- Mark built-in/bootstrapped operator users as system users (non-deletable).
-- All users that exist at migration time are treated as system (seed) users.
-- Users created via the API after this migration will default to FALSE.
ALTER TABLE operator_users
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: every pre-existing user is a system/seed user
UPDATE operator_users SET is_system = TRUE;
