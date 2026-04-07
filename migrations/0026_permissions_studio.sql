-- SLICE-23: Permission Studio — dynamic RBAC tables for Scale tier.

-- Custom roles created by administrators (Scale tier only)
CREATE TABLE IF NOT EXISTS custom_roles (
  role_id      TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key          TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  cloned_from  TEXT,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, key)
);

CREATE TRIGGER set_custom_roles_updated_at
  BEFORE UPDATE ON custom_roles
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Per-role, per-product permission sets (for both custom and overridden default roles)
CREATE TABLE IF NOT EXISTS role_permission_overrides (
  role_id       TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL,
  granted       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by    TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, product_id, permission_id)
);

-- User-level permission grant/deny that overrides their role
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id            SERIAL PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  user_ref      TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  granted       BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, user_ref, permission_id)
);

-- SSO group → role binding (Scale tier, SAML/OIDC group name → role_id)
CREATE TABLE IF NOT EXISTS sso_group_role_mappings (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  group_name   TEXT NOT NULL,
  role_id      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, group_name, role_id)
);
