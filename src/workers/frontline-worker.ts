/**
 * FrontlineWorker — SLICE-01.
 *
 * Listens on the 'triage' queue. For each job:
 *   1. Loads the case + signal text from DB (authoritative source)
 *   2. Runs runTriageAgent() to classify severity, type, and category
 *   3. Updates the case with triage output (severity, type, confidence)
 *   4. Transitions case: enriching → triaged
 *   5. Emits audit event: case.triaged
 *   6. Sends operator notification with severity
 *
 * The Frontline persona owns the new → enriching → triaged path in SLICE-01.
 * Steward persona (known-issue match, change routing) is added in SLICE-02+.
 */

import { AbstractAgentWorker, type WorkerExecuteContext, type WorkerExecuteResult } from "../agents/worker.js"
import { newId } from "../infra/db/id.js"
import { runTriageAgent, TRIAGE_SCHEMA_VERSION } from "../agents/impl/triage.js"
import { findCaseById, createAuditEvent, findSignalById, findProductById } from "../infra/db/repositories/index.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { transitionAndDispatch } from "../domain/transactional-dispatch.js"
import { dispatch } from "../agents/dispatcher.js"
import { NotificationService } from "../notifications/index.js"
import { logger } from "../shared/logger.js"
import type { CaseSeverity, CaseType } from "../infra/db/repositories/cases.js"

// Map triage agent category → domain CaseType (best-effort heuristic)
const CATEGORY_TO_CASE_TYPE: Record<string, CaseType> = {
  export:          "bug_report",
  authentication:  "bug_report",
  auth:            "bug_report",
  integration:     "bug_report",
  integrations:    "bug_report",
  performance:     "bug_report",
  "data loss":     "bug_report",
  outage:          "outage_report",
  incident:        "outage_report",
  billing:         "user_request",
  configuration:   "user_request",
  "how-to":        "user_request",
  "question":      "user_request",
  feedback:        "user_feedback",
  feature:         "user_feedback",
  sales:           "sales_inquiry",
  "sales_inquiry": "sales_inquiry",
  "sales inquiry": "sales_inquiry",
  "pre-sales":     "sales_inquiry",
  presales:        "sales_inquiry",
}

/** @internal exported for unit testing */
export function inferCaseType(category: string): CaseType {
  const lower = category.toLowerCase()
  for (const [key, type] of Object.entries(CATEGORY_TO_CASE_TYPE)) {
    if (lower.includes(key)) return type
  }
  return "user_request"  // safe default
}

// ── Post-triage severity override rules ──────────────────────────────────────
//
// Applied after LLM output, before writing to DB. Pure functions — no I/O.
//
// Rule 1 (downgrade): config/how-to questions capped at "normal".
// Rationale: quantitative language ("8+ issues/night") causes models to
// over-escalate config questions. Category signals are more reliable.
//
// Rule 2 (upgrade): enterprise sales inquiries raised to minimum "normal".
// Rationale: LLMs score sales inquiries as "low" (no user pain), but an
// enterprise prospect with compliance requirements and a Q-deadline has
// material revenue impact. Enterprise signals in labels are a reliable proxy.

const CONFIG_CATEGORY_KEYS    = ["configuration", "how-to", "setup", "question", "feature request", "feature-request"]
const CONFIG_LABEL_KEYS       = ["how-to", "configuration", "question", "feature-request", "setup"]

const ENTERPRISE_CATEGORY_KEYS = ["sales", "sales_inquiry", "sales inquiry", "pre-sales", "presales"]
const ENTERPRISE_LABEL_KEYS    = ["enterprise", "soc2", "on-premise", "on-prem", "sso", "okta", "compliance", "hipaa", "gdpr", "sla"]

/** @internal exported for unit testing */
export function applyTriageOverrides(
  severity: string,
  category: string,
  labels: string[],
): { severity: string; overrideReason: string | null } {
  const cat         = category.toLowerCase()
  const lowerLabels = labels.map(l => l.toLowerCase())

  // Rule 1 — config/how-to downgrade cap
  const isConfigQuestion =
    CONFIG_CATEGORY_KEYS.some(k => cat.includes(k)) ||
    lowerLabels.some(l => CONFIG_LABEL_KEYS.includes(l))

  if (isConfigQuestion && (severity === "high" || severity === "critical")) {
    return {
      severity:       "normal",
      overrideReason: `config_question_cap: category="${category}" labels=[${labels.join(",")}] capped ${severity}→normal`,
    }
  }

  // Rule 2 — enterprise sales minimum "normal"
  const isSalesInquiry =
    ENTERPRISE_CATEGORY_KEYS.some(k => cat.includes(k))

  const hasEnterpriseSignals =
    lowerLabels.some(l => ENTERPRISE_LABEL_KEYS.includes(l))

  if (isSalesInquiry && hasEnterpriseSignals && severity === "low") {
    return {
      severity:       "normal",
      overrideReason: `enterprise_sales_floor: category="${category}" labels=[${labels.join(",")}] raised ${severity}→normal`,
    }
  }

  return { severity, overrideReason: null }
}

// Map triage agent severity → domain CaseSeverity
function mapSeverity(s: string): CaseSeverity {
  if (s === "critical") return "critical"
  if (s === "high")     return "high"
  if (s === "medium")   return "normal"
  if (s === "normal")   return "normal"
  return "low"
}

