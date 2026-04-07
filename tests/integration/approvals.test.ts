/**
 * Integration tests: Approvals API — SLICE-05.
 *
 * Tests approve, reject, and pending-approval list endpoints against a real
 * PostgreSQL container.
 *
 * NF-INT-30 through NF-INT-39.
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
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Approvals API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "Approvals Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/approvals-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "change-lead@test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-30: happy path approve ─────────────────────────────────────────

  it("NF-INT-30: POST .../approve returns 200 and transitions CR to implementation-prep", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-30 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      title:      "NF-INT-30 change request",
      status:     "approval-pending",
      risk_level: "medium",
    })
    // Ensure status is approval-pending
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rationale: "Looks good" }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    // DB status must be implementation-prep
    const updated = await findChangeRequestById(cr.change_request_id)
    expect(updated?.status).toBe("implementation-prep")

    // Check audit event cr.approved
    const db = getDb()
    const auditRows = await db`
      SELECT action FROM audit_events
      WHERE entity_ref = ${cr.change_request_id}
        AND action = 'cr.approved'
    ` as Array<{ action: string }>
    expect(auditRows.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  // ── NF-INT-31: role check ─────────────────────────────────────────────────

  it("NF-INT-31: POST .../approve returns 403 for user without role", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-31 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["support_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      },
    )

    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-32: admin bypass ───────────────────────────────────────────────

  it("NF-INT-32: POST .../approve with admin role bypasses role check", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-32 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["admin"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      },
    )

    expect(res.status).toBe(200)
  }, 30_000)

  // ── NF-INT-33: CR not in approval-pending ─────────────────────────────────

  it("NF-INT-33: POST .../approve returns 400 when CR not in approval-pending", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-33 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "draft",
      risk_level: "low",
    })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-34: wrong product ──────────────────────────────────────────────

  it("NF-INT-34: POST .../approve returns 403 for wrong product (product access denied)", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-34 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/prod_wrong/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      },
    )

    // CG-07: requireProductAccess fires before resource lookup — returns 403 not 404
    expect(res.status).toBe(403)
  }, 30_000)

  // ── NF-INT-35: happy path reject ──────────────────────────────────────────

  it("NF-INT-35: POST .../reject returns 200 and transitions CR to rejected", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-35 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "medium",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/reject`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rationale: "This needs more work before approving" }),
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)

    // DB status must be rejected
    const updated = await findChangeRequestById(cr.change_request_id)
    expect(updated?.status).toBe("rejected")

    // Check audit event cr.rejected
    const db = getDb()
    const auditRows = await db`
      SELECT action FROM audit_events
      WHERE entity_ref = ${cr.change_request_id}
        AND action = 'cr.rejected'
    ` as Array<{ action: string }>
    expect(auditRows.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  // ── NF-INT-36: reject without rationale ──────────────────────────────────

  it("NF-INT-36: POST .../reject returns 400 without rationale body", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-36 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/reject`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-37: reject with rationale too short ────────────────────────────

  it("NF-INT-37: POST .../reject returns 400 for rationale too short", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-37 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/reject`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rationale: "nope" }),
      },
    )

    expect(res.status).toBe(400)
  }, 30_000)

  // ── NF-INT-38: approve without auth token ─────────────────────────────────

  it("NF-INT-38: POST .../approve returns 401 without auth token", async () => {
    const caseRow = await createCase({ product_id: productId, title: "NF-INT-38 case", status: "awaiting-lead" })
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow.case_id,
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(cr.change_request_id, { status: "approval-pending" })

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}/approve`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      },
    )

    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-39: GET pending-approval returns only approval-pending CRs ─────

  it("NF-INT-39: GET .../pending-approval returns only approval-pending CRs", async () => {
    // Create one approval-pending CR and one draft CR
    const caseRow1 = await createCase({ product_id: productId, title: "NF-INT-39 pending", status: "awaiting-lead" })
    const pendingCr = await createChangeRequest({
      product_id: productId,
      case_id:    caseRow1.case_id,
      title:      "NF-INT-39 pending CR",
      status:     "approval-pending",
      risk_level: "low",
    })
    await updateChangeRequest(pendingCr.change_request_id, { status: "approval-pending" })

    const caseRow2 = await createCase({ product_id: productId, title: "NF-INT-39 draft case", status: "awaiting-lead" })
    await createChangeRequest({
      product_id: productId,
      case_id:    caseRow2.case_id,
      title:      "NF-INT-39 draft CR",
      status:     "draft",
      risk_level: "low",
    })

    const token = makeToken(["change_lead"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/pending-approval`,
      {
        method:  "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ status: string; change_request_id: string }> }
    expect(Array.isArray(body.data)).toBe(true)
    // All returned CRs must be approval-pending
    for (const cr of body.data) {
      expect(cr.status).toBe("approval-pending")
    }
    // The pending CR we just created must appear
    const ids = body.data.map((cr) => cr.change_request_id)
    expect(ids).toContain(pendingCr.change_request_id)
  }, 30_000)
})
