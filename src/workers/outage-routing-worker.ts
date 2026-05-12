// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * OutageRoutingWorker — SLICE-17.
 *
 * Dedicated worker on the 'outage_routing' queue. Replaces the inline
 * `runOutageRoutingAgent()` call that was previously inside StewardWorker.
 *
 * Receives job data: { caseId, productId, payload: { signalText, reportedAt } }
 *
 * On success: creates audit event `case.outage_routed`, emits notifications
 * to leads per SA Review #3 rules (critical/high → all leads, normal/low → support_lead only).
 *
 * On failure: creates audit event with error, emits critical notification to
 * all leads (routing failure is itself an escalation trigger per ADR-029).
 *
 * Uses independent OTel span — not a child of the steward span.
 *
 * Idempotency (QE-02): The outage routing worker is a side-effect actor (audit
 * events + notifications) — it does not own a state transition. The idempotency
 * guard skips execution when the case has reached a terminal state (resolved or
 * closed), indicating a previous run or human action has already handled it.
 */

import { AbstractAgentWorker, type WorkerExecuteContext, type WorkerExecuteResult } from "../agents/worker.js"
import { runOutageRoutingAgent, OUTAGE_ROUTING_SCHEMA_VERSION } from "../agents/impl/outage-routing.js"
import {
  findCaseById,
  findProductById,
  createAuditEvent,
} from "../infra/db/repositories/index.js"
import { NotificationService } from "../notifications/index.js"
import { logger } from "../shared/logger.js"

