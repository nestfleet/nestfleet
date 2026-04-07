/**
 * Integration tests: writeAgentRun persistence — AE-05.
 *
 * Tests that agent run records are correctly written and retrievable from the
 * database. No HTTP layer, no LLM calls.
 *
 * NF-INT-60 through NF-INT-65.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { writeAgentRun } from "../../src/agents/audit.js"
import {
  findAgentRunById,
  findAgentRunsByCaseId,
} from "../../src/infra/db/repositories/agent-runs.js"
import { getDb } from "../../src/infra/db/client.js"
import type { AgentRunRecord } from "../../src/agents/types.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunRecord(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    jobId:               `job_test_${Date.now()}`,
    productId:           "prod_test",
    caseId:              "case_test",
    actionType:          "triage",
    outcome:             "success",
    modelId:             "claude-3-5-sonnet-20241022",
    inputTokens:         1000,
    outputTokens:        200,
    durationMs:          1234,
    outputSchemaVersion: "1.0",
    outputValid:         true,
    outputSnapshot:      { test: true },
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("writeAgentRun persistence (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-60: inserts record in agent_runs ────────────────────────────────

  it("NF-INT-60: writeAgentRun inserts a record in agent_runs", async () => {
    const run = makeRunRecord()
    await writeAgentRun(run)

    const db = getDb()
    const rows = await db`
      SELECT * FROM agent_runs WHERE job_id = ${run.jobId}
    ` as Array<Record<string, unknown>>

    expect(rows.length).toBe(1)
    expect(rows[0].job_id).toBe(run.jobId)
    expect(rows[0].product_id).toBe(run.productId)
    expect(rows[0].case_id).toBe(run.caseId)
    expect(rows[0].action_type).toBe(run.actionType)
    expect(rows[0].outcome).toBe(run.outcome)
    expect(rows[0].model_id).toBe(run.modelId)
  }, 30_000)

  // ── NF-INT-61: updates product_llm_usage ─────────────────────────────────

  it("NF-INT-61: writeAgentRun updates product_llm_usage", async () => {
    const productId = `prod_usage_test_${Date.now()}`
    const run = makeRunRecord({
      jobId:       `job_usage_${Date.now()}`,
      productId,
      inputTokens:  500,
      outputTokens: 100,
    })

    await writeAgentRun(run)

    const db = getDb()
    const rows = await db`
      SELECT * FROM product_llm_usage
      WHERE product_id = ${productId}
        AND action_type = ${run.actionType}
    ` as Array<Record<string, unknown>>

    expect(rows.length).toBe(1)
    expect(Number(rows[0].input_tokens)).toBe(500)
    expect(Number(rows[0].output_tokens)).toBe(100)
    expect(Number(rows[0].call_count)).toBe(1)
  }, 30_000)

  // ── NF-INT-62: findAgentRunsByCaseId ─────────────────────────────────────

  it("NF-INT-62: findAgentRunsByCaseId returns runs for the case ordered by created_at", async () => {
    const caseId = `case_agg_${Date.now()}`

    const run1 = makeRunRecord({ jobId: `job_agg_1_${Date.now()}`, caseId })
    await writeAgentRun(run1)

    // Small delay to ensure distinct created_at timestamps
    await new Promise((resolve) => setTimeout(resolve, 10))

    const run2 = makeRunRecord({ jobId: `job_agg_2_${Date.now()}`, caseId })
    await writeAgentRun(run2)

    const runs = await findAgentRunsByCaseId(caseId)
    expect(runs.length).toBeGreaterThanOrEqual(2)

    // Must be ordered by created_at ASC
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].created_at.getTime()).toBeGreaterThanOrEqual(runs[i - 1].created_at.getTime())
    }

    const jobIds = runs.map((r) => r.job_id)
    expect(jobIds).toContain(run1.jobId)
    expect(jobIds).toContain(run2.jobId)
  }, 30_000)

  // ── NF-INT-63: null tokens do not create llm_usage row ───────────────────

  it("NF-INT-63: writeAgentRun with null tokens does not create llm_usage row", async () => {
    const productId = `prod_null_tokens_${Date.now()}`
    const run = makeRunRecord({
      jobId:        `job_null_${Date.now()}`,
      productId,
      inputTokens:  undefined,
      outputTokens: undefined,
    })

    await writeAgentRun(run)

    const db = getDb()
    const rows = await db`
      SELECT * FROM product_llm_usage
      WHERE product_id = ${productId}
    ` as Array<Record<string, unknown>>

    expect(rows.length).toBe(0)
  }, 30_000)

  // ── NF-INT-64: abstain outcome records abstain_reason ────────────────────

  it("NF-INT-64: writeAgentRun for an abstain outcome records abstain_reason", async () => {
    const run = makeRunRecord({
      jobId:        `job_abstain_${Date.now()}`,
      outcome:      "abstain",
      abstainReason: "Confidence below threshold",
    })

    await writeAgentRun(run)

    const db = getDb()
    const rows = await db`
      SELECT abstain_reason, outcome FROM agent_runs WHERE job_id = ${run.jobId}
    ` as Array<{ abstain_reason: string; outcome: string }>

    expect(rows.length).toBe(1)
    expect(rows[0].outcome).toBe("abstain")
    expect(rows[0].abstain_reason).toBe("Confidence below threshold")
  }, 30_000)

  // ── NF-INT-65: output_snapshot is stored and retrievable ─────────────────

  it("NF-INT-65: output_snapshot is stored and retrievable", async () => {
    const snapshot = { replyPreview: "Hello, here is our answer.", autoSend: true, score: 0.95 }
    const run = makeRunRecord({
      jobId:          `job_snapshot_${Date.now()}`,
      outputSnapshot: snapshot,
    })

    await writeAgentRun(run)

    const db = getDb()
    const rows = await db`
      SELECT id FROM agent_runs WHERE job_id = ${run.jobId}
    ` as Array<{ id: string }>
    expect(rows.length).toBe(1)

    const retrieved = await findAgentRunById(rows[0].id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.output_snapshot).toMatchObject(snapshot)
  }, 30_000)
})
