// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Chat widget webhook routes — DEFERRED-05.
 *
 * POST /webhooks/chat/message/:productId
 *   Public. Authenticated via per-product chat public key (ch_pub_).
 *   First message (session_id absent) starts a new session.
 *   Subsequent messages (session_id present) append to the existing session.
 *   Rate-limited: 30 messages / session / 60 s; 60 messages / IP / 60 s.
 *
 * GET /widget/chat-stream/:productId/:sessionId
 *   Public SSE endpoint. Widget opens this to receive replies in real time.
 *   Sends a keepalive ping every 15 s. Auto-closes after CHAT_SESSION_TTL_HOURS.
 */

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { decryptSecret } from "../../shared/crypto.js"
import { subscribe, publish } from "../../chat/session-registry.js"
import { publish as publishOperator } from "../../notifications/operator-registry.js"
import { startChatSession, appendChatMessage, ChatSessionClosedError } from "../../ingress/chat-ingress.js"
import { config } from "../../shared/config.js"

export const chatRouter = new Hono()

// ── Rate limiters ─────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000

// Per-session: 30 messages / 60 s (prevents runaway loops)
/** @internal — exported for unit tests only */ export const sessionRateMap = new Map<string, { count: number; resetAt: number }>()
const SESSION_RATE_MAX = 30

// Per-IP: 60 messages / 60 s
/** @internal — exported for unit tests only */ export const ipRateMap = new Map<string, { count: number; resetAt: number }>()
const IP_RATE_MAX = 60

function checkRate(map: Map<string, { count: number; resetAt: number }>, key: string, max: number): boolean {
  const now = Date.now()
  // SEC-RL1: evict expired entries to prevent unbounded memory growth
  for (const [k, e] of map) {
    if (now > e.resetAt) map.delete(k)
  }
  const entry = map.get(key)
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

/** @internal — for unit tests */ export function checkRateForTest(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  max: number,
): boolean {
  return checkRate(map, key, max)
}

// ── Input schema ──────────────────────────────────────────────────────────────

const ChatMessageBodySchema = z.object({
  public_key: z.string().min(1),
  session_id: z.string().optional(),
  name:       z.string().max(200).optional().default(""),
  email:      z.string().max(320).optional().default(""),
  message:    z.string().min(1).max(4_000),
})

// ── POST /webhooks/chat/message/:productId ────────────────────────────────────

chatRouter.post("/message/:productId", async (c) => {
  const productId = c.req.param("productId")

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
           ?? c.req.header("x-real-ip")
           ?? "unknown"

  if (!checkRate(ipRateMap, ip, IP_RATE_MAX)) {
    return c.json({ ok: false, error: "Too many requests. Please try again later." }, 429)
  }

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = ChatMessageBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues, rawBody }, "Chat: request validation failed")
    return c.json({ ok: false, error: "Invalid request", details: parsed.error.issues }, 400)
  }

  const { public_key, session_id, name, email, message } = parsed.data

  // ── Validate product + public key ────────────────────────────────────────
  const product = await findProductById(productId).catch(() => null)
  if (!product) {
    return c.json({ ok: false, error: "Invalid product or API key" }, 400)
  }

  const policy = (product.support_policy ?? {}) as Record<string, unknown>

  // Check chat is enabled (defaults to true if not explicitly disabled)
  if (policy["chatEnabled"] === false) {
    return c.json({ ok: false, error: "Chat is not enabled for this product" }, 400)
  }

  const storedKeyEnc = policy["chatPublicKey"] as string | undefined
  const storedKey    = decryptSecret(storedKeyEnc)

  if (!storedKey || storedKey !== public_key) {
    logger.warn({ productId, ip }, "Chat: invalid public key")
    return c.json({ ok: false, error: "Invalid product or API key" }, 400)
  }

  // ── Per-session rate limit (after key validation) ─────────────────────────
  if (session_id && !checkRate(sessionRateMap, session_id, SESSION_RATE_MAX)) {
    return c.json({ ok: false, error: "Too many messages in this session. Please wait." }, 429)
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  try {
    if (!session_id) {
      // First message — start a new session
      const result = await startChatSession(productId, { name, email, message })

      if (result.ouStatus === "blocked") {
        // Silently accept — user doesn't need to know about billing limits
        return c.json({ ok: true, session_id: result.sessionId, is_new_session: true }, 200)
      }

      logger.info({ productId, caseId: result.caseId, sessionId: result.sessionId, ip }, "Chat session started")

      // INFRA-01: Notify operator console about new inbound chat message
      if (result.caseId) {
        publishOperator(productId, {
          type:      "chat_message",
          productId,
          caseId:    result.caseId,
          sessionId: result.sessionId,
          text:      message.slice(0, 200),
          ts:        new Date().toISOString(),
        })
      }

      return c.json({ ok: true, session_id: result.sessionId, is_new_session: true }, 200)
    } else {
      // Subsequent message — append to existing session
      const appended = await appendChatMessage(productId, session_id, { message })

      // Publish the user message into the SSE stream so the operator console
      // can see it in real time (useful when viewing the case live).
      publish(session_id, {
        type: "message",
        role: "agent",   // placeholder; future: "user" role for inbound display
        text:  message,
        ts:   new Date().toISOString(),
      })

      // INFRA-01: Notify operator console about the follow-up message
      publishOperator(productId, {
        type:      "chat_message",
        productId,
        caseId:    appended.caseId,
        sessionId: session_id,
        text:      message.slice(0, 200),
        ts:        new Date().toISOString(),
      })

      logger.info({ productId, sessionId: session_id, ip }, "Chat message appended")
      return c.json({ ok: true, session_id, is_new_session: false }, 200)
    }
  } catch (err) {
    if (err instanceof ChatSessionClosedError) {
      return c.json({ ok: false, error: "Chat session is closed.", session_closed: true }, 409)
    }
    logger.error({ err, productId, ip }, "Chat ingestion failed")
    return c.json({ ok: false, error: "Internal error. Please try again." }, 500)
  }
})

