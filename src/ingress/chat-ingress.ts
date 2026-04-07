/**
 * Chat widget signal ingress — DEFERRED-05.
 *
 * Two entry points:
 *   startChatSession()  — called on the user's first message; creates identity,
 *                         conversation, case, and dispatches triage.
 *   appendChatMessage() — called on subsequent messages in an existing session;
 *                         adds a signal linked to the existing conversation/case.
 *
 * Session identity: a random `chsess_<32hex>` token is generated here and
 * returned to the widget for storage in localStorage. It becomes the
 * conversation thread_key: `chat:{productId}:{sessionId}`.
 *
 * Replies flow back via the SSE session registry (src/chat/session-registry.ts).
 */

import { randomBytes } from "node:crypto"
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
import { getOuStatus } from "../billing/ou-tracker.js"
import { dispatch } from "../agents/dispatcher.js"
import type { IngestResult } from "./signal-ingress.js"

export class ChatSessionClosedError extends Error {
  readonly status = 409
  constructor(sessionId: string) {
    super(`Chat session is closed: ${sessionId}`)
    this.name = "ChatSessionClosedError"
  }
}

export interface ChatMessageInput {
  sessionId: string | null  // null on first message — server generates one
  name: string
  email: string
  message: string
}

export interface ChatIngestResult extends IngestResult {
  sessionId: string
  isNewSession: boolean
}

// ── Start a new chat session (first message) ──────────────────────────────────

export async function startChatSession(
  productId: string,
  input: Omit<ChatMessageInput, "sessionId">,
): Promise<ChatIngestResult> {
  const receivedAt = new Date()
  const sessionId = `chsess_${randomBytes(16).toString("hex")}`
  const threadKey = `chat:${productId}:${sessionId}`

  const product = await findProductById(productId)
  if (!product) throw new Error(`Product not found: ${productId}`)

  // ── OU check ──────────────────────────────────────────────────────────────
  const ouStatus = await getOuStatus().catch(() => "ok" as const)

  // ── Signal ────────────────────────────────────────────────────────────────
  const signal = await createSignal({
    product_id:        productId,
    source_type:       "chat",
    source_ref:        `${sessionId}:0`,
    received_at:       receivedAt,
    raw_payload:       { sessionId, name: input.name, email: input.email, message: input.message.slice(0, 10_000) },
    processing_status: "received",
  })
  const signalId = signal.signal_id
  await updateSignal(signalId, { processing_status: "normalizing" })

  // ── Identity resolution ───────────────────────────────────────────────────
  let identityId: string
  const existing = await findIdentityByEmail(productId, input.email)
  if (existing) {
    identityId = existing.identity_id
  } else {
    const identity = await createIdentity({
      product_id:      productId,
      type:            "end_user",
      display_name:    input.name || undefined,
      email_addresses: [input.email],
    })
    identityId = identity.identity_id
  }

  // ── Conversation ──────────────────────────────────────────────────────────
  const conv = await createConversation({
    product_id:      productId,
    channel:         "chat",
    subject:         input.message.slice(0, 100),
    thread_key:      threadKey,
    participant_ids: [identityId],
    status:          "active",
    last_message_at: receivedAt,
  })
  const conversationId = conv.conversation_id

  if (ouStatus === "blocked") {
    await updateSignal(signalId, { processing_status: "linked" })
    logger.warn({ productId, signalId }, "OU monthly limit reached — chat intake blocked")
    return { signalId, conversationId, caseId: "", identityId, duplicate: false, ouStatus: "blocked", sessionId, isNewSession: true }
  }

  // ── Case ──────────────────────────────────────────────────────────────────
  const signalText = `From: ${input.name} <${input.email}>\n\n${input.message}`

  const newCase = await createCase({
    product_id:           productId,
    title:                input.message.slice(0, 200),
    reporter_identity_id: identityId,
    conversation_ids:     [conversationId],
    status:               "new",
    current_persona:      "frontline",
    signal_text:          signalText,
  })
  const caseId = newCase.case_id

  await transitionCase(caseId, "new", "enriching")

  await updateSignal(signalId, {
    identity_id:        identityId,
    conversation_id:    conversationId,
    case_id:            caseId,
    processing_status:  "normalized",
    normalized_payload: { signalText, fromEmail: input.email, fromName: input.name, threadKey, sessionId },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "case",
    entity_ref:  caseId,
    actor_type:  "system",
    actor_ref:   "chat-ingress",
    action:      "case.created",
    after_state: { caseId, status: "enriching", signalId, conversationId, sessionId },
    metadata:    { fromEmail: input.email, fromName: input.name, source: "chat" },
  })

  // ── Dispatch triage (Frontline worker) ───────────────────────────────────
  // Chat cases are fully automated: triage runs immediately on the first
  // message and auto_reply delivers the response to the SSE stream so the
  // widget receives it in real time — no operator intervention required.
  const jobId = newId("job_")
  await dispatch({
    actionType: "triage",
    productId,
    caseId,
    jobId,
    payload: { signalText, signalId },
  })

  logger.info({ caseId, jobId, sessionId }, "Chat triage job dispatched")

  await updateSignal(signalId, { processing_status: "linked" })

  return {
    signalId,
    conversationId,
    caseId,
    identityId,
    duplicate: false,
    sessionId,
    isNewSession: true,
    ...(ouStatus === "warning" ? { ouStatus: "warning" as const } : {}),
  }
}

// ── Append a message to an existing chat session ──────────────────────────────

export async function appendChatMessage(
  productId: string,
  sessionId: string,
  input: { message: string },
): Promise<{ signalId: string; conversationId: string; caseId: string }> {
  const receivedAt = new Date()
  const threadKey = `chat:${productId}:${sessionId}`

  const conv = await findConversationByThreadKey(productId, "chat", threadKey)
  if (!conv) throw new Error(`Chat session not found: ${sessionId}`)

  // Update conversation activity
  await updateConversation(conv.conversation_id, { last_message_at: receivedAt })

  // Create a follow-up signal tied to the existing conversation
  const signal = await createSignal({
    product_id:        productId,
    source_type:       "chat",
    source_ref:        `${sessionId}:${Date.now()}`,
    received_at:       receivedAt,
    raw_payload:       { sessionId, message: input.message.slice(0, 10_000) },
    processing_status: "received",
  })
  const signalId = signal.signal_id

  // Find linked case from conversation
  const db = (await import("../infra/db/client.js")).getDb()
  const rows = await db<{ case_id: string }[]>`
    SELECT case_id FROM cases
    WHERE ${conv.conversation_id} = ANY(conversation_ids)
      AND product_id = ${productId}
      AND status NOT IN ('resolved', 'closed')
    ORDER BY created_at DESC
    LIMIT 1
  `
  if (!rows[0]?.case_id) {
    // CHAT-UX-01 (b): No open case — session is resolved/closed.
    // Clean up the orphaned signal before throwing.
    await updateSignal(signalId, { processing_status: "linked" })
    throw new ChatSessionClosedError(sessionId)
  }
  const caseId = rows[0].case_id

  await updateSignal(signalId, {
    conversation_id:   conv.conversation_id,
    case_id:           caseId,
    processing_status: "linked",
    normalized_payload: { sessionId, message: input.message, threadKey },
  })

  logger.info({ productId, sessionId, signalId, caseId }, "Chat message appended to existing session")

  return { signalId, conversationId: conv.conversation_id, caseId }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSupportLeadEmail(leadAssignments: Record<string, unknown>): string | null {
  const lead = leadAssignments["support_lead"]
  return typeof lead === "string" && lead.includes("@") ? lead : null
}
