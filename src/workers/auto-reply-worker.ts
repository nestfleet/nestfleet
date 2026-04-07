/**
 * AutoReplyWorker — SLICE-04.
 *
 * Listens on the 'auto_reply' queue. For each in-resolution case:
 *   1. Loads case from DB (must be in `in-resolution` status)
 *   2. Gets signal text from payload or case title
 *   3. Runs runAutoReplyAgent()
 *   4. Runs validation envelope (SPIKE-03 inline):
 *        Gate 1 — Confidence ≥ 0.85
 *        Gate 2 — sourceTiers includes 1
 *        Gate 3 — requiresHumanReview === false
 *        Gate 4 — Forbidden phrase scan
 *   5. If all gates pass → autoSend = true  → transition to resolved
 *      If any gate fails → autoSend = false → transition to awaiting-lead
 *   6. Emits audit event: case.reply_drafted
 *   7. Sends operator notification
 */

import { AbstractAgentWorker, type WorkerExecuteContext, type WorkerExecuteResult } from "../agents/worker.js"
import { publish } from "../chat/session-registry.js"
import { publish as publishOperator } from "../notifications/operator-registry.js"
import { runAutoReplyAgent, AUTO_REPLY_SCHEMA_VERSION } from "../agents/impl/auto-reply.js"
import {
  findCaseById,
  createAuditEvent,
  findProductById,
} from "../infra/db/repositories/index.js"
import { saveDraftReply } from "../infra/db/repositories/cases.js"
import { createSignal, findSignalByCaseId } from "../infra/db/repositories/signals.js"
import { createGitHubClient } from "../infra/github/client.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { dispatch } from "../agents/dispatcher.js"
import { newId } from "../infra/db/id.js"
import { findIdentityById } from "../infra/db/repositories/identities.js"
import { sendEmail } from "../email/sender.js"
import { applyDisclosure } from "../shared/ai-disclosure.js"
import { NotificationService } from "../notifications/index.js"
import { logger } from "../shared/logger.js"
import { config } from "../shared/config.js"
import { getLicenseTier } from "../license/validator.js"
import { licenseToProductTier } from "../rbac/permission-engine.js"
import { meetsMinTier } from "../auth/middleware.js"

// ── Validation envelope ───────────────────────────────────────────────────────

const FORBIDDEN_PHRASES = [
  "compensation",
  "refund",
  "guarantee",
  "i promise",
  "will be fixed by",
  "root cause is",
  // BEF-04: extended billing-related phrases
  "credit",
  "money back",
  "chargeback",
  "charge back",
  "invoice error",
  "billing error",
]

function scanForbiddenPhrases(text: string): string | null {
  const lower = text.toLowerCase()
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      return phrase
    }
  }
  return null
}

// BEF-08: Career / legal-impact keywords that should always escalate to lead.
// If the signal text contains any of these, the reply must never be auto-sent.
const SENSITIVITY_PHRASES = [
  "fired",
  "losing my job",
  "lose my job",
  "job at risk",
  "my career",
  "lawsuit",
  "legal action",
  "sue",
  "attorney",
  "lawyer",
  "gdpr violation",
  "data breach",
  "personal data leak",
]

function scanSensitivityPhrases(text: string): string | null {
  const lower = text.toLowerCase()
  for (const phrase of SENSITIVITY_PHRASES) {
    if (lower.includes(phrase)) {
      return phrase
    }
  }
  return null
}

// ── Worker ────────────────────────────────────────────────────────────────────

