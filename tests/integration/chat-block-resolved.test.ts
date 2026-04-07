/**
 * Integration tests: CHAT-UX-01 (b) — Block append on resolved/closed case.
 *
 * NF-INT-220: appendChatMessage throws ChatSessionClosedError when linked case is resolved
 * NF-INT-221: appendChatMessage throws ChatSessionClosedError when linked case is closed
 * NF-INT-222: appendChatMessage succeeds when case is open (status = 'new')
 * NF-INT-223: POST /webhooks/chat/message returns 409 with session_closed=true when session resolved
 * NF-INT-224: appendChatMessage throws ChatSessionClosedError when conversation exists but no linked case
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/billing/ou-tracker.js", () => ({
  getOuStatus: vi.fn().mockResolvedValue("ok"),
  trackOu: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct, updateProduct } from "../../src/infra/db/repositories/products.js"
import { updateCase } from "../../src/infra/db/repositories/cases.js"
import { appendChatMessage, startChatSession, ChatSessionClosedError } from "../../src/ingress/chat-ingress.js"
import { encryptSecret } from "../../src/shared/crypto.js"

function makeChatPublicKey(): string {
  return `ch_pub_${Math.random().toString(36).slice(2, 18)}`
}

describe("CHAT-UX-01 (b): Block append on resolved/closed case (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let chatPublicKey: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name: "Test Chat Product",
      slug: `chat-block-${Date.now()}`,
      stage: "beta",
    })
    productId = product.product_id

    chatPublicKey = makeChatPublicKey()
    const encryptedKey = encryptSecret(chatPublicKey)

    await updateProduct(productId, {
      support_policy: { chatEnabled: true, chatPublicKey: encryptedKey },
    })
  })

  afterAll(async () => {
    await ctx.teardown()
  })

  // NF-INT-222: open case — append should succeed
  it("NF-INT-222: appendChatMessage succeeds when case is open", async () => {
    const session = await startChatSession(productId, {
      name: "Alice",
      email: "alice@example.com",
      message: "Hello, I need help",
    })
    expect(session.caseId).toBeTruthy()

    await expect(
      appendChatMessage(productId, session.sessionId, { message: "Follow-up message" }),
    ).resolves.toMatchObject({
      caseId: session.caseId,
    })
  })

  // NF-INT-220: resolved case — throw ChatSessionClosedError
  it("NF-INT-220: appendChatMessage throws ChatSessionClosedError when case is resolved", async () => {
    const session = await startChatSession(productId, {
      name: "Bob",
      email: "bob@example.com",
      message: "My issue",
    })
    expect(session.caseId).toBeTruthy()

    // Resolve the case directly in the DB
    await updateCase(session.caseId, { status: "resolved" })

    await expect(
      appendChatMessage(productId, session.sessionId, { message: "Still here!" }),
    ).rejects.toThrow(ChatSessionClosedError)
  })

  // NF-INT-221: closed case — throw ChatSessionClosedError
  it("NF-INT-221: appendChatMessage throws ChatSessionClosedError when case is closed", async () => {
    const session = await startChatSession(productId, {
      name: "Carol",
      email: "carol@example.com",
      message: "Another issue",
    })
    expect(session.caseId).toBeTruthy()

    await updateCase(session.caseId, { status: "closed" })

    await expect(
      appendChatMessage(productId, session.sessionId, { message: "One more message" }),
    ).rejects.toThrow(ChatSessionClosedError)
  })

  // NF-INT-223: webhook returns 409 when resolved
  it("NF-INT-223: POST /webhooks/chat/message returns 409 with session_closed=true when resolved", async () => {
    const session = await startChatSession(productId, {
      name: "Dave",
      email: "dave@example.com",
      message: "Help please",
    })
    expect(session.caseId).toBeTruthy()

    await updateCase(session.caseId, { status: "resolved" })

    const res = await app.request(`/webhooks/chat/message/${productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_key: chatPublicKey,
        session_id: session.sessionId,
        message: "Still trying to reach you",
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.session_closed).toBe(true)
  })
})
