/**
 * correctTriage — FEAT-015.
 *
 * Service function that allows operators (Lead / Admin) to correct a
 * misclassified case's type and/or severity, cancel any wrong artifacts,
 * and re-inject the case into the pipeline at the triage boundary.
 *
 * Design: re-inject at the triage boundary — the pipeline already knows how
 * to handle a correctly-triaged case, we just give it a second chance with
 * the right input and a triage_hint so the agent does not reclassify.
 */

import { logger } from "../shared/logger.js"
import {
  findCaseById,
  updateCase,
  type CaseType,
  type CaseSeverity,
} from "../infra/db/repositories/cases.js"
import {
  findChangeRequestsByCase,
  updateChangeRequest,
} from "../infra/db/repositories/change-requests.js"
import { createAuditEvent } from "../infra/db/repositories/audit-events.js"
import { dispatch } from "../agents/dispatcher.js"
import { newId } from "../infra/db/id.js"
import { findProductById } from "../infra/db/repositories/products.js"
import { NotificationService } from "../notifications/index.js"

// ── Error ─────────────────────────────────────────────────────────────────────

export class CorrectTriageError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 409,
  ) {
    super(message)
    this.name = "CorrectTriageError"
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CorrectTriageParams {
  caseId:      string
  productId:   string
  actorRef:    string   // operator user ID
  actorName:   string   // for lineage display
  newType?:    CaseType
  newSeverity?: CaseSeverity
  reason:      string
}

export interface CorrectTriageResult {
  caseId:      string
  oldType:     string | null
  newType:     string | null
  oldSeverity: string | null
  newSeverity: string | null
  reason:      string
  crCancelled: boolean
}

// States where correction is blocked (terminal / error states)
const BLOCKED_STATUSES = new Set(["resolved", "processing-failed"])

// CR statuses considered "active" — eligible for cancellation
const ACTIVE_CR_STATUSES = new Set([
  "draft",
  "analysis",
  "approval-pending",
  "approved",
  "implementation-prep",
  "pr-drafted",
])

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Correct the type and/or severity of a misclassified case.
 *
 * 1. Validates inputs and case state.
 * 2. Cancels any active change request (best-effort notification to Change Lead).
 * 3. Updates the case: type, severity, status → triaged.
 * 4. Writes a `case.triage_corrected` audit event.
 * 5. Dispatches a `known_issue_match` job with a triage_hint payload.
 *
 * @throws CorrectTriageError with statusCode 400 | 404 | 409
 */
export async function correctTriage(params: CorrectTriageParams): Promise<CorrectTriageResult> {
  const { caseId, productId, actorRef, actorName, newType, newSeverity, reason } = params

  // ── Input validation ─────────────────────────────────────────────────────
  if (!reason || reason.trim().length === 0) {
    throw new CorrectTriageError("reason is required", 400)
  }

  if (newType === undefined && newSeverity === undefined) {
    throw new CorrectTriageError("At least one of type or severity must be provided", 400)
  }

  // ── Load case ────────────────────────────────────────────────────────────
  const caseRow = await findCaseById(caseId)
  if (!caseRow || caseRow.product_id !== productId) {
    throw new CorrectTriageError("Case not found", 404)
  }

  // ── State gate ───────────────────────────────────────────────────────────
  if (BLOCKED_STATUSES.has(caseRow.status)) {
    throw new CorrectTriageError(
      `Cannot correct triage on a case with status '${caseRow.status}'`,
      409,
    )
  }

  const oldType     = caseRow.type
  const oldSeverity = caseRow.severity

  // ── Cancel active CRs ────────────────────────────────────────────────────
  let crCancelled = false
  const crs = await findChangeRequestsByCase(caseId)
  const activeCrs = crs.filter((cr) => ACTIVE_CR_STATUSES.has(cr.status))

  for (const cr of activeCrs) {
    await updateChangeRequest(cr.change_request_id, {
      status:               "rejected",
      rejection_rationale:  `Triage correction by ${actorName} — original triage was incorrect. Reason: ${reason}`,
      rejected_at:          new Date(),
    })
    crCancelled = true
    logger.info(
      { caseId, crId: cr.change_request_id, actorRef },
      "CR cancelled due to triage correction",
    )
  }

  // ── Notify Change Lead (best-effort, non-fatal) ───────────────────────────
  if (crCancelled) {
    try {
      const product = await findProductById(productId)
      const changeLead = product?.lead_assignments?.["change_lead"]
      if (typeof changeLead === "string" && changeLead.includes("@")) {
        const ns = new NotificationService()
        await ns.emit({
          productId,
          kind:         "escalation_alert",
          priority:     "high",
          audienceType: "change_lead",
          recipientRef: changeLead,
          sourceType:   "case",
          sourceRef:    caseId,
          subject:      `Change Request cancelled — triage correction on case ${caseId}`,
          body: [
            `A change request linked to case ${caseId} was cancelled because an operator corrected the triage classification.`,
            ``,
            `Corrected by: ${actorName}`,
            `Reason: ${reason}`,
            ``,
            `The case has been reset to triaged and the pipeline will re-run with the corrected classification.`,
          ].join("\n"),
        })
      }
    } catch (notifyErr) {
      logger.warn({ notifyErr, caseId }, "Change Lead notification failed (non-fatal)")
    }
  }

  // ── Update case ──────────────────────────────────────────────────────────
  await updateCase(caseId, {
    ...(newType     !== undefined ? { type: newType }         : {}),
    ...(newSeverity !== undefined ? { severity: newSeverity } : {}),
    status: "triaged",
  })

  const resolvedType     = newType     ?? oldType
  const resolvedSeverity = newSeverity ?? oldSeverity

  // ── Audit event ──────────────────────────────────────────────────────────
  await createAuditEvent({
    product_id:   productId,
    entity_type:  "case",
    entity_ref:   caseId,
    actor_type:   "lead",
    actor_ref:    actorRef,
    action:       "case.triage_corrected",
    before_state: { type: oldType, severity: oldSeverity, status: caseRow.status },
    after_state:  { type: resolvedType, severity: resolvedSeverity, status: "triaged" },
    metadata: {
      oldType,
      newType:     resolvedType,
      oldSeverity,
      newSeverity: resolvedSeverity,
      reason,
      crCancelled,
      correctedBy: actorName,
    },
  })

  // ── Dispatch pipeline job with triage_hint ────────────────────────────────
  const jobId      = newId("job_")
  const signalText = caseRow.signal_text ?? caseRow.title ?? ""

  await dispatch({
    actionType: "known_issue_match",
    productId,
    caseId,
    jobId,
    payload: {
      signalText,
      triage_hint: {
        type:     resolvedType,
        severity: resolvedSeverity,
        reason,
        operator: actorName,
      },
    },
  })

  logger.info(
    { caseId, productId, oldType, newType: resolvedType, oldSeverity, newSeverity: resolvedSeverity, crCancelled, actorRef },
    "Triage correction applied — pipeline re-dispatched",
  )

  return {
    caseId,
    oldType:     oldType     ?? null,
    newType:     resolvedType ?? null,
    oldSeverity: oldSeverity  ?? null,
    newSeverity: resolvedSeverity ?? null,
    reason,
    crCancelled,
  }
}
