/**
 * NF-BIL-01..13: Stripe webhook handler unit tests.
 *
 * Tests the pure sync logic in handleStripeEvent() — no DB, no HTTP.
 * Mirrors DG billing-checkout test structure (13 cases).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.doMock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Config mock (BILLING_ENABLED=true, Stripe keys present) ──────────────────
vi.doMock("../../../src/shared/config.js", () => ({
  config: {
    BILLING_ENABLED: true,
    STRIPE_SECRET_KEY: "sk_test_abc123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_abc",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
    STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_starter_growth",
    STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
    NODE_ENV: "test",
  },
}))

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockUpsertBilling = vi.fn().mockResolvedValue(undefined)
vi.doMock("../../../src/billing/workspace-billing-repo.js", () => ({
  upsertWorkspaceBilling: mockUpsertBilling,
}))

// ── Stripe mock ───────────────────────────────────────────────────────────────
vi.doMock("../../../src/billing/stripe.js", () => ({
  getStripeClient: () => ({}),
  priceIdToPlan: (id: string) => {
    const map: Record<string, { plan: string; interval: string }> = {
      price_starter_monthly: { plan: "starter", interval: "monthly" },
      price_starter_annual:  { plan: "starter", interval: "annual" },
      price_starter_growth:  { plan: "growth",  interval: "monthly" },
      price_growth_annual:   { plan: "growth",  interval: "annual" },
    }
    return map[id] ?? null
  },
}))

async function loadHandler() {
  vi.resetModules()
  const mod = await import("../../../src/billing/webhook.js")
  return mod.handleStripeEvent
}

describe("handleStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // NF-BIL-01
  it("checkout.session.completed — upserts billing with stripe IDs and plan", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_abc",
          subscription: "sub_abc",
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_abc",
        stripeSubscriptionId: "sub_abc",
      }),
    )
  })

  // NF-BIL-02
  it("customer.subscription.updated — active → sets plan from price ID", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "active",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "starter",
        planInterval: "monthly",
        status: "active",
      }),
    )
  })

  // NF-BIL-03
  it("customer.subscription.updated — growth annual plan resolves correctly", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_growth",
          customer: "cus_abc",
          status: "active",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_growth_annual" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "growth", planInterval: "annual" }),
    )
  })

  // NF-BIL-04
  it("customer.subscription.updated — trialing status preserved", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "trialing",
          cancel_at: null,
          trial_end: 1893456000,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trialing" }),
    )
  })

  // NF-BIL-05
  it("customer.subscription.updated — past_due sets status", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "past_due",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    )
  })

  // NF-BIL-06
  it("customer.subscription.updated — cancel_at forwarded as ISO string", async () => {
    const handleStripeEvent = await loadHandler()
    const cancelAt = 1893456000
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "active",
          cancel_at: cancelAt,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelAt: new Date(cancelAt * 1000).toISOString(),
      }),
    )
  })

  // NF-BIL-07
  it("customer.subscription.updated — null cancel_at forwarded as null", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "active",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAt: null }),
    )
  })

  // NF-BIL-08
  it("customer.subscription.deleted — sets plan=community, status=canceled", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "canceled",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "community", status: "canceled" }),
    )
  })

  // NF-BIL-09
  it("unknown event type — does not call upsert", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "payment_intent.created",
      data: { object: {} },
    } as never)

    expect(mockUpsertBilling).not.toHaveBeenCalled()
  })

  // NF-BIL-10
  it("customer.subscription.updated — unknown price ID maps plan to null, upsert still called", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "active",
          cancel_at: null,
          trial_end: null,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_unknown_xyz" } }] },
        },
      },
    } as never)

    // Unknown price → plan stays null (repo handles the fallback)
    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({ plan: null }),
    )
  })

  // NF-BIL-11
  it("customer.subscription.updated — trial_end forwarded when present", async () => {
    const handleStripeEvent = await loadHandler()
    const trialEnd = 1893456000
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "trialing",
          cancel_at: null,
          trial_end: trialEnd,
          current_period_end: 1893456000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        trialEndsAt: new Date(trialEnd * 1000).toISOString(),
      }),
    )
  })

  // NF-BIL-12
  it("customer.subscription.updated — current_period_end forwarded as ISO string", async () => {
    const handleStripeEvent = await loadHandler()
    const periodEnd = 1893456000
    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_abc",
          customer: "cus_abc",
          status: "active",
          cancel_at: null,
          trial_end: null,
          current_period_end: periodEnd,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    } as never)

    expect(mockUpsertBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
      }),
    )
  })

  // NF-BIL-13
  it("checkout.session.completed — upsert not called when customer is missing", async () => {
    const handleStripeEvent = await loadHandler()
    await handleStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          customer: null,
          subscription: "sub_abc",
        },
      },
    } as never)

    expect(mockUpsertBilling).not.toHaveBeenCalled()
  })
})
