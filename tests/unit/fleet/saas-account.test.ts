/**
 * NF-UNIT-ACC-01..12: saas-account API unit tests (FEAT-017-B/C)
 *
 * Covers:
 *   POST /api/v1/saas/account/magic-link  (rate limit, always 200, email sent if found)
 *   POST /api/v1/saas/account/session     (token validation, session JWT returned)
 *   POST /api/v1/saas/account/billing-portal (auth, Stripe portal URL)
 *   GET  /api/v1/saas/account/me          (account info)
 *   PROVISIONING_ENABLED=false → 404
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest"

// ── Config mock ───────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:              "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY:          "a".repeat(64),
    DATABASE_URL:            "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:            "anthropic",
    LLM_API_KEY:             "sk-ant-test",
    NODE_ENV:                "test",
    PORT:                    3001,
    BCRYPT_ROUNDS:           12,
    REGISTRATION_ENABLED:    false,
    BILLING_ENABLED:         false,
    NESTFLEET_CLOUD_URL:     "https://cloud.nestfleet.dev",
    PROVISIONING_ENABLED:    true,
    OWNER_USER_IDS:          "user_owner_001",
    CONSOLE_ORIGIN:          "https://nestfleet.dev",
    STRIPE_SECRET_KEY:       "sk_test_mock",
    CUSTOMER_BASE_DOMAIN:    "nestfleet.dev",
  },
}))

// ── Infrastructure mocks ──────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock("../../../src/infra/db/client.js", () => ({
  db: {},
  setDb:   vi.fn(),
  closeDb: vi.fn(),
  pingDb:  vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../src/infra/db/migrate.js",  () => ({ runMigrations: vi.fn() }))
vi.mock("../../../src/infra/queue/boss.js",  () => ({
  getBoss:  vi.fn().mockResolvedValue({ send: vi.fn() }),
  initBoss: vi.fn(),
}))

// ── Provisioning repository mocks ─────────────────────────────────────────────

const mockFindByEmail = vi.fn()
const mockFindBySlug  = vi.fn()

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  listProvisionings:              vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  findProvisioningBySlug:         () => mockFindBySlug(),
  findProvisioningByEmail:        () => mockFindByEmail(),
  findProvisioningByIntentId:     vi.fn().mockResolvedValue(null),
  findProvisioningByStripeCustomerId: vi.fn().mockResolvedValue(null),
  updateProvisioning:             vi.fn().mockResolvedValue({}),
  createSignupIntent:             vi.fn(),
  findSignupIntentById:           vi.fn().mockResolvedValue(null),
  updateSignupIntentStatus:       vi.fn().mockResolvedValue(undefined),
  updateSignupIntentStripeIds:    vi.fn().mockResolvedValue(undefined),
  slugHasSignupIntent:            vi.fn().mockResolvedValue(false),
}))

// ── Email mock ────────────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(undefined)

vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

// ── Stripe mock ───────────────────────────────────────────────────────────────

const mockPortalCreate = vi.fn()

vi.mock("stripe", () => {
  const StripeClass = vi.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  }))
  return { default: StripeClass }
})

// ── Other fleet mocks ─────────────────────────────────────────────────────────

vi.mock("../../../src/fleet/provisioning/hetzner-client.js",     () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))
vi.mock("../../../src/fleet/provisioning/deprovision.js",        () => ({
  deprovisionOne:       vi.fn().mockResolvedValue(undefined),
  startDeprovisioning:  vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../../src/fleet/workers/provisioning-worker.js",     () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))
vi.mock("../../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  }),
  priceIdToPlan: vi.fn().mockReturnValue(null),
}))
vi.mock("../../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn(),
  buildCohorts:     vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { signMagicLinkToken, signAccountSessionToken } from "../../../src/fleet/api/saas-account.js"

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ── Fixture provisioning row ──────────────────────────────────────────────────

const PROV_ROW = {
  id:                     "prov_test_001",
  intent_id:              "si_intent_001",
  org_slug:               "acme-corp",
  customer_email:         "alice@acme.com",
  plan:                   "starter",
  stripe_customer_id:     "cus_test_001",
  stripe_subscription_id: "sub_test_001",
  status:                 "active",
  provisioned_at:         new Date("2026-01-01"),
  license_expires_at:     new Date("2027-01-01"),
  reactivation_deadline:  null,
  hetzner_server_id:      12345,
  hetzner_server_ip:      "1.2.3.4",
  cloudflare_record_id:   "cf_rec_001",
  secrets_enc:            null,
  deprovision_after:      null,
  deprovisioned_at:       null,
  last_health_check_at:   null,
  last_health_status:     null,
  error_message:          null,
  license_tier:           "starter",
  reissue_status:         "idle" as const,
  created_at:             new Date("2026-01-01"),
  updated_at:             new Date("2026-01-01"),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("saas-account API (FEAT-017-B/C)", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByEmail.mockResolvedValue(null)
    mockFindBySlug.mockResolvedValue(null)
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/test/portal" })
  })

  afterAll(() => {
    vi.clearAllMocks()
  })

  // ── NF-UNIT-ACC-01: magic-link always returns 200 ────────────────────────────

  it("NF-UNIT-ACC-01: POST /magic-link always returns 200 (no email enumeration)", async () => {
    const res = await app.request("/api/v1/saas/account/magic-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "unknown@example.com" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; message: string }
    expect(body.ok).toBe(true)
    expect(body.message).toMatch(/if that email is registered/i)
  })

  // ── NF-UNIT-ACC-02: magic-link sends email when provisioning found ─────────

  it("NF-UNIT-ACC-02: POST /magic-link sends email when provisioning found", async () => {
    mockFindByEmail.mockResolvedValue(PROV_ROW)

    const res = await app.request("/api/v1/saas/account/magic-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "alice@acme.com" }),
    })

    expect(res.status).toBe(200)

    // Give the fire-and-forget a tick to complete
    await new Promise((r) => setTimeout(r, 10))

    expect(mockSendEmail).toHaveBeenCalledOnce()
    const callArgs = mockSendEmail.mock.calls[0]![0] as { to: string; subject: string }
    expect(callArgs.to).toBe("alice@acme.com")
    expect(callArgs.subject).toMatch(/account link/i)
  })

  // ── NF-UNIT-ACC-03: magic-link no email when not found ───────────────────

  it("NF-UNIT-ACC-03: POST /magic-link does NOT send email when provisioning not found", async () => {
    mockFindByEmail.mockResolvedValue(null)

    await app.request("/api/v1/saas/account/magic-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "ghost@example.com" }),
    })
    await new Promise((r) => setTimeout(r, 10))

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  // ── NF-UNIT-ACC-04: magic-link invalid email → 200 (no leak) ─────────────

  it("NF-UNIT-ACC-04: POST /magic-link with invalid email body still returns 200", async () => {
    const res = await app.request("/api/v1/saas/account/magic-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "not-an-email" }),
    })
    expect(res.status).toBe(200)
  })

  // ── NF-UNIT-ACC-05: session — valid magic link token → session JWT ────────

  it("NF-UNIT-ACC-05: POST /session returns sessionToken for valid magic link token", async () => {
    const magicToken = signMagicLinkToken("alice@acme.com", "acme-corp")

    const res = await app.request("/api/v1/saas/account/session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: magicToken }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; sessionToken: string }
    expect(body.ok).toBe(true)
    expect(typeof body.sessionToken).toBe("string")
    expect(body.sessionToken.split(".").length).toBe(3)  // valid JWT
  })

  // ── NF-UNIT-ACC-06: session — invalid token → 401 ─────────────────────────

  it("NF-UNIT-ACC-06: POST /session with invalid token → 401", async () => {
    const res = await app.request("/api/v1/saas/account/session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: "garbage.token.here" }),
    })
    expect(res.status).toBe(401)
  })

  // ── NF-UNIT-ACC-07: session — wrong purpose token → 401 ───────────────────

  it("NF-UNIT-ACC-07: POST /session with account_session token (wrong purpose) → 401", async () => {
    const sessionToken = signAccountSessionToken("alice@acme.com", "acme-corp")

    const res = await app.request("/api/v1/saas/account/session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: sessionToken }),
    })
    expect(res.status).toBe(401)
  })

  // ── NF-UNIT-ACC-08: me — valid session JWT → 200 with account info ────────

  it("NF-UNIT-ACC-08: GET /me with valid session → 200 with account info", async () => {
    mockFindBySlug.mockResolvedValue(PROV_ROW)
    const sessionToken = signAccountSessionToken("alice@acme.com", "acme-corp")

    const res = await app.request("/api/v1/saas/account/me", {
      method:  "GET",
      headers: authHeader(sessionToken),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.slug).toBe("acme-corp")
    expect(body.plan).toBe("starter")
    expect(body.status).toBe("active")
    expect(typeof body.instanceUrl).toBe("string")
  })

  // ── NF-UNIT-ACC-09: me — no auth → 401 ───────────────────────────────────

  it("NF-UNIT-ACC-09: GET /me without auth → 401", async () => {
    const res = await app.request("/api/v1/saas/account/me", { method: "GET" })
    expect(res.status).toBe(401)
  })

  // ── NF-UNIT-ACC-10: billing-portal — valid session, stripe_customer_id → 200

  it("NF-UNIT-ACC-10: POST /billing-portal with valid session → 200 with portal_url", async () => {
    mockFindBySlug.mockResolvedValue(PROV_ROW)
    const sessionToken = signAccountSessionToken("alice@acme.com", "acme-corp")

    const res = await app.request("/api/v1/saas/account/billing-portal", {
      method:  "POST",
      headers: { ...authHeader(sessionToken), "Content-Type": "application/json" },
      body:    JSON.stringify({ return_url: "https://nestfleet.dev/account" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; portal_url: string }
    expect(body.ok).toBe(true)
    expect(body.portal_url).toBe("https://billing.stripe.com/test/portal")

    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer:   "cus_test_001",
      return_url: "https://nestfleet.dev/account",
    })
  })

  // ── NF-UNIT-ACC-11: billing-portal — no stripe_customer_id → 404 ──────────

  it("NF-UNIT-ACC-11: POST /billing-portal with no stripe_customer_id → 404", async () => {
    mockFindBySlug.mockResolvedValue({ ...PROV_ROW, stripe_customer_id: null })
    const sessionToken = signAccountSessionToken("alice@acme.com", "acme-corp")

    const res = await app.request("/api/v1/saas/account/billing-portal", {
      method:  "POST",
      headers: { ...authHeader(sessionToken), "Content-Type": "application/json" },
      body:    "{}",
    })
    expect(res.status).toBe(404)
  })

  // ── NF-UNIT-ACC-12: PROVISIONING_ENABLED=false → 404 ─────────────────────

  describe("NF-UNIT-ACC-12: PROVISIONING_ENABLED=false → 404 on all account routes", () => {
    let savedEnabled: unknown

    beforeAll(async () => {
      const { config } = await import("../../../src/shared/config.js")
      savedEnabled = (config as Record<string, unknown>).PROVISIONING_ENABLED;
      (config as Record<string, unknown>).PROVISIONING_ENABLED = false
    })

    afterAll(async () => {
      const { config } = await import("../../../src/shared/config.js")
      ;(config as Record<string, unknown>).PROVISIONING_ENABLED = savedEnabled
    })

    it("POST /magic-link returns 404 when provisioning disabled", async () => {
      const res = await app.request("/api/v1/saas/account/magic-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: "test@example.com" }),
      })
      expect(res.status).toBe(404)
    })

    it("POST /session returns 404 when provisioning disabled", async () => {
      const res = await app.request("/api/v1/saas/account/session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: "any" }),
      })
      expect(res.status).toBe(404)
    })
  })
})
