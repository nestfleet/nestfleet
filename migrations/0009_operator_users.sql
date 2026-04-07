CREATE TABLE IF NOT EXISTS operator_users (
  user_id       TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roles         TEXT[] NOT NULL DEFAULT '{}',
  product_ids   TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_operator_users_updated_at
  BEFORE UPDATE ON operator_users
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

CREATE INDEX IF NOT EXISTS operator_users_email_idx ON operator_users (email);
