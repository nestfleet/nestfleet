// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Inbound email webhook route — SLICE-01.
 *
 * POST /webhooks/email/inbound/:productId
 *
 * Accepts Postmark inbound webhook format (de-facto standard).
 * Validates payload, parses email, runs the signal ingress pipeline.
 *
 * Returns 200 immediately after enqueuing — Postmark will retry on 5xx only.
 * Duplicate delivery is handled idempotently (returns 200 with duplicate:true).
 */

import { Hono } from "hono"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { parsePostmarkInbound, PostmarkInboundSchema } from "../../email/parser.js"
import { ingestEmailSignal } from "../../ingress/signal-ingress.js"

export const emailWebhookRouter = new Hono()

emailWebhookRouter.post(
  "/inbound/:productId",
  async (c) => {
    // ── Auth guard (SEC-C5): fail-closed regardless of whether secret is set ──
    const secret   = config.EMAIL_WEBHOOK_SECRET
    const provided = c.req.header("X-Webhook-Secret")
    if (!secret || provided !== secret) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const productId = c.req.param("productId")

    // ── Parse body ────────────────────────────────────────────────────────────
    let rawBody: unknown
    try {
      rawBody = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    // ── Validate Postmark schema ───────────────────────────────────────────────
    const parsed = PostmarkInboundSchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn(
        { productId, issues: parsed.error.issues },
        "Inbound webhook: invalid payload schema",
      )
      return c.json({ error: "Invalid Postmark inbound payload", details: parsed.error.issues }, 400)
    }

    // ── Parse into normalised email ───────────────────────────────────────────
    let email: ReturnType<typeof parsePostmarkInbound>
    try {
      email = parsePostmarkInbound(parsed.data)
    } catch (err) {
      logger.warn({ err, productId }, "Inbound webhook: email parsing failed")
      return c.json({ error: "Email parsing failed" }, 400)
    }

    logger.info(
      { productId, messageId: email.messageId, fromEmail: email.fromEmail, subject: email.subject },
      "Inbound email webhook received",
    )

    // ── Run signal ingress pipeline ───────────────────────────────────────────
    try {
      const result = await ingestEmailSignal(productId, email)

      if (result.duplicate) {
        logger.info({ productId, messageId: email.messageId }, "Duplicate email signal — skipped")
        return c.json({ ok: true, duplicate: true }, 200)
      }

      return c.json({
        ok:             true,
        duplicate:      false,
        signalId:       result.signalId,
        caseId:         result.caseId,
        conversationId: result.conversationId,
        identityId:     result.identityId,
      }, 200)
    } catch (err) {
      // Log and return 500 so Postmark will retry
      logger.error({ err, productId, messageId: email.messageId }, "Signal ingress pipeline failed")
      return c.json({ error: "Internal error — will retry" }, 500)
    }
  },
)
