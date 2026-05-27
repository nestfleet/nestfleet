/**
 * NF-UNIT-ST2-01..03 — Stripe test-key guard in production (SEC-ST2)
 *
 * SEC-ST2: getStripeClient() must throw when NODE_ENV=production and
 *          STRIPE_SECRET_KEY starts with "sk_test_".
 *
 * Each test resets the module cache so the singleton _stripe is fresh.
 * Uses vi.doMock (non-hoisted) after vi.resetModules() in each test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("SEC-ST2 — getStripeClient() rejects test key in production", () => {
  let origNodeEnv: string | undefined

  beforeEach(() => {
    origNodeEnv = process.env.NODE_ENV
    vi.resetModules()
  })

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv
    vi.resetModules()
  })

  it("NF-UNIT-ST2-01: NODE_ENV=production + sk_test_ key → getStripeClient() throws /test key/i", async () => {
    process.env.NODE_ENV = "production"

    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        NODE_ENV:                     "production",
        STRIPE_SECRET_KEY:            "sk_test_abcdefghij1234567890",
        STRIPE_PRICE_STARTER_MONTHLY: null,
        STRIPE_PRICE_STARTER_ANNUAL:  null,
        STRIPE_PRICE_GROWTH_MONTHLY:  null,
        STRIPE_PRICE_GROWTH_ANNUAL:   null,
      },
    }))

    const { getStripeClient } = await import("../../../src/billing/stripe.js")
    expect(() => getStripeClient()).toThrow(/test key/i)
  })

  it("NF-UNIT-ST2-02: NODE_ENV=production + sk_live_ key → does NOT throw the test-key guard error", async () => {
    process.env.NODE_ENV = "production"

    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        STRIPE_SECRET_KEY:            "sk_live_abcdefghij1234567890",
        STRIPE_PRICE_STARTER_MONTHLY: null,
        STRIPE_PRICE_STARTER_ANNUAL:  null,
        STRIPE_PRICE_GROWTH_MONTHLY:  null,
        STRIPE_PRICE_GROWTH_ANNUAL:   null,
      },
    }))

    // Mock Stripe SDK to avoid real HTTP calls
    vi.doMock("stripe", () => ({
      default: vi.fn().mockImplementation(() => ({
        checkout: { sessions: { create: vi.fn() } },
      })),
    }))

    const { getStripeClient } = await import("../../../src/billing/stripe.js")

    let thrownMessage: string | undefined
    try {
      getStripeClient()
    } catch (err) {
      thrownMessage = (err as Error).message
    }

    // The test-key guard specifically must NOT have fired
    if (thrownMessage) {
      expect(thrownMessage).not.toMatch(/test key/i)
    }
    // Either succeeds (Stripe client created) or throws for a different reason — both are fine
  })

  it("NF-UNIT-ST2-03: NODE_ENV=test + sk_test_ key → does NOT throw", async () => {
    process.env.NODE_ENV = "test"

    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        STRIPE_SECRET_KEY:            "sk_test_abcdefghij1234567890",
        STRIPE_PRICE_STARTER_MONTHLY: null,
        STRIPE_PRICE_STARTER_ANNUAL:  null,
        STRIPE_PRICE_GROWTH_MONTHLY:  null,
        STRIPE_PRICE_GROWTH_ANNUAL:   null,
      },
    }))

    // Mock Stripe constructor to avoid real network call
    vi.doMock("stripe", () => ({
      default: vi.fn().mockImplementation(() => ({
        checkout: { sessions: { create: vi.fn() } },
      })),
    }))

    const { getStripeClient } = await import("../../../src/billing/stripe.js")
    // Should NOT throw the test-key guard
    expect(() => getStripeClient()).not.toThrow()
  })
})
