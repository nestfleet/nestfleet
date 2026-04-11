/**
 * Integration tests: Owner fleet API — NF-INT-REV-01..06, NF-INT-MUT-01..09.
 *
 * Uses a real PostgreSQL container (via Testcontainers) with full migrations.
 * External services (Stripe, Hetzner, Cloudflare, email) are mocked so the
 * suite runs without network access to cloud providers.
 *
 * Read endpoints:
 * NF-INT-REV-01  GET /api/v1/owner/fleet returns empty list when no provisionings exist
 * NF-INT-REV-02  GET /api/v1/owner/fleet?status=active filters by status
 * NF-INT-REV-03  GET /api/v1/owner/fleet/:slug returns 200 with provisioning data for existing slug
 * NF-INT-REV-04  GET /api/v1/owner/fleet/:slug returns 404 for nonexistent slug
 * NF-INT-REV-05  GET /api/v1/owner/me returns 200 with { ok: true, isOwner: true } for valid owner JWT
 * NF-INT-REV-06  GET /api/v1/owner/me returns 403 for a JWT whose sub is not in OWNER_USER_IDS
 *
 * Mutation endpoints:
 * NF-INT-MUT-01  POST /owner/fleet/:slug/reset — 200 and calls hetzner.resetServer
 * NF-INT-MUT-02  POST /owner/fleet/:slug/reset — 400 when provisioning has no hetzner_server_id
 * NF-INT-MUT-03  POST /owner/fleet/:slug/reset — 404 for nonexistent slug
 * NF-INT-MUT-04  POST /owner/fleet/:slug/deprovision — 200 (grace period) calls startDeprovisioning
 * NF-INT-MUT-05  POST /owner/fleet/:slug/deprovision — 200 immediate calls deprovisionOne
 * NF-INT-MUT-06  POST /owner/fleet/:slug/deprovision — 200 idempotent when already deprovisioned
 * NF-INT-MUT-07  POST /owner/fleet/:slug/retry — 200 re-enqueues failed provisioning, status → pending
 * NF-INT-MUT-08  POST /owner/fleet/:slug/retry — 200 idempotent when already active
 * NF-INT-MUT-09  POST /owner/fleet/:slug/retry — 400 when status is not 'failed'
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import {
  createSignupIntent,
  createProvisioning,
  findProvisioningBySlug,
  updateProvisioning,
} from "../../src/infra/db/repositories/provisionings.js"

// ── Config mock ───────────────────────────────────────────────────────────────
// Must be declared before any module that reads config at import time.
// Mirrors the pattern from tests/integration/provisioning-saga.test.ts.
// NOTE: Do NOT mock db/client or db/migrate — setupTestDb injects the real
// test DB connection via setDb() and calls the real runMigrations().

vi.mock("../../src/shared/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/shared/config.js")>()
  return {
    config: {
      ...original.config,
      PROVISIONING_ENABLED:         true,
      OWNER_USER_IDS:               "owner-user-001",
      JWT_SECRET:                   "test-secret-32-chars-minimum-ok!",
      HETZNER_API_TOKEN:            "test-hetzner-token",
      HETZNER_FIREWALL_ID:          999,
      CLOUDFLARE_API_TOKEN:         "test-cf-token",
      CLOUDFLARE_ZONE_ID:           "test-zone-id",
      CUSTOMER_BASE_DOMAIN:         "nestfleet.io",
      OPS_ALERT_EMAIL:              "ops@nestfleet.io",
      OPS_SSH_PUBLIC_KEY:           "ssh-ed25519 AAAA test",
      BUNDLED_LLM_API_KEY:          "sk-ant-test",
      BUNDLED_EMBEDDING_API_KEY:    "sk-oai-test",
      STRIPE_SECRET_KEY:            "sk_test_fake",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter_test",
    },
  }
})

// ── Email mock ────────────────────────────────────────────────────────────────

vi.mock("../../src/email/sender.js", () => ({
  sendEmail:     vi.fn().mockResolvedValue(true),
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply:     vi.fn().mockResolvedValue(undefined),
}))

// ── Provisioning / Hetzner mocks ──────────────────────────────────────────────
// Capture function references so mutation tests can assert call args.

const mockResetServer      = vi.fn().mockResolvedValue(undefined)
const mockDeprovisionOne   = vi.fn().mockResolvedValue(undefined)
const mockStartDeprovisioning = vi.fn().mockResolvedValue(undefined)
const mockBossSend         = vi.fn().mockResolvedValue(undefined)

vi.mock("../../src/fleet/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockImplementation(() => ({ resetServer: mockResetServer })),
}))

vi.mock("../../src/fleet/provisioning/deprovision.js", () => ({
  get deprovisionOne()      { return mockDeprovisionOne },
  get startDeprovisioning() { return mockStartDeprovisioning },
}))

vi.mock("../../src/infra/queue/boss.js", () => ({
  getBoss:       vi.fn().mockImplementation(async () => ({ send: mockBossSend })),
  initBoss:      vi.fn(),
  getBossState:  vi.fn().mockReturnValue("started"),
}))

vi.mock("../../src/fleet/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

// ── Cloud-init mock (avoids disk reads) ───────────────────────────────────────

vi.mock("../../src/fleet/provisioning/cloud-init.js", () => ({
  generateCloudInit: vi.fn().mockResolvedValue("#cloud-config\nruncmd: []"),
}))

// ── Stripe mocks ──────────────────────────────────────────────────────────────

vi.mock("../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
  }),
}))

vi.mock("../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn().mockResolvedValue({
    mrrCents:     0,
    arrCents:     0,
    paidCount:    0,
    trialCount:   0,
    churn30d:     0,
    weeklySeries: [],
  }),
  buildCohorts: vi.fn().mockResolvedValue([]),
}))

// ── Stripe SDK (prevent real HTTP from the checkout.sessions.create path) ────

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "cs_test_mock", url: "https://checkout.stripe.com/test" }),
      },
    },
  }))
  return { default: MockStripe }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeToken(sub: string): Promise<string> {
  const { signJwt } = await import("../../src/auth/jwt.js")
  return signJwt({ sub, email: `${sub}@test.com`, roles: [], productIds: [] })
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Owner fleet API (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 120_000)  // extra time for image pull on first run

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-REV-01 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-01: GET /api/v1/owner/fleet returns 200 with empty list when no provisionings exist", async () => {
    const token = await makeToken("owner-user-001")
    const res = await app.request("/api/v1/owner/fleet", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.total).toBe(0)
  })

  // ── NF-INT-REV-02 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-02: GET /api/v1/owner/fleet?status=active filters by status — only active row returned", async () => {
    // Insert one 'active' and one 'failed' provisioning via real DB
    const intentActive = await createSignupIntent({
      email:   "active@example.com",
      orgSlug: "filter-test-active",
      plan:    "starter",
    })
    const intentFailed = await createSignupIntent({
      email:   "failed@example.com",
      orgSlug: "filter-test-failed",
      plan:    "starter",
    })

    const provActive = await createProvisioning({
      intentId:      intentActive.id,
      orgSlug:       intentActive.org_slug,
      customerEmail: intentActive.email,
      plan:          intentActive.plan,
    })
    await updateProvisioning(provActive.id, { status: "active" })

    const provFailed = await createProvisioning({
      intentId:      intentFailed.id,
      orgSlug:       intentFailed.org_slug,
      customerEmail: intentFailed.email,
      plan:          intentFailed.plan,
    })
    await updateProvisioning(provFailed.id, { status: "failed" })

    const token = await makeToken("owner-user-001")
    const res = await app.request("/api/v1/owner/fleet?status=active", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as {
      ok:    boolean
      data:  Array<{ org_slug: string; status: string }>
      total: number
    }
    expect(body.ok).toBe(true)

    const slugs = body.data.map((r) => r.org_slug)
    expect(slugs).toContain("filter-test-active")
    expect(slugs).not.toContain("filter-test-failed")

    // Every returned row must carry the requested status
    for (const row of body.data) {
      expect(row.status).toBe("active")
    }
  })

  // ── NF-INT-REV-03 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-03: GET /api/v1/owner/fleet/:slug returns 200 with provisioning data for an existing slug", async () => {
    const intent = await createSignupIntent({
      email:   "detail@example.com",
      orgSlug: "slug-detail-test",
      plan:    "starter",
    })
    await createProvisioning({
      intentId:      intent.id,
      orgSlug:       intent.org_slug,
      customerEmail: intent.email,
      plan:          intent.plan,
    })

    const token = await makeToken("owner-user-001")
    const res = await app.request("/api/v1/owner/fleet/slug-detail-test", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as {
      ok:   boolean
      data: { org_slug: string; customer_email: string; plan: string }
    }
    expect(body.ok).toBe(true)
    expect(body.data.org_slug).toBe("slug-detail-test")
    expect(body.data.customer_email).toBe("detail@example.com")
    expect(body.data.plan).toBe("starter")
  })

  // ── NF-INT-REV-04 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-04: GET /api/v1/owner/fleet/:slug returns 404 for a nonexistent slug", async () => {
    const token = await makeToken("owner-user-001")
    const res = await app.request("/api/v1/owner/fleet/this-slug-does-not-exist", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(404)
  })

  // ── NF-INT-REV-05 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-05: GET /api/v1/owner/me returns 200 with { ok: true, isOwner: true } for a valid owner JWT", async () => {
    const token = await makeToken("owner-user-001")
    const res = await app.request("/api/v1/owner/me", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.isOwner).toBe(true)
  })

  // ── NF-INT-REV-06 ──────────────────────────────────────────────────────────

  it("NF-INT-REV-06: GET /api/v1/owner/me returns 403 for a JWT whose sub is not in OWNER_USER_IDS", async () => {
    const token = await makeToken("non-owner-user-999")
    const res = await app.request("/api/v1/owner/me", {
      method:  "GET",
      headers: authHeader(token),
    })

    expect(res.status).toBe(403)
  })
})

// ── Mutation endpoint tests ───────────────────────────────────────────────────

describe("Owner fleet mutation endpoints (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 120_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── Helper: seed a provisioning row with a given status / hetzner_server_id ─

  async function seedProvisioning(opts: {
    slug:            string
    status?:         string
    hetznerServerId?: number
    intentId?:       string
  }) {
    const intent = await createSignupIntent({
      email:   `${opts.slug}@example.com`,
      orgSlug: opts.slug,
      plan:    "starter",
    })
    const prov = await createProvisioning({
      intentId:      opts.intentId ?? intent.id,
      orgSlug:       intent.org_slug,
      customerEmail: intent.email,
      plan:          intent.plan,
    })
    const patch: Record<string, unknown> = {}
    if (opts.status)           patch.status           = opts.status
    if (opts.hetznerServerId)  patch.hetzner_server_id = opts.hetznerServerId
    if (Object.keys(patch).length) {
      await updateProvisioning(prov.id, patch as Parameters<typeof updateProvisioning>[1])
    }
    return { intent, prov }
  }

  // ── NF-INT-MUT-01 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-01: POST /owner/fleet/:slug/reset — 200 and calls hetzner.resetServer with correct server ID", async () => {
    mockResetServer.mockClear()
    await seedProvisioning({ slug: "mut-reset-01", status: "active", hetznerServerId: 12345 })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-reset-01/reset", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(mockResetServer).toHaveBeenCalledWith(12345)
  })

  // ── NF-INT-MUT-02 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-02: POST /owner/fleet/:slug/reset — 400 when provisioning has no hetzner_server_id", async () => {
    await seedProvisioning({ slug: "mut-reset-02", status: "pending" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-reset-02/reset", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(400)
  })

  // ── NF-INT-MUT-03 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-03: POST /owner/fleet/:slug/reset — 404 for nonexistent slug", async () => {
    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/does-not-exist-xyz/reset", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(404)
  })

  // ── NF-INT-MUT-04 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-04: POST /owner/fleet/:slug/deprovision — 200 (grace period) calls startDeprovisioning", async () => {
    mockStartDeprovisioning.mockClear()
    await seedProvisioning({ slug: "mut-deprov-04", status: "active" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-deprov-04/deprovision", {
      method:  "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ immediate: false, graceDays: 30 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(mockStartDeprovisioning).toHaveBeenCalledOnce()
  })

  // ── NF-INT-MUT-05 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-05: POST /owner/fleet/:slug/deprovision — immediate:true calls deprovisionOne", async () => {
    mockDeprovisionOne.mockClear()
    await seedProvisioning({ slug: "mut-deprov-05", status: "active" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-deprov-05/deprovision", {
      method:  "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ immediate: true }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(mockDeprovisionOne).toHaveBeenCalledOnce()
  })

  // ── NF-INT-MUT-06 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-06: POST /owner/fleet/:slug/deprovision — 200 idempotent when already deprovisioned", async () => {
    mockStartDeprovisioning.mockClear()
    await seedProvisioning({ slug: "mut-deprov-06", status: "deprovisioned" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-deprov-06/deprovision", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    // Must not call startDeprovisioning again
    expect(mockStartDeprovisioning).not.toHaveBeenCalled()
  })

  // ── NF-INT-MUT-07 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-07: POST /owner/fleet/:slug/retry — 200 re-enqueues failed provisioning and sets status to pending", async () => {
    mockBossSend.mockClear()
    const { prov } = await seedProvisioning({ slug: "mut-retry-07", status: "failed" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-retry-07/retry", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    // Verify the job was enqueued
    expect(mockBossSend).toHaveBeenCalledOnce()
    const [jobName, jobData] = mockBossSend.mock.calls[0] as [string, Record<string, unknown>]
    expect(jobName).toBe("provision_vps")
    expect(jobData).toMatchObject({ intentId: prov.intent_id ?? expect.any(String) })

    // Verify the DB row was reset to 'pending'
    const updated = await findProvisioningBySlug("mut-retry-07")
    expect(updated?.status).toBe("pending")
  })

  // ── NF-INT-MUT-08 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-08: POST /owner/fleet/:slug/retry — 200 idempotent when status is already active", async () => {
    mockBossSend.mockClear()
    await seedProvisioning({ slug: "mut-retry-08", status: "active" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-retry-08/retry", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    // No job should be enqueued — already active
    expect(mockBossSend).not.toHaveBeenCalled()
  })

  // ── NF-INT-MUT-09 ──────────────────────────────────────────────────────────

  it("NF-INT-MUT-09: POST /owner/fleet/:slug/retry — 400 when status is 'pending' (not failed)", async () => {
    await seedProvisioning({ slug: "mut-retry-09", status: "pending" })

    const token = await makeToken("owner-user-001")
    const res   = await app.request("/api/v1/owner/fleet/mut-retry-09/retry", {
      method:  "POST",
      headers: authHeader(token),
    })

    expect(res.status).toBe(400)
  })
})
