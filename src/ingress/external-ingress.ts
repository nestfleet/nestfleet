/**
 * External webhook signal ingress — FEAT-003 Slice 2.
 *
 * Converts a validated external webhook payload into the standard
 * signal → identity → conversation → case → triage pipeline.
 *
 * Mirrors ingestEmailSignal() but uses source_type "external" and identifies
 * the sender via senderRef (not email).  Supports channel_thread_id dedup so
 * follow-up messages thread into the existing open case.
 *
 * Conversation channel is stored as "external".  channel_context carries any
 * caller-supplied metadata (chat_id, guild_id, etc.) for the outbound callback.
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
  createAuditEvent,
  findProductById,
  findOpenCaseByChannelThreadId,
} from "../infra/db/repositories/index.js"
import { findIdentityByExternalRef } from "../infra/db/repositories/identities.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { dispatch } from "../agents/dispatcher.js"
import { notifyNewCase } from "../email/sender.js"
import { getOuStatus } from "../billing/ou-tracker.js"
import type { IngestResult } from "./signal-ingress.js"

export interface ExternalWebhookPayload {
  /** Stable thread identifier — replies in the same thread share this value. */
  threadId:       string
  /** Human-readable display name of the sender. */
  senderName:     string
  /** Stable unique identifier for the sender within the external channel. */
  senderRef:      string
  /** The message body (plain text). */
  message:        string
  /** Optional caller-supplied channel metadata stored in channel_context. */
  channelContext?: Record<string, unknown>
}

export interface ExternalIngestResult extends IngestResult {
  /** The channel_thread_id stored on the signal (= threadId). */
  channelThreadId: string
  /** True when the signal was a smoke-test canary — case auto-resolved, no triage dispatched. */
  canary?: true
}

/**
 * Ingest one external webhook payload for a given product.
 *
 * @param productId  - Product ID from the webhook route param
 * @param payload    - Validated external webhook payload
 */
