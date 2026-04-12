// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Customer account API — FEAT-017-B/C.
 *
 * POST /api/v1/saas/account/magic-link
 *   Rate-limited (3/email/15min). Looks up provisioning by email.
 *   Sends magic link if found. Always returns 200 (no email enumeration).
 *
 * POST /api/v1/saas/account/session
 *   Validates a magic link JWT (purpose=magic_link, exp=15min).
 *   Returns a session JWT (purpose=account_session, exp=1h).
 *
 * POST /api/v1/saas/account/billing-portal
 *   Auth: session JWT via Authorization: Bearer <token>.
 *   Creates a Stripe Customer Portal session and returns the redirect URL.
 *
 * All routes gated by PROVISIONING_ENABLED — return 404 if disabled.
 */

import { Hono }    from "hono"
import { z }       from "zod"
import jwt         from "jsonwebtoken"
import Stripe      from "stripe"
import { config }  from "../../shared/config.js"
import { logger }  from "../../shared/logger.js"
import { sendEmail } from "../../email/sender.js"
import {
  findProvisioningByEmail,
  findProvisioningBySlug,
} from "../../infra/db/repositories/provisionings.js"

export const saasAccountRouter = new Hono()

// ── Middleware: gate on PROVISIONING_ENABLED ──────────────────────────────────

saasAccountRouter.use("*", async (c, next) => {
  if (!config.PROVISIONING_ENABLED) {
    return c.json({ error: "NOT_FOUND" }, 404)
  }
  return next()
})

// ── Rate limiter for magic link (3 req / email / 15min) ───────────────────────

/** @internal — exported for unit tests only */ export const magicLinkRlMap = new Map<string, { count: number; resetAt: number }>()

function checkMagicLinkRateLimit(email: string): boolean {
  const now    = Date.now()
  const window = 15 * 60 * 1000
  // SEC-RL1: evict expired entries to prevent unbounded memory growth
  for (const [k, e] of magicLinkRlMap) {
    if (now > e.resetAt) magicLinkRlMap.delete(k)
  }
  const entry = magicLinkRlMap.get(email)
  if (!entry || now > entry.resetAt) {
    magicLinkRlMap.set(email, { count: 1, resetAt: now + window })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

/** @internal — for unit tests */ export function checkMagicLinkRateLimitForTest(email: string): boolean {
  return checkMagicLinkRateLimit(email)
}

// ── JWT helpers ──────────────────────────────���─────────────────────────────���──

interface MagicLinkClaims {
  sub:     string   // "customer:<email>"
  slug:    string
  purpose: "magic_link"
}

interface AccountSessionClaims {
  sub:     string   // "customer:<email>"
  slug:    string
  purpose: "account_session"
}

export function signMagicLinkToken(email: string, slug: string): string {
  const payload: MagicLinkClaims = { sub: `customer:${email}`, slug, purpose: "magic_link" }
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "15m", algorithm: "HS256" } as jwt.SignOptions)
}

export function signAccountSessionToken(email: string, slug: string): string {
  const payload: AccountSessionClaims = { sub: `customer:${email}`, slug, purpose: "account_session" }
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "1h", algorithm: "HS256" } as jwt.SignOptions)
}

export function verifyAccountSessionToken(token: string): AccountSessionClaims {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] })
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token")
  }
  const claims = decoded as Record<string, unknown>
  if (claims["purpose"] !== "account_session") {
    throw new Error("Token purpose is not account_session")
  }
  return decoded as AccountSessionClaims
}

// ── POST /api/v1/saas/account/magic-link ─────────────────────────────────────

const MagicLinkSchema = z.object({
  email: z.string().email(),
})

saasAccountRouter.post("/magic-link", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ ok: true, message: "If that email is registered, a link has been sent." }, 200)
  }

  const parsed = MagicLinkSchema.safeParse(body)
  if (!parsed.success) {
    // Always 200 — never reveal whether a parse error occurred
    return c.json({ ok: true, message: "If that email is registered, a link has been sent." }, 200)
  }

  const { email } = parsed.data

  if (!checkMagicLinkRateLimit(email)) {
    // Still 200 to prevent timing enumeration
    return c.json({ ok: true, message: "If that email is registered, a link has been sent." }, 200)
  }

  // Fire-and-forget: look up provisioning, send email if found
  findProvisioningByEmail(email)
    .then(async (prov) => {
      if (!prov) return  // no provisioning for this email — silently skip
      const token     = signMagicLinkToken(email, prov.org_slug)
      const magicLink = `${config.CONSOLE_ORIGIN ?? "https://nestfleet.dev"}/account/verify?token=${token}`
      await sendEmail({
        to:      email,
        subject: "Your NestFleet account link",
        text: [
          "Click the link below to access your NestFleet account (valid 15 minutes):",
          "",
          magicLink,
          "",
          "If you did not request this, you can safely ignore this email.",
        ].join("\n"),
        html: `<p>Click the link below to access your NestFleet account (valid 15 minutes):</p>
<p><a href="${magicLink}">${magicLink}</a></p>
<p><small>If you did not request this, you can safely ignore this email.</small></p>`,
      })
      logger.info({ email, slug: prov.org_slug }, "Magic link sent")
    })
    .catch((err: unknown) => {
      logger.error({ err, email }, "Magic link send failed (non-fatal)")
    })

  return c.json({ ok: true, message: "If that email is registered, a link has been sent." }, 200)
})

