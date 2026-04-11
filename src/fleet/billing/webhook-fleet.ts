// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Fleet-specific Stripe webhook handlers — FEAT-018-D / FEAT-017-D.
 *
 * Called from src/billing/webhook.ts when PROVISIONING_ENABLED is true and the
 * Stripe event metadata indicates a fleet (SaaS managed-hosting) operation.
 *
 * Separated here so the community webhook handler (AGPL) has no import-time
 * dependency on fleet provisioning code.
 */

import { logger } from "../../shared/logger.js"
import { getBoss } from "../../infra/queue/boss.js"
import { PROVISION_JOB } from "../workers/provisioning-worker.js"
import {
  updateSignupIntentStatus,
  updateSignupIntentStripeIds,
  findProvisioningBySlug,
  findProvisioningByStripeCustomerId,
  updateProvisioning,
} from "../../infra/db/repositories/provisionings.js"
import { startDeprovisioning } from "../provisioning/deprovision.js"
import { priceIdToPlan } from "../../billing/stripe.js"

/**
 * Handle checkout.session.completed for a SaaS managed-hosting signup.
 * Marks the signup intent as completed, stores Stripe IDs, and enqueues
 * the provisioning job. Stripe IDs will be copied to the provisioning row
 * by the worker when it creates it (FEAT-017-A).
 */
export async function handleFleetCheckoutCompleted(
  intentId:       string,
  slug:           string,
  plan:           string,
  customerId:     string | null,
  subscriptionId: string | null,
): Promise<void> {
  // Mark signup_intent as completed and store Stripe IDs
  await updateSignupIntentStatus(intentId, "completed").catch((err) => {
    logger.warn({ err, intentId }, "Stripe saas_signup: intent status update failed (non-fatal)")
  })

  await updateSignupIntentStripeIds(intentId, customerId, subscriptionId).catch((err) => {
    logger.warn({ err, intentId }, "Stripe saas_signup: storing Stripe IDs failed (non-fatal)")
  })

  // FEAT-017-G: Check for reactivation — if this slug is already deprovisioning
  // within the reactivation window, reactivate instead of re-provisioning.
  const existingProv = await findProvisioningBySlug(slug).catch(() => null)
  if (
    existingProv &&
    existingProv.status === "deprovisioning" &&
    existingProv.reactivation_deadline &&
    existingProv.reactivation_deadline > new Date()
  ) {
    await updateProvisioning(existingProv.id, {
      status:                 "active",
      deprovision_after:      null,
      reactivation_deadline:  null,
      stripe_customer_id:     customerId,
      stripe_subscription_id: subscriptionId,
    })
    logger.info({ slug, intentId }, "Stripe saas_signup: reactivation within window — status restored to active")
    return
  }

  // Enqueue provisioning job — singletonKey prevents duplicate on Stripe retry
  const boss = await getBoss()
  await boss.send(PROVISION_JOB, { intentId }, { singletonKey: intentId })

  logger.info({ intentId, slug, plan }, "Stripe saas_signup: provisioning job enqueued")
}

/**
 * Handle customer.subscription.deleted for a SaaS managed-hosting customer.
 * Paid subscriptions: 30-day grace period. Trial cancellations: immediate
 * deprovisioning at trial_end (no grace period). Sets reactivation_deadline=now()+7d (FEAT-017-G).
 */
export async function handleFleetSubscriptionDeleted(
  slug:        string,
  wasTrialing: boolean,
  trialEnd:    number | null,
): Promise<void> {
  const prov = await findProvisioningBySlug(slug)

  if (!prov || prov.status !== "active") {
    logger.warn(
      { slug, status: prov?.status },
      "Stripe subscription.deleted: no active provisioning found for slug",
    )
    return
  }

  // Reactivation deadline: 7 days from now (FEAT-017-G)
  const reactivationDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  if (wasTrialing && trialEnd) {
    // Trial cancellation — no 30-day grace. Deprovision at trial end.
    const deprovisionAfter = new Date(trialEnd * 1000)
    await updateProvisioning(prov.id, {
      status:               "deprovisioning",
      deprovision_after:    deprovisionAfter,
      reactivation_deadline: reactivationDeadline,
    })
    logger.info({ slug, deprovisionAfter }, "Stripe subscription.deleted: trial cancel — deprovisioning at trial end")
  } else {
    // Paid subscription — 30-day data export window
    await startDeprovisioning(prov)
    await updateProvisioning(prov.id, { reactivation_deadline: reactivationDeadline })
    logger.info({ slug }, "Stripe subscription.deleted: paid cancel — 30-day grace period started")
  }
}

/**
 * Handle customer.subscription.updated for a SaaS plan change (FEAT-017-D).
 * Triggers license reissue on the customer VPS when the plan changes.
 */
export async function handleFleetSubscriptionUpdated(
  slug:    string,
  priceId: string | null,
  subId:   string,
): Promise<void> {
  const prov = await findProvisioningBySlug(slug)
  if (!prov) {
    logger.warn({ slug }, "Stripe subscription.updated: no provisioning found for slug")
    return
  }

  const newPlanInfo = priceId ? priceIdToPlan(priceId) : null
  const newPlan     = newPlanInfo?.plan ?? null

  if (newPlan && newPlan !== prov.plan) {
    await updateProvisioning(prov.id, {
      plan:                   newPlan,
      license_tier:           newPlan,
      reissue_status:         "in_progress",
      stripe_subscription_id: subId,
    })
    logger.info({ slug, oldPlan: prov.plan, newPlan }, "SaaS subscription plan change — license reissue queued")
  } else {
    // Sync subscription ID even if plan hasn't changed (e.g. renewal creates new sub)
    await updateProvisioning(prov.id, { stripe_subscription_id: subId })
    logger.info({ slug, priceId }, "SaaS subscription.updated: no plan change, subscription ID synced")
  }
}

/**
 * Handle customer.updated for email sync (FEAT-017-D / spec C3).
 * Keeps magic link auth working after a customer changes their email in Stripe.
 */
export async function handleFleetCustomerUpdated(
  stripeCustomerId: string,
  newEmail:         string,
): Promise<void> {
  const prov = await findProvisioningByStripeCustomerId(stripeCustomerId)
  if (!prov) {
    logger.debug({ stripeCustomerId }, "Stripe customer.updated: no provisioning found — community customer, skipping")
    return
  }

  if (prov.customer_email !== newEmail) {
    await updateProvisioning(prov.id, { customer_email: newEmail })
    logger.info({ slug: prov.org_slug, newEmail }, "Stripe customer.updated: customer email synced")
  }
}
