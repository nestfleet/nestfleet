/**
 * Roles Studio repository — SLICE-23.
 * CRUD for custom roles, role permission overrides,
 * user-level permission overrides, and SSO group mappings.
 */

import { getDb } from "../client.js"
import { newId } from "../id.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomRoleRow {
  role_id:     string
  product_id:  string
  name:        string
  key:         string
  description: string
  cloned_from: string | null
  created_by:  string
  created_at:  Date
  updated_at:  Date
}

export interface CustomRoleInsert {
  product_id:  string
  name:        string
  key:         string
  description?: string
  cloned_from?: string
  created_by:  string
}

// ── Custom roles ──────────────────────────────────────────────────────────────

export async function createCustomRole(input: CustomRoleInsert): Promise<CustomRoleRow> {
  const db = getDb()
  const roleId = newId("crole_")

  const [row] = await db<CustomRoleRow[]>`
    INSERT INTO custom_roles (
      role_id, product_id, name, key, description, cloned_from, created_by
    ) VALUES (
      ${roleId},
      ${input.product_id},
      ${input.name},
      ${input.key},
      ${input.description ?? ""},
      ${input.cloned_from ?? null},
      ${input.created_by}
    )
    RETURNING *
  `
  if (!row) throw new Error("createCustomRole: INSERT returned no row")
  return row
}

export async function findCustomRole(roleId: string, productId: string): Promise<CustomRoleRow | null> {
  const db = getDb()
  const [row] = await db<CustomRoleRow[]>`
    SELECT * FROM custom_roles
    WHERE role_id = ${roleId} AND product_id = ${productId}
  `
  return row ?? null
}

export async function findCustomRoleByKey(key: string, productId: string): Promise<CustomRoleRow | null> {
  const db = getDb()
  const [row] = await db<CustomRoleRow[]>`
    SELECT * FROM custom_roles
    WHERE key = ${key} AND product_id = ${productId}
  `
  return row ?? null
}

export async function listCustomRoles(productId: string): Promise<CustomRoleRow[]> {
  const db = getDb()
  return db<CustomRoleRow[]>`
    SELECT * FROM custom_roles
    WHERE product_id = ${productId}
    ORDER BY created_at ASC
  `
}

export async function updateCustomRole(
  roleId: string,
  productId: string,
  update: { name?: string; description?: string },
): Promise<CustomRoleRow | null> {
  const db = getDb()
  const [row] = await db<CustomRoleRow[]>`
    UPDATE custom_roles
    SET
      name        = COALESCE(${update.name        ?? null}, name),
      description = COALESCE(${update.description ?? null}, description),
      updated_at  = NOW()
    WHERE role_id = ${roleId} AND product_id = ${productId}
    RETURNING *
  `
  return row ?? null
}

export async function deleteCustomRole(roleId: string, productId: string): Promise<boolean> {
  const db = getDb()
  const rows = await db<{ role_id: string }[]>`
    DELETE FROM custom_roles
    WHERE role_id = ${roleId} AND product_id = ${productId}
    RETURNING role_id
  `
  return rows.length > 0
}

// ── User lookup ───────────────────────────────────────────────────────────────

/**
 * Returns emails of operator_users who have the given roleId in their roles array
 * and have the productId in their product_ids array.
 */
export async function getUsersForRole(roleId: string, productId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db<{ email: string }[]>`
    SELECT email FROM operator_users
    WHERE ${roleId} = ANY(roles)
      AND ${productId} = ANY(product_ids)
  `
  return rows.map((r) => r.email)
}

// ── Role permission overrides ─────────────────────────────────────────────────

/**
 * Replaces the entire permission set for a role (upsert — deletes old, inserts new).
 */
export async function setRolePermissions(
  roleId: string,
  productId: string,
  permissions: string[],
  actorRef: string,
): Promise<void> {
  const db = getDb()

  await db.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as unknown as typeof db

    // Delete existing overrides for this role+product
    await sql`
      DELETE FROM role_permission_overrides
      WHERE role_id = ${roleId} AND product_id = ${productId}
    `

    if (permissions.length === 0) return

    // Insert new set
    const rows = permissions.map((permId) => ({
      role_id:      roleId,
      product_id:   productId,
      permission_id: permId,
      granted:      true,
      updated_by:   actorRef,
    }))

    await sql`
      INSERT INTO role_permission_overrides ${sql(rows)}
    `
  })
}

/**
 * Returns the list of granted permission IDs for a role, or null if no
 * overrides exist (meaning the role uses its default permissions).
 */
export async function getRolePermissionOverrides(
  roleId: string,
  productId: string,
): Promise<string[] | null> {
  const db = getDb()
  const rows = await db<{ permission_id: string }[]>`
    SELECT permission_id FROM role_permission_overrides
    WHERE role_id = ${roleId} AND product_id = ${productId} AND granted = TRUE
    ORDER BY permission_id ASC
  `
  if (rows.length === 0) {
    // Check if there are any overrides at all (could be empty set intentionally)
    const [countRow] = await db<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM role_permission_overrides
      WHERE role_id = ${roleId} AND product_id = ${productId}
    `
    if (!countRow || countRow.count === 0) return null
  }
  return rows.map((r) => r.permission_id)
}

// ── User permission overrides ─────────────────────────────────────────────────

export async function upsertUserPermissionOverride(
  productId: string,
  userRef: string,
  permissionId: string,
  granted: boolean,
): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO user_permission_overrides (product_id, user_ref, permission_id, granted)
    VALUES (${productId}, ${userRef}, ${permissionId}, ${granted})
    ON CONFLICT (product_id, user_ref, permission_id)
    DO UPDATE SET granted = EXCLUDED.granted
  `
}

// ── SSO group mappings ────────────────────────────────────────────────────────

export async function createSsoGroupMapping(
  productId: string,
  groupName: string,
  roleId: string,
): Promise<{ id: number; product_id: string; group_name: string; role_id: string }> {
  const db = getDb()
  const [row] = await db<{ id: number; product_id: string; group_name: string; role_id: string }[]>`
    INSERT INTO sso_group_role_mappings (product_id, group_name, role_id)
    VALUES (${productId}, ${groupName}, ${roleId})
    ON CONFLICT (product_id, group_name, role_id) DO UPDATE
      SET group_name = EXCLUDED.group_name
    RETURNING id, product_id, group_name, role_id
  `
  if (!row) throw new Error("createSsoGroupMapping: INSERT returned no row")
  return row
}

export async function findSsoGroupMappings(
  productId: string,
  roleId: string,
): Promise<Array<{ group_name: string; role_id: string }>> {
  const db = getDb()
  return db<{ group_name: string; role_id: string }[]>`
    SELECT group_name, role_id FROM sso_group_role_mappings
    WHERE product_id = ${productId} AND role_id = ${roleId}
    ORDER BY created_at ASC
  `
}
