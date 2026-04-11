// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Owner fleet API — FEAT-001 (NF-OPS-01 subset).
 *
 * Minimal fleet management endpoints for the main NestFleet instance operator.
 * Auth: Bearer JWT with user ID in OWNER_USER_IDS config (no DB RBAC needed for Phase 1).
 *
 * GET  /api/v1/owner/fleet            — paginated provisioning list
 * GET  /api/v1/owner/fleet/:slug      — single provisioning detail
 * POST /api/v1/owner/fleet/:slug/reset       — Hetzner server power reset
 * POST /api/v1/owner/fleet/:slug/deprovision — start 30-day grace period (or immediate)
 * POST /api/v1/owner/fleet/:slug/retry       — re-enqueue provision_vps for failed rows
 * GET  /api/v1/owner/telemetry        — last-24h telemetry aggregation (NF-OPS-01 Phase 2)
 *
 * OWN-NC: Owner-initiated customer provisioning (semi-manual onboarding flow)
 * GET  /api/v1/owner/slug-check/:slug — validate slug format + DB uniqueness
 * POST /api/v1/owner/new-customer     — create signup intent + Stripe checkout session
 *
 * FEAT-012: License reissue
 * POST /api/v1/owner/fleet/:slug/reissue-license       — queue license reissue job
 * POST /api/v1/owner/fleet/reissue-license-bulk        — queue N reissue jobs (renewal)
 * GET  /api/v1/owner/fleet/:slug/license-history       — last 10 reissue records
 * GET  /api/v1/owner/fleet/:slug/license-jwt-download  — download pending JWT for failed reissue
 */

import { Hono } from "hono"
import { z } from "zod"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { verifyJwt } from "../../auth/jwt.js"
import { ValidationError, AuthenticationError, AuthorizationError, NotFoundError } from "../../shared/errors.js"
import {
  listProvisionings,
  findProvisioningBySlug,
  updateProvisioning,
} from "../../infra/db/repositories/provisionings.js"
import { createHetznerClient } from "../provisioning/hetzner-client.js"
import { deprovisionOne, startDeprovisioning } from "../provisioning/deprovision.js"
import { getBoss } from "../../infra/queue/boss.js"
import { PROVISION_JOB } from "../workers/provisioning-worker.js"
import Stripe from "stripe"
import { getStripeClient } from "../../billing/stripe.js"
import { aggregateRevenue, buildCohorts } from "../../billing/stripe-revenue.js"
import type { RevenueData, CohortWeek } from "../../billing/stripe-revenue.js"
import { getRecentTelemetry, countDistinctInstances } from "../../infra/db/repositories/telemetry.js"
import { validateAndCheckSlug } from "../provisioning/slug.js"
import { createSignupIntent } from "../../infra/db/repositories/provisionings.js"
import {
  createLicenseReissue,
  listLicenseReissues,
  findFailedPendingJwt,
  clearPendingJwt,
} from "../../infra/db/repositories/license-reissues.js"
import { LICENSE_REISSUE_JOB } from "../workers/license-reissue-worker.js"

// ── Revenue cache (5 min TTL) ─────────────────────────────────────────────────

interface CacheEntry<T> { data: T; expiresAt: number }
let revenueCache:  CacheEntry<RevenueData>  | null = null
let cohortsCache:  CacheEntry<CohortWeek[]> | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

/** Test helper — reset in-memory cache between test cases. */
export function _resetOwnerCache(): void {
  revenueCache = null
  cohortsCache = null
}

export const ownerRouter = new Hono()

// ── Auth middleware ───────────────────────────────────────────────────────────

ownerRouter.use("*", async (c, next) => {
  if (!config.PROVISIONING_ENABLED) {
    return c.json({ error: "NOT_FOUND" }, 404)
  }

  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError()
  }

  let user: ReturnType<typeof verifyJwt>
  try {
    user = verifyJwt(authHeader.slice("Bearer ".length))
  } catch {
    throw new AuthenticationError()
  }

  // Check user is in OWNER_USER_IDS
  const ownerIds = (config.OWNER_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (!ownerIds.includes(user.sub)) {
    throw new AuthorizationError("Owner access required")
  }

  return next()
})

// ── GET /owner/me ─────────────────────────────────────────────────────────────

ownerRouter.get("/me", (c) => {
  return c.json({ ok: true, isOwner: true })
})

// ── GET /owner/revenue ────────────────────────────────────────────────────────

