/**
 * Cross-product bridge event endpoint — BEF-11.
 *
 * POST /api/v1/bridge/event
 *   Receives an event from another product in the suite (e.g. DocuGardener → NestFleet)
 *   and creates a signal + case for the target product, then dispatches a triage job.
 *
 * Auth: admin JWT required — bridge events are system-to-system calls.
 *
 * Body: { event, sourceProduct, targetProduct, payload }
 *   event         — event type slug, e.g. "doc.drift_detected", "monitoring.alert"
 *   sourceProduct — slug of the originating product
 *   targetProduct — slug of the product that should receive and triage the event
 *   payload       — arbitrary event metadata (stored in signal raw_payload)
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findProductBySlug } from "../../infra/db/repositories/products.js"
import { createSignal, updateSignal, createCase, createAuditEvent } from "../../infra/db/repositories/index.js"
import { transitionCase } from "../../domain/case-state-machine.js"
import { dispatch } from "../../agents/dispatcher.js"
import { newId } from "../../infra/db/id.js"
import { logger } from "../../shared/logger.js"

export const bridgeRouter = new Hono<{ Variables: AuthVariables }>()

// ── Input schema ──────────────────────────────────────────────────────────────

const BridgeEventBodySchema = z.object({
  event:         z.string().min(1).max(200),
  sourceProduct: z.string().min(1).max(200),
  targetProduct: z.string().min(1).max(200),
  payload:       z.record(z.unknown()),
})

// ── POST /api/v1/bridge/event ─────────────────────────────────────────────────

bridgeRouter.post("/bridge/event", requireAuth(), async (c) => {
  const user = c.get("user")

  // Admin-only: bridge events are privileged system-to-system calls
  if (!user.roles.includes("admin")) {
    return c.json({ ok: false, error: "FORBIDDEN", message: "Admin role required for bridge events" }, 403)
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = BridgeEventBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Validation failed", details: parsed.error.flatten() }, 400)
  }

  const { event, sourceProduct, targetProduct, payload } = parsed.data

  // ── Resolve target product ────────────────────────────────────────────────
  const product = await findProductBySlug(targetProduct)
  if (!product) {
    return c.json({ ok: false, error: "Target product not found", targetProduct }, 404)
  }
  const productId = product.product_id

  // ── Create signal ─────────────────────────────────────────────────────────
  const sourceRef = `bridge:${sourceProduct}:${event}:${Date.now()}`
  const signal = await createSignal({
    product_id:        productId,
    source_type:       "bridge_event",
    source_ref:        sourceRef,
    received_at:       new Date(),
    raw_payload:       { event, sourceProduct, targetProduct, payload },
    processing_status: "received",
  })
  const signalId = signal.signal_id

  // ── Derive signal text for triage ─────────────────────────────────────────
  const signalText =
    typeof payload["summary"] === "string"
      ? payload["summary"]
      : `Bridge event '${event}' from '${sourceProduct}': ${JSON.stringify(payload).slice(0, 500)}`

  // ── Create case ───────────────────────────────────────────────────────────
  const newCase = await createCase({
    product_id:      productId,
    title:           `[Bridge] ${event} from ${sourceProduct}`.slice(0, 200),
    status:          "new",
    current_persona: "frontline",
    signal_text:     signalText,
  })
  const caseId = newCase.case_id

  await transitionCase(caseId, "new", "enriching")

  // ── Link signal → case ────────────────────────────────────────────────────
  await updateSignal(signalId, {
    case_id:            caseId,
    processing_status:  "normalized",
    normalized_payload: { event, sourceProduct, signalText },
  })

  // ── Audit events ──────────────────────────────────────────────────────────
  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "bridge/event",
    action:      "signal.received",
    after_state: { signalId, source_type: "bridge_event", event, sourceProduct },
    metadata:    { event, sourceProduct, targetProduct },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "case",
    entity_ref:  caseId,
    actor_type:  "system",
    actor_ref:   "bridge/event",
    action:      "case.created",
    after_state: { caseId, status: "enriching", signalId },
    metadata:    { event, sourceProduct },
  })

  // ── Dispatch triage ───────────────────────────────────────────────────────
  const jobId = newId("job_")
  await dispatch({
    actionType: "triage",
    productId,
    caseId,
    jobId,
    payload: { signalText, signalId },
  })

  logger.info({ caseId, signalId, event, sourceProduct, targetProduct, jobId }, "Bridge event ingested, triage dispatched")

  return c.json({ ok: true, caseId, signalId, jobId }, 201)
})
