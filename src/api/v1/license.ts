/**
 * License Status API — NF-PIVOT simplified.
 *
 * Routes:
 *   GET /api/v1/license/status — admin-only; returns community-mode license state
 *
 * Removed (PC coupling):
 *   POST /license/checkout   — Stripe checkout proxy
 *   POST /license/upgrade    — Stripe upgrade proxy
 *   POST /license/portal     — Stripe portal proxy
 *   POST /license/downgrade  — Stripe downgrade proxy
 *
 * Direct Stripe integration available via /api/v1/billing/* (BILLING_ENABLED gate).
 */

import { Hono } from "hono"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import {
  validateLicense,
  getLicenseTier,
} from "../../license/validator.js"
import { listProducts } from "../../infra/db/repositories/products.js"
import { getOuUsage } from "../../billing/ou-tracker.js"

export const licenseRouter = new Hono<{ Variables: AuthVariables }>()

// ── GET /api/v1/license/status ────────────────────────────────────────────────

licenseRouter.get("/license/status", requireAuth(), requireRole("admin"), async (c) => {
  try {
    const state = validateLicense()
    const tier = getLicenseTier()

    // Count active products to report usage vs. limit
    let currentProductCount = 0
    try {
      const products = await listProducts()
      currentProductCount = products.length
    } catch (err) {
      logger.warn({ err }, "Failed to count products for license status")
    }

    // OU usage for the current month
    let ouUsage: { usage: number; limit: number; percent: number } | null = null
    try {
      const raw = await getOuUsage()
      ouUsage = { usage: raw.usage, limit: raw.limit, percent: raw.percent }
    } catch (err) {
      logger.warn({ err }, "Failed to fetch OU usage for license status")
    }

    const payload = state.payload
    const features: string[] = payload?.features ?? []
    const cloudConnected = state.valid && !state.expired

    return c.json({
      ok: true,
      data: {
        valid:           state.valid,
        expired:         state.expired,
        tier:            tier ?? "community",
        productLimit:    payload?.productLimit ?? null,
        currentProducts: currentProductCount,
        features,
        expiresAt:       payload?.expiresAt
          ? (payload.expiresAt === 0 ? null : new Date(payload.expiresAt * 1000).toISOString())
          : null,
        customerId:      payload?.customerId ?? null,
        customerName:    payload?.customerName ?? null,
        statusMessage:   state.statusMessage,
        cloudConnected,
        ouUsage,
      },
    })
  } catch (err) {
    logger.error({ err }, "Failed to retrieve license status")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})
