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
import { createHetznerClient } from "../../provisioning/hetzner-client.js"
import { deprovisionOne, startDeprovisioning } from "../../provisioning/deprovision.js"
import { getBoss } from "../../infra/queue/boss.js"
import { PROVISION_JOB } from "../../workers/provisioning-worker.js"
import { getStripeClient } from "../../billing/stripe.js"
import { aggregateRevenue, buildCohorts } from "../../billing/stripe-revenue.js"
import type { RevenueData, CohortWeek } from "../../billing/stripe-revenue.js"
import { getRecentTelemetry, countDistinctInstances } from "../../infra/db/repositories/telemetry.js"

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
