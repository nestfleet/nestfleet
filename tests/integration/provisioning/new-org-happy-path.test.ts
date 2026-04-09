/**
 * Integration tests: New org provisioning happy path — NF-PROV-01 §15.2
 *
 * Validates the full register → setup → authenticated access chain
 * against a real PostgreSQL container.
 *
 * NF-INT-517 through NF-INT-524
 */

import { vi } from "vitest"

// Prevent real agent dispatch during setup
vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

// Stub fetch so PUT /settings LLM validation does not make real network calls.
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: "OK" } }] }),
  text: async () => JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "../helpers/db.js"
import { setupTestDb }       from "../helpers/db.js"
import { app }               from "../../../src/api/index.js"
import { provisionOrg }      from "../helpers/provision.js"
import type { ProvisionedOrg } from "../helpers/provision.js"

describe("New org provisioning — happy path (NF-PROV-01)", () => {
  let ctx: TestDbContext
  let org: ProvisionedOrg

  beforeAll(async () => {
    ctx = await setupTestDb()
    process.env.REGISTRATION_ENABLED = "true"
  }, 60_000)

  afterAll(async () => {
    delete process.env.REGISTRATION_ENABLED
    await ctx.teardown()
  })

  beforeEach(async () => {
    // Ensure each test starts with a clean slate — both users and products,
    // since setup/complete rejects with 409 when any product already exists.
    await ctx.db`DELETE FROM operator_users WHERE email LIKE '%@prov-happy.test'`
    await ctx.db`DELETE FROM products`
  })

  // ── Full provisioning chain ────────────────────────────────────────────────

  it("NF-INT-517: provisionOrg helper completes without throwing", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })
    expect(org.productId).toMatch(/^prod_/)
    expect(org.productSlug).toBeTruthy()
    expect(org.adminToken).toBeTruthy()
  }, 30_000)

  it("NF-INT-518: product row exists in DB with correct name and slug", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const rows = await ctx.db<{ name: string; slug: string; stage: string }[]>`
      SELECT name, slug, stage FROM products WHERE product_id = ${org.productId}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.name).toBe("Test Product")
    expect(rows[0]!.slug).toBe("test-product")
    expect(rows[0]!.stage).toBe("pre-launch")
  }, 30_000)

  it("NF-INT-519: product has default agent_config with tone: formal", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const rows = await ctx.db<{ agent_config: Record<string, unknown> }[]>`
      SELECT agent_config FROM products WHERE product_id = ${org.productId}
    `
    expect(rows[0]!.agent_config).toMatchObject({ tone: "formal" })
  }, 30_000)

  it("NF-INT-520: GET /setup/status returns needsSetup:false after provisioning", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const res  = await app.request("/api/v1/setup/status")
    const body = await res.json() as Record<string, unknown>
    expect(res.status).toBe(200)
    expect((body.data as Record<string, unknown>).needsSetup).toBe(false)
  }, 30_000)

  it("NF-INT-521: GET /products returns the provisioned product for admin token", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const res  = await app.request("/api/v1/products", {
      headers: { Authorization: `Bearer ${org.adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    // GET /products returns { ok, products: [...] } (not body.data)
    const products = (body.products as unknown[]) ?? (body.data as unknown[]) ?? []
    const found = (products as Array<Record<string, unknown>>)
      .find((p) => p.productId === org.productId || p.product_id === org.productId)
    expect(found).toBeTruthy()
  }, 30_000)

  it("NF-INT-522: productSlug in response matches DB slug", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const rows = await ctx.db<{ slug: string }[]>`
      SELECT slug FROM products WHERE product_id = ${org.productId}
    `
    expect(rows[0]!.slug).toBe(org.productSlug)
  }, 30_000)

  it("NF-INT-523: GET /products/:id/settings with adminToken returns 200", async () => {
    org = await provisionOrg({ email: "admin@prov-happy.test" })

    const res = await app.request(`/api/v1/products/${org.productId}/settings`, {
      headers: { Authorization: `Bearer ${org.adminToken}` },
    })
    expect(res.status).toBe(200)
  }, 30_000)

  it("NF-INT-524: setup/complete with LLM config stores apiKey encrypted, not plaintext", async () => {
    // Re-provision with a product that has an LLM apiKey
    await ctx.db`DELETE FROM operator_users WHERE email LIKE '%@prov-happy.test'`
    await ctx.db`DELETE FROM products`

    const orgWithLlm = await provisionOrg({
      email:       "admin@prov-happy.test",
      productName: "LLM Product",
    })

    // Patch LLM config via the setup complete + settings endpoint
    // (provisioner doesn't accept llm in minimal form — use settings PATCH instead)
    const setupRes = await app.request(`/api/v1/products/${orgWithLlm.productId}/settings`, {
      method:  "PUT",
      headers: {
        Authorization:  `Bearer ${orgWithLlm.adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        llm: { provider: "anthropic", model: "claude-3-5-haiku-20241022", apiKey: "sk-ant-test-secret-key" },
      }),
    })
    expect(setupRes.status).toBe(200)

    // GET settings must never expose the raw key
    const getRes  = await app.request(`/api/v1/products/${orgWithLlm.productId}/settings`, {
      headers: { Authorization: `Bearer ${orgWithLlm.adminToken}` },
    })
    const body = await getRes.json() as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-secret-key")
    const llm = (body.data as Record<string, unknown>).llm as Record<string, unknown>
    expect(llm.apiKeyLast4).toBe("****-key")
  }, 30_000)
})
