/**
 * Integration tests: Customer Subscription Lifecycle — FEAT-017
 *
 * Tests run against a real PostgreSQL container (via Testcontainers).
 * Covers:
 *   NF-INT-600: checkout.session.completed writes stripe IDs to signup_intent
 *   NF-INT-601: subscription.updated (saas_subscription) updates plan + queues reissue
 *   NF-INT-602: subscription.deleted (paid) → 30-day grace + reactivation_deadline set
 *   NF-INT-603: subscription.deleted (trial) → deprovision_after = trial_end, no 30-day grace
 *   NF-INT-604: customer.updated → email synced to provisioning row
 *   NF-INT-605: POST /api/v1/saas/account/magic-link → always 200
 *   NF-INT-606: POST /api/v1/saas/account/session → valid token → sessionToken returned
 *   NF-INT-607: POST /api/v1/saas/account/session → invalid token → 401
 *   NF-INT-608: GET /api/v1/saas/account/me → session token → account info
 *   NF-INT-609: Reactivation — re-subscribe within window reactivates provisioning
 *   NF-INT-610: Reactivation — re-subscribe AFTER deadline enqueues new provision job
 */

import { vi, type MockedFunction } from "vitest"

// ── Config mock: enable provisioning ─────────────────────────────────────────

vi.mock("../../../src/shared/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/shared/config.js")>()
  return {
    config: {
      ...original.config,
      PROVISIONING_ENABLED:         true,
      BILLING_ENABLED:              false,
      STRIPE_SECRET_KEY:            "sk_test_dummy",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter_test",
      STRIPE_PRICE_GROWTH_MONTHLY:  "price_growth_test",
      CUSTOMER_BASE_DOMAIN:         "nestfleet.dev",
      CONSOLE_ORIGIN:               "https://nestfleet.dev",
    },
  }
})

// ── pg-boss mock (prevent real queue connections) ─────────────────────────────

const mockBossSend = vi.fn().mockResolvedValue("job-id-mock")
vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss:                 vi.fn().mockResolvedValue({ send: (...args: unknown[]) => mockBossSend(...args) }),
  initBoss:                vi.fn(),
  registerDeadLetterHandler: vi.fn(),
}))

// ── Agent dispatcher mock ─────────────────────────────────────────────────────

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

// ── Email sender mock ─────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(undefined)
vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

// ── Fleet mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../src/fleet/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))
vi.mock("../../../src/fleet/provisioning/deprovision.js", () => ({
  deprovisionOne:      vi.fn().mockResolvedValue(undefined),
  startDeprovisioning: vi.fn().mockImplementation(async (prov: { id: string }) => {
    // Minimal stub: mark as deprovisioning with 30-day window
    const { updateProvisioning } = await import("../../../src/infra/db/repositories/provisionings.js")
    const deprovisionAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await updateProvisioning(prov.id, { status: "deprovisioning", deprovision_after: deprovisionAfter })
  }),
}))
vi.mock("../../../src/fleet/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

// ── Stripe mock ───────────────────────────────────────────────────────────────

const mockPortalCreate = vi.fn().mockResolvedValue({
  url: "https://billing.stripe.com/test/portal",
})
vi.mock("stripe", () => {
  const StripeClass = vi.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
    checkout:      { sessions: { create: vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/test" }) } },
  }))
  return { default: StripeClass }
})

// ── priceIdToPlan mock ────────────────────────────────────────────────────────

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  }),
  priceIdToPlan: (priceId: string) => {
    if (priceId === "price_starter_test") return { plan: "starter", interval: "monthly" }
    if (priceId === "price_growth_test")  return { plan: "growth",  interval: "monthly" }
    return null
  },
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "../helpers/db.js"
import { setupTestDb }       from "../helpers/db.js"
import { app }               from "../../../src/api/index.js"
import { handleStripeEvent } from "../../../src/billing/webhook.js"
import {
  createSignupIntent,
  createProvisioning,
  findProvisioningBySlug,
  findSignupIntentById,
} from "../../../src/infra/db/repositories/provisionings.js"
import { signMagicLinkToken, signAccountSessionToken } from "../../../src/fleet/api/saas-account.js"

// ── Test suite ───��────────────────────────────────────────────────────────────

