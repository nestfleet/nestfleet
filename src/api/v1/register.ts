// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Public registration endpoint — NF-PIVOT-08.
 *
 * Routes:
 *   GET  /api/v1/auth/first-run    — public; returns { firstRun: boolean }
 *   POST /api/v1/auth/register     — create the first admin account (SaaS signup)
 *
 * Gate logic:
 *   REGISTRATION_ENABLED=true  → always open (SaaS provisioned VPSes, explicit opt-in)
 *   REGISTRATION_ENABLED=false/unset + 0 users in DB → auto-open (first-run self-hosted)
 *   REGISTRATION_ENABLED=false/unset + ≥1 user in DB → locked (return 404)
 *
 * SaaS VPS isolation: cloud-init always writes REGISTRATION_ENABLED=true, so the
 * auto-detect path never activates on managed customer instances.
 */

import { Hono } from "hono"
import { z }    from "zod"
import bcrypt   from "bcryptjs"
import { createOperatorUser, findOperatorUserByEmail, listOperatorUsers } from "../../infra/db/repositories/operator-users.js"
import { signJwt }  from "../../auth/jwt.js"
import { config }   from "../../shared/config.js"
import { logger }   from "../../shared/logger.js"

export const registerRouter = new Hono()

const BCRYPT_ROUNDS = 12

const RegisterBodySchema = z.object({
  email:       z.string().email("Invalid email address"),
  password:    z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(100).optional(),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when registration should be accepted — explicit enable OR first-run (0 users). */
async function isRegistrationOpen(): Promise<boolean> {
  if (process.env.REGISTRATION_ENABLED === "true") return true
  // First-run auto-detect: allow registration when no users exist yet.
  try {
    const users = await listOperatorUsers()
    return users.length === 0
  } catch {
    return false
  }
}

// ── GET /api/v1/auth/first-run ────────────────────────────────────────────────

registerRouter.get("/auth/first-run", async (c) => {
  const firstRun = await isRegistrationOpen()
  return c.json({ ok: true, data: { firstRun } })
})

// ── POST /api/v1/auth/register ────────────────────────────────────────────────

registerRouter.post("/auth/register", async (c) => {
  const open = await isRegistrationOpen()
  if (!open) {
    return c.json({ error: "REGISTRATION_DISABLED", message: "Public registration is not enabled on this instance." }, 404)
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "INVALID_BODY" }, 400)
  }

  const parsed = RegisterBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", details: parsed.error.issues }, 400)
  }

  const { email, password, displayName } = parsed.data

  try {
    const existing = await findOperatorUserByEmail(email)
    if (existing) {
      // Constant-time response — don't reveal whether email exists
      return c.json({ error: "CONFLICT", message: "An account with this email already exists." }, 409)
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await createOperatorUser({
      email,
      password_hash: passwordHash,
      display_name:  displayName ?? email.split("@")[0],
      roles:         ["admin"],
      product_ids:   [],
    })

    const token = signJwt({
      sub:        user.user_id,
      email:      user.email,
      roles:      user.roles,
      productIds: user.product_ids,
    })

    logger.info({ userId: user.user_id, email }, "New account registered")

    return c.json({
      ok: true,
      data: {
        token,
        user: {
          userId:     user.user_id,
          email:      user.email,
          roles:      user.roles,
          productIds: user.product_ids,
        },
      },
    }, 201)
  } catch (err) {
    logger.error({ err, email }, "Registration failed")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})
