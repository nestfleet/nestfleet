/**
 * OWN-NC unit tests — owner new-customer endpoints.
 *
 * OWN-NC-UNIT-01  slug-check: valid available slug returns available=true
 * OWN-NC-UNIT-02  slug-check: invalid format returns available=false with error
 * OWN-NC-UNIT-03  slug-check: taken slug returns available=false with error
 * OWN-NC-UNIT-04  new-customer: happy path returns 201 with checkoutUrl + intentId
 * OWN-NC-UNIT-05  new-customer: invalid email returns 400
 * OWN-NC-UNIT-06  new-customer: invalid slug format returns 400
 * OWN-NC-UNIT-07  new-customer: taken slug returns 400
 * OWN-NC-UNIT-08  new-customer: missing plan returns 400
 * OWN-NC-UNIT-09  new-customer: unauthenticated request returns 401
 * OWN-NC-UNIT-10  new-customer: non-owner JWT returns 403
 * OWN-NC-UNIT-11  new-customer: PROVISIONING_ENABLED=false returns 404
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Config mock ───────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:                   "test-secret-32-chars-minimum-ok!",
    ENCRYPTION_KEY:               "a".repeat(64),
    DATABASE_URL:                 "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:                 "anthropic",
    NODE_ENV:                     "test",
    PORT:                         3001,
    BCRYPT_ROUNDS:                12,
    REGISTRATION_ENABLED:         false,
    BILLING_ENABLED:              false,
    NESTFLEET_CLOUD_URL:          "https://cloud.nestfleet.dev",
    PROVISIONING_ENABLED:         true,
    OWNER_USER_IDS:               "user_owner_001",
    CONSOLE_ORIGIN:               "https://nestfleet.dev",
    STRIPE_SECRET_KEY:            "sk_test_fake",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_test",
    STRIPE_PRICE_GROWTH_MONTHLY:  "price_growth_test",
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

// ── Provisioning mocks ────────────────────────────────────────────────────────

const mockValidateAndCheckSlug = vi.fn()

vi.mock("../../../src/fleet/provisioning/slug.js", () => ({
  get validateAndCheckSlug() { return mockValidateAndCheckSlug },
  validateSlugFormat: vi.fn().mockReturnValue({ ok: true }),
  RESERVED_SLUGS: [],
}))

const mockCreateSignupIntent = vi.fn()

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  listProvisionings:         vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  findProvisioningBySlug:    vi.fn().mockResolvedValue(null),
  updateProvisioning:        vi.fn().mockResolvedValue(undefined),
  get createSignupIntent()   { return mockCreateSignupIntent },
}))

vi.mock("../../../src/fleet/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))

vi.mock("../../../src/fleet/provisioning/deprovision.js", () => ({
  deprovisionOne:      vi.fn().mockResolvedValue(undefined),
  startDeprovisioning: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/fleet/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

// ── Stripe mocks ──────────────────────────────────────────────────────────────

vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  }),
}))

vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(),
  buildCohorts:     vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/telemetry.js", () => ({
  getRecentTelemetry:      vi.fn().mockResolvedValue([]),
  countDistinctInstances:  vi.fn().mockResolvedValue(0),
}))

// ── Stripe SDK mock ───────────────────────────────────────────────────────────

const mockCheckoutSessionsCreate = vi.fn()

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    })),
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeToken(sub: string): Promise<string> {
  const { signJwt } = await import("../../../src/auth/jwt.js")
  return signJwt({ sub, email: `${sub}@test.com`, roles: [], productIds: [] })
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function ownerToken() {
  return makeToken("user_owner_001")
}

async function nonOwnerToken() {
  return makeToken("user_regular_999")
}

// ── App fixture (uses full Hono app so error handler is registered) ───────────

async function getApp() {
  const mod = await import("../../../src/api/index.js")
  return mod.app
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/owner/slug-check/:slug", () => {
  beforeEach(() => {
    mockValidateAndCheckSlug.mockReset()
  })

  it("OWN-NC-UNIT-01: valid available slug returns available=true", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: true })
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/slug-check/acme-corp", { headers: authHeader(token) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, available: true })
  })

  it("OWN-NC-UNIT-02: invalid format returns available=false with error", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: false, error: "Slug must be 3–40 lowercase alphanumeric characters" })
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/slug-check/AB", { headers: authHeader(token) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.available).toBe(false)
    expect(typeof body.error).toBe("string")
  })

  it("OWN-NC-UNIT-03: taken slug returns available=false with error", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: false, error: "Slug is already taken" })
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/slug-check/taken-slug", { headers: authHeader(token) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.available).toBe(false)
    expect(body.error).toContain("taken")
  })
})

describe("POST /api/v1/owner/new-customer", () => {
  beforeEach(() => {
    mockValidateAndCheckSlug.mockReset()
    mockCreateSignupIntent.mockReset()
    mockCheckoutSessionsCreate.mockReset()
  })

  const validBody = {
    email:       "client@acme.com",
    slug:        "acme-corp",
    plan:        "starter",
    companyName: "Acme Corp",
  }

  it("OWN-NC-UNIT-04: happy path returns 201 with checkoutUrl + intentId", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: true })
    mockCreateSignupIntent.mockResolvedValue({ id: "intent_abc123", org_slug: "acme-corp" })
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_test_abc" })

    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify(validBody),
    })
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_abc")
    expect(body.intentId).toBe("intent_abc123")
  })

  it("OWN-NC-UNIT-05: invalid email returns 400", async () => {
    const app = await getApp()
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ ...validBody, email: "not-an-email" }),
    })
    expect(res.status).toBe(400)
  })

  it("OWN-NC-UNIT-06: invalid slug format returns 400", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: false, error: "Invalid slug format" })
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ ...validBody, slug: "AB" }),
    })
    expect(res.status).toBe(400)
  })

  it("OWN-NC-UNIT-07: taken slug returns 400", async () => {
    const app = await getApp()
    mockValidateAndCheckSlug.mockResolvedValue({ ok: false, error: "Slug is already taken" })
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify(validBody),
    })
    expect(res.status).toBe(400)
  })

  it("OWN-NC-UNIT-08: missing plan returns 400", async () => {
    const app = await getApp()
    const token = await ownerToken()
    const { plan: _plan, ...bodyWithoutPlan } = validBody
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify(bodyWithoutPlan),
    })
    expect(res.status).toBe(400)
  })

  it("OWN-NC-UNIT-09: unauthenticated request returns 401", async () => {
    const app = await getApp()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(validBody),
    })
    expect(res.status).toBe(401)
  })

  it("OWN-NC-UNIT-10: non-owner JWT returns 403", async () => {
    const app = await getApp()
    const token = await nonOwnerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify(validBody),
    })
    expect(res.status).toBe(403)
  })

  it("OWN-NC-UNIT-11: PROVISIONING_ENABLED=false returns 404", async () => {
    const configMod = await import("../../../src/shared/config.js")
    const origEnabled = (configMod as unknown as { config: { PROVISIONING_ENABLED: boolean } }).config.PROVISIONING_ENABLED
    ;(configMod as unknown as { config: { PROVISIONING_ENABLED: boolean } }).config.PROVISIONING_ENABLED = false

    const app = await getApp()
    const token = await ownerToken()
    const res = await app.request("/api/v1/owner/new-customer", {
      method:  "POST",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify(validBody),
    })
    expect(res.status).toBe(404)

    ;(configMod as unknown as { config: { PROVISIONING_ENABLED: boolean } }).config.PROVISIONING_ENABLED = origEnabled
  })
})