// ── POST /api/v1/saas/account/session ────────────────────────────────────────

const SessionSchema = z.object({
  token: z.string().min(1),
})

saasAccountRouter.post("/session", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400)
  }

  const parsed = SessionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ ok: false, error: "token is required" }, 400)
  }

  const { token } = parsed.data

  let claims: MagicLinkClaims
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] })
    if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid payload")
    const d = decoded as Record<string, unknown>
    if (d["purpose"] !== "magic_link") throw new Error("Wrong token purpose")
    claims = decoded as MagicLinkClaims
  } catch (err) {
    logger.debug({ err }, "Magic link token validation failed")
    return c.json({ ok: false, error: "Invalid or expired token" }, 401)
  }

  // Extract email from sub claim: "customer:<email>"
  const email = claims.sub.replace(/^customer:/, "")
  const slug  = claims.slug

  const sessionToken = signAccountSessionToken(email, slug)
  return c.json({ ok: true, sessionToken }, 200)
})

// ── POST /api/v1/saas/account/billing-portal ────────────────────────���────────

const BillingPortalSchema = z.object({
  return_url: z.string().url().optional(),
})

saasAccountRouter.post("/billing-portal", async (c) => {
  // Auth: extract session JWT from Authorization header
  const authHeader = c.req.header("authorization") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!bearerToken) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  let sessionClaims: AccountSessionClaims
  try {
    sessionClaims = verifyAccountSessionToken(bearerToken)
  } catch (err) {
    logger.debug({ err }, "Account session token validation failed")
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  const { slug } = sessionClaims

  // Look up provisioning for the Stripe customer ID
  const prov = await findProvisioningBySlug(slug)
  if (!prov) {
    return c.json({ ok: false, error: "Account not found" }, 404)
  }

  if (!prov.stripe_customer_id) {
    return c.json({ ok: false, error: "No billing record found for this account" }, 404)
  }

  if (!config.STRIPE_SECRET_KEY) {
    logger.error({ slug }, "Billing portal: STRIPE_SECRET_KEY not configured")
    return c.json({ ok: false, error: "Billing unavailable" }, 503)
  }

  let body: unknown
  try { body = await c.req.json() } catch { body = {} }

  const parsed = BillingPortalSchema.safeParse(body)
  const returnUrl = parsed.success && parsed.data.return_url
    ? parsed.data.return_url
    : `${config.CONSOLE_ORIGIN ?? "https://nestfleet.dev"}/account`

  const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   prov.stripe_customer_id,
      return_url: returnUrl,
    })
    return c.json({ ok: true, portal_url: session.url }, 200)
  } catch (err) {
    logger.error({ err, slug }, "Billing portal: Stripe session creation failed")
    return c.json({ ok: false, error: "Failed to create billing portal session" }, 503)
  }
})

// ── GET /api/v1/saas/account/me ──────────────────────────��────────────────────
// Returns provisioning info for the authenticated account session.

saasAccountRouter.get("/me", async (c) => {
  const authHeader = c.req.header("authorization") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!bearerToken) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  let sessionClaims: AccountSessionClaims
  try {
    sessionClaims = verifyAccountSessionToken(bearerToken)
  } catch {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  const prov = await findProvisioningBySlug(sessionClaims.slug)
  if (!prov) {
    return c.json({ ok: false, error: "Account not found" }, 404)
  }

  const baseDomain = config.CUSTOMER_BASE_DOMAIN
  const instanceUrl = `https://${prov.org_slug}.${baseDomain}`

  return c.json({
    ok:                   true,
    slug:                 prov.org_slug,
    plan:                 prov.plan,
    status:               prov.status,
    instanceUrl,
    provisionedAt:        prov.provisioned_at?.toISOString() ?? null,
    licenseExpiresAt:     prov.license_expires_at?.toISOString() ?? null,
    reactivationDeadline: prov.reactivation_deadline?.toISOString() ?? null,
  }, 200)
})
