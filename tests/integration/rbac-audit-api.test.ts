/**
 * Integration tests: RBAC Permission Audit API — SLICE-22.
 * NF-INT-400 through NF-INT-408.
 *
 * TDD: written BEFORE implementation. All tests start RED.
 * Covers:
 *   GET /api/v1/products/:productId/roles
 *   GET /api/v1/products/:productId/roles/:roleId/permissions
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
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  DEFAULT_ROLE_PERMISSIONS,
  TOTAL_PERMISSIONS,
} from "../../src/infra/db/repositories/permissions.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

describe("RBAC Permission Audit API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "RBAC Audit Test Product",
      stage: "beta",
      enabled_channels: ["email"],
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── GET /roles ────────────────────────────────────────────────────────────────

  it("NF-INT-400: GET /roles returns the 6 default roles with correct structure", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const roles = body.data as Array<Record<string, unknown>>
    expect(Array.isArray(roles)).toBe(true)
    expect(roles.length).toBe(6)

    const roleIds = roles.map((r) => r.id)
    expect(roleIds).toContain("admin")
    expect(roleIds).toContain("operator")
    expect(roleIds).toContain("support_lead")
    expect(roleIds).toContain("knowledge_lead")
    expect(roleIds).toContain("change_lead")
    expect(roleIds).toContain("product_lead")

    // Each role must carry a permissionCount
    for (const role of roles) {
      expect(typeof role.permissionCount).toBe("number")
      expect((role.permissionCount as number)).toBeGreaterThan(0)
    }
  }, 30_000)

  // ── GET /roles/:roleId/permissions — admin ────────────────────────────────────

  it("NF-INT-401: GET /roles/admin/permissions returns all permissions", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/admin/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>

    const permissions = data.permissions as Array<Record<string, unknown>>
    expect(permissions.length).toBe(TOTAL_PERMISSIONS)

    // Verify shape of individual permission objects
    const first = permissions[0]
    expect(first).toHaveProperty("id")
    expect(first).toHaveProperty("domain")
    expect(first).toHaveProperty("label")
    expect(first).toHaveProperty("description")
    expect(first).toHaveProperty("destructive")
    expect(first).toHaveProperty("sensitive")
    expect(first).toHaveProperty("granted")
    expect((first.granted as boolean)).toBe(true)
  }, 30_000)

  // ── GET /roles/:roleId/permissions — operator ─────────────────────────────────

  it("NF-INT-402: GET /roles/operator/permissions reflects correct grants and exclusions", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/operator/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const permissions = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).permissions as Array<Record<string, unknown>>

    const granted = new Set(permissions.filter((p) => p.granted).map((p) => p.id as string))
    const denied  = new Set(permissions.filter((p) => !p.granted).map((p) => p.id as string))

    // Granted
    expect(granted.has("cases:read")).toBe(true)
    expect(granted.has("cases:create")).toBe(true)
    expect(granted.has("approvals:act")).toBe(true)
    expect(granted.has("audit:read")).toBe(true)

    // Denied
    expect(denied.has("cases:delete")).toBe(true)
    expect(denied.has("compliance:dsar_search")).toBe(true)
    expect(denied.has("compliance:retention_run")).toBe(true)
    expect(denied.has("settings:write")).toBe(true)
    expect(denied.has("memory:write")).toBe(true)

    // Count matches declared constant
    expect(granted.size).toBe(DEFAULT_ROLE_PERMISSIONS["operator"].length)
  }, 30_000)

  // ── GET /roles/:roleId/permissions — support_lead ─────────────────────────────

  it("NF-INT-403: GET /roles/support_lead/permissions reflects correct grants", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/support_lead/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const permissions = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).permissions as Array<Record<string, unknown>>

    const granted = new Set(permissions.filter((p) => p.granted).map((p) => p.id as string))
    expect(granted.has("cases:read")).toBe(true)
    expect(granted.has("cases:transition")).toBe(true)
    expect(granted.has("approvals:act")).toBe(true)
    expect(granted.has("cases:create")).toBe(false)
    expect(granted.has("change_requests:approve")).toBe(false)
    expect(granted.size).toBe(DEFAULT_ROLE_PERMISSIONS["support_lead"].length)
  }, 30_000)

  // ── GET /roles/:roleId/permissions — knowledge_lead ───────────────────────────

  it("NF-INT-404: GET /roles/knowledge_lead/permissions reflects correct grants", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/knowledge_lead/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const permissions = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).permissions as Array<Record<string, unknown>>

    const granted = new Set(permissions.filter((p) => p.granted).map((p) => p.id as string))
    expect(granted.has("change_requests:approve")).toBe(true)
    expect(granted.has("memory:write")).toBe(true)
    expect(granted.has("pr_drafts:push")).toBe(true)
    expect(granted.has("approvals:act")).toBe(false)
    expect(granted.has("compliance:dsar_search")).toBe(false)
    expect(granted.has("cases:transition")).toBe(false)
    expect(granted.size).toBe(DEFAULT_ROLE_PERMISSIONS["knowledge_lead"].length)
  }, 30_000)

  // ── Auth / RBAC ────────────────────────────────────────────────────────────────

  it("NF-INT-405: GET /roles returns 401 without auth", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles`)
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-406: GET /roles returns 403 for a token without operator or admin role", async () => {
    // Sign a token with no recognised roles
    const token = signJwt({ sub: "nobody", email: "nobody@test.com", roles: [], productIds: [productId] })
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-407: GET /roles returns 200 for operator role", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  }, 30_000)

  it("NF-INT-408: GET /roles/:roleId/permissions returns 404 for unknown roleId", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/nonexistent_role/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(404)
  }, 30_000)

})
