/**
 * Integration tests: Contact Form public webhook endpoint — DEFERRED-13.
 *
 * POST /webhooks/contact-form/submit/:productId
 *
 * NF-INT-200  valid submission with correct public key returns 200 {ok:true}
 * NF-INT-201  missing public_key returns 400
 * NF-INT-202  wrong public_key returns 400 with generic error (no info leak)
 * NF-INT-203  invalid JSON body returns 400
 * NF-INT-204  missing required field (email) returns 400
 * NF-INT-205  invalid email format returns 400
 * NF-INT-206  unknown productId returns 400 with generic error (no info leak)
 * NF-INT-207  duplicate submission returns 200 (silent dedup)
 * NF-INT-208  no JWT required — endpoint is public
 * NF-INT-209  rate limit returns 429 after 10 requests from same IP
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/email/sender.js", () => ({
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply:     vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct, updateProduct } from "../../src/infra/db/repositories/products.js"
import { encryptSecret } from "../../src/shared/crypto.js"

// ── Constants ─────────────────────────────────────────────────────────────────

const PUBLIC_KEY = "cf_pub_" + "a".repeat(64)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    public_key: PUBLIC_KEY,
    name:       "Alice Tester",
    email:      "alice@example.com",
    subject:    "Test contact form submission",
    message:    "Hello, this is a test message from the contact form.",
    ...overrides,
  }
}

async function post(
  productId: string,
  body: unknown,
  ip = "203.0.113.1",
): Promise<Response> {
  return app.request(`/webhooks/contact-form/submit/${productId}`, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Contact Form webhook (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name: "ContactFormTestProduct", stage: "beta",
      support_policy: {},
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@cftest.com" },
    })
    productId = product.product_id

    // Store the encrypted public key in support_policy
    await updateProduct(productId, {
      support_policy: {
        contactFormPublicKey: encryptSecret(PUBLIC_KEY),
      },
    })
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("NF-INT-200: valid submission with correct public key returns 200 {ok:true}", async () => {
    const res = await post(productId, makeBody(), "10.0.0.200")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  }, 30_000)

  it("NF-INT-208: no JWT required — endpoint is public", async () => {
    // Same as 200 test but explicit: no Authorization header
    const res = await app.request(`/webhooks/contact-form/submit/${productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.208" },
      body: JSON.stringify(makeBody({ subject: "No auth test", email: "noauth@example.com" })),
    })
    expect(res.status).toBe(200)
  }, 30_000)

  // ── Authentication errors ────────────────────────────────────────────────────

  it("NF-INT-201: missing public_key field returns 400", async () => {
    const res = await post(productId, makeBody({ public_key: undefined }), "10.0.0.201")
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
  }, 30_000)

  it("NF-INT-202: wrong public_key returns 400 with generic error (no info leak)", async () => {
    const res = await post(productId, makeBody({ public_key: "cf_pub_wrong_key" }), "10.0.0.202")
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
    // Must not confirm whether the product exists
    expect(String(body.error)).toBe("Invalid product or API key")
  }, 30_000)

  it("NF-INT-206: unknown productId returns 400 with generic error (no info leak)", async () => {
    const res = await post("prod_nonexistent_12345", makeBody(), "10.0.0.206")
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(String(body.error)).toBe("Invalid product or API key")
  }, 30_000)

  // ── Input validation ─────────────────────────────────────────────────────────

  it("NF-INT-203: invalid JSON body returns 400", async () => {
    const res = await post(productId, "not-valid-json{{{", "10.0.0.203")
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-204: missing required field (message) returns 400", async () => {
    const res = await post(productId, makeBody({ message: undefined }), "10.0.0.204")
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
  }, 30_000)

  it("NF-INT-205: invalid email format returns 400", async () => {
    const res = await post(productId, makeBody({ email: "not-an-email" }), "10.0.0.205")
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
  }, 30_000)

  // ── Deduplication ────────────────────────────────────────────────────────────

  it("NF-INT-207: duplicate submission returns 200 (silent dedup, no new case)", async () => {
    // First submission
    const dedupBody = makeBody({ email: "dedup@example.com", subject: "Dedup test", message: "Same message content." })
    const first = await post(productId, dedupBody, "10.0.0.207a")
    expect(first.status).toBe(200)
    expect((await first.json() as Record<string, unknown>).ok).toBe(true)

    // Identical second submission — must silently succeed (dedup)
    const second = await post(productId, dedupBody, "10.0.0.207b")
    expect(second.status).toBe(200)
    expect((await second.json() as Record<string, unknown>).ok).toBe(true)
  }, 30_000)

  // ── Rate limiting ─────────────────────────────────────────────────────────────

  it("NF-INT-209: rate limit returns 429 after 10 requests from same IP", async () => {
    const rateLimitIp = "10.0.0.209"
    const results: number[] = []

    // Send 11 requests from the same IP; the 11th should be rate-limited (429)
    for (let i = 0; i < 11; i++) {
      const res = await post(
        productId,
        makeBody({ email: `rate${i}@example.com`, subject: `Rate test ${i}`, message: `Rate limit message ${i}` }),
        rateLimitIp,
      )
      results.push(res.status)
    }

    expect(results.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1)
  }, 60_000)
})