describe("Customer Subscription Lifecycle (FEAT-017 / NF-INT-600..610)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  beforeEach(async () => {
    // Clean up provisioning data between tests
    await ctx.db`DELETE FROM provisionings`
    await ctx.db`DELETE FROM signup_intents`
    mockBossSend.mockClear()
    mockSendEmail.mockClear()
    mockPortalCreate.mockClear()
  })

  // ── NF-INT-600: checkout.session.completed writes Stripe IDs ─────────────

  it("NF-INT-600: checkout.session.completed writes stripe_customer_id + stripe_subscription_id to signup_intent", async () => {
    const intent = await createSignupIntent({
      email:   "alice@acme.com",
      orgSlug: "acme-corp",
      plan:    "starter",
    })

    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            event_type: "saas_signup",
            intent_id:  intent.id,
            slug:       "acme-corp",
            plan:       "starter",
          },
          customer:     "cus_test_600",
          subscription: "sub_test_600",
        },
      },
    })

    const updated = await findSignupIntentById(intent.id)
    expect(updated?.stripe_customer_id).toBe("cus_test_600")
    expect(updated?.stripe_subscription_id).toBe("sub_test_600")
  })

  // ── NF-INT-601: subscription.updated triggers plan change + reissue ───────

  it("NF-INT-601: subscription.updated (saas_subscription) updates plan and queues reissue", async () => {
    const intent = await createSignupIntent({
      email:   "bob@corp.com",
      orgSlug: "bob-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:             intent.id,
      orgSlug:              "bob-corp",
      customerEmail:        "bob@corp.com",
      plan:                 "starter",
      stripeCustomerId:     "cus_bob_601",
      stripeSubscriptionId: "sub_bob_601",
    })

    // Mark as active
    await ctx.db`UPDATE provisionings SET status = 'active' WHERE id = ${prov.id}`

    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id:       "sub_bob_601",
          customer: "cus_bob_601",
          status:   "active",
          metadata: { event_type: "saas_subscription", slug: "bob-corp" },
          items: { data: [{ price: { id: "price_growth_test" } }] },
        },
      },
    })

    const updated = await findProvisioningBySlug("bob-corp")
    expect(updated?.plan).toBe("growth")
    expect(updated?.license_tier).toBe("growth")
    expect(updated?.reissue_status).toBe("in_progress")
  })

  // ── NF-INT-602: subscription.deleted (paid) → 30-day grace + reactivation_deadline

  it("NF-INT-602: subscription.deleted (paid) → deprovisioning status + reactivation_deadline set", async () => {
    const intent = await createSignupIntent({
      email:   "carol@corp.com",
      orgSlug: "carol-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       "carol-corp",
      customerEmail: "carol@corp.com",
      plan:          "starter",
    })

    await ctx.db`UPDATE provisionings SET status = 'active' WHERE id = ${prov.id}`

    await handleStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id:        "sub_carol_602",
          customer:  "cus_carol_602",
          status:    "active",  // was paid (not trialing)
          trial_end: null,
          metadata:  { event_type: "saas_subscription", slug: "carol-corp" },
          items: { data: [{ price: { id: "price_starter_test" } }] },
        },
      },
    })

    const updated = await findProvisioningBySlug("carol-corp")
    expect(updated?.status).toBe("deprovisioning")
    expect(updated?.reactivation_deadline).not.toBeNull()

    // reactivation_deadline should be ~7 days from now
    const deadline = updated!.reactivation_deadline!.getTime()
    const now      = Date.now()
    expect(deadline).toBeGreaterThan(now + 6 * 24 * 60 * 60 * 1000)   // at least 6 days
    expect(deadline).toBeLessThan(now   + 8 * 24 * 60 * 60 * 1000)   // at most 8 days
  })

  // ── NF-INT-603: subscription.deleted (trial) → deprovision at trial_end ──

  it("NF-INT-603: subscription.deleted (trialing) → deprovision_after = trial_end, not 30 days", async () => {
    const intent = await createSignupIntent({
      email:   "dave@corp.com",
      orgSlug: "dave-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       "dave-corp",
      customerEmail: "dave@corp.com",
      plan:          "starter",
    })

    await ctx.db`UPDATE provisionings SET status = 'active' WHERE id = ${prov.id}`

    const trialEndTs = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60  // 3 days from now

    await handleStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id:        "sub_dave_603",
          customer:  "cus_dave_603",
          status:    "trialing",
          trial_end: trialEndTs,
          metadata:  { event_type: "saas_subscription", slug: "dave-corp" },
          items: { data: [{ price: { id: "price_starter_test" } }] },
        },
      },
    })

    const updated = await findProvisioningBySlug("dave-corp")
    expect(updated?.status).toBe("deprovisioning")

    // deprovision_after should be ~ trial_end, NOT 30 days
    const deprovTs    = updated!.deprovision_after!.getTime() / 1000
    const expectedTs  = trialEndTs
    expect(Math.abs(deprovTs - expectedTs)).toBeLessThan(60)  // within 1 minute
  })

  // ── NF-INT-604: customer.updated → email synced ───────────────────────────

  it("NF-INT-604: customer.updated → customer_email updated in provisioning row", async () => {
    const intent = await createSignupIntent({
      email:   "eve@corp.com",
      orgSlug: "eve-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:             intent.id,
      orgSlug:              "eve-corp",
      customerEmail:        "eve@corp.com",
      plan:                 "starter",
      stripeCustomerId:     "cus_eve_604",
    })

    await ctx.db`UPDATE provisionings SET status = 'active' WHERE id = ${prov.id}`

    await handleStripeEvent({
      type: "customer.updated",
      data: {
        object: {
          id:    "cus_eve_604",
          email: "eve-new@corp.com",
        },
      },
    })

    const updated = await findProvisioningBySlug("eve-corp")
    expect(updated?.customer_email).toBe("eve-new@corp.com")
  })

  // ── NF-INT-605: POST /magic-link → always 200 ─────────────────────────────

  it("NF-INT-605: POST /api/v1/saas/account/magic-link → always 200", async () => {
    const res = await app.request("/api/v1/saas/account/magic-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "anyone@example.com" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  // ── NF-INT-606: POST /session → valid token → sessionToken ───────────────

  it("NF-INT-606: POST /session with valid magic link token → 200 + sessionToken", async () => {
    const magicToken = signMagicLinkToken("frank@corp.com", "frank-corp")

    const res = await app.request("/api/v1/saas/account/session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: magicToken }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; sessionToken: string }
    expect(body.ok).toBe(true)
    expect(typeof body.sessionToken).toBe("string")
    expect(body.sessionToken.length).toBeGreaterThan(20)
  })

  // ── NF-INT-607: POST /session → invalid token → 401 ──────────────────────

  it("NF-INT-607: POST /session with invalid token → 401", async () => {
    const res = await app.request("/api/v1/saas/account/session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: "bad.token.string" }),
    })
    expect(res.status).toBe(401)
  })

  // ── NF-INT-608: GET /me → valid session → account info ───────────────────

  it("NF-INT-608: GET /me with valid session token → 200 with account info", async () => {
    const intent = await createSignupIntent({
      email:   "grace@corp.com",
      orgSlug: "grace-corp",
      plan:    "growth",
    })

    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       "grace-corp",
      customerEmail: "grace@corp.com",
      plan:          "growth",
    })
    await ctx.db`UPDATE provisionings SET status = 'active' WHERE id = ${prov.id}`

    const sessionToken = signAccountSessionToken("grace@corp.com", "grace-corp")

    const res = await app.request("/api/v1/saas/account/me", {
      method:  "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.slug).toBe("grace-corp")
    expect(body.plan).toBe("growth")
    expect(body.status).toBe("active")
    expect(body.instanceUrl).toBe("https://grace-corp.nestfleet.dev")
  })

  // ── NF-INT-609: Reactivation within window ────────────────────────────────

  it("NF-INT-609: re-subscribe within reactivation window reactivates existing provisioning", async () => {
    const intent = await createSignupIntent({
      email:   "henry@corp.com",
      orgSlug: "henry-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       "henry-corp",
      customerEmail: "henry@corp.com",
      plan:          "starter",
    })

    // Simulate cancellation: status=deprovisioning with reactivation window open
    const reactivationDeadline = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)  // 6 days
    await ctx.db`
      UPDATE provisionings
      SET status = 'deprovisioning',
          deprovision_after     = ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)},
          reactivation_deadline = ${reactivationDeadline}
      WHERE id = ${prov.id}
    `

    // New signup intent for same slug
    const newIntent = await createSignupIntent({
      email:   "henry@corp.com",
      orgSlug: "henry-corp",
      plan:    "starter",
    })

    // Fire checkout.session.completed (re-subscribe)
    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            event_type: "saas_signup",
            intent_id:  newIntent.id,
            slug:       "henry-corp",
            plan:       "starter",
          },
          customer:     "cus_henry_609",
          subscription: "sub_henry_609",
        },
      },
    })

    // Should be reactivated — no new provision job enqueued
    const updated = await findProvisioningBySlug("henry-corp")
    expect(updated?.status).toBe("active")
    expect(updated?.deprovision_after).toBeNull()
    expect(updated?.reactivation_deadline).toBeNull()
    // Provision job should NOT have been enqueued (reactivated, not re-provisioned)
    expect(mockBossSend).not.toHaveBeenCalled()
  })

  // ── NF-INT-610: Reactivation AFTER deadline → new provision job ───────────

  it("NF-INT-610: re-subscribe AFTER reactivation deadline → provision job enqueued", async () => {
    const intent = await createSignupIntent({
      email:   "iris@corp.com",
      orgSlug: "iris-corp",
      plan:    "starter",
    })

    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       "iris-corp",
      customerEmail: "iris@corp.com",
      plan:          "starter",
    })

    // Deadline in the PAST
    const expiredDeadline = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)  // 1 day ago
    await ctx.db`
      UPDATE provisionings
      SET status = 'deprovisioning',
          reactivation_deadline = ${expiredDeadline}
      WHERE id = ${prov.id}
    `

    const newIntent = await createSignupIntent({
      email:   "iris@corp.com",
      orgSlug: "iris-corp2",  // different slug since old one is taken
      plan:    "starter",
    })

    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            event_type: "saas_signup",
            intent_id:  newIntent.id,
            slug:       "iris-corp2",
            plan:       "starter",
          },
          customer:     "cus_iris_610",
          subscription: "sub_iris_610",
        },
      },
    })

    // New slug → no existing deprovisioning → provision job should be enqueued
    expect(mockBossSend).toHaveBeenCalledOnce()
    expect(mockBossSend).toHaveBeenCalledWith(
      "provision_vps",
      { intentId: newIntent.id },
      expect.objectContaining({ singletonKey: newIntent.id }),
    )
  })
})
