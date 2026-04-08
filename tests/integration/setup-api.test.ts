/**
 * Integration tests: Setup / wizard API — SLICE-12.
 * NF-INT-120 through NF-INT-126.
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
import { signJwt } from "../../src/auth/jwt.js"

describe("Setup API (integration)", () => {
  let ctx: TestDbContext
  let createdProductId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  it("NF-INT-120: GET /setup/status returns needsSetup:true when no products exist", async () => {
    const res = await app.request("/api/v1/setup/status")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).needsSetup).toBe(true)
  }, 30_000)

  it("NF-INT-121: POST /setup/complete creates product with LLM config and leads", async () => {
    const res = await app.request("/api/v1/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: "NF-INT-121 Test Product",
        llm: { provider: "anthropic", model: "claude-3-5-haiku-20241022", apiKey: "sk-ant-test-1234" },
        leads: { support_lead: "support@test.com", change_lead: "change@test.com" },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).productName).toBe("NF-INT-121 Test Product")
    createdProductId = (body.data as Record<string, unknown>).productId as string
  }, 30_000)

  it("NF-INT-125: setup/complete stores apiKey encrypted — GET settings never exposes raw key", async () => {
    const token = signJwt({ sub: "test-user", email: "test@example.com", roles: ["admin"], productIds: [createdProductId] })
    const res = await app.request(`/api/v1/products/${createdProductId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const llm = (body.data as Record<string, unknown>).llm as Record<string, unknown>
    // Last 4 chars of "sk-ant-test-1234" must be returned
    expect(llm.apiKeyLast4).toBe("****1234")
    // Raw key must never appear in any response field
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-1234")
    // apiKeyLast4 !== null means the key is long enough — not "admin" (5 chars)
    expect(llm.apiKeyLast4).not.toBeNull()
  }, 30_000)

  it("NF-INT-122: GET /setup/status returns needsSetup:false after product created", async () => {
    const res = await app.request("/api/v1/setup/status")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).needsSetup).toBe(false)
  }, 30_000)

  it("NF-INT-123: POST /setup/complete returns 409 when product already exists", async () => {
    const res = await app.request("/api/v1/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName: "Duplicate Attempt" }),
    })
    expect(res.status).toBe(409)
  }, 30_000)

  it("NF-INT-124: POST /setup/complete returns 400 for empty productName", async () => {
    const res = await app.request("/api/v1/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName: "" }),
    })
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-126: POST /setup/complete returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/v1/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json{{{",
    })
    expect(res.status).toBe(400)
  }, 30_000)
})

describe("Setup API — product-to-user linking (NF-INT-127)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  it("NF-INT-127: setup/complete with Authorization header links product to the registered user", async () => {
    // 1. Register a new user — token has productIds: []
    const regRes = await app.request("/api/v1/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "link-test@example.com", password: "SecurePass123" }),
    })
    expect(regRes.status).toBe(201)
    const regBody = await regRes.json() as Record<string, unknown>
    const regData = regBody.data as Record<string, unknown>
    const registerToken = regData.token as string

    // 2. Call setup/complete WITH the register token
    const setupRes = await app.request("/api/v1/setup/complete", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${registerToken}`,
      },
      body: JSON.stringify({ productName: "Auth Link Test Product" }),
    })
    expect(setupRes.status).toBe(200)
    const setupBody = await setupRes.json() as Record<string, unknown>
    const productId = (setupBody.data as Record<string, unknown>).productId as string
    expect(productId).toBeTruthy()

    // 3. Log in again — the new JWT must contain the productId (read from DB)
    const loginRes = await app.request("/api/v1/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: "link-test@example.com", password: "SecurePass123" }),
    })
    expect(loginRes.status).toBe(200)
    const loginBody = await loginRes.json() as Record<string, unknown>
    const productIds = (loginBody.user as Record<string, unknown>).productIds as string[]
    expect(productIds).toContain(productId)
  }, 30_000)
})
