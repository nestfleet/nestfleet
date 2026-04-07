/**
 * Unit tests: requireRole middleware — SPIKE-07.
 *
 * Tests admin bypass and role enforcement without a DB or HTTP layer.
 *
 * NF-UNIT-20 through NF-UNIT-25.
 */

import { describe, it, expect } from "vitest"
import { requireRole } from "../../../src/auth/middleware.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runMiddleware(
  userRoles: string[],
  requiredRoles: string[],
): Promise<{ nextCalled: boolean; status: number }> {
  let nextCalled = false
  let status = 200
  const mockUser = { sub: "u1", email: "x@x.com", roles: userRoles, productIds: [] }
  const mockC = {
    get: (_: string) => mockUser,
    json: (body: unknown, s = 200) => {
      status = s as number
      return new Response(JSON.stringify(body))
    },
  } as unknown as Parameters<ReturnType<typeof requireRole>>[0]
  const mockNext = async () => {
    nextCalled = true
  }
  const middleware = requireRole(...requiredRoles)
  await middleware(mockC, mockNext)
  return { nextCalled, status }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("requireRole middleware (unit)", () => {

  it("NF-UNIT-20: admin role bypasses change_lead requirement", async () => {
    const { nextCalled } = await runMiddleware(["admin"], ["change_lead"])
    expect(nextCalled).toBe(true)
  })

  it("NF-UNIT-21: admin role bypasses any role requirement", async () => {
    const { nextCalled } = await runMiddleware(["admin"], ["product_lead", "change_lead"])
    expect(nextCalled).toBe(true)
  })

  it("NF-UNIT-22: matching role passes", async () => {
    const { nextCalled } = await runMiddleware(["change_lead"], ["change_lead"])
    expect(nextCalled).toBe(true)
  })

  it("NF-UNIT-23: non-matching role returns 403", async () => {
    const { nextCalled, status } = await runMiddleware(["support_lead"], ["change_lead"])
    expect(status).toBe(403)
    expect(nextCalled).toBe(false)
  })

  it("NF-UNIT-24: user with no roles returns 403", async () => {
    const { nextCalled, status } = await runMiddleware([], ["change_lead"])
    expect(status).toBe(403)
    expect(nextCalled).toBe(false)
  })

  it("NF-UNIT-25: multiple required roles — user with any one passes", async () => {
    const { nextCalled } = await runMiddleware(["product_lead"], ["change_lead", "product_lead"])
    expect(nextCalled).toBe(true)
  })
})
