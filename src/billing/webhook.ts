// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Stripe webhook event handler.
 *
 * Handles:
 *   checkout.session.completed      — new subscription created
 *   customer.subscription.updated   — plan change, status change, cancellation scheduled
 *   customer.subscription.deleted   — subscription ended → revert to community
 *
 * All other event types are silently ignored.
 */

import type Stripe from "stripe"
import { priceIdToPlan } from "./stripe.js"
import { upsertWorkspaceBilling } from "./workspace-billing-repo.js"
import { logger } from "../shared/logger.js"
import { config } from "../shared/config.js"
import { getBoss } from "../infra/queue/boss.js"
import { PROVISION_JOB } from "../workers/provisioning-worker.js"
import {
  findProvisioningBySlug,
  updateSignupIntentStatus,
} from "../infra/db/repositories/provisionings.js"
import { startDeprovisioning } from "../provisioning/deprovision.js"

type StripeEvent = { type: string; data: { object: Record<string, unknown> } }

export async function handleStripeEvent(event: Stripe.Event | StripeEvent): Promise<void> {
  const { type, data } = event
  const obj = data.object as Record<string, unknown>

  switch (type) {
    case "checkout.session.completed": {
      const metadata       = obj["metadata"] as Record<string, string> | undefined
      const customerId     = obj["customer"] as string | null
      const subscriptionId = obj["subscription"] as string | null

      // ── SaaS provisioning path ─────────────────────────────────────────────
      if (config.PROVISIONING_ENABLED && metadata?.["event_type"] === "saas_signup") {
        const intentId = metadata["intent_id"]
        const slug     = metadata["slug"]
        const plan     = metadata["plan"]

        if (!intentId || !slug) {
          logger.error({ metadata }, "Stripe saas_signup: missing intent_id or slug in metadata")
          return
        }

        // Mark signup_intent as completed
        await updateSignupIntentStatus(intentId, "completed").catch((err) => {
          logger.warn({ err, intentId }, "Stripe saas_signup: intent status update failed (non-fatal)")
        })

        // Enqueue provisioning job — singletonKey prevents duplicate on Stripe retry
        const boss = await getBoss()
        await boss.send(PROVISION_JOB, { intentId }, { singletonKey: intentId })

        logger.info({ intentId, slug, plan }, "Stripe saas_signup: provisioning job enqueued")
        return
      }

      // ── Existing self-hosted billing path ──────────────────────────────────
      if (!customerId) {
        logger.warn({ type }, "checkout.session.completed missing customer — skipping upsert")
        return
      }

      await upsertWorkspaceBilling({
        stripeCustomerId:     customerId,
        stripeSubscriptionId: subscriptionId,
        plan:                 null,  // plan set by subsequent subscription.updated event
        planInterval:         null,
        status:               "active",
        trialEndsAt:          null,
        currentPeriodEnd:     null,
        cancelAt:             null,
      })

      logger.info({ customerId, subscriptionId }, "Stripe checkout completed — billing record created")
      break
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subId      = obj["id"] as string
      const customerId = obj["customer"] as string
      const subMeta    = obj["metadata"] as Record<string, string> | undefined

      // ── SaaS churn path ────────────────────────────────────────────────────
      if (
        config.PROVISIONING_ENABLED &&
        type === "customer.subscription.deleted" &&
        subMeta?.["event_type"] === "saas_subscription"
      ) {
        const slug = subMeta["slug"]
        if (slug) {
          const prov = await findProvisioningBySlug(slug)
          if (prov && prov.status === "active") {
            await startDeprovisioning(prov)
            logger.info({ slug }, "Stripe subscription.deleted: deprovisioning grace period started")
          } else {
            logger.warn({ slug, status: prov?.status }, "Stripe subscription.deleted: no active provisioning found for slug")
          }
          return
        }
      }
      const rawStatus  = obj["status"] as string
      const cancelAt   = obj["cancel_at"] as number | null
      const trialEnd   = obj["trial_end"] as number | null
      const periodEnd  = obj["current_period_end"] as number | null
      const items      = obj["items"] as { data: Array<{ price: { id: string } }> } | undefined
      const priceId    = items?.data?.[0]?.price?.id ?? null

      // On deletion, always revert to community regardless of price ID
      const planResolved = type === "customer.subscription.deleted"
        ? "community"
        : (priceId ? (priceIdToPlan(priceId)?.plan ?? null) : null)

      const intervalResolved = type === "customer.subscription.deleted"
        ? null
        : (priceId ? (priceIdToPlan(priceId)?.interval ?? null) : null)

      // Map raw Stripe status to our allowed set
      const statusMap: Record<string, string> = {
        active:     "active",
        trialing:   "trialing",
        past_due:   "past_due",
        canceled:   "canceled",
        incomplete: "incomplete",
      }
      const status = statusMap[rawStatus] ?? "active"

      await upsertWorkspaceBilling({
        stripeCustomerId:     customerId,
        stripeSubscriptionId: subId,
        plan:                 planResolved as never,
        planInterval:         intervalResolved,
        status,
        trialEndsAt:          trialEnd    ? new Date(trialEnd    * 1000).toISOString() : null,
        currentPeriodEnd:     periodEnd   ? new Date(periodEnd   * 1000).toISOString() : null,
        cancelAt:             cancelAt    ? new Date(cancelAt    * 1000).toISOString() : null,
      })

      logger.info({ type, subId, plan: planResolved, status }, "Stripe subscription event processed")
      break
    }

    default:
      // Unhandled event types — not an error, Stripe sends many we don't care about
      break
  }
}