export class FrontlineWorker extends AbstractAgentWorker {
  readonly actionType = "triage" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job, caseId } = ctx

    // ── 1. Load case (authoritative product_id from DB) ───────────────────
    if (!caseId) {
      throw new Error("FrontlineWorker: job missing caseId")
    }

    const caseRow = await findCaseById(caseId)
    if (!caseRow) {
      throw new Error(`FrontlineWorker: case not found: ${caseId}`)
    }

    const productId = caseRow.product_id  // authoritative — never trust job.data

    // ── 2. Get signal text ────────────────────────────────────────────────
    const payload = job.data.payload ?? {}
    const signalText = (payload["signalText"] as string | undefined) ?? caseRow.title ?? ""
    const signalId   = payload["signalId"] as string | undefined
    const sessionId  = payload["sessionId"] as string | undefined   // CHAT-UX-01 (a)

    if (!signalText) {
      throw new Error(`FrontlineWorker: no signal text available for case ${caseId}`)
    }

    // ── 3. Run triage agent ───────────────────────────────────────────────
    const result = await runTriageAgent({
      productId,
      caseId,
      jobId:      job.data.jobId,
      signalText,
    })

    const { severity: rawSeverity, confidenceScore, category, labels, routingTeam, reasoning } = result.output

    // ── 4. Update case with triage output ────────────────────────────────

    // Apply deterministic post-triage overrides before writing to DB
    const { severity: overriddenSeverity, overrideReason } = applyTriageOverrides(rawSeverity, category, labels)
    if (overrideReason) {
      logger.info({ caseId, productId, overrideReason }, "Post-triage severity override applied")
    }

    const domainSeverity = mapSeverity(overriddenSeverity)
    const domainType     = inferCaseType(category)

    // ── 4+7. Atomic: transition enriching → triaged + dispatch steward job (SLICE-15)
    const stewardJobId = newId("job_")
    await transitionAndDispatch({
      caseId,
      expectedFrom: "enriching",
      to: "triaged",
      extra: {
        severity:        domainSeverity,
        type:            domainType,
        confidence:      confidenceScore,
        current_persona: "steward",
        triage_output:   result.output as unknown as Record<string, unknown>,
      },
      dispatch: {
        actionType: "known_issue_match",
        productId,
        caseId,
        jobId: stewardJobId,
        payload: { signalText, ...(sessionId ? { sessionId } : {}) },
      },
    })

    logger.info(
      { caseId, productId, severity: domainSeverity, type: domainType, confidence: confidenceScore, stewardJobId },
      "Case triaged + steward job dispatched (atomic)",
    )

    // ── 5. Audit event ────────────────────────────────────────────────────
    await createAuditEvent({
      product_id:  productId,
      entity_type: "case",
      entity_ref:  caseId,
      actor_type:  "agent",
      actor_ref:   "frontline/triage",
      action:      "case.triaged",
      before_state: { status: "enriching" },
      after_state:  { status: "triaged", severity: domainSeverity, type: domainType },
      metadata:     { confidence: confidenceScore, category, labels, routingTeam, reasoning,
                      ...(overrideReason ? { severityOverride: overrideReason } : {}) },
    })

    // ── 6. Post-triage operator notification (best-effort) ────────────────
    try {
      const product = await findProductById(productId)
      const supportLead = product?.lead_assignments?.["support_lead"]
      if (typeof supportLead === "string" && supportLead.includes("@")) {
        const ns = new NotificationService()
        const priority = domainSeverity === "critical" ? "critical" as const
                       : domainSeverity === "high"     ? "high"     as const
                       : "normal" as const
        await ns.emit({
          productId,
          kind:         "escalation_alert",
          priority,
          audienceType: "support_lead",
          recipientRef: supportLead,
          sourceType:   "case",
          sourceRef:    caseId,
          subject:      `[${domainSeverity.toUpperCase()}] Case triaged — ${caseRow.title ?? "(no subject)"}`,
          body: [
            `Case ${caseId} has been triaged by the Frontline agent for ${product?.name ?? productId}.`,
            ``,
            `Severity: ${domainSeverity}`,
            `Type:     ${domainType}`,
            `Summary:  ${reasoning.slice(0, 200)}`,
          ].join("\n"),
        })
      }
    } catch (notifyErr) {
      logger.warn({ notifyErr, caseId }, "Post-triage notification failed (non-fatal)")
    }

    // Mark signal as fully processed if we know the signal ID
    if (signalId) {
      try {
        await findSignalById(signalId)
        // Signal is already 'linked' from ingress — nothing more needed
      } catch {
        // Non-fatal
      }
    }

    return {
      outcome:             "success",
      modelId:             result.modelId,
      inputTokens:         result.usage.inputTokens,
      outputTokens:        result.usage.outputTokens,
      durationMs:          result.durationMs,
      outputSchemaVersion: TRIAGE_SCHEMA_VERSION,
      outputValid:         true,
      outputSnapshot:      result.output as unknown as Record<string, unknown>,
      otelTraceId:         result.traceId,
    }
  }
}

/** Singleton instance — registered once at startup. */
export const frontlineWorker = new FrontlineWorker()
