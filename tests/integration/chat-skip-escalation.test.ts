/**
 * Integration tests: CHAT-UX-01 — Skip escalation on first operator reply.
 *
 * When an operator sends the first reply to a chat case, the case must
 * transition directly to `in-resolution` without going through triage /
 * steward routing (CHAT-UX-01 skip-escalation spec).
 *
 * NF-INT-230: first operator reply on enriching chat case → status becomes in-resolution
 * NF-INT-231: second operator reply does NOT re-transition (case stays in-resolution)
 * NF-INT-232: chat reply on non-existent case → 404
 * NF-INT-233: chat reply with empty message → 400
 * NF-INT-234: unauthenticated chat reply → 401
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/billing/ou-tracker.js", () => ({
  getOuStatus:  vi.fn().mockResolvedValue("ok"),
  trackOu:      vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct, updateProduct } from "../../src/infra/db/repositories/products.js"
import { findCaseById } from "../../src/infra/db/repositories/cases.js"
import { startChatSession } from "../../src/ingress/chat-ingress.js"
import { signJwt } from "../../src/auth/jwt.js"
import { encryptSecret } from "../../src/shared/crypto.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function operatorToken(productId: string): string {
  return signJwt({ sub: "op-user", email: "operator@test.com", roles: ["operator"], productIds: [productId] })
}

function makeChatPublicKey(): string {
  return `ch_pub_${Math.random().toString(36).slice(2, 18)}`
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

describe("CHAT-UX-01 skip-escalation: operator first reply transitions case to in-resolution", () => {
  let ctx: TestDbContext
  let productId: string
  let chatPublicKey: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:  "Chat Skip Escalation Test Product",
      slug:  `skip-esc-${Date.now()}`,
      stage: "beta",
    })
    productId = product.product_id

    chatPublicKey = makeChatPublicKey()
    await updateProduct(productId, {
      support_policy: { chatEnabled: true, chatPublicKey: encryptSecret(chatPublicKey) },
    })
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── NF-INT-230 ─────────────────────────────────────────────────────────────

  it("NF-INT-230: first operator reply transitions enriching chat case to in-resolution", async () => {
    const session = await startChatSession(productId, {
      name:    "Widget User",
      email:   "user@example.com",
      message: "I need help with my account",
    })
    expect(session.caseId).toBeTruthy()

    // Verify the case starts in `enriching` (normal triage flow start)
    const before = await findCaseById(session.caseId)
    expect(["new", "enriching"]).toContain(before?.status)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${session.caseId}/chat/reply`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${operatorToken(productId)}`,
        },
        body: JSON.stringify({ message: "Hi! I can help you with that." }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; ts: string }
    expect(body.ok).toBe(true)

    // Case should now be in-resolution — no triage, no steward
    const after = await findCaseById(session.caseId)
    expect(after?.status).toBe("in-resolution")
  }, 30_000)

  // ── NF-INT-231 ─────────────────────────────────────────────────────────────

  it("NF-INT-231: second operator reply does not re-trigger transition (case stays in-resolution)", async () => {
    const session = await startChatSession(productId, {
      name:    "Widget User 2",
      email:   "user2@example.com",
      message: "Another question",
    })
    expect(session.caseId).toBeTruthy()

    const headers = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${operatorToken(productId)}`,
    }
    const url = `/api/v1/products/${productId}/cases/${session.caseId}/chat/reply`

    // First reply — transitions to in-resolution
    const res1 = await app.request(url, { method: "POST", headers, body: JSON.stringify({ message: "First reply" }) })
    expect(res1.status).toBe(200)
    expect((await findCaseById(session.caseId))?.status).toBe("in-resolution")

    // Second reply — case should still be in-resolution, not throw
    const res2 = await app.request(url, { method: "POST", headers, body: JSON.stringify({ message: "Second reply" }) })
    expect(res2.status).toBe(200)
    expect((await findCaseById(session.caseId))?.status).toBe("in-resolution")
  }, 30_000)

  // ── NF-INT-232 ─────────────────────────────────────────────────────────────

  it("NF-INT-232: chat reply to non-existent case returns 404", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/cases/non-existent-case-id/chat/reply`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${operatorToken(productId)}`,
        },
        body: JSON.stringify({ message: "Hello?" }),
      },
    )
    expect(res.status).toBe(404)
  }, 30_000)

  // ── NF-INT-233 ─────────────────────────────────────────────────────────────

  it("NF-INT-233: chat reply with empty message returns 400", async () => {
    const session = await startChatSession(productId, {
      name:    "Widget User 3",
      email:   "user3@example.com",
      message: "Hi",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${session.caseId}/chat/reply`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${operatorToken(productId)}`,
        },
        body: JSON.stringify({ message: "" }),
      },
    )
    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-234 ─────────────────────────────────────────────────────────────

  it("NF-INT-234: unauthenticated chat reply returns 401", async () => {
    const session = await startChatSession(productId, {
      name:    "Widget User 4",
      email:   "user4@example.com",
      message: "Hi",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${session.caseId}/chat/reply`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Sneaky message" }),
      },
    )
    expect(res.status).toBe(401)
  }, 30_000)
})
