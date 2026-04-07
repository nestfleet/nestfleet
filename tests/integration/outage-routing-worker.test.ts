/**
 * Integration tests: OutageRoutingWorker — SLICE-17.
 * NF-INT-160 through NF-INT-166.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/agents/impl/outage-routing.js", () => ({
  OUTAGE_ROUTING_SCHEMA_VERSION: "1.0",
  runOutageRoutingAgent: vi.fn(),
}))
vi.mock("../../src/notifications/service.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"
import { OutageRoutingWorker } from "../../src/workers/outage-routing-worker.js"
import { runOutageRoutingAgent } from "../../src/agents/impl/outage-routing.js"
import { NotificationService } from "../../src/notifications/service.js"

const mockAgent = vi.mocked(runOutageRoutingAgent)

function makeJob(caseId: string, productId: string): any {
  return {
    id: "job-test", name: "outage_routing",
    data: { jobId: "job-test", productId, actionType: "outage_routing", caseId, payload: { signalText: "DB down" } },
  }
}

describe("OutageRoutingWorker (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let worker: OutageRoutingWorker

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "Outage Worker Test", stage: "beta",
      support_policy: {}, enabled_channels: ["email"],
      lead_assignments: { support_lead: "s@t.com", product_lead: "p@t.com", change_lead: "c@t.com" },
    })
    productId = product.product_id
    worker = new OutageRoutingWorker()
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })
  beforeEach(() => { vi.clearAllMocks() })

  it("NF-INT-160: success creates case.outage_routed audit event", async () => {
    mockAgent.mockResolvedValueOnce({
      output: { routingTeam: "infra", immediateActions: ["Check DB"] },
      modelId: "test", usage: { inputTokens: 100, outputTokens: 50 }, durationMs: 500, traceId: "t1",
    })
    const c = await createCase({ product_id: productId, title: "NF-INT-160", status: "awaiting-lead", severity: "high" })
    const result = await (worker as any).execute({ job: makeJob(c.case_id, productId), productId, caseId: c.case_id })
    expect(result.outcome).toBe("success")
    const db = getDb()
    const rows = await db`SELECT action FROM audit_events WHERE entity_ref = ${c.case_id} AND action = 'case.outage_routed'`
    expect(rows.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("NF-INT-161: agent failure creates failure audit event", async () => {
    mockAgent.mockRejectedValueOnce(new Error("LLM timeout"))
    const c = await createCase({ product_id: productId, title: "NF-INT-161", status: "awaiting-lead", severity: "critical" })
    const result = await (worker as any).execute({ job: makeJob(c.case_id, productId), productId, caseId: c.case_id })
    expect(result.outcome).toBe("error")
    const db = getDb()
    const rows = await db`SELECT action FROM audit_events WHERE entity_ref = ${c.case_id} AND action = 'case.outage_routing_failed'`
    expect(rows.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("NF-INT-162: agent failure notifies all 3 leads", async () => {
    mockAgent.mockRejectedValueOnce(new Error("abstain"))
    const c = await createCase({ product_id: productId, title: "NF-INT-162", status: "awaiting-lead", severity: "critical" })
    const mockNs = { emit: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(NotificationService).mockImplementationOnce(() => mockNs as any)
    await (worker as any).execute({ job: makeJob(c.case_id, productId), productId, caseId: c.case_id })
    const roles = mockNs.emit.mock.calls.map((call: any) => call[0].audienceType)
    expect(roles).toContain("support_lead")
    expect(roles).toContain("product_lead")
    expect(roles).toContain("change_lead")
  }, 30_000)

  it("NF-INT-163: critical severity success notifies all leads", async () => {
    mockAgent.mockResolvedValueOnce({
      output: { routingTeam: "security", immediateActions: [] },
      modelId: "test", usage: { inputTokens: 100, outputTokens: 50 }, durationMs: 500, traceId: "t2",
    })
    const c = await createCase({ product_id: productId, title: "NF-INT-163", status: "awaiting-lead", severity: "critical" })
    const mockNs = { emit: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(NotificationService).mockImplementationOnce(() => mockNs as any)
    await (worker as any).execute({ job: makeJob(c.case_id, productId), productId, caseId: c.case_id })
    const roles = mockNs.emit.mock.calls.map((call: any) => call[0].audienceType)
    expect(roles).toContain("support_lead")
    expect(roles).toContain("product_lead")
    expect(roles).toContain("change_lead")
  }, 30_000)

  it("NF-INT-164: low severity success notifies only support_lead", async () => {
    mockAgent.mockResolvedValueOnce({
      output: { routingTeam: "tier1", immediateActions: [] },
      modelId: "test", usage: { inputTokens: 100, outputTokens: 50 }, durationMs: 500, traceId: "t3",
    })
    const c = await createCase({ product_id: productId, title: "NF-INT-164", status: "awaiting-lead", severity: "low" })
    const mockNs = { emit: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(NotificationService).mockImplementationOnce(() => mockNs as any)
    await (worker as any).execute({ job: makeJob(c.case_id, productId), productId, caseId: c.case_id })
    const roles = mockNs.emit.mock.calls.map((call: any) => call[0].audienceType)
    expect(roles).toContain("support_lead")
    expect(roles).not.toContain("product_lead")
  }, 30_000)

  it("NF-INT-165: missing caseId throws", async () => {
    await expect(
      (worker as any).execute({ job: makeJob("", productId), productId, caseId: undefined }),
    ).rejects.toThrow("OutageRoutingWorker: job missing caseId")
  }, 30_000)

  it("NF-INT-166: unknown caseId throws", async () => {
    await expect(
      (worker as any).execute({ job: makeJob("case_nope", productId), productId, caseId: "case_nope" }),
    ).rejects.toThrow(/case not found/)
  }, 30_000)
})
