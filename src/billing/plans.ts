// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

export type BillingPlan = "community" | "starter" | "growth" | "scale"
export type PlanInterval = "monthly" | "annual"

export interface PlanDefinition {
  id: BillingPlan
  label: string
  monthlyPrice: number | null   // USD cents; null = contact sales
  annualPrice: number | null
  productLimit: number          // 999 = unlimited
  description: string
}

export const PLANS: Record<BillingPlan, PlanDefinition> = {
  community: {
    id: "community",
    label: "Community",
    monthlyPrice: 0,
    annualPrice: 0,
    productLimit: 999,
    description: "Full-featured self-hosted tier. AGPL — unlimited.",
  },
  starter: {
    id: "starter",
    label: "Starter",
    monthlyPrice: 4900,    // $49
    annualPrice: 3900,     // $39 × 12 = $468/yr
    productLimit: 3,
    description: "Up to 3 products, autonomous AI replies, cost analytics.",
  },
  growth: {
    id: "growth",
    label: "Growth",
    monthlyPrice: 14900,   // $149
    annualPrice: 11900,    // $119 × 12 = $1,428/yr
    productLimit: 10,
    description: "Up to 10 products, full analytics, CI auto-complete, Slack.",
  },
  scale: {
    id: "scale",
    label: "Scale",
    monthlyPrice: null,    // Contact sales
    annualPrice: null,
    productLimit: 999,
    description: "Unlimited products, custom roles, SSO/SAML, Discord.",
  },
}

export const PLAN_ORDER: BillingPlan[] = ["community", "starter", "growth", "scale"]

export function planAtLeast(current: BillingPlan, required: BillingPlan): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required)
}
