/**
 * NF-UNIT-ARL-01..06 — Login rate limiting (SEC-RL2)
 *
 * Covers:
 *   POST /api/v1/auth/login — 5 attempts per IP per 5 minutes
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"

// ── Config mock ────────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:           "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY:       "a".repeat(64),
    DATABASE_URL:         "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:         "anthropic",
    LLM_API_KEY:          "sk-ant-test",
    NODE_ENV:             "test",
    PORT:                 3001,
    BCRYPT_ROUNDS:        12,
    REGISTRATION_ENABLED: false,
    BILLING_ENABLED:      false,
    PROVISIONING_ENABLED: false,
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

// findOperatorUserByEmail always returns null (invalid credentials — simplifies test)
vi.mock("../../../src/infra/db/repositories/operator-users.js", () => ({
  findOperatorUserByEmail: vi.fn().mockResolvedValue(null),
}))

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({}),
  priceIdToPlan:   vi.fn().mockReturnValue(null),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))

// ── Test helpers ───────────────────────────────────────────────────────────────

function loginRequest(ip: string) {
  return {
    method:  "POST" as const,
    headers: {
      "Content-Type":    "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ email: "test@example.com", password: "wrong" }),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Login rate limiting (SEC-RL2)", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>
  let loginRlMap: Map<string, { count: number; resetAt: number }>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
    // Import the map for direct inspection / cleanup between tests
    const authMod = await import("../../../src/api/v1/auth.js")
    loginRlMap = (authMod as unknown as { loginRlMap: Map<string, { count: number; resetAt: number }> }).loginRlMap
  })

  beforeEach(() => {
    loginRlMap?.clear()
    vi.clearAllMocks()
  })

  // ── NF-UNIT-ARL-01: 6th request from same IP is blocked ───────────────────

  it("NF-UNIT-ARL-01: 6th login attempt from same IP → 429", async () => {
    const ip = "10.0.0.1"
    // 5 allowed attempts
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/api/v1/auth/login", loginRequest(ip))
      expect(res.status).not.toBe(429)
    }
    // 6th blocked
    const res = await app.request("/api/v1/auth/login", loginRequest(ip))
    expect(res.status).toBe(429)
    const body = await res.json() as { error: string }
    expect(body.error).toBe("TOO_MANY_REQUESTS")
  })

  // ── NF-UNIT-ARL-02: different IPs have independent buckets ────────────────

  it("NF-UNIT-ARL-02: different IPs are not rate-limited together", async () => {
    // Exhaust IP A
    for (let i = 0; i < 5; i++) {
      await app.request("/api/v1/auth/login", loginRequest("192.168.1.1"))
    }
    const blockedA = await app.request("/api/v1/auth/login", loginRequest("192.168.1.1"))
    expect(blockedA.status).toBe(429)

    // IP B should still be allowed
    const allowedB = await app.request("/api/v1/auth/login", loginRequest("192.168.1.2"))
    expect(allowedB.status).not.toBe(429)
  })

  // ── NF-UNIT-ARL-03: rate limit returns 429 before credential check ────────

  it("NF-UNIT-ARL-03: rate limit fires before credential check (blocked → 429, not 401)", async () => {
    const ip = "10.0.0.2"
    for (let i = 0; i < 5; i++) {
      await app.request("/api/v1/auth/login", loginRequest(ip))
    }
    const res = await app.request("/api/v1/auth/login", loginRequest(ip))
    // Must be 429, NOT 401 (credential check never reached)
    expect(res.status).toBe(429)
  })

  // ── NF-UNIT-ARL-04: counter resets after window expiry ────────────────────

  it("NF-UNIT-ARL-04: expired window allows requests again", async () => {
    const ip = "10.0.0.3"
    // Exhaust
    for (let i = 0; i < 5; i++) {
      await app.request("/api/v1/auth/login", loginRequest(ip))
    }
    // Manually expire the entry
    const entry = loginRlMap.get(ip)
    if (entry) entry.resetAt = Date.now() - 1

    // Now should be allowed again
    const res = await app.request("/api/v1/auth/login", loginRequest(ip))
    expect(res.status).not.toBe(429)
  })

  // ── NF-UNIT-ARL-05: map cleanup removes expired entries ───────────────────

  it("NF-UNIT-ARL-05: calling login evicts expired entries from loginRlMap", async () => {
    // Plant stale entries
    loginRlMap.set("stale1", { count: 5, resetAt: Date.now() - 1000 })
    loginRlMap.set("stale2", { count: 5, resetAt: Date.now() - 1000 })
    expect(loginRlMap.size).toBe(2)

    // Any login call triggers cleanup
    await app.request("/api/v1/auth/login", loginRequest("10.0.1.1"))

    expect(loginRlMap.has("stale1")).toBe(false)
    expect(loginRlMap.has("stale2")).toBe(false)
  })

  // ── NF-UNIT-ARL-06: first 5 requests are allowed (limit is inclusive) ─────

  it("NF-UNIT-ARL-06: exactly 5 attempts are allowed, 6th is blocked", async () => {
    const ip = "10.0.0.4"
    const statuses: number[] = []

    for (let i = 0; i < 6; i++) {
      const res = await app.request("/api/v1/auth/login", loginRequest(ip))
      statuses.push(res.status)
    }

    // First 5: should be 401 (wrong credentials), not 429
    for (let i = 0; i < 5; i++) {
      expect(statuses[i]).toBe(401)
    }
    // 6th: should be 429
    expect(statuses[5]).toBe(429)
  })
})
