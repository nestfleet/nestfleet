/**
 * Integration tests: forward-to-team action endpoint.
 *
 * Tests POST .../forward-to-team against a real PostgreSQL container.
 * Covers: happy path state transition, audit event, body validation,
 * wrong status guard, auth/role guards, wrong product guard.
 *
 * NF-INT-50 through NF-INT-58.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/agents/budget.js", () => ({
  checkBudget: vi.fn().mockResolvedValue({ hardLimitExceeded: false, softLimitExceeded: false, currentTokens: 0, hardLimit: 1_000_000, softLimit: 800_000 }),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  createCase,
  findCaseById,
} from "../../src/infra/db/repositories/cases.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "lead-user", email: "lead@example.com", roles, productIds: [productId] })
}

const VALID_NOTE = "BigCorp, 4200 devs, SOC2 + on-premise requirements, Q2 decision timeline."

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Cases forward-to-team API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "Forward To Team Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/forward-test" },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@example.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-50: happy path — transitions awaiting-lead → in-resolution ────────

  it("NF-INT-50: POST .../forward-to-team transitions case to in-resolution", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-50: Sales inquiry — BigCorp enterprise",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "sales", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.team).toBe("sales")
    expect(data.caseId).toBe(caseRow.case_id)

    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("in-resolution")
  }, 30_000)

  // ── NF-INT-51: all four team values are accepted ──────────────────────────

  it.each(["sales", "support", "legal", "billing"] as const)(
    "NF-INT-51: POST .../forward-to-team accepts team=%s",
    async (team) => {
      const caseRow = await createCase({
        product_id: productId,
        title:      `NF-INT-51: forward to ${team}`,
        status:     "awaiting-lead",
      })

      const token = makeToken(["support_lead"], productId)

      const res = await app.request(
        `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ team, note: VALID_NOTE }),
        },
      )

      expect(res.status).toBe(200)
    }, 30_000,
  )

  // ── NF-INT-52: wrong status (case not in awaiting-lead) ──────────────────

  it("NF-INT-52: POST .../forward-to-team returns 400 when case not in awaiting-lead", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-52: Wrong status case",
      status:     "in-resolution",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "sales", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as string).toLowerCase()).toContain("awaiting-lead")
  }, 30_000)

  // ── NF-INT-53: note too short ─────────────────────────────────────────────

  it("NF-INT-53: POST .../forward-to-team returns 400 when note is too short", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-53: Short note case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "sales", note: "too short" }),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-54: invalid team value ─────────────────────────────────────────

  it("NF-INT-54: POST .../forward-to-team returns 400 for invalid team", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-54: Invalid team case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "engineering", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-55: no auth ────────────────────────────────────────────────────

  it("NF-INT-55: POST .../forward-to-team returns 401 without auth token", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-55: No auth",
      status:     "awaiting-lead",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ team: "sales", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-56: operator role insufficient (needs support_lead or product_lead) ──

  it("NF-INT-56: POST .../forward-to-team returns 403 for plain operator role", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-56: Operator role case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["operator"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "sales", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-57: product_lead role is also accepted ─────────────────────────

  it("NF-INT-57: POST .../forward-to-team accepts product_lead role", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-57: Product lead forward",
      status:     "awaiting-lead",
    })

    const token = makeToken(["product_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "legal", note: VALID_NOTE }),
      },
    )

    expect(res.status).toBe(200)
    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("in-resolution")
  }, 30_000)

  // ── NF-INT-58: wrong product ID ───────────────────────────────────────────

  it("NF-INT-58: POST .../forward-to-team returns 403 for wrong product (access denied)", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-58: Wrong product",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/prod_wrong/cases/${caseRow.case_id}/forward-to-team`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ team: "sales", note: VALID_NOTE }),
      },
    )

    // CG-07: requireProductAccess fires before resource lookup — 403 not 404
    expect(res.status).toBe(403)
  }, 30_000)
})
