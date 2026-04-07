/**
 * Integration tests: Provisioning idempotency — NF-PROV-01 §15.3
 *
 * Validates that duplicate register/setup attempts fail gracefully:
 *   - Second setup/complete → 409
 *   - Second register with same email → 409
 *   - Duplicate does not corrupt existing product
 *
 * NF-INT-525 through NF-INT-528
 */

import { vi } from "vitest"

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "../helpers/db.js"
import { setupTestDb }       from "../helpers/db.js"
import { app }               from "../../../src/api/index.js"
import { provisionOrg }      from "../helpers/provision.js"
import type { ProvisionedOrg } from "../helpers/provision.js"

describe("Provisioning idempotency (NF-PROV-01 §15.3)", () => {
  let ctx: TestDbContext
  let org: ProvisionedOrg

  beforeAll(async () => {
    ctx = await setupTestDb()
    process.env.REGISTRATION_ENABLED = "true"
    // Provision once — shared across all tests in this suite
    org = await provisionOrg({ email: "admin@prov-idempotent.test" })
  }, 60_000)

  afterAll(async () => {
    delete process.env.REGISTRATION_ENABLED
    await ctx.teardown()
  })

  beforeEach(async () => {
    // Do NOT wipe users/products between tests — idempotency tests rely on existing state
  })

  // ── NF-INT-525: first provisioning succeeds ──────────────────────────────────

  it("NF-INT-525: initial provisionOrg completes and product exists in DB", async () => {
    const rows = await ctx.db<{ product_id: string }[]>`
      SELECT product_id FROM products WHERE product_id = ${org.productId}
    `
    expect(rows.length).toBe(1)
    expect(org.productId).toMatch(/^prod_/)
    expect(org.adminToken).toBeTruthy()
  })

  // ── NF-INT-526: second setup/complete → 409 ───────────────────────────────────

  it("NF-INT-526: POST /setup/complete a second time returns 409", async () => {
    const res = await app.request("/api/v1/setup/complete", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ productName: "Duplicate Product" }),
    })
    // System already set up — must reject with conflict
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.error ?? body.message ?? JSON.stringify(body)).toBeTruthy()
  })

  // ── NF-INT-527: product not corrupted after duplicate setup attempt ───────────

  it("NF-INT-527: original product survives a duplicate setup/complete attempt", async () => {
    const rows = await ctx.db<{ name: string; slug: string }[]>`
      SELECT name, slug FROM products WHERE product_id = ${org.productId}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.name).toBe("Test Product")
    expect(rows[0]!.slug).toBe("test-product")
  })

  // ── NF-INT-528: second register with same email → 409 ────────────────────────

  it("NF-INT-528: POST /auth/register with the same email returns 409", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: org.email, password: "AnotherPass456" }),
    })
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    // Error must indicate the conflict
    const bodyStr = JSON.stringify(body).toLowerCase()
    expect(bodyStr).toMatch(/conflict|already|exist|duplicate/i)
  })
})
