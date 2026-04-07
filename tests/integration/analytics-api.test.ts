/**
 * Integration tests: Analytics API — SPIKE-09 / SLICE-20.
 *
 * Tests analytics endpoints against a real PostgreSQL container.
 * Seeds cases, agent_runs, product_llm_usage, and memory_chunks
 * to verify all five analytics views return correct aggregations.
 *
 * NF-INT-300 through NF-INT-315.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { createAuditEvent } from "../../src/infra/db/repositories/audit-events.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-analytics", email: "analytics@test.com", roles, productIds: [productId] })
}

describe("Analytics API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name: "Analytics Test Product",
      stage: "beta",
      support_policy: {},
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com" },
    })
    productId = product.product_id

    // Seed 3 cases: 2 resolved, 1 open
    const case1 = await createCase({ product_id: productId, title: "A-Case-1", status: "resolved", type: "bug_report", severity: "high" })
    const case2 = await createCase({ product_id: productId, title: "A-Case-2", status: "resolved", type: "user_request", severity: "normal" })
    await createCase({ product_id: productId, title: "A-Case-3", status: "enriching", type: "outage_report", severity: "critical" })

    // Audit events for resolved cases (AI-only actors → ai_resolved)
    await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: case1.case_id,
      actor_type: "agent", actor_ref: "frontline/triage", action: "case.triaged",
      before_state: {}, after_state: {}, metadata: {},
    })
    await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: case1.case_id,
      actor_type: "agent", actor_ref: "steward/resolve", action: "case.resolved",
      before_state: {}, after_state: {}, metadata: {},
    })
    await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: case2.case_id,
      actor_type: "agent", actor_ref: "auto-reply", action: "case.resolved",
      before_state: {}, after_state: {}, metadata: {},
    })

    // Seed agent_runs + product_llm_usage
    const db = getDb()
    const monthYear = new Date().toISOString().slice(0, 7)

    await db`
      INSERT INTO agent_runs (id, job_id, product_id, case_id, action_type, outcome, model_id, input_tokens, output_tokens, duration_ms, created_at)
      VALUES
        ('ar_test_001', 'job_001', ${productId}, ${case1.case_id}, 'triage', 'success', 'gemini-2.0-flash', 1000, 200, 1500, now()),
        ('ar_test_002', 'job_002', ${productId}, ${case2.case_id}, 'auto_reply', 'success', 'gemini-2.0-flash', 800, 300, 2000, now()),
        ('ar_test_003', 'job_003', ${productId}, ${case1.case_id}, 'triage', 'error', 'gemini-2.0-flash', ${null}, ${null}, 500, now())
    `

    await db`
      INSERT INTO product_llm_usage (product_id, action_type, model_id, month_year, input_tokens, output_tokens, call_count)
      VALUES
        (${productId}, 'triage', 'gemini-2.0-flash', ${monthYear}, 1000, 200, 1),
        (${productId}, 'auto_reply', 'gemini-2.0-flash', ${monthYear}, 800, 300, 1)
    `

    // Seed memory_chunks
    await db`
      INSERT INTO memory_chunks (chunk_id, product_id, source_type, source_uri, tier, section_path, content, content_type, content_hash, source_updated_at, freshness_score, ingested_at, conflict_flag, embedding)
      VALUES
        ('mc_a_001', ${productId}, 'docs', 'docs://readme.md', 1, '# Intro', 'Intro text.', 'prose', 'hash001', now(), 0.95, now(), false, ${null}),
        ('mc_a_002', ${productId}, 'docs', 'docs://readme.md', 1, '## Setup', 'Setup guide.', 'prose', 'hash002', now(), 0.90, now(), false, ${null}),
        ('mc_a_003', ${productId}, 'github', 'github://issues/1', 2, 'Body', 'Issue body.', 'prose', 'hash003', now(), 0.70, now(), true, ${null})
    `
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── Overview ──────────────────────────────────────────────────────────────

  it("NF-INT-300: GET analytics/overview returns correct case counts", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { cases: { total: number; resolved: number; open: number; aiResolved: number; automationRate: number } } }
    expect(body.ok).toBe(true)
    expect(body.data.cases.total).toBe(3)
    expect(body.data.cases.resolved).toBe(2)
    expect(body.data.cases.open).toBe(1)
    expect(body.data.cases.aiResolved).toBe(2) // both resolved cases have only agent actors
    expect(body.data.cases.automationRate).toBe(67) // 2/3 = 66.67 → 67%
  }, 30_000)

  it("NF-INT-301: GET analytics/overview returns token totals", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { tokens: { input: number; output: number; total: number; agentCalls: number; estimatedCostUsd: number } } }
    expect(body.data.tokens.input).toBe(1800) // 1000 + 800
    expect(body.data.tokens.output).toBe(500) // 200 + 300
    expect(body.data.tokens.total).toBe(2300)
    expect(body.data.tokens.agentCalls).toBe(2)
    expect(body.data.tokens.estimatedCostUsd).toBeGreaterThanOrEqual(0)
  }, 30_000)

  it("NF-INT-302: GET analytics/overview returns 403 for support_lead", async () => {
    const token = makeToken(["support_lead"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-303: GET analytics/overview returns 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/analytics/overview`)
    expect(res.status).toBe(401)
  }, 30_000)

  // ── Cost ──────────────────────────────────────────────────────────────────

  it("NF-INT-304: GET analytics/cost returns breakdown by action type and model", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cost`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { breakdown: Array<{ actionType: string; callCount: number }> } }
    expect(body.data.breakdown.length).toBe(2)
    const triage = body.data.breakdown.find((b) => b.actionType === "triage")
    expect(triage).toBeDefined()
    expect(triage!.callCount).toBe(1)
  }, 30_000)

  it("NF-INT-305: GET analytics/cost returns monthly totals", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cost`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { monthlyTotals: Array<{ month: string; totalTokens: number }> } }
    expect(body.data.monthlyTotals.length).toBeGreaterThanOrEqual(1)
    expect(body.data.monthlyTotals[0]!.totalTokens).toBe(2300)
  }, 30_000)

  // ── Agents ────────────────────────────────────────────────────────────────

  it("NF-INT-306: GET analytics/agents returns per-agent performance stats", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { agents: Record<string, { totalRuns: number; successRate: number }> } }
    expect(body.data.agents["triage"]).toBeDefined()
    expect(body.data.agents["triage"]!.totalRuns).toBe(2) // 1 success + 1 error
    expect(body.data.agents["triage"]!.successRate).toBe(50) // 1/2
    expect(body.data.agents["auto_reply"]).toBeDefined()
    expect(body.data.agents["auto_reply"]!.totalRuns).toBe(1)
    expect(body.data.agents["auto_reply"]!.successRate).toBe(100)
  }, 30_000)

  it("NF-INT-307: GET analytics/agents returns recent errors", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { recentErrors: Array<{ actionType: string }> } }
    expect(body.data.recentErrors.length).toBe(1)
    expect(body.data.recentErrors[0]!.actionType).toBe("triage")
  }, 30_000)

  // ── Cases ─────────────────────────────────────────────────────────────────

  it("NF-INT-308: GET analytics/cases returns status distribution", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { byStatus: Array<{ status: string; count: number }>; byType: Array<{ type: string; count: number }> } }
    const resolved = body.data.byStatus.find((s) => s.status === "resolved")
    expect(resolved).toBeDefined()
    expect(resolved!.count).toBe(2)
    const enriching = body.data.byStatus.find((s) => s.status === "enriching")
    expect(enriching?.count).toBe(1)
  }, 30_000)

  it("NF-INT-309: GET analytics/cases returns type distribution", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { byType: Array<{ type: string; count: number }> } }
    expect(body.data.byType.length).toBe(3) // bug_report, user_request, outage_report
  }, 30_000)

  it("NF-INT-310: GET analytics/cases returns daily volume array", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { daily: Array<{ day: string; created: number; resolved: number }> } }
    expect(body.data.daily.length).toBe(30) // 30-day window
  }, 30_000)

  // ── Memory ────────────────────────────────────────────────────────────────

  it("NF-INT-311: GET analytics/memory returns chunk statistics", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { totalChunks: number; totalSources: number; conflictChunks: number; embeddingCoverage: number } }
    expect(body.data.totalChunks).toBe(3)
    expect(body.data.totalSources).toBe(2) // readme.md + issues/1
    expect(body.data.conflictChunks).toBe(1) // github issue has conflict
    expect(body.data.embeddingCoverage).toBe(0) // all embeddings are null
  }, 30_000)

  it("NF-INT-312: GET analytics/memory returns tier distribution", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { tierDistribution: { t1: number; t2: number; t3: number } } }
    expect(body.data.tierDistribution.t1).toBe(2)
    expect(body.data.tierDistribution.t2).toBe(1)
    expect(body.data.tierDistribution.t3).toBe(0)
  }, 30_000)

  it("NF-INT-313: GET analytics/memory returns source type breakdown", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { bySourceType: Array<{ sourceType: string; count: number }> } }
    expect(body.data.bySourceType.length).toBe(2)
    const docs = body.data.bySourceType.find((s) => s.sourceType === "docs")
    expect(docs?.count).toBe(2)
  }, 30_000)

  // ── RBAC ──────────────────────────────────────────────────────────────────

  it("NF-INT-314: GET analytics/memory returns 403 for change_lead", async () => {
    const token = makeToken(["change_lead"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-315: GET analytics/cost returns 403 for knowledge_lead", async () => {
    const token = makeToken(["knowledge_lead"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/cost`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── Operations ──────────────────────────────────────────────────────────

  it("NF-INT-316: GET analytics/operations returns approval response time", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/operations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { approvalResponseTime: { avgHours: number | null } } }
    expect(body.ok).toBe(true)
    expect(body.data.approvalResponseTime).toBeDefined()
  }, 30_000)

  it("NF-INT-317: GET analytics/operations returns queue depth and daily flow", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/operations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { queue: { currentDepth: number; daily: Array<{ day: string }> } } }
    expect(typeof body.data.queue.currentDepth).toBe("number")
    expect(body.data.queue.daily.length).toBe(30) // 30-day window
  }, 30_000)

  it("NF-INT-318: GET analytics/operations returns rejection and escalation rates", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/operations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rejectionRate: { rate: number }; escalation: { rate: number }; manualTriage: { rate: number } } }
    expect(typeof body.data.rejectionRate.rate).toBe("number")
    expect(typeof body.data.escalation.rate).toBe("number")
    expect(typeof body.data.manualTriage.rate).toBe("number")
  }, 30_000)

  it("NF-INT-319: GET analytics/operations returns 403 for support_lead", async () => {
    const token = makeToken(["support_lead"], productId)
    const res = await app.request(`/api/v1/products/${productId}/analytics/operations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)
})
