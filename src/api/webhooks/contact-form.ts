/**
 * Contact form webhook — DEFERRED-13.
 *
 * POST /webhooks/contact-form/submit/:productId
 *
 * Public endpoint — no JWT required.
 * Authenticates via a per-product public API key (cf_pub_) in the request body.
 * Rate-limited to 10 submissions per product+IP per minute.
 *
 * Returns 200 for all valid requests (including OU-blocked) to avoid leaking
 * internal state to anonymous callers. Returns 400 only for structural errors
 * (missing fields, invalid key). Returns 429 on rate limit.
 *
 * Future: Option C — origin allowlist per product (support_policy.contactFormAllowedOrigins).
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { decryptSecret } from "../../shared/crypto.js"
import { ingestContactFormSignal } from "../../ingress/contact-form-ingress.js"

export const contactFormRouter = new Hono()

// ── Input schema ──────────────────────────────────────────────────────────────

const ContactFormBodySchema = z.object({
  public_key: z.string().min(1),
  name:       z.string().min(1).max(200),
  email:      z.string().email().max(320),
  subject:    z.string().min(1).max(300),
  message:    z.string().min(1).max(10_000),
})

// ── Simple in-memory rate limiter (10 req / product+IP / 60 s) ───────────────
// INFRA-03: keyed by productId:ip so products behind a shared egress IP (corporate
// proxies, CDNs) don't bleed into each other's rate limit buckets.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 60_000
const RATE_MAX       = 10

function checkRateLimit(productId: string, ip: string): boolean {
  const key   = `${productId}:${ip}`
  const now   = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_MAX) return false
  entry.count++
  return true
}

// ── Route ─────────────────────────────────────────────────────────────────────

contactFormRouter.post("/submit/:productId", async (c) => {
  const productId = c.req.param("productId")

  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
           ?? c.req.header("x-real-ip")
           ?? "unknown"

  if (!checkRateLimit(productId, ip)) {
    return c.json({ ok: false, error: "Too many requests. Please try again later." }, 429)
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = ContactFormBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Invalid form data", details: parsed.error.issues }, 400)
  }

  const { public_key, ...form } = parsed.data

  // ── Validate product + public key ─────────────────────────────────────────
  const product = await findProductById(productId).catch(() => null)
  if (!product) {
    // Return generic error — don't confirm whether product exists
    return c.json({ ok: false, error: "Invalid product or API key" }, 400)
  }

  const policy        = (product.support_policy ?? {}) as Record<string, unknown>
  const storedKeyEnc  = policy["contactFormPublicKey"] as string | undefined
  const storedKey     = decryptSecret(storedKeyEnc)

  if (!storedKey || storedKey !== public_key) {
    logger.warn({ productId, ip }, "Contact form: invalid public key")
    return c.json({ ok: false, error: "Invalid product or API key" }, 400)
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  try {
    const result = await ingestContactFormSignal(productId, form)

    if (result.duplicate) {
      // Return success to the end user — no need to expose dedup behaviour
      return c.json({ ok: true }, 200)
    }

    if (result.ouStatus === "blocked") {
      // Return success — the user doesn't need to know about billing limits
      logger.info({ productId, ip }, "Contact form accepted but OU-blocked")
      return c.json({ ok: true }, 200)
    }

    logger.info({ productId, caseId: result.caseId, ip }, "Contact form ingested")
    return c.json({ ok: true }, 200)

  } catch (err) {
    logger.error({ err, productId, ip }, "Contact form ingestion failed")
    return c.json({ ok: false, error: "Internal error. Please try again." }, 500)
  }
})