ownerRouter.get("/revenue", async (c) => {
  const now = Date.now()
  if (revenueCache && revenueCache.expiresAt > now) {
    return c.json({ ok: true, data: revenueCache.data })
  }

  try {
    const stripe = getStripeClient()
    const subs: Awaited<ReturnType<typeof stripe.subscriptions.list>>["data"] = []
    let page = await stripe.subscriptions.list({ limit: 100, status: "all" })
    subs.push(...page.data)
    while (page.has_more) {
      page = await stripe.subscriptions.list({
        limit: 100,
        status: "all",
        starting_after: page.data.at(-1)!.id,
      })
      subs.push(...page.data)
    }

    const data = await aggregateRevenue(subs as never)
    revenueCache = { data, expiresAt: now + CACHE_TTL_MS }
    return c.json({ ok: true, data })
  } catch (err) {
    logger.error({ err }, "Owner: revenue aggregation failed")
    return c.json({ ok: false, error: "Failed to fetch revenue data" }, 503)
  }
})

// ── GET /owner/cohorts ────────────────────────────────────────────────────────

ownerRouter.get("/cohorts", async (c) => {
  const now = Date.now()
  if (cohortsCache && cohortsCache.expiresAt > now) {
    return c.json({ ok: true, data: cohortsCache.data })
  }

  try {
    const stripe = getStripeClient()
    const subs: Awaited<ReturnType<typeof stripe.subscriptions.list>>["data"] = []
    let page = await stripe.subscriptions.list({ limit: 100, status: "all" })
    subs.push(...page.data)
    while (page.has_more) {
      page = await stripe.subscriptions.list({
        limit: 100,
        status: "all",
        starting_after: page.data.at(-1)!.id,
      })
      subs.push(...page.data)
    }

    const data = await buildCohorts(subs as never)
    cohortsCache = { data, expiresAt: now + CACHE_TTL_MS }
    return c.json({ ok: true, data })
  } catch (err) {
    logger.error({ err }, "Owner: cohorts aggregation failed")
    return c.json({ ok: false, error: "Failed to fetch cohort data" }, 503)
  }
})

// ── GET /owner/telemetry ──────────────────────────────────────────────────────

ownerRouter.get("/telemetry", async (c) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [rows, activeInstances] = await Promise.all([
    getRecentTelemetry(since),
    countDistinctInstances(since),
  ])

  // Build version distribution: { version -> count }
  const versionMap = new Map<string, number>()
  for (const row of rows) {
    versionMap.set(row.version, (versionMap.get(row.version) ?? 0) + 1)
  }
  const versionDistribution = Array.from(versionMap.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)

  // Most recent ping per instance
  const instanceMap = new Map<string, string>()
  for (const row of rows) {
    if (!instanceMap.has(row.instance_id)) {
      instanceMap.set(row.instance_id, row.reported_at)
    }
  }
  const instances = Array.from(instanceMap.entries()).map(([instanceId, lastSeenAt]) => ({
    instanceId,
    lastSeenAt,
  }))

  return c.json({
    ok:   true,
    data: {
      activeInstances,
      versionDistribution,
      instances,
      since: since.toISOString(),
    },
  })
})

// ── GET /owner/fleet ──────────────────────────────────────────────────────────

ownerRouter.get("/fleet", async (c) => {
  const limit  = Math.min(parseInt(c.req.query("limit")  ?? "50", 10), 100)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)
  const status = c.req.query("status")

  const { rows, total } = await listProvisionings({
    limit,
    offset,
    ...(status !== undefined ? { status } : {}),
  })

  return c.json({ ok: true, data: rows, total, limit, offset })
})

// ── GET /owner/fleet/:slug ────────────────────────────────────────────────────

ownerRouter.get("/fleet/:slug", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)
  return c.json({ ok: true, data: prov })
})

// ── POST /owner/fleet/:slug/reset ─────────────────────────────────────────────

ownerRouter.post("/fleet/:slug/reset", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  if (!prov.hetzner_server_id) {
    throw new ValidationError("No Hetzner server ID for this provisioning")
  }

  const hetzner = createHetznerClient(config.HETZNER_API_TOKEN!)
  await hetzner.resetServer(prov.hetzner_server_id)

  logger.info({ slug, serverId: prov.hetzner_server_id }, "Owner: server reset initiated")
  return c.json({ ok: true, message: "Server reset initiated. Services will restart automatically." })
})

// ── POST /owner/fleet/:slug/deprovision ───────────────────────────────────────

const DeprovisionSchema = z.object({
  immediate: z.boolean().optional().default(false),
  graceDays: z.number().int().min(0).max(90).optional().default(30),
})

ownerRouter.post("/fleet/:slug/deprovision", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  if (prov.status === "deprovisioned") {
    return c.json({ ok: true, message: "Already deprovisioned" })
  }

  let body: unknown = {}
  try { body = await c.req.json() } catch { /* no body */ }

  const parsed = DeprovisionSchema.safeParse(body)
  if (!parsed.success) throw new ValidationError("Invalid request body")

  const { immediate, graceDays } = parsed.data

  if (immediate) {
    logger.warn({ slug }, "Owner: immediate deprovision requested")
    await deprovisionOne(prov)
    return c.json({ ok: true, message: "Deprovisioned immediately" })
  }

  await startDeprovisioning(prov, graceDays)
  return c.json({
    ok:      true,
    message: `Grace period started (${graceDays} days). Nightly job will deprovision after expiry.`,
  })
})

