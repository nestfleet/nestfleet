/**
 * Approvals API — SLICE-05.
 *
 * Handles human approval and rejection of change requests that are in the
 * `approval-pending` state. Only `change_lead` and `product_lead` roles may
 * approve or reject.
 *
 * Routes:
 *   POST /api/v1/products/:productId/change-requests/:crId/approve
 *   POST /api/v1/products/:productId/change-requests/:crId/reject
 *   GET  /api/v1/products/:productId/change-requests/pending-approval
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, requireRole, requirePermission } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import {
  findChangeRequestById,
  findChangeRequestsByProduct,
  approveChangeRequest,
  rejectChangeRequest,
  updateChangeRequest,
} from "../../infra/db/repositories/change-requests.js"
import { findCaseById, touchCase } from "../../infra/db/repositories/cases.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { NotificationService } from "../../notifications/index.js"
import { transitionCase } from "../../domain/case-state-machine.js"
import { transitionChangeRequest } from "../../domain/cr-state-machine.js"
import { dispatchInTransaction } from "../../agents/dispatcher.js"
import { withTransaction } from "../../infra/db/transaction.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import { dispatch } from "../../agents/dispatcher.js"
import { newId } from "../../infra/db/id.js"

export const approvalsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Body schemas ──────────────────────────────────────────────────────────────

const ApproveBodySchema = z.object({
  rationale:     z.string().optional(),
  editedContent: z.string().optional(), // DEFERRED-19: Lead's edited proposed_scope
})

const RejectBodySchema = z.object({
  rationale: z.string().min(10, "rationale must be at least 10 characters"),
})

// ── POST /api/v1/products/:productId/change-requests/:crId/approve ────────────

approvalsRouter.post(
  "/products/:productId/change-requests/:crId/approve",
  requireAuth(),
  requirePermission("change_requests:approve"),
  async (c) => {
    const productId = c.req.param("productId")
    const crId      = c.req.param("crId")
    const user      = c.get("user")

    const body = await c.req.json().catch(() => null)
    const parsed = ApproveBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400)
    }
    const rationale     = parsed.data.rationale ?? "Approved."
    const editedContent = parsed.data.editedContent?.trim() || undefined

    try {
      // Load and verify the CR belongs to productId
      const cr = await findChangeRequestById(crId)
      if (!cr) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.product_id !== productId) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.status !== "approval-pending") {
        return c.json(
          { error: "Change request is not in approval-pending status", current_status: cr.status },
          400,
        )
      }

      // DEFERRED-19: If Lead edited the proposed scope, persist it before the
      // PR draft worker runs so the agent uses the corrected version.
      const originalScope = cr.proposed_scope ?? undefined
      if (editedContent && editedContent !== originalScope) {
        await updateChangeRequest(crId, { proposed_scope: editedContent })
      }

      // Transition CR: approval-pending → approved (via state machine guard)
      const roleUsed = user.roles[0] ?? "unknown"
      await transitionChangeRequest(crId, "approval-pending", "approved")

      // Atomic: transition CR approved → implementation-prep + dispatch pr_draft_prep (SLICE-15)
      const prDraftJobId = newId("job_")
      await withTransaction(async (tx) => {
        // 1. CR: approved → implementation-prep (via state machine guard)
        await transitionChangeRequest(crId, "approved", "implementation-prep")

        // 2. Dispatch pr_draft_prep in same transaction
        await dispatchInTransaction(tx, {
          actionType: "pr_draft_prep",
          productId,
          caseId:    cr.case_id,
          jobId:     prDraftJobId,
          payload:   { changeRequestId: crId },
        })
      })

      // Emit audit event (outside tx — append-only, non-fatal)
      await createAuditEvent({
        product_id:  productId,
        entity_type: "change_request",
        entity_ref:  crId,
        actor_type:  "user",
        actor_ref:   user.sub,
        action:      "cr.approved",
        before_state: { status: "approval-pending" },
        after_state:  { status: "implementation-prep" },
        metadata: {
          role_used: roleUsed,
          rationale,
          ...(editedContent && editedContent !== originalScope
            ? { edited: true, before_scope: originalScope, after_scope: editedContent }
            : { edited: false }),
        },
      })

      // Bump case.updated_at so the case surfaces as recently active
      await touchCase(cr.case_id)

      const updatedCr = await findChangeRequestById(crId)
      return c.json({ ok: true, data: updatedCr })
    } catch (err) {
      logger.error({ err, productId, crId }, "Failed to approve change request")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── POST /api/v1/products/:productId/change-requests/:crId/reject ─────────────

approvalsRouter.post(
  "/products/:productId/change-requests/:crId/reject",
  requireAuth(),
  requirePermission("change_requests:reject"),
  async (c) => {
    const productId = c.req.param("productId")
    const crId      = c.req.param("crId")
    const user      = c.get("user")

    const body = await c.req.json().catch(() => null)
    const parsed = RejectBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400)
    }
    const { rationale } = parsed.data

    try {
      // Load and verify the CR belongs to productId
      const cr = await findChangeRequestById(crId)
      if (!cr) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.product_id !== productId) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.status !== "approval-pending") {
        return c.json(
          { error: "Change request is not in approval-pending status", current_status: cr.status },
          400,
        )
      }

      // Reject the CR via state machine guard (approval-pending → rejected)
      await transitionChangeRequest(crId, "approval-pending", "rejected", {
        rejection_rationale: rationale,
      })

      // Update originating case to awaiting-lead so a human can re-triage (guarded)
      const caseRow = await findCaseById(cr.case_id)
      if (caseRow && caseRow.status !== "awaiting-lead") {
        await transitionCase(cr.case_id, caseRow.status, "awaiting-lead")
      }

      // Emit audit event
      const roleUsed = user.roles[0] ?? "unknown"
      await createAuditEvent({
        product_id:  productId,
        entity_type: "change_request",
        entity_ref:  crId,
        actor_type:  "user",
        actor_ref:   user.sub,
        action:      "cr.rejected",
        before_state: { status: "approval-pending" },
        after_state:  { status: "rejected" },
        metadata: {
          role_used: roleUsed,
          rationale,
        },
      })

      // MED-5: Notify support_lead about rejection
      try {
        const product = await findProductById(productId)
        const supportLead = product?.lead_assignments?.["support_lead"]
        if (typeof supportLead === "string" && supportLead.includes("@")) {
          const ns = new NotificationService()
          await ns.emit({
            productId,
            kind: "status_update",
            priority: "high" as const,
            audienceType: "support_lead",
            recipientRef: supportLead,
            sourceType: "change_request",
            sourceRef: crId,
            subject: `Change request rejected: ${cr.title ?? crId}`,
            body: `A change request has been rejected by ${user.email ?? user.sub} (${roleUsed}).\n\nRationale: ${rationale}\n\nThe originating case has been returned to awaiting-lead for re-triage.`,
          })
        }
      } catch (notifErr) {
        logger.warn({ notifErr, crId }, "Failed to send rejection notification (non-fatal)")
      }

      // Re-read CR for response
      const rejectedCr = await findChangeRequestById(crId)
      return c.json({ ok: true, data: rejectedCr })
    } catch (err) {
      logger.error({ err, productId, crId }, "Failed to reject change request")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── GET /api/v1/products/:productId/change-requests/pending-approval ──────────

approvalsRouter.get(
  "/products/:productId/change-requests/pending-approval",
  requireAuth(),
  requireRole("admin", "operator", "change_lead", "product_lead"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const changeRequests = await findChangeRequestsByProduct(productId, {
        status: "approval-pending",
        limit:  50,
        offset: 0,
      })

      return c.json({
        data: changeRequests,
        meta: {
          productId,
          count:  changeRequests.length,
          status: "approval-pending",
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "Failed to list pending-approval change requests")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)
