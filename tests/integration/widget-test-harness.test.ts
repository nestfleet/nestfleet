/**
 * Integration tests: GET /widget/test/:productId — BEF-21.
 *
 * Verifies the persistent chat widget test harness endpoint.
 * NF-INT-580 through NF-INT-583.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"

describe("GET /widget/test/:productId (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name:  "Widget Test Product",
      stage: "beta",
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-580: returns 200 HTML for a known product", async () => {
    const res = await app.request(`/widget/test/${productId}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/html/)
  }, 30_000)

  it("NF-INT-581: HTML body contains the product name and product ID", async () => {
    const res = await app.request(`/widget/test/${productId}`)
    const html = await res.text()
    expect(html).toContain("Widget Test Product")
    expect(html).toContain(productId)
  }, 30_000)

  it("NF-INT-582: HTML includes the nestfleet-chat div with data-product-id", async () => {
    const res = await app.request(`/widget/test/${productId}`)
    const html = await res.text()
    expect(html).toContain(`data-product-id="${productId}"`)
    expect(html).toContain("nestfleet-chat.js")
  }, 30_000)

  it("NF-INT-583: returns 404 for an unknown product ID", async () => {
    const res = await app.request("/widget/test/prod_does_not_exist")
    expect(res.status).toBe(404)
  }, 30_000)
})
