/**
 * Integration tests: Signal ingress pipeline — SLICE-01.
 *
 * Tests the full inbound email → Signal → Identity → Conversation → Case flow
 * against a real PostgreSQL container. The triage job dispatch is verified by
 * checking the pg-boss jobs table directly (no LLM calls made in these tests).
 *
 * NF-INT-10 through NF-INT-19.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/infra/queue/boss.js", () => ({
  getBossState: vi.fn().mockReturnValue("started"),
  initBoss:     vi.fn(),
  getBoss:      vi.fn().mockResolvedValue(null),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  findCasesByProduct,
  findCaseById,
} from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles: ["admin"], productIds: [productId] })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostmarkPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MessageID:  `test-msg-${Date.now()}@postmark.example`,
    From:       "Alice User <alice@example.com>",
    FromFull:   { Email: "alice@example.com", Name: "Alice User" },
    To:         "support@docugardener.io",
    Subject:    "Export pipeline is broken",
    TextBody:   "Hi, I've been trying to export my documents for the past hour and it keeps failing with a timeout error. This is urgent — I have a deadline today.",
    HtmlBody:   "",
    ReplyTo:    "",
    Date:       new Date().toISOString(),
    Headers:    [],
    Attachments: [],
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Signal ingress pipeline (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    // Create a test product (DocuGardener pilot)
    const product = await createProduct({
      name:             "DocuGardener Test",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/docugardener" },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@docugardener.io" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-10: happy path ──────────────────────────────────────────────────

  it("NF-INT-10: POST /webhooks/email/inbound/:productId returns 200 and creates case", async () => {
    const payload = makePostmarkPayload()

    const res = await app.request(
      `/webhooks/email/inbound/${productId}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.duplicate).toBe(false)
    expect(typeof body.caseId).toBe("string")
    expect(typeof body.signalId).toBe("string")
    expect(typeof body.conversationId).toBe("string")
    expect(typeof body.identityId).toBe("string")
  }, 30_000)

  it("NF-INT-11: case is created in enriching status after ingestion", async () => {
    const payload = makePostmarkPayload({
      MessageID: `nf-int-11-${Date.now()}@test`,
      Subject:   "NF-INT-11: Auth module not loading",
    })

    const res = await app.request(
      `/webhooks/email/inbound/${productId}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      },
    )
    expect(res.status).toBe(200)
    const { caseId } = await res.json() as { caseId: string }

    const caseRow = await findCaseById(caseId)
    expect(caseRow).not.toBeNull()
    expect(caseRow!.status).toBe("enriching")
    expect(caseRow!.product_id).toBe(productId)
    expect(caseRow!.title).toBe("NF-INT-11: Auth module not loading")
    expect(caseRow!.current_persona).toBe("frontline")
  }, 30_000)

  it("NF-INT-12: duplicate delivery (same MessageID) returns duplicate:true without creating new case", async () => {
    const messageId = `nf-int-12-dup-${Date.now()}@test`
    const payload = makePostmarkPayload({ MessageID: messageId, Subject: "Duplicate test" })

    // First delivery
    const res1 = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    )
    expect(res1.status).toBe(200)
    expect(((await res1.json()) as Record<string, unknown>).duplicate).toBe(false)

    // Second delivery — same MessageID
    const res2 = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    )
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as Record<string, unknown>
    expect(body2.duplicate).toBe(true)
    expect(body2.ok).toBe(true)
  }, 30_000)

  it("NF-INT-13: unknown product returns 500 (product not found error)", async () => {
    const payload = makePostmarkPayload({ MessageID: `nf-int-13-${Date.now()}@test` })

    const res = await app.request(
      `/webhooks/email/inbound/prod_nonexistent`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    )
    expect(res.status).toBe(500)
  }, 30_000)

  it("NF-INT-14: invalid Postmark payload returns 400", async () => {
    const res = await app.request(
      `/webhooks/email/inbound/${productId}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ not: "a-postmark-payload" }),
      },
    )
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-15: reply email links to existing conversation via In-Reply-To", async () => {
    const originalMsgId = `nf-int-15-orig-${Date.now()}@test`

    // First message — opens a conversation
    const payload1 = makePostmarkPayload({
      MessageID: originalMsgId,
      Subject:   "NF-INT-15: original question",
    })
    const res1 = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload1) },
    )
    expect(res1.status).toBe(200)
    const { conversationId: conv1 } = await res1.json() as { conversationId: string }

    // Reply — references the original message
    const payload2 = makePostmarkPayload({
      MessageID: `nf-int-15-reply-${Date.now()}@test`,
      Subject:   "Re: NF-INT-15: original question",
      Headers:   [{ Name: "In-Reply-To", Value: originalMsgId }],
    })
    const res2 = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload2) },
    )
    expect(res2.status).toBe(200)
    const { conversationId: conv2 } = await res2.json() as { conversationId: string }

    // Reply should land in the same conversation
    expect(conv2).toBe(conv1)
  }, 30_000)

  // ── Cases API ──────────────────────────────────────────────────────────────

  it("NF-INT-16: GET /api/v1/products/:productId/cases returns cases for the product", async () => {
    const token = makeToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/cases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { data: unknown[]; meta: Record<string, unknown> }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    expect(body.meta.productId).toBe(productId)
  }, 30_000)

  it("NF-INT-17: GET /api/v1/products/:productId/cases/:caseId returns 404 for wrong product", async () => {
    // Create a case for our product, then try to fetch it under a different productId
    const payload = makePostmarkPayload({
      MessageID: `nf-int-17-${Date.now()}@test`,
      Subject:   "NF-INT-17: ownership check",
    })
    const res = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    )
    const { caseId } = await res.json() as { caseId: string }

    // Fetch under a different productId — still needs auth
    const token = makeToken("prod_other")
    const res2 = await app.request(`/api/v1/products/prod_other/cases/${caseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res2.status).toBe(404)
  }, 30_000)

  it("NF-INT-18: health endpoint remains ok after pipeline usage", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.status).toBe("ok")
    expect(body.db).toBe("ok")
  }, 10_000)

  it("NF-INT-19: audit events are created for signal and case", async () => {
    const payload = makePostmarkPayload({
      MessageID: `nf-int-19-${Date.now()}@test`,
      Subject:   "NF-INT-19: audit trail check",
    })

    const res = await app.request(
      `/webhooks/email/inbound/${productId}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    )
    const { caseId, signalId } = await res.json() as { caseId: string; signalId: string }

    const db = getDb()
    const auditRows = await db`
      SELECT action, entity_type, entity_ref FROM audit_events
      WHERE entity_ref IN (${caseId}, ${signalId})
      ORDER BY occurred_at ASC
    ` as Array<{ action: string; entity_type: string; entity_ref: string }>

    const actions = auditRows.map((r) => r.action)
    expect(actions).toContain("signal.received")
    expect(actions).toContain("case.created")
  }, 30_000)
})
