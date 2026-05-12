/**
 * Unit tests: email inbound webhook authentication (C5)
 *
 * C5-T01  missing X-Webhook-Secret header → 401
 * C5-T02  wrong X-Webhook-Secret value → 401
 * C5-T03  correct X-Webhook-Secret → proceeds (200 or downstream error, not 401)
 * C5-T04  EMAIL_WEBHOOK_SECRET not configured → 401 (fail-closed, not open)
 */

import { describe, it, expect, vi, beforeAll } from "vitest"

const WEBHOOK_SECRET = "test-email-webhook-secret-minimum-32chars!"

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:            "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL:          "postgres://localhost/nestfleet_test",
    NODE_ENV:              "test",
    PORT:                  3001,
    BCRYPT_ROUNDS:         12,
    REGISTRATION_ENABLED:  false,
    BILLING_ENABLED:       false,
    PROVISIONING_ENABLED:  false,
    INTERNAL_CRON_SECRET:  "cron-secret-32-chars-minimum-ok!!",
    EMAIL_WEBHOOK_SECRET:  WEBHOOK_SECRET,
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
  getBoss:  vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))
vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({}),
  priceIdToPlan:   vi.fn().mockReturnValue(null),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(), buildCohorts: vi.fn(),
}))
vi.mock("../../../src/ingress/signal-ingress.js", () => ({
  ingestEmailSignal: vi.fn().mockResolvedValue({
    duplicate: false, signalId: "sig_1", caseId: "case_1",
    conversationId: "conv_1", identityId: "ident_1",
  }),
}))

function makePayload() {
  return JSON.stringify({
    MessageID:   `test-msg-${Date.now()}@example.com`,
    From:        "alice@example.com",
    FromFull:    { Email: "alice@example.com", Name: "Alice" },
    To:          "support@example.com",
    Subject:     "Test issue",
    TextBody:    "Something broke.",
    HtmlBody:    "",
    ReplyTo:     "",
    Date:        new Date().toISOString(),
    Headers:     [],
    Attachments: [],
  })
}

describe("Email inbound webhook — authentication guard (C5)", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  it("C5-T01: missing X-Webhook-Secret header → 401", async () => {
    const res = await app.request("/webhooks/email/inbound/prod_test", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    makePayload(),
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it("C5-T02: wrong X-Webhook-Secret value → 401", async () => {
    const res = await app.request("/webhooks/email/inbound/prod_test", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": "wrong-secret" },
      body:    makePayload(),
    })
    expect(res.status).toBe(401)
  })

  it("C5-T03: correct X-Webhook-Secret → proceeds (not 401)", async () => {
    const res = await app.request("/webhooks/email/inbound/prod_test", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": WEBHOOK_SECRET },
      body:    makePayload(),
    })
    expect(res.status).not.toBe(401)
  })
})

// ── Fail-closed when secret not configured ─────────────────────────────────────

describe("Email inbound webhook — secret not configured (fail-closed)", () => {
  let appNoSecret: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const { config } = await import("../../../src/shared/config.js")
    ;(config as Record<string, unknown>).EMAIL_WEBHOOK_SECRET = undefined
    const mod = await import("../../../src/api/index.js")
    appNoSecret = mod.app
  })

  it("C5-T04: EMAIL_WEBHOOK_SECRET not configured → 401 (fail-closed)", async () => {
    const res = await appNoSecret.request("/webhooks/email/inbound/prod_test", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": "any-value" },
      body:    makePayload(),
    })
    expect(res.status).toBe(401)
  })
})
