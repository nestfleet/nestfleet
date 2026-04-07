/**
 * Integration tests: PR Draft Complete endpoint — SLICE-06.
 *
 * Tests the complete action for change requests against a real PostgreSQL
 * container.
 *
 * NF-INT-50 through NF-INT-55.
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
  createChangeRequest,
  updateChangeRequest,
  findChangeRequestById,
} from "../../src/infra/db/repositories/change-requests.js"
import {
  createCase,
  findCaseById,
  updateCase,
} from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("PR Draft Complete API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "PR Drafts Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/pr-drafts-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "change-lead@test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-50: complete happy path ────────────────────────────────────────

  it("NF-INT-50: POST .../complete returns 200 and transitions CR to completed", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-50: Complete case",
      status:     "in-change",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      title:      "NF-INT-50: PR drafted CR",
      status:     "pr-drafted",
      risk_level: "medium",
    })
    await updateChangeRequest(cr.change_request_id, { status: "pr-drafted" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    // CR must be completed
    const updatedCr = await findChangeRequestById(cr.change_request_id)
    expect(updatedCr?.status).toBe("completed")

    // Case must be resolved
    const updatedCase = await findCaseById(caseRow.case_id)
    expect(updatedCase?.status).toBe("resolved")

    // Check audit event cr.completed
    const db = getDb()
    const auditRows = await db`
      SELECT action FROM audit_events
      WHERE entity_ref = ${cr.change_request_id}
        AND action = 'cr.completed'
    ` as Array<{ action: string }>
    expect(auditRows.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  // ── NF-INT-51: CR not in pr-drafted ──────────────────────────────────────

  it("NF-INT-51: POST .../complete returns 400 when CR not in pr-drafted", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-51: Wrong status case",
      status:     "in-change",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "implementation-prep",
      risk_level: "low",
    })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-52: wrong product ──────────────────────────────────────────────

  it("NF-INT-52: POST .../complete returns 403 for wrong product (product access denied)", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-52: Wrong product",
      status:     "in-change",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "pr-drafted",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "pr-drafted" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/prod_wrong/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    // CG-07: requireProductAccess fires before resource lookup — returns 403 not 404
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-53: without auth ───────────────────────────────────────────────

  it("NF-INT-53: POST .../complete returns 401 without auth", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-53: No auth",
      status:     "in-change",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "pr-drafted",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "pr-drafted" })

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-54: idempotent-safe: already-completed CR returns 400 ──────────

  it("NF-INT-54: POST .../complete is idempotent-safe — calling on already-completed CR returns 400", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-54: Already completed",
      status:     "in-change",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "pr-drafted",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "pr-drafted" })

    const token = makeToken(["change_lead"], productId)

    // First call — succeeds
    const res1 = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )
    expect(res1.status).toBe(200)

    // Second call — CR is now completed, should 400
    const res2 = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )
    expect(res2.status).toBe(400)
  }, 30_000)

  // ── NF-INT-55: case NOT double-resolved when already resolved ─────────────

  it("NF-INT-55: case is NOT double-resolved when already resolved before complete", async () => {
    const caseRow = await createCase({
      product_id: productId,
      title:      "NF-INT-55: Pre-resolved case",
      status:     "resolved",
    })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "pr-drafted",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "pr-drafted" })
    // Ensure case is already resolved
    await updateCase(caseRow.case_id, { status: "resolved" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/complete`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)

    // Case must remain resolved (not errored or double-transitioned)
    const finalCase = await findCaseById(caseRow.case_id)
    expect(finalCase?.status).toBe("resolved")

    // CR must be completed
    const finalCr = await findChangeRequestById(cr.change_request_id)
    expect(finalCr?.status).toBe("completed")
  }, 30_000)
})
