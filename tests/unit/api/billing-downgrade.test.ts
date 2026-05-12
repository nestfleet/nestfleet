// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * NF-UNIT-BD-01..05 — Billing downgrade tier guard (SEC-ST3)
 *
 * Covers:
 *   POST /api/v1/billing/downgrade — rejects requests where target plan >= current plan
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"

// ── Config mock ────────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:            "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL:          "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:          "anthropic",
    LLM_API_KEY:           "sk-ant-test",
    NODE_ENV:              "test",
    PORT:                  3001,
    BCRYPT_ROUNDS:         12,
    REGISTRATION_ENABLED:  false,
    BILLING_ENABLED:       true,
    PROVISIONING_ENABLED:  false,
    CONSOLE_ORIGIN:        "https://app.nestfleet.dev",
  },
}))

// ── Infrastructure mocks ───────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock("../../../src/infra/db/client.js", () => ({
  db: {}, setDb: vi.fn(), closeDb: vi.fn(), pingDb: vi.fn().mockResolvedValue(true),
}))
vi.mock("../../../src/infra/db/migrate.js",  () => ({ runMigrations: vi.fn() }))
vi.mock("../../../src/infra/queue/boss.js",  () => ({
  getBoss:  vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))
vi.mock("../../../src/infra/db/repositories/operator-users.js", () => ({
  findOperatorUserByEmail: vi.fn().mockResolvedValue(null),
}))

// ── Billing repo mock ──────────────────────────────────────────────────────────

const mockGetWorkspaceBilling = vi.fn()

vi.mock("../../../src/billing/workspace-billing-repo.js", () => ({
  get getWorkspaceBilling() { return mockGetWorkspaceBilling },
  upsertWorkspaceBilling: vi.fn(),
}))

// ── Stripe client mock ─────────────────────────────────────────────────────────

const mockSubscriptionsRetrieve = vi.fn()
const mockSubscriptionsUpdate   = vi.fn()

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update:   mockSubscriptionsUpdate,
    },
  }),
  planToPriceId: vi.fn().mockReturnValue("price_test_starter_monthly"),
  priceIdToPlan: vi.fn().mockReturnValue(null),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

async function makeAdminToken(sub = "user_admin_001"): Promise<string> {
  const { signJwt } = await import("../../../src/auth/jwt.js")
  return signJwt({ sub, email: `${sub}@test.com`, roles: ["admin"], productIds: [] })
}

function downgradeRequest(body: Record<string, unknown>, token: string) {
  return {
    method:  "POST" as const,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  }
}

function billingRow(plan: string) {
  return {
    id: 1,
    stripe_customer_id:     "cus_test",
    stripe_subscription_id: "sub_test",
    plan,
    plan_interval:          "monthly",
    status:                 "active",
    trial_ends_at:          null,
    current_period_end:     null,
    cancel_at:              null,
    updated_at:             new Date(),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Billing downgrade tier guard (SEC-ST3)", () => {
  let app: { fetch: (req: Request) => Promise<Response> }
  let token: string

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app   = mod.app
    token = await makeAdminToken()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_test", current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
    })
    mockSubscriptionsUpdate.mockResolvedValue({
      items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
    })
  })

  // NF-UNIT-BD-01: valid downgrade (Growth → Starter) passes the guard
  it("NF-UNIT-BD-01: Growth → Starter passes guard and calls Stripe", async () => {
    mockGetWorkspaceBilling.mockResolvedValue(billingRow("growth"))

    const res = await app.fetch(
      new Request("http://localhost/api/v1/billing/downgrade", downgradeRequest({ plan: "starter", interval: "monthly" }, token)),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mockSubscriptionsUpdate).toHaveBeenCalledOnce()
  })

  // NF-UNIT-BD-02: same plan (Starter → Starter) is rejected
  it("NF-UNIT-BD-02: Starter → Starter → 400 INVALID_DOWNGRADE", async () => {
    mockGetWorkspaceBilling.mockResolvedValue(billingRow("starter"))

    const res = await app.fetch(
      new Request("http://localhost/api/v1/billing/downgrade", downgradeRequest({ plan: "starter", interval: "monthly" }, token)),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("INVALID_DOWNGRADE")
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  // NF-UNIT-BD-03: higher plan (Community → Starter body, but current=community) is rejected
  // Simulates a corrupted client request or crafted body where plan >= current
  it("NF-UNIT-BD-03: target plan >= current (community → starter rejected when on community)", async () => {
    mockGetWorkspaceBilling.mockResolvedValue(billingRow("community"))

    const res = await app.fetch(
      new Request("http://localhost/api/v1/billing/downgrade", downgradeRequest({ plan: "starter", interval: "monthly" }, token)),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("INVALID_DOWNGRADE")
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  // NF-UNIT-BD-04: no subscription row → 400 NO_SUBSCRIPTION (existing guard, regression)
  it("NF-UNIT-BD-04: no subscription row → 400 NO_SUBSCRIPTION", async () => {
    mockGetWorkspaceBilling.mockResolvedValue(null)

    const res = await app.fetch(
      new Request("http://localhost/api/v1/billing/downgrade", downgradeRequest({ plan: "starter", interval: "monthly" }, token)),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("NO_SUBSCRIPTION")
  })

  // NF-UNIT-BD-05: BILLING_ENABLED=false → 404 (billing guard regression)
  it("NF-UNIT-BD-05: BILLING_ENABLED=false → 404", async () => {
    const { config } = await import("../../../src/shared/config.js")
    const origEnabled = config.BILLING_ENABLED;
    (config as Record<string, unknown>).BILLING_ENABLED = false

    try {
      const res = await app.fetch(
        new Request("http://localhost/api/v1/billing/downgrade", downgradeRequest({ plan: "starter", interval: "monthly" }, token)),
      )
      expect(res.status).toBe(404)
    } finally {
      (config as Record<string, unknown>).BILLING_ENABLED = origEnabled
    }
  })
})
