/**
 * Generic external webhook — FEAT-003 Slice 2.
 *
 * POST /webhooks/external/:productId
 *
 * Accepts inbound messages from any external channel (Telegram bots, Discord bots,
 * custom integrations, etc.) that the product owner controls.
 *
 * Authentication: Authorization: Bearer <api-key>
 *   The API key is stored encrypted in product.support_policy.externalWebhookApiKey.
 *   Setting it is done via PATCH /api/v1/products/:productId (not this endpoint).
 *
 * Duplicate delivery is handled idempotently via content-hash source_ref.
 * Thread dedup is handled via channel_thread_id (threadId from caller).
 *
 * Returns 200 for all valid requests, 400 for bad input, 401 for bad key,
 * 500 if the ingress pipeline fails (caller should retry).
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { decryptSecret } from "../../shared/crypto.js"
import { ingestExternalSignal } from "../../ingress/external-ingress.js"

export const externalWebhookRouter = new Hono()

// ── Input schema ──────────────────────────────────────────────────────────────

const ExternalWebhookBodySchema = z.object({
  threadId:       z.string().min(1).max(500),
  senderName:     z.string().min(1).max(200),
  senderRef:      z.string().min(1).max(500),
  message:        z.string().min(1).max(10_000),
  channelContext: z.record(z.unknown()).optional(),
})

// ── Route ─────────────────────────────────────────────────────────────────────

externalWebhookRouter.post("/:productId", async (c) => {
  const productId = c.req.param("productId")

  // ── Authenticate via Bearer token ─────────────────────────────────────────
  const authHeader = c.req.header("Authorization") ?? ""
  const match      = /^Bearer\s+(.+)$/.exec(authHeader)
  const providedKey = match?.[1]?.trim()

  if (!providedKey) {
    return c.json({ ok: false, error: "Missing Authorization header" }, 401)
  }

  // ── Load product ──────────────────────────────────────────────────────────
  const product = await findProductById(productId).catch(() => null)
  if (!product) {
    // Don't reveal whether the product exists — return 401
    return c.json({ ok: false, error: "Invalid product or API key" }, 401)
  }

  const policy      = (product.support_policy ?? {}) as Record<string, unknown>
  const storedKeyEnc = policy["externalWebhookApiKey"] as string | undefined
  const storedKey   = decryptSecret(storedKeyEnc)

  if (!storedKey || storedKey !== providedKey) {
    logger.warn({ productId }, "External webhook: invalid API key")
    return c.json({ ok: false, error: "Invalid product or API key" }, 401)
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = ExternalWebhookBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Invalid request", details: parsed.error.issues }, 400)
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  try {
    const { threadId, senderName, senderRef, message, channelContext } = parsed.data
    const result = await ingestExternalSignal(productId, {
      threadId,
      senderName,
      senderRef,
      message,
      ...(channelContext !== undefined ? { channelContext } : {}),
    })

    if (result.duplicate) {
      return c.json({ ok: true, duplicate: true }, 200)
    }

    if (result.ouStatus === "blocked") {
      logger.info({ productId }, "External webhook accepted but OU-blocked")
      return c.json({ ok: true }, 200)
    }

    return c.json({
      ok:             true,
      duplicate:      false,
      signalId:       result.signalId,
      caseId:         result.caseId,
      conversationId: result.conversationId,
      channelThreadId: result.channelThreadId,
      ...(result.canary ? { canary: true } : {}),
    }, 200)
  } catch (err) {
    logger.error({ err, productId }, "External webhook ingestion failed")
    return c.json({ ok: false, error: "Internal error — will retry" }, 500)
  }
})
