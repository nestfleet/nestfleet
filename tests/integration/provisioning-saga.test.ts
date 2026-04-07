/**
 * Integration tests: SaaS Fleet Provisioning saga — FEAT-001.
 *
 * All Hetzner Cloud and Cloudflare API calls are intercepted with msw.
 * Email sending is mocked. No real VPS or DNS records are created.
 *
 * NF-INT-PROV-01  POST /api/v1/saas/signup validates slug format
 * NF-INT-PROV-02  POST /api/v1/saas/signup rejects reserved slug
 * NF-INT-PROV-03  POST /api/v1/saas/signup creates signup_intent + returns checkoutUrl
 * NF-INT-PROV-04  duplicate slug is rejected on second signup attempt
 * NF-INT-PROV-05  GET /api/v1/saas/status/:intentId returns pending_payment initially
 * NF-INT-PROV-06  saga happy path: creates VPS → DNS → marks active
 * NF-INT-PROV-07  saga idempotency: running saga twice for same intentId is safe
 * NF-INT-PROV-08  saga resumes after crash: skips VPS creation if hetzner_server_id already set
 * NF-INT-PROV-09  saga compensation: Cloudflare failure triggers Hetzner VPS deletion
 * NF-INT-PROV-10  health timeout: status set to failed, VPS NOT deleted
 * NF-INT-PROV-11  deprovisioning: sets status + deprovision_after, sends grace email
 * NF-INT-PROV-12  nightly scheduler: deprovisionOne deletes VPS + DNS + marks deprovisioned
 * NF-INT-PROV-13  deprovisionOne is fault-tolerant: Hetzner delete fails → Cloudflare still deleted
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import {
  createSignupIntent,
  createProvisioning,
  findProvisioningByIntentId,
  findProvisioningBySlug,
  updateProvisioning,
} from "../../src/infra/db/repositories/provisionings.js"
import { runProvisioningSaga } from "../../src/provisioning/provision.js"
import { deprovisionOne, startDeprovisioning } from "../../src/provisioning/deprovision.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}))

// Mock cloud-init to avoid disk reads in integration tests
vi.mock("../../src/provisioning/cloud-init.js", () => ({
  generateCloudInit: vi.fn().mockResolvedValue("#cloud-config\nruncmd: []"),
}))

// Mock health poller to return 'ok' immediately (avoid 7.5-min wait)
vi.mock("../../src/provisioning/health-poller.js", () => ({
  pollUntilHealthy: vi.fn().mockResolvedValue("ok"),
}))

// Mock Stripe SDK — its Node.js HTTP client is not intercepted by msw
vi.mock("stripe", () => {
  const mockSession = {
    id:  "cs_test_abc123",
    url: "https://checkout.stripe.com/test",
  }
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue(mockSession),
      },
    },
  }))
  return { default: MockStripe }
})

import { sendEmail } from "../../src/email/sender.js"
import { pollUntilHealthy } from "../../src/provisioning/health-poller.js"

// ── msw: Mock Hetzner + Cloudflare APIs ───────────────────────────────────────

let hetznerCreateCount = 0
let hetznerDeleteCount = 0
let cloudflareCreateCount = 0
let cloudflareDeleteCount = 0
let hetznerCreateShouldFail = false
let cloudflareCreateShouldFail = false
let hetznerDeleteShouldFail = false

const mswServer = setupServer(
  // Hetzner: create server
  http.post("https://api.hetzner.cloud/v1/servers", () => {
    hetznerCreateCount++
    if (hetznerCreateShouldFail) {
      return HttpResponse.json({ error: { code: "invalid_input", message: "mock failure" } }, { status: 422 })
    }
    return HttpResponse.json({
      server: {
        id:          12345,
        status:      "initializing",
        public_net:  { ipv4: { ip: "1.2.3.4" } },
      },
    }, { status: 201 })
  }),

  // Hetzner: delete server
  http.delete("https://api.hetzner.cloud/v1/servers/:id", () => {
    hetznerDeleteCount++
    if (hetznerDeleteShouldFail) {
      return HttpResponse.json({ error: { code: "not_found", message: "not found" } }, { status: 404 })
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // Hetzner: reset server
  http.post("https://api.hetzner.cloud/v1/servers/:id/actions/reset", () =>
    HttpResponse.json({ action: { id: 99, status: "running" } }),
  ),

  // Cloudflare: create DNS record
  http.post("https://api.cloudflare.com/client/v4/zones/:zoneId/dns_records", () => {
    cloudflareCreateCount++
    if (cloudflareCreateShouldFail) {
      return HttpResponse.json({ success: false, errors: [{ message: "mock CF failure" }] }, { status: 400 })
    }
    return HttpResponse.json({ success: true, result: { id: "cf-record-abc123" } })
  }),

  // Cloudflare: delete DNS record
  http.delete("https://api.cloudflare.com/client/v4/zones/:zoneId/dns_records/:recordId", () => {
    cloudflareDeleteCount++
    return HttpResponse.json({ success: true, result: { id: "cf-record-abc123" } })
  }),

)

// ── Config mocks for provisioning ─────────────────────────────────────────────

vi.mock("../../src/shared/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/shared/config.js")>()
  return {
    config: {
      ...original.config,
      PROVISIONING_ENABLED:     true,
      HETZNER_API_TOKEN:        "test-hetzner-token",
      HETZNER_FIREWALL_ID:      999,
      CLOUDFLARE_API_TOKEN:     "test-cf-token",
      CLOUDFLARE_ZONE_ID:       "test-zone-id",
      CUSTOMER_BASE_DOMAIN:     "nestfleet.io",
      OPS_ALERT_EMAIL:          "ops@nestfleet.io",
      OPS_SSH_PUBLIC_KEY:       "ssh-ed25519 AAAA test",
      BUNDLED_LLM_API_KEY:      "sk-ant-test",
      BUNDLED_EMBEDDING_API_KEY: "sk-oai-test",
      STRIPE_SECRET_KEY:        "sk_test_fake",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter_test",
    },
  }
})

// ── Test setup ────────────────────────────────────────────────────────────────

describe("SaaS Fleet Provisioning saga (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
    mswServer.listen({ onUnhandledRequest: "error" })
  })

  afterAll(async () => {
    mswServer.close()
    await ctx.teardown()
  })

  beforeEach(() => {
    hetznerCreateCount      = 0
    hetznerDeleteCount      = 0
    cloudflareCreateCount   = 0
    cloudflareDeleteCount   = 0
    hetznerCreateShouldFail = false
    cloudflareCreateShouldFail = false
    hetznerDeleteShouldFail = false
    vi.mocked(sendEmail).mockClear()
    vi.mocked(pollUntilHealthy).mockResolvedValue("ok")
  })

  // ── API endpoint tests ───────────────────────────────────────────────────────

  it("NF-INT-PROV-01: POST /saas/signup rejects invalid slug format", async () => {
    const res = await app.request("/api/v1/saas/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "a@b.com", slug: "-bad-slug", plan: "starter" }),
    })
    expect(res.status).toBe(400)
  })

  it("NF-INT-PROV-02: POST /saas/signup rejects reserved slug", async () => {
    const res = await app.request("/api/v1/saas/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "a@b.com", slug: "admin", plan: "starter" }),
    })
    expect(res.status).toBe(400)
  })

  it("NF-INT-PROV-03: POST /saas/signup creates intent and returns checkoutUrl", async () => {
    const res = await app.request("/api/v1/saas/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "customer@example.com", slug: "test-co-01", plan: "starter" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; checkoutUrl: string }
    expect(body.ok).toBe(true)
    expect(body.checkoutUrl).toMatch(/stripe\.com/)
  })

  it("NF-INT-PROV-04: duplicate slug is rejected on second signup attempt", async () => {
    await app.request("/api/v1/saas/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "a@example.com", slug: "unique-co-dup", plan: "starter" }),
    })
    const res2 = await app.request("/api/v1/saas/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "b@example.com", slug: "unique-co-dup", plan: "starter" }),
    })
    expect(res2.status).toBe(400)
  })

  it("NF-INT-PROV-05: GET /saas/status returns pending_payment before provisioning", async () => {
    const intent = await createSignupIntent({ email: "x@y.com", orgSlug: "status-test-01", plan: "starter" })
    const res = await app.request(`/api/v1/saas/status/${intent.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe("pending_payment")
  })

  // ── Saga tests ───────────────────────────────────────────────────────────────

  it("NF-INT-PROV-06: saga happy path creates VPS → DNS → marks active → sends welcome email", async () => {
    const intent = await createSignupIntent({ email: "happy@example.com", orgSlug: "happy-path-01", plan: "starter" })

    await runProvisioningSaga(intent.id)

    const prov = await findProvisioningByIntentId(intent.id)
    expect(prov?.status).toBe("active")
    expect(prov?.hetzner_server_id).toBe(12345)
    expect(prov?.hetzner_server_ip).toBe("1.2.3.4")
    expect(prov?.cloudflare_record_id).toBe("cf-record-abc123")
    expect(prov?.provisioned_at).not.toBeNull()

    expect(hetznerCreateCount).toBe(1)
    expect(cloudflareCreateCount).toBe(1)
    expect(hetznerDeleteCount).toBe(0)  // no compensation

    // Welcome email sent
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({ to: "happy@example.com", subject: expect.stringContaining("ready") }),
    )
  })

  it("NF-INT-PROV-07: running saga twice for same intentId is a no-op on second run", async () => {
    const intent = await createSignupIntent({ email: "idem@example.com", orgSlug: "idempotent-01", plan: "starter" })

    await runProvisioningSaga(intent.id)
    vi.mocked(sendEmail).mockClear()

    // Run again — should skip all steps
    await runProvisioningSaga(intent.id)

    const prov = await findProvisioningByIntentId(intent.id)
    expect(prov?.status).toBe("active")
    // VPS not created twice
    expect(hetznerCreateCount).toBe(1)
  })

  it("NF-INT-PROV-08: saga resumes after crash — skips VPS creation if already done", async () => {
    const intent = await createSignupIntent({ email: "resume@example.com", orgSlug: "resume-test-01", plan: "starter" })

    // Simulate mid-saga crash: VPS created, DNS not yet done
    const prov = await createProvisioning({
      intentId:      intent.id,
      orgSlug:       intent.org_slug,
      customerEmail: intent.email,
      plan:          intent.plan,
    })
    await updateProvisioning(prov.id, {
      status:            "provisioning",
      hetzner_server_id: 12345,
      hetzner_server_ip: "1.2.3.4",
    })

    await runProvisioningSaga(intent.id)

    // VPS creation should have been skipped (count = 0)
    expect(hetznerCreateCount).toBe(0)
    // DNS still created
    expect(cloudflareCreateCount).toBe(1)

    const updated = await findProvisioningByIntentId(intent.id)
    expect(updated?.status).toBe("active")
  })

  it("NF-INT-PROV-09: Cloudflare failure triggers VPS compensation delete", async () => {
    cloudflareCreateShouldFail = true

    const intent = await createSignupIntent({ email: "cf-fail@example.com", orgSlug: "cf-fail-test-01", plan: "starter" })

    await expect(runProvisioningSaga(intent.id)).rejects.toThrow()

    const prov = await findProvisioningByIntentId(intent.id)
    expect(prov?.status).toBe("failed")
    expect(hetznerCreateCount).toBe(1)   // VPS was created
    expect(hetznerDeleteCount).toBe(1)   // VPS was deleted as compensation
    expect(cloudflareCreateCount).toBe(1)
  })

  it("NF-INT-PROV-10: health poll timeout marks failed but does NOT delete VPS", async () => {
    vi.mocked(pollUntilHealthy).mockResolvedValue("timeout")

    const intent = await createSignupIntent({ email: "timeout@example.com", orgSlug: "timeout-test-01", plan: "starter" })

    await runProvisioningSaga(intent.id)  // does not throw — completes with failed status

    const prov = await findProvisioningByIntentId(intent.id)
    expect(prov?.status).toBe("failed")
    expect(prov?.error_message).toContain("health_timeout")
    // VPS was created but NOT deleted (ops needs to inspect)
    expect(hetznerDeleteCount).toBe(0)
    // Ops alert email sent
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("health timeout") }),
    )
  })

  it("NF-INT-PROV-11: startDeprovisioning sets status=deprovisioning + sends grace email", async () => {
    const intent = await createSignupIntent({ email: "churn@example.com", orgSlug: "churn-test-01", plan: "starter" })
    await runProvisioningSaga(intent.id)

    const prov = await findProvisioningByIntentId(intent.id)
    vi.mocked(sendEmail).mockClear()

    await startDeprovisioning(prov!, 30)

    const updated = await findProvisioningBySlug("churn-test-01")
    expect(updated?.status).toBe("deprovisioning")
    expect(updated?.deprovision_after).not.toBeNull()

    const graceEmail = vi.mocked(sendEmail).mock.calls[0]?.[0]
    expect(graceEmail?.to).toBe("churn@example.com")
    expect(graceEmail?.subject).toContain("cancelled")
  })

  it("NF-INT-PROV-12: deprovisionOne deletes VPS + DNS + marks deprovisioned", async () => {
    const intent = await createSignupIntent({ email: "deprov@example.com", orgSlug: "deprov-test-01", plan: "starter" })
    await runProvisioningSaga(intent.id)

    const prov = await findProvisioningByIntentId(intent.id)
    expect(prov?.status).toBe("active")

    await deprovisionOne(prov!)

    const updated = await findProvisioningBySlug("deprov-test-01")
    expect(updated?.status).toBe("deprovisioned")
    expect(updated?.deprovisioned_at).not.toBeNull()
    expect(hetznerDeleteCount).toBe(1)
    expect(cloudflareDeleteCount).toBe(1)
  })

  it("NF-INT-PROV-13: deprovisionOne is fault-tolerant — Hetzner delete fails but Cloudflare still deleted", async () => {
    hetznerDeleteShouldFail = true

    const intent = await createSignupIntent({ email: "partial@example.com", orgSlug: "partial-deprov-01", plan: "starter" })
    await runProvisioningSaga(intent.id)

    const prov = await findProvisioningByIntentId(intent.id)

    await deprovisionOne(prov!)  // should not throw

    const updated = await findProvisioningBySlug("partial-deprov-01")
    // Row is marked deprovisioned (partial) with error logged
    expect(updated?.status).toBe("deprovisioned")
    // Cloudflare still deleted despite Hetzner failure
    expect(cloudflareDeleteCount).toBe(1)
    // Error message records what failed
    expect(updated?.error_message).not.toBeNull()
  })
})
