// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * SaaS signup API — FEAT-001.
 *
 * POST /api/v1/saas/signup
 *   Validates slug, creates signup_intent, creates Stripe checkout session.
 *   Returns { checkoutUrl } — browser redirects to Stripe.
 *
 * GET /api/v1/saas/status/:intentId
 *   Returns current provisioning status for the signup page to poll after redirect.
 *
 * Rate limited: 5 req / IP / 60s to prevent slug enumeration.
 * Gated by PROVISIONING_ENABLED — returns 404 if disabled.
 */

import { Hono } from "hono"
import Stripe from "stripe"
import { z } from "zod"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { ValidationError, NotFoundError } from "../../shared/errors.js"
import { validateAndCheckSlug } from "../provisioning/slug.js"
import {
  createSignupIntent,
  findSignupIntentById,
  findProvisioningByIntentId,
} from "../../infra/db/repositories/provisionings.js"

export const saasRouter = new Hono()

// ── Rate limiter (IP-based, simple in-memory) ─────────────────────────────────

const rlMap = new Map<string, { count: number; resetAt: number }>()

function checkSaasRateLimit(ip: string): boolean {
  const now   = Date.now()
  const entry = rlMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rlMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

// ── Middleware: gate on PROVISIONING_ENABLED ──────────────────────────────────

saasRouter.use("*", async (c, next) => {
  if (!config.PROVISIONING_ENABLED) {
    return c.json({ error: "NOT_FOUND" }, 404)
  }
  return next()
})

// ── POST /api/v1/saas/signup ─────────────────────────────────────────────────

const SignupSchema = z.object({
  email:       z.string().email(),
  slug:        z.string(),
  plan:        z.enum(["starter", "growth", "scale"]),
  companyName: z.string().min(1).max(200).optional(),
})

saasRouter.post("/signup", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
          ?? c.req.header("x-real-ip")
          ?? "unknown"

  if (!checkSaasRateLimit(ip)) {
    return c.json({ ok: false, error: "Too many requests. Please wait a moment." }, 429)
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    throw new ValidationError("Invalid JSON body")
  }

  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError("Invalid signup data", parsed.error.flatten().fieldErrors)
  }

  const { email, slug, plan } = parsed.data

  // Validate slug (format + uniqueness DB check)
  const slugResult = await validateAndCheckSlug(slug)
  if (!slugResult.ok) {
    throw new ValidationError(slugResult.error)
  }

  // Create signup intent
  const intent = await createSignupIntent({ email, orgSlug: slug, plan })

  // Create Stripe checkout session
  const priceId = getPriceIdForPlan(plan)
  if (!priceId) {
    logger.error({ plan }, "SaaS signup: no Stripe price ID configured for plan")
    throw new ValidationError(`No price configured for plan '${plan}' — contact support`)
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" })

  const session = await stripe.checkout.sessions.create({
    mode:                "subscription",
    payment_method_types: ["card"],
    line_items:          [{ price: priceId, quantity: 1 }],
    customer_email:      email,
    metadata: {
      event_type: "saas_signup",
      intent_id:  intent.id,
      slug,
      email,
      plan,
    },
    success_url: `${config.CONSOLE_ORIGIN ?? "https://nestfleet.dev"}/signup/success?intent=${intent.id}`,
    cancel_url:  `${config.CONSOLE_ORIGIN ?? "https://nestfleet.dev"}/signup?cancelled=1`,
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        event_type: "saas_subscription",
        intent_id:  intent.id,
        slug,
      },
    },
  })

  logger.info({ intentId: intent.id, slug, plan }, "SaaS signup: checkout session created")

  return c.json({ ok: true, checkoutUrl: session.url }, 200)
})

// ── GET /api/v1/saas/status/:intentId ────────────────────────────────────────

saasRouter.get("/status/:intentId", async (c) => {
  const intentId = c.req.param("intentId")

  const intent = await findSignupIntentById(intentId)
  if (!intent) throw new NotFoundError("signup_intent", intentId)

  const prov = await findProvisioningByIntentId(intentId)
  const status = prov?.status ?? "pending_payment"

  // Derive provisioning step from DB state so the frontend can render a progress bar:
  //   1 = payment received, job queued (status = pending)
  //   2 = creating VPS              (provisioning, no hetzner_server_id yet)
  //   3 = configuring DNS           (provisioning, VPS ready, no cloudflare_record_id)
  //   4 = health polling            (provisioning, VPS + DNS ready)
  //   null for terminal states (pending_payment / active / failed)
  let step: number | null = null
  if (status === "pending") {
    step = 1
  } else if (status === "provisioning") {
    if (!prov?.hetzner_server_id) step = 2
    else if (!prov?.cloudflare_record_id) step = 3
    else step = 4
  }

  return c.json({
    ok:   true,
    status,
    slug: intent.org_slug,
    ...(step !== null ? { step } : {}),
    ...(step === 4 && prov?.last_health_status ? { healthDetail: prov.last_health_status } : {}),
    ...(step === 4 && prov?.last_health_check_at ? { lastHealthCheckAt: prov.last_health_check_at } : {}),
    ...(prov?.provisioned_at ? { provisionedAt: prov.provisioned_at } : {}),
    ...(status === "failed" ? { error: prov?.error_message } : {}),
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPriceIdForPlan(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: config.STRIPE_PRICE_STARTER_MONTHLY,
    growth:  config.STRIPE_PRICE_GROWTH_MONTHLY,
    // scale not in existing config — reuse growth for now; extend when scale tier is defined
  }
  return map[plan]
}
