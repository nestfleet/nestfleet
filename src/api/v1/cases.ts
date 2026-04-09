/**
 * Cases API — SLICE-01 + SLICE-02.
 *
 * Operator queue API for reviewing and managing cases.
 *
 * Routes:
 *   GET  /api/v1/products/:productId/cases                          — list with filters
 *   GET  /api/v1/products/:productId/cases/:caseId                  — single case detail
 *   GET  /api/v1/products/:productId/cases/:caseId/conversation     — full signal thread
 *   POST /api/v1/products/:productId/cases/:caseId/draft-clarification — enriching → awaiting-user
 *   POST /api/v1/products/:productId/cases/:caseId/triage-manual    — enriching → triaged
 *   POST /api/v1/products/:productId/cases/:caseId/signal-received  — awaiting-user → enriching
 *   POST /api/v1/products/:productId/cases/:caseId/send-draft-reply — Lead sends edited AI draft via email (awaiting-lead email cases)
 *   POST /api/v1/products/:productId/cases/:caseId/retry            — QE-05 re-dispatch for processing-failed cases
 *   POST /api/v1/internal/send-reminders                            — reminder cron for stale cases
 *
 * Protected by requireAuth — SLICE-05.
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findCaseById, findCasesByProduct, updateCase, CaseStatusSchema, CaseSeveritySchema, CaseTypeSchema, touchCase } from "../../infra/db/repositories/cases.js"
import { transitionCase } from "../../domain/case-state-machine.js"
import { transitionAndDispatch } from "../../domain/transactional-dispatch.js"
import { createAuditEvent, createChangeRequest } from "../../infra/db/repositories/index.js"
import { findChangeRequestsByCase } from "../../infra/db/repositories/change-requests.js"
import { findSignalsByCaseId, createSignal } from "../../infra/db/repositories/signals.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { NotificationService } from "../../notifications/index.js"
import { dispatch } from "../../agents/dispatcher.js"
import { newId } from "../../infra/db/id.js"
import { incrementOu } from "../../billing/ou-tracker.js"

export const casesRouter = new Hono<{ Variables: AuthVariables }>()

// ── Query param schemas ────────────────────────────────────────────────────────

const ListCasesQuerySchema = z.object({
  status:   CaseStatusSchema.optional(),
  severity: CaseSeveritySchema.optional(),
  channel:  z.enum(["email", "chat", "telegram", "api"]).optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional().default(50),
  offset:   z.coerce.number().int().min(0).optional().default(0),
})

// ── GET /api/v1/products/:productId/cases ─────────────────────────────────────

casesRouter.get("/products/:productId/cases", requireAuth(), async (c) => {
  const productId = c.req.param("productId")

  const queryParsed = ListCasesQuerySchema.safeParse(c.req.query())
  if (!queryParsed.success) {
    return c.json({ error: "Invalid query parameters", details: queryParsed.error.issues }, 400)
  }

  const { status, severity, channel, limit, offset } = queryParsed.data

  try {
    const cases = await findCasesByProduct(productId, { status, severity, channel, limit, offset })

    return c.json({
      data:   cases,
      meta: {
        productId,
        count:  cases.length,
        limit,
        offset,
        filters: { status, severity },
      },
    })
  } catch (err) {
    logger.error({ err, productId }, "Failed to list cases")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /api/v1/products/:productId/cases/:caseId ─────────────────────────────

casesRouter.get("/products/:productId/cases/:caseId", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")

  try {
    const caseRow = await findCaseById(caseId)

    if (!caseRow) {
      return c.json({ error: "Case not found" }, 404)
    }

    // Ensure the case belongs to the requested product
    if (caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    return c.json({ data: caseRow })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to fetch case")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── PATCH /api/v1/products/:productId/cases/:caseId ───────────────────────────
// Operator action: escalate to awaiting-lead (and future manual overrides).
// Allowed field: status (only "awaiting-lead" permitted from the console).

const PatchCaseBodySchema = z.object({
  status: z.literal("awaiting-lead"),
})

casesRouter.patch("/products/:productId/cases/:caseId", requireAuth(), requireRole("support_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = PatchCaseBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    const prevStatus = caseRow.status

    await transitionCase(caseId, prevStatus, parsed.data.status, { current_persona: "steward" })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.escalated",
      before_state: { status: prevStatus },
      after_state:  { status: parsed.data.status },
      metadata:     { escalatedBy: actor.email },
    })

    logger.info({ caseId, productId, prevStatus, actor: actor.email }, "Case escalated by operator")
    return c.json({ data: { caseId, status: parsed.data.status } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to update case")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/send-to-change ─────────────
// Lead action: create a change request and transition case to in-change.

casesRouter.post("/products/:productId/cases/:caseId/send-to-change", requireAuth(), requireRole("support_lead", "change_lead", "product_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "awaiting-lead") {
      return c.json({ error: "Case must be in awaiting-lead status to send to change" }, 400)
    }

    const riskLevel =
      caseRow.severity === "critical" ? "high"
      : caseRow.severity === "high"   ? "high"
      : "medium"

    const cr = await createChangeRequest({
      product_id:        productId,
      case_id:           caseId,
      title:             caseRow.title ?? undefined,
      problem_statement: (caseRow.triage_output as Record<string, unknown> | null)?.reasoning as string | undefined,
      status:            "draft",
      risk_level:        riskLevel,
    })

    const changePrepJobId = newId("job_")
    await transitionAndDispatch({
      caseId,
      expectedFrom: "awaiting-lead",
      to: "in-change",
      extra: { current_persona: "change" },
      dispatch: {
        actionType: "change_prep",
        productId,
        caseId,
        jobId: changePrepJobId,
        payload: { changeRequestId: cr.change_request_id, signalText: caseRow.title ?? "" },
      },
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.sent_to_change",
      before_state: { status: "awaiting-lead" },
      after_state:  { status: "in-change" },
      metadata:     { changeRequestId: cr.change_request_id, sentBy: actor.email },
    })

    logger.info({ caseId, productId, changeRequestId: cr.change_request_id, actor: actor.email }, "Case sent to change")
    return c.json({ ok: true, data: { caseId, changeRequestId: cr.change_request_id } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to send case to change")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/forward-to-team ────────────
// Lead action: forward a case to a non-engineering team (sales, support, legal, billing).
// Clears the case from the Lead queue by transitioning awaiting-lead → in-resolution.
// No CR is created; the forwarding context lives in the audit event metadata.

const ForwardToTeamBodySchema = z.object({
  team: z.enum(["sales", "support", "legal", "billing"]),
  note: z.string().min(10).max(2_000),
})

casesRouter.post("/products/:productId/cases/:caseId/forward-to-team", requireAuth(), requireRole("support_lead", "product_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = ForwardToTeamBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "awaiting-lead") {
      return c.json({ error: "Case must be in awaiting-lead status to forward" }, 400)
    }

    await transitionCase(caseId, "awaiting-lead", "in-resolution", { current_persona: "steward" })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.forwarded_to_team",
      before_state: { status: "awaiting-lead" },
      after_state:  { status: "in-resolution" },
      metadata:     { team: parsed.data.team, note: parsed.data.note, forwardedBy: actor.email },
    })

    logger.info({ caseId, productId, team: parsed.data.team, actor: actor.email }, "Case forwarded to team")
    return c.json({ ok: true, data: { caseId, team: parsed.data.team } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to forward case to team")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/resolve ────────────────────
// Lead action: close a case with a resolution statement.

const ResolveCaseBodySchema = z.object({
  resolution: z.string().min(5).optional().default("Resolved by operator"),
})

casesRouter.post("/products/:productId/cases/:caseId/resolve", requireAuth(), requireRole("support_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = ResolveCaseBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status === "resolved") {
      return c.json({ error: "Case is already resolved" }, 400)
    }

    const prevStatus = caseRow.status

    await transitionCase(caseId, prevStatus, "resolved", { current_persona: "steward" })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.resolved",
      before_state: { status: prevStatus },
      after_state:  { status: "resolved" },
      metadata:     { resolution: parsed.data.resolution, resolvedBy: actor.email },
    })

    // BIL-03: record OU event (best-effort, non-blocking)
    incrementOu({ productId, eventType: "case.resolved", entityRef: caseId }).catch(() => {})

    logger.info({ caseId, productId, prevStatus, actor: actor.email }, "Case resolved by lead")
    return c.json({ ok: true, data: { caseId, status: "resolved" } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to resolve case")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/send-draft-reply ────────────
// DEFERRED-24: Lead edits the AI draft and sends it to the customer via email.
// Case stays in awaiting-lead — Lead must explicitly resolve when confirmed.

const SendDraftReplyBodySchema = z.object({
  reply_text: z.string().min(1).max(10_000),
})

casesRouter.post("/products/:productId/cases/:caseId/send-draft-reply", requireAuth(), requireRole("support_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = SendDraftReplyBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }
    if (!["awaiting-lead", "in-resolution"].includes(caseRow.status)) {
      return c.json({ error: "Case must be in awaiting-lead or in-resolution status to send a reply" }, 400)
    }

    const replyText = parsed.data.reply_text.trim()

    // Resolve recipient from reporter identity
    let recipientEmail: string | null = null
    if (caseRow.reporter_identity_id) {
      const { findIdentityById } = await import("../../infra/db/repositories/identities.js")
      const identity = await findIdentityById(caseRow.reporter_identity_id)
      const addr = identity?.email_addresses?.[0]
      if (addr && addr.includes("@")) recipientEmail = addr
    }

    if (!recipientEmail) {
      return c.json({ error: "No email address found for the case reporter — cannot send reply" }, 422)
    }

    // Send email
    const { sendEmail } = await import("../../email/sender.js")
    const { applyDisclosure } = await import("../../shared/ai-disclosure.js")
    const product    = await findProductById(productId)
    const agentConfig = product?.agent_config as Record<string, unknown> | null
    const { getLicenseTier }        = await import("../../license/validator.js")
    const { licenseToProductTier }  = await import("../../rbac/permission-engine.js")

    const disclosureBody = applyDisclosure(replyText, {
      channel:     "email",
      context:     "auto_reply",
      productName: product?.name ?? "Support",
    }, agentConfig?.["disclosure_templates"] as Record<string, Record<string, string>> | null)

    const productTier = licenseToProductTier(getLicenseTier())
    const emailBody   = productTier === "community"
      ? `${disclosureBody}\n\n---\nPowered by NestFleet · nestfleet.dev`
      : disclosureBody

    const emailSubject = `Re: ${caseRow.title ?? "Your support request"}`
    await sendEmail({
      to:      recipientEmail,
      subject: emailSubject,
      text:    emailBody,
    })

    // Record the outbound reply as a Signal so it appears in the conversation thread
    const convId = caseRow.conversation_ids?.[0] ?? null
    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `draft-reply:${caseId}:${Date.now()}`,
      received_at:        new Date(),
      raw_payload:        { direction: "outbound", to: recipientEmail, subject: emailSubject, body: emailBody },
      normalized_payload: { direction: "outbound", fromEmail: actor.email, subject: emailSubject, body: emailBody },
      conversation_id:    convId ?? undefined,
      case_id:            caseId,
      processing_status:  "linked",
    })

    // Clear the draft — reply is now sent
    const { clearDraftReply } = await import("../../infra/db/repositories/cases.js")
    await clearDraftReply(caseId)

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.draft_reply_sent",
      before_state: { status: caseRow.status },
      after_state:  { status: caseRow.status },
      metadata:     { recipientEmail, sentBy: actor.email, replyLength: replyText.length },
    })

    logger.info({ caseId, productId, recipientEmail, actor: actor.email }, "Draft reply sent to customer")
    return c.json({ ok: true, data: { caseId, sentTo: recipientEmail } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to send draft reply")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/reopen ────────────────────
// BEF-17: Reopen a resolved case, returning it to awaiting-lead for follow-up.

casesRouter.post("/products/:productId/cases/:caseId/reopen", requireAuth(), requireRole("operator"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }
    if (caseRow.status !== "resolved") {
      return c.json({ error: "Only resolved cases can be reopened" }, 400)
    }

    await transitionCase(caseId, "resolved", "awaiting-lead", { current_persona: "steward" })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.reopened",
      before_state: { status: "resolved" },
      after_state:  { status: "awaiting-lead" },
      metadata:     { reopenedBy: actor.email },
    })

    logger.info({ caseId, productId, actor: actor.email }, "Case reopened by operator")
    return c.json({ ok: true, data: { caseId, status: "awaiting-lead" } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to reopen case")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/send-followup ──────────────
// BEF-16: Send a follow-up email on a resolved case without changing its status.

const SendFollowupBodySchema = z.object({
  message: z.string().min(1).max(10_000),
})

casesRouter.post("/products/:productId/cases/:caseId/send-followup", requireAuth(), requireRole("support_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = SendFollowupBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }
    if (caseRow.status !== "resolved") {
      return c.json({ error: "Follow-up can only be sent on resolved cases" }, 400)
    }

    // Resolve recipient from reporter identity
    let recipientEmail: string | null = null
    if (caseRow.reporter_identity_id) {
      const { findIdentityById } = await import("../../infra/db/repositories/identities.js")
      const identity = await findIdentityById(caseRow.reporter_identity_id)
      const addr = identity?.email_addresses?.[0]
      if (addr && addr.includes("@")) recipientEmail = addr
    }
    if (!recipientEmail) {
      return c.json({ error: "No email address found for the case reporter — cannot send follow-up" }, 422)
    }

    const messageText = parsed.data.message.trim()

    const { sendEmail } = await import("../../email/sender.js")
    const product = await findProductById(productId)

    const emailSubject = `Follow-up: ${caseRow.title ?? "Your support request"}`
    await sendEmail({
      to:      recipientEmail,
      subject: emailSubject,
      text:    messageText,
    })

    // Record outbound signal in conversation thread
    const convId = caseRow.conversation_ids?.[0] ?? null
    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `followup:${caseId}:${Date.now()}`,
      received_at:        new Date(),
      raw_payload:        { direction: "outbound", to: recipientEmail, subject: emailSubject, body: messageText },
      normalized_payload: { direction: "outbound", fromEmail: actor.email, subject: emailSubject, body: messageText },
      conversation_id:    convId ?? undefined,
      case_id:            caseId,
      processing_status:  "linked",
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.followup_sent",
      before_state: { status: "resolved" },
      after_state:  { status: "resolved" },
      metadata:     { recipientEmail, sentBy: actor.email, messageLength: messageText.length },
    })

    logger.info({ caseId, productId, recipientEmail, actor: actor.email }, "Follow-up email sent")
    return c.json({ ok: true, data: { caseId, sentTo: recipientEmail } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to send follow-up email")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /api/v1/products/:productId/cases/:caseId/conversation ─────────────────
// Returns all signals linked to the case in chronological order (full thread).

casesRouter.get("/products/:productId/cases/:caseId/conversation", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    const signals = await findSignalsByCaseId(caseId)

    // Map signals to a lightweight conversation message shape
    const messages = signals.map((s) => {
      const payload = s.normalized_payload as Record<string, unknown>

      // Chat signals store text in `message` (outbound) or `signalText` (inbound).
      // Non-chat signals use `body`.
      let body = (payload.body as string) ?? ""
      if (s.source_type === "chat") {
        if (payload.message) {
          body = payload.message as string
        } else if (payload.signalText) {
          // signalText format: "From: Name <email>\n\nActual message"
          const parts = (payload.signalText as string).split("\n\n")
          body = parts.slice(1).join("\n\n").trim() || (payload.signalText as string)
        }
      }

      return {
        signal_id:    s.signal_id,
        source_type:  s.source_type,
        received_at:  s.received_at.toISOString(),
        from_email:   (payload.fromEmail as string | null) ?? null,
        subject:      (payload.subject  as string | null) ?? null,
        body,
        direction:    (payload.direction as string) ?? "inbound",
      }
    })

    return c.json({ data: messages, meta: { caseId, count: messages.length } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to fetch conversation")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/draft-clarification ─────────
// Frontline action: drafts a clarification question and transitions case to awaiting-user.

casesRouter.post("/products/:productId/cases/:caseId/draft-clarification", requireAuth(), requireRole("operator", "support_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "enriching") {
      return c.json({ error: `Case must be in enriching status to draft clarification (current: ${caseRow.status})` }, 400)
    }

    // Stub: in production this would invoke the Frontline agent for a real clarification question
    const clarificationQuestion = `Could you please provide more details about the issue? Specifically:
1. What steps did you take before the issue occurred?
2. What did you expect to happen vs. what actually happened?
3. Any error messages you see?`

    await transitionCase(caseId, "enriching", "awaiting-user", { current_persona: "frontline" })
    await touchCase(caseId)

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "agent",
      actor_ref:    actor.email,
      action:       "case.clarification_drafted",
      before_state: { status: "enriching" },
      after_state:  { status: "awaiting-user" },
      metadata:     { clarificationQuestion },
    })

    logger.info({ caseId, productId }, "Clarification drafted, case awaiting user reply")
    return c.json({ ok: true, data: { caseId, status: "awaiting-user", clarificationQuestion } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to draft clarification")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/triage-manual ──────────────
// Steward/lead action: manually triage a case with type, severity, and summary.

const TriageManualBodySchema = z.object({
  type:     CaseTypeSchema,
  severity: CaseSeveritySchema,
  summary:  z.string().min(10),
})

casesRouter.post("/products/:productId/cases/:caseId/triage-manual", requireAuth(), requireRole("support_lead", "product_lead"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = TriageManualBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "enriching") {
      return c.json({ error: `Case must be in enriching status for manual triage (current: ${caseRow.status})` }, 400)
    }

    const triageOutput = {
      type:     parsed.data.type,
      severity: parsed.data.severity,
      summary:  parsed.data.summary,
      method:   "manual",
      triagedBy: actor.email,
      triagedAt: new Date().toISOString(),
    }

    await transitionCase(caseId, "enriching", "triaged", {
      type:          parsed.data.type,
      severity:      parsed.data.severity,
      triage_output: triageOutput,
      current_persona: "steward",
    })
    await touchCase(caseId)

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.triaged",
      before_state: { status: "enriching" },
      after_state:  { status: "triaged", type: parsed.data.type, severity: parsed.data.severity },
      metadata:     triageOutput,
    })

    logger.info({ caseId, productId, ...parsed.data, actor: actor.email }, "Case triaged manually")
    return c.json({ ok: true, data: { caseId, status: "triaged", triageOutput } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to triage case")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/signal-received ────────────
// System action: a new reply arrived — transition awaiting-user → enriching.

casesRouter.post("/products/:productId/cases/:caseId/signal-received", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "awaiting-user") {
      return c.json({ error: `Case must be in awaiting-user status (current: ${caseRow.status})` }, 400)
    }

    await transitionCase(caseId, "awaiting-user", "enriching", { current_persona: "frontline" })
    await touchCase(caseId)

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "system",
      actor_ref:    "ingress",
      action:       "case.signal_received",
      before_state: { status: "awaiting-user" },
      after_state:  { status: "enriching" },
    })

    logger.info({ caseId, productId }, "New signal received, case back to enriching")
    return c.json({ ok: true, data: { caseId, status: "enriching" } })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to process signal-received")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/internal/send-reminders ──────────────────────────────────────
// Cron endpoint: sends reminder notifications for cases stuck in awaiting-user.

const SendRemindersBodySchema = z.object({
  product_id:      z.string(),
  threshold_hours: z.coerce.number().int().min(1).max(168).optional().default(24),
})

casesRouter.post("/internal/send-reminders", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = SendRemindersBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  const { product_id, threshold_hours } = parsed.data
  const updatedBefore = new Date(Date.now() - threshold_hours * 60 * 60 * 1000)

  try {
    const product = await findProductById(product_id)
    if (!product) {
      return c.json({ error: "Product not found" }, 404)
    }

    // Find all cases in awaiting-user updated before the threshold
    const db = (await import("../../infra/db/client.js")).getDb()
    const staleCases = await db<{ case_id: string; title: string | null }[]>`
      SELECT case_id, title FROM cases
      WHERE product_id = ${product_id}
        AND status     = 'awaiting-user'
        AND updated_at  < ${updatedBefore}
    `

    const supportLead = product?.lead_assignments?.["support_lead"] as string | undefined
    if (!supportLead || !staleCases.length) {
      return c.json({ ok: true, reminded: 0, skipped: staleCases.length })
    }

    const ns = new NotificationService()
    let reminded = 0

    for (const staleCase of staleCases) {
      await ns.emit({
        productId:    product_id,
        kind:         "stale_case_alert",
        priority:     "normal",
        audienceType: "support_lead",
        recipientRef: supportLead,
        sourceType:   "case",
        sourceRef:    staleCase.case_id,
        subject:      `Case awaiting user reply for >${threshold_hours}h`,
        body:         `Case "${staleCase.title ?? staleCase.case_id}" has been waiting for a user reply for more than ${threshold_hours} hours. Consider following up or escalating.`,
        ackRequired:  false,
      })
      reminded++
    }

    logger.info({ product_id, reminded, threshold_hours }, "Awaiting-user reminders sent")
    return c.json({ ok: true, reminded, total_stale: staleCases.length })
  } catch (err) {
    logger.error({ err, product_id }, "Failed to send reminders")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/cases/:caseId/retry ──────────────────────
// QE-05: Operator action — re-dispatch a processing-failed case for re-triage.
// Transitions processing-failed → enriching and enqueues a fresh triage job.

casesRouter.post("/products/:productId/cases/:caseId/retry", requireAuth(), requireRole("operator"), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")
  const actor     = c.get("user")

  try {
    const caseRow = await findCaseById(caseId)
    if (!caseRow || caseRow.product_id !== productId) {
      return c.json({ error: "Case not found" }, 404)
    }

    if (caseRow.status !== "processing-failed") {
      return c.json({ error: `Case must be in processing-failed status to retry (current: ${caseRow.status})` }, 400)
    }

    const failedJobName = caseRow.processing_error?.jobName

    let jobId: string
    let afterStatus: string

    if (failedJobName === "pr_draft_prep") {
      // Case failed during PR drafting — stay in-change, re-dispatch pr_draft_prep
      // Find the approved CR to get changeRequestId for the payload
      const crs = await findChangeRequestsByCase(caseId)
      const approvedCr = crs.find((cr) => cr.status === "approved")
      if (!approvedCr) {
        return c.json({ error: "No approved change request found — cannot retry pr_draft_prep" }, 400)
      }

      await transitionCase(caseId, "processing-failed", "in-change", {
        processing_error: null,
      })
      await touchCase(caseId)

      jobId = newId("job_")
      afterStatus = "in-change"
      await dispatch({ actionType: "pr_draft_prep", productId, caseId, jobId, payload: { changeRequestId: approvedCr.change_request_id } })
    } else {
      // Default: re-enter at triage (enriching)
      await transitionCase(caseId, "processing-failed", "enriching", {
        current_persona:  "frontline",
        processing_error: null,
      })
      await touchCase(caseId)

      jobId = newId("job_")
      afterStatus = "enriching"
      await dispatch({ actionType: "triage", productId, caseId, jobId })
    }

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "case",
      entity_ref:   caseId,
      actor_type:   "lead",
      actor_ref:    actor.email,
      action:       "case.retried",
      before_state: { status: "processing-failed" },
      after_state:  { status: afterStatus },
      metadata:     { retriedBy: actor.email, jobId, retriedJob: failedJobName ?? "triage" },
    })

    logger.info({ caseId, productId, jobId, retriedJob: failedJobName ?? "triage", afterStatus, actor: actor.email }, "Case re-dispatched after processing failure")
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to retry case")
    return c.json({ error: "Internal server error" }, 500)
  }
})
