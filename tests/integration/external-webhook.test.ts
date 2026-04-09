/**
 * Integration tests: external webhook ingress + API endpoint (FEAT-003 Slice 2).
 *
 * NF-INT-EXT-01  valid payload creates signal with source_type "external"
 * NF-INT-EXT-02  signal gets channel_thread_id = payload.threadId
 * NF-INT-EXT-03  signal gets channel_context = payload.channelContext
 * NF-INT-EXT-04  new message opens a new case
 * NF-INT-EXT-05  follow-up with same threadId threads into existing case (no new case)
 * NF-INT-EXT-06  duplicate payload returns duplicate:true, no new case
 * NF-INT-EXT-07  missing Authorization header → 401
 * NF-INT-EXT-08  wrong API key → 401
 * NF-INT-EXT-09  valid key, missing required fields → 400
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:               vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction:  vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/email/sender.js", () => ({
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply:     vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { findCasesByProduct } from "../../src/infra/db/repositories/cases.js"
import { ingestExternalSignal } from "../../src/ingress/external-ingress.js"
import { getDb } from "../../src/infra/db/client.js"
import { encryptSecret } from "../../src/shared/crypto.js"
import { app } from "../../src/api/index.js"
import { dispatch } from "../../src/agents/dispatcher.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let msgCounter = 0
function makePayload(overrides: Partial<{
  threadId:       string
  senderName:     string
  senderRef:      string
  message:        string
  channelContext: Record<string, unknown>
}> = {}) {
  msgCounter++
  return {
    threadId:   overrides.threadId   ?? `thread-ext-${msgCounter}`,
    senderName: overrides.senderName ?? "Test Sender",
    senderRef:  overrides.senderRef  ?? `sender-${msgCounter}`,
    message:    overrides.message    ?? `Test message ${msgCounter}`,
    ...(overrides.channelContext ? { channelContext: overrides.channelContext } : {}),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("external webhook (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let apiKey: string

  beforeAll(async () => {
    ctx     = await setupTestDb()
    apiKey  = "ext-api-key-test-secret"

    const product = await createProduct({
      name:             "ExtWebhookTestProduct",
      stage:            "beta",
      support_policy:   { externalWebhookApiKey: encryptSecret(apiKey) },
      enabled_channels: ["external"],
      lead_assignments: { support_lead: "lead@ext-test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── Ingress-level tests (bypass HTTP layer) ───────────────────────────────

  it("NF-INT-EXT-01: signal created with source_type 'external'", async () => {
    const result = await ingestExternalSignal(productId, makePayload())

    const db   = getDb()
    const rows = await db`SELECT source_type FROM signals WHERE signal_id = ${result.signalId}`
    expect(rows[0]?.source_type).toBe("external")
  }, 30_000)

  it("NF-INT-EXT-02: signal gets channel_thread_id = payload.threadId", async () => {
    const threadId = `thr-ext-02-${Date.now()}`
    const result   = await ingestExternalSignal(productId, makePayload({ threadId }))

    const db   = getDb()
    const rows = await db`SELECT channel_thread_id FROM signals WHERE signal_id = ${result.signalId}`
    expect(rows[0]?.channel_thread_id).toBe(threadId)
  }, 30_000)

  it("NF-INT-EXT-03: signal gets channel_context from payload", async () => {
    const channelContext = { guild_id: "gld-001", channel_id: "chn-001" }
    const result = await ingestExternalSignal(productId, makePayload({ channelContext }))

    const db   = getDb()
    const rows = await db`SELECT channel_context FROM signals WHERE signal_id = ${result.signalId}`
    expect(rows[0]?.channel_context).toMatchObject(channelContext)
  }, 30_000)

  it("NF-INT-EXT-04: new message (unique threadId) opens a new case", async () => {
    const casesBefore = await findCasesByProduct(productId)
    const result      = await ingestExternalSignal(productId, makePayload())

    expect(result.caseId).toBeTruthy()
    const casesAfter = await findCasesByProduct(productId)
    expect(casesAfter.length).toBe(casesBefore.length + 1)
  }, 30_000)

  it("NF-INT-EXT-05: follow-up with same threadId threads into existing case", async () => {
    const threadId = `thr-ext-05-${Date.now()}`
    const senderRef = `sender-ext-05-${Date.now()}`

    // First message — opens case
    const first = await ingestExternalSignal(productId, makePayload({ threadId, senderRef, message: "First message" }))
    expect(first.caseId).toBeTruthy()

    const casesBefore = await findCasesByProduct(productId)

    // Follow-up — same threadId, different message content
    const second = await ingestExternalSignal(productId, makePayload({ threadId, senderRef, message: "Follow-up message" }))

    const casesAfter = await findCasesByProduct(productId)
    expect(casesAfter.length).toBe(casesBefore.length)
    expect(second.caseId).toBe(first.caseId)
  }, 30_000)

  it("NF-INT-EXT-06: identical payload returns duplicate:true, no new case", async () => {
    const payload      = makePayload()
    const casesBefore  = await findCasesByProduct(productId)

    await ingestExternalSignal(productId, payload)
    const casesAfterFirst = await findCasesByProduct(productId)
    expect(casesAfterFirst.length).toBe(casesBefore.length + 1)

    // Exact duplicate
    const dup = await ingestExternalSignal(productId, payload)
    expect(dup.duplicate).toBe(true)

    const casesAfterDup = await findCasesByProduct(productId)
    expect(casesAfterDup.length).toBe(casesAfterFirst.length)
  }, 30_000)

  // ── QE-07 Smoke canary integration tests ─────────────────────────────────

  beforeEach(() => { vi.clearAllMocks() })

  it("NF-INT-EXT-10: senderName='smoke-test' → case status is 'resolved' in DB", async () => {
    const result = await ingestExternalSignal(productId, makePayload({ senderName: "smoke-test" }))

    expect(result.canary).toBe(true)
    const db  = getDb()
    const rows = await db`SELECT status FROM cases WHERE case_id = ${result.caseId}`
    expect(rows[0]?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-EXT-11: channelContext.source='smoke-test' → case status is 'resolved' in DB", async () => {
    const result = await ingestExternalSignal(
      productId,
      makePayload({ channelContext: { source: "smoke-test" } }),
    )

    expect(result.canary).toBe(true)
    const db   = getDb()
    const rows = await db`SELECT status FROM cases WHERE case_id = ${result.caseId}`
    expect(rows[0]?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-EXT-12: smoke canary → dispatch (triage) not called", async () => {
    await ingestExternalSignal(productId, makePayload({ senderName: "smoke-test" }))

    expect(dispatch).not.toHaveBeenCalled()
  }, 30_000)

  // ── HTTP endpoint tests ───────────────────────────────────────────────────

  it("NF-INT-EXT-07: missing Authorization header → 401", async () => {
    const res = await app.request(`/webhooks/external/${productId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(makePayload()),
    })
    expect(res.status).toBe(401)
  }, 15_000)

  it("NF-INT-EXT-08: wrong API key → 401", async () => {
    const res = await app.request(`/webhooks/external/${productId}`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer wrong-key",
      },
      body: JSON.stringify(makePayload()),
    })
    expect(res.status).toBe(401)
  }, 15_000)

  it("NF-INT-EXT-09: valid key, missing required fields → 400", async () => {
    const res = await app.request(`/webhooks/external/${productId}`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ threadId: "abc" }), // missing senderName, senderRef, message
    })
    expect(res.status).toBe(400)
  }, 15_000)
})
