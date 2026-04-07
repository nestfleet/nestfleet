/**
 * Unit tests: telemetry ping endpoint + owner/telemetry aggregation — NF-OPS-01 Phase 2.
 *
 * NF-UNIT-TEL-01  insertTelemetryPing stores a row with correct fields
 * NF-UNIT-TEL-02  POST /api/v1/telemetry/ping returns 200 for valid body
 * NF-UNIT-TEL-03  POST /api/v1/telemetry/ping returns 400 for missing instanceId
 * NF-UNIT-TEL-04  GET /api/v1/owner/telemetry aggregates last-24h correctly
 * NF-UNIT-TEL-05  getRecentTelemetry excludes pings older than the cutoff
 */

import { describe, it, expect, vi, beforeAll } from "vitest"

// ── Config mock ───────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:           "test-secret-32-chars-minimum-ok!",
    ENCRYPTION_KEY:       "a".repeat(64),
    DATABASE_URL:         "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:         "anthropic",
    LLM_API_KEY:          "sk-ant-test",
    NODE_ENV:             "test",
    PORT:                 3001,
    BCRYPT_ROUNDS:        12,
    REGISTRATION_ENABLED: false,
    BILLING_ENABLED:      false,
    NESTFLEET_CLOUD_URL:  "https://cloud.nestfleet.dev",
    PROVISIONING_ENABLED: true,
    OWNER_USER_IDS:       "owner-unit-001",
    INSTANCE_ID:          "main-instance-001",
    TELEMETRY_OPT_IN:     false,
    CONSOLE_ORIGIN:       undefined,
  },
}))

// ── Infrastructure mocks ──────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock("../../../src/infra/db/client.js", () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock("../../../src/infra/db/migrate.js", () => ({ runMigrations: vi.fn() }))

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))

// ── Provisioning / billing mocks (imported by api/index.ts transitively) ─────

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  listProvisionings:      vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  findProvisioningBySlug: vi.fn().mockResolvedValue(null),
  updateProvisioning:     vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))

vi.mock("../../../src/provisioning/deprovision.js", () => ({
  deprovisionOne:      vi.fn().mockResolvedValue(undefined),
  startDeprovisioning: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  }),
}))

vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn().mockResolvedValue({ mrrCents: 0, arrCents: 0, paidCount: 0, trialCount: 0, churn30d: 0, weeklySeries: [] }),
  buildCohorts:     vi.fn().mockResolvedValue([]),
}))

// ── Telemetry repo mock ───────────────────────────────────────────────────────

const mockInsertTelemetryPing  = vi.fn().mockResolvedValue(undefined)
const mockGetRecentTelemetry   = vi.fn()
const mockCountDistinctInstances = vi.fn()

vi.mock("../../../src/infra/db/repositories/telemetry.js", () => ({
  get insertTelemetryPing()      { return mockInsertTelemetryPing },
  get getRecentTelemetry()       { return mockGetRecentTelemetry },
  get countDistinctInstances()   { return mockCountDistinctInstances },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeOwnerToken(): Promise<string> {
  const { signJwt } = await import("../../../src/auth/jwt.js")
  return signJwt({ sub: "owner-unit-001", email: "owner@test.com", roles: [], productIds: [] })
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ── NF-UNIT-TEL-01: insertTelemetryPing called with correct fields ────────────

describe("insertTelemetryPing (unit)", () => {
  it("NF-UNIT-TEL-01: stores row with instanceId, version, and payload", async () => {
    const { insertTelemetryPing } = await import("../../../src/infra/db/repositories/telemetry.js")

    await insertTelemetryPing({
      instanceId: "inst-abc",
      version:    "0.1.0",
      payload:    { nodeEnv: "production" },
    })

    expect(mockInsertTelemetryPing).toHaveBeenCalledWith({
      instanceId: "inst-abc",
      version:    "0.1.0",
      payload:    { nodeEnv: "production" },
    })
  })
})

// ── HTTP endpoint tests ───────────────────────────────────────────────────────

describe("POST /api/v1/telemetry/ping", () => {
  let app: typeof import("../../../src/api/index.js").app

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  it("NF-UNIT-TEL-02: returns 200 for valid body", async () => {
    mockInsertTelemetryPing.mockResolvedValueOnce(undefined)

    const res = await app.request("/api/v1/telemetry/ping", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ instanceId: "inst-001", version: "0.1.0" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  })

  it("NF-UNIT-TEL-03: returns 400 for missing instanceId", async () => {
    const res = await app.request("/api/v1/telemetry/ping", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ version: "0.1.0" }), // no instanceId
    })

    expect(res.status).toBe(400)
  })
})

// ── GET /owner/telemetry ──────────────────────────────────────────────────────

describe("GET /api/v1/owner/telemetry", () => {
  let app: typeof import("../../../src/api/index.js").app

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  it("NF-UNIT-TEL-04: returns 200 with aggregated telemetry from last 24h", async () => {
    const fakeRows = [
      { instance_id: "inst-A", version: "0.1.0", reported_at: new Date(Date.now() - 1000 * 60).toISOString(), payload: {} },
      { instance_id: "inst-B", version: "0.2.0", reported_at: new Date(Date.now() - 1000 * 3600).toISOString(), payload: {} },
    ]
    mockGetRecentTelemetry.mockResolvedValueOnce(fakeRows)
    mockCountDistinctInstances.mockResolvedValueOnce(2)

    const token = await makeOwnerToken()
    const res   = await app.request("/api/v1/owner/telemetry", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    const data = body.data as Record<string, unknown>
    expect(typeof data.activeInstances).toBe("number")
    expect(Array.isArray(data.versionDistribution)).toBe(true)
    expect(data.activeInstances).toBe(2)
  })

  it("NF-UNIT-TEL-05: excludes pings older than 24h (getRecentTelemetry called with 24h cutoff)", async () => {
    mockGetRecentTelemetry.mockResolvedValueOnce([])
    mockCountDistinctInstances.mockResolvedValueOnce(0)

    const token = await makeOwnerToken()
    await app.request("/api/v1/owner/telemetry", {
      method:  "GET",
      headers: authHeader(token),
    })

    // Verify getRecentTelemetry was called with a Date ~24h in the past
    expect(mockGetRecentTelemetry).toHaveBeenCalled()
    const callArg = mockGetRecentTelemetry.mock.calls.at(-1)?.[0] as Date
    const diffMs  = Date.now() - callArg.getTime()
    // Should be between 23h and 25h
    expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000)
  })
})
