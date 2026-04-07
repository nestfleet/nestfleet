/**
 * User Management API — Wave A.
 *
 * All routes require admin role.
 *
 * Routes:
 *   GET    /api/v1/users                      — list all operator users
 *   GET    /api/v1/users/:userId              — get single user
 *   POST   /api/v1/users                      — create operator user
 *   PUT    /api/v1/users/:userId              — update user (roles, product_ids, email)
 *   DELETE /api/v1/users/:userId              — hard-delete user
 *   POST   /api/v1/users/:userId/reset-password — admin resets user password
 */

import { Hono } from "hono"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import { ROLES, isValidRole } from "../../shared/roles.js"
import {
  listOperatorUsers,
  createOperatorUser,
  findOperatorUserById,
  findOperatorUserByEmail,
  updateOperatorUser,
  deleteOperatorUser,
} from "../../infra/db/repositories/operator-users.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import { config } from "../../shared/config.js"

// Audit events for user management use a synthetic product_id since users are
// global (not product-scoped). We use the well-known sentinel value "system".
const SYSTEM_PRODUCT_ID = "system"
const BCRYPT_ROUNDS = config.BCRYPT_ROUNDS

export const usersRouter = new Hono<{ Variables: AuthVariables }>()

// ── Shared middleware ─────────────────────────────────────────────────────────

// All user-management routes require a valid JWT and the admin role.
usersRouter.use("/users", requireAuth(), requireRole("admin"))
usersRouter.use("/users/*", requireAuth(), requireRole("admin"))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip password_hash before sending to client. */
function sanitizeUser(user: {
  user_id: string
  email: string
  password_hash: string
  display_name?: string | null | undefined
  roles: string[]
  product_ids: string[]
  is_system?: boolean
  created_at: Date
  updated_at: Date
}) {
  return {
    userId:      user.user_id,
    email:       user.email,
    displayName: user.display_name ?? null,
    roles:       user.roles,
    productIds:  user.product_ids,
    isSystem:    user.is_system ?? false,
    createdAt:   user.created_at,
    updatedAt:   user.updated_at,
  }
}

// ── Request schemas ───────────────────────────────────────────────────────────

const CreateUserBodySchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().optional(),
  roles:       z.array(z.string()).min(1, "At least one role is required"),
  productIds:  z.array(z.string()).optional(),
})

const UpdateUserBodySchema = z.object({
  email:       z.string().email().optional(),
  displayName: z.string().nullable().optional(),
  roles:       z.array(z.string()).optional(),
  productIds:  z.array(z.string()).optional(),
}).refine(
  (d) => d.email !== undefined || d.displayName !== undefined || d.roles !== undefined || d.productIds !== undefined,
  { message: "At least one field must be provided" },
)

const ResetPasswordBodySchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

// ── GET /api/v1/users ─────────────────────────────────────────────────────────

