/**
 * Analytics API — SLICE-20.
 *
 * Routes:
 *   GET /api/v1/products/:productId/analytics/overview    — high-level KPIs
 *   GET /api/v1/products/:productId/analytics/cost        — token usage + estimated cost
 *   GET /api/v1/products/:productId/analytics/agents      — per-agent performance
 *   GET /api/v1/products/:productId/analytics/cases       — case volume + resolution stats
 *   GET /api/v1/products/:productId/analytics/memory      — product memory health
 *
 * Auth: requireAuth + requireRole("operator") — admin + operator can view.
 */

import { Hono } from "hono"
import { requireAuth, requireRole, requireTier } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { getDb } from "../../infra/db/client.js"
import { logger } from "../../shared/logger.js"

export const analyticsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Model pricing (USD per 1M tokens) ────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.0-flash":             { input: 0.10,  output: 0.40  },
  "gemini-2.5-flash-preview":     { input: 0.15,  output: 0.60  },
  "gemini-3-flash-preview":       { input: 0.15,  output: 0.60  },
  "gpt-4o":                       { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":                  { input: 0.15,  output: 0.60  },
  "claude-3-5-sonnet-20241022":   { input: 3.00,  output: 15.00 },
  "claude-3-5-haiku-20241022":    { input: 0.80,  output: 4.00  },
  "claude-sonnet-4-20250514":     { input: 3.00,  output: 15.00 },
  "claude-haiku-4-20250414":      { input: 0.80,  output: 4.00  },
  // Self-hosted / unknown — assume zero cost
  default:                        { input: 0,     output: 0     },
}

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING["default"]!
  return (inputTokens * pricing!.input + outputTokens * pricing!.output) / 1_000_000
}

// ── GET /analytics/overview ──────────────────────────────────────────────────

