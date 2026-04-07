/**
 * Integration tests: User Management API — Wave A.
 * NF-INT-200 through NF-INT-215.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminToken(userId = "admin-test-id"): string {
  return signJwt({ sub: userId, email: "admin@test.com", roles: ["admin"], productIds: [] })
}

function operatorToken(): string {
  return signJwt({ sub: "op-test-id", email: "op@test.com", roles: ["operator"], productIds: [] })
}

async function createUser(
  token: string,
  payload: { email: string; password: string; roles: string[]; productIds?: string[] },
) {
  return app.request("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("User Management API (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── Auth enforcement ────────────────────────────────────────────────────────

  it("NF-INT-200: GET /users returns 401 without auth", async () => {
    const res = await app.request("/api/v1/users")
    expect(res.status).toBe(401)
  })

  it("NF-INT-201: GET /users returns 403 for non-admin", async () => {
    const res = await app.request("/api/v1/users", {
      headers: { Authorization: `Bearer ${operatorToken()}` },
    })
    expect(res.status).toBe(403)
  })

  it("NF-INT-202: POST /users returns 403 for non-admin", async () => {
    const res = await createUser(operatorToken(), {
      email: "test@example.com",
      password: "testpassword1",
      roles: ["operator"],
    })
    expect(res.status).toBe(403)
  })

  // ── CRUD happy path ─────────────────────────────────────────────────────────

  it("NF-INT-203: POST /users creates a user and returns sanitized response", async () => {
    const res = await createUser(adminToken(), {
      email: "newuser@nestfleet.local",
      password: "validpass123",
      roles: ["operator"],
      productIds: [],
    })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.email).toBe("newuser@nestfleet.local")
    expect(data.roles).toEqual(["operator"])
    // password_hash must never appear in response
    expect(JSON.stringify(body)).not.toContain("password_hash")
    expect(data).not.toHaveProperty("passwordHash")
  })

  it("NF-INT-204: GET /users lists all users", async () => {
    const res = await app.request("/api/v1/users", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    const users = body.data as unknown[]
    expect(users.length).toBeGreaterThanOrEqual(1)
    // Verify no password_hash in any user
    expect(JSON.stringify(body)).not.toContain("password_hash")
  })

  it("NF-INT-205: GET /users/:userId returns 404 for unknown user", async () => {
    const res = await app.request("/api/v1/users/usr_nonexistent", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(404)
  })

  it("NF-INT-206: GET /users/:userId returns the user", async () => {
    // Create a user, then fetch by ID
    const createRes = await createUser(adminToken(), {
      email: "fetch-me@nestfleet.local",
      password: "validpass123",
      roles: ["support_lead"],
    })
    expect(createRes.status).toBe(201)
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>

    const res = await app.request(`/api/v1/users/${created.userId}`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).email).toBe("fetch-me@nestfleet.local")
  })

  // ── Update ──────────────────────────────────────────────────────────────────

  it("NF-INT-207: PUT /users/:userId updates roles", async () => {
    const createRes = await createUser(adminToken(), {
      email: "to-update@nestfleet.local",
      password: "validpass123",
      roles: ["operator"],
    })
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>

    const updateRes = await app.request(`/api/v1/users/${created.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ roles: ["support_lead", "change_lead"] }),
    })
    expect(updateRes.status).toBe(200)
    const updated = ((await updateRes.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(updated.roles).toContain("support_lead")
    expect(updated.roles).toContain("change_lead")
  })

  it("NF-INT-208: PUT /users/:userId cannot remove own admin role", async () => {
    // Create an admin user
    await createUser(adminToken(), {
      email: "self-demote@nestfleet.local",
      password: "validpass123",
      roles: ["admin"],
    })

    // Get the actual created userId
    const listRes = await app.request("/api/v1/users", { headers: { Authorization: `Bearer ${adminToken()}` } })
    const users = ((await listRes.json()) as Record<string, unknown>).data as Array<Record<string, unknown>>
    const me = users.find((u) => u.email === "self-demote@nestfleet.local")
    if (!me) throw new Error("User not found")

    // Create a JWT where sub = the user's own ID (self-demotion attempt)
    const selfToken = signJwt({ sub: me.userId as string, email: "self-demote@nestfleet.local", roles: ["admin"], productIds: [] })

    // Attempt to remove own admin role — should be blocked
    const res = await app.request(`/api/v1/users/${me.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${selfToken}` },
      body: JSON.stringify({ roles: ["operator"] }),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.message).toContain("Cannot remove your own admin role")
  })

  // ── Delete ──────────────────────────────────────────────────────────────────

  it("NF-INT-209: DELETE /users/:userId deletes a user", async () => {
    const createRes = await createUser(adminToken(), {
      email: "to-delete@nestfleet.local",
      password: "validpass123",
      roles: ["operator"],
    })
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>

    const deleteRes = await app.request(`/api/v1/users/${created.userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(deleteRes.status).toBe(200)
    expect(((await deleteRes.json()) as Record<string, unknown>).ok).toBe(true)

    // Verify gone
    const getRes = await app.request(`/api/v1/users/${created.userId}`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(getRes.status).toBe(404)
  })

  it("NF-INT-210: DELETE /users/:userId returns 403 when deleting self", async () => {
    // Create a user, then try to delete using a token with that same sub
    const createRes = await createUser(adminToken(), {
      email: "self-delete@nestfleet.local",
      password: "validpass123",
      roles: ["admin"],
    })
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>
    const selfToken = signJwt({
      sub: created.userId as string,
      email: "self-delete@nestfleet.local",
      roles: ["admin"],
      productIds: [],
    })

    const res = await app.request(`/api/v1/users/${created.userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${selfToken}` },
    })
    expect(res.status).toBe(403)
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  it("NF-INT-211: POST /users returns 409 on duplicate email", async () => {
    await createUser(adminToken(), {
      email: "dupe@nestfleet.local",
      password: "validpass123",
      roles: ["operator"],
    })
    const res = await createUser(adminToken(), {
      email: "dupe@nestfleet.local",
      password: "validpass456",
      roles: ["support_lead"],
    })
    expect(res.status).toBe(409)
  })

  it("NF-INT-212: POST /users returns 400 for password shorter than 8 chars", async () => {
    const res = await createUser(adminToken(), {
      email: "shortpw@nestfleet.local",
      password: "1234567",
      roles: ["operator"],
    })
    expect(res.status).toBe(400)
  })

  it("NF-INT-213: POST /users returns 400 for invalid role", async () => {
    const res = await createUser(adminToken(), {
      email: "badrole@nestfleet.local",
      password: "validpass123",
      roles: ["superuser"],
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("VALIDATION_ERROR")
  })

  // ── Password reset ──────────────────────────────────────────────────────────

  it("NF-INT-214: POST /users/:userId/reset-password updates password", async () => {
    const createRes = await createUser(adminToken(), {
      email: "reset-pw@nestfleet.local",
      password: "oldpassword123",
      roles: ["operator"],
    })
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>

    const resetRes = await app.request(`/api/v1/users/${created.userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ newPassword: "newpassword456" }),
    })
    expect(resetRes.status).toBe(200)
    expect(((await resetRes.json()) as Record<string, unknown>).ok).toBe(true)
  })

  it("NF-INT-215: POST /users/:userId/reset-password returns 400 for short password", async () => {
    const createRes = await createUser(adminToken(), {
      email: "reset-short@nestfleet.local",
      password: "validpass123",
      roles: ["operator"],
    })
    const created = ((await createRes.json()) as Record<string, unknown>).data as Record<string, unknown>

    const res = await app.request(`/api/v1/users/${created.userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ newPassword: "short" }),
    })
    expect(res.status).toBe(400)
  })
})
