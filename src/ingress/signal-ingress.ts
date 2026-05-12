// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Signal ingress pipeline — SLICE-01.
 *
 * Orchestrates the full inbound email → case creation flow:
 *
 *   ParsedEmail
 *     → Signal (create, dedup by source_ref)
 *     → Identity (find-or-create by email)
 *     → Conversation (find-or-create by thread_key)
 *     → Case (create in 'new', transition to 'enriching')
 *     → Link signal ↔ identity, conversation, case
 *     → AuditEvents (signal.received, case.created)
 *     → Dispatch triage job (Frontline worker)
 *     → Notify operator (best-effort)
 *
 * All DB writes are best-effort transactional where possible.
 * The pipeline is idempotent on duplicate source_ref (duplicate email delivery).
 */

import { logger } from "../shared/logger.js"
import { newId } from "../infra/db/id.js"
import {
  createSignal,
  updateSignal,
  createConversation,
  findConversationByThreadKey,
  updateConversation,
  createCase,
  createIdentity,
  findIdentityByEmail,
  createAuditEvent,
  findProductById,
  findOpenCaseByChannelThreadId,
} from "../infra/db/repositories/index.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { dispatch } from "../agents/dispatcher.js"
import { notifyNewCase } from "../email/sender.js"
import type { ParsedEmail } from "../email/parser.js"
import { buildSignalText, deriveThreadKey } from "../email/parser.js"
import { getOuStatus } from "../billing/ou-tracker.js"

export interface IngestResult {
  signalId:       string
  conversationId: string
  caseId:         string
  identityId:     string
  /** true if this was a duplicate signal (same source_ref seen before). */
  duplicate:      boolean
  /**
   * BIL-04: OU enforcement status.
   * "warning"  — approaching monthly limit (≥80%), case was created normally.
   * "blocked"  — monthly limit reached (100%), case was NOT created or dispatched.
   * undefined  — within normal usage bounds.
   */
  ouStatus?: "warning" | "blocked"
}

/**
 * Ingest one parsed inbound email for a given product.
 *
 * @param productId  - Authoritative product ID (from webhook route param)
 * @param email      - Normalised email from parsePostmarkInbound()
 */
