/**
 * TDD: Integration tests for Knowledge Capture — SLICE-24.
 * Written BEFORE implementation. Tests define the API contract.
 *
 * NF-INT-KC-01 through NF-INT-KC-12.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-kc", email: "kc@test.com", roles, productIds: [productId] })
}

describe("Knowledge Capture API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "KC Test Product",
      stage: "beta",
      support_policy: {},
      enabled_channels: ["email"],
      lead_assignments: { knowledge_lead: "knowledge@test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── List knowledge assets ─────────────────────────────────────────────────

  it("NF-INT-KC-01: GET /knowledge-assets returns empty list for new product", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { assets: unknown[] } }
    expect(body.ok).toBe(true)
    expect(body.data.assets).toEqual([])
  }, 30_000)

  // ── Create knowledge asset (manual, by Knowledge Lead) ────────────────────

  it("NF-INT-KC-02: POST /knowledge-assets creates a proposed asset", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC test case", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "faq",
          title: "How to configure SSO with Okta?",
          content: "Navigate to Settings > Authentication > SSO. Enter your Okta domain and client ID.",
          confidence: 0.92,
          sourceRefs: [],
        }),
      },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { assetId: string; status: string } }
    expect(body.ok).toBe(true)
    expect(body.data.status).toBe("proposed")
    expect(typeof body.data.assetId).toBe("string")
  }, 30_000)

  it("NF-INT-KC-03: POST /knowledge-assets returns 400 for invalid asset type", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC bad type", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "blog_post",
          title: "Invalid type test",
          content: "This should fail validation because blog_post is not allowed.",
        }),
      },
    )
    expect(res.status).toBe(400)
  }, 30_000)

  // ── Review (approve/reject) ───────────────────────────────────────────────

  it("NF-INT-KC-04: PUT /knowledge-assets/:id/approve transitions to approved", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC approve test", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    // Create
    const createRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "known_issue",
          title: "Auth fails after password reset",
          content: "Users experience login failures for up to 5 minutes due to cache invalidation delay.",
          confidence: 0.88,
        }),
      },
    )
    const { data: { assetId } } = await createRes.json() as { data: { assetId: string } }

    // Approve
    const approveRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/approve`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewNote: "Confirmed — adding to known issues." }),
      },
    )
    expect(approveRes.status).toBe(200)
    const body = await approveRes.json() as { data: { status: string } }
    expect(body.data.status).toBe("approved")
  }, 30_000)

  it("NF-INT-KC-05: PUT /knowledge-assets/:id/reject transitions to rejected", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC reject test", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    const createRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "faq",
          title: "Reject me please",
          content: "This proposal will be rejected by the knowledge lead during review.",
          confidence: 0.5,
        }),
      },
    )
    const { data: { assetId } } = await createRes.json() as { data: { assetId: string } }

    const rejectRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/reject`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewNote: "Too vague — needs more specific steps." }),
      },
    )
    expect(rejectRes.status).toBe(200)
    const body = await rejectRes.json() as { data: { status: string } }
    expect(body.data.status).toBe("rejected")
  }, 30_000)

  // ── Publish ───────────────────────────────────────────────────────────────

  it("NF-INT-KC-06: PUT /knowledge-assets/:id/publish transitions approved → published", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC publish test", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    // Create + approve
    const createRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "runbook_update",
          title: "Export pipeline restart procedure",
          content: "When the export pipeline times out, restart the export-worker pod and check logs for memory pressure.",
          confidence: 0.95,
        }),
      },
    )
    const { data: { assetId } } = await createRes.json() as { data: { assetId: string } }

    await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/approve`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewNote: "LGTM" }),
      },
    )

    // Publish
    const publishRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/publish`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    expect(publishRes.status).toBe(200)
    const body = await publishRes.json() as { data: { status: string; publishedAt: string | null } }
    expect(body.data.status).toBe("published")
    expect(body.data.publishedAt).not.toBeNull()
  }, 30_000)

  it("NF-INT-KC-07: PUT /knowledge-assets/:id/publish returns 400 for non-approved asset", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC publish fail", status: "resolved" })
    const token = makeToken(["knowledge_lead"], productId)

    const createRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "faq",
          title: "Cannot publish proposed",
          content: "This asset is still in proposed status and should not be publishable.",
          confidence: 0.7,
        }),
      },
    )
    const { data: { assetId } } = await createRes.json() as { data: { assetId: string } }

    const publishRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/publish`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    expect(publishRes.status).toBe(400)
  }, 30_000)

  // ── List with filters ─────────────────────────────────────────────────────

  it("NF-INT-KC-08: GET /knowledge-assets?status=proposed returns only proposed", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets?status=proposed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { assets: Array<{ status: string }> } }
    for (const a of body.data.assets) {
      expect(a.status).toBe("proposed")
    }
  }, 30_000)

  // ── RBAC ──────────────────────────────────────────────────────────────────

  it("NF-INT-KC-09: POST /knowledge-assets returns 403 for operator (create requires knowledge_lead)", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC RBAC test", status: "resolved" })
    const token = makeToken(["operator"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "faq",
          title: "Operator should not create",
          content: "This request should be rejected because operators cannot create knowledge assets.",
        }),
      },
    )
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-KC-10: PUT /knowledge-assets/:id/approve returns 403 for support_lead", async () => {
    const caseRow = await createCase({ product_id: productId, title: "KC RBAC approve", status: "resolved" })
    const klToken = makeToken(["knowledge_lead"], productId)

    const createRes = await app.request(
      `/api/v1/products/${productId}/knowledge-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${klToken}` },
        body: JSON.stringify({
          caseId: caseRow.case_id,
          assetType: "faq",
          title: "RBAC approve test",
          content: "Support lead should not be able to approve knowledge assets.",
          confidence: 0.8,
        }),
      },
    )
    const { data: { assetId } } = await createRes.json() as { data: { assetId: string } }

    const slToken = makeToken(["support_lead"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/${assetId}/approve`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${slToken}` },
        body: JSON.stringify({ reviewNote: "I should not be able to do this." }),
      },
    )
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-KC-11: GET /knowledge-assets returns 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/knowledge-assets`)
    expect(res.status).toBe(401)
  }, 30_000)

  // ── Stats ─────────────────────────────────────────────────────────────────

  it("NF-INT-KC-12: GET /knowledge-assets/stats returns counts by status and type", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/knowledge-assets/stats`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { total: number; byStatus: Record<string, number>; byType: Record<string, number> } }
    expect(body.ok).toBe(true)
    expect(typeof body.data.total).toBe("number")
    expect(body.data.total).toBeGreaterThan(0) // we created several in earlier tests
  }, 30_000)
})
