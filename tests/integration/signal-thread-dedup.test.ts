/**
 * Integration tests: channel_thread_id dedup in signal ingress (FEAT-003 Slice 1).
 *
 * Exercises ingestEmailSignal() against a real test DB and verifies
 * that email replies (inReplyTo set) thread into the existing open case
 * instead of opening a new one.
 *
 * NF-INT-THR-01  signal created with channel_thread_id when inReplyTo is set
 * NF-INT-THR-02  signal created with channel_thread_id NULL when inReplyTo is absent
 * NF-INT-THR-03  first email (no inReplyTo) creates a new case
 * NF-INT-THR-04  reply (inReplyTo = first messageId) threads into existing case — no new case
 * NF-INT-THR-05  reply returns same caseId as original case
 * NF-INT-THR-06  reply signal has case_id = existing case_id in DB
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

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { findCasesByProduct } from "../../src/infra/db/repositories/cases.js"
import { ingestEmailSignal } from "../../src/ingress/signal-ingress.js"
import { getDb } from "../../src/infra/db/client.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let emailCounter = 0
function makeEmail(overrides: Partial<{
  messageId:  string
  subject:    string
  fromEmail:  string
  inReplyTo:  string | null
}> = {}) {
  emailCounter++
  return {
    messageId:       overrides.messageId ?? `msg-thr-${emailCounter}@mail.example.com`,
    fromEmail:       overrides.fromEmail ?? "customer@thread-test.com",
    fromName:        "Thread Tester",
    subject:         overrides.subject ?? `Thread Test Subject ${emailCounter}`,
    bodyText:        `Body for thread test ${emailCounter}`,
    replyTo:         null,
    inReplyTo:       overrides.inReplyTo ?? null,
    references:      null,
    receivedAt:      new Date(),
    attachmentCount: 0,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("signal-ingress thread dedup (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name:             "ThreadTestProduct",
      stage:            "beta",
      support_policy:   {},
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@thread-test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-THR-01: signal created with channel_thread_id when inReplyTo is set", async () => {
    const threadId = "<original-msg-thr01@mail.example.com>"
    const email    = makeEmail({ inReplyTo: threadId })
    const result   = await ingestEmailSignal(productId, email)

    expect(result.duplicate).toBe(false)

    const db   = getDb()
    const rows = await db`SELECT channel_thread_id FROM signals WHERE signal_id = ${result.signalId}`
    expect(rows[0]?.channel_thread_id).toBe(threadId)
  }, 30_000)

  it("NF-INT-THR-02: signal without inReplyTo gets own messageId as channel_thread_id (for future reply dedup)", async () => {
    const msgId  = `<own-id-thr02-${Date.now()}@mail.example.com>`
    const email  = makeEmail({ messageId: msgId })
    const result = await ingestEmailSignal(productId, email)

    const db   = getDb()
    const rows = await db`SELECT channel_thread_id FROM signals WHERE signal_id = ${result.signalId}`
    // Original emails store their own messageId so replies can find them
    expect(rows[0]?.channel_thread_id).toBe(msgId)
  }, 30_000)

  it("NF-INT-THR-03: first email (no inReplyTo) creates a new case", async () => {
    const casesBefore = await findCasesByProduct(productId)
    const email       = makeEmail({ fromEmail: "newcase-thr03@thread-test.com" })
    const result      = await ingestEmailSignal(productId, email)

    expect(result.caseId).toBeTruthy()

    const casesAfter = await findCasesByProduct(productId)
    expect(casesAfter.length).toBe(casesBefore.length + 1)
  }, 30_000)

  it("NF-INT-THR-04: reply (inReplyTo = first messageId) threads into existing case — no new case", async () => {
    const fromEmail = "customer-thr04@thread-test.com"
    const firstMsgId = `<first-thr04-${Date.now()}@mail.example.com>`

    // Send original email — creates a case
    const original = await ingestEmailSignal(productId, makeEmail({
      messageId: firstMsgId,
      fromEmail,
      subject:   "Original issue THR-04",
    }))
    expect(original.caseId).toBeTruthy()

    const casesBefore = await findCasesByProduct(productId)

    // Send reply that references the original message
    const reply = await ingestEmailSignal(productId, makeEmail({
      fromEmail,
      subject:   "Re: Original issue THR-04",
      inReplyTo: firstMsgId,
    }))

    const casesAfter = await findCasesByProduct(productId)

    // No new case should have been created
    expect(casesAfter.length).toBe(casesBefore.length)
    expect(reply.caseId).toBe(original.caseId)
  }, 30_000)

  it("NF-INT-THR-05: reply returns same caseId as original case", async () => {
    const fromEmail  = "customer-thr05@thread-test.com"
    const firstMsgId = `<first-thr05-${Date.now()}@mail.example.com>`

    const original = await ingestEmailSignal(productId, makeEmail({
      messageId: firstMsgId,
      fromEmail,
      subject:   "Original issue THR-05",
    }))

    const reply = await ingestEmailSignal(productId, makeEmail({
      fromEmail,
      subject:   "Re: Original issue THR-05",
      inReplyTo: firstMsgId,
    }))

    expect(reply.caseId).toBe(original.caseId)
  }, 30_000)

  it("NF-INT-THR-06: reply signal has case_id = existing case_id in DB", async () => {
    const fromEmail  = "customer-thr06@thread-test.com"
    const firstMsgId = `<first-thr06-${Date.now()}@mail.example.com>`

    const original = await ingestEmailSignal(productId, makeEmail({
      messageId: firstMsgId,
      fromEmail,
      subject:   "Original issue THR-06",
    }))

    const reply = await ingestEmailSignal(productId, makeEmail({
      fromEmail,
      subject:   "Re: Original issue THR-06",
      inReplyTo: firstMsgId,
    }))

    const db   = getDb()
    const rows = await db`SELECT case_id FROM signals WHERE signal_id = ${reply.signalId}`
    expect(rows[0]?.case_id).toBe(original.caseId)
  }, 30_000)
})
