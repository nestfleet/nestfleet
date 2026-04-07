/**
 * Integration tests: cr_track field — migration 0039.
 *
 * Tests repository CRUD and API serialisation for the cr_track column
 * added to change_requests in migration 0039.
 *
 * NF-INT-70 through NF-INT-76
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
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  createChangeRequest,
  findChangeRequestById,
  findChangeRequestsByProduct,
} from "../../src/infra/db/repositories/change-requests.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("cr_track — repository + API (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let caseId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "CrTrack Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/cr-track-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "change@test.com" },
    })
    productId = product.product_id

    const caseRow = await createCase({
      product_id: productId,
      title:      "ZK proof timeout",
      status:     "triaged",
    })
    caseId = caseRow.case_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── Repository ──────────────────────────────────────────────────────────────

  it("NF-INT-70: createChangeRequest with cr_track='infra_debt' persists correctly", async () => {
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseId,
      title:      "[Infra debt] ZK proof timeout",
      status:     "draft",
      risk_level: "medium",
      cr_track:   "infra_debt",
    })

    expect(cr.cr_track).toBe("infra_debt")
  })

  it("NF-INT-71: findChangeRequestById returns cr_track='infra_debt'", async () => {
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseId,
      title:      "[Infra debt] Latency spike",
      status:     "draft",
      cr_track:   "infra_debt",
    })

    const found = await findChangeRequestById(cr.change_request_id)

    expect(found).not.toBeNull()
    expect(found!.cr_track).toBe("infra_debt")
  })

  it("NF-INT-72: createChangeRequest without cr_track defaults to 'customer_reported'", async () => {
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseId,
      title:      "Primary bug CR",
      status:     "draft",
      risk_level: "medium",
      // cr_track omitted — should default to customer_reported
    })

    expect(cr.cr_track).toBe("customer_reported")
  })

  it("NF-INT-73: findChangeRequestsByProduct returns cr_track for all rows", async () => {
    const all = await findChangeRequestsByProduct(productId, {
      status: undefined, limit: 50, offset: 0,
    })

    // All rows must have a valid cr_track value
    for (const row of all) {
      expect(["customer_reported", "infra_debt"]).toContain(row.cr_track)
    }

    // At least one infra_debt and one customer_reported should exist from previous tests
    const tracks = all.map(r => r.cr_track)
    expect(tracks).toContain("infra_debt")
    expect(tracks).toContain("customer_reported")
  })

  // ── API serialisation ───────────────────────────────────────────────────────

  it("NF-INT-74: GET /change-requests returns cr_track field in each item", async () => {
    const token = makeToken(["operator"], productId)

    const res = await app.request(
      `/api/v1/products/${productId}/change-requests`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ cr_track?: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const cr of body.data) {
      expect(["customer_reported", "infra_debt"]).toContain(cr.cr_track)
    }
  })

  it("NF-INT-75: GET /change-requests/:crId returns cr_track='infra_debt' for sidecar CR", async () => {
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseId,
      title:      "[Infra debt] Queue throughput",
      status:     "draft",
      cr_track:   "infra_debt",
    })

    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { cr_track: string } }
    expect(body.data.cr_track).toBe("infra_debt")
  })

  it("NF-INT-76: GET /change-requests/:crId returns cr_track='customer_reported' for primary CR", async () => {
    const cr = await createChangeRequest({
      product_id: productId,
      case_id:    caseId,
      title:      "Primary customer-reported CR",
      status:     "approval-pending",
      risk_level: "medium",
      // no cr_track — defaults to customer_reported
    })

    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/change-requests/${cr.change_request_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { cr_track: string } }
    expect(body.data.cr_track).toBe("customer_reported")
  })
})
