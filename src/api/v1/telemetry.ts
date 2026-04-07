/**
 * Telemetry ping endpoint — NF-OPS-01 Phase 2.
 *
 * POST /api/v1/telemetry/ping — public, no auth required.
 * Rate-limited: 10 requests per IP per 60 seconds (in-memory Map).
 */

import { Hono } from "hono"
import { z } from "zod"
import { insertTelemetryPing } from "../../infra/db/repositories/telemetry.js"

// ── Rate limiter ──────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX       = 10
const RATE_LIMIT_WINDOW_MS = 60_000

interface RateLimitEntry {
  count:       number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/** Returns true if the request should be allowed; mutates state on the fly. */
function checkRateLimit(ip: string): boolean {
  const now = Date.now()

  // Purge stale entries older than the window
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key)
    }
  }

  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

// ── Router ────────────────────────────────────────────────────────────────────

export const telemetryRouter = new Hono()

const PingBodySchema = z.object({
  instanceId: z.string().min(1).max(200),
  version:    z.string().min(1).max(50),
  payload:    z.record(z.unknown()).optional(),
})

telemetryRouter.post("/ping", async (c) => {
  const ip =
    c.req.header("x-forwarded-for") ??
    c.req.header("x-real-ip") ??
    "unknown"

  if (!checkRateLimit(ip)) {
    return c.json({ ok: false, error: "Rate limit exceeded" }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400)
  }

  const parsed = PingBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Invalid request body" }, 400)
  }

  const insert = parsed.data.payload !== undefined
    ? { instanceId: parsed.data.instanceId, version: parsed.data.version, payload: parsed.data.payload }
    : { instanceId: parsed.data.instanceId, version: parsed.data.version }

  await insertTelemetryPing(insert)

  return c.json({ ok: true })
})
