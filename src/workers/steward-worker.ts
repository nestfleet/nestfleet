/**
 * StewardWorker — SLICE-02.
 *
 * Listens on the 'known_issue_match' queue. For each triaged case:
 *   1. Loads case + triage output from DB
 *   2. Runs runKnownIssueMatchAgent() — check for known issue match
 *   3. For outage_report: dispatches dedicated outage_routing job → always awaiting-lead
 *   4. Makes routing decision based on case type + severity + match result:
 *        critical severity         → awaiting-lead  (policy: human required)
 *        outage_report             → awaiting-lead  (after outage routing)
 *        bug_report + no match     → in-change      (create change request)
 *        bug_report + known match  → in-resolution  (known fix/workaround)
 *        user_request              → in-resolution  (auto-reply in SLICE-04)
 *        user_feedback             → in-resolution  (acknowledge + route)
 *   5. Creates change request record for in-change cases
 *   6. Updates case status + current_persona
 *   7. Emits audit event: case.routed
 *   8. Sends operator notification for critical/awaiting-lead transitions
 *
 * The Steward persona owns the triaged → {in-resolution, awaiting-lead, in-change} path.
 * Auto-reply (in-resolution) is dispatched in SLICE-04.
 */

import { AbstractAgentWorker, type WorkerExecuteContext, type WorkerExecuteResult } from "../agents/worker.js"
import { runKnownIssueMatchAgent, KNOWN_ISSUE_MATCH_SCHEMA_VERSION } from "../agents/impl/known-issue-match.js"
import {
  findCaseById,
  createAuditEvent,
  createChangeRequest,
  findProductById,
} from "../infra/db/repositories/index.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { transitionAndDispatch } from "../domain/transactional-dispatch.js"
import { newId } from "../infra/db/id.js"
import { NotificationService } from "../notifications/index.js"
import { dispatch } from "../agents/dispatcher.js"
import { logger } from "../shared/logger.js"
import { getLicenseTier } from "../license/validator.js"
import { licenseToProductTier } from "../rbac/permission-engine.js"
import { meetsMinTier } from "../auth/middleware.js"
import type { CaseType, CaseSeverity } from "../infra/db/repositories/cases.js"

// ── Outage-signal predicate ───────────────────────────────────────────────────

/**
 * BEF-09: Terms that indicate an active outage even when the case was classified
 * as a non-outage type (e.g. user_request). When severity=critical AND any of
 * these terms appear in the signal text, outage_routing is dispatched so the
 * on-call lead is notified via the same path as a formal outage_report.
 */
const OUTAGE_SIGNAL_TERMS = [
  "outage", "down", "unavailable", "not responding", "service disruption",
  "all users", "everyone affected", "production down", "site down", "api down",
  "cannot access", "can't access", "total failure", "complete failure",
]

export function hasOutageSignals(signalText: string): boolean {
  const lower = signalText.toLowerCase()
  return OUTAGE_SIGNAL_TERMS.some(term => lower.includes(term))
}

// ── Infra-debt sidecar predicate ──────────────────────────────────────────────

/**
 * Labels that indicate an underlying infrastructure or systemic issue.
 * When a bug_report auto-resolves (known issue path) and any of these labels
 * are present, the Steward creates a side-car draft CR so the debt is tracked
 * even though the user received a workaround answer.
 */
const INFRA_LABELS = new Set([
  "performance", "scaling", "infrastructure", "timeout", "worker",
  "capacity", "memory", "latency", "queue", "throughput",
])

/**
 * Returns true when a side-car draft CR should be created alongside an
 * auto-resolution. Only applies to bug_report cases with infra-signal labels.
 * user_request, user_feedback, sales_inquiry, and config/how-to cases are
 * explicitly excluded — no approval burden is created for those.
 */
export function shouldCreateSidecarCr(
  caseType: CaseType | null,
  labels: string[],
): boolean {
  if (caseType !== "bug_report") return false
  const lower = labels.map(l => l.toLowerCase())
  return lower.some(l => INFRA_LABELS.has(l))
}

// ── Routing decision ──────────────────────────────────────────────────────────

type RoutingDecision =
  | { nextStatus: "awaiting-lead"; reason: string }
  | { nextStatus: "in-resolution"; reason: string }
  | { nextStatus: "in-change"; reason: string; createChangeRequest: true }

