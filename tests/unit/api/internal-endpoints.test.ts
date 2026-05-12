/**
 * NF-UNIT-INT-01..06 — Internal cron endpoint auth guard (SEC-A1)
 *
 * Covers:
 *   POST /api/v1/internal/send-reminders   (cases router)
 *   POST /api/v1/internal/run-escalations  (notifications router)
 *
 * Guard behaviour:
 *   - When INTERNAL_CRON_SECRET is set in config:
 *       missing header   → 401
 *       wrong secret     → 401
 *       correct secret   → proceeds (200 or downstream error, not 401)
 *   - When INTERNAL_CRON_SECRET is NOT set:
 *       request proceeds regardless of header (open in dev/test)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

const CRON_SECRET = "test-cron-secret-32-chars-minimum!"

// ── Config mock ────────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:             "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY:         "a".repeat(64),
    DATABASE_URL:           "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:           "anthropic",
    LLM_API_KEY:            "sk-ant-test",
    NODE_ENV:               "test",
    PORT:                   3001,
    BCRYPT_ROUNDS:          12,
    REGISTRATION_ENABLED:   false,
    BILLING_ENABLED:        false,
    PROVISIONING_ENABLED:   false,
    INTERNAL_CRON_SECRET:   CRON_SECRET,
  },
}))

// ── Infrastructure mocks ───────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock("../../../src/infra/db/client.js", () => ({
  db: {}, setDb: vi.fn(), closeDb: vi.fn(), pingDb: vi.fn().mockResolvedValue(true),
  getDb: vi.fn().mockReturnValue({
    // postgres tagged-template — return empty array for stale-case query
    [Symbol.iterator]: vi.fn(),
  }),
}))
vi.mock("../../../src/infra/db/migrate.js",  () => ({ runMigrations: vi.fn() }))
vi.mock("../../../src/infra/queue/boss.js",  () => ({
  getBoss:  vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))

// ── Domain / service mocks ─────────────────────────────────────────────────────

vi.mock("../../../src/domain/cases.js", () => ({
  findProductById: vi.fn().mockResolvedValue(null),
  getCasesByStatus: vi.fn().mockResolvedValue([]),
}))
vi.mock("../../../src/notifications/escalation.js", () => ({
  runEscalations: vi.fn().mockResolvedValue({ escalated: 0, skipped: 0 }),
}))
vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({}),
  priceIdToPlan:   vi.fn().mockReturnValue(null),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Internal cron endpoint auth guard (SEC-A1)", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── send-reminders ────────────────────────────────────────────────────────

  it("NF-UNIT-INT-01: POST /internal/send-reminders missing header → 401", async () => {
    const res = await app.request("/api/v1/internal/send-reminders", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ product_id: "prod_001" }),
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it("NF-UNIT-INT-02: POST /internal/send-reminders wrong secret → 401", async () => {
    const res = await app.request("/api/v1/internal/send-reminders", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Internal-Secret": "wrong-secret",
      },
      body: JSON.stringify({ product_id: "prod_001" }),
    })
    expect(res.status).toBe(401)
  })

  it("NF-UNIT-INT-03: POST /internal/send-reminders correct secret → not 401", async () => {
    const res = await app.request("/api/v1/internal/send-reminders", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Internal-Secret": CRON_SECRET,
      },
      body: JSON.stringify({ product_id: "prod_001" }),
    })
    // Guard passed — may be 404 (product not found) or 200, but NOT 401
    expect(res.status).not.toBe(401)
  })

  // ── run-escalations ───────────────────────────────────────────────────────

  it("NF-UNIT-INT-04: POST /internal/run-escalations missing header → 401", async () => {
    const res = await app.request("/api/v1/internal/run-escalations", {
      method: "POST",
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it("NF-UNIT-INT-05: POST /internal/run-escalations wrong secret → 401", async () => {
    const res = await app.request("/api/v1/internal/run-escalations", {
      method:  "POST",
      headers: { "X-Internal-Secret": "not-the-right-secret" },
    })
    expect(res.status).toBe(401)
  })

  it("NF-UNIT-INT-06: POST /internal/run-escalations correct secret → not 401", async () => {
    const res = await app.request("/api/v1/internal/run-escalations", {
      method:  "POST",
      headers: { "X-Internal-Secret": CRON_SECRET },
    })
    expect(res.status).not.toBe(401)
  })
})

// ── Guard fail-closed when INTERNAL_CRON_SECRET not set (C4) ─────────────────

describe("Internal cron endpoint — fail-closed when no secret configured (C4)", () => {
  it("C4-T01: missing header → 401 even when INTERNAL_CRON_SECRET is unset", async () => {
    const { config } = await import("../../../src/shared/config.js")
    ;(config as Record<string, unknown>).INTERNAL_CRON_SECRET = undefined
    const { app: appNoSecret } = await import("../../../src/api/index.js")

    const res = await appNoSecret.request("/api/v1/internal/run-escalations", {
      method: "POST",
    })
    expect(res.status).toBe(401)
  })

  it("C4-T02: correct header but no secret configured → still 401 (fail-closed)", async () => {
    const { config } = await import("../../../src/shared/config.js")
    ;(config as Record<string, unknown>).INTERNAL_CRON_SECRET = undefined
    const { app: appNoSecret } = await import("../../../src/api/index.js")

    const res = await appNoSecret.request("/api/v1/internal/run-escalations", {
      method:  "POST",
      headers: { "X-Internal-Secret": "any-value" },
    })
    expect(res.status).toBe(401)
  })
})
