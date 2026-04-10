/**
 * Integration tests: Role & Permission Matrix — comprehensive combination coverage.
 * NF-INT-438 through NF-INT-470.
 *
 * Covers:
 *  - Default role permission counts (exact)
 *  - Default roles are immutable (PUT/PATCH/DELETE → guarded)
 *  - Custom role full lifecycle (create → read → set perms → update → delete)
 *  - Every permission dependency chain
 *  - Zero-permission and all-permission custom roles
 *  - Permission replacement (re-PUT clears old set)
 *  - Auth combos: no token, wrong role
 *  - Tier combos: professional/starter blocked; null/enterprise allowed
 *  - Cascade delete: occupied role → 409; empty role → 200
 *  - Product isolation: role from product A invisible in product B
 *  - GET /roles lists both default + custom roles correctly
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue(null), // null = dev mode = scale
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

// ── Auth helpers ──────────────────────────────────────────────────────────────

function adminToken(productId: string) {
  return signJwt({ sub: "admin", email: "admin@test.com", roles: ["admin"], productIds: [productId] })
}

function operatorToken(productId: string) {
  return signJwt({ sub: "op", email: "op@test.com", roles: ["operator"], productIds: [productId] })
}

// ── Request helpers ───────────────────────────────────────────────────────────

async function createRole(
  productId: string,
  token: string,
  body: { name: string; key: string; clone_from?: string },
): Promise<string> {
  const res = await app.request(`/api/v1/products/${productId}/roles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  const json = await res.json() as Record<string, unknown>
  return ((json.data as Record<string, unknown>).role_id) as string
}

async function getPermissions(productId: string, token: string, roleId: string) {
  const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res
}

async function putPermissions(productId: string, token: string, roleId: string, perms: string[]) {
  return app.request(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ permissions: perms }),
  })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Role & Permission Matrix (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let productId2: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const p1 = await createProduct({ name: "Matrix Test Product", stage: "beta", enabled_channels: ["email"] })
    const p2 = await createProduct({ name: "Isolation Product", stage: "beta", enabled_channels: ["email"] })
    productId  = p1.product_id
    productId2 = p2.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── Default role permission counts ────────────────────────────────────────

  it("NF-INT-438: GET /roles lists exactly 6 default roles", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${adminToken(productId)}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const roles = body.data as Array<Record<string, unknown>>
    const defaultRoles = roles.filter((r) => r.type === "default")
    expect(defaultRoles.length).toBe(6)
    const ids = defaultRoles.map((r) => r.id as string).sort()
    expect(ids).toEqual(["admin", "change_lead", "knowledge_lead", "operator", "product_lead", "support_lead"])
  }, 30_000)

  it("NF-INT-439: admin role has all 30 permissions granted", async () => {
    const res = await getPermissions(productId, adminToken(productId), "admin")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    const granted = perms.filter((p) => p.granted)
    expect(granted.length).toBe(TOTAL_PERMISSIONS) // 30
  }, 30_000)

  it("NF-INT-440: operator role has exactly 18 permissions granted", async () => {
    const res = await getPermissions(productId, adminToken(productId), "operator")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(18)
  }, 30_000)

  it("NF-INT-441: support_lead role has exactly 12 permissions granted", async () => {
    const res = await getPermissions(productId, adminToken(productId), "support_lead")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(12)
  }, 30_000)

  it("NF-INT-442: knowledge_lead role has exactly 16 permissions granted", async () => {
    const res = await getPermissions(productId, adminToken(productId), "knowledge_lead")
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(16)
  }, 30_000)

  // ── Default roles are immutable ───────────────────────────────────────────

  it.each(["admin", "operator", "support_lead", "knowledge_lead"])(
    "NF-INT-443–446: PUT permissions on default role '%s' returns 400",
    async (roleId) => {
      const res = await putPermissions(productId, adminToken(productId), roleId, ["cases:read"])
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body.error).toBe("VALIDATION")
    }, 30_000,
  )

  it.each(["admin", "operator", "support_lead", "knowledge_lead"])(
    "NF-INT-447–450: PATCH (rename) default role '%s' returns 400",
    async (roleId) => {
      const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken(productId)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacked Name" }),
      })
      expect(res.status).toBe(400)
    }, 30_000,
  )

  it.each(["admin", "operator", "support_lead", "knowledge_lead"])(
    "NF-INT-451–454: DELETE default role '%s' returns 400",
    async (roleId) => {
      const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken(productId)}` },
      })
      expect(res.status).toBe(400)
    }, 30_000,
  )

  // ── Custom role: zero and full permission sets ─────────────────────────────

  it("NF-INT-455: custom role with empty permissions — all 30 granted=false", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Empty Role", key: "empty-role-matrix" })

    await putPermissions(productId, token, roleId, [])

    const res = await getPermissions(productId, token, roleId)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(0)
    expect(perms.length).toBe(TOTAL_PERMISSIONS)
  }, 30_000)

  it("NF-INT-456: custom role with all 30 permissions — all granted=true", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Full Role", key: "full-role-matrix" })

    // Get all permission IDs from admin (all 30)
    const adminPermsRes = await getPermissions(productId, token, "admin")
    const adminPerms = ((await adminPermsRes.json() as Record<string, unknown>).data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    const allIds = adminPerms.map((p) => p.id as string)

    await putPermissions(productId, token, roleId, allIds)

    const res = await getPermissions(productId, token, roleId)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(TOTAL_PERMISSIONS)
  }, 30_000)

  // ── Permission replacement (re-PUT clears old set) ─────────────────────────

  it("NF-INT-457: second PUT replaces first — old permissions removed", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Replace Test", key: "replace-test-matrix" })

    await putPermissions(productId, token, roleId, ["cases:read", "signals:read"])
    await putPermissions(productId, token, roleId, ["analytics:read"])

    const res = await getPermissions(productId, token, roleId)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    const grantedIds = perms.filter((p) => p.granted).map((p) => p.id as string)
    expect(grantedIds).toEqual(["analytics:read"])
  }, 30_000)

  // ── Dependency resolution — every chain ──────────────────────────────────

  const depCases: Array<{ name: string; key: string; input: string[]; mustInclude: string[] }> = [
    {
      name: "cases:delete → cases:read",
      key: "dep-cases-delete",
      input: ["cases:delete"],
      mustInclude: ["cases:delete", "cases:read"],
    },
    {
      name: "cases:transition → cases:read",
      key: "dep-cases-trans",
      input: ["cases:transition"],
      mustInclude: ["cases:transition", "cases:read"],
    },
    {
      name: "cases:create → cases:read",
      key: "dep-cases-create",
      input: ["cases:create"],
      mustInclude: ["cases:create", "cases:read"],
    },
    {
      name: "cases:export → cases:read",
      key: "dep-cases-export",
      input: ["cases:export"],
      mustInclude: ["cases:export", "cases:read"],
    },
    {
      name: "memory:delete → memory:read",
      key: "dep-mem-delete",
      input: ["memory:delete"],
      mustInclude: ["memory:delete", "memory:read"],
    },
    {
      name: "memory:write → memory:read",
      key: "dep-mem-write",
      input: ["memory:write"],
      mustInclude: ["memory:write", "memory:read"],
    },
    {
      name: "signals:dismiss → signals:read",
      key: "dep-signals-dismiss",
      input: ["signals:dismiss"],
      mustInclude: ["signals:dismiss", "signals:read"],
    },
    {
      name: "approvals:act → approvals:read",
      key: "dep-approvals-act",
      input: ["approvals:act"],
      mustInclude: ["approvals:act", "approvals:read"],
    },
    {
      name: "settings:write → settings:read",
      key: "dep-settings-write",
      input: ["settings:write"],
      mustInclude: ["settings:write", "settings:read"],
    },
    {
      name: "pr_drafts:push → pr_drafts:read",
      key: "dep-prdrafts-push",
      input: ["pr_drafts:push"],
      mustInclude: ["pr_drafts:push", "pr_drafts:read"],
    },
    {
      name: "change_requests:create → change_requests:read",
      key: "dep-cr-create",
      input: ["change_requests:create"],
      mustInclude: ["change_requests:create", "change_requests:read"],
    },
    {
      name: "change_requests:approve → change_requests:read",
      key: "dep-cr-approve",
      input: ["change_requests:approve"],
      mustInclude: ["change_requests:approve", "change_requests:read"],
    },
    {
      name: "change_requests:reject → change_requests:read",
      key: "dep-cr-reject",
      input: ["change_requests:reject"],
      mustInclude: ["change_requests:reject", "change_requests:read"],
    },
    {
      name: "change_requests:complete → change_requests:read",
      key: "dep-cr-complete",
      input: ["change_requests:complete"],
      mustInclude: ["change_requests:complete", "change_requests:read"],
    },
    {
      name: "products:create → products:read",
      key: "dep-products-create",
      input: ["products:create"],
      mustInclude: ["products:create", "products:read"],
    },
    {
      name: "products:update → products:read",
      key: "dep-products-update",
      input: ["products:update"],
      mustInclude: ["products:update", "products:read"],
    },
    {
      name: "compliance:retention_run → compliance:read",
      key: "dep-retention-run",
      input: ["compliance:retention_run"],
      mustInclude: ["compliance:retention_run", "compliance:read"],
    },
    {
      name: "compliance:dsar_search → compliance:read",
      key: "dep-dsar-search",
      input: ["compliance:dsar_search"],
      mustInclude: ["compliance:dsar_search", "compliance:read"],
    },
    {
      name: "compliance:dsar_export chains → dsar_search + compliance:read",
      key: "dep-dsar-export",
      input: ["compliance:dsar_export"],
      mustInclude: ["compliance:dsar_export", "compliance:dsar_search", "compliance:read"],
    },
  ]

  it.each(depCases)(
    "NF-INT-458+: dependency '$name' auto-resolved",
    async ({ key, input, mustInclude }) => {
      const token = adminToken(productId)
      const roleId = await createRole(productId, token, { name: `dep-${key}`, key })

      const res = await putPermissions(productId, token, roleId, input)
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      const granted = (body.data as Record<string, unknown>).permissions as string[]
      for (const p of mustInclude) {
        expect(granted).toContain(p)
      }
    }, 30_000,
  )

  // ── PATCH rename ──────────────────────────────────────────────────────────

  it("NF-INT-459: PATCH /roles/:roleId renames custom role", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Rename Me", key: "rename-me-matrix" })

    const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Role" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).name).toBe("Renamed Role")

    // Verify reflected in GET /roles list
    const listRes = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const listBody = await listRes.json() as Record<string, unknown>
    const roles = listBody.data as Array<Record<string, unknown>>
    const found = roles.find((r) => r.id === roleId)
    expect(found?.name).toBe("Renamed Role")
  }, 30_000)

  it("NF-INT-460: PATCH /roles/:roleId for non-existent role returns 404", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles/crole_nonexistent`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken(productId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ghost Role" }),
    })
    expect(res.status).toBe(404)
  }, 30_000)

  // ── Cascade delete ────────────────────────────────────────────────────────

  it("NF-INT-461: DELETE occupied role returns 409 with affectedUsers", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Occupied Matrix", key: "occupied-matrix" })

    await createOperatorUser({
      email: "occupied-matrix-user@test.com",
      password_hash: "hash",
      roles: ["occupied-matrix"],
      product_ids: [productId],
    })

    const res = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("CONFLICT")
    expect((body.affectedUsers as string[]).length).toBeGreaterThan(0)
  }, 30_000)

  it("NF-INT-462: DELETE unoccupied role returns 200 and subsequent GET returns 404", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "Free to Delete", key: "free-delete-matrix" })

    const delRes = await app.request(`/api/v1/products/${productId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect([200, 204]).toContain(delRes.status)

    const getRes = await getPermissions(productId, token, roleId)
    expect(getRes.status).toBe(404)
  }, 30_000)

  // ── Auth combos ───────────────────────────────────────────────────────────

  it("NF-INT-463: no token on GET /roles returns 401", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles`)
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-464: no token on GET /roles/:roleId/permissions returns 401", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles/admin/permissions`)
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-465: operator token can GET /roles (read allowed)", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${operatorToken(productId)}` },
    })
    expect(res.status).toBe(200)
  }, 30_000)

  it("NF-INT-466: operator token can GET /roles/:roleId/permissions (read allowed)", async () => {
    const res = await getPermissions(productId, operatorToken(productId), "operator")
    expect(res.status).toBe(200)
  }, 30_000)

  it("NF-INT-467: operator token cannot POST /roles (admin required)", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken(productId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Op Role", key: "op-role-blocked" }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-468: operator token cannot PUT permissions (admin required)", async () => {
    const res = await putPermissions(productId, operatorToken(productId), "admin", ["cases:read"])
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-469: operator token cannot PATCH role (admin required)", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles/admin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${operatorToken(productId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked" }),
    })
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-470: operator token cannot DELETE role (admin required)", async () => {
    const res = await app.request(`/api/v1/products/${productId}/roles/admin`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${operatorToken(productId)}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── Tier gates ────────────────────────────────────────────────────────────

  it.each(["professional", "starter"] as const)(
    "NF-INT-471–472: POST /roles blocked for tier=%s",
    async (tier) => {
      vi.mocked(getLicenseTier).mockReturnValueOnce(tier)
      const res = await app.request(`/api/v1/products/${productId}/roles`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken(productId)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked", key: `blocked-tier-${tier}` }),
      })
      expect(res.status).toBe(403)
    }, 30_000,
  )

  it.each(["professional", "starter"] as const)(
    "NF-INT-473–474: PATCH /roles/:roleId blocked for tier=%s",
    async (tier) => {
      vi.mocked(getLicenseTier).mockReturnValueOnce(tier)
      const res = await app.request(`/api/v1/products/${productId}/roles/some-role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken(productId)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      })
      expect(res.status).toBe(403)
    }, 30_000,
  )

  it.each(["professional", "starter"] as const)(
    "NF-INT-475–476: DELETE /roles/:roleId blocked for tier=%s",
    async (tier) => {
      vi.mocked(getLicenseTier).mockReturnValueOnce(tier)
      const res = await app.request(`/api/v1/products/${productId}/roles/some-role`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken(productId)}` },
      })
      expect(res.status).toBe(403)
    }, 30_000,
  )

  it("NF-INT-477: null tier (dev mode) allows all write operations", async () => {
    vi.mocked(getLicenseTier).mockReturnValue(null)
    const token = adminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dev Mode Role", key: "dev-mode-role-matrix" }),
    })
    expect(res.status).toBe(201)
  }, 30_000)

  it("NF-INT-478: enterprise tier allows all write operations", async () => {
    vi.mocked(getLicenseTier).mockReturnValueOnce("enterprise")
    const token = adminToken(productId)
    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Enterprise Role", key: "enterprise-role-matrix" }),
    })
    expect(res.status).toBe(201)
  }, 30_000)

  // ── Product isolation ─────────────────────────────────────────────────────

  it("NF-INT-479: role created in product A not visible in product B", async () => {
    const tokenA = adminToken(productId)
    const tokenB = adminToken(productId2)

    // Create role in product A
    const roleId = await createRole(productId, tokenA, { name: "Product A Role", key: "product-a-role-isolation" })

    // Try to GET permissions from product B — should 404
    const res = await getPermissions(productId2, tokenB, roleId)
    expect(res.status).toBe(404)
  }, 30_000)

  it("NF-INT-480: GET /roles in product B only shows product B roles", async () => {
    const tokenA = adminToken(productId)
    const tokenB = adminToken(productId2)

    // Create role in product A
    await createRole(productId, tokenA, { name: "Only in A", key: "only-in-a-isolation" })

    // GET /roles in product B — "only-in-a" should not appear
    const res = await app.request(`/api/v1/products/${productId2}/roles`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const roles = body.data as Array<Record<string, unknown>>
    expect(roles.some((r) => r.id === "only-in-a-isolation")).toBe(false)
  }, 30_000)

  // ── GET /roles includes custom roles ──────────────────────────────────────

  it("NF-INT-481: GET /roles includes created custom roles with type=custom", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, { name: "List Test Role", key: "list-test-matrix" })

    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const roles = body.data as Array<Record<string, unknown>>
    const found = roles.find((r) => r.id === roleId)
    expect(found).toBeDefined()
    expect(found?.type).toBe("custom")
  }, 30_000)

  // ── Clone default role preserves permission count ─────────────────────────

  it("NF-INT-482: clone support_lead → new role has same 12 permissions", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, {
      name: "Clone SL",
      key: "clone-sl-matrix",
      clone_from: "support_lead",
    })

    const res = await getPermissions(productId, token, roleId)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(12)
  }, 30_000)

  it("NF-INT-483: clone knowledge_lead → new role has same 16 permissions", async () => {
    const token = adminToken(productId)
    const roleId = await createRole(productId, token, {
      name: "Clone KL",
      key: "clone-kl-matrix",
      clone_from: "knowledge_lead",
    })

    const res = await getPermissions(productId, token, roleId)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const perms = (body.data as Record<string, unknown>).permissions as Array<Record<string, unknown>>
    expect(perms.filter((p) => p.granted).length).toBe(16)
  }, 30_000)

  // ── Unknown role returns 404 ──────────────────────────────────────────────

  it("NF-INT-484: GET permissions for non-existent role returns 404", async () => {
    const res = await getPermissions(productId, adminToken(productId), "role_does_not_exist")
    expect(res.status).toBe(404)
  }, 30_000)

  // ── Duplicate key rejected ────────────────────────────────────────────────

  it("NF-INT-485: POST /roles with duplicate key returns 409", async () => {
    const token = adminToken(productId)
    await createRole(productId, token, { name: "Unique Key Role", key: "unique-key-matrix" })

    const res = await app.request(`/api/v1/products/${productId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Duplicate Key Role", key: "unique-key-matrix" }),
    })
    expect(res.status).toBe(409)
  }, 30_000)
})