analyticsRouter.get(
  "/products/:productId/analytics/overview",
  requireAuth(),
  requireRole("operator"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      type CountRow = { cnt: number }
      type SumRow = { input_tokens: number; output_tokens: number; call_count: number }

      const cnt = (rows: CountRow[]) => rows[0]?.cnt ?? 0

      const casesTotalCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM cases WHERE product_id = ${productId}`)
      const casesResolvedCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM cases WHERE product_id = ${productId} AND status = 'resolved'`)
      const casesClosedCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM cases WHERE product_id = ${productId} AND status = 'closed'`)
      const casesOpenCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM cases WHERE product_id = ${productId} AND status NOT IN ('resolved', 'closed')`)

      // AI-resolved count (all audit event actors are agent/system)
      const aiResolved = await db<{ case_id: string }[]>`
        SELECT c.case_id
        FROM cases c
        WHERE c.product_id = ${productId}
          AND c.status IN ('resolved', 'closed')
          AND NOT EXISTS (
            SELECT 1 FROM audit_events ae
            WHERE ae.entity_ref = c.case_id
              AND ae.entity_type = 'case'
              AND ae.actor_type IN ('lead', 'user')
          )
      `

      const monthYear = new Date().toISOString().slice(0, 7)
      const [tokenUsage] = await db<SumRow[]>`
        SELECT
          COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
          COALESCE(SUM(call_count), 0)::int AS call_count
        FROM product_llm_usage
        WHERE product_id = ${productId} AND month_year = ${monthYear}
      `

      // Estimate cost from all usage rows this month
      const usageRows = await db<{ model_id: string; input_tokens: number; output_tokens: number }[]>`
        SELECT model_id, input_tokens::int, output_tokens::int
        FROM product_llm_usage
        WHERE product_id = ${productId} AND month_year = ${monthYear}
      `
      const totalCost = usageRows.reduce((sum, r) => sum + estimateCost(r.model_id, r.input_tokens, r.output_tokens), 0)

      const notifCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM notifications WHERE product_id = ${productId}`)
      const crCnt = cnt(await db<CountRow[]>`SELECT count(*)::int AS cnt FROM change_requests WHERE product_id = ${productId}`)

      const automationRate = casesTotalCnt > 0
        ? Math.round((aiResolved.length / casesTotalCnt) * 100)
        : 0

      return c.json({
        ok: true,
        data: {
          period: monthYear,
          cases: {
            total: casesTotalCnt,
            open: casesOpenCnt,
            resolved: casesResolvedCnt,
            closed: casesClosedCnt,
            aiResolved: aiResolved.length,
            automationRate,
          },
          tokens: {
            input: tokenUsage?.input_tokens ?? 0,
            output: tokenUsage?.output_tokens ?? 0,
            total: (tokenUsage?.input_tokens ?? 0) + (tokenUsage?.output_tokens ?? 0),
            agentCalls: tokenUsage?.call_count ?? 0,
            estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
          },
          changeRequests: crCnt,
          notifications: notifCnt,
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "analytics/overview failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /analytics/cost ──────────────────────────────────────────────────────

analyticsRouter.get(
  "/products/:productId/analytics/cost",
  requireAuth(),
  requireRole("operator"),
  requireTier("starter"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      type UsageRow = {
        action_type: string
        model_id: string
        month_year: string
        input_tokens: number
        output_tokens: number
        call_count: number
      }

      const rows = await db<UsageRow[]>`
        SELECT action_type, model_id, month_year,
               input_tokens::int, output_tokens::int, call_count::int
        FROM product_llm_usage
        WHERE product_id = ${productId}
        ORDER BY month_year DESC, call_count DESC
      `

      const breakdown = rows.map((r) => ({
        actionType: r.action_type,
        modelId: r.model_id,
        monthYear: r.month_year,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        totalTokens: r.input_tokens + r.output_tokens,
        callCount: r.call_count,
        estimatedCostUsd: Math.round(estimateCost(r.model_id, r.input_tokens, r.output_tokens) * 10000) / 10000,
        avgTokensPerCall: r.call_count > 0
          ? Math.round((r.input_tokens + r.output_tokens) / r.call_count)
          : 0,
      }))

      // Monthly totals
      const byMonth: Record<string, { input: number; output: number; calls: number; cost: number }> = {}
      for (const r of breakdown) {
        if (!byMonth[r.monthYear]) byMonth[r.monthYear] = { input: 0, output: 0, calls: 0, cost: 0 }
        const m = byMonth[r.monthYear]!
        m.input += r.inputTokens
        m.output += r.outputTokens
        m.calls += r.callCount
        m.cost += r.estimatedCostUsd
      }

      const monthlyTotals = Object.entries(byMonth)
        .map(([month, d]) => ({
          month,
          inputTokens: d.input,
          outputTokens: d.output,
          totalTokens: d.input + d.output,
          agentCalls: d.calls,
          estimatedCostUsd: Math.round(d.cost * 10000) / 10000,
        }))
        .sort((a, b) => b.month.localeCompare(a.month))

      return c.json({ ok: true, data: { breakdown, monthlyTotals } })
    } catch (err) {
      logger.error({ err, productId }, "analytics/cost failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /analytics/agents ────────────────────────────────────────────────────

analyticsRouter.get(
  "/products/:productId/analytics/agents",
  requireAuth(),
  requireRole("operator"),
  requireTier("growth"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      type AgentRow = {
        action_type: string
        outcome: string
        cnt: number
        avg_duration_ms: number
        total_input: number
        total_output: number
      }

      const rows = await db<AgentRow[]>`
        SELECT
          action_type,
          outcome,
          count(*)::int AS cnt,
          COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms,
          COALESCE(SUM(input_tokens), 0)::int AS total_input,
          COALESCE(SUM(output_tokens), 0)::int AS total_output
        FROM agent_runs
        WHERE product_id = ${productId}
        GROUP BY action_type, outcome
        ORDER BY action_type, outcome
      `

      // Group by action_type
      const agents: Record<string, {
        totalRuns: number
        successCount: number
        errorCount: number
        abstainCount: number
        avgDurationMs: number
        totalInputTokens: number
        totalOutputTokens: number
        successRate: number
      }> = {}

      for (const r of rows) {
        if (!agents[r.action_type]) {
          agents[r.action_type] = {
            totalRuns: 0, successCount: 0, errorCount: 0, abstainCount: 0,
            avgDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, successRate: 0,
          }
        }
        const a = agents[r.action_type]!
        a.totalRuns += r.cnt
        a.totalInputTokens += r.total_input
        a.totalOutputTokens += r.total_output
        if (r.outcome === "success") {
          a.successCount += r.cnt
          a.avgDurationMs = r.avg_duration_ms
        }
        if (r.outcome === "error") a.errorCount += r.cnt
        if (r.outcome === "abstain") a.abstainCount += r.cnt
      }

      // Compute success rate
      for (const a of Object.values(agents)) {
        a.successRate = a.totalRuns > 0 ? Math.round((a.successCount / a.totalRuns) * 100) : 0
      }

      // Recent errors
      type ErrorRow = { id: string; action_type: string; error_code: string | null; error_message: string | null; created_at: Date }
      const recentErrors = await db<ErrorRow[]>`
        SELECT id, action_type, error_code, error_message, created_at
        FROM agent_runs
        WHERE product_id = ${productId} AND outcome = 'error'
        ORDER BY created_at DESC
        LIMIT 10
      `

      return c.json({
        ok: true,
        data: {
          agents,
          recentErrors: recentErrors.map((e) => ({
            id: e.id,
            actionType: e.action_type,
            errorCode: e.error_code,
            errorMessage: e.error_message,
            createdAt: e.created_at,
          })),
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "analytics/agents failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /analytics/cases ─────────────────────────────────────────────────────

analyticsRouter.get(
  "/products/:productId/analytics/cases",
  requireAuth(),
  requireRole("operator"),
  requireTier("growth"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      // Cases by status
      type StatusRow = { status: string; cnt: number }
      const byStatus = await db<StatusRow[]>`
        SELECT status, count(*)::int AS cnt
        FROM cases
        WHERE product_id = ${productId}
        GROUP BY status
        ORDER BY cnt DESC
      `

      // Cases by type
      type TypeRow = { type: string | null; cnt: number }
      const byType = await db<TypeRow[]>`
        SELECT type, count(*)::int AS cnt
        FROM cases
        WHERE product_id = ${productId}
        GROUP BY type
        ORDER BY cnt DESC
      `

      // Cases by severity
      type SeverityRow = { severity: string | null; cnt: number }
      const bySeverity = await db<SeverityRow[]>`
        SELECT severity, count(*)::int AS cnt
        FROM cases
        WHERE product_id = ${productId}
        GROUP BY severity
        ORDER BY cnt DESC
      `

      // Daily case volume (last 30 days)
      type DailyRow = { day: string; created: number; resolved: number }
      const daily = await db<DailyRow[]>`
        SELECT
          d.day::text,
          COALESCE(c.created, 0)::int AS created,
          COALESCE(r.resolved, 0)::int AS resolved
        FROM generate_series(
          current_date - interval '29 days',
          current_date,
          interval '1 day'
        ) AS d(day)
        LEFT JOIN (
          SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS created
          FROM cases WHERE product_id = ${productId}
          GROUP BY 1
        ) c ON c.day = d.day::date
        LEFT JOIN (
          SELECT date_trunc('day', ae.occurred_at)::date AS day, count(*)::int AS resolved
          FROM audit_events ae
          WHERE ae.product_id = ${productId}
            AND ae.action = 'case.resolved'
          GROUP BY 1
        ) r ON r.day = d.day::date
        ORDER BY d.day
      `

      // Avg resolution time (from case.created → case.resolved audit event)
      type AvgRow = { avg_hours: number | null }
      const [avgResolution] = await db<AvgRow[]>`
        SELECT
          EXTRACT(EPOCH FROM AVG(ae.occurred_at - c.created_at)) / 3600 AS avg_hours
        FROM cases c
        JOIN audit_events ae ON ae.entity_ref = c.case_id AND ae.action = 'case.resolved'
        WHERE c.product_id = ${productId}
          AND c.status IN ('resolved', 'closed')
      `

      return c.json({
        ok: true,
        data: {
          byStatus: byStatus.map((r) => ({ status: r.status, count: r.cnt })),
          byType: byType.map((r) => ({ type: r.type ?? "unclassified", count: r.cnt })),
          bySeverity: bySeverity.map((r) => ({ severity: r.severity ?? "unclassified", count: r.cnt })),
          daily,
          avgResolutionHours: avgResolution?.avg_hours != null
            ? Math.round(avgResolution.avg_hours * 10) / 10
            : null,
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "analytics/cases failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /analytics/memory ────────────────────────────────────────────────────

analyticsRouter.get(
  "/products/:productId/analytics/memory",
  requireAuth(),
  requireRole("operator"),
  requireTier("growth"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      type MemRow = {
        total_chunks: number
        total_sources: number
        embedded_chunks: number
        conflict_chunks: number
        t1_chunks: number
        t2_chunks: number
        t3_chunks: number
        avg_freshness: number | null
      }

      const [stats] = await db<MemRow[]>`
        SELECT
          count(*)::int AS total_chunks,
          count(DISTINCT source_uri)::int AS total_sources,
          count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded_chunks,
          count(*) FILTER (WHERE conflict_flag = true)::int AS conflict_chunks,
          count(*) FILTER (WHERE tier = 1)::int AS t1_chunks,
          count(*) FILTER (WHERE tier = 2)::int AS t2_chunks,
          count(*) FILTER (WHERE tier = 3)::int AS t3_chunks,
          AVG(freshness_score) AS avg_freshness
        FROM memory_chunks
        WHERE product_id = ${productId}
      `

      // By source type
      type SourceRow = { source_type: string; cnt: number }
      const bySourceType = await db<SourceRow[]>`
        SELECT source_type, count(*)::int AS cnt
        FROM memory_chunks
        WHERE product_id = ${productId}
        GROUP BY source_type
        ORDER BY cnt DESC
      `

      return c.json({
        ok: true,
        data: {
          totalChunks: stats?.total_chunks ?? 0,
          totalSources: stats?.total_sources ?? 0,
          embeddedChunks: stats?.embedded_chunks ?? 0,
          embeddingCoverage: (stats?.total_chunks ?? 0) > 0
            ? Math.round(((stats?.embedded_chunks ?? 0) / stats!.total_chunks) * 100)
            : 0,
          conflictChunks: stats?.conflict_chunks ?? 0,
          tierDistribution: { t1: stats?.t1_chunks ?? 0, t2: stats?.t2_chunks ?? 0, t3: stats?.t3_chunks ?? 0 },
          avgFreshness: stats?.avg_freshness != null ? Math.round(stats.avg_freshness * 100) / 100 : null,
          bySourceType: bySourceType.map((r) => ({ sourceType: r.source_type, count: r.cnt })),
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "analytics/memory failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /analytics/operations ────────────────────────────────────────────────
// Human-side operational metrics: approval response time, queue depth,
// rejection rate, escalation rate, manual triage rate.
// Aggregate only — no per-user breakdown.

analyticsRouter.get(
  "/products/:productId/analytics/operations",
  requireAuth(),
  requireRole("operator"),
  requireTier("growth"),
  async (c) => {
    const productId = c.req.param("productId")

    try {
      const db = getDb()

      // ── Approval response time (hours) ─────────────────────────────────────
      // Time between cr.approval_requested → cr.approved or cr.rejected
      type AvgRow = { avg_hours: number | null }
      const [approvalTime] = await db<AvgRow[]>`
        SELECT
          EXTRACT(EPOCH FROM AVG(response.occurred_at - request.occurred_at)) / 3600 AS avg_hours
        FROM audit_events request
        JOIN audit_events response
          ON  response.entity_ref = request.entity_ref
          AND response.entity_type = 'change_request'
          AND response.action IN ('cr.approved', 'cr.rejected')
          AND response.occurred_at > request.occurred_at
        WHERE request.product_id = ${productId}
          AND request.entity_type = 'change_request'
          AND request.action = 'cr.approval_requested'
      `

      // ── Current queue depth ────────────────────────────────────────────────
      type CountRow = { cnt: number }
      const cnt = (rows: CountRow[]) => rows[0]?.cnt ?? 0

      const queueDepth = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt
        FROM change_requests
        WHERE product_id = ${productId} AND status = 'approval-pending'
      `)

      // ── Queue depth over time (30 days, approximate via audit events) ─────
      // Count cr.approval_requested events per day as proxy for queue inflow
      type DailyRow = { day: string; requested: number; acted: number }
      const queueDaily = await db<DailyRow[]>`
        SELECT
          d.day::text,
          COALESCE(req.cnt, 0)::int AS requested,
          COALESCE(act.cnt, 0)::int AS acted
        FROM generate_series(
          current_date - interval '29 days',
          current_date,
          interval '1 day'
        ) AS d(day)
        LEFT JOIN (
          SELECT date_trunc('day', occurred_at)::date AS day, count(*)::int AS cnt
          FROM audit_events
          WHERE product_id = ${productId} AND action = 'cr.approval_requested'
          GROUP BY 1
        ) req ON req.day = d.day::date
        LEFT JOIN (
          SELECT date_trunc('day', occurred_at)::date AS day, count(*)::int AS cnt
          FROM audit_events
          WHERE product_id = ${productId} AND action IN ('cr.approved', 'cr.rejected')
          GROUP BY 1
        ) act ON act.day = d.day::date
        ORDER BY d.day
      `

      // ── Rejection rate ─────────────────────────────────────────────────────
      const approvedCnt = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt FROM audit_events
        WHERE product_id = ${productId} AND action = 'cr.approved'
      `)
      const rejectedCnt = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt FROM audit_events
        WHERE product_id = ${productId} AND action = 'cr.rejected'
      `)
      const totalDecisions = approvedCnt + rejectedCnt
      const rejectionRate = totalDecisions > 0
        ? Math.round((rejectedCnt / totalDecisions) * 100)
        : 0

      // ── Manual triage rate ─────────────────────────────────────────────────
      // case.triaged events where actor_type = 'lead' (human override) vs total
      const totalTriaged = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt FROM audit_events
        WHERE product_id = ${productId} AND action = 'case.triaged'
      `)
      const manualTriaged = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt FROM audit_events
        WHERE product_id = ${productId} AND action = 'case.triaged' AND actor_type = 'lead'
      `)
      const manualTriageRate = totalTriaged > 0
        ? Math.round((manualTriaged / totalTriaged) * 100)
        : 0

      // ── Escalation rate ────────────────────────────────────────────────────
      // Cases that ever reached awaiting-lead vs total cases
      const totalCases = cnt(await db<CountRow[]>`
        SELECT count(*)::int AS cnt FROM cases WHERE product_id = ${productId}
      `)
      const escalatedCases = cnt(await db<CountRow[]>`
        SELECT count(DISTINCT entity_ref)::int AS cnt
        FROM audit_events
        WHERE product_id = ${productId}
          AND entity_type = 'case'
          AND action IN ('case.escalated', 'case.routed')
          AND (after_state->>'status' = 'awaiting-lead' OR action = 'case.escalated')
      `)
      const escalationRate = totalCases > 0
        ? Math.round((escalatedCases / totalCases) * 100)
        : 0

      // ── Time to first human action after escalation ────────────────────────
      const [firstHumanAction] = await db<AvgRow[]>`
        SELECT
          EXTRACT(EPOCH FROM AVG(human.occurred_at - escalation.occurred_at)) / 3600 AS avg_hours
        FROM audit_events escalation
        JOIN LATERAL (
          SELECT occurred_at
          FROM audit_events ae2
          WHERE ae2.entity_ref = escalation.entity_ref
            AND ae2.entity_type = 'case'
            AND ae2.actor_type = 'lead'
            AND ae2.occurred_at > escalation.occurred_at
          ORDER BY ae2.occurred_at ASC
          LIMIT 1
        ) human ON true
        WHERE escalation.product_id = ${productId}
          AND escalation.entity_type = 'case'
          AND escalation.action IN ('case.escalated', 'case.routed')
      `

      return c.json({
        ok: true,
        data: {
          approvalResponseTime: {
            avgHours: approvalTime?.avg_hours != null
              ? Math.round(approvalTime.avg_hours * 10) / 10
              : null,
          },
          queue: {
            currentDepth: queueDepth,
            daily: queueDaily,
          },
          rejectionRate: {
            rate: rejectionRate,
            approved: approvedCnt,
            rejected: rejectedCnt,
            total: totalDecisions,
          },
          manualTriage: {
            rate: manualTriageRate,
            manual: manualTriaged,
            total: totalTriaged,
          },
          escalation: {
            rate: escalationRate,
            escalated: escalatedCases,
            totalCases,
          },
          firstHumanResponseTime: {
            avgHours: firstHumanAction?.avg_hours != null
              ? Math.round(firstHumanAction.avg_hours * 10) / 10
              : null,
          },
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "analytics/operations failed")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)
