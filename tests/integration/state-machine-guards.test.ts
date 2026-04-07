/**
 * Integration tests: Case and CR state machine guards — SLICE-14A.
 * NF-INT-130 through NF-INT-138.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase, findCaseById } from "../../src/infra/db/repositories/cases.js"
import { createChangeRequest, findChangeRequestById } from "../../src/infra/db/repositories/change-requests.js"
import { transitionCase, InvalidStateTransitionError } from "../../src/domain/case-state-machine.js"
import { transitionChangeRequest } from "../../src/domain/cr-state-machine.js"

describe("State machine guards (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "SM Test Product", stage: "beta",
      support_policy: {}, enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com" },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-130: transitionCase() succeeds for enriching → triaged", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-130", status: "enriching" })
    await transitionCase(c.case_id, "enriching", "triaged")
    expect((await findCaseById(c.case_id))?.status).toBe("triaged")
  }, 30_000)

  it("NF-INT-131: transitionCase() throws for illegal new → resolved", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-131", status: "new" })
    await expect(transitionCase(c.case_id, "new", "resolved")).rejects.toThrow(InvalidStateTransitionError)
    expect((await findCaseById(c.case_id))?.status).toBe("new")
  }, 30_000)

  it("NF-INT-132: transitionCase() persists extra fields", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-132", status: "enriching" })
    await transitionCase(c.case_id, "enriching", "triaged", { summary: "AI summary", current_persona: "steward" })
    const updated = await findCaseById(c.case_id)
    expect(updated?.summary).toBe("AI summary")
    expect(updated?.current_persona).toBe("steward")
  }, 30_000)

  it("NF-INT-133: closed case cannot be re-transitioned", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-133", status: "closed" })
    await expect(transitionCase(c.case_id, "closed", "resolved")).rejects.toThrow(InvalidStateTransitionError)
  }, 30_000)

  it("NF-INT-135: CR transition draft → analysis succeeds", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-135", status: "in-change" })
    const cr = await createChangeRequest({ product_id: productId, case_id: c.case_id, title: "CR-135", status: "draft" })
    await transitionChangeRequest(cr.change_request_id, "draft", "analysis")
    expect((await findChangeRequestById(cr.change_request_id))?.status).toBe("analysis")
  }, 30_000)

  it("NF-INT-136: CR transition draft → completed throws", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-136", status: "in-change" })
    const cr = await createChangeRequest({ product_id: productId, case_id: c.case_id, title: "CR-136", status: "draft" })
    await expect(transitionChangeRequest(cr.change_request_id, "draft", "completed")).rejects.toThrow(InvalidStateTransitionError)
    expect((await findChangeRequestById(cr.change_request_id))?.status).toBe("draft")
  }, 30_000)

  it("NF-INT-137: completed CR cannot be re-transitioned", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-137", status: "resolved" })
    const cr = await createChangeRequest({ product_id: productId, case_id: c.case_id, title: "CR-137", status: "completed" })
    await expect(transitionChangeRequest(cr.change_request_id, "completed", "pr-drafted")).rejects.toThrow(InvalidStateTransitionError)
  }, 30_000)

  it("NF-INT-138: CR transition persists extra fields", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-138", status: "in-change" })
    const cr = await createChangeRequest({ product_id: productId, case_id: c.case_id, title: "CR-138", status: "analysis" })
    await transitionChangeRequest(cr.change_request_id, "analysis", "approval-pending", { impact_summary: "High impact", risk_level: "high" })
    const updated = await findChangeRequestById(cr.change_request_id)
    expect(updated?.impact_summary).toBe("High impact")
    expect(updated?.risk_level).toBe("high")
  }, 30_000)
})