export async function ingestExternalSignal(
  productId: string,
  payload: ExternalWebhookPayload,
): Promise<ExternalIngestResult> {
  const receivedAt = new Date()

  // ── 0. Validate product exists ────────────────────────────────────────────
  const product = await findProductById(productId)
  if (!product) {
    throw new Error(`Product not found: ${productId}`)
  }

  // ── 1. Dedup key — content hash to prevent double-delivery ───────────────
  // Stable across retries for the same message; changes if message differs.
  const sourceRef = createHash("sha256")
    .update(`${productId}:${payload.threadId}:${payload.senderRef}:${payload.message}`)
    .digest("hex")
    .slice(0, 32)

  // ── 2. Create Signal ──────────────────────────────────────────────────────
  let signalId: string
  let duplicate = false

  try {
    const signal = await createSignal({
      product_id:        productId,
      source_type:       "external",
      source_ref:        sourceRef,
      received_at:       receivedAt,
      raw_payload: {
        threadId:     payload.threadId,
        senderName:   payload.senderName,
        senderRef:    payload.senderRef,
        message:      payload.message.slice(0, 10_000),
        channelContext: payload.channelContext ?? null,
      },
      processing_status: "received",
      // All external signals get threadId as channel_thread_id for dedup lookup
      channel_thread_id: payload.threadId,
      channel_context:   payload.channelContext,
    })
    signalId = signal.signal_id
    logger.info({ signalId, productId, threadId: payload.threadId, senderRef: payload.senderRef }, "External signal created")
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      logger.warn({ productId, sourceRef }, "Duplicate external signal — skipping")
      return {
        signalId:        `sig_duplicate_${sourceRef}`,
        conversationId:  "",
        caseId:          "",
        identityId:      "",
        duplicate:       true,
        channelThreadId: payload.threadId,
      }
    }
    throw err
  }

  await updateSignal(signalId, { processing_status: "normalizing" })

  // ── 3. Identity resolution ────────────────────────────────────────────────
  // External senders are identified by senderRef (no email available).
  let identityId: string

  const existingIdentity = await findIdentityByExternalRef(productId, payload.senderRef)
  if (existingIdentity) {
    identityId = existingIdentity.identity_id
    logger.debug({ identityId, senderRef: payload.senderRef }, "External identity resolved (existing)")
  } else {
    const identity = await createIdentity({
      product_id:    productId,
      type:          "end_user",
      display_name:  payload.senderName || undefined,
      // Store senderRef as a JSONB key so findIdentityByExternalRef can use `?` operator
      external_refs: { [payload.senderRef]: true },
    })
    identityId = identity.identity_id
    logger.debug({ identityId, senderRef: payload.senderRef }, "External identity created (new)")
  }

  // ── 4. Conversation — one thread per threadId ─────────────────────────────
  const threadKey      = `external:${productId}:${payload.threadId}`
  let conversationId: string

  const existingConv = await findConversationByThreadKey(productId, "external", threadKey)
  if (existingConv) {
    conversationId = existingConv.conversation_id
    await updateConversation(conversationId, {
      last_message_at: receivedAt,
      participant_ids: dedupe([...existingConv.participant_ids, identityId]),
    })
    logger.debug({ conversationId, threadKey }, "Conversation resolved (existing)")
  } else {
    const conv = await createConversation({
      product_id:      productId,
      channel:         "external",
      subject:         `External: ${payload.message.slice(0, 100)}`,
      thread_key:      threadKey,
      participant_ids: [identityId],
      status:          "active",
      last_message_at: receivedAt,
    })
    conversationId = conv.conversation_id
    logger.debug({ conversationId, threadKey }, "Conversation created (new)")
  }

  // ── 4b. Thread dedup — append to existing open case if possible ───────────
  // threadId is always set for external signals — check for open case.
  const threadedCaseId = await findOpenCaseByChannelThreadId(productId, payload.threadId)
  if (threadedCaseId) {
    logger.info(
      { caseId: threadedCaseId, threadId: payload.threadId, signalId },
      "External signal threaded to existing open case",
    )
  }

  // ── 5. Case creation (or thread continuation) ────────────────────────────
  let caseId: string
  let ouStatus: "ok" | "warning" | "blocked" = "ok"

  const signalText = [
    `From: ${payload.senderName} (${payload.senderRef})`,
    `Thread: ${payload.threadId}`,
    "",
    payload.message,
  ].join("\n")

  if (threadedCaseId) {
    caseId = threadedCaseId
    logger.info({ caseId, signalId }, "External threaded signal appended (no new case)")
  } else {
    ouStatus = await getOuStatus().catch(() => "ok" as const)
    if (ouStatus === "blocked") {
      await updateSignal(signalId, { processing_status: "linked" })
      logger.warn({ productId, signalId }, "OU monthly limit reached — external intake blocked")
      return { signalId, conversationId, caseId: "", identityId, duplicate: false, channelThreadId: payload.threadId, ouStatus: "blocked" }
    }

    const newCase = await createCase({
      product_id:           productId,
      title:                payload.message.slice(0, 200),
      reporter_identity_id: identityId,
      conversation_ids:     [conversationId],
      status:               "new",
      current_persona:      "frontline",
      signal_text:          signalText,
    })
    caseId = newCase.case_id

    await transitionCase(caseId, "new", "enriching")
    logger.info({ caseId, productId, conversationId }, "Case created from external signal")

    // ── 5b. Smoke canary — auto-resolve without triage ────────────────────────
    if (isSmokeCanary(payload)) {
      logger.info({ caseId, productId }, "Smoke canary detected — auto-resolving case")
      await transitionCase(caseId, "enriching", "triaged")
      await transitionCase(caseId, "triaged", "resolved")
      await updateSignal(signalId, {
        identity_id:       identityId,
        conversation_id:   conversationId,
        case_id:           caseId,
        processing_status: "linked",
      })
      return {
        signalId,
        conversationId,
        caseId,
        identityId,
        duplicate: false,
        channelThreadId: payload.threadId,
        canary: true,
      }
    }
  }

  // ── 6. Link signal ────────────────────────────────────────────────────────
  await updateSignal(signalId, {
    identity_id:        identityId,
    conversation_id:    conversationId,
    case_id:            caseId,
    processing_status:  "normalized",
    normalized_payload: {
      signalText,
      threadId:    payload.threadId,
      senderName:  payload.senderName,
      senderRef:   payload.senderRef,
      threadKey,
      sourceRef,
    },
  })

  // ── 7. Audit events ───────────────────────────────────────────────────────
  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "external-ingress",
    action:      "signal.received",
    after_state: { signalId, source_type: "external", processing_status: "normalized" },
    metadata:    { threadId: payload.threadId, senderRef: payload.senderRef },
  })

  if (!threadedCaseId) {
    await createAuditEvent({
      product_id:  productId,
      entity_type: "case",
      entity_ref:  caseId,
      actor_type:  "system",
      actor_ref:   "external-ingress",
      action:      "case.created",
      after_state: { caseId, status: "enriching", signalId, conversationId },
      metadata:    { threadId: payload.threadId, source: "external" },
    })

    // ── 8. Dispatch triage ────────────────────────────────────────────────────
    const jobId = newId("job_")
    await dispatch({ actionType: "triage", productId, caseId, jobId, payload: { signalText, signalId } })
    logger.info({ caseId, jobId }, "Triage job dispatched from external signal")

    // ── 9. Operator notification (best-effort) ────────────────────────────────
    const supportLeadEmail = getSupportLeadEmail(product.lead_assignments)
    if (supportLeadEmail) {
      notifyNewCase({
        operatorEmail: supportLeadEmail,
        caseId,
        productName:   product.name,
        severity:      null,
        summary:       null,
        signalSubject: `External: ${payload.message.slice(0, 100)}`,
      }).catch((err) => {
        logger.warn({ err, caseId }, "Operator notification failed (non-fatal)")
      })
    }
  }

  await updateSignal(signalId, { processing_status: "linked" })

  return {
    signalId,
    conversationId,
    caseId,
    identityId,
    duplicate: false,
    channelThreadId: payload.threadId,
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

function isSmokeCanary(payload: ExternalWebhookPayload): boolean {
  return (
    payload.senderName === "smoke-test" ||
    payload.channelContext?.["source"] === "smoke-test"
  )
}
