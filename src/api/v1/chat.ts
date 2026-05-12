// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Operator chat reply API — DEFERRED-05.
 *
 * POST /api/v1/cases/:caseId/chat/reply
 *   Auth-gated (operator or admin). Sends a reply to the active chat session
 *   for the given case. Pushes the message to the SSE session registry so the
 *   widget receives it in real time.
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findCaseById } from "../../infra/db/repositories/cases.js"
import { findConversationById } from "../../infra/db/repositories/conversations.js"
import { findSignalsByCaseId, createSignal } from "../../infra/db/repositories/signals.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"
import { publish, hasListeners } from "../../chat/session-registry.js"
import { transitionCase } from "../../domain/case-state-machine.js"

export const chatApiRouter = new Hono<{ Variables: AuthVariables }>()

const ReplyBodySchema = z.object({
  message: z.string().min(1).max(4_000),
})

chatApiRouter.post(
  "/products/:productId/cases/:caseId/chat/reply",
  requireAuth(),
  requireRole("operator"),
  async (c) => {
    const caseId = c.req.param("caseId")
    const actor  = c.get("user")

    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = ReplyBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
    }

    const theCase = await findCaseById(caseId)
    if (!theCase) {
      return c.json({ error: "Case not found" }, 404)
    }

    // Find the chat conversation for this case
    let sessionId: string | null = null
    for (const convId of theCase.conversation_ids) {
      const conv = await findConversationById(convId)
      if (conv?.channel === "chat" && conv.thread_key) {
        // thread_key format: chat:{productId}:{sessionId}
        const parts = conv.thread_key.split(":")
        sessionId = parts[2] ?? null
        break
      }
    }

    if (!sessionId) {
      return c.json({ error: "No active chat session found for this case" }, 400)
    }

    const ts = new Date().toISOString()

    // Push reply to open SSE connections
    const hasConn = hasListeners(sessionId)
    logger.info({ caseId, sessionId, hasSSEListener: hasConn }, "Operator chat reply — publishing to SSE")
    publish(sessionId, {
      type: "message",
      role: "operator",
      text: parsed.data.message,
      ts,
    })

    // ── First operator reply: transition to in-resolution ────────────────────
    // Triage runs automatically at session start (chat-ingress). When an operator
    // also replies manually it means they have picked up the case — transition
    // to `in-resolution` to reflect that. Uses null "from" state so it succeeds
    // regardless of where triage left the case.
    const allSignals = await findSignalsByCaseId(caseId)
    const priorReplies = allSignals.filter(
      (s) => (s.normalized_payload as Record<string, unknown>)?.direction === "outbound"
    )

    // Always record every reply as an outbound signal so the conversation thread is complete
    const chatConvId = (await (async () => {
      for (const convId of theCase.conversation_ids) {
        const conv = await findConversationById(convId)
        if (conv?.channel === "chat") return convId
      }
      return null
    })())

    if (chatConvId) {
      const replyIndex = priorReplies.length
      const replySignal = await createSignal({
        product_id:        theCase.product_id,
        source_type:       "chat",
        source_ref:        `${sessionId}:reply:${replyIndex}`,
        received_at:       new Date(),
        raw_payload:       { sessionId, message: parsed.data.message, direction: "outbound" },
        processing_status: "received",
      })
      await import("../../infra/db/repositories/signals.js").then(({ updateSignal }) =>
        updateSignal(replySignal.signal_id, {
          conversation_id:    chatConvId,
          case_id:            caseId,
          processing_status:  "linked",
          normalized_payload: {
            sessionId,
            message:   parsed.data.message,
            direction: "outbound",
            fromEmail: actor.email,
          },
        })
      )
    }

    if (priorReplies.length === 0) {
      // Transition directly to in-resolution — no steward routing for chat
      await transitionCase(caseId, null, "in-resolution", {
        current_persona: "steward",
        summary: `Operator ${actor.email} replied directly via chat`,
      }).catch((err) => logger.warn({ err, caseId }, "Chat in-resolution transition failed (non-fatal)"))

      logger.info({ caseId, sessionId }, "First operator reply on chat — transitioned to in-resolution (no triage)")
    }

    // Audit trail
    await createAuditEvent({
      product_id:  theCase.product_id,
      entity_type: "case",
      entity_ref:  caseId,
      actor_type:  "operator",
      actor_ref:   actor.email,
      action:      "case.chat_reply",
      after_state: { caseId, sessionId, message: parsed.data.message.slice(0, 200) },
      metadata:    { operatorEmail: actor.email, channel: "chat" },
    })

    logger.info({ caseId, sessionId, operator: actor.email }, "Operator chat reply sent")
    return c.json({ ok: true, ts })
  },
)
