/**
 * Integration tests: Cases action endpoints — SLICE-05.
 *
 * Tests send-to-change, resolve, reopen (BEF-17), and send-followup (BEF-16)
 * actions against a real PostgreSQL container.
 *
 * NF-INT-40 through NF-INT-49, NF-INT-50 through NF-INT-57.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/agents/budget.js", () => ({
  checkBudget: vi.fn().mockResolvedValue({ hardLimitExceeded: false, softLimitExceeded: false, currentTokens: 0, hardLimit: 1_000_000, softLimit: 800_000 }),
}))
// Mock transactional dispatch — pgboss.job table doesn't exist in test container
vi.mock("../../src/domain/transactional-dispatch.js", () => ({
  transitionAndDispatch: vi.fn().mockImplementation(async (opts: Record<string, unknown>) => {
    // Still perform the case state transition for test assertions
    const { transitionCase } = await import("../../src/domain/case-state-machine.js")
    await transitionCase(
      opts.caseId as string,
      opts.expectedFrom as string,
      opts.to as string,
      opts.extra as Record<string, unknown> | undefined,
    )
    return "mock-job-id"
  }),
}))
// Mock email — reopen has no email, send-followup does
vi.mock("../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock("../../src/billing/ou-tracker.js", () => ({
  incrementOu: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  createCase,
  findCaseById,
} from "../../src/infra/db/repositories/cases.js"
import { createIdentity } from "../../src/infra/db/repositories/identities.js"
import { signJwt } from "../../src/auth/jwt.js"
import { sendEmail } from "../../src/email/sender.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Cases actions API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "Cases Actions Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/cases-actions-test" },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com" },
    })
    productId = product.product_id
  }, 60_000)

  beforeEach(() => { vi.mocked(sendEmail).mockClear() })

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-40: send-to-change happy path ──────────────────────────────────

  it("NF-INT-40: POST .../send-to-change creates CR and transitions case to in-change", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-40: Send to change",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-to-change`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(typeof data.changeRequestId).toBe("string")

    // Case status must be in-change
    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("in-change")
  }, 30_000)

  // ── NF-INT-41: send-to-change wrong status ────────────────────────────────

  it("NF-INT-41: POST .../send-to-change returns 400 when case not in awaiting-lead", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-41: Wrong status case",
      status:     "in-resolution",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-to-change`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-42: send-to-change wrong product ───────────────────────────────

  it("NF-INT-42: POST .../send-to-change returns 403 for wrong product (product access denied)", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-42: Wrong product case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/prod_wrong/cases/${caseRow.case_id}/send-to-change`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    // CG-07: requireProductAccess fires before resource lookup — returns 403 not 404
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-43: send-to-change without auth ────────────────────────────────

  it("NF-INT-43: POST .../send-to-change returns 401 without auth", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-43: No auth case",
      status:     "awaiting-lead",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-to-change`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-44: resolve happy path ─────────────────────────────────────────

  it("NF-INT-44: POST .../resolve returns 200 and transitions case to resolved", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-44: Resolve case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/resolve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ resolution: "Issue resolved by clearing cache" }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("resolved")
  }, 30_000)

  // ── NF-INT-45: resolve with too-short resolution ──────────────────────────

  it("NF-INT-45: POST .../resolve returns 400 for resolution too short", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-45: Short resolution case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/resolve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ resolution: "ok" }),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-46: resolve without auth ──────────────────────────────────────

  it("NF-INT-46: POST .../resolve returns 401 without auth", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-46: No auth resolve",
      status:     "awaiting-lead",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/resolve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ resolution: "Issue resolved by clearing cache" }),
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-47: resolve with admin role ───────────────────────────────────

  it("NF-INT-47: POST .../resolve with admin role bypasses role check (if any role required)", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-47: Admin resolve case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["admin"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/resolve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ resolution: "Admin resolved this issue directly" }),
      },
    )

    expect(res.status).toBe(200)
    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("resolved")
  }, 30_000)

  // ── NF-INT-50: reopen happy path (BEF-17) ────────────────────────────────

  it("NF-INT-50: POST .../reopen transitions resolved case to awaiting-lead", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-50: Reopen resolved case",
      status:     "resolved",
    })

    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("awaiting-lead")
  }, 30_000)

  // ── NF-INT-51: reopen rejects non-resolved cases ──────────────────────────

  it("NF-INT-51: POST .../reopen returns 400 if case is not resolved", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-51: Reopen awaiting-lead case",
      status:     "awaiting-lead",
    })

    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-52: reopen without auth ───────────────────────────────────────

  it("NF-INT-52: POST .../reopen returns 401 without auth", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-52: Reopen no auth",
      status:     "resolved",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-53: reopen wrong product ──────────────────────────────────────

  it("NF-INT-53: POST .../reopen returns 404 for case from another product", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-53: Reopen wrong product",
      status:     "resolved",
    })

    const token = makeToken(["operator"], "other-product-id")
    const res = await app.request(
      `/api/v1/products/other-product-id/cases/${caseRow.case_id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({}) },
    )

    expect(res.status).toBe(404)
  }, 30_000)

  // ── NF-INT-54: send-followup happy path (BEF-16) ─────────────────────────

  it("NF-INT-54: POST .../send-followup sends email and records audit event", async () => {
    const identity = await createIdentity({
      product_id:      productId,
      type:            "end_user",
      display_name:    "BEF-16 Test User",
      email_addresses: ["bef16@example.com"],
    })

    const caseRow = await createCase({
      product_id:          productId,
      title:               "NF-INT-54: Follow-up on resolved case",
      status:              "resolved",
      reporter_identity_id: identity.identity_id,
    })

    const token = makeToken(["support_lead"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-followup`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ message: "Just checking in — is everything working now?" }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.sentTo).toBe("bef16@example.com")

    // Email was fired
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
    const call = vi.mocked(sendEmail).mock.calls[0]![0] as Record<string, string>
    expect(call.to).toBe("bef16@example.com")
    expect(call.text).toContain("checking in")

    // Case stays resolved
    const updated = await findCaseById(caseRow.case_id)
    expect(updated?.status).toBe("resolved")
  }, 30_000)

  // ── NF-INT-55: send-followup rejects non-resolved case ───────────────────

  it("NF-INT-55: POST .../send-followup returns 400 if case is not resolved", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-55: Follow-up non-resolved",
      status:     "awaiting-lead",
    })

    const token = makeToken(["support_lead"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-followup`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ message: "Follow-up message" }),
      },
    )

    expect(res.status).toBe(400)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  }, 30_000)

  // ── NF-INT-56: send-followup 422 when no email on reporter ───────────────

  it("NF-INT-56: POST .../send-followup returns 422 when reporter has no email", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-56: Follow-up no reporter email",
      status:     "resolved",
      // No reporter_identity_id — no email resolvable
    })

    const token = makeToken(["support_lead"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-followup`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ message: "Follow-up message" }),
      },
    )

    expect(res.status).toBe(422)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  }, 30_000)

  // ── NF-INT-57: send-followup without auth ────────────────────────────────

  it("NF-INT-57: POST .../send-followup returns 401 without auth", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-57: Follow-up no auth",
      status:     "resolved",
    })

    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseRow.case_id}/send-followup`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: "Follow-up message" }),
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)
})
