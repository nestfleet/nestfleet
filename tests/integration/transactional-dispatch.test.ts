/**
 * Integration tests: Transactional dispatch — SLICE-15.
 * NF-INT-170 through NF-INT-175.
 *
 * Note: transitionAndDispatch() inserts into pgboss.job, which requires
 * pg-boss schema. Tests that call transitionAndDispatch directly are skipped
 * unless pgboss schema exists. withTransaction() tests work without pgboss.
 *
 * Pre-validation tests (budget, actionType) are tested via unit tests.
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
import { getDb } from "../../src/infra/db/client.js"
import { withTransaction } from "../../src/infra/db/transaction.js"

describe("Transactional dispatch (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "TxDispatch Test", stage: "beta",
      support_policy: {}, enabled_channels: ["email"], lead_assignments: {},
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-174: withTransaction commits on success", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-174", status: "new" })
    await withTransaction(async (tx) => {
      await tx`UPDATE cases SET status = 'enriching' WHERE case_id = ${c.case_id}`
    })
    expect((await findCaseById(c.case_id))?.status).toBe("enriching")
  }, 30_000)

  it("NF-INT-175: withTransaction rolls back on error", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-175", status: "new" })
    await expect(withTransaction(async (tx) => {
      await tx`UPDATE cases SET status = 'enriching' WHERE case_id = ${c.case_id}`
      throw new Error("Intentional rollback")
    })).rejects.toThrow("Intentional rollback")
    expect((await findCaseById(c.case_id))?.status).toBe("new")
  }, 30_000)

  it("NF-INT-176: withTransaction supports multiple writes atomically", async () => {
    const c1 = await createCase({ product_id: productId, title: "NF-INT-176-a", status: "new" })
    const c2 = await createCase({ product_id: productId, title: "NF-INT-176-b", status: "new" })
    await withTransaction(async (tx) => {
      await tx`UPDATE cases SET status = 'enriching' WHERE case_id = ${c1.case_id}`
      await tx`UPDATE cases SET status = 'triaged' WHERE case_id = ${c2.case_id}`
    })
    expect((await findCaseById(c1.case_id))?.status).toBe("enriching")
    expect((await findCaseById(c2.case_id))?.status).toBe("triaged")
  }, 30_000)

  it("NF-INT-177: withTransaction rolls back ALL writes on error", async () => {
    const c1 = await createCase({ product_id: productId, title: "NF-INT-177-a", status: "new" })
    const c2 = await createCase({ product_id: productId, title: "NF-INT-177-b", status: "new" })
    await expect(withTransaction(async (tx) => {
      await tx`UPDATE cases SET status = 'enriching' WHERE case_id = ${c1.case_id}`
      await tx`UPDATE cases SET status = 'triaged' WHERE case_id = ${c2.case_id}`
      throw new Error("Rollback both")
    })).rejects.toThrow("Rollback both")
    expect((await findCaseById(c1.case_id))?.status).toBe("new")
    expect((await findCaseById(c2.case_id))?.status).toBe("new")
  }, 30_000)

  it("NF-INT-178: withTransaction returns callback result on success", async () => {
    const result = await withTransaction(async (tx) => {
      const [row] = await tx`SELECT count(*)::int as cnt FROM cases WHERE product_id = ${productId}`
      return (row as Record<string, unknown>).cnt as number
    })
    expect(typeof result).toBe("number")
    expect(result).toBeGreaterThan(0)
  }, 30_000)
})
