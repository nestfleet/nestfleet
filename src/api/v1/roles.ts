/**
 * RBAC Permission Audit & Studio API — SLICE-22 + SLICE-23.
 *
 * Read-only endpoints (SLICE-22):
 *   GET /api/v1/products/:productId/roles
 *       Returns all roles (default + custom) with their permission counts.
 *
 *   GET /api/v1/products/:productId/roles/:roleId/permissions
 *       Returns the full permission matrix for one role.
 *
 * Studio endpoints (SLICE-23, Scale tier only):
 *   GET  /api/v1/products/:productId/roles/export.json
 *   POST /api/v1/products/:productId/roles
 *   PUT  /api/v1/products/:productId/roles/:roleId/permissions
 *   DELETE /api/v1/products/:productId/roles/:roleId
 *   PUT  /api/v1/products/:productId/roles/:roleId/users/:userRef/overrides
 *   POST /api/v1/products/:productId/roles/:roleId/sso-mappings
 *
 * Auth: requireAuth + requireRole("operator") for reads; requireRole("admin") for writes.
 */

import { Hono } from "hono"
import { requireAuth, requireRole, requireTier } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import {
  listRolesWithCounts,
  getRolePermissionMatrix,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_REGISTRY,
  TOTAL_PERMISSIONS,
} from "../../infra/db/repositories/permissions.js"
import {
  createCustomRole,
  findCustomRole,
  listCustomRoles,
  updateCustomRole,
  deleteCustomRole,
  getUsersForRole,
  setRolePermissions,
  getRolePermissionOverrides,
  upsertUserPermissionOverride,
  createSsoGroupMapping,
} from "../../infra/db/repositories/roles-studio.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import {
  resolveDependencies,
  cloneRolePermissions,
  computeImpactPreview,
  validateRoleKey,
} from "../../rbac/permission-engine.js"

const DEFAULT_ROLE_IDS = ["admin", "operator", "support_lead", "knowledge_lead"]

export const rolesRouter = new Hono<{ Variables: AuthVariables }>()

// ── GET /api/v1/products/:productId/roles/export.json ─────────────────────────
// IMPORTANT: registered BEFORE /:roleId routes to avoid Hono routing conflicts

rolesRouter.get(
  "/products/:productId/roles/export.json",
  requireAuth(),
  requireRole("admin"),
  async (c) => {
    const productId = c.req.param("productId")

    // Default roles
    const defaultRoleEntries = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([id, perms]) => ({
      id,
      name: id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      type: "default" as const,
      permissions: [...perms],
    }))

    // Custom roles from DB
    const customRoles = await listCustomRoles(productId)
    const customRoleEntries = await Promise.all(
      customRoles.map(async (role) => {
        const overrides = await getRolePermissionOverrides(role.role_id, productId)
        return {
          id: role.role_id,
          name: role.name,
          type: "custom" as const,
          permissions: overrides ?? [],
        }
      })
    )

    return c.json({
      ok: true,
      data: {
        exportedAt: new Date().toISOString(),
        roles: [...defaultRoleEntries, ...customRoleEntries],
      },
    })
  },
)

// ── GET /api/v1/products/:productId/roles ─────────────────────────────────────

rolesRouter.get(
  "/products/:productId/roles",
  requireAuth(),
  requireRole("operator"),
  async (c) => {
    const productId = c.req.param("productId")

    // Default roles
    const defaultRoles = listRolesWithCounts().map((r) => ({ ...r, type: "default" as const }))

    // Custom roles from DB
    const customRoles = await listCustomRoles(productId)
    const customRoleRows = await Promise.all(
      customRoles.map(async (role) => {
        const overrides = await getRolePermissionOverrides(role.role_id, productId)
        return {
          id: role.role_id,
          name: role.name,
          permissionCount: overrides?.length ?? 0,
          type: "custom" as const,
        }
      })
    )

    return c.json({ ok: true, data: [...defaultRoles, ...customRoleRows] })
  },
)

// ── POST /api/v1/products/:productId/roles ────────────────────────────────────

rolesRouter.post(
  "/products/:productId/roles",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const user = c.get("user")
    const body = await c.req.json<{
      name: string
      key: string
      description?: string
      clone_from?: string
    }>()

    if (!body.name || !body.key) {
      return c.json({ error: "VALIDATION", message: "name and key are required" }, 400)
    }

    if (!validateRoleKey(body.key)) {
      return c.json({ error: "VALIDATION", message: "key must be lowercase alphanumeric with hyphens/underscores" }, 400)
    }

    let role
    try {
      role = await createCustomRole({
        product_id: productId,
        name: body.name,
        key: body.key,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.clone_from !== undefined  ? { cloned_from: body.clone_from }  : {}),
        created_by: user.email,
      })
    } catch (err: unknown) {
      // Postgres unique-constraint violation (23505) → duplicate key
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
        return c.json({ error: "CONFLICT", message: `Role key '${body.key}' already exists in this product` }, 409)
      }
      throw err
    }

    // If clone_from specified, seed permissions from source role
    if (body.clone_from) {
      let sourcePermissions: string[]

      if (DEFAULT_ROLE_IDS.includes(body.clone_from)) {
        // Clone from a default role
        sourcePermissions = cloneRolePermissions(body.clone_from)
      } else {
        // Clone from another custom role
        const overrides = await getRolePermissionOverrides(body.clone_from, productId)
        sourcePermissions = overrides ?? []
      }

      if (sourcePermissions.length > 0) {
        await setRolePermissions(role.role_id, productId, sourcePermissions, user.email)
      }
    }

    return c.json(
      { ok: true, data: { role_id: role.role_id, name: role.name, key: role.key } },
      201,
    )
  },
)