export class AutoReplyWorker extends AbstractAgentWorker {
  readonly actionType = "auto_reply" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job, caseId } = ctx

    // ── 1. Load case ──────────────────────────────────────────────────────────
    if (!caseId) {
      throw new Error("AutoReplyWorker: job missing caseId")
    }

    const caseRow = await findCaseById(caseId)
    if (!caseRow) {
      throw new Error(`AutoReplyWorker: case not found: ${caseId}`)
    }

    const payload = job.data.payload ?? {}
    // forceDraftOnly: dispatched by StewardWorker for critical/direct-awaiting-lead routes.
    // Case is already in awaiting-lead; we only generate and save the draft, never auto-send.
    const forceDraftOnly = Boolean(payload["forceDraftOnly"])

    if (!forceDraftOnly && caseRow.status !== "in-resolution") {
      throw new Error(
        `AutoReplyWorker: case ${caseId} is in status '${caseRow.status}', expected 'in-resolution'`,
      )
    }

    if (forceDraftOnly && caseRow.status !== "awaiting-lead") {
      throw new Error(
        `AutoReplyWorker: forceDraftOnly case ${caseId} is in status '${caseRow.status}', expected 'awaiting-lead'`,
      )
    }

    const productId = caseRow.product_id  // authoritative — never trust job.data

    // ── 2. Get signal text ────────────────────────────────────────────────────
    const signalText = (payload["signalText"] as string | undefined) ?? caseRow.title ?? ""
    const sessionId  = payload["sessionId"] as string | undefined   // CHAT-UX-01 (a)

    if (!signalText) {
      throw new Error(`AutoReplyWorker: no signal text available for case ${caseId}`)
    }

    // ── 3. Run auto_reply agent ───────────────────────────────────────────────
    const result = await runAutoReplyAgent({
      productId,
      caseId,
      jobId: job.data.jobId,
      signalText,
    })

    const output = result.output

    // ── 4. Validation envelope (SPIKE-03 inline) ──────────────────────────────
    let autoSend = true
    let validationFailReason: string | undefined

    // forceDraftOnly: skip all gates — draft is always saved, never auto-sent
    if (forceDraftOnly) {
      autoSend = false
      validationFailReason = "force_draft_only_critical_escalation"
    }

    // BEF-08: Sensitivity gate — always checked first, regardless of other gates.
    // Career/legal-impact language in the signal must never be auto-resolved.
    if (autoSend) {
      const sensitive = scanSensitivityPhrases(signalText)
      if (sensitive !== null) {
        autoSend = false
        validationFailReason = `gate_sensitivity_phrase("${sensitive}")`
      }
    }

    // Gate 1 — Confidence (BEF-03: lowered threshold from 0.85 to 0.80)
    if (autoSend && output.confidenceScore < 0.80) {
      autoSend = false
      validationFailReason = `gate1_confidence_below_threshold(${output.confidenceScore.toFixed(2)})`
    }

    // Gate 2 — Source tier (T1 required for auto-send)
    if (autoSend && !output.sourceTiers.includes(1)) {
      autoSend = false
      validationFailReason = `gate2_no_tier1_source(tiers:${output.sourceTiers.join(",")})`
    }

    // Gate 3 — Human review flag
    if (autoSend && output.requiresHumanReview) {
      autoSend = false
      validationFailReason = "gate3_agent_requested_human_review"
    }

    // Gate 4 — Forbidden phrase scan (reply text AND signal text — BEF-04)
    if (autoSend) {
      const forbidden = scanForbiddenPhrases(output.replyText) ?? scanForbiddenPhrases(signalText)
      if (forbidden !== null) {
        autoSend = false
        validationFailReason = `gate4_forbidden_phrase("${forbidden}")`
      }
    }

    // Category C gate (6.3.4): Community tier always requires human approval.
    // Confidence-based auto-send is a Starter+ capability. Force awaiting-lead
    // regardless of validation envelope result when tier < starter.
    const productTierForGate = licenseToProductTier(getLicenseTier())
    if (!meetsMinTier(productTierForGate, "starter") && autoSend) {
      autoSend = false
      validationFailReason = "gate_tier_community_requires_human_approval"
    }

    logger.info(
      {
        caseId,
        productId,
        autoSend,
        validationFailReason,
        confidence: output.confidenceScore,
        sourceTiers: output.sourceTiers,
        requiresHumanReview: output.requiresHumanReview,
        productTier: productTierForGate,
      },
      "AutoReplyWorker validation envelope result",
    )

    // ── 5. Update case ────────────────────────────────────────────────────────
    if (autoSend) {
      // BEF-01: merge ai_resolved:true into existing triage_output so downstream
      // queries (e.g. DG-09 assertion) can distinguish AI-resolved from human-resolved.
      const existingTriageOutput = (caseRow.triage_output as Record<string, unknown>) ?? {}
      await transitionCase(caseId, "in-resolution", "resolved", {
        summary: output.replyText.slice(0, 500),
        current_persona: "frontline",
        resolved_at: new Date(),
        triage_output: { ...existingTriageOutput, ai_resolved: true },
      })

      // BEF-02: trigger knowledge-capture so the successful reply is indexed
      // for future auto-replies. Growth-gated — dispatcher silently skips on lower tiers.
      try {
        await dispatch({
          actionType: "knowledge_capture",
          productId,
          caseId,
          jobId: newId("job_"),
          payload: { signalText, resolvedReplyText: output.replyText },
        })
        logger.info({ caseId }, "AutoReplyWorker: knowledge_capture dispatched after auto-resolve")
      } catch (kcErr) {
        // Non-fatal: knowledge capture failure must not affect the resolved case
        logger.warn({ kcErr, caseId }, "AutoReplyWorker: knowledge_capture dispatch failed (non-fatal)")
      }

      // CHAT-UX-01 (a): Push auto-reply text to widget via SSE if session is live
      if (sessionId) {
        try {
          publish(sessionId, {
            type: "message",
            role: "agent",
            text: output.replyText,
            ts:   new Date().toISOString(),
          })
          logger.info({ caseId, sessionId }, "AutoReplyWorker: reply pushed to SSE stream")
        } catch (sseErr) {
          // No listeners — widget not connected right now, non-fatal
          logger.debug({ sseErr, caseId, sessionId }, "AutoReplyWorker: SSE publish skipped (no listeners)")
        }
      }

      // INFRA-01: Notify operator console — case resolved, badge counts may have changed
      publishOperator(productId, {
        type:             "badge_update",
        productId,
        openChats:        0,  // case just resolved, no longer open
        pendingApprovals: 0,  // auto-reply path never creates approvals
        ts:               new Date().toISOString(),
      })
    } else {
      // forceDraftOnly: case is already in awaiting-lead — skip state transition
      if (!forceDraftOnly) {
        await transitionCase(caseId, "in-resolution", "awaiting-lead", {
          summary: `Draft reply requires review: ${validationFailReason ?? "unknown"}`,
          current_persona: "steward",
        })
      }
      // DEFERRED-24: persist full draft so the Lead can view, edit, and send it
      await saveDraftReply(caseId, output.replyText, {
        confidenceScore: output.confidenceScore,
        sourceTiers:     output.sourceTiers,
        validationFailReason,
        createdAt:       new Date().toISOString(),
        createdBy:       "frontline/auto_reply",
      })

      // Chat UX: send immediate acknowledgement so the widget user doesn't see
      // silence while the draft awaits Lead review. Only for fresh chat sessions
      // (sessionId present); forceDraftOnly escalations from steward may not have one.
      if (sessionId && !forceDraftOnly) {
        try {
          publish(sessionId, {
            type: "message",
            role: "agent",
            text: "Thanks for reaching out! Our team is reviewing your message and will reply shortly.",
            ts:   new Date().toISOString(),
          })
          logger.info({ caseId, sessionId }, "AutoReplyWorker: chat acknowledgement pushed to SSE (awaiting-lead)")
        } catch (sseErr) {
          logger.debug({ sseErr, caseId, sessionId }, "AutoReplyWorker: SSE ack publish skipped (no listeners)")
        }
      }
    }

    // Load product once — reused across steps 6, 6b, and 8
    const product = await findProductById(productId)
    const agentConfig = product?.agent_config as Record<string, unknown> | null

    // ── 6. Send reply email to customer (best-effort) ─────────────────────────
    // Track resolved email details for step 6c (outbound signal), declared
    // outside the try/catch so the signal is always written even if sending fails.
    let resolvedRecipientEmail: string | null = null
    let resolvedEmailSubject:   string | null = null

    if (autoSend) {
      try {
        if (caseRow.reporter_identity_id) {
          const identity = await findIdentityById(caseRow.reporter_identity_id)
          const recipientEmail = identity?.email_addresses?.[0]
          if (recipientEmail && recipientEmail.includes("@")) {
            // CG-01: Apply AI disclosure to customer-facing auto-reply
            const disclosureBody = applyDisclosure(output.replyText, {
              channel: "email",
              context: "auto_reply",
              productName: product?.name ?? "Support",
            }, agentConfig?.["disclosure_templates"] as Record<string, Record<string, string>> | null)

            // BIL-05: append "Powered by NestFleet" footer on Community tier
            const productTier = licenseToProductTier(getLicenseTier())
            const emailBody = productTier === "community"
              ? `${disclosureBody}\n\n---\nPowered by NestFleet · nestfleet.dev`
              : disclosureBody

            const emailSubject = `Re: ${caseRow.title ?? "Your support request"}`

            await sendEmail({
              to:      recipientEmail,
              subject: emailSubject,
              text:    emailBody,
            })
            logger.info({ caseId, recipientEmail }, "AutoReplyWorker reply email sent to customer")

            // Capture for outbound signal (step 6c)
            resolvedRecipientEmail = recipientEmail
            resolvedEmailSubject   = emailSubject
          }
        }
      } catch (emailErr) {
        logger.warn({ emailErr, caseId }, "AutoReplyWorker reply email failed (non-fatal)")
      }
    }

    // ── 6c. Record outbound reply as a Signal ─────────────────────────────────
    // Always persisted when autoSend=true so the reply is visible in the
    // conversation thread in the Console, even if email delivery failed.
    if (autoSend) {
      try {
        const convId = caseRow.conversation_ids?.[0] ?? null
        await createSignal({
          product_id:         productId,
          source_type:        "email",
          source_ref:         `auto-reply:${caseId}:${Date.now()}`,
          received_at:        new Date(),
          raw_payload: {
            direction: "outbound",
            subject:   resolvedEmailSubject ?? `Re: ${caseRow.title ?? "Your support request"}`,
            body:      output.replyText,
            to:        resolvedRecipientEmail,
          },
          normalized_payload: {
            direction:  "outbound",
            body:       output.replyText,
            fromEmail:  "nestfleet-auto-reply",
          },
          conversation_id:   convId ?? undefined,
          case_id:           caseId,
          processing_status: "linked",
        })
        logger.info({ caseId }, "AutoReplyWorker: outbound signal record created")
      } catch (sigErr) {
        logger.warn({ sigErr, caseId }, "AutoReplyWorker: outbound signal creation failed (non-fatal)")
      }
    }

    // ── 6b. Post reply comment to GitHub issue (DEFERRED-22) ──────────────────
    if (autoSend && caseRow.github_issue_ref && config.GITHUB_TOKEN) {
      try {
        const hashIdx  = caseRow.github_issue_ref.lastIndexOf("#")
        const repo     = hashIdx !== -1 ? caseRow.github_issue_ref.slice(0, hashIdx) : null
        const issueNum = hashIdx !== -1 ? parseInt(caseRow.github_issue_ref.slice(hashIdx + 1), 10) : NaN
        if (repo && !Number.isNaN(issueNum)) {
          const commentBody = applyDisclosure(output.replyText, {
            channel:     "github",
            context:     "auto_reply",
            productName: product?.name ?? "Support",
          }, agentConfig?.["disclosure_templates"] as Record<string, Record<string, string>> | null)
          const gh = createGitHubClient(config.GITHUB_TOKEN)
          await gh.addIssueComment(repo, issueNum, commentBody)
          logger.info({ caseId, repo, issueNum }, "AutoReplyWorker: GitHub issue comment posted")
        } else {
          logger.warn(
            { caseId, github_issue_ref: caseRow.github_issue_ref },
            "AutoReplyWorker: malformed github_issue_ref — skipping comment",
          )
        }
      } catch (ghErr) {
        logger.warn({ ghErr, caseId }, "AutoReplyWorker: GitHub comment failed (non-fatal)")
      }
    }

    // ── 6d. Outbound callback for external channel signals (FEAT-003) ─────────
    // When the originating signal came from source_type "external" and the
    // product has externalCallbackUrl configured, POST the reply back to the
    // P1's bot so it can deliver the reply to the end user.
    // Best-effort only — failure never blocks case resolution.
    if (autoSend) {
      try {
        const originSignal = await findSignalByCaseId(caseId)
        if (originSignal?.source_type === "external") {
          const policy      = (product?.support_policy ?? {}) as Record<string, unknown>
          const callbackUrl = policy["externalCallbackUrl"] as string | undefined
          if (callbackUrl) {
            const channelCtx = (originSignal.channel_context ?? {}) as Record<string, unknown>
            const threadId   = originSignal.channel_thread_id ?? ""
            await fireOutboundCallback(callbackUrl, {
              caseId,
              replyText: output.replyText,
              threadId,
              channelContext: channelCtx,
            })
            logger.info({ caseId, callbackUrl, threadId }, "AutoReplyWorker: outbound callback fired")
          }
        }
      } catch (cbErr) {
        logger.warn({ cbErr, caseId }, "AutoReplyWorker: outbound callback failed (non-fatal)")
      }
    }

    // ── 7. Audit event ────────────────────────────────────────────────────────
    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "agent",
      actor_ref:    "frontline/auto_reply",
      action:       "case.reply_drafted",
      before_state: { status: forceDraftOnly ? "awaiting-lead" : "in-resolution" },
      after_state:  { status: autoSend ? "resolved" : "awaiting-lead" },
      metadata: {
        autoSend,
        validationFailReason,
        confidenceScore: output.confidenceScore,
        sourceTiers:     output.sourceTiers,
      },
    })

    // ── 8. Operator notification (best-effort) ────────────────────────────────
    try {
      const supportLead = product?.lead_assignments?.["support_lead"]
      if (typeof supportLead === "string" && supportLead.includes("@")) {
        const ns = new NotificationService()
        if (autoSend) {
          await ns.emit({
            productId,
            kind:         "status_update",
            priority:     "normal",
            audienceType: "support_lead",
            recipientRef: supportLead,
            sourceType:   "case",
            sourceRef:    caseId,
            subject:      `Case auto-resolved — ${caseRow.title ?? "(no subject)"}`,
            body: [
              `Case ${caseId} has been auto-resolved for ${product?.name ?? productId}.`,
              ``,
              `Reply preview: ${output.replyText.slice(0, 200)}`,
            ].join("\n"),
          })
        } else {
          await ns.emit({
            productId,
            kind:         "approval_request",
            priority:     "high",
            audienceType: "support_lead",
            recipientRef: supportLead,
            sourceType:   "case",
            sourceRef:    caseId,
            subject:      `Reply review required — ${caseRow.title ?? "(no subject)"}`,
            body: [
              `Case ${caseId} requires human review for ${product?.name ?? productId}.`,
              ``,
              `Reason: ${validationFailReason ?? "unknown"}`,
            ].join("\n"),
            ackRequired: true,
          })
        }
      }
    } catch (notifyErr) {
      logger.warn({ notifyErr, caseId }, "AutoReplyWorker notification failed (non-fatal)")
    }

    return {
      outcome:             "success",
      modelId:             result.modelId,
      inputTokens:         result.usage.inputTokens,
      outputTokens:        result.usage.outputTokens,
      durationMs:          result.durationMs,
      outputSchemaVersion: AUTO_REPLY_SCHEMA_VERSION,
      outputValid:         true,
      outputSnapshot: {
        autoSend,
        ...(validationFailReason !== undefined ? { validationFailReason } : {}),
        replyPreview: output.replyText.slice(0, 200),
        ...(caseRow.github_issue_ref ? { githubIssueRef: caseRow.github_issue_ref } : {}),
      },
      otelTraceId: result.traceId,
    }
  }
}

/** Singleton instance — registered once at startup. */
export const autoReplyWorker = new AutoReplyWorker()

// ── Outbound callback helper (FEAT-003) ───────────────────────────────────────

/**
 * Fire a best-effort HTTP POST to the product's externalCallbackUrl with the
 * auto-reply text.  5-second timeout — never throws (errors are non-fatal).
 */
export async function fireOutboundCallback(
  callbackUrl: string,
  payload: {
    caseId:         string
    replyText:      string
    threadId:       string
    channelContext: Record<string, unknown>
  },
): Promise<void> {
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 5_000)

  try {
    await fetch(callbackUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
