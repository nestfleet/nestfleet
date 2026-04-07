/**
 * Integration tests: Cross-org product isolation — NF-PROV-01 §15.4
 *
 * Verifies that JWT productIds scope enforcement prevents cross-product
 * data access. Uses two products (A via setup/complete, B via POST /products)
 * and constructs targeted JWTs to test access control boundaries.
 *
 * NF-INT-529 through NF-INT-534
 */

import { vi } from "vitest"

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "../helpers/db.js"
import { setupTestDb }       from "../helpers/db.js"
import { app }               from "../../../src/api/index.js"
import { provisionOrg }      from "../helpers/provision.js"
import { signJwt }           from "../../../src/auth/jwt.js"

describe("Cross-org product isolation (NF-PROV-01 §15.4)", () => {
  let ctx: TestDbContext

  // Product A — created via setup/complete
  let prodAId:    string
  let adminUserId: string

  // Product B — created via POST /api/v1/products using A's admin token
  let prodBId: string

  // Scoped tokens
  let tokenA:    string   // productIds: [prodAId]
  let tokenB:    string   // productIds: [prodBId]
  let tokenBoth: string   // productIds: [prodAId, prodBId]

  beforeAll(async () => {
    ctx = await setupTestDb()
    process.env.REGISTRATION_ENABLED = "true"

    // ── Setup product A ────────────────────────────────────────────────────────
    const orgA = await provisionOrg({ email: "admin@org-isolation.test" })
    prodAId     = orgA.productId
    adminUserId = orgA.userId

    // ── Create product B via POST /api/v1/products ─────────────────────────────
    // Need an admin-scoped token that can create new products
    const createToken = signJwt({
      sub:        adminUserId,
      email:      "admin@org-isolation.test",
      roles:      ["admin"],
      productIds: [prodAId],
    })

    const createRes = await app.request("/api/v1/products", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${createToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Product B", stage: "beta" }),
    })

    if (createRes.status !== 201 && createRes.status !== 200) {
      const body = await createRes.text()
      throw new Error(`org-isolation: POST /products failed (${createRes.status}): ${body}`)
    }

    const createBody = await createRes.json() as Record<string, unknown>
    // POST /products returns { ok, product: { productId, ... }, token }
    const createProduct = createBody.product as Record<string, unknown> | undefined
    prodBId = (createProduct?.productId ?? createProduct?.product_id) as string

    if (!prodBId) {
      throw new Error(`org-isolation: productId missing from POST /products response: ${JSON.stringify(createBody)}`)
    }

    // ── Build scoped tokens ────────────────────────────────────────────────────
    // Use "operator" role — admin bypasses product isolation (by design), so
    // scoped access enforcement only applies to non-admin principals.
    tokenA = signJwt({
      sub: adminUserId, email: "admin@org-isolation.test",
      roles: ["operator"], productIds: [prodAId],
    })
    tokenB = signJwt({
      sub: adminUserId, email: "admin@org-isolation.test",
      roles: ["operator"], productIds: [prodBId],
    })
    // tokenBoth: operator with both products in scope
    tokenBoth = signJwt({
      sub: adminUserId, email: "admin@org-isolation.test",
      roles: ["operator"], productIds: [prodAId, prodBId],
    })
  }, 90_000)

  afterAll(async () => {
    delete process.env.REGISTRATION_ENABLED
    await ctx.teardown()
  })

  // ── NF-INT-529: token scoped to A can access A ────────────────────────────────

  it("NF-INT-529: tokenA can access product A settings", async () => {
    const res = await app.request(`/api/v1/products/${prodAId}/settings`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(res.status).toBe(200)
  })

  // ── NF-INT-530: token scoped to A is blocked on B ─────────────────────────────

  it("NF-INT-530: tokenA is blocked from product B settings (403)", async () => {
    const res = await app.request(`/api/v1/products/${prodBId}/settings`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(res.status).toBe(403)
  })

  // ── NF-INT-531: token scoped to B can access B ────────────────────────────────

  it("NF-INT-531: tokenB can access product B settings", async () => {
    const res = await app.request(`/api/v1/products/${prodBId}/settings`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    expect(res.status).toBe(200)
  })

  // ── NF-INT-532: token scoped to B is blocked on A ─────────────────────────────

  it("NF-INT-532: tokenB is blocked from product A settings (403)", async () => {
    const res = await app.request(`/api/v1/products/${prodAId}/settings`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    expect(res.status).toBe(403)
  })

  // ── NF-INT-533: token with both products can access both ──────────────────────

  it("NF-INT-533: tokenBoth can access both product A and B settings", async () => {
    const [resA, resB] = await Promise.all([
      app.request(`/api/v1/products/${prodAId}/settings`, {
        headers: { Authorization: `Bearer ${tokenBoth}` },
      }),
      app.request(`/api/v1/products/${prodBId}/settings`, {
        headers: { Authorization: `Bearer ${tokenBoth}` },
      }),
    ])
    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
  })

  // ── NF-INT-534: unauthenticated request is rejected ───────────────────────────

  it("NF-INT-534: unauthenticated request to product A settings returns 401", async () => {
    const res = await app.request(`/api/v1/products/${prodAId}/settings`)
    expect(res.status).toBe(401)
  })
})
