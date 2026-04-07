/**
 * Dashboard summary endpoint — WAVE-4.
 *
 * GET /api/v1/products/:productId/dashboard
 *   Returns KPI counts and the 15 most recent audit events for the product.
 *   Used by the operator console home screen.
 */

import { Hono } from "hono"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { getDb } from "../../infra/db/client.js"
import { findAuditEvents } from "../../infra/db/repositories/audit-events.js"

export const dashboardRouter = new Hono<{ Variables: AuthVariables }>()

dashboardRouter.get(
  "/products/:productId/dashboard",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")
    const db = getDb()

    const [openCasesRow, pendingApprovalsRow, readyPrDraftsRow, unreadNotificationsRow] =
      await Promise.all([
        db<{ count: string }[]>`
          SELECT count(*)::int AS count FROM cases
          WHERE product_id = ${productId}
            AND status NOT IN ('resolved', 'closed')
        `,
        db<{ count: string }[]>`
          SELECT count(*)::int AS count FROM change_requests
          WHERE product_id = ${productId}
            AND status = 'approval-pending'
        `,
        db<{ count: string }[]>`
          SELECT count(*)::int AS count FROM change_requests
          WHERE product_id = ${productId}
            AND status = 'pr-drafted'
        `,
        db<{ count: string }[]>`
          SELECT count(*)::int AS count FROM notifications
          WHERE product_id = ${productId}
            AND status = 'pending'
        `,
      ])

    const recentActivity = await findAuditEvents(productId, {
      entityType: undefined,
      entityRef: undefined,
      action: undefined,
      limit: 15,
      offset: undefined,
    })

    return c.json({
      kpis: {
        openCases:            Number(openCasesRow[0]?.count ?? 0),
        pendingApprovals:     Number(pendingApprovalsRow[0]?.count ?? 0),
        readyPrDrafts:        Number(readyPrDraftsRow[0]?.count ?? 0),
        unreadNotifications:  Number(unreadNotificationsRow[0]?.count ?? 0),
      },
      recentActivity: recentActivity.map((e) => ({
        id:         e.audit_event_id,
        action:     e.action,
        entityType: e.entity_type,
        entityRef:  e.entity_ref,
        actorType:  e.actor_type,
        actorRef:   e.actor_ref,
        occurredAt: e.occurred_at.toISOString(),
      })),
    })
  },
)
