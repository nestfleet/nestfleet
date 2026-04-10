/**
 * Unit tests: requirePermission middleware — RBAC enforcement.
 *
 * Tests the golden-truth permission resolution without a DB connection.
 * The DB override path is mocked; DEFAULT_ROLE_PERMISSIONS drives the rest.
 *
 * NF-UNIT-100 through NF-UNIT-109.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock roles-studio before importing middleware ─────────────────────────────

vi.mock("../../../src/infra/db/repositories/roles-studio.js", () => ({
  getRolePermissionOverrides: vi.fn().mockResolvedValue(null), // default: no override
}))

import { requirePermission } from "../../../src/auth/middleware.js"
import { getRolePermissionOverrides } from "../../../src/infra/db/repositories/roles-studio.js"

const mockGetOverrides = vi.mocked(getRolePermissionOverrides)

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RunResult {
  nextCalled: boolean
  status: number
}

async function runMiddleware(
  userRoles: string[],
  permId: string,
  productId?: string,
): Promise<RunResult> {
  let nextCalled = false
  let responseStatus = 200

  const mockUser = {
    sub: "u1",
    email: "test@test.com",
    roles: userRoles,
    productIds: productId ? [productId] : [],
  }

  const mockC = {
    get: (_: string) => mockUser,
    req: {
      param: (key: string) => (key === "productId" ? (productId ?? null) : null),
    },
    json: (body: unknown, s = 200) => {
      responseStatus = s as number
      return new Response(JSON.stringify(body))
    },
  } as unknown as Parameters<ReturnType<typeof requirePermission>>[0]

  const mockNext = async () => {
    nextCalled = true
  }

  const middleware = requirePermission(permId)
  await middleware(mockC, mockNext)
  return { nextCalled, status: responseStatus }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetOverrides.mockResolvedValue(null) // no override by default
})

describe("requirePermission middleware — default role permissions (NF-UNIT-100–109)", () => {

  // ── NF-UNIT-100 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-100: admin bypasses requirePermission for any permission", async () => {
    const { nextCalled } = await runMiddleware(["admin"], "cases:delete")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-101 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-101: operator allowed for a permission they hold (cases:read)", async () => {
    const { nextCalled } = await runMiddleware(["operator"], "cases:read")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-102 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-102: operator denied for a permission they lack (change_requests:approve)", async () => {
    const { nextCalled, status } = await runMiddleware(["operator"], "change_requests:approve")
    expect(nextCalled).toBe(false)
    expect(status).toBe(403)
  })

  // ── NF-UNIT-103 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-103: change_lead allowed for change_requests:approve", async () => {
    const { nextCalled } = await runMiddleware(["change_lead"], "change_requests:approve")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-104 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-104: product_lead allowed for change_requests:reject", async () => {
    const { nextCalled } = await runMiddleware(["product_lead"], "change_requests:reject")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-105 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-105: knowledge_lead allowed for change_requests:approve (per catalog)", async () => {
    const { nextCalled } = await runMiddleware(["knowledge_lead"], "change_requests:approve")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-106 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-106: support_lead denied for change_requests:approve", async () => {
    const { nextCalled, status } = await runMiddleware(["support_lead"], "change_requests:approve")
    expect(nextCalled).toBe(false)
    expect(status).toBe(403)
  })

  // ── NF-UNIT-107 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-107: no user context → 401", async () => {
    let responseStatus = 200
    const mockC = {
      get: () => undefined,
      req: { param: () => null },
      json: (_: unknown, s = 200) => {
        responseStatus = s as number
        return new Response()
      },
    } as unknown as Parameters<ReturnType<typeof requirePermission>>[0]
    const middleware = requirePermission("cases:read")
    await middleware(mockC, async () => {})
    expect(responseStatus).toBe(401)
  })

  // ── NF-UNIT-108 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-108: DB override grants permission not in default set", async () => {
    // operator normally lacks change_requests:approve, but override grants it
    mockGetOverrides.mockResolvedValue(["cases:read", "change_requests:approve"])
    const { nextCalled } = await runMiddleware(["operator"], "change_requests:approve", "prod_123")
    expect(nextCalled).toBe(true)
  })

  // ── NF-UNIT-109 ──────────────────────────────────────────────────────────────

  it("NF-UNIT-109: DB override revokes permission that is in default set", async () => {
    // change_lead normally has change_requests:approve, but override removes it
    mockGetOverrides.mockResolvedValue(["cases:read", "change_requests:read"]) // no approve
    const { nextCalled, status } = await runMiddleware(["change_lead"], "change_requests:approve", "prod_123")
    expect(nextCalled).toBe(false)
    expect(status).toBe(403)
  })

})
