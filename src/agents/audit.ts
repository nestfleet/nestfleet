/**
 * Audit trail for agent runs — AE-05.
 * ADR-026: every agent invocation produces an immutable record in agent_runs.
 * ADR-028: monthly token usage updated atomically with the agent run record.
 *
 * GDPR note: output_snapshot is GDPR-sensitive.
 * Erasure: set output_snapshot = '{"erased":true,"erasedAt":"..."}'
 * Metadata rows are retained for accounting.
 */

import { getDb } from "../infra/db/client.js"
import { logger } from "../shared/logger.js"
import type { AgentRunRecord } from "./types.js"

/**
 * Write an immutable agent run record.
 * Also increments monthly token usage counters for the product.
 *
 * This is a best-effort write — callers should catch errors and log them.
 */
export async function writeAgentRun(run: AgentRunRecord): Promise<void> {
  const db = getDb()

  // Generate a run ID: ar_<timestamp_hex><random>
  const runId = `ar_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`

  await db.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as unknown as typeof db

    // ── Write agent_runs record ─────────────────────────────────────────────
    await sql`
      INSERT INTO agent_runs (
        id, job_id, product_id, case_id, action_type, outcome,
        abstain_reason, model_id,
        input_tokens, output_tokens, duration_ms,
        evidence_chunk_ids,
        output_schema_version, output_valid, output_snapshot,
        error_code, error_message,
        otel_trace_id, otel_span_id,
        created_at
      ) VALUES (
        ${runId},
        ${run.jobId},
        ${run.productId},
        ${run.caseId ?? null},
        ${run.actionType},
        ${run.outcome},
        ${run.abstainReason ?? null},
        ${run.modelId},
        ${run.inputTokens ?? null},
        ${run.outputTokens ?? null},
        ${run.durationMs ?? null},
        ${run.evidenceChunkIds ? sql.array(run.evidenceChunkIds) : null},
        ${run.outputSchemaVersion ?? null},
        ${run.outputValid ?? null},
        ${run.outputSnapshot ? JSON.parse(JSON.stringify(run.outputSnapshot)) : null},
        ${run.errorCode ?? null},
        ${run.errorMessage ?? null},
        ${run.otelTraceId ?? null},
        ${run.otelSpanId ?? null},
        now()
      )
    `

    // ── Update monthly token usage (ADR-028) ───────────────────────────────
    if (run.inputTokens || run.outputTokens) {
      const monthYear = new Date().toISOString().slice(0, 7)  // 'YYYY-MM'

      await sql`
        INSERT INTO product_llm_usage (
          product_id, action_type, model_id, month_year,
          input_tokens, output_tokens, call_count, updated_at
        ) VALUES (
          ${run.productId},
          ${run.actionType},
          ${run.modelId},
          ${monthYear},
          ${run.inputTokens ?? 0},
          ${run.outputTokens ?? 0},
          1,
          now()
        )
        ON CONFLICT (product_id, action_type, model_id, month_year)
        DO UPDATE SET
          input_tokens = product_llm_usage.input_tokens + EXCLUDED.input_tokens,
          output_tokens = product_llm_usage.output_tokens + EXCLUDED.output_tokens,
          call_count = product_llm_usage.call_count + 1,
          updated_at = now()
      `
    }
  })

  logger.debug(
    { runId, jobId: run.jobId, actionType: run.actionType, outcome: run.outcome },
    "Agent run written",
  )
}

/**
 * Check the current monthly token usage for a product+action type.
 * Returns null if no usage data exists (first call this month).
 * ADR-028: called at dispatch time to enforce budget_hold state.
 */
export async function getMonthlyUsage(
  productId: string,
  actionType: string,
): Promise<{ inputTokens: number; outputTokens: number; callCount: number } | null> {
  const db = getDb()
  const monthYear = new Date().toISOString().slice(0, 7)

  type Row = { input_tokens: number; output_tokens: number; call_count: number }

  const [row] = (await db`
    SELECT
      SUM(input_tokens)::int  AS input_tokens,
      SUM(output_tokens)::int AS output_tokens,
      SUM(call_count)::int    AS call_count
    FROM product_llm_usage
    WHERE product_id = ${productId}
      AND action_type = ${actionType}
      AND month_year = ${monthYear}
    GROUP BY product_id, action_type, month_year
  `) as Row[]

  if (!row) return null

  return {
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    callCount: row.call_count ?? 0,
  }
}

/**
 * GDPR erasure: redact the output_snapshot of a specific agent run.
 * Metadata row is retained. Compliance with ADR-026 / ADR-008.
 */
export async function eraseAgentRunOutput(runId: string): Promise<void> {
  const db = getDb()
  const erasedAt = new Date().toISOString()

  await db`
    UPDATE agent_runs
    SET output_snapshot = ${JSON.stringify({ erased: true, erasedAt })}::jsonb
    WHERE id = ${runId}
  `

  logger.info({ runId, erasedAt }, "Agent run output erased (GDPR)")
}
