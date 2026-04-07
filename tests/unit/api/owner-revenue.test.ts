/**
 * NF-UNIT-OWN-01..06: Owner API endpoint unit tests.
 *
 * Covers the three new revenue/cohort endpoints and the existing
 * auth middleware (PROVISIONING_ENABLED gate, OWNER_USER_IDS check).
 *
 * New endpoints (TDD — not yet implemented):
 *   GET /api/v1/owner/me
 *   GET /api/v1/owner/revenue
 *   GET /api/v1/owner/cohorts
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest"

// ── Config mock ───────────────────────────────────────────────────────────────
// Must appear before any module that imports config, because config is parsed
// at module load time. The PROVISIONING_ENABLED / OWNER_USER_IDS values are
// overridden per-describe block using vi.stubEnv, but the initial parse must
// succeed, so we stub the module entirely.

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
    OWNER_USER_IDS:       "user_owner_001",
    CONSOLE_ORIGIN:       undefined,
  },
}))

// ── Infrastructure mocks ──────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock("../../../src/infra/db/client.js", () => ({
  db: {},
  setDb: vi.fn(),
  closeDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../src/infra/db/migrate.js", () => ({ runMigrations: vi.fn() }))

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))

vi.mock("../../../src/infra/telemetry.js", () => ({ initTelemetry: vi.fn() }))

// ── Domain repository mocks (owner router imports these via the fleet endpoints) ─

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  listProvisionings:      vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  findProvisioningBySlug: vi.fn().mockResolvedValue(null),
  updateProvisioning:     vi.fn().mockResolvedValue(undefined),
}))

// ── Provisioning / Hetzner / Cloudflare mocks ─────────────────────────────────

vi.mock("../../../src/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))

vi.mock("../../../src/provisioning/deprovision.js", () => ({
  deprovisionOne:     vi.fn().mockResolvedValue(undefined),
  startDeprovisioning: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

// ── Stripe client mock (prevent getStripeClient() from throwing in tests) ────

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
  }),
}))

// ── Stripe revenue mock ───────────────────────────────────────────────────────

const mockAggregateRevenue = vi.fn()
const mockBuildCohorts     = vi.fn()

vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  get aggregateRevenue() { return mockAggregateRevenue },
  get buildCohorts()     { return mockBuildCohorts },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sign a real JWT using the project's signJwt utility.
 * The JWT_SECRET in the mocked config is "test-secret-32-chars-minimum-ok!" —
 * signJwt reads config.JWT_SECRET at call time, so this just works.
 */