function decideRouting(
  caseType: CaseType | null,
  severity: CaseSeverity | null,
  knownIssueMatched: boolean,
  knownIssueConfidence: number,
): RoutingDecision {
  // Critical severity always requires human judgment regardless of type
  if (severity === "critical") {
    return { nextStatus: "awaiting-lead", reason: "critical_severity_requires_lead" }
  }

  // Outage reports: routed by outage_routing agent (caller transitions to awaiting-lead)
  if (caseType === "outage_report") {
    return { nextStatus: "awaiting-lead", reason: "outage_always_escalates" }
  }

  // Bug report: known issue with high confidence → direct resolution path
  if (caseType === "bug_report" && knownIssueMatched && knownIssueConfidence >= 0.80) {
    return { nextStatus: "in-resolution", reason: "bug_known_issue_match" }
  }

  // Bug report: no known issue → engineering change required
  if (caseType === "bug_report") {
    return { nextStatus: "in-change", reason: "bug_no_known_issue", createChangeRequest: true }
  }

  // User request → direct resolution (auto-reply in SLICE-04)
  if (caseType === "user_request") {
    return { nextStatus: "in-resolution", reason: "user_request_direct_resolution" }
  }

  // User feedback → acknowledge and route to resolution
  if (caseType === "user_feedback") {
    return { nextStatus: "in-resolution", reason: "user_feedback_acknowledged" }
  }

  // Fallback: escalate unknown/null types to lead
  return { nextStatus: "awaiting-lead", reason: "unknown_case_type_escalated" }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export class StewardWorker extends AbstractAgentWorker {
  readonly actionType = "known_issue_match" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job, caseId } = ctx

    // ── 1. Load case ──────────────────────────────────────────────────────────
    if (!caseId) {
      throw new Error("StewardWorker: job missing caseId")
    }

    const caseRow = await findCaseById(caseId)
    if (!caseRow) {
      throw new Error(`StewardWorker: case not found: ${caseId}`)
    }

    // ── Idempotency guard (QE-02) ─────────────────────────────────────────────
    // pg-boss retries re-deliver the job. If the case already advanced past
    // "triaged" a previous execution completed — skip.
    if (caseRow.status !== "triaged") {
      logger.info(
        { caseId, status: caseRow.status },
        "StewardWorker: case already past triaged — skipping (idempotent retry)",
      )
      return {
        outcome:             "abstain",
        abstainReason:       "already_past_entry_state",
        modelId:             "none",
        outputSchemaVersion: KNOWN_ISSUE_MATCH_SCHEMA_VERSION,
        outputValid:         false,
      }
    }

    const productId = caseRow.product_id

    // ── 2. Get signal text — prefer authoritative cases.signal_text (SA #7 fix)
    const payload = job.data.payload ?? {}
    const sessionId  = payload["sessionId"] as string | undefined   // CHAT-UX-01 (a)
    const signalText =
      caseRow.signal_text ??
      (payload["signalText"] as string | undefined) ??
      caseRow.title ??
      ""

    if (!signalText) {
      throw new Error(`StewardWorker: no signal text available for case ${caseId}`)
    }

    const caseType     = caseRow.type
    const caseSeverity = caseRow.severity
    const jobId        = job.data.jobId

    // ── 3. Run known issue match (best-effort, Growth tier+) ─────────────────
    let knownIssueMatched  = false
    let knownIssueConfidence = 0
    let knownIssueId: string | undefined
    let knownIssueTitle: string | undefined
    let knownIssueSummary: string | undefined

    let kmInputTokens  = 0
    let kmOutputTokens = 0
    let kmDurationMs   = 0
    let kmModelId      = "unknown"
    let kmTraceId: string | undefined

    const knownIssueMatchEnabled = meetsMinTier(
      licenseToProductTier(getLicenseTier()),
      "growth",
    )

    if (knownIssueMatchEnabled) {
      try {
        const kmResult = await runKnownIssueMatchAgent({
          productId,
          caseId,
          jobId,
          signalText,
        })

        if (!kmResult.capabilityDisabled && kmResult.agentResult) {
          const out = kmResult.agentResult.output
          knownIssueMatched    = out.matched
          knownIssueConfidence = out.confidenceScore
          knownIssueId         = out.knownIssueId
          knownIssueTitle      = out.knownIssueTitle
          knownIssueSummary    = out.matchSummary
          kmInputTokens        = kmResult.agentResult.usage.inputTokens
          kmOutputTokens       = kmResult.agentResult.usage.outputTokens
          kmDurationMs         = kmResult.agentResult.durationMs
          kmModelId            = kmResult.agentResult.modelId
          kmTraceId            = kmResult.agentResult.traceId
        }
      } catch (err) {
        // Non-fatal: known issue match failure doesn't block routing
        logger.warn({ err, caseId }, "Known issue match failed — continuing with routing")
      }
    } else {
      logger.debug({ caseId }, "Known issue matching skipped — tier below Growth")
    }

    // ── 4. Dispatch dedicated outage_routing job (SLICE-17 + BEF-09) ─────────
    // Triggers for:
    //   a) Explicit outage_report type — always dispatch
    //   b) BEF-09: Any critical-severity case whose signal text contains outage
    //      keywords — catches mis-classified outages (e.g. typed as user_request)
    const isOutageReport = caseType === "outage_report"
    const isCriticalWithOutageSignals =
      caseSeverity === "critical" && caseType !== "outage_report" && hasOutageSignals(signalText)

    if (isOutageReport || isCriticalWithOutageSignals) {
      const outageJobId = newId("job_")
      try {
        await dispatch({
          actionType: "outage_routing",
          productId,
          caseId,
          jobId: outageJobId,
          payload: { signalText, reportedAt: caseRow.created_at.toISOString() },
        })
        logger.info(
          { caseId, outageJobId, trigger: isOutageReport ? "outage_report_type" : "critical_with_outage_signals" },
          "Outage routing dispatched to dedicated worker",
        )
      } catch (dispatchErr) {
        // Dispatch failure is non-fatal — case still goes to awaiting-lead
        logger.warn({ dispatchErr, caseId }, "Outage routing dispatch failed (non-fatal)")
      }
    }

    // ── 5. Routing decision ───────────────────────────────────────────────────
    const decision = decideRouting(caseType, caseSeverity, knownIssueMatched, knownIssueConfidence)

    logger.info(
      { caseId, productId, caseType, caseSeverity, decision: decision.nextStatus, reason: decision.reason },
      "Steward routing decision",
    )

    // ── 6+7. Atomic state transition + dispatch (SLICE-15) ─────────────────
    const nextPersona =
      decision.nextStatus === "in-change"     ? "change"   :
      decision.nextStatus === "awaiting-lead" ? "steward"  :
      "steward"

    let changeRequestId: string | undefined
    let sidecarChangeRequestId: string | undefined

    if (decision.nextStatus === "in-change" && "createChangeRequest" in decision) {
      // in-change: create CR first, then atomic transition + dispatch change_prep
      const triageOutput = caseRow.triage_output as Record<string, unknown> | null
      const cr = await createChangeRequest({
        product_id:        productId,
        case_id:           caseId,
        title:             caseRow.title ?? undefined,
        problem_statement: triageOutput?.["reasoning"] as string | undefined,
        status:            "draft",
        risk_level:        caseSeverity === "high" ? "high" : "medium",
      })
      changeRequestId = cr.change_request_id
      logger.info({ changeRequestId, caseId }, "Change request created")

      const changePrepJobId = newId("job_")
      await transitionAndDispatch({
        caseId,
        expectedFrom: "triaged",
        to: "in-change",
        extra: { current_persona: "change" },
        dispatch: {
          actionType: "change_prep",
          productId,
          caseId,
          jobId: changePrepJobId,
          payload: { changeRequestId, signalText },
        },
      })
      logger.info({ changeRequestId, changePrepJobId }, "Case → in-change + change_prep dispatched (atomic)")

    } else if (decision.nextStatus === "in-resolution") {
      // in-resolution: atomic transition + dispatch auto_reply
      const autoReplyJobId = newId("job_")
      await transitionAndDispatch({
        caseId,
        expectedFrom: "triaged",
        to: "in-resolution",
        extra: { current_persona: "steward" },
        dispatch: {
          actionType: "auto_reply",
          productId,
          caseId,
          jobId: autoReplyJobId,
          payload: { signalText, ...(sessionId ? { sessionId } : {}) },
        },
      })
      logger.info({ caseId, autoReplyJobId }, "Case → in-resolution + auto_reply dispatched (atomic)")

      // Side-car draft CR for infra debt — only for bug_report cases with infra labels.
      // CR starts in draft (not approval-pending) — no approval burden on the Steward.
      // Non-fatal: a failure here must not affect the already-committed case transition.
      const triageOutput = caseRow.triage_output as Record<string, unknown> | null
      const triageLabels  = Array.isArray(triageOutput?.["labels"])
        ? (triageOutput!["labels"] as unknown[]).filter((l): l is string => typeof l === "string")
        : []
      if (shouldCreateSidecarCr(caseType, triageLabels)) {
        try {
          const sidecarCr = await createChangeRequest({
            product_id:        productId,
            case_id:           caseId,
            title:             `[Infra debt] ${caseRow.title ?? "Untitled"}`,
            problem_statement: triageOutput?.["reasoning"] as string | undefined,
            status:            "draft",
            risk_level:        caseSeverity === "high" ? "high" : "medium",
            impact_summary:    "Auto-flagged by Steward: infra/performance signals detected in auto-resolved bug case.",
            cr_track:          "infra_debt",
          })
          sidecarChangeRequestId = sidecarCr.change_request_id
          logger.info({ sidecarChangeRequestId, caseId }, "Sidecar draft CR created for infra debt tracking")

          // Advance sidecar CR: draft → analysis → approval-pending via change_prep.
          // Per lifecycle §6.2: draft → analysis is automatic once problem statement exists.
          // change_prep will notify Change Lead at approval-pending entry.
          // Non-fatal: dispatch failure must not affect the already-committed case transition.
          const sidecarPrepJobId = newId("job_")
          try {
            await dispatch({
              actionType: "change_prep",
              productId,
              caseId,
              jobId: sidecarPrepJobId,
              payload: { changeRequestId: sidecarChangeRequestId, signalText },
            })
            logger.info({ sidecarChangeRequestId, sidecarPrepJobId }, "Sidecar change_prep dispatched (draft → analysis)")
          } catch (dispatchErr) {
            logger.warn({ dispatchErr, sidecarChangeRequestId }, "Sidecar change_prep dispatch failed (non-fatal)")
          }
        } catch (crErr) {
          logger.warn({ crErr, caseId }, "Sidecar CR creation failed (non-fatal)")
        }
      }

    } else {
      // awaiting-lead: transition + dispatch draft generation (forceDraftOnly — never auto-sent)
      const draftJobId = newId("job_")
      await transitionAndDispatch({
        caseId,
        expectedFrom: "triaged",
        to: "awaiting-lead",
        extra: { current_persona: nextPersona },
        dispatch: {
          actionType: "auto_reply",
          productId,
          caseId,
          jobId: draftJobId,
          payload: { signalText, forceDraftOnly: true, ...(sessionId ? { sessionId } : {}) },
        },
      })
      logger.info({ caseId, draftJobId, reason: decision.reason }, "Case → awaiting-lead + draft auto_reply dispatched (atomic)")
    }

    // ── 8. Audit event ────────────────────────────────────────────────────────
    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "agent",
      actor_ref:    "steward/known_issue_match",
      action:       "case.routed",
      before_state: { status: "triaged" },
      after_state:  { status: decision.nextStatus },
      metadata: {
        reason:                  decision.reason,
        knownIssueMatched,
        knownIssueId,
        knownIssueTitle,
        knownIssueSummary,
        changeRequestId,
        sidecarChangeRequestId,
        outageRoutingDispatched: caseType === "outage_report",
      },
    })

    // ── 9. Operator notification for escalations (best-effort) ───────────────
    // SA Review #3 fix: outage_report with critical/high → all leads; normal/low → support_lead only.
    // Non-outage escalations: critical → support_lead (original behavior).
    const isOutage = caseType === "outage_report"
    const isHighOrCritical = caseSeverity === "critical" || caseSeverity === "high"
    const shouldNotify = decision.nextStatus === "awaiting-lead" && (isOutage || caseSeverity === "critical")

    if (shouldNotify) {
      try {
        const product = await findProductById(productId)
        const ns = new NotificationService()
        const notificationBody = [
          `Case ${caseId} has been escalated to awaiting-lead for ${product?.name ?? productId}.`,
          ``,
          `Reason:   ${decision.reason}`,
          `Severity: ${caseSeverity}`,
          `Type:     ${caseType}`,
        ].join("\n")

        // Determine which leads to notify
        const leadRoles = (isOutage && isHighOrCritical)
          ? ["support_lead", "product_lead", "change_lead"] as const  // all leads for critical/high outages
          : ["support_lead"] as const                                  // support_lead only for other escalations

        for (const role of leadRoles) {
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
              subject:      `[${(caseSeverity ?? "UNKNOWN").toUpperCase()}] Escalation — ${caseRow.title ?? "(no subject)"}`,
              body:         notificationBody,
              ackRequired:  true,
            })
          }
        }
      } catch (notifyErr) {
        logger.warn({ notifyErr, caseId }, "Steward escalation notification failed (non-fatal)")
      }
    }

    return {
      outcome:             "success",
      modelId:             kmModelId,
      inputTokens:         kmInputTokens,
      outputTokens:        kmOutputTokens,
      durationMs:          kmDurationMs,
      outputSchemaVersion: KNOWN_ISSUE_MATCH_SCHEMA_VERSION,
      outputValid:         true,
      outputSnapshot: {
        decision:                decision.nextStatus,
        reason:                  decision.reason,
        knownIssueMatched,
        knownIssueId,
        changeRequestId,
        sidecarChangeRequestId,
        outageRoutingDispatched: caseType === "outage_report",
      },
      ...(kmTraceId ? { otelTraceId: kmTraceId } : {}),
    }
  }
}

/** Singleton instance — registered once at startup. */
export const stewardWorker = new StewardWorker()
