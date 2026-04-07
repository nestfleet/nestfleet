/**
 * Retention API — CG-03.
 *
 * Implements GDPR Article 5(1)(e) storage limitation and Article 17 right to erasure.
 * Deletion propagates through all linked data with audit events anonymised (not deleted)
 * to preserve auditability while removing PII.
 *
 * Routes:
 *   DELETE /api/v1/products/:productId/cases/:caseId          — delete one case + all linked data
 *   POST   /api/v1/products/:productId/retention/run           — sweep all cases past retention window
 *
 * Auth: requireRole("admin") — destructive operations, admin only.
 */

import { Hono } from "hono"
import { logger } from "../../shared/logger.js"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { findCaseById } from "../../infra/db/repositories/cases.js"
import { getDb } from "../../infra/db/client.js"
import { withTransaction } from "../../infra/db/transaction.js"

export const retentionRouter = new Hono<{ Variables: AuthVariables }>()

// ── Deletion summary type ─────────────────────────────────────────────────────

interface DeletionSummary {
  caseId: string
  notificationsDeleted: number
  signalsDeleted: number
  conversationsDeleted: number
  changeRequestsDeleted: number
  auditEventsAnonymised: number
  caseDeleted: boolean
}

// ── Core deletion logic ───────────────────────────────────────────────────────

async function deleteCase(productId: string, caseId: string): Promise<DeletionSummary> {
  const caseRow = await findCaseById(caseId)
  if (!caseRow || caseRow.product_id !== productId) {
    throw Object.assign(new Error("Case not found"), { status: 404 })
  }

  const conversationIds: string[] = caseRow.conversation_ids ?? []

  return withTransaction(async (tx) => {
    // 1. Count + delete notifications linked to this case
    const [notifCount] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM notifications
      WHERE product_id = ${productId} AND source_ref = ${caseId}
    `
    await tx`DELETE FROM notifications WHERE product_id = ${productId} AND source_ref = ${caseId}`

    // 2. Count + delete signals linked to this case
    const [sigCount] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM signals
      WHERE product_id = ${productId} AND case_id = ${caseId}
    `
    await tx`DELETE FROM signals WHERE product_id = ${productId} AND case_id = ${caseId}`

    // 3. Count + delete conversations linked to this case
    let convCount = 0
    if (conversationIds.length > 0) {
      const [cv] = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count FROM conversations
        WHERE product_id = ${productId}
          AND conversation_id = ANY(${tx.array(conversationIds)})
      `
      convCount = cv?.count ?? 0
      await tx`
        DELETE FROM conversations
        WHERE product_id = ${productId}
          AND conversation_id = ANY(${tx.array(conversationIds)})
      `
    }

    // 4. Count + delete change requests linked to this case
    const [crCount] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM change_requests
      WHERE product_id = ${productId} AND case_id = ${caseId}
    `
    await tx`DELETE FROM change_requests WHERE product_id = ${productId} AND case_id = ${caseId}`

    // 5. Anonymise audit events — keep the audit trail but scrub PII payloads
    const [aeCount] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_events
      WHERE product_id = ${productId} AND entity_ref = ${caseId}
    `
    await tx`
      UPDATE audit_events
      SET
        before_state = NULL,
        after_state  = NULL,
        metadata     = jsonb_build_object('_anonymised', true, '_anonymised_at', now()::text)
      WHERE product_id = ${productId} AND entity_ref = ${caseId}
    `

    // 6. Delete the case itself
    await tx`DELETE FROM cases WHERE product_id = ${productId} AND case_id = ${caseId}`

    return {
      caseId,
      notificationsDeleted:  notifCount?.count ?? 0,
      signalsDeleted:        sigCount?.count ?? 0,
      conversationsDeleted:  convCount,
      changeRequestsDeleted: crCount?.count ?? 0,
      auditEventsAnonymised: aeCount?.count ?? 0,
      caseDeleted:           true,
    } satisfies DeletionSummary
  })
}

// ── DELETE /api/v1/products/:productId/cases/:caseId ─────────────────────────

retentionRouter.delete(
  "/products/:productId/cases/:caseId",
  requireAuth(),
  requireRole("admin"),
  async (c) => {
    const productId = c.req.param("productId")
    const caseId    = c.req.param("caseId")
    const actor     = c.get("user")

    try {
      const product = await findProductById(productId)
      if (!product) return c.json({ error: "Product not found" }, 404)

      const summary = await deleteCase(productId, caseId)
      logger.info({ productId, caseId, actor: actor.email, summary }, "CG-03: Case deleted with propagation")
      return c.json({ ok: true, data: summary })
    } catch (err: unknown) {
      if (err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 404) {
        return c.json({ error: "Case not found" }, 404)
      }
      logger.error({ err, productId, caseId }, "CG-03: Failed to delete case")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── POST /api/v1/products/:productId/retention/run ───────────────────────────

retentionRouter.post(
  "/products/:productId/retention/run",
  requireAuth(),
  requireRole("admin"),
  async (c) => {
    const productId = c.req.param("productId")
    const actor     = c.get("user")

    try {
      const product = await findProductById(productId)
      if (!product) return c.json({ error: "Product not found" }, 404)

      const policy = (product.support_policy ?? {}) as Record<string, unknown>
      const retentionDays = typeof policy.retentionDays === "number" ? policy.retentionDays : 365

      const db = getDb()
      const expiredCases = await db<{ case_id: string }[]>`
        SELECT case_id FROM cases
        WHERE product_id = ${productId}
          AND status = 'closed'
          AND closed_at IS NOT NULL
          AND closed_at < now() - (${retentionDays} || ' days')::interval
        ORDER BY closed_at ASC
      `

      const results: DeletionSummary[] = []
      const errors: { caseId: string; error: string }[] = []

      for (const { case_id } of expiredCases) {
        try {
          results.push(await deleteCase(productId, case_id))
        } catch (err) {
          errors.push({ caseId: case_id, error: String(err) })
          logger.error({ err, productId, caseId: case_id }, "CG-03: Retention sweep failed for case")
        }
      }

      const sweepSummary = {
        retentionDays,
        casesFound:   expiredCases.length,
        casesDeleted: results.length,
        errors:       errors.length,
        details:      results,
        ...(errors.length > 0 ? { errorDetails: errors } : {}),
      }

      logger.info({ productId, actor: actor.email, ...sweepSummary }, "CG-03: Retention sweep complete")
      return c.json({ ok: true, data: sweepSummary })
    } catch (err) {
      logger.error({ err, productId }, "CG-03: Retention sweep failed")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)
