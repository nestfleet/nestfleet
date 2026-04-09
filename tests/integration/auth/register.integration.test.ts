/**
 * Integration tests: POST /api/v1/auth/register — NF-BETA-01 §14.1 + §14.3
 *
 * Full DB round-trip: register → verify user in DB → login with new credentials.
 * Uses a real PostgreSQL container via Testcontainers.
 *
 * NF-INT-510 through NF-INT-516
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "../helpers/db.js"
import { setupTestDb } from "../helpers/db.js"
import { app } from "../../../src/api/index.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function register(body: unknown) {
  return app.request("/api/v1/auth/register", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })
}

async function login(email: string, password: string) {
  return app.request("/api/v1/auth/login", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/register (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
    // Enable registration for this suite
    process.env.REGISTRATION_ENABLED = "true"
  })

  afterAll(async () => {
    delete process.env.REGISTRATION_ENABLED
    await ctx.teardown()
  })

  beforeEach(async () => {
    // Clean up users between tests to avoid conflicts
    await ctx.db`DELETE FROM operator_users WHERE email LIKE '%@test-register.com'`
  })

  it("NF-INT-510: happy path — user created in DB with admin role", async () => {
    const res = await register({
      email:    "alice@test-register.com",
      password: "SecurePass123",
    })
    expect(res.status).toBe(201)

    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(typeof (data.token)).toBe("string")

    // Verify user actually exists in DB
    const rows = await ctx.db<{ email: string; roles: string[] }[]>`
      SELECT email, roles FROM operator_users WHERE email = 'alice@test-register.com'
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.roles).toContain("admin")
  })

  it("NF-INT-511: registered user can immediately login", async () => {
    await register({ email: "bob@test-register.com", password: "SecurePass123" })

    const loginRes = await login("bob@test-register.com", "SecurePass123")
    expect(loginRes.status).toBe(200)
    const loginBody = await loginRes.json() as Record<string, unknown>
    expect(typeof loginBody.token).toBe("string")
  })

  it("NF-INT-512: JWT from register is valid for authenticated requests", async () => {
    const regRes = await register({ email: "carol@test-register.com", password: "SecurePass123" })
    const regBody = await regRes.json() as Record<string, unknown>
    const data = regBody.data as Record<string, unknown>
    const token = data.token as string

    const meRes = await app.request("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(meRes.status).toBe(200)
    const meBody = await meRes.json() as Record<string, unknown>
    expect(meBody.email).toBe("carol@test-register.com")
  })

  it("NF-INT-513: duplicate email → 409 (DB-enforced uniqueness)", async () => {
    await register({ email: "dupetest@test-register.com", password: "SecurePass123" })
    const res2 = await register({ email: "dupetest@test-register.com", password: "DifferentPass!" })
    expect(res2.status).toBe(409)
    const body = await res2.json() as Record<string, unknown>
    expect(body.error).toBe("CONFLICT")
  })

  it("NF-INT-514: password is stored hashed — not plaintext in DB", async () => {
    await register({ email: "hashcheck@test-register.com", password: "PlaintextPassword" })
    const rows = await ctx.db<{ password_hash: string }[]>`
      SELECT password_hash FROM operator_users WHERE email = 'hashcheck@test-register.com'
    `
    expect(rows[0]?.password_hash).not.toBe("PlaintextPassword")
    expect(rows[0]?.password_hash).toMatch(/^\$2b\$/)
  })

  it("NF-INT-515: REGISTRATION_ENABLED=false → 404 (env check)", async () => {
    // REGISTRATION_ENABLED=false only locks when ≥1 user exists in DB.
    // beforeEach clears all test users, so we need at least one user first.
    await register({ email: "seed@test-register.com", password: "SecurePass123" })

    process.env.REGISTRATION_ENABLED = "false"
    try {
      const res = await register({ email: "blocked@test-register.com", password: "SecurePass123" })
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body.error).toBe("REGISTRATION_DISABLED")
    } finally {
      process.env.REGISTRATION_ENABLED = "true"
    }
  })

  it("NF-INT-516: displayName defaults to email prefix when not provided", async () => {
    await register({ email: "dave@test-register.com", password: "SecurePass123" })
    const rows = await ctx.db<{ display_name: string }[]>`
      SELECT display_name FROM operator_users WHERE email = 'dave@test-register.com'
    `
    expect(rows[0]?.display_name).toBe("dave")
  })
})