export class OutageRoutingWorker extends AbstractAgentWorker {
  readonly actionType = "outage_routing" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job, caseId } = ctx

    if (!caseId) {
      throw new Error("OutageRoutingWorker: job missing caseId")
    }

    const caseRow = await findCaseById(caseId)
    if (!caseRow) {
      throw new Error(`OutageRoutingWorker: case not found: ${caseId}`)
    }

    // ── Idempotency guard (QE-02) ─────────────────────────────────────────────
    // OutageRoutingWorker is a side-effect actor (audit + notifications) and does
    // not own a state transition. Skip if the case is already in a terminal state —
    // a previous execution or human action has already handled resolution.
    const TERMINAL_STATES = ["resolved", "closed"] as const
    type TerminalState = (typeof TERMINAL_STATES)[number]
    if ((TERMINAL_STATES as readonly string[]).includes(caseRow.status)) {
      logger.info(
        { caseId, status: caseRow.status },
        "OutageRoutingWorker: case already in terminal state — skipping (idempotent retry)",
      )
      return {
        outcome:             "abstain",
        abstainReason:       "case_in_terminal_state",
        modelId:             "none",
        outputSchemaVersion: OUTAGE_ROUTING_SCHEMA_VERSION,
        outputValid:         false,
      }
    }

    const productId    = caseRow.product_id
    const caseSeverity = caseRow.severity
    const payload      = job.data.payload ?? {}
    const signalText   = caseRow.signal_text ?? (payload["signalText"] as string | undefined) ?? caseRow.title ?? ""
    const reportedAt   = (payload["reportedAt"] as string | undefined) ?? caseRow.created_at.toISOString()
    const jobId        = job.data.jobId

    // ── Run outage routing agent ───────────────────────────────────────────
    let routingTeam: string | undefined
    let immediateActions: string[] | undefined
    let modelId   = "unknown"
    let inputTokens  = 0
    let outputTokens = 0
    let durationMs   = 0
    let traceId: string | undefined

    try {
      const result = await runOutageRoutingAgent({
        productId,
        caseId,
        jobId,
        outageDescription: signalText,
        reportedAt,
      })

      routingTeam      = result.output.routingTeam
      immediateActions = result.output.immediateActions
      modelId          = result.modelId
      inputTokens      = result.usage.inputTokens
      outputTokens     = result.usage.outputTokens
      durationMs       = result.durationMs
      traceId          = result.traceId

      // ── Success audit event ────────────────────────────────────────────
      await createAuditEvent({
        product_id:   productId,
        entity_type:  "case",
        entity_ref:   caseId,
        actor_type:   "agent",
        actor_ref:    "outage_routing/dedicated",
        action:       "case.outage_routed",
        before_state: { status: caseRow.status },
        after_state:  { status: caseRow.status },
        metadata:     { routingTeam, immediateActions },
      })

    } catch (err) {
      // ── Failure: escalation trigger (ADR-029) ──────────────────────────
      logger.error({ err, caseId, productId }, "Outage routing agent failed — escalating to all leads")

      await createAuditEvent({
        product_id:   productId,
        entity_type:  "case",
        entity_ref:   caseId,
        actor_type:   "agent",
        actor_ref:    "outage_routing/dedicated",
        action:       "case.outage_routing_failed",
        before_state: { status: caseRow.status },
        after_state:  { status: caseRow.status },
        metadata:     { error: String(err) },
      })

      // Notify all leads on failure
      try {
        const product = await findProductById(productId)
        const ns = new NotificationService()
        for (const role of ["support_lead", "product_lead", "change_lead"] as const) {
          const leadEmail = product?.lead_assignments?.[role]
          if (typeof leadEmail === "string" && leadEmail.includes("@")) {
            await ns.emit({
              productId,
              kind:         "escalation_alert",
              priority:     "critical",
              audienceType: role,
              recipientRef: leadEmail,
              sourceType:   "case",
              sourceRef:    caseId,
              subject:      `[OUTAGE] Routing agent failed — ${caseRow.title ?? "(no subject)"}`,
              body:         `Outage routing agent failed for case ${caseId}. Manual intervention required.\n\nError: ${String(err)}`,
              ackRequired:  true,
            })
          }
        }
      } catch (notifyErr) {
        logger.error({ notifyErr, caseId }, "Failed to send outage routing failure notification")
      }

      // Still return success to mark the job as handled (failure is escalated, not retried)
      return {
        outcome:             "error" as const,
        modelId,
        inputTokens:         0,
        outputTokens:        0,
        durationMs:          0,
        outputSchemaVersion: OUTAGE_ROUTING_SCHEMA_VERSION,
        outputValid:         false,
        outputSnapshot:      { error: String(err) },
      }
    }

    // ── Notifications: critical/high outages → all leads, normal/low → support_lead only ──
    const isHighOrCritical = caseSeverity === "critical" || caseSeverity === "high"
    try {
      const product = await findProductById(productId)
      const ns = new NotificationService()
      const notificationBody = [
        `Outage routing completed for case ${caseId} (${product?.name ?? productId}).`,
        ``,
        `Routing team:      ${routingTeam ?? "unassigned"}`,
        `Immediate actions: ${immediateActions?.join(", ") ?? "none"}`,
        `Severity:          ${caseSeverity}`,
      ].join("\n")

      const leadRoles = isHighOrCritical
        ? ["support_lead", "product_lead", "change_lead"] as const
        : ["support_lead"] as const

      for (const role of leadRoles) {
        const leadEmail = product?.lead_assignments?.[role]
        if (typeof leadEmail === "string" && leadEmail.includes("@")) {
          await ns.emit({
            productId,
            kind:         "status_update",
            priority:     isHighOrCritical ? "high" : "normal",
            audienceType: role,
            recipientRef: leadEmail,
            sourceType:   "case",
            sourceRef:    caseId,
            subject:      `[OUTAGE] Routing complete — ${caseRow.title ?? "(no subject)"}`,
            body:         notificationBody,
            ackRequired:  isHighOrCritical,
          })
        }
      }
    } catch (notifyErr) {
      logger.warn({ notifyErr, caseId }, "Outage routing notification failed (non-fatal)")
    }

    return {
      outcome:             "success",
      modelId,
      inputTokens,
      outputTokens,
      durationMs,
      outputSchemaVersion: OUTAGE_ROUTING_SCHEMA_VERSION,
      outputValid:         true,
      outputSnapshot:      { routingTeam, immediateActions },
      ...(traceId ? { otelTraceId: traceId } : {}),
    }
  }
}

/** Singleton instance — registered once at startup. */
export const outageRoutingWorker = new OutageRoutingWorker()
