// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

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

// ── Rate limiter for login (5 attempts / IP / 5 min) — SEC-RL2 ───────────────

const LOGIN_RL_MAX    = 5
const LOGIN_RL_WINDOW = 5 * 60_000   // 5 minutes

/** @internal — exported for unit tests only */
export const loginRlMap = new Map<string, { count: number; resetAt: number }>()

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now()
  // SEC-RL1 pattern: evict expired entries to prevent unbounded memory growth
  for (const [k, e] of loginRlMap) {
    if (now > e.resetAt) loginRlMap.delete(k)
  }
  const entry = loginRlMap.get(ip)
  if (!entry || now > entry.resetAt) {
    loginRlMap.set(ip, { count: 1, resetAt: now + LOGIN_RL_WINDOW })
    return true
  }
  if (entry.count >= LOGIN_RL_MAX) return false
  entry.count++
  return true
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

authRouter.post("/auth/login", async (c) => {
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown"
  if (!checkLoginRateLimit(ip)) {
    return c.json({ error: "TOO_MANY_REQUESTS", message: "Too many login attempts. Try again later." }, 429)
  }

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
