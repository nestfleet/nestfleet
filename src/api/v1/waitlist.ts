/**
 * Waitlist API — FEAT-019.
 *
 * POST /api/v1/waitlist
 *   Stores an interest entry for managed hosting pre-launch.
 *   No auth required. Always returns { ok: true } — never reveals
 *   whether an email is already registered to prevent enumeration.
 *
 * Rate limited: 10 req / IP / hour.
 */

import { Hono } from "hono"
import { z } from "zod"
import { insertWaitlistEntry } from "../../infra/db/repositories/waitlist.js"
import { logger } from "../../shared/logger.js"
import { ValidationError } from "../../shared/errors.js"
import { sendEmail } from "../../notifications/email-transport.js"

const LEADS_EMAIL = "leads@nestfleet.dev"

export const waitlistRouter = new Hono()

// ── Rate limiter (IP-based, simple in-memory) ─────────────────────────────────

const rlMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  // SEC-RL1: evict expired entries to prevent unbounded memory growth
  for (const [k, e] of rlMap) {
    if (now > e.resetAt) rlMap.delete(k)
  }
  const state = rlMap.get(ip)
  if (!state || state.resetAt < now) {
    rlMap.set(ip, { count: 1, resetAt: now + 60 * 60_000 })
    return true
  }
  if (state.count >= 10) return false
  state.count++
  return true
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  email:   z.string().email().max(254),
  name:    z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  plan:    z.enum(["starter", "growth", "scale"]).optional(),
})

// ── Route ─────────────────────────────────────────────────────────────────────

waitlistRouter.post("/", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? "unknown"

  if (!checkRateLimit(ip)) {
    return c.json({ ok: true })
  }

  let raw: unknown
  try { raw = await c.req.json() } catch {
    throw new ValidationError("Invalid JSON body")
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError("Invalid waitlist data")
  }

  const body = parsed.data

  try {
    await insertWaitlistEntry({ ...body, ip })
    logger.info({ email: body.email, plan: body.plan }, "Waitlist entry added")
  } catch (err) {
    logger.error({ err, email: body.email }, "Failed to insert waitlist entry")
  }

  // Fire-and-forget notification to leads inbox
  const who = [body.name, body.company].filter(Boolean).join(" · ") || body.email
  void sendEmail({
    to:      LEADS_EMAIL,
    subject: `[NestFleet Lead] ${who} interested in ${body.plan ? body.plan.charAt(0).toUpperCase() + body.plan.slice(1) : "managed hosting"}`,
    text: [
      `New waitlist signup on nestfleet.dev`,
      ``,
      `Email:   ${body.email}`,
      `Name:    ${body.name    ?? "—"}`,
      `Company: ${body.company ?? "—"}`,
      `Plan:    ${body.plan    ?? "—"}`,
      `IP:      ${ip}`,
    ].join("\n"),
  }).then((sent) => {
    if (!sent) logger.warn({ email: body.email }, "Waitlist lead email not sent — SMTP not configured")
  })

  return c.json({ ok: true })
})
