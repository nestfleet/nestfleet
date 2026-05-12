// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Notifications API — SLICE-07 + SLICE-09.
 *
 * Routes:
 *   GET  /api/v1/products/:productId/notifications                          — list with filters
 *   POST /api/v1/products/:productId/notifications/:notificationId/ack      — acknowledge
 *   GET  /api/v1/products/:productId/notifications/metrics                  — health KPIs
 *   POST /api/v1/internal/run-escalations                                   — escalation runner (cron)
 */

import { Hono } from "hono"
import { config } from "../../shared/config.js"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import {
  findNotificationsByProduct,
  ackNotification,
  getNotificationMetrics,
} from "../../infra/db/repositories/notifications.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import { runEscalations } from "../../notifications/escalation-runner.js"

export const notificationsRouter = new Hono<{ Variables: AuthVariables }>()

// ── GET /api/v1/products/:productId/notifications ─────────────────────────────

notificationsRouter.get(
  "/products/:productId/notifications",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")

    const statusParam   = c.req.query("status")   ?? undefined
    const kindParam     = c.req.query("kind")      ?? undefined
    const priorityParam = c.req.query("priority")  ?? undefined

    const rawLimit  = parseInt(c.req.query("limit")  ?? "50",  10)
    const rawOffset = parseInt(c.req.query("offset") ?? "0",   10)
    const limit     = isNaN(rawLimit)  ? 50  : Math.min(Math.max(rawLimit,  1), 200)
    const offset    = isNaN(rawOffset) ? 0   : Math.max(rawOffset, 0)

    try {
      const notifications = await findNotificationsByProduct(productId, {
        ...(statusParam   !== undefined ? { status:   statusParam }   : {}),
        ...(kindParam     !== undefined ? { kind:     kindParam }     : {}),
        ...(priorityParam !== undefined ? { priority: priorityParam } : {}),
        limit,
        offset,
      })

      return c.json({
        data: notifications,
        meta: {
          productId,
          count:   notifications.length,
          limit,
          offset,
          filters: {
            status:   statusParam ?? null,
            kind:     kindParam   ?? null,
            priority: priorityParam ?? null,
          },
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "Failed to list notifications")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── POST /api/v1/products/:productId/notifications/:notificationId/ack ────────

notificationsRouter.post(
  "/products/:productId/notifications/:notificationId/ack",
  requireAuth(),
  async (c) => {
    const productId      = c.req.param("productId")
    const notificationId = c.req.param("notificationId")
    const user           = c.get("user")

    try {
      const updated = await ackNotification(notificationId, user.sub)
      if (!updated) {
        return c.json({ error: "Notification not found" }, 404)
      }

      // Emit audit event for the acknowledgement
      await createAuditEvent({
        product_id:  productId,
        entity_type: "notification",
        entity_ref:  notificationId,
        action:      "notification.acknowledged",
        actor_type:  "operator",
        actor_ref:   user.sub,
        metadata:    { notification_id: notificationId, acked_by: user.sub },
      })

      logger.info({ productId, notificationId, acked_by: user.sub }, "Notification acknowledged")
      return c.json({ data: updated })
    } catch (err) {
      logger.error({ err, productId, notificationId }, "Failed to acknowledge notification")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── GET /api/v1/products/:productId/notifications/metrics ─────────────────────

notificationsRouter.get(
  "/products/:productId/notifications/metrics",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const metrics = await getNotificationMetrics(productId)
      return c.json({ data: metrics, meta: { productId } })
    } catch (err) {
      logger.error({ err, productId }, "Failed to compute notification metrics")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── POST /api/v1/internal/run-escalations ─────────────────────────────────────
// Internal endpoint — no auth, callable from cron / pg_boss job.

notificationsRouter.post(
  "/internal/run-escalations",
  async (c) => {
    const secret   = config.INTERNAL_CRON_SECRET
    const provided = c.req.header("X-Internal-Secret")
    if (!secret || provided !== secret) return c.json({ error: "unauthorized" }, 401)

    try {
      const result = await runEscalations()
      return c.json({ ok: true, ...result })
    } catch (err) {
      logger.error({ err }, "Escalation run failed")
      return c.json({ error: "Escalation run failed" }, 500)
    }
  },
)
