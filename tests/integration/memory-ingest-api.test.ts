/**
 * Integration tests: Memory Ingest API — WAVE-5.
 * T-W5-01 through T-W5-20.
 *
 * Covers POST /api/v1/products/:productId/memory/ingest and
 * the interaction between ingest, GET /sources, GET /stats, and DELETE /sources/*.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
// Mock embedBatch — real embedding calls would require an LLM; tests verify pipeline plumbing only.
vi.mock("../../src/memory/ingestion/embedder.js", () => ({
  embedBatch: vi.fn().mockImplementation(async (texts: string[]) =>
    texts.map(() => ({ embedding: new Array(768).fill(0), tokenCount: 42 })),
  ),
  embedText: vi.fn().mockImplementation(async () => ({ embedding: new Array(768).fill(0), tokenCount: 10 })),
}))
// Mock conflict detection to prevent background async noise
vi.mock("../../src/memory/ingestion/conflict-detector.js", () => ({
  detectConflicts: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { signJwt } from "../../src/auth/jwt.js"
import { getDb } from "../../src/infra/db/client.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(productId: string, roles: string[] = ["admin"]): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

const SAMPLE_MARKDOWN = `# Product FAQ

## What is NestFleet?
NestFleet is an AI-native product operations platform that unifies support,
change management, and documentation intelligence.

## How does auto-reply work?
The AI triage agent matches incoming cases against the product memory index
and proposes a reply if confidence is above the threshold.
`

const SAMPLE_MARKDOWN_2 = `# Known Issues

## Export pipeline timeout
**Status**: Active
**Affected versions**: 2.3.x

Large file exports (>500MB) time out after 30 seconds. Workaround: split into batches of 250MB.
`

function makeIngestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceType:      "faq",
    sourceUri:       `docs://faq-${Date.now()}.md`,
    content:         SAMPLE_MARKDOWN,
    sourceUpdatedAt: new Date().toISOString(),
    audience:        "public",
    ...overrides,
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Memory ingest API — WAVE-5 (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "MemIngest Test", stage: "beta",
      support_policy: {}, enabled_channels: ["email"], lead_assignments: {},
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── T-W5-01: happy-path ingest ────────────────────────────────────────────

  it("T-W5-01: POST /memory/ingest with valid body returns 200 with chunksIngested > 0", async () => {
    const token = makeToken(productId)
    const body = makeIngestBody({ sourceUri: "docs://faq-tw501.md" })
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.ok).toBe(true)
    const data = json.data as Record<string, unknown>
    expect(Number(data.chunksIngested)).toBeGreaterThan(0)
    expect(data.sourceUri).toBe("docs://faq-tw501.md")
    expect(data.tier).toBe(1) // faq → T1
  }, 30_000)

  // ── T-W5-02: tier assignment ──────────────────────────────────────────────

  it("T-W5-02: POST with sourceType=technical_spec returns tier=2", async () => {
    const token = makeToken(productId)
    const body = makeIngestBody({ sourceType: "technical_spec", sourceUri: "docs://tech-spec-tw502.md" })
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as { data: Record<string, unknown> }).data
    expect(data.tier).toBe(2)
  }, 30_000)

  // ── T-W5-03: dedup (same content_hash → chunksSkipped++) ─────────────────

  it("T-W5-03: Re-ingesting the same content skips duplicate chunks", async () => {
    const token = makeToken(productId)
    const uri = "docs://faq-dedup-tw503.md"
    const body = makeIngestBody({ sourceUri: uri })

    // First ingest
    const res1 = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data1 = ((await res1.json()) as { data: Record<string, unknown> }).data
    const firstIngest = Number(data1.chunksIngested)

    // Second ingest — same content, same URI
    const res2 = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(res2.status).toBe(200)
    const data2 = ((await res2.json()) as { data: Record<string, unknown> }).data
    expect(Number(data2.chunksIngested)).toBe(0)
    expect(Number(data2.chunksSkipped)).toBe(firstIngest)
  }, 30_000)

  // ── T-W5-04: new content at same URI updates chunks ───────────────────────

  it("T-W5-04: Re-ingesting changed content at same URI produces new chunks", async () => {
    const token = makeToken(productId)
    const uri = "docs://faq-changed-tw504.md"

    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri })),
    })

    const res2 = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri, content: SAMPLE_MARKDOWN_2 })),
    })
    expect(res2.status).toBe(200)
    const data2 = ((await res2.json()) as { data: Record<string, unknown> }).data
    // Different content = new content_hash = new chunks inserted, not skipped
    expect(Number(data2.chunksIngested)).toBeGreaterThan(0)
  }, 30_000)

  // ── T-W5-05: chunks persisted in DB ──────────────────────────────────────

  it("T-W5-05: Ingested chunks are persisted in memory_chunks table", async () => {
    const token = makeToken(productId)
    const uri = "docs://faq-persisted-tw505.md"
    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri })),
    })

    const db = getDb()
    const rows = await db`
      SELECT count(*)::int AS n FROM memory_chunks
      WHERE product_id = ${productId} AND source_uri = ${uri}
    `
    expect(Number((rows[0] as Record<string, unknown>).n)).toBeGreaterThan(0)
  }, 30_000)

  // ── T-W5-06: audience field persisted ────────────────────────────────────

  it("T-W5-06: Audience field is stored in memory_chunks", async () => {
    const token = makeToken(productId)
    const uri = "docs://internal-tw506.md"
    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri, audience: "internal" })),
    })

    const db = getDb()
    const [row] = await db`
      SELECT audience FROM memory_chunks
      WHERE product_id = ${productId} AND source_uri = ${uri}
      LIMIT 1
    `
    expect((row as Record<string, unknown>).audience).toBe("internal")
  }, 30_000)

  // ── T-W5-07: productVersion field ────────────────────────────────────────

  it("T-W5-07: productVersion is stored when provided", async () => {
    const token = makeToken(productId)
    const uri = "docs://version-tw507.md"
    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri, productVersion: "2.5.0" })),
    })

    const db = getDb()
    const [row] = await db`
      SELECT product_version FROM memory_chunks
      WHERE product_id = ${productId} AND source_uri = ${uri}
      LIMIT 1
    `
    expect((row as Record<string, unknown>).product_version).toBe("2.5.0")
  }, 30_000)

  // ── T-W5-08: totalTokens reported ────────────────────────────────────────

  it("T-W5-08: Response includes totalTokens > 0", async () => {
    const token = makeToken(productId)
    const body = makeIngestBody({ sourceUri: "docs://tokens-tw508.md" })
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = ((await res.json()) as { data: Record<string, unknown> }).data
    expect(Number(data.totalTokens)).toBeGreaterThan(0)
  }, 30_000)

  // ── T-W5-09: GET /sources reflects new ingest ─────────────────────────────

  it("T-W5-09: GET /memory/sources shows the ingested source", async () => {
    const token = makeToken(productId)
    const uri = "docs://sources-check-tw509.md"
    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri })),
    })

    const res = await app.request(`/api/v1/products/${productId}/memory/sources`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const { data } = await res.json() as { data: { sources: Array<{ sourceUri: string }> } }
    expect(data.sources.some((s) => s.sourceUri === uri)).toBe(true)
  }, 30_000)

  // ── T-W5-10: GET /stats reflects chunk counts ─────────────────────────────

  it("T-W5-10: GET /memory/stats t1_chunks increases after T1 ingest", async () => {
    const token = makeToken(productId)

    const statsBefore = await app.request(`/api/v1/products/${productId}/memory/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const before = ((await statsBefore.json()) as { data: Record<string, unknown> }).data
    const t1Before = Number(before.t1_chunks)

    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceType: "product_spec", sourceUri: "docs://spec-tw510.md" })),
    })

    const statsAfter = await app.request(`/api/v1/products/${productId}/memory/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const after = ((await statsAfter.json()) as { data: Record<string, unknown> }).data
    expect(Number(after.t1_chunks)).toBeGreaterThan(t1Before)
  }, 30_000)

  // ── T-W5-11: DELETE removes ingested source ───────────────────────────────

  it("T-W5-11: DELETE /memory/sources/:uri removes the ingested source chunks", async () => {
    const token = makeToken(productId)
    const uri = "docs://delete-me-tw511.md"

    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: uri })),
    })

    const delRes = await app.request(
      `/api/v1/products/${productId}/memory/sources/${encodeURIComponent(uri)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    )
    expect(delRes.status).toBe(200)
    const { data } = await delRes.json() as { data: { deletedChunks: number } }
    expect(data.deletedChunks).toBeGreaterThan(0)

    // Verify gone
    const db = getDb()
    const [row] = await db`
      SELECT count(*)::int AS n FROM memory_chunks
      WHERE product_id = ${productId} AND source_uri = ${uri}
    `
    expect(Number((row as Record<string, unknown>).n)).toBe(0)
  }, 30_000)

  // ── T-W5-12: 401 without token ────────────────────────────────────────────

  it("T-W5-12: POST /memory/ingest returns 401 without auth token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody()),
    })
    expect(res.status).toBe(401)
  }, 30_000)

  // ── T-W5-13: 403 for viewer role ─────────────────────────────────────────

  it("T-W5-13: POST /memory/ingest returns 403 for viewer role", async () => {
    const token = makeToken(productId, ["viewer"])
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody()),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── T-W5-14: 403 for support_lead role ───────────────────────────────────

  it("T-W5-14: POST /memory/ingest returns 403 for support_lead role", async () => {
    const token = makeToken(productId, ["support_lead"])
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody()),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── T-W5-15: knowledge_lead allowed ──────────────────────────────────────

  it("T-W5-15: POST /memory/ingest returns 200 for knowledge_lead role", async () => {
    const token = makeToken(productId, ["knowledge_lead"])
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUri: "docs://kl-tw515.md" })),
    })
    expect(res.status).toBe(200)
  }, 30_000)

  // ── T-W5-16: 400 missing required field ───────────────────────────────────

  it("T-W5-16: POST /memory/ingest returns 400 when sourceType is missing", async () => {
    const token = makeToken(productId)
    const { sourceType: _omit, ...bodyWithoutType } = makeIngestBody() as Record<string, unknown>
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyWithoutType),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── T-W5-17: 400 empty content ────────────────────────────────────────────

  it("T-W5-17: POST /memory/ingest returns 400 when content is empty string", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ content: "" })),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── T-W5-18: 400 invalid sourceType ──────────────────────────────────────

  it("T-W5-18: POST /memory/ingest returns 400 for unknown sourceType", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceType: "unknown_type_xyz" })),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── T-W5-19: 400 invalid datetime ────────────────────────────────────────

  it("T-W5-19: POST /memory/ingest returns 400 when sourceUpdatedAt is not a valid ISO datetime", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({ sourceUpdatedAt: "not-a-date" })),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── T-W5-20: freshness score stored correctly ─────────────────────────────

  it("T-W5-20: Freshness score in DB reflects source tier and age (T1 recent > 0.7)", async () => {
    const token = makeToken(productId)
    const uri = "docs://freshness-tw520.md"
    await app.request(`/api/v1/products/${productId}/memory/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(makeIngestBody({
        sourceType:      "product_spec",   // T1
        sourceUri:       uri,
        sourceUpdatedAt: new Date().toISOString(), // very recent
      })),
    })

    const db = getDb()
    const [row] = await db`
      SELECT freshness_score FROM memory_chunks
      WHERE product_id = ${productId} AND source_uri = ${uri}
      LIMIT 1
    `
    const score = Number((row as Record<string, unknown>).freshness_score)
    // T1 + today's date should yield a freshness score well above 0.7
    expect(score).toBeGreaterThan(0.7)
  }, 30_000)
})
