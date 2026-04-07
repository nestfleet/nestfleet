/**
 * Integration tests: Settings API — SLICE-11.
 * NF-INT-100 through NF-INT-108.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

describe("Settings API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "Settings Test Product", stage: "beta",
      support_policy: { github_repo: "test-org/settings-test" },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com", change_lead: "change@test.com" },
      llm_config: { provider: "openai", model: "gpt-4o", apiKey: "sk-test-abcd1234" },
      agent_config: { tone: "formal" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-100: GET settings returns masked API key", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const llm = (body.data as Record<string, unknown>).llm as Record<string, unknown>
    expect(llm.apiKeyLast4).toBe("****1234")
    expect(JSON.stringify(body)).not.toContain("sk-test-abcd1234")
    expect(llm.configured).toBe(true)
  }, 30_000)

  it("NF-INT-101: GET settings returns all sections", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data).toHaveProperty("llm")
    expect(data).toHaveProperty("leads")
    expect(data).toHaveProperty("agent")
    expect(data).toHaveProperty("notifications")
    expect(data).toHaveProperty("ci")
  }, 30_000)

  it("NF-INT-102: GET settings returns 401 without auth", async () => {
    const res = await app.request(`/api/v1/products/${productId}/settings`)
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-103: PUT settings updates LLM provider and masks returned key", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ llm: { provider: "anthropic", model: "claude-3-5-sonnet", apiKey: "sk-ant-xyz5678" } }),
    })
    expect(res.status).toBe(200)
    const llm = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).llm as Record<string, unknown>
    expect(llm.provider).toBe("anthropic")
    expect(llm.apiKeyLast4).toBe("****5678")
  }, 30_000)

  it("NF-INT-104: PUT partial update preserves other sections", async () => {
    const token = makeToken(["admin"], productId)
    await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ agent: { tone: "technical" } }),
    })
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leads: { product_lead: "product@test.com" } }),
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect((data.leads as Record<string, unknown>).product_lead).toBe("product@test.com")
    expect((data.agent as Record<string, unknown>).tone).toBe("technical")
  }, 30_000)

  it("NF-INT-106: PUT CI config never exposes webhook secret", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ci: { enabled: true, github_webhook_secret: "super-secret", auto_complete_on_ci_pass: true } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const ci = (body.data as Record<string, unknown>).ci as Record<string, unknown>
    expect(ci.webhookConfigured).toBe(true)
    expect(JSON.stringify(body)).not.toContain("super-secret")
  }, 30_000)

  it("NF-INT-109: GET settings includes retention section with defaults", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data).toHaveProperty("retention")
    const retention = data.retention as Record<string, unknown>
    expect(typeof retention.retentionDays).toBe("number")
    expect(typeof retention.autoCloseDays).toBe("number")
    expect(retention.retentionDays).toBeGreaterThanOrEqual(30)
  }, 30_000)

  it("NF-INT-110: PUT retention settings persists retentionDays and autoCloseDays", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ retention: { retentionDays: 180, autoCloseDays: 14 } }),
    })
    expect(res.status).toBe(200)
    const retention = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).retention as Record<string, unknown>
    expect(retention.retentionDays).toBe(180)
    expect(retention.autoCloseDays).toBe(14)

    // Verify GET reflects the update
    const getRes = await app.request(`/api/v1/products/${productId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getRetention = (((await getRes.json()) as Record<string, unknown>).data as Record<string, unknown>).retention as Record<string, unknown>
    expect(getRetention.retentionDays).toBe(180)
    expect(getRetention.autoCloseDays).toBe(14)
  }, 30_000)

  it("NF-INT-111: PUT retention settings rejects retentionDays below minimum (30)", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ retention: { retentionDays: 10 } }),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── Contact Form key generation (DEFERRED-13) ─────────────────────────────

  it("NF-INT-112: POST generate-contact-form-key returns cf_pub_ key", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/settings/generate-contact-form-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(typeof body.publicKey).toBe("string")
    expect((body.publicKey as string).startsWith("cf_pub_")).toBe(true)
    // cf_pub_ + 64 hex chars
    expect((body.publicKey as string)).toHaveLength(7 + 64)
  }, 30_000)

  it("NF-INT-113: GET settings includes contactForm section after key generation", async () => {
    const token = makeToken(["admin"], productId)
    // Generate a key first
    await app.request(`/api/v1/products/${productId}/settings/generate-contact-form-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    // GET settings should now include contactForm
    const res = await app.request(`/api/v1/products/${productId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data).toHaveProperty("contactForm")
    const cf = data.contactForm as Record<string, unknown>
    expect(cf.configured).toBe(true)
    expect(typeof cf.publicKey).toBe("string")
    expect((cf.publicKey as string).startsWith("cf_pub_")).toBe(true)
  }, 30_000)

  it("NF-INT-114: regenerating key replaces previous key", async () => {
    const token = makeToken(["admin"], productId)
    const first = await app.request(`/api/v1/products/${productId}/settings/generate-contact-form-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const firstKey = ((await first.json()) as Record<string, unknown>).publicKey as string

    const second = await app.request(`/api/v1/products/${productId}/settings/generate-contact-form-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const secondKey = ((await second.json()) as Record<string, unknown>).publicKey as string

    expect(secondKey).not.toBe(firstKey)
    expect(secondKey.startsWith("cf_pub_")).toBe(true)
  }, 30_000)

  it("NF-INT-115: generate-contact-form-key requires auth — 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/settings/generate-contact-form-key`, {
      method: "POST",
    })
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-116: GET settings returns contactForm.configured false before any key generated", async () => {
    // Create a fresh product with no contact form key
    const { createProduct: cp } = await import("../../src/infra/db/repositories/products.js")
    const freshProduct = await cp({
      name: "FreshCfProduct", stage: "beta",
      support_policy: {}, enabled_channels: ["email"], lead_assignments: {},
    })
    const token = makeToken(["operator"], freshProduct.product_id)
    const res = await app.request(`/api/v1/products/${freshProduct.product_id}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    const cf = data.contactForm as Record<string, unknown> | undefined
    // Either absent or configured:false
    if (cf) {
      expect(cf.configured).toBe(false)
      expect(cf.publicKey).toBeNull()
    }
  }, 30_000)
})