usersRouter.get("/users", async (c) => {
  try {
    const users = await listOperatorUsers()
    return c.json({ ok: true, data: users.map(sanitizeUser) })
  } catch (err) {
    logger.error({ err }, "Failed to list users")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── GET /api/v1/users/:userId ─────────────────────────────────────────────────

usersRouter.get("/users/:userId", async (c) => {
  const userId = c.req.param("userId")
  try {
    const user = await findOperatorUserById(userId)
    if (!user) return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    return c.json({ ok: true, data: sanitizeUser(user) })
  } catch (err) {
    logger.error({ err, userId }, "Failed to get user")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── POST /api/v1/users ────────────────────────────────────────────────────────

usersRouter.post("/users", async (c) => {
  const actor = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "INVALID_BODY", message: "Invalid JSON body" }, 400)
  }

  const parsed = CreateUserBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, 400)
  }

  const { email, password, displayName, roles, productIds } = parsed.data

  // Validate all roles against the ROLES constant
  const invalidRoles = roles.filter((r) => !isValidRole(r))
  if (invalidRoles.length > 0) {
    return c.json({
      error: "VALIDATION_ERROR",
      message: `Invalid role(s): ${invalidRoles.join(", ")}. Valid roles: ${ROLES.join(", ")}`,
    }, 400)
  }

  try {
    // Check email uniqueness
    const existing = await findOperatorUserByEmail(email)
    if (existing) {
      return c.json({ error: "CONFLICT", message: "A user with this email already exists" }, 409)
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const user = await createOperatorUser({
      email,
      password_hash: passwordHash,
      display_name: displayName,
      roles,
      product_ids: productIds ?? [],
    })

    // Audit event
    await createAuditEvent({
      product_id:  SYSTEM_PRODUCT_ID,
      entity_type: "operator_user",
      entity_ref:  user.user_id,
      actor_type:  "operator",
      actor_ref:   actor.sub,
      action:      "user.created",
      after_state: { email: user.email, roles: user.roles },
    }).catch((err) => logger.warn({ err }, "Audit event failed for user.created"))

    logger.info({ userId: user.user_id, email, actor: actor.email }, "User created")
    return c.json({ ok: true, data: sanitizeUser(user) }, 201)
  } catch (err) {
    logger.error({ err, email }, "Failed to create user")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── PUT /api/v1/users/:userId ─────────────────────────────────────────────────

usersRouter.put("/users/:userId", async (c) => {
  const userId = c.req.param("userId")
  const actor  = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "INVALID_BODY", message: "Invalid JSON body" }, 400)
  }

  const parsed = UpdateUserBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, 400)
  }

  const { email, displayName, roles, productIds } = parsed.data

  // Validate roles if provided
  if (roles !== undefined) {
    const invalidRoles = roles.filter((r) => !isValidRole(r))
    if (invalidRoles.length > 0) {
      return c.json({
        error: "VALIDATION_ERROR",
        message: `Invalid role(s): ${invalidRoles.join(", ")}. Valid roles: ${ROLES.join(", ")}`,
      }, 400)
    }
  }

  try {
    const existing = await findOperatorUserById(userId)
    if (!existing) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    // Self-lockout guard: admin cannot remove admin role from themselves
    if (roles !== undefined && actor.sub === userId) {
      const wasAdmin = existing.roles.includes("admin")
      const willBeAdmin = roles.includes("admin")
      if (wasAdmin && !willBeAdmin) {
        return c.json({
          error: "FORBIDDEN",
          message: "Cannot remove your own admin role — this would lock you out",
        }, 403)
      }
    }

    // Check email uniqueness if email is being changed
    if (email !== undefined && email !== existing.email) {
      const conflict = await findOperatorUserByEmail(email)
      if (conflict) {
        return c.json({ error: "CONFLICT", message: "A user with this email already exists" }, 409)
      }
    }

    const rolesChanged = roles !== undefined &&
      JSON.stringify([...existing.roles].sort()) !== JSON.stringify([...roles].sort())

    const updated = await updateOperatorUser(userId, {
      ...(email !== undefined       ? { email }                     : {}),
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(roles !== undefined       ? { roles }                     : {}),
      ...(productIds !== undefined  ? { product_ids: productIds }   : {}),
    })

    if (!updated) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    // Audit role changes
    if (rolesChanged) {
      await createAuditEvent({
        product_id:   SYSTEM_PRODUCT_ID,
        entity_type:  "operator_user",
        entity_ref:   userId,
        actor_type:   "operator",
        actor_ref:    actor.sub,
        action:       "user.roles_changed",
        before_state: { roles: existing.roles },
        after_state:  { roles: updated.roles },
      }).catch((err) => logger.warn({ err }, "Audit event failed for user.roles_changed"))
    }

    logger.info({ userId, actor: actor.email }, "User updated")
    return c.json({ ok: true, data: sanitizeUser(updated) })
  } catch (err) {
    logger.error({ err, userId }, "Failed to update user")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── DELETE /api/v1/users/:userId ──────────────────────────────────────────────

usersRouter.delete("/users/:userId", async (c) => {
  const userId = c.req.param("userId")
  const actor  = c.get("user")

  // Cannot delete self
  if (actor.sub === userId) {
    return c.json({ error: "FORBIDDEN", message: "Cannot delete your own account" }, 403)
  }

  try {
    const existing = await findOperatorUserById(userId)
    if (!existing) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    // Cannot delete built-in system users
    if (existing.is_system) {
      return c.json({ error: "FORBIDDEN", message: "Cannot delete a built-in system user" }, 403)
    }

    const deleted = await deleteOperatorUser(userId)
    if (!deleted) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    // Audit event
    await createAuditEvent({
      product_id:   SYSTEM_PRODUCT_ID,
      entity_type:  "operator_user",
      entity_ref:   userId,
      actor_type:   "operator",
      actor_ref:    actor.sub,
      action:       "user.deleted",
      before_state: { email: existing.email, roles: existing.roles },
    }).catch((err) => logger.warn({ err }, "Audit event failed for user.deleted"))

    logger.info({ userId, email: existing.email, actor: actor.email }, "User deleted")
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err, userId }, "Failed to delete user")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── POST /api/v1/users/:userId/reset-password ─────────────────────────────────

usersRouter.post("/users/:userId/reset-password", async (c) => {
  const userId = c.req.param("userId")
  const actor  = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "INVALID_BODY", message: "Invalid JSON body" }, 400)
  }

  const parsed = ResetPasswordBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, 400)
  }

  try {
    const existing = await findOperatorUserById(userId)
    if (!existing) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS)

    const updated = await updateOperatorUser(userId, { password_hash: passwordHash })
    if (!updated) {
      return c.json({ error: "NOT_FOUND", message: "User not found" }, 404)
    }

    await createAuditEvent({
      product_id:  SYSTEM_PRODUCT_ID,
      entity_type: "operator_user",
      entity_ref:  userId,
      actor_type:  "operator",
      actor_ref:   actor.sub,
      action:      "user.password_reset",
      metadata:    { targetEmail: existing.email },
    }).catch((err) => logger.warn({ err }, "Audit event failed for user.password_reset"))

    logger.info({ userId, actor: actor.email }, "Password reset by admin")
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err, userId }, "Failed to reset password")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})
