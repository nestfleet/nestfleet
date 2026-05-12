// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Billing API — NF direct Stripe integration.
 * All routes are gated on BILLING_ENABLED=true.
 *
 * Routes:
 *   GET  /api/v1/billing/status    — current plan + subscription state (admin)
 *   POST /api/v1/billing/checkout  — create Stripe Checkout session (admin)
 *   POST /api/v1/billing/portal    — create Stripe Customer Portal session (admin)
 *   POST /api/v1/billing/downgrade — schedule downgrade at period end (admin)
 */

import { Hono } from "hono"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import { config } from "../../shared/config.js"
import { getStripeClient, planToPriceId } from "../../billing/stripe.js"
import { getWorkspaceBilling } from "../../billing/workspace-billing-repo.js"
import { PLAN_ORDER } from "../../billing/plans.js"
import type { BillingPlan, PlanInterval } from "../../billing/plans.js"

export const billingRouter = new Hono<{ Variables: AuthVariables }>()

// ── Guard — return 404 when billing is not enabled ───────────────────────────

billingRouter.use("/billing/*", async (c, next) => {
  if (!config.BILLING_ENABLED) {
    return c.json({ error: "BILLING_NOT_ENABLED" }, 404)
  }
  return next()
})

// ── GET /api/v1/billing/status ────────────────────────────────────────────────

billingRouter.get("/billing/status", requireAuth(), requireRole("admin"), async (c) => {
  try {
    const row = await getWorkspaceBilling()

    if (!row) {
      // No billing record yet — community install
      return c.json({
        ok: true,
        data: {
          plan:          "community" as BillingPlan,
          planInterval:  null,
          status:        "active",
          stripeCustomerId:     null,
          stripeSubscriptionId: null,
          trialEndsAt:          null,
          currentPeriodEnd:     null,
          cancelAt:             null,
        },
      })
    }

    return c.json({
      ok: true,
      data: {
        plan:                 row.plan,
        planInterval:         row.plan_interval,
        status:               row.status,
        stripeCustomerId:     row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        trialEndsAt:          row.trial_ends_at?.toISOString() ?? null,
        currentPeriodEnd:     row.current_period_end?.toISOString() ?? null,
        cancelAt:             row.cancel_at?.toISOString() ?? null,
      },
    })
  } catch (err) {
    logger.error({ err }, "Failed to fetch billing status")
    return c.json({ error: "INTERNAL_ERROR" }, 500)
  }
})

// ── POST /api/v1/billing/checkout ─────────────────────────────────────────────

billingRouter.post("/billing/checkout", requireAuth(), requireRole("admin"), async (c) => {
  try {
    const body = await c.req.json() as {
      plan: "starter" | "growth"
      interval: PlanInterval
      success_url: string
      cancel_url: string
    }

    const priceId = planToPriceId(body.plan, body.interval)
    if (!priceId) {
      return c.json({ error: "INVALID_PLAN", message: `No price ID configured for ${body.plan}/${body.interval}` }, 400)
    }

    // SEC-ST1: reject redirect URLs that don't originate from CONSOLE_ORIGIN
    const allowedOrigin = config.CONSOLE_ORIGIN
    const toOrigin = (url: string) => { try { return new URL(url).origin } catch { return null } }
    if (toOrigin(body.success_url) !== allowedOrigin || toOrigin(body.cancel_url) !== allowedOrigin) {
      return c.json({ error: "INVALID_REDIRECT", message: "success_url and cancel_url must originate from the configured console origin" }, 400)
    }

    const stripe = getStripeClient()
    const row = await getWorkspaceBilling()

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      ...(row?.stripe_customer_id ? { customer: row.stripe_customer_id } : {}),
    })

    return c.json({ ok: true, data: { checkout_url: session.url } })
  } catch (err) {
    logger.error({ err }, "Billing checkout failed")
    return c.json({ error: "CHECKOUT_FAILED", message: (err as Error).message }, 500)
  }
})

// ── POST /api/v1/billing/portal ───────────────────────────────────────────────

billingRouter.post("/billing/portal", requireAuth(), requireRole("admin"), async (c) => {
  try {
    const body = await c.req.json() as { return_url: string }
    const row = await getWorkspaceBilling()

    if (!row?.stripe_customer_id) {
      return c.json({ error: "NO_CUSTOMER", message: "No Stripe customer found — complete checkout first" }, 400)
    }

    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: body.return_url,
    })

    return c.json({ ok: true, data: { portal_url: session.url } })
  } catch (err) {
    logger.error({ err }, "Billing portal session failed")
    return c.json({ error: "PORTAL_FAILED", message: (err as Error).message }, 500)
  }
})

// ── POST /api/v1/billing/downgrade ────────────────────────────────────────────

billingRouter.post("/billing/downgrade", requireAuth(), requireRole("admin"), async (c) => {
  try {
    const body = await c.req.json() as { plan: "starter"; interval: PlanInterval }
    const row = await getWorkspaceBilling()

    if (!row?.stripe_subscription_id) {
      return c.json({ error: "NO_SUBSCRIPTION", message: "No active subscription found" }, 400)
    }

    // SEC-ST3: reject if target plan is same tier or higher than current plan
    if (PLAN_ORDER.indexOf(body.plan) >= PLAN_ORDER.indexOf(row.plan)) {
      return c.json({ error: "INVALID_DOWNGRADE", message: "Target plan must be lower than current plan" }, 400)
    }

    const priceId = planToPriceId(body.plan, body.interval)
    if (!priceId) {
      return c.json({ error: "INVALID_PLAN" }, 400)
    }

    const stripe = getStripeClient()

    // Fetch current subscription items to get item ID for update
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    const itemId = sub.items.data[0]?.id
    if (!itemId) {
      return c.json({ error: "NO_SUBSCRIPTION_ITEM" }, 400)
    }

    // Schedule the downgrade at current period end (proration_behavior: none)
    const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      proration_behavior: "none",
      items: [{ id: itemId, price: priceId }],
      billing_cycle_anchor: "unchanged",
    })

    // current_period_end moved to items in Stripe dahlia API
    const periodEndUnix = updated.items.data[0]?.current_period_end ?? null
    const effectiveDate = periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : null

    return c.json({ ok: true, data: { effective_date: effectiveDate } })
  } catch (err) {
    logger.error({ err }, "Billing downgrade failed")
    return c.json({ error: "DOWNGRADE_FAILED", message: (err as Error).message }, 500)
  }
})
