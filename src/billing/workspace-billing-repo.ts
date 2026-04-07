// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import { getDb } from "../infra/db/client.js"
import type { BillingPlan, PlanInterval } from "./plans.js"

export interface WorkspaceBillingRow {
  id: number
  stripe_customer_id:     string | null
  stripe_subscription_id: string | null
  plan:                   BillingPlan
  plan_interval:          PlanInterval | null
  status:                 string
  trial_ends_at:          Date | null
  current_period_end:     Date | null
  cancel_at:              Date | null
  updated_at:             Date
}

export interface UpsertBillingParams {
  stripeCustomerId:      string | null
  stripeSubscriptionId:  string | null
  plan:                  BillingPlan | null   // null = keep existing
  planInterval:          PlanInterval | null
  status:                string
  trialEndsAt:           string | null        // ISO string or null
  currentPeriodEnd:      string | null
  cancelAt:              string | null
}

/**
 * Upserts the singleton workspace_billing row.
 * Uses INSERT ON CONFLICT to guarantee exactly one row exists.
 * When plan is null (unknown price ID), the existing plan is preserved.
 */
export async function upsertWorkspaceBilling(params: UpsertBillingParams): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO workspace_billing (
      stripe_customer_id, stripe_subscription_id,
      plan, plan_interval, status,
      trial_ends_at, current_period_end, cancel_at,
      updated_at
    )
    VALUES (
      ${params.stripeCustomerId},
      ${params.stripeSubscriptionId},
      ${params.plan ?? "community"},
      ${params.planInterval},
      ${params.status},
      ${params.trialEndsAt},
      ${params.currentPeriodEnd},
      ${params.cancelAt},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id,     workspace_billing.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, workspace_billing.stripe_subscription_id),
      plan                   = CASE WHEN ${params.plan} IS NOT NULL
                                    THEN EXCLUDED.plan
                                    ELSE workspace_billing.plan END,
      plan_interval          = EXCLUDED.plan_interval,
      status                 = EXCLUDED.status,
      trial_ends_at          = EXCLUDED.trial_ends_at,
      current_period_end     = EXCLUDED.current_period_end,
      cancel_at              = EXCLUDED.cancel_at,
      updated_at             = now()
  `
}

/** Fetches the current billing row. Returns null if the table is empty (community install). */
export async function getWorkspaceBilling(): Promise<WorkspaceBillingRow | null> {
  const db = getDb()
  const rows = await db<WorkspaceBillingRow[]>`
    SELECT * FROM workspace_billing LIMIT 1
  `
  return rows[0] ?? null
}
