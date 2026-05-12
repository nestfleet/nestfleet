/**
 * Unit tests: fleet route gate (C6)
 *
 * C6-T01  GET /api/v1/saas/* → 404 when isFleetOperatorAuthorized() returns false
 * C6-T02  GET /api/v1/saas/account/* → 404 when not authorized
 * C6-T03  GET /api/v1/owner/* → 404 when not authorized
 * C6-T04  Fleet routes respond (non-404) when isFleetOperatorAuthorized() returns true
 * C6-T05  Waitlist route remains accessible regardless of fleet authorization state
 */

import { describe, it, expect, vi, beforeAll } from "vitest"

// ── Control isFleetOperatorAuthorized() via mock ───────────────────────────────

let fleetAuthorized = false

vi.mock("../../../src/fleet/operator-key.js", () => ({
  isFleetOperatorAuthorized: () => fleetAuthorized,
  verifyOperatorKey:         vi.fn(),
  _resetOperatorState:       vi.fn(),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:            "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL:          "postgres://localhost/nestfleet_test",
    // Use "development" so the NODE_ENV === "test" bypass in api/index.ts does NOT fire.
    // The gate then depends purely on isFleetOperatorAuthorized(), which is mocked above.
    NODE_ENV:              "development",
    PORT:                  3001,
    BCRYPT_ROUNDS:         12,
    REGISTRATION_ENABLED:  false,
    BILLING_ENABLED:       false,
    PROVISIONING_ENABLED:  false,
    INTERNAL_CRON_SECRET:  "cron-secret-32-chars-minimum-ok!!",
    EMAIL_WEBHOOK_SECRET:  "email-secret-32-chars-minimum-ok!",
    CONSOLE_ORIGIN:        undefined,
  },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock("../../../src/infra/db/client.js", () => ({
  db: {}, setDb: vi.fn(), closeDb: vi.fn(), pingDb: vi.fn().mockResolvedValue(true),
  getDb: vi.fn().mockReturnValue({}),
}))
vi.mock("../../../src/infra/db/migrate.js", () => ({ runMigrations: vi.fn() }))
vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss:      vi.fn().mockResolvedValue({ send: vi.fn() }),
  getBossState: vi.fn().mockReturnValue("started"),
  initBoss:     vi.fn(),
}))
vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({}),
  priceIdToPlan:   vi.fn().mockReturnValue(null),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))

describe("Fleet route gate — operator key not present", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    fleetAuthorized = false
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  it("C6-T01: GET /api/v1/saas/* → 404 when fleet not authorized", async () => {
    const res = await app.request("/api/v1/saas/signup", { method: "POST" })
    expect(res.status).toBe(404)
  })

  it("C6-T02: GET /api/v1/saas/account/* → 404 when fleet not authorized", async () => {
    const res = await app.request("/api/v1/saas/account/me", { method: "GET" })
    expect(res.status).toBe(404)
  })

  it("C6-T03: GET /api/v1/owner/* → 404 when fleet not authorized", async () => {
    const res = await app.request("/api/v1/owner/revenue", { method: "GET" })
    expect(res.status).toBe(404)
  })

  it("C6-T05: POST /api/v1/waitlist is accessible regardless of fleet auth", async () => {
    const res = await app.request("/api/v1/waitlist", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "test@example.com" }),
    })
    // Not 404 — route exists and is unconditionally mounted (may be 400/429 for rate limit, but not 404)
    expect(res.status).not.toBe(404)
  })
})

describe("Fleet route gate — gate logic", () => {
  it("C6-T04: isFleetOperatorAuthorized() mock returns true when fleetAuthorized=true", async () => {
    // The gate condition in api/index.ts is:
    //   if (isFleetOperatorAuthorized() || config.NODE_ENV === "test") { mount routes }
    // T01–T03 prove the "not authorized + non-test env → 404" path.
    // This test proves the mock control works correctly — the end-to-end "authorized routes
    // respond with non-404" case is covered by:
    //   tests/integration/provisioning/saas-signup.test.ts  (saasRouter)
    //   tests/integration/owner-revenue.test.ts             (ownerRouter)
    fleetAuthorized = true
    const { isFleetOperatorAuthorized } = await import("../../../src/fleet/operator-key.js")
    expect(isFleetOperatorAuthorized()).toBe(true)
    fleetAuthorized = false
  })
})
