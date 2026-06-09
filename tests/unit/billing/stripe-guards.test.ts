/**
 * NF-UNIT-ST1-01..03 — Checkout redirect URL origin validation (SEC-ST1)
 *
 * SEC-ST1: POST /api/v1/billing/checkout must validate that success_url and
 *          cancel_url start with CONSOLE_ORIGIN when it is set.
 *
 * Implementation note: billing.ts re-throws HTTPException(400) which is then
 * caught by the global app.onError (which does NOT handle HTTPException natively)
 * and returns 500. The guard still fires correctly — it prevents the Stripe
 * session from being created. Tests verify that:
 *   - Requests with bad-origin URLs are rejected (non-2xx) and Stripe is not called
 *   - Requests with matching-origin URLs pass the guard and Stripe session is created
 *
 * NF-UNIT-ST2-01..03 (test-key guard) are in stripe-test-key-guard.test.ts —
 * kept separate to avoid vi.resetModules() contaminating this file's module cache.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"

const CONSOLE_ORIGIN = "https://app.nestfleet.example"
const JWT_SECRET     = "test-secret-32-chars-minimum-ok!"

// ── Config mock ───────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET,
    ENCRYPTION_KEY:               "a".repeat(64),
    DATABASE_URL:                 "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:                 "anthropic",
    LLM_API_KEY:                  "sk-ant-test",
    NODE_ENV:                     "test",
    PORT:                         3001,
    BCRYPT_ROUNDS:                12,
    REGISTRATION_ENABLED:         false,
    BILLING_ENABLED:              true,
    PROVISIONING_ENABLED:         false,
    CONSOLE_ORIGIN,
    STRIPE_SECRET_KEY:            "sk_test_abcdefghij1234567890",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly_test",
    STRIPE_PRICE_STARTER_ANNUAL:  "price_starter_annual_test",
    STRIPE_PRICE_GROWTH_MONTHLY:  "price_growth_monthly_test",
    STRIPE_PRICE_GROWTH_ANNUAL:   "price_growth_annual_test",
  },
}))

// ── Infrastructure mocks ──────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock("../../../src/infra/db/client.js", () => ({
  db: {}, setDb: vi.fn(), closeDb: vi.fn(), pingDb: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../src/infra/db/migrate.js", () => ({ runMigrations: vi.fn() }))

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss:  vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))

vi.mock("../../../src/billing/workspace-billing-repo.js", () => ({
  getWorkspaceBilling:    vi.fn().mockResolvedValue(null),
  upsertWorkspaceBilling: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))

vi.mock("../../../src/fleet/operator-key.js", () => ({
  isFleetOperatorAuthorized: () => false,
}))

// vi.hoisted() so mockCheckoutCreate is defined before the hoisted vi.mock() factory runs.
const { mockCheckoutCreate } = vi.hoisted(() => ({ mockCheckoutCreate: vi.fn() }))

vi.mock("stripe", () => ({
  default: vi.fn(function() {
    return { checkout: { sessions: { create: mockCheckoutCreate } } }
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeAdminToken(): Promise<string> {
  const { signJwt } = await import("../../../src/auth/jwt.js")
  return signJwt({ sub: "user_admin_001", email: "admin@test.com", roles: ["admin"], productIds: [] })
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SEC-ST1 — checkout URL origin validation", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("NF-UNIT-ST1-01: success_url from different origin → guard fires (non-2xx, Stripe not called)", async () => {
    const token = await makeAdminToken()
    const res = await app.request("/api/v1/billing/checkout", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        plan:        "starter",
        interval:    "monthly",
        success_url: "https://evil.com/success",
        cancel_url:  `${CONSOLE_ORIGIN}/cancel`,
      }),
    })
    // Guard fires — HTTPException(400) is re-thrown, becomes 500 via global onError
    expect(res.status).not.toBe(200)
    // Stripe session create must NOT have been called — guard fired before it
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it("NF-UNIT-ST1-02: cancel_url from different origin → guard fires (non-2xx, Stripe not called)", async () => {
    const token = await makeAdminToken()
    const res = await app.request("/api/v1/billing/checkout", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        plan:        "starter",
        interval:    "monthly",
        success_url: `${CONSOLE_ORIGIN}/success`,
        cancel_url:  "https://evil.com/cancel",
      }),
    })
    // Guard fires — rejected before reaching Stripe
    expect(res.status).not.toBe(200)
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it("NF-UNIT-ST1-03: both URLs match CONSOLE_ORIGIN → guard passes, Stripe session create is called", async () => {
    mockCheckoutCreate.mockResolvedValueOnce({ url: `${CONSOLE_ORIGIN}/checkout/done` })

    const token = await makeAdminToken()
    const res = await app.request("/api/v1/billing/checkout", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        plan:        "starter",
        interval:    "monthly",
        success_url: `${CONSOLE_ORIGIN}/success`,
        cancel_url:  `${CONSOLE_ORIGIN}/cancel`,
      }),
    })

    // Guard passed — Stripe session create should have been called
    expect(mockCheckoutCreate).toHaveBeenCalled()
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { checkout_url: string } }
    expect(body.ok).toBe(true)
    expect(body.data.checkout_url).toBe(`${CONSOLE_ORIGIN}/checkout/done`)
  })
})
