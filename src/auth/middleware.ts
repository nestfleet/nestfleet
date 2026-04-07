/**
 * Auth middleware — SPIKE-07.
 *
 * requireAuth  — validates Bearer JWT, attaches decoded payload to c.var.user
 * requireRole  — checks the authenticated user holds at least one of the given roles
 * requireTier  — checks the active license tier meets the minimum required (SLICE-23)
 */

import type { Context, MiddlewareHandler, Next } from "hono"
import { verifyJwt } from "./jwt.js"
import type { JwtPayload } from "./jwt.js"

export type AuthVariables = {
  user: JwtPayload
}

type AuthContext = Context<{ Variables: AuthVariables }>

/**
 * Validates the `Authorization: Bearer <token>` header and attaches the
 * decoded JWT payload to the Hono context variable `user`.
 *
 * Returns 401 `{ error: "UNAUTHORIZED" }` when the token is missing or invalid.
 */
export function requireAuth(): MiddlewareHandler {
  return async (c: AuthContext, next: Next) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "UNAUTHORIZED" }, 401)
    }

    const token = authHeader.slice("Bearer ".length)
    try {
      const payload = verifyJwt(token)
      c.set("user", payload)
    } catch {
      return c.json({ error: "UNAUTHORIZED" }, 401)
    }

    // CG-07: Enforce product access — check :productId param is in user's productIds claim
    const user = c.get("user")
    const productId = c.req.param("productId")
    if (productId && !user.roles.includes("admin")) {
      const allowed = user.productIds ?? []
      if (!allowed.includes(productId)) {
        return c.json({ error: "FORBIDDEN", message: "Product access denied" }, 403)
      }
    }

    await next()
  }
}

/**
 * Requires that `requireAuth` has already run and that the requested
 * `:productId` route param is within the user's `productIds` JWT claim.
 *
 * Admin bypasses this check (has access to all products).
 * If the route has no `:productId` param, this middleware is a no-op.
 *
 * Returns 403 `{ error: "FORBIDDEN", message: "Product access denied" }`.
 */
export function requireProductAccess(): MiddlewareHandler {
  return async (c: AuthContext, next: Next) => {
    const user = c.get("user")
    if (!user) {
      // User context not set — requireAuth() hasn't run or auth is optional for this route.
      // Skip product access check; let requireAuth() handle the 401 on its own.
      await next()
      return
    }

    // Admin bypasses product access checks
    if (user.roles.includes("admin")) {
      await next()
      return
    }

    const productId = c.req.param("productId")
    if (!productId) {
      // Route doesn't have :productId — skip check
      await next()
      return
    }

    const allowed = user.productIds ?? []
    if (!allowed.includes(productId)) {
      return c.json({ error: "FORBIDDEN", message: "Product access denied" }, 403)
    }

    await next()
  }
}

/**
 * Requires that `requireAuth` has already run and that the user holds at least
 * one of the specified roles.
 *
 * Returns 403 `{ error: "FORBIDDEN" }` when the role check fails.
 */
export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c: AuthContext, next: Next) => {
    const user = c.get("user")
    if (!user) {
      return c.json({ error: "UNAUTHORIZED" }, 401)
    }

    // admin is a superuser — bypasses all role checks
    const isAdmin = user.roles.includes("admin")
    const hasRole = isAdmin || roles.some((role) => user.roles.includes(role))
    if (!hasRole) {
      return c.json({ error: "FORBIDDEN" }, 403)
    }

    await next()
  }
}

// ── Tier gate (SLICE-23) ──────────────────────────────────────────────────────

import { getLicenseTier } from "../license/validator.js"
import { licenseToProductTier, type ProductTier } from "../rbac/permission-engine.js"

const TIER_ORDER: Record<ProductTier, number> = {
  community: 0,
  starter:   1,
  growth:    2,
  scale:     3,
}

const TIER_LABELS: Record<ProductTier, string> = {
  community: "Community",
  starter:   "Starter",
  growth:    "Growth",
  scale:     "Scale",
}

export function meetsMinTier(current: ProductTier, min: ProductTier): boolean {
  return TIER_ORDER[current] >= TIER_ORDER[min]
}

/**
 * Middleware that checks the active license tier meets the minimum required.
 * Uses licenseToProductTier() to map LicenseTier → ProductTier.
 * Returns 403 if the current tier is below minTier.
 */
export function requireTier(minTier: ProductTier): MiddlewareHandler {
  return async (c: AuthContext, next: Next) => {
    const licenseTier = getLicenseTier()
    const productTier = licenseToProductTier(licenseTier)
    if (!meetsMinTier(productTier, minTier)) {
      return c.json(
        { error: "FORBIDDEN", message: `This feature requires ${TIER_LABELS[minTier]} tier or higher` },
        403,
      )
    }
    await next()
  }
}
