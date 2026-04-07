/**
 * Integration tests: Products API — DEFERRED-21.
 *
 * Tests GET /api/v1/products and POST /api/v1/products against a real
 * PostgreSQL container.
 *
 * NF-INT-500 through NF-INT-509.
 */

import { vi } from "vitest"

// Mock dispatcher (required by app bootstrap)
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

// Mock license validator — default: no limit (payload null)
vi.mock("../../src/license/validator.js", () => ({
  getLicenseState: vi.fn().mockReturnValue({
    valid:         true,
    expired:       false,
    payload:       null,
    statusMessage: "dev",
  }),
  getLicenseTier: vi.fn().mockReturnValue(null),
  validateLicense: vi.fn().mockReturnValue({ valid: true, expired: false, payload: null, statusMessage: "dev" }),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct, type ProductRow } from "../../src/infra/db/repositories/products.js"
import { signJwt } from "../../src/auth/jwt.js"
import { getLicenseState } from "../../src/license/validator.js"
import type { LicenseState } from "../../src/license/types.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(productIds: string[]): string {
  return signJwt({
    sub:        "test-user",
    email:      "test@example.com",
    roles:      ["admin"],
    productIds,
  })
}

const LIMIT_1_STATE: LicenseState = {
  valid:         true,
  expired:       false,
  statusMessage: "test",
  payload: {
    sub:                    "test-install",
    tier:                   "starter",
    productLimit:           1,
    features:               [],
    issuedAt:               0,
    expiresAt:              0,
    customerId:             "cust-test",
    customerName:           "Test Customer",
    maxOutcomeUnitsMonthly: 0,
  },
}

const NO_LIMIT_STATE: LicenseState = {
  valid:         true,
  expired:       false,
  payload:       null,
  statusMessage: "dev",
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Products API (integration)", () => {
  let ctx: TestDbContext
  let productA: ProductRow
  let productB: ProductRow

  beforeAll(async () => {
    ctx = await setupTestDb()

    productA = await createProduct({ name: "Alpha App", stage: "beta" })
    productB = await createProduct({ name: "Beta App", stage: "production" })
  }, 60_000)

  afterAll(async () => {
    vi.mocked(getLicenseState).mockReturnValue(NO_LIMIT_STATE)
    await ctx.teardown()
  })

  // ── NF-INT-500: GET returns 401 without token ──────────────────────────────

  it("NF-INT-500: GET /products returns 401 without auth token", async () => {
    const res = await app.request("/api/v1/products")
    expect(res.status).toBe(401)
  })

  // ── NF-INT-501: GET returns only products in JWT productIds ────────────────

  it("NF-INT-501: GET /products returns only products the user has access to", async () => {
    // User has access only to product A
    const token = makeToken([productA.product_id])

    const res = await app.request("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; products: Array<{ productId: string }> }
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.products)).toBe(true)

    const ids = body.products.map((p) => p.productId)
    expect(ids).toContain(productA.product_id)
    expect(ids).not.toContain(productB.product_id)
  }, 30_000)

  // ── NF-INT-502: GET returns empty array when no products in JWT ────────────

  it("NF-INT-502: GET /products returns empty array when productIds is empty", async () => {
    const token = makeToken([])

    const res = await app.request("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; products: unknown[] }
    expect(body.ok).toBe(true)
    expect(body.products).toEqual([])
  }, 30_000)

  // ── NF-INT-503: GET returns multiple products when all in JWT ──────────────

  it("NF-INT-503: GET /products returns multiple products when all present in JWT", async () => {
    const token = makeToken([productA.product_id, productB.product_id])

    const res = await app.request("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; products: Array<{ productId: string }> }
    const ids = body.products.map((p) => p.productId)
    expect(ids).toContain(productA.product_id)
    expect(ids).toContain(productB.product_id)
  }, 30_000)

  // ── NF-INT-504: GET response shape ────────────────────────────────────────

  it("NF-INT-504: GET /products response has correct shape (productId, slug, name, stage)", async () => {
    const token = makeToken([productA.product_id])

    const res = await app.request("/api/v1/products", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { products: Array<Record<string, unknown>> }
    const p = body.products.find((x) => x.productId === productA.product_id)
    expect(p).toBeDefined()
    expect(p?.productId).toBe(productA.product_id)
    expect(p?.slug).toBe(productA.slug)
    expect(p?.name).toBe("Alpha App")
    expect(p?.stage).toBe("beta")
  }, 30_000)

  // ── NF-INT-505: POST returns 401 without token ────────────────────────────

  it("NF-INT-505: POST /products returns 401 without auth token", async () => {
    const res = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: "New Product", stage: "beta" }),
    })
    expect(res.status).toBe(401)
  })

  // ── NF-INT-506: POST returns 400 for invalid body ─────────────────────────

  it("NF-INT-506: POST /products returns 400 for empty name", async () => {
    const token = makeToken([])

    const res = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ name: "", stage: "beta" }),
    })

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-507: POST → 402 when over product limit ────────────────────────

  it("NF-INT-507: POST /products returns 402 when license product limit is reached", async () => {
    // Set limit to 1 — productA already exists, so any new product should be blocked
    vi.mocked(getLicenseState).mockReturnValue(LIMIT_1_STATE)

    const token = makeToken([productA.product_id])

    const res = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ name: "Over Limit Product", stage: "beta" }),
    })

    expect(res.status).toBe(402)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/Product limit reached/)

    // Restore unlimited license for subsequent tests
    vi.mocked(getLicenseState).mockReturnValue(NO_LIMIT_STATE)
  }, 30_000)

  // ── NF-INT-508: POST → 201 creates product successfully ──────────────────

  it("NF-INT-508: POST /products returns 201 and creates the product", async () => {
    const token = makeToken([])

    const res = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ name: "Gamma App", stage: "production" }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { ok: boolean; product: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.product.name).toBe("Gamma App")
    expect(body.product.stage).toBe("production")
    expect(body.product.slug).toBe("gamma-app")
    expect(typeof body.product.productId).toBe("string")
  }, 30_000)

  // ── NF-INT-509: POST → duplicate names get auto-suffixed slug ─────────────

  it("NF-INT-509: POST /products with duplicate name creates second product with suffixed slug", async () => {
    const token = makeToken([])

    // First product with "Delta App"
    const res1 = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ name: "Delta App", stage: "beta" }),
    })
    expect(res1.status).toBe(201)
    const body1 = await res1.json() as { product: { slug: string; productId: string } }
    expect(body1.product.slug).toBe("delta-app")

    // Second product with same name — slug must be suffixed
    const res2 = await app.request("/api/v1/products", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ name: "Delta App", stage: "production" }),
    })
    expect(res2.status).toBe(201)
    const body2 = await res2.json() as { product: { slug: string; productId: string } }
    expect(body2.product.slug).toBe("delta-app-2")
    // Both products have different IDs
    expect(body2.product.productId).not.toBe(body1.product.productId)
  }, 30_000)
})