// ── POST /owner/fleet/:slug/retry ─────────────────────────────────────────────

ownerRouter.post("/fleet/:slug/retry", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  if (prov.status === "active") {
    return c.json({ ok: true, message: "Already active — no retry needed" })
  }
  if (prov.status !== "failed") {
    throw new ValidationError(`Cannot retry a provisioning in status '${prov.status}'`)
  }

  // Reset to pending so the saga re-evaluates from current DB state
  await updateProvisioning(prov.id, { status: "pending", error_message: null })

  const boss = await getBoss()
  await boss.send(PROVISION_JOB, { intentId: prov.intent_id }, {
    singletonKey: `retry:${prov.intent_id}:${Date.now()}`,
  })

  logger.info({ slug, intentId: prov.intent_id }, "Owner: provisioning retry enqueued")
  return c.json({ ok: true, message: "Retry enqueued. The saga will resume from the last completed step." })
})

// ── GET /owner/slug-check/:slug ───────────────────────────────────────────────

ownerRouter.get("/slug-check/:slug", async (c) => {
  const slug = c.req.param("slug")
  const result = await validateAndCheckSlug(slug)
  if (result.ok) {
    return c.json({ ok: true, available: true })
  }
  return c.json({ ok: true, available: false, error: result.error })
})

// ── POST /owner/new-customer ──────────────────────────────────────────────────

const NewCustomerSchema = z.object({
  email:       z.string().email(),
  slug:        z.string(),
  plan:        z.enum(["starter", "growth"]),
  companyName: z.string().min(1).max(200).optional(),
})

ownerRouter.post("/new-customer", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    throw new ValidationError("Invalid JSON body")
  }

  const parsed = NewCustomerSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors)
  }

  const { email, slug, plan } = parsed.data

  const slugResult = await validateAndCheckSlug(slug)
  if (!slugResult.ok) {
    throw new ValidationError(slugResult.error)
  }

  const intent = await createSignupIntent({ email, orgSlug: slug, plan })

  const priceMap: Record<string, string | undefined> = {
    starter: config.STRIPE_PRICE_STARTER_MONTHLY,
    growth:  config.STRIPE_PRICE_GROWTH_MONTHLY,
  }
  const priceId = priceMap[plan]
  if (!priceId) {
    logger.error({ plan }, "Owner new-customer: no Stripe price ID configured for plan")
    throw new ValidationError(`No Stripe price configured for plan '${plan}'`)
  }

  const stripe = new Stripe(config.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" })
  const consoleOrigin = config.CONSOLE_ORIGIN ?? "https://nestfleet.dev"

  const session = await stripe.checkout.sessions.create({
    mode:                 "subscription",
    payment_method_types: ["card"],
    line_items:           [{ price: priceId, quantity: 1 }],
    customer_email:       email,
    metadata: {
      event_type: "saas_signup",
      intent_id:  intent.id,
      slug,
      email,
      plan,
    },
    success_url: `${consoleOrigin}/signup/success?intent=${intent.id}`,
    cancel_url:  `${consoleOrigin}/owner/new-customer?cancelled=1`,
    subscription_data: {
      metadata: {
        event_type: "saas_subscription",
        intent_id:  intent.id,
        slug,
      },
    },
  })

  logger.info({ intentId: intent.id, slug, plan }, "Owner new-customer: checkout session created")

  return c.json({ ok: true, checkoutUrl: session.url, intentId: intent.id }, 201)
})

// ── FEAT-012: License reissue routes ──────────────────────────────────────────

const ReissueSchema = z.object({
  tier:      z.enum(["starter", "growth", "scale"]),
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 datetime" }),
  reason:    z.string().min(10, "Reason must be at least 10 characters"),
})