async function makeToken(sub: string): Promise<string> {
  const { signJwt } = await import("../../../src/auth/jwt.js")
  return signJwt({ sub, email: `${sub}@test.com`, roles: [], productIds: [] })
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ── Fixed revenue / cohort fixtures ──────────────────────────────────────────

const FIXED_REVENUE = {
  mrrCents:     9900,
  arrCents:     118800,
  paidCount:    5,
  trialCount:   2,
  churn30d:     0.02,
  weeklySeries: [{ week: "2026-03-30", mrr: 9900 }],
}

const FIXED_COHORTS = [
  { week: "2026-03-23", new: 3, retained: 2, churned: 1, retentionRate: 0.67 },
]

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Owner API — revenue & cohort endpoints", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  beforeEach(async () => {
    // Reset the module-level revenue/cohort cache so each test starts cold.
    const { _resetOwnerCache } = await import("../../../src/api/v1/owner.js")
    _resetOwnerCache()
  })

  afterAll(() => {
    vi.clearAllMocks()
  })

  // ── NF-UNIT-OWN-01 ────────────────────────────────────────────────────────

  it("NF-UNIT-OWN-01: GET /api/v1/owner/me — 200 with isOwner:true for valid owner JWT", async () => {
    const token = await makeToken("user_owner_001")
    const res   = await app.request("/api/v1/owner/me", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.isOwner).toBe(true)
  })

  // ── NF-UNIT-OWN-02 ────────────────────────────────────────────────────────

  it("NF-UNIT-OWN-02: GET /api/v1/owner/me — 403 for JWT whose sub is NOT in OWNER_USER_IDS", async () => {
    const token = await makeToken("user_non_owner_999")
    const res   = await app.request("/api/v1/owner/me", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(403)
  })

  // ── NF-UNIT-OWN-03 ────────────────────────────────────────────────────────

  it("NF-UNIT-OWN-03: GET /api/v1/owner/revenue — 200 with shaped RevenueData", async () => {
    mockAggregateRevenue.mockResolvedValueOnce(FIXED_REVENUE)

    const token = await makeToken("user_owner_001")
    const res   = await app.request("/api/v1/owner/revenue", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    const data = body.data as Record<string, unknown>
    expect(typeof data.mrrCents).toBe("number")
    expect(typeof data.arrCents).toBe("number")
    expect(typeof data.paidCount).toBe("number")
    expect(typeof data.trialCount).toBe("number")
    expect(typeof data.churn30d).toBe("number")
    expect(Array.isArray(data.weeklySeries)).toBe(true)

    // Values must match the mock fixture exactly
    expect(data.mrrCents).toBe(FIXED_REVENUE.mrrCents)
    expect(data.arrCents).toBe(FIXED_REVENUE.arrCents)
    expect(data.paidCount).toBe(FIXED_REVENUE.paidCount)
    expect(data.trialCount).toBe(FIXED_REVENUE.trialCount)
    expect(data.churn30d).toBe(FIXED_REVENUE.churn30d)
  })

  // ── NF-UNIT-OWN-04 ────────────────────────────────────────────────────────

  it("NF-UNIT-OWN-04: GET /api/v1/owner/revenue — 503 when aggregateRevenue throws", async () => {
    mockAggregateRevenue.mockRejectedValueOnce(new Error("Stripe client unavailable"))

    const token = await makeToken("user_owner_001")
    const res   = await app.request("/api/v1/owner/revenue", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(503)
  })

  // ── NF-UNIT-OWN-05 ────────────────────────────────────────────────────────

  it("NF-UNIT-OWN-05: GET /api/v1/owner/cohorts — 200 with CohortWeek[]", async () => {
    mockBuildCohorts.mockResolvedValueOnce(FIXED_COHORTS)

    const token = await makeToken("user_owner_001")
    const res   = await app.request("/api/v1/owner/cohorts", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toEqual(FIXED_COHORTS)
  })

  // ── NF-UNIT-OWN-06 ────────────────────────────────────────────────────────
  // The auth middleware checks config.PROVISIONING_ENABLED first and returns
  // 404 immediately. We verify all three new routes respect this gate by
  // swapping the mocked config value for the duration of this describe block.

  describe("NF-UNIT-OWN-06: all /owner/* routes return 404 when PROVISIONING_ENABLED=false", () => {
    let savedEnabled: unknown

    beforeAll(async () => {
      // Reach into the mocked config singleton and flip the flag
      const { config } = await import("../../../src/shared/config.js")
      savedEnabled = (config as Record<string, unknown>).PROVISIONING_ENABLED;
      (config as Record<string, unknown>).PROVISIONING_ENABLED = false
    })

    afterAll(async () => {
      const { config } = await import("../../../src/shared/config.js")
      ;(config as Record<string, unknown>).PROVISIONING_ENABLED = savedEnabled
    })

    it("GET /api/v1/owner/me returns 404", async () => {
      const token = await makeToken("user_owner_001")
      const res   = await app.request("/api/v1/owner/me", {
        method:  "GET",
        headers: authHeader(token),
      })
      expect(res.status).toBe(404)
    })

    it("GET /api/v1/owner/revenue returns 404", async () => {
      const token = await makeToken("user_owner_001")
      const res   = await app.request("/api/v1/owner/revenue", {
        method:  "GET",
        headers: authHeader(token),
      })
      expect(res.status).toBe(404)
    })

    it("GET /api/v1/owner/cohorts returns 404", async () => {
      const token = await makeToken("user_owner_001")
      const res   = await app.request("/api/v1/owner/cohorts", {
        method:  "GET",
        headers: authHeader(token),
      })
      expect(res.status).toBe(404)
    })
  })
})
