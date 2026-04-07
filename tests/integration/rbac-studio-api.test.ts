/**
 * Integration tests: RBAC Permission Studio API — SLICE-23.
 * NF-INT-420 through NF-INT-437.
 *
 * TDD: written BEFORE implementation. All tests start RED.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue(null),  // null = dev mode = scale
  validateLicense: vi.fn().mockReturnValue({ valid: true, expired: false, payload: null, statusMessage: "dev" }),
  getLicenseState: vi.fn().mockReturnValue({ valid: true, expired: false, payload: null, statusMessage: "dev" }),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createOperatorUser } from "../../src/infra/db/repositories/operator-users.js"
import { TOTAL_PERMISSIONS } from "../../src/infra/db/repositories/permissions.js"
import { signJwt } from "../../src/auth/jwt.js"
import { getLicenseTier } from "../../src/license/validator.js"
import { getDb } from "../../src/infra/db/client.js"

function makeAdminToken(productId: string): string {
  return signJwt({ sub: "admin-user", email: "admin@test.com", roles: ["admin"], productIds: [productId] })
}

function makeOperatorToken(productId: string): string {
  return signJwt({ sub: "op-user", email: "operator@test.com", roles: ["operator"], productIds: [productId] })
}

describe("RBAC Permission Studio API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "RBAC Studio Test Product",
      stage: "beta",
      enabled_channels: ["email"],
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── NF-INT-420: Create custom role ────────────────────────────────────────────

  it("NF-INT-420: POST /roles creates a custom role and returns role_id", async () => {
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "DPO", key: "dpo", description: "Data Protection Officer" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(typeof data.role_id).toBe("string")
    expect(data.name).toBe("DPO")
    expect(data.key).toBe("dpo")
  }, 30_000)

  // ── NF-INT-421: Tier gate — professional tier blocked ─────────────────────────

  it("NF-INT-421: POST /roles returns 403 for professional tier", async () => {
    vi.mocked(getLicenseTier).mockReturnValueOnce("professional")
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Blocked Role", key: "blocked-role" }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-422: Tier gate — starter tier blocked ──────────────────────────────

  it("NF-INT-422: POST /roles returns 403 for starter tier", async () => {
    vi.mocked(getLicenseTier).mockReturnValueOnce("starter")
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Blocked Role 2", key: "blocked-role-2" }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-423: Clone admin role ──────────────────────────────────────────────

  it("NF-INT-423: POST /roles with clone_from admin returns all permissions", async () => {
    const token = makeAdminToken(productId)

    // Create the role with clone_from admin
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Clone of Admin", key: "clone-admin", clone_from: "admin" }),
    })
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json() as Record<string, unknown>
    const roleId = (createBody.data as Record<string, unknown>).role_id as string

    // Fetch its permissions
    const permsRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(permsRes.status).toBe(200)
    const permsBody = await permsRes.json() as Record<string, unknown>
    const data = permsBody.data as Record<string, unknown>
    const permissions = data.permissions as Array<Record<string, unknown>>
    const grantedCount = permissions.filter((p) => p.granted).length
    expect(grantedCount).toBe(TOTAL_PERMISSIONS)
  }, 30_000)

  // ── NF-INT-424: Set permissions on custom role ────────────────────────────────

  it("NF-INT-424: PUT /roles/:roleId/permissions sets exact permissions", async () => {
    const token = makeAdminToken(productId)

    // Create role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Role 424", key: "test-role-424" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    // Set permissions
    const putRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["cases:read", "signals:read"] }),
    })
    expect(putRes.status).toBe(200)

    // Verify via GET
    const getRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(getRes.status).toBe(200)
    const permsBody = await getRes.json() as Record<string, unknown>
    const permissions = (permsBody.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    const granted = permissions.filter((p) => p.granted).map((p) => p.id as string)
    expect(granted).toContain("cases:read")
    expect(granted).toContain("signals:read")
    expect(granted).toHaveLength(2)
  }, 30_000)

  // ── NF-INT-425: Dependency auto-resolution ────────────────────────────────────

  it("NF-INT-425: PUT permissions with dsar_export auto-adds dsar_search", async () => {
    const token = makeAdminToken(productId)

    // Create role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "DPO Dep Test", key: "dpo-dep-test" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    // Set only dsar_export — dependencies should be auto-resolved
    const putRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["compliance:dsar_export"] }),
    })
    expect(putRes.status).toBe(200)
    const body = await putRes.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    const permissions = data.permissions as string[]
    expect(permissions).toContain("compliance:dsar_export")
    expect(permissions).toContain("compliance:dsar_search")
  }, 30_000)

  // ── NF-INT-426: Impact preview ────────────────────────────────────────────────

  it("NF-INT-426: PUT permissions response includes impactPreview.affectedUsers array", async () => {
    const token = makeAdminToken(productId)

    // Create role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Impact Test Role", key: "impact-test-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    const putRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["cases:read"] }),
    })
    expect(putRes.status).toBe(200)
    const body = await putRes.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(Array.isArray((data.impactPreview as Record<string, unknown>).affectedUsers)).toBe(true)
  }, 30_000)

  // ── NF-INT-427: Audit event written ──────────────────────────────────────────

  it("NF-INT-427: PUT permissions writes audit event with action=role.permissions_updated", async () => {
    const token = makeAdminToken(productId)

    // Create an operator user with the custom role
    await createOperatorUser({
      email: "test-audit-user@test.com",
      password_hash: "hashed",
      roles: ["test-custom-role-audit"],
      product_ids: [productId],
    })

    // Create the custom role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Audit Test Role", key: "test-custom-role-audit" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    // Update permissions
    const putRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["cases:read"] }),
    })
    expect(putRes.status).toBe(200)

    // Check audit_events table
    const db = getDb()
    const rows = await db`
      SELECT * FROM audit_events
      WHERE product_id = ${productId}
        AND action = 'role.permissions_updated'
        AND entity_type = 'role'
      ORDER BY occurred_at DESC LIMIT 1
    `
    expect(rows.length).toBeGreaterThan(0)
  }, 30_000)

  // ── NF-INT-428: Tier gate on PUT permissions ──────────────────────────────────

  it("NF-INT-428: PUT /roles/:roleId/permissions returns 403 for professional tier", async () => {
    vi.mocked(getLicenseTier).mockReturnValueOnce("professional")
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/some-role/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["cases:read"] }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-429: Delete custom role ────────────────────────────────────────────

  it("NF-INT-429: DELETE /roles/:roleId deletes role, then GET permissions returns 404", async () => {
    const token = makeAdminToken(productId)

    // Create role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Deletable Role", key: "deletable-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    // Delete it
    const delRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect([200, 204]).toContain(delRes.status)

    // GET permissions should return 404 now
    const getRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(getRes.status).toBe(404)
  }, 30_000)

  // ── NF-INT-430: Delete role with users returns 409 ────────────────────────────

  it("NF-INT-430: DELETE /roles/:roleId returns 409 when users have that role", async () => {
    const token = makeAdminToken(productId)

    // Create the custom role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Occupied Role", key: "occupied-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    // Create operator user with that role key
    await createOperatorUser({
      email: "occupied-role-user@test.com",
      password_hash: "hashed",
      roles: ["occupied-role"],
      product_ids: [productId],
    })

    // Attempt to delete — should get 409
    const delRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(delRes.status).toBe(409)
  }, 30_000)

  // ── NF-INT-431: Cannot delete default roles ───────────────────────────────────

  it("NF-INT-431: DELETE /roles/admin returns 400", async () => {
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/admin`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-432: User-level permission override (grant) ────────────────────────

  it("NF-INT-432: PUT /roles/:roleId/users/:userRef/overrides grants a permission", async () => {
    const token = makeAdminToken(productId)

    // Create a role first
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Override Test Role", key: "override-test-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    const res = await app.request(
      `/api/v1/products/${productId}/roles/${roleId}/users/alice@test.com/overrides`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ permission_id: "cases:delete", granted: true }),
      }
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  }, 30_000)

  // ── NF-INT-433: User-level permission override (deny) ─────────────────────────

  it("NF-INT-433: PUT /roles/:roleId/users/:userRef/overrides denies a permission", async () => {
    const token = makeAdminToken(productId)

    // Create a role first
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Override Deny Role", key: "override-deny-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    const res = await app.request(
      `/api/v1/products/${productId}/roles/${roleId}/users/alice@test.com/overrides`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ permission_id: "cases:delete", granted: false }),
      }
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  }, 30_000)

  // ── NF-INT-434: Export roles as JSON ──────────────────────────────────────────

  it("NF-INT-434: GET /roles/export.json returns all roles for admin", async () => {
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/export.json`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(Array.isArray(data.roles)).toBe(true)
    expect((data.roles as unknown[]).length).toBeGreaterThanOrEqual(4)
  }, 30_000)

  // ── NF-INT-435: Export roles — operator blocked ───────────────────────────────

  it("NF-INT-435: GET /roles/export.json returns 403 for non-admin", async () => {
    const token = makeOperatorToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/export.json`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-436: SSO group mapping ─────────────────────────────────────────────

  it("NF-INT-436: POST /roles/:roleId/sso-mappings creates a mapping", async () => {
    const token = makeAdminToken(productId)

    // Create role
    const createRes = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "SSO Test Role", key: "sso-test-role" }),
    })
    expect(createRes.status).toBe(201)
    const roleId = ((await createRes.json() as Record<string, unknown>).data as Record<string, unknown>).role_id as string

    const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}/sso-mappings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: "okta-admins" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.group_name).toBe("okta-admins")
    expect(data.role_id).toBe(roleId)
  }, 30_000)

  // ── NF-INT-437: SSO group mapping — tier gate ─────────────────────────────────

  it("NF-INT-437: POST /roles/:roleId/sso-mappings returns 403 for professional tier", async () => {
    vi.mocked(getLicenseTier).mockReturnValueOnce("professional")
    const token = makeAdminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles/some-role/sso-mappings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: "blocked-group" }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

})