export async function ingestEmailSignal(
  productId: string,
  email: ParsedEmail,
): Promise<IngestResult> {
  // ── 0. Validate product exists ────────────────────────────────────────────
  const product = await findProductById(productId)
  if (!product) {
    throw new Error(`Product not found: ${productId}`)
  }

  // ── 1. Create Signal (dedup by source_ref = messageId) ───────────────────
  let signalId: string
  let duplicate = false

  // Thread identity for dedup:
  //   - Replies: use inReplyTo (the parent's messageId)
  //   - Originals: use own messageId so future replies can find this signal
  // This way `findOpenCaseByChannelThreadId(productId, inReplyTo)` always matches.
  const channelThreadId: string = email.inReplyTo ?? email.messageId

  try {
    const signal = await createSignal({
      product_id:        productId,
      source_type:       "email",
      source_ref:        email.messageId,
      received_at:       email.receivedAt,
      raw_payload:       emailToRawPayload(email),
      processing_status: "received",
      channel_thread_id: channelThreadId,
    })
    signalId = signal.signal_id

    logger.info({ signalId, productId, messageId: email.messageId }, "Signal created")
  } catch (err: unknown) {
    // Unique constraint violation on (source_type, source_ref) = duplicate delivery
    if (isUniqueViolation(err)) {
      logger.warn(
        { productId, messageId: email.messageId },
        "Duplicate signal — already processed, skipping",
      )
      // Return a stub result — caller can ignore duplicates
      return {
        signalId:       `sig_duplicate_${email.messageId}`,
        conversationId: "",
        caseId:         "",
        identityId:     "",
        duplicate:      true,
      }
    }
    throw err
  }

  // Mark as normalizing
  await updateSignal(signalId, { processing_status: "normalizing" })

  // ── 2. Identity resolution — find or create end_user ─────────────────────
  let identityId: string

  const existingIdentity = await findIdentityByEmail(productId, email.fromEmail)
  if (existingIdentity) {
    identityId = existingIdentity.identity_id
    logger.debug({ identityId, email: email.fromEmail }, "Identity resolved (existing)")
  } else {
    const identity = await createIdentity({
      product_id:      productId,
      type:            "end_user",
      display_name:    email.fromName || undefined,
      email_addresses: [email.fromEmail],
    })
    identityId = identity.identity_id
    logger.debug({ identityId, email: email.fromEmail }, "Identity created (new)")
  }

  // ── 3. Conversation resolution — find or create by thread_key ────────────
  const threadKey  = deriveThreadKey(email)
  let conversationId: string

  const existingConv = await findConversationByThreadKey(productId, "email", threadKey)
  if (existingConv) {
    conversationId = existingConv.conversation_id

    // Update thread metadata
    await updateConversation(conversationId, {
      last_message_at: email.receivedAt,
      participant_ids: dedupe([
        ...existingConv.participant_ids,
        identityId,
      ]),
    })
    logger.debug({ conversationId, threadKey }, "Conversation resolved (existing)")
  } else {
    const conv = await createConversation({
      product_id:      productId,
      channel:         "email",
      subject:         email.subject,
      thread_key:      threadKey,
      participant_ids: [identityId],
      status:          "active",
      last_message_at: email.receivedAt,
    })
    conversationId = conv.conversation_id
    logger.debug({ conversationId, threadKey }, "Conversation created (new)")
  }

  // ── 3b. Thread dedup — append to existing open case if possible ──────────
  // Only attempt threading for replies (inReplyTo set).  Original emails always
  // open a new case.  The lookup matches against other signals' channel_thread_id
  // which for originals equals their own messageId — so replies find them.
  let threadedCaseId: string | null = null
  if (email.inReplyTo) {
    threadedCaseId = await findOpenCaseByChannelThreadId(productId, email.inReplyTo)
    if (threadedCaseId) {
      logger.info(
        { caseId: threadedCaseId, channelThreadId, signalId },
        "Signal threaded to existing open case",
      )
    }
  }

  // ── 4. Case creation ──────────────────────────────────────────────────────
  // BIL-04: enforce monthly OU limit before creating a new case.
  // If blocked: signal + identity are stored (for audit/customer record),
  // but no case is created and no triage job is dispatched.
  // Skip OU check + case creation when threading into an existing case.
  let caseId: string
  let ouStatus: "ok" | "warning" | "blocked" = "ok"

  const signalText = buildSignalText(email)

  if (threadedCaseId) {
    // Thread continuation — no new case, no OU charge
    caseId = threadedCaseId
    logger.info({ caseId, signalId }, "Threaded signal appended to existing case (no new case)")
  } else {
    ouStatus = await getOuStatus().catch(() => "ok" as const)
    if (ouStatus === "blocked") {
      await updateSignal(signalId, { processing_status: "linked" })
      logger.warn({ productId, signalId }, "OU monthly limit reached — case intake blocked")
      return { signalId, conversationId, caseId: "", identityId, duplicate: false, ouStatus: "blocked" }
    }

    const newCase = await createCase({
      product_id:           productId,
      title:                email.subject.slice(0, 200),
      reporter_identity_id: identityId,
      conversation_ids:     [conversationId],
      status:               "new",
      current_persona:      "frontline",
      signal_text:          signalText,
    })
    caseId = newCase.case_id

    // Transition: new → enriching (guarded)
    await transitionCase(caseId, "new", "enriching")

    logger.info({ caseId, productId, conversationId }, "Case created")
  }

  // ── 5. Link signal → identity, conversation, case ─────────────────────────
  await updateSignal(signalId, {
    identity_id:     identityId,
    conversation_id: conversationId,
    case_id:         caseId,
    processing_status: "normalized",
    normalized_payload: {
      signalText,
      subject:     email.subject,
      fromEmail:   email.fromEmail,
      fromName:    email.fromName,
      threadKey,
      messageId:   email.messageId,
    },
  })

  // ── 6. Audit events ───────────────────────────────────────────────────────
  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "signal-ingress",
    action:      "signal.received",
    after_state: { signalId, source_type: "email", processing_status: "normalized" },
    metadata:    { messageId: email.messageId, fromEmail: email.fromEmail },
  })

  if (!threadedCaseId) {
    // Only emit case.created for net-new cases — threaded signals don't open a new case
    await createAuditEvent({
      product_id:  productId,
      entity_type: "case",
      entity_ref:  caseId,
      actor_type:  "system",
      actor_ref:   "signal-ingress",
      action:      "case.created",
      after_state: { caseId, status: "enriching", signalId, conversationId },
      metadata:    { subject: email.subject, fromEmail: email.fromEmail },
    })

    // ── 7. Dispatch Frontline (triage) worker ─────────────────────────────────
    const jobId = newId("job_")

    await dispatch({
      actionType: "triage",
      productId,
      caseId,
      jobId,
      payload: { signalText, signalId },
    })

    logger.info({ caseId, jobId }, "Triage job dispatched")

    // ── 8. Operator notification (best-effort) ────────────────────────────────
    const supportLeadEmail = getSupportLeadEmail(product.lead_assignments)
    if (supportLeadEmail) {
      notifyNewCase({
        operatorEmail: supportLeadEmail,
        caseId,
        productName:   product.name,
        severity:      null,            // not yet triaged
        summary:       null,
        signalSubject: email.subject,
      }).catch((err) => {
        logger.warn({ err, caseId }, "Operator notification failed (non-fatal)")
      })
    }
  }

  // Mark signal as fully linked
  await updateSignal(signalId, { processing_status: "linked" })

  return {
    signalId,
    conversationId,
    caseId,
    identityId,
    duplicate: false,
    ...(ouStatus === "warning" ? { ouStatus: "warning" as const } : {}),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emailToRawPayload(email: ParsedEmail): Record<string, unknown> {
  return {
    messageId:       email.messageId,
    fromEmail:       email.fromEmail,
    fromName:        email.fromName,
    subject:         email.subject,
    bodyText:        email.bodyText.slice(0, 10_000),  // cap stored body
    replyTo:         email.replyTo,
    inReplyTo:       email.inReplyTo,
    references:      email.references,
    receivedAt:      email.receivedAt.toISOString(),
    attachmentCount: email.attachmentCount,
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Error) {
    return (err as { code?: string }).code === "23505"
  }
  return false
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)]
}

function getSupportLeadEmail(leadAssignments: Record<string, unknown>): string | null {
  const lead = leadAssignments["support_lead"]
  return typeof lead === "string" && lead.includes("@") ? lead : null
}