// POST /owner/fleet/:slug/reissue-license
ownerRouter.post("/fleet/:slug/reissue-license", async (c) => {
  const slug = c.req.param("slug")

  let body: unknown
  try { body = await c.req.json() } catch { throw new ValidationError("Invalid JSON body") }

  const parsed = ReissueSchema.safeParse(body)
  if (!parsed.success) throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors)

  const { tier, expiresAt, reason } = parsed.data

  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  if (prov.reissue_status === "in_progress") {
    return c.json({ ok: false, error: "A reissue is already in progress for this customer" }, 409)
  }
  if (prov.status !== "active") {
    return c.json({ ok: false, error: `Cannot reissue license: provisioning is '${prov.status}' (must be 'active')` }, 422)
  }

  // Determine caller identity from the verified JWT (already checked in middleware)
  const authHeader = c.req.header("Authorization")!
  const { verifyJwt } = await import("../../auth/jwt.js")
  const caller = verifyJwt(authHeader.slice("Bearer ".length))

  const reissue = await createLicenseReissue({
    provisioning_id:     prov.id,
    performed_by:        caller.sub,
    previous_tier:       prov.license_tier ?? prov.plan,
    new_tier:            tier,
    previous_expires_at: prov.license_expires_at ?? null,
    new_expires_at:      new Date(expiresAt),
    reason,
  })

  await updateProvisioning(prov.id, { reissue_status: "in_progress" })

  const boss = await getBoss()
  const jobId = await boss.send(LICENSE_REISSUE_JOB, {
    reissueId:      reissue.id,
    provisioningId: prov.id,
    slug,
    newTier:        tier,
    newExpiresAt:   expiresAt,
  }, {
    singletonKey: `reissue:${prov.id}:${Date.now()}`,
  })

  logger.info({ slug, tier, reissueId: reissue.id }, "Owner: license reissue queued")
  return c.json({ ok: true, jobId, reissueId: reissue.id }, 202)
})

// POST /owner/fleet/reissue-license-bulk
const BulkReissueSchema = z.object({
  slugs:     z.array(z.string()).min(1).max(50, "Cannot bulk reissue more than 50 customers at once"),
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 datetime" }),
  reason:    z.string().min(10, "Reason must be at least 10 characters"),
})

ownerRouter.post("/fleet/reissue-license-bulk", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { throw new ValidationError("Invalid JSON body") }

  const parsed = BulkReissueSchema.safeParse(body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    // Return 422 specifically for the >50 slugs case
    const hasMaxError = flat.fieldErrors.slugs?.some((e) => e.includes("50"))
    return c.json({ ok: false, error: "Invalid input", details: flat.fieldErrors }, hasMaxError ? 422 : 400)
  }

  const { slugs, expiresAt, reason } = parsed.data

  const authHeader = c.req.header("Authorization")!
  const { verifyJwt } = await import("../../auth/jwt.js")
  const caller = verifyJwt(authHeader.slice("Bearer ".length))

  const boss = await getBoss()
  const jobIds: string[] = []

  for (const slug of slugs) {
    const prov = await findProvisioningBySlug(slug)
    if (!prov || prov.status !== "active" || prov.reissue_status === "in_progress") continue

    const reissue = await createLicenseReissue({
      provisioning_id:     prov.id,
      performed_by:        caller.sub,
      previous_tier:       prov.license_tier ?? prov.plan,
      new_tier:            prov.license_tier ?? prov.plan,  // bulk = same tier, new expiry
      previous_expires_at: prov.license_expires_at ?? null,
      new_expires_at:      new Date(expiresAt),
      reason,
    })

    await updateProvisioning(prov.id, { reissue_status: "in_progress" })

    const jobId = await boss.send(LICENSE_REISSUE_JOB, {
      reissueId:      reissue.id,
      provisioningId: prov.id,
      slug,
      newTier:        (prov.license_tier ?? prov.plan) as "starter" | "growth" | "scale",
      newExpiresAt:   expiresAt,
    }, {
      singletonKey: `reissue:${prov.id}:${Date.now()}`,
    })

    if (jobId) jobIds.push(jobId)
  }

  logger.info({ count: jobIds.length }, "Owner: bulk license reissue queued")
  return c.json({ ok: true, queued: jobIds.length, jobIds }, 202)
})

// GET /owner/fleet/:slug/license-history
ownerRouter.get("/fleet/:slug/license-history", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  const history = await listLicenseReissues(prov.id)
  return c.json({ ok: true, data: history })
})

// GET /owner/fleet/:slug/license-jwt-download
ownerRouter.get("/fleet/:slug/license-jwt-download", async (c) => {
  const slug = c.req.param("slug")
  const prov = await findProvisioningBySlug(slug)
  if (!prov) throw new NotFoundError("provisioning", slug)

  // Find the most recent failed reissue with a pending_jwt
  const history = await listLicenseReissues(prov.id, 1)
  const latest  = history[0]
  if (!latest || latest.status !== "failed" || !latest.pending_jwt) {
    return c.json({ ok: false, error: "No downloadable JWT available" }, 404)
  }

  const jwt = await findFailedPendingJwt(latest.id)
  if (!jwt) return c.json({ ok: false, error: "No downloadable JWT available" }, 404)

  // Clear pending_jwt after first download
  await clearPendingJwt(latest.id)

  const filename = `${slug}-license-${new Date().toISOString().slice(0, 10)}.jwt`
  return new Response(jwt, {
    status: 200,
    headers: {
      "Content-Type":        "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})
