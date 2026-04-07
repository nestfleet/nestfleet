/**
 * Auth API — SPIKE-07.
 *
 * Routes:
 *   POST /api/v1/auth/login  — exchange email+password for a JWT
 *   GET  /api/v1/auth/me     — return the authenticated user's profile
 */

import { Hono } from "hono"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { findOperatorUserByEmail } from "../../infra/db/repositories/operator-users.js"
import { signJwt } from "../../auth/jwt.js"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"

export const authRouter = new Hono<{ Variables: AuthVariables }>()

// ── Request schemas ────────────────────────────────────────────────────────────

const LoginBodySchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

authRouter.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = LoginBodySchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400)
  }

  const { email, password } = parsed.data

  try {
    const user = await findOperatorUserByEmail(email)

    // Constant-time comparison — same response whether email or password is wrong
    const passwordValid =
      user !== null && (await bcrypt.compare(password, user.password_hash))

    if (!user || !passwordValid) {
      return c.json({ error: "UNAUTHORIZED", message: "Invalid credentials" }, 401)
    }

    const token = signJwt({
      sub:        user.user_id,
      email:      user.email,
      roles:      user.roles,
      productIds: user.product_ids,
    })

    return c.json({
      token,
      user: {
        userId:     user.user_id,
        email:      user.email,
        roles:      user.roles,
        productIds: user.product_ids,
      },
    })
  } catch (err) {
    logger.error({ err }, "Login error")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

authRouter.get("/auth/me", requireAuth(), async (c) => {
  const user = c.get("user")
  return c.json({
    userId:     user.sub,
    email:      user.email,
    roles:      user.roles,
    productIds: user.productIds,
  })
})
