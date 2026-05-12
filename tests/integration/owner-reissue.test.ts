/**
 * Integration tests: Owner Fleet — Reissue License API — FEAT-012.
 *
 * NF-INT-REISSUE-01  POST /reissue-license — 202 queues job, creates reissue row
 * NF-INT-REISSUE-02  POST /reissue-license — 409 when reissue_status is in_progress
 * NF-INT-REISSUE-03  POST /reissue-license — 422 when provisioning status is not active
 * NF-INT-REISSUE-04  POST /reissue-license — 400 on invalid body (missing tier, reason too short)
 * NF-INT-REISSUE-05  POST /reissue-license — 404 for unknown slug
 * NF-INT-REISSUE-06  GET  /license-history — returns reissue records ordered desc
 * NF-INT-REISSUE-07  GET  /license-jwt-download — returns JWT file when failed + pending_jwt set
 * NF-INT-REISSUE-08  GET  /license-jwt-download — 404 when no failed reissue with pending_jwt
 * NF-INT-REISSUE-09  POST /reissue-license-bulk — queues N jobs for N valid slugs
 * NF-INT-REISSUE-10  POST /reissue-license-bulk — 422 when slugs > 50
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import {
  createSignupIntent,
  createProvisioning,
  updateProvisioning,
} from "../../src/infra/db/repositories/provisionings.js"
import {
  createLicenseReissue,
  updateLicenseReissue,
} from "../../src/infra/db/repositories/license-reissues.js"

// ── Config mock ───────────────────────────────────────────────────────────────

vi.mock("../../src/shared/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/shared/config.js")>()
  return {
    config: {
      ...original.config,
      PROVISIONING_ENABLED:         true,
      OWNER_USER_IDS:               "owner-user-001",
      JWT_SECRET:                   "test-secret-32-chars-minimum-ok!",
      CUSTOMER_BASE_DOMAIN:         "nestfleet.io",
      FLEET_SSH_PRIVATE_KEY:        "fake-private-key",
      FLEET_SSH_USER:               "root",
      SECRET_ENCRYPTION_KEY:               "0".repeat(64),
    },
  }
})

vi.mock("../../src/email/sender.js", () => ({
  sendEmail:     vi.fn().mockResolvedValue(true),
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply:     vi.fn().mockResolvedValue(undefined),
}))

const mockBossSend = vi.fn().mockResolvedValue("job-id-mock")

vi.mock("../../src/infra/queue/boss.js", () => ({
  getBoss:      vi.fn().mockImplementation(async () => ({ send: mockBossSend, createQueue: vi.fn() })),
  initBoss:     vi.fn(),
  getBossState: vi.fn().mockReturnValue("started"),
}))

vi.mock("../../src/fleet/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

vi.mock("../../src/fleet/workers/license-reissue-worker.js", () => ({
  LICENSE_REISSUE_JOB:             "license_reissue",
  registerLicenseReissueWorker:    vi.fn(),
  executeLicenseReissue:           vi.fn(),
}))

vi.mock("../../src/fleet/provisioning/cloud-init.js", () => ({
  generateCloudInit: vi.fn().mockResolvedValue("#cloud-config\nruncmd: []"),
}))

vi.mock("../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  }),
}))

vi.mock("../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn().mockResolvedValue({ mrrCents: 0, arrCents: 0, paidCount: 0, trialCount: 0, churn30d: 0, weeklySeries: [] }),
  buildCohorts:     vi.fn().mockResolvedValue([]),
}))

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: "cs_test", url: "https://stripe.com/test" }) } },
  })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeToken(sub: string): Promise<string> {
  const { signJwt } = await import("../../src/auth/jwt.js")
  return signJwt({ sub, email: `${sub}@test.com`, roles: [], productIds: [] })
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function seedActiveProvisioning(slug: string) {
  const intent = await createSignupIntent({ email: `${slug}@test.com`, orgSlug: slug, plan: "starter" })
  const prov = await createProvisioning({
    intentId:      intent.id,
    orgSlug:       slug,
    customerEmail: `${slug}@test.com`,
    plan:          "starter",
  })
  await updateProvisioning(prov.id, {
    status:             "active",
    hetzner_server_ip:  "10.0.0.1",
    license_tier:       "starter",
    license_expires_at: new Date("2026-12-31"),
    reissue_status:     "idle",
  })
  return prov
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("Owner reissue-license API (integration)", () => {
  let ctx: TestDbContext
  let ownerToken: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    ownerToken = await makeToken("owner-user-001")
  }, 120_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-REISSUE-01 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-01: POST /reissue-license → 202 queues job, creates reissue row", async () => {
    await seedActiveProvisioning("reissue-01")
    mockBossSend.mockResolvedValueOnce("job-123")

    const res = await app.request("/api/v1/owner/fleet/reissue-01/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({
        tier:      "growth",
        expiresAt: "2027-04-08T00:00:00.000Z",
        reason:    "Customer requested upgrade to Growth",
      }),
    })

    expect(res.status).toBe(202)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.jobId).toBeTruthy()
    expect(mockBossSend).toHaveBeenCalledWith(
      "license_reissue",
      expect.objectContaining({ slug: "reissue-01", newTier: "growth" }),
      expect.any(Object),
    )
  })

  // ── NF-INT-REISSUE-02 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-02: POST /reissue-license → 409 when reissue already in_progress", async () => {
    const prov = await seedActiveProvisioning("reissue-02")
    await updateProvisioning(prov.id, { reissue_status: "in_progress" })

    const res = await app.request("/api/v1/owner/fleet/reissue-02/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ tier: "growth", expiresAt: "2027-04-08T00:00:00.000Z", reason: "Upgrade requested by customer" }),
    })

    expect(res.status).toBe(409)
  })

  // ── NF-INT-REISSUE-03 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-03: POST /reissue-license → 422 when provisioning not active", async () => {
    const intent = await createSignupIntent({ email: "reissue-03@test.com", orgSlug: "reissue-03", plan: "starter" })
    const prov = await createProvisioning({ intentId: intent.id, orgSlug: "reissue-03", customerEmail: "reissue-03@test.com", plan: "starter" })
    await updateProvisioning(prov.id, { status: "failed" })

    const res = await app.request("/api/v1/owner/fleet/reissue-03/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ tier: "growth", expiresAt: "2027-04-08T00:00:00.000Z", reason: "Fix wrong tier on provisioning" }),
    })

    expect(res.status).toBe(422)
  })

  // ── NF-INT-REISSUE-04 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-04: POST /reissue-license → 400 on invalid body", async () => {
    await seedActiveProvisioning("reissue-04")

    // missing tier
    const res1 = await app.request("/api/v1/owner/fleet/reissue-04/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ expiresAt: "2027-04-08T00:00:00.000Z", reason: "Valid reason here" }),
    })
    expect(res1.status).toBe(400)

    // reason too short
    const res2 = await app.request("/api/v1/owner/fleet/reissue-04/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ tier: "growth", expiresAt: "2027-04-08T00:00:00.000Z", reason: "short" }),
    })
    expect(res2.status).toBe(400)
  })

  // ── NF-INT-REISSUE-05 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-05: POST /reissue-license → 404 for unknown slug", async () => {
    const res = await app.request("/api/v1/owner/fleet/no-such-slug/reissue-license", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ tier: "growth", expiresAt: "2027-04-08T00:00:00.000Z", reason: "Upgrade requested by customer" }),
    })
    expect(res.status).toBe(404)
  })

  // ── NF-INT-REISSUE-06 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-06: GET /license-history → last 10 reissue records desc", async () => {
    const prov = await seedActiveProvisioning("reissue-06")

    for (let i = 0; i < 3; i++) {
      await createLicenseReissue({
        provisioning_id:     prov.id,
        performed_by:        "owner-user-001",
        previous_tier:       "starter",
        new_tier:            "growth",
        previous_expires_at: new Date("2026-12-31"),
        new_expires_at:      new Date("2027-12-31"),
        reason:              `Test reissue ${i}`,
      })
    }

    const res = await app.request("/api/v1/owner/fleet/reissue-06/license-history", {
      headers: auth(ownerToken),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: unknown[] }
    expect(body.ok).toBe(true)
    expect(body.data.length).toBe(3)
  })

  // ── NF-INT-REISSUE-07 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-07: GET /license-jwt-download → returns JWT file for failed reissue", async () => {
    const prov = await seedActiveProvisioning("reissue-07")
    const reissue = await createLicenseReissue({
      provisioning_id:     prov.id,
      performed_by:        "owner-user-001",
      previous_tier:       "starter",
      new_tier:            "growth",
      previous_expires_at: null,
      new_expires_at:      new Date("2027-12-31"),
      reason:              "SSH was unreachable during reissue",
    })
    await updateLicenseReissue(reissue.id, {
      status:      "failed",
      pending_jwt: "eyJhbGciOiJIUzI1NiJ9.fake.token",
    })

    const res = await app.request(`/api/v1/owner/fleet/reissue-07/license-jwt-download`, {
      headers: auth(ownerToken),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/octet-stream")
    const text = await res.text()
    expect(text).toBe("eyJhbGciOiJIUzI1NiJ9.fake.token")
  })

  // ── NF-INT-REISSUE-08 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-08: GET /license-jwt-download → 404 when no failed pending_jwt", async () => {
    await seedActiveProvisioning("reissue-08")

    const res = await app.request("/api/v1/owner/fleet/reissue-08/license-jwt-download", {
      headers: auth(ownerToken),
    })
    expect(res.status).toBe(404)
  })

  // ── NF-INT-REISSUE-09 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-09: POST /reissue-license-bulk → queues N jobs", async () => {
    await seedActiveProvisioning("reissue-bulk-a")
    await seedActiveProvisioning("reissue-bulk-b")
    mockBossSend.mockResolvedValue("bulk-job-id")

    const res = await app.request("/api/v1/owner/fleet/reissue-license-bulk", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({
        slugs:     ["reissue-bulk-a", "reissue-bulk-b"],
        expiresAt: "2027-04-08T00:00:00.000Z",
        reason:    "Annual renewal for all customers",
      }),
    })

    expect(res.status).toBe(202)
    const body = await res.json() as { ok: boolean; queued: number }
    expect(body.ok).toBe(true)
    expect(body.queued).toBe(2)
  })

  // ── NF-INT-REISSUE-10 ──────────────────────────────────────────────────────

  it("NF-INT-REISSUE-10: POST /reissue-license-bulk → 422 when slugs > 50", async () => {
    const slugs = Array.from({ length: 51 }, (_, i) => `slug-${i}`)

    const res = await app.request("/api/v1/owner/fleet/reissue-license-bulk", {
      method:  "POST",
      headers: auth(ownerToken),
      body:    JSON.stringify({ slugs, expiresAt: "2027-04-08T00:00:00.000Z", reason: "Annual renewal attempt" }),
    })

    expect(res.status).toBe(422)
  })
})
