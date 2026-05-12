// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * PR Drafts API — SLICE-06.
 *
 * Operator view and handoff for PR draft artifacts produced by the
 * pr_draft_prep agent for approved change requests.
 *
 * Routes:
 *   GET  /api/v1/products/:productId/change-requests/pr-drafted          — list active PR drafts
 *   GET  /api/v1/products/:productId/change-requests/:crId/pr-draft      — single PR draft detail
 *   POST /api/v1/products/:productId/change-requests/:crId/complete      — mark PR draft accepted
 *
 * Auth: requireAuth() — operator must hold a valid JWT.
 */

import { Hono } from "hono"
import { requireAuth, requireRole, requirePermission } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import {
  findChangeRequestById,
  findChangeRequestsByProduct,
} from "../../infra/db/repositories/change-requests.js"
import { findCaseById, touchCase } from "../../infra/db/repositories/cases.js"
import { transitionCase } from "../../domain/case-state-machine.js"
import { transitionChangeRequest } from "../../domain/cr-state-machine.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { NotificationService } from "../../notifications/index.js"
import { incrementOu } from "../../billing/ou-tracker.js"

export const prDraftsRouter = new Hono<{ Variables: AuthVariables }>()

// ── GET /api/v1/products/:productId/change-requests/pr-drafted ────────────────
// NOTE: literal route — must be registered before /:crId/pr-draft wildcard

prDraftsRouter.get(
  "/products/:productId/change-requests/pr-drafted",
  requireAuth(),
  requireRole("admin", "operator", "support_lead", "change_lead", "product_lead"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      // Return CRs that are in-flight (implementation-prep) or ready for review (pr-drafted)
      const [inPrep, prDrafted] = await Promise.all([
        findChangeRequestsByProduct(productId, { status: "implementation-prep", limit: 50, offset: 0 }),
        findChangeRequestsByProduct(productId, { status: "pr-drafted",          limit: 50, offset: 0 }),
      ])

      const changeRequests = [...inPrep, ...prDrafted].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )

      return c.json({
        data: changeRequests,
        meta: { productId, count: changeRequests.length },
      })
    } catch (err) {
      logger.error({ err, productId }, "Failed to list PR-drafted change requests")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── GET /api/v1/products/:productId/change-requests/:crId/pr-draft ─────────────

prDraftsRouter.get(
  "/products/:productId/change-requests/:crId/pr-draft",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")
    const crId = c.req.param("crId")

    try {
      const cr = await findChangeRequestById(crId)

      if (!cr) {
        return c.json({ error: "Change request not found" }, 404)
      }

      if (cr.product_id !== productId) {
        return c.json({ error: "Change request not found" }, 404)
      }

      return c.json({ data: cr })
    } catch (err) {
      logger.error({ err, productId, crId }, "Failed to fetch PR draft")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── POST /api/v1/products/:productId/change-requests/:crId/complete ────────────

prDraftsRouter.post(
  "/products/:productId/change-requests/:crId/complete",
  requireAuth(),
  requirePermission("pr_drafts:push"),
  async (c) => {
    const productId = c.req.param("productId")
    const crId      = c.req.param("crId")
    const user      = c.get("user")

    try {
      const cr = await findChangeRequestById(crId)

      if (!cr) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.product_id !== productId) {
        return c.json({ error: "Change request not found" }, 404)
      }
      if (cr.status !== "pr-drafted") {
        return c.json(
          { error: "Change request is not in pr-drafted status", current_status: cr.status },
          400,
        )
      }

      // Transition CR → completed (via state machine guard)
      await transitionChangeRequest(crId, "pr-drafted", "completed", {
        completed_at: new Date(),
      })

      // Transition originating case → resolved (if not already terminal)
      // Always touch updated_at so the case surfaces as recently active
      // in list views regardless of whether the status changed.
      const caseRow = await findCaseById(cr.case_id)
      if (caseRow) {
        if (caseRow.status !== "resolved" && caseRow.status !== "closed") {
          await transitionCase(cr.case_id, caseRow.status, "resolved", { current_persona: "steward" })
          await createAuditEvent({
            product_id:   productId,
            entity_type:  "case",
            entity_ref:   cr.case_id,
            actor_type:   "user",
            actor_ref:    user.sub,
            action:       "case.resolved",
            before_state: { status: caseRow.status },
            after_state:  { status: "resolved" },
            metadata:     { reason: "pr_draft_accepted", changeRequestId: crId },
          })
        } else {
          // Case already resolved — bump updated_at so "Last Event" column
          // reflects this CR completion, not the earlier resolution time.
          await touchCase(cr.case_id)
        }
      }

      // Audit CR completion
      await createAuditEvent({
        product_id:   productId,
        entity_type:  "change_request",
        entity_ref:   crId,
        actor_type:   "user",
        actor_ref:    user.sub,
        action:       "cr.completed",
        before_state: { status: "pr-drafted" },
        after_state:  { status: "completed" },
        metadata:     { role_used: user.roles[0] ?? "operator" },
      })

      // BIL-03: record OU event (best-effort, non-blocking)
      incrementOu({ productId, eventType: "cr.completed", entityRef: crId }).catch(() => {})

      // ── Notify change lead that CR is completed ─────────────────────────────
      try {
        const product     = await findProductById(productId)
        const changeLead  = product?.lead_assignments?.["change_lead"]
        const supportLead = product?.lead_assignments?.["support_lead"]
        const recipient   = typeof changeLead  === "string" && changeLead.includes("@")  ? changeLead
                          : typeof supportLead === "string" && supportLead.includes("@") ? supportLead
                          : null

        if (recipient) {
          const ns = new NotificationService()
          await ns.emit({
            productId,
            kind:         "status_update",
            priority:     "normal",
            audienceType: "change_lead",
            recipientRef: recipient,
            sourceType:   "change_request",
            sourceRef:    crId,
            subject:      `CR completed — ${cr.title ?? crId}`,
            body: [
              `Change request ${crId} has been accepted and marked complete.`,
              ``,
              `Case:      ${cr.case_id}`,
              `Risk:      ${cr.risk_level}`,
              `Accepted by: ${user.email}`,
              ...(cr.github_pr_url ? [`GitHub PR: ${cr.github_pr_url}`] : []),
            ].join("\n"),
            ackRequired: false,
          })
        }
      } catch (notifErr) {
        logger.warn({ notifErr, crId }, "CR-completed notification failed (non-fatal)")
      }

      const updatedCr = await findChangeRequestById(crId)
      return c.json({ ok: true, data: updatedCr })
    } catch (err) {
      logger.error({ err, productId, crId }, "Failed to complete change request")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)
