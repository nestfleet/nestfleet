// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Stripe webhook endpoint.
 *
 * Mounted at POST /webhooks/stripe.
 * Verifies the Stripe-Signature header using STRIPE_WEBHOOK_SECRET,
 * then delegates to handleStripeEvent().
 *
 * IMPORTANT: This route must receive the raw request body — do NOT parse JSON
 * before passing to stripe.webhooks.constructEvent().
 */

import { Hono } from "hono"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { getStripeClient } from "../../billing/stripe.js"
import { handleStripeEvent } from "../../billing/webhook.js"

export const stripeWebhookRouter = new Hono()

stripeWebhookRouter.post("/webhooks/stripe", async (c) => {
  if (!config.BILLING_ENABLED) {
    return c.json({ received: true }, 200)
  }

  const sig = c.req.header("stripe-signature")
  if (!sig) {
    return c.json({ error: "MISSING_SIGNATURE" }, 400)
  }

  if (!config.STRIPE_WEBHOOK_SECRET) {
    logger.error("STRIPE_WEBHOOK_SECRET not set — cannot verify webhook")
    return c.json({ error: "CONFIGURATION_ERROR" }, 500)
  }

  // Read raw body as ArrayBuffer — required for Stripe signature verification
  const rawBody = await c.req.arrayBuffer()
  const bodyBuffer = Buffer.from(rawBody)

  let event
  try {
    const stripe = getStripeClient()
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, config.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed")
    return c.json({ error: "INVALID_SIGNATURE" }, 400)
  }

  try {
    await handleStripeEvent(event)
    return c.json({ received: true })
  } catch (err) {
    logger.error({ err, type: event.type }, "Stripe webhook handler failed")
    // Return 200 so Stripe doesn't retry indefinitely for internal errors
    return c.json({ received: true, warning: "handler_error" })
  }
})
