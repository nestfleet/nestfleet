/**
 * Integration tests: outbound signal appears in conversation endpoint.
 *
 * Verifies the end-to-end fix: when the auto-reply worker creates an outbound
 * signal, it shows up in the GET /conversation response with direction "outbound".
 *
 * Uses a real PostgreSQL container — no LLM or email calls are made.
 *
 * NF-INT-460: outbound signal (written by auto-reply worker) appears in conversation thread
 * NF-INT-461: outbound signal has direction "outbound" in the conversation response
 * NF-INT-462: outbound signal body matches the agent reply text
 * NF-INT-463: inbound signal (original customer email) and outbound signal both present in thread
 * NF-INT-464: conversation response lists messages in chronological order (inbound first)
 */

import { vi } from "vitest"

// The dispatcher is not needed here — we never transition cases via API
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/billing/ou-tracker.js", () => ({
  incrementOu: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { createSignal } from "../../src/infra/db/repositories/signals.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Token helper ──────────────────────────────────────────────────────────────

function makeToken(productId: string): string {
  return signJwt({
    sub:        "test-user",
    email:      "operator@example.com",
    roles:      ["admin"],
    productIds: [productId],
  })
}

// ── Request helper ────────────────────────────────────────────────────────────

async function getConversation(productId: string, caseId: string, token: string) {
  return app.request(`/api/v1/products/${productId}/cases/${caseId}/conversation`, {
    method:  "GET",
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Outbound signal in conversation endpoint (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let caseId: string
  let convId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:  "Auto-reply Signal Test Product",
      stage: "beta",
    })
    productId = product.product_id
    convId    = `conv-test-${Date.now()}`

    const caseRow = await createCase({
      product_id:       productId,
      title:            "Export keeps timing out",
      status:           "resolved",
      conversation_ids: [convId],
    })
    caseId = caseRow.case_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  it("NF-INT-460: outbound signal created via repository appears in /conversation response", async () => {
    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `auto-reply:${caseId}:${Date.now()}`,
      raw_payload:        { direction: "outbound", subject: "Re: Export keeps timing out", body: "We are looking into this.", to: "customer@example.com" },
      normalized_payload: { direction: "outbound", body: "We are looking into this.", fromEmail: "nestfleet-auto-reply" },
      conversation_id:    convId,
      case_id:            caseId,
      processing_status:  "linked",
    })

    const res = await getConversation(productId, caseId, makeToken(productId))
    expect(res.status).toBe(200)

    const body = await res.json() as { data: unknown[] }
    expect(body.data.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("NF-INT-461: outbound signal has direction outbound in conversation response", async () => {
    // Create a fresh case + signal for isolation
    const c = await createCase({
      product_id:       productId,
      title:            "Payment fails on checkout",
      status:           "resolved",
      conversation_ids: [convId],
    })

    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `auto-reply:${c.case_id}:${Date.now()}`,
      raw_payload:        { direction: "outbound", subject: "Re: Payment fails on checkout", body: "Our team resolved this issue.", to: "buyer@example.com" },
      normalized_payload: { direction: "outbound", body: "Our team resolved this issue.", fromEmail: "nestfleet-auto-reply" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    const res  = await getConversation(productId, c.case_id, makeToken(productId))
    const json = await res.json() as { data: Array<{ direction: string }> }

    const outboundMsgs = json.data.filter((m) => m.direction === "outbound")
    expect(outboundMsgs.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("NF-INT-462: outbound signal body matches the agent reply text", async () => {
    const agentReplyText = "Thank you for contacting support. The issue has been resolved."
    const c = await createCase({
      product_id:       productId,
      title:            "Dashboard not loading",
      status:           "resolved",
      conversation_ids: [convId],
    })

    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `auto-reply:${c.case_id}:${Date.now()}`,
      raw_payload:        { direction: "outbound", subject: "Re: Dashboard not loading", body: agentReplyText, to: "user@example.com" },
      normalized_payload: { direction: "outbound", body: agentReplyText, fromEmail: "nestfleet-auto-reply" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    const res  = await getConversation(productId, c.case_id, makeToken(productId))
    const json = await res.json() as { data: Array<{ direction: string; body: string }> }

    const outbound = json.data.find((m) => m.direction === "outbound")
    expect(outbound).toBeDefined()
    expect(outbound!.body).toBe(agentReplyText)
  }, 30_000)

  it("NF-INT-463: both inbound and outbound signals appear in thread when both present", async () => {
    const c = await createCase({
      product_id:       productId,
      title:            "API rate limit hit",
      status:           "resolved",
      conversation_ids: [convId],
    })

    const baseTime = Date.now()

    // Inbound — original customer message
    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `inbound-email:${c.case_id}:${baseTime}`,
      received_at:        new Date(baseTime),
      raw_payload:        { direction: "inbound", subject: "API rate limit hit", body: "I am hitting the rate limit on your API." },
      normalized_payload: { direction: "inbound", body: "I am hitting the rate limit on your API.", fromEmail: "dev@customer.com" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    // Outbound — auto-reply response
    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `auto-reply:${c.case_id}:${baseTime + 1000}`,
      received_at:        new Date(baseTime + 1000),
      raw_payload:        { direction: "outbound", subject: "Re: API rate limit hit", body: "Your rate limit has been increased.", to: "dev@customer.com" },
      normalized_payload: { direction: "outbound", body: "Your rate limit has been increased.", fromEmail: "nestfleet-auto-reply" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    const res  = await getConversation(productId, c.case_id, makeToken(productId))
    const json = await res.json() as { data: Array<{ direction: string }> }

    const directions = json.data.map((m) => m.direction)
    expect(directions).toContain("inbound")
    expect(directions).toContain("outbound")
  }, 30_000)

  it("NF-INT-464: conversation messages are in chronological order (inbound before outbound)", async () => {
    const c = await createCase({
      product_id:       productId,
      title:            "Slow query performance",
      status:           "resolved",
      conversation_ids: [convId],
    })

    const t0 = Date.now()

    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `inbound-email:${c.case_id}:${t0}`,
      received_at:        new Date(t0),
      raw_payload:        { direction: "inbound", body: "Queries are slow." },
      normalized_payload: { direction: "inbound", body: "Queries are slow.", fromEmail: "user@co.com" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    await createSignal({
      product_id:         productId,
      source_type:        "email",
      source_ref:         `auto-reply:${c.case_id}:${t0 + 2000}`,
      received_at:        new Date(t0 + 2000),
      raw_payload:        { direction: "outbound", body: "We have optimised the indexes." },
      normalized_payload: { direction: "outbound", body: "We have optimised the indexes.", fromEmail: "nestfleet-auto-reply" },
      conversation_id:    convId,
      case_id:            c.case_id,
      processing_status:  "linked",
    })

    const res  = await getConversation(productId, c.case_id, makeToken(productId))
    const json = await res.json() as { data: Array<{ direction: string; received_at: string }> }

    expect(json.data.length).toBe(2)
    // Chronological order — inbound first, outbound second
    expect(json.data[0].direction).toBe("inbound")
    expect(json.data[1].direction).toBe("outbound")

    // received_at timestamps are ascending
    const t1 = new Date(json.data[0].received_at).getTime()
    const t2 = new Date(json.data[1].received_at).getTime()
    expect(t1).toBeLessThan(t2)
  }, 30_000)
})
