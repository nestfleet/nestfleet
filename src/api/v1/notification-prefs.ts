// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Notification Preferences API — FEAT-014.
 *
 * Routes:
 *   GET  /api/v1/products/:productId/notification-preferences  — read current prefs
 *   PUT  /api/v1/products/:productId/notification-preferences  — update prefs
 *
 * Auth: requireAuth + requireRole("operator", "admin", "support_lead")
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "../../infra/db/repositories/products.js"
import { logger } from "../../shared/logger.js"

export const notificationPrefsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Schemas ───────────────────────────────────────────────────────────────────

const NotificationPrefsBodySchema = z.object({
  email_disabled_events: z.array(z.string()),
})

// ── GET /api/v1/products/:productId/notification-preferences ──────────────────

notificationPrefsRouter.get(
  "/products/:productId/notification-preferences",
  requireAuth(),
  requireRole("operator", "admin", "support_lead"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const prefs = await getNotificationPreferences(productId)
      return c.json({ data: prefs })
    } catch (err) {
      logger.error({ err, productId }, "Failed to get notification preferences")
      return c.json({ error: "INTERNAL_ERROR", message: "Failed to load notification preferences" }, 500)
    }
  },
)

// ── PUT /api/v1/products/:productId/notification-preferences ──────────────────

notificationPrefsRouter.put(
  "/products/:productId/notification-preferences",
  requireAuth(),
  requireRole("operator", "admin", "support_lead"),
  async (c) => {
    const productId = c.req.param("productId")

    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return c.json({ error: "BAD_REQUEST", message: "Invalid JSON body" }, 400)
    }

    const parsed = NotificationPrefsBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return c.json(
        { error: "VALIDATION_ERROR", message: parsed.error.message },
        422,
      )
    }

    const prefs = parsed.data

    try {
      await setNotificationPreferences(productId, prefs)
      return c.json({ data: prefs })
    } catch (err) {
      logger.error({ err, productId }, "Failed to set notification preferences")
      return c.json({ error: "INTERNAL_ERROR", message: "Failed to save notification preferences" }, 500)
    }
  },
)