// ── PUT /api/v1/products/:productId/roles/:roleId/permissions ─────────────────

rolesRouter.put(
  "/products/:productId/roles/:roleId/permissions",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const roleId = c.req.param("roleId")

    // Cannot edit permissions of built-in default roles
    if (DEFAULT_ROLE_IDS.includes(roleId)) {
      return c.json(
        { error: "VALIDATION", message: "Cannot edit permissions of a default role. Clone it to create a custom role instead." },
        400,
      )
    }

    const user = c.get("user")
    const body = await c.req.json<{ permissions: string[] }>()

    // Resolve dependencies
    const resolved = resolveDependencies(new Set(body.permissions ?? []))
    const permissionsArray = [...resolved]

    // Compute impact preview
    const impactPreview = await computeImpactPreview(
      roleId,
      [],  // we pass empty for removed since we track full replacement
      (rid) => getUsersForRole(rid, productId),
    )

    // Persist
    await setRolePermissions(roleId, productId, permissionsArray, user.email)

    // Write audit event
    await createAuditEvent({
      product_id:  productId,
      entity_type: "role",
      entity_ref:  roleId,
      actor_type:  "user",
      actor_ref:   user.email,
      action:      "role.permissions_updated",
      after_state: { permissions: permissionsArray },
    })

    return c.json({
      ok: true,
      data: {
        roleId,
        permissions: permissionsArray,
        impactPreview,
      },
    })
  },
)

// ── PATCH /api/v1/products/:productId/roles/:roleId ──────────────────────────

rolesRouter.patch(
  "/products/:productId/roles/:roleId",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const roleId    = c.req.param("roleId")

    if (DEFAULT_ROLE_IDS.includes(roleId)) {
      return c.json({ error: "VALIDATION", message: "Cannot rename a default role" }, 400)
    }

    const body = await c.req.json<{ name?: string; description?: string }>()
    const updated = await updateCustomRole(roleId, productId, body)

    if (!updated) {
      return c.json({ error: "NOT_FOUND", message: "Role not found" }, 404)
    }

    return c.json({ ok: true, data: { role_id: updated.role_id, name: updated.name } })
  },
)

// ── DELETE /api/v1/products/:productId/roles/:roleId ─────────────────────────

rolesRouter.delete(
  "/products/:productId/roles/:roleId",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const roleId = c.req.param("roleId")

    // Cannot delete default roles
    if (DEFAULT_ROLE_IDS.includes(roleId)) {
      return c.json({ error: "VALIDATION", message: "Cannot delete a default role" }, 400)
    }

    // Check if any users have this role
    // For custom roles, we check by roleId AND by the role key
    const customRole = await findCustomRole(roleId, productId)
    const keyToCheck = customRole?.key ?? roleId

    const usersWithRoleId  = await getUsersForRole(roleId, productId)
    const usersWithRoleKey = await getUsersForRole(keyToCheck, productId)
    const allUsers = [...new Set([...usersWithRoleId, ...usersWithRoleKey])]

    if (allUsers.length > 0) {
      return c.json(
        { error: "CONFLICT", message: "Cannot delete role with active users", affectedUsers: allUsers },
        409,
      )
    }

    await deleteCustomRole(roleId, productId)
    return c.json({ ok: true })
  },
)

// ── PUT /api/v1/products/:productId/roles/:roleId/users/:userRef/overrides ────

rolesRouter.put(
  "/products/:productId/roles/:roleId/users/:userRef/overrides",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const userRef   = c.req.param("userRef")
    const body = await c.req.json<{ permission_id: string; granted: boolean }>()

    await upsertUserPermissionOverride(productId, userRef, body.permission_id, body.granted)

    return c.json({ ok: true })
  },
)

// ── POST /api/v1/products/:productId/roles/:roleId/sso-mappings ───────────────

rolesRouter.post(
  "/products/:productId/roles/:roleId/sso-mappings",
  requireAuth(),
  requireRole("admin"),
  requireTier("scale"),
  async (c) => {
    const productId = c.req.param("productId")
    const roleId    = c.req.param("roleId")
    const body = await c.req.json<{ group_name: string }>()

    const mapping = await createSsoGroupMapping(productId, body.group_name, roleId)

    return c.json(
      { ok: true, data: { id: mapping.id, group_name: mapping.group_name, role_id: mapping.role_id } },
      201,
    )
  },
)

// ── GET /api/v1/products/:productId/roles/:roleId/permissions ─────────────────

rolesRouter.get(
  "/products/:productId/roles/:roleId/permissions",
  requireAuth(),
  requireRole("operator"),
  async (c) => {
    const productId = c.req.param("productId")
    const roleId    = c.req.param("roleId")

    // Check if it's a custom role in DB
    const customRole = await findCustomRole(roleId, productId)

    if (customRole) {
      // Custom role — use DB permissions
      const overrides = await getRolePermissionOverrides(roleId, productId)
      const grantedSet = new Set(overrides ?? [])

      const permissions = PERMISSION_REGISTRY.map((p) => ({
        ...p,
        granted: grantedSet.has(p.id),
      }))

      return c.json({ ok: true, data: { roleId, permissions } })
    }

    // Default role — use constant-based logic
    const matrix = getRolePermissionMatrix(roleId)

    if (!matrix) {
      return c.json({ error: "Role not found", roleId }, 404)
    }

    return c.json({
      ok: true,
      data: {
        roleId,
        permissions: matrix,
      },
    })
  },
)
