// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Per-product LLM token budget enforcement — AE-13.
 * ADR-028: soft/hard limits enforced at dispatch time.
 *
 * Two tiers:
 *   Soft limit → product status = budget_hold, operator notification logged.
 *                Job proceeds (soft limit is a warning).
 *   Hard limit → job rejected at dispatch time.
 *
 * Limits are configurable per product via product_llm_budget table (future).
 * Default limits apply when no product-specific limits are set.
 *
 * Usage (call from dispatcher before enqueuing):
 *   const status = await checkBudget(productId, actionType)
 *   if (status.hardLimitExceeded) throw new TokenBudgetError(...)
 *   if (status.softLimitExceeded) notifyOperator(...)
 */

import { getDb } from "../infra/db/client.js"
import { logger } from "../shared/logger.js"
import type { ActionType } from "./types.js"

// ── Default monthly limits ────────────────────────────────────────────────────
// Total tokens (input + output) per product per month, per action type.
// These are conservative defaults. Operators can raise or lower per product.

const DEFAULT_SOFT_LIMIT_TOKENS: Record<ActionType, number> = {
  auto_reply:        500_000,
  triage:            300_000,
  known_issue_match: 200_000,
  change_prep:       150_000,
  pr_draft_prep:     100_000,
  outage_routing:    200_000,
  knowledge_capture: 400_000,
}

const DEFAULT_HARD_LIMIT_TOKENS: Record<ActionType, number> = {
  auto_reply:        2_000_000,
  triage:            1_000_000,
  known_issue_match: 800_000,
  change_prep:       600_000,
  pr_draft_prep:     400_000,
  outage_routing:    800_000,
  knowledge_capture: 1_500_000,
}

export interface BudgetStatus {
  /** True if hard limit exceeded — job must be rejected */
  hardLimitExceeded: boolean
  /** True if soft limit exceeded — operator should be notified but job proceeds */
  softLimitExceeded: boolean
  /** Current month token consumption for this product+action */
  currentTokens: number
  /** Active soft limit in tokens */
  softLimit: number
  /** Active hard limit in tokens */
  hardLimit: number
  /** Month being tracked (YYYY-MM) */
  monthYear: string
}

/**
 * Check the monthly token budget for a product+action type.
 * Call at dispatch time before enqueuing.
 *
 * @returns BudgetStatus — caller decides how to handle soft vs. hard limits
 */
export async function checkBudget(
  productId: string,
  actionType: ActionType,
): Promise<BudgetStatus> {
  const db = getDb()
  const monthYear = new Date().toISOString().slice(0, 7)  // 'YYYY-MM'

  const softLimit = DEFAULT_SOFT_LIMIT_TOKENS[actionType]
  const hardLimit = DEFAULT_HARD_LIMIT_TOKENS[actionType]

  type UsageRow = { total_tokens: number }

  const [row] = (await db`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS total_tokens
    FROM product_llm_usage
    WHERE product_id = ${productId}
      AND action_type = ${actionType}
      AND month_year = ${monthYear}
  `) as UsageRow[]

  const currentTokens = Number(row?.total_tokens ?? 0)

  const hardLimitExceeded = currentTokens >= hardLimit
  const softLimitExceeded = currentTokens >= softLimit

  if (hardLimitExceeded) {
    logger.warn(
      { productId, actionType, currentTokens, hardLimit, monthYear },
      "Agent job rejected: hard token budget exceeded",
    )
  } else if (softLimitExceeded) {
    logger.warn(
      { productId, actionType, currentTokens, softLimit, monthYear },
      "Agent job soft limit exceeded — operator notification recommended",
    )
  }

  return { hardLimitExceeded, softLimitExceeded, currentTokens, softLimit, hardLimit, monthYear }
}

/**
 * Get usage summary for all action types for a product in the current month.
 * Used for the operator dashboard and health checks.
 */
export async function getProductBudgetSummary(
  productId: string,
): Promise<Array<{
  actionType: string
  modelId: string
  currentTokens: number
  callCount: number
  softLimit: number
  hardLimit: number
  monthYear: string
  softLimitExceeded: boolean
  hardLimitExceeded: boolean
}>> {
  const db = getDb()
  const monthYear = new Date().toISOString().slice(0, 7)

  type SummaryRow = {
    action_type: string
    model_id: string
    input_tokens: number
    output_tokens: number
    call_count: number
  }

  const rows = (await db`
    SELECT action_type, model_id,
           SUM(input_tokens)::bigint AS input_tokens,
           SUM(output_tokens)::bigint AS output_tokens,
           SUM(call_count)::int AS call_count
    FROM product_llm_usage
    WHERE product_id = ${productId}
      AND month_year = ${monthYear}
    GROUP BY action_type, model_id
    ORDER BY action_type
  `) as SummaryRow[]

  return rows.map((r) => {
    const actionType = r.action_type as ActionType
    const currentTokens = Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0)
    const softLimit = DEFAULT_SOFT_LIMIT_TOKENS[actionType] ?? 1_000_000
    const hardLimit = DEFAULT_HARD_LIMIT_TOKENS[actionType] ?? 5_000_000

    return {
      actionType: r.action_type,
      modelId: r.model_id,
      currentTokens,
      callCount: r.call_count,
      softLimit,
      hardLimit,
      monthYear,
      softLimitExceeded: currentTokens >= softLimit,
      hardLimitExceeded: currentTokens >= hardLimit,
    }
  })
}