// ── GET /widget/chat-stream/:productId/:sessionId  (SSE) ──────────────────────

chatRouter.get("/stream/:productId/:sessionId", async (c) => {
  const productId = c.req.param("productId")
  const sessionId = c.req.param("sessionId")

  // Validate the session exists (prevent arbitrary session polling)
  const threadKey = `chat:${productId}:${sessionId}`
  const { findConversationByThreadKey } = await import("../../infra/db/repositories/conversations.js")
  const conv = await findConversationByThreadKey(productId, "chat", threadKey).catch(() => null)
  if (!conv) {
    return c.json({ error: "Session not found" }, 404)
  }

  const ttlMs = (config.CHAT_SESSION_TTL_HOURS ?? 24) * 60 * 60 * 1000

  return streamSSE(c, async (stream) => {
    logger.info({ productId, sessionId }, "SSE stream opened")

    // Send an initial connected event
    await stream.writeSSE({ data: JSON.stringify({ type: "connected", ts: new Date().toISOString() }), event: "chat" })

    // Hold the handler open until the stream closes
    await new Promise<void>((resolve) => {
      let pingTimer: ReturnType<typeof setInterval>
      let ttlTimer: ReturnType<typeof setTimeout>

      const cleanup = () => {
        clearInterval(pingTimer)
        clearTimeout(ttlTimer)
        unsubscribe()
        resolve()
      }

      const unsubscribe = subscribe(sessionId, async (msg) => {
        try {
          await stream.writeSSE({ data: JSON.stringify(msg), event: "chat" })
        } catch {
          cleanup()
        }
      })

      // Keepalive ping every 15 s
      pingTimer = setInterval(async () => {
        try {
          await stream.writeSSE({
            data:  JSON.stringify({ type: "ping", ts: new Date().toISOString() }),
            event: "chat",
          })
        } catch {
          cleanup()
        }
      }, 15_000)

      // Auto-close after TTL
      ttlTimer = setTimeout(() => {
        stream.close()
        cleanup()
      }, ttlMs)

      // Cleanup on client disconnect
      stream.onAbort(() => {
        logger.info({ productId, sessionId }, "SSE stream closed by client")
        cleanup()
      })
    })
  })
})
