/**
 * Integration tests: Product memory management API — SLICE-03.
 * NF-INT-140 through NF-INT-147.
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
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles: ["admin"], productIds: [productId] })
}

async function seedMemoryChunks(productId: string): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO memory_chunks (
      chunk_id, product_id, source_type, source_uri, tier,
      section_path, content_type, content, freshness_score, ingested_at,
      source_updated_at, conflict_flag, embedding, content_hash
    ) VALUES
      (${"chk_nfint140_a"}, ${productId}, ${"docs"}, ${"docs://changelog.md"}, ${1},
       ${"# Changelog"}, ${"prose"}, ${"Version 2.1 released."}, ${0.95}, NOW(), NOW(), ${false}, ${null}, ${"hash_a"}),
      (${"chk_nfint140_b"}, ${productId}, ${"docs"}, ${"docs://changelog.md"}, ${1},
       ${"## v2.0"}, ${"prose"}, ${"Breaking change: removed legacy API."}, ${0.80}, NOW(), NOW(), ${false}, ${null}, ${"hash_b"}),
      (${"chk_nfint140_c"}, ${productId}, ${"github"}, ${"github://issues/42"}, ${2},
       ${"Issue body"}, ${"prose"}, ${"Export pipeline fails on large files."}, ${0.60}, NOW(), NOW(), ${true}, ${null}, ${"hash_c"})
  `
}

describe("Product memory API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "Memory API Test", stage: "beta",
      support_policy: {}, enabled_channels: ["email"], lead_assignments: {},
    })
    productId = product.product_id
    await seedMemoryChunks(productId)
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-140: GET /memory/sources returns grouped sources", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/memory/sources`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.totalSources).toBe(2)
    const sources = data.sources as Array<Record<string, unknown>>
    const changelog = sources.find((s) => s.sourceUri === "docs://changelog.md")
    expect(changelog?.chunkCount).toBe(2)
  }, 30_000)

  it("NF-INT-141: GET /memory/stats returns aggregate statistics", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/memory/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(Number(data.total_chunks)).toBe(3)
    expect(Number(data.conflict_chunks)).toBe(1)
    expect(Number(data.t1_chunks)).toBe(2)
  }, 30_000)

  it("NF-INT-143: DELETE /memory/sources/:uri removes chunks", async () => {
    const token = makeToken(productId)
    const res = await app.request(
      `/api/v1/products/${productId}/memory/sources/${encodeURIComponent("github://issues/42")}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deletedChunks).toBe(1)
  }, 30_000)

  it("NF-INT-144: DELETE non-existent source returns 0 deleted", async () => {
    const token = makeToken(productId)
    const res = await app.request(
      `/api/v1/products/${productId}/memory/sources/${encodeURIComponent("docs://nope.md")}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).toHaveProperty("deletedChunks", 0)
  }, 30_000)

  it("NF-INT-145: GET /memory/sources returns 401 without auth", async () => {
    const res = await app.request(`/api/v1/products/${productId}/memory/sources`)
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-146: GET /memory/stats returns 401 without auth", async () => {
    const res = await app.request(`/api/v1/products/${productId}/memory/stats`)
    expect(res.status).toBe(401)
  }, 30_000)
})
