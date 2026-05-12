// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Contact form signal ingress — DEFERRED-13.
 *
 * Converts a validated contact form submission into the standard
 * signal → identity → conversation → case → triage pipeline.
 *
 * Mirrors ingestEmailSignal() but uses source_type "contact_form"
 * and derives a dedup key from the submission itself (no messageId).
 * Conversation channel is stored as "email" — source_type is the
 * canonical origin marker; no schema change needed.
 */

import { createHash } from "node:crypto"
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
} from "../infra/db/repositories/index.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { dispatch } from "../agents/dispatcher.js"
import { notifyNewCase } from "../email/sender.js"
import { getOuStatus } from "../billing/ou-tracker.js"
import type { IngestResult } from "./signal-ingress.js"

export interface ContactFormSubmission {
  name:    string
  email:   string
  subject: string
  message: string
}

/**
 * Ingest one contact form submission for a given product.
 *
 * @param productId  - Product ID from the webhook route param
 * @param form       - Validated form fields
 */
export async function ingestContactFormSignal(
  productId: string,
  form: ContactFormSubmission,
): Promise<IngestResult> {
  const receivedAt = new Date()

  // ── 0. Validate product exists ────────────────────────────────────────────
  const product = await findProductById(productId)
  if (!product) {
    throw new Error(`Product not found: ${productId}`)
  }

  // ── 1. Dedup key — hash of (productId + email + subject + message) ────────
  // Prevents exact duplicate form submissions from creating multiple cases.
  const sourceRef = createHash("sha256")
    .update(`${productId}:${form.email}:${form.subject}:${form.message}`)
    .digest("hex")
    .slice(0, 32)

  // ── 2. Create Signal ──────────────────────────────────────────────────────
  let signalId: string
  let duplicate = false

  try {
    const signal = await createSignal({
      product_id:        productId,
      source_type:       "contact_form",
      source_ref:        sourceRef,
      received_at:       receivedAt,
      raw_payload:       { name: form.name, email: form.email, subject: form.subject, message: form.message.slice(0, 10_000) },
      processing_status: "received",
    })
    signalId = signal.signal_id
    logger.info({ signalId, productId, fromEmail: form.email }, "Contact form signal created")
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      logger.warn({ productId, sourceRef }, "Duplicate contact form submission — skipping")
      return { signalId: `sig_duplicate_${sourceRef}`, conversationId: "", caseId: "", identityId: "", duplicate: true }
    }
    throw err
  }

  await updateSignal(signalId, { processing_status: "normalizing" })

  // ── 3. Identity resolution ────────────────────────────────────────────────
  let identityId: string
  const existingIdentity = await findIdentityByEmail(productId, form.email)
  if (existingIdentity) {
    identityId = existingIdentity.identity_id
  } else {
    const identity = await createIdentity({
      product_id:      productId,
      type:            "end_user",
      display_name:    form.name || undefined,
      email_addresses: [form.email],
    })
    identityId = identity.identity_id
  }

  // ── 4. Conversation — thread by submitter email (one thread per person) ───
  const threadKey = `contact_form:${productId}:${form.email}`
  let conversationId: string

  const existingConv = await findConversationByThreadKey(productId, "email", threadKey)
  if (existingConv) {
    conversationId = existingConv.conversation_id
    await updateConversation(conversationId, {
      last_message_at: receivedAt,
      participant_ids: dedupe([...existingConv.participant_ids, identityId]),
    })
  } else {
    const conv = await createConversation({
      product_id:      productId,
      channel:         "email",
      subject:         form.subject,
      thread_key:      threadKey,
      participant_ids: [identityId],
      status:          "active",
      last_message_at: receivedAt,
    })
    conversationId = conv.conversation_id
  }

  // ── 5. OU enforcement ──────────────────────────────────────────────────────
  const ouStatus = await getOuStatus().catch(() => "ok" as const)
  if (ouStatus === "blocked") {
    await updateSignal(signalId, { processing_status: "linked" })
    logger.warn({ productId, signalId }, "OU monthly limit reached — contact form intake blocked")
    return { signalId, conversationId, caseId: "", identityId, duplicate: false, ouStatus: "blocked" }
  }

  // ── 6. Case creation ──────────────────────────────────────────────────────
  const signalText = [
    `From: ${form.name} <${form.email}>`,
    `Subject: ${form.subject}`,
    "",
    form.message,
  ].join("\n")

  const newCase = await createCase({
    product_id:           productId,
    title:                form.subject.slice(0, 200),
    reporter_identity_id: identityId,
    conversation_ids:     [conversationId],
    status:               "new",
    current_persona:      "frontline",
    signal_text:          signalText,
  })
  const caseId = newCase.case_id

  await transitionCase(caseId, "new", "enriching")
  logger.info({ caseId, productId, conversationId }, "Case created from contact form")

  // ── 7. Link signal ────────────────────────────────────────────────────────
  await updateSignal(signalId, {
    identity_id:        identityId,
    conversation_id:    conversationId,
    case_id:            caseId,
    processing_status:  "normalized",
    normalized_payload: { signalText, subject: form.subject, fromEmail: form.email, fromName: form.name, threadKey, sourceRef },
  })

  // ── 8. Audit events ───────────────────────────────────────────────────────
  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "contact-form-ingress",
    action:      "signal.received",
    after_state: { signalId, source_type: "contact_form", processing_status: "normalized" },
    metadata:    { fromEmail: form.email, fromName: form.name },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "case",
    entity_ref:  caseId,
    actor_type:  "system",
    actor_ref:   "contact-form-ingress",
    action:      "case.created",
    after_state: { caseId, status: "enriching", signalId, conversationId },
    metadata:    { subject: form.subject, fromEmail: form.email, source: "contact_form" },
  })

  // ── 9. Dispatch triage ────────────────────────────────────────────────────
  const jobId = newId("job_")
  await dispatch({ actionType: "triage", productId, caseId, jobId, payload: { signalText, signalId } })
  logger.info({ caseId, jobId }, "Triage job dispatched from contact form")

  // ── 10. Operator notification (best-effort) ───────────────────────────────
  const supportLeadEmail = getSupportLeadEmail(product.lead_assignments)
  if (supportLeadEmail) {
    notifyNewCase({
      operatorEmail: supportLeadEmail,
      caseId,
      productName:   product.name,
      severity:      null,
      summary:       null,
      signalSubject: form.subject,
    }).catch((err) => {
      logger.warn({ err, caseId }, "Operator notification failed (non-fatal)")
    })
  }

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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && (err as { code?: string }).code === "23505"
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)]
}

function getSupportLeadEmail(leadAssignments: Record<string, unknown>): string | null {
  const lead = leadAssignments["support_lead"]
  return typeof lead === "string" && lead.includes("@") ? lead : null
}
