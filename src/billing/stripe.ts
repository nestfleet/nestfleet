// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import Stripe from "stripe"
import { config } from "../shared/config.js"
import type { BillingPlan, PlanInterval } from "./plans.js"

let _stripe: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set — cannot initialise Stripe client")
    }
    _stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" })
  }
  return _stripe
}

/** Maps a Stripe price ID to a plan + interval. Returns null for unknown IDs. */
export function priceIdToPlan(priceId: string): { plan: BillingPlan; interval: PlanInterval } | null {
  const map: Record<string, { plan: BillingPlan; interval: PlanInterval }> = {
    [config.STRIPE_PRICE_STARTER_MONTHLY ?? ""]: { plan: "starter", interval: "monthly" },
    [config.STRIPE_PRICE_STARTER_ANNUAL  ?? ""]: { plan: "starter", interval: "annual"  },
    [config.STRIPE_PRICE_GROWTH_MONTHLY  ?? ""]: { plan: "growth",  interval: "monthly" },
    [config.STRIPE_PRICE_GROWTH_ANNUAL   ?? ""]: { plan: "growth",  interval: "annual"  },
  }
  return map[priceId] ?? null
}

/** Price ID map for checkout — plan + interval → Stripe price ID. */
export function planToPriceId(plan: "starter" | "growth", interval: PlanInterval): string | null {
  if (plan === "starter" && interval === "monthly") return config.STRIPE_PRICE_STARTER_MONTHLY ?? null
  if (plan === "starter" && interval === "annual")  return config.STRIPE_PRICE_STARTER_ANNUAL  ?? null
  if (plan === "growth"  && interval === "monthly") return config.STRIPE_PRICE_GROWTH_MONTHLY  ?? null
  if (plan === "growth"  && interval === "annual")  return config.STRIPE_PRICE_GROWTH_ANNUAL   ?? null
  return null
}
