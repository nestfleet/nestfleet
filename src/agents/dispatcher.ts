// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * AgentDispatcher — AE-04.
 * ADR-025: pg-boss transactional enqueue.
 * ADR-024: action type validated against TOOL_SETS_BY_ACTION_TYPE before dispatch.
 * ADR-028: per-product monthly budget check at dispatch time.
 *
 * Usage:
 *   await dispatcher.dispatch({
 *     actionType: "triage",
 *     caseId: "...",
 *     productId: "...",           // authoritative — taken from DB case record
 *     jobId: uuid(),
 *   })
 *
 * The dispatcher validates action type, checks token budget status,
 * and enqueues with a singleton key to prevent duplicate runs.
 */

import { getBoss } from "../infra/queue/boss.js"
import { logger } from "../shared/logger.js"
import { isValidActionType } from "./types.js"
import type { ActionType } from "./types.js"
import { checkBudget } from "./budget.js"
import { TokenBudgetError } from "../shared/errors.js"
import { getLicenseTier } from "../license/validator.js"
import { licenseToProductTier } from "../rbac/permission-engine.js"
import { meetsMinTier } from "../auth/middleware.js"

// Per-queue configuration (ADR-025 / phase2-agentic-engine-design.md §5)
const QUEUE_CONFIG: Record<ActionType, { concurrency: number; retryLimit: number; retryDelaySeconds: number }> = {
  auto_reply:        { concurrency: 5,  retryLimit: 2, retryDelaySeconds: 5  },
  triage:            { concurrency: 10, retryLimit: 2, retryDelaySeconds: 5  },
  known_issue_match: { concurrency: 10, retryLimit: 2, retryDelaySeconds: 5  },
  change_prep:       { concurrency: 3,  retryLimit: 2, retryDelaySeconds: 10 },
  pr_draft_prep:     { concurrency: 2,  retryLimit: 2, retryDelaySeconds: 10 },
  outage_routing:    { concurrency: 5,  retryLimit: 2, retryDelaySeconds: 3  },
  knowledge_capture: { concurrency: 3,  retryLimit: 2, retryDelaySeconds: 5  },
}

// Category C gate (§6.3.4): action types that require Growth tier or higher.
// Dispatch is rejected before budget check or queue insertion.
const GROWTH_GATED_ACTIONS = new Set<ActionType>(["knowledge_capture"])

export interface DispatchOptions {
  /** Action type — must exist in TOOL_SETS_BY_ACTION_TYPE */
  actionType: ActionType
  /** Authoritative product ID from the case DB record — never from job payload */
  productId: string
  /** Case ID the agent run is associated with */
  caseId?: string
  /** Caller-assigned job ID (UUID). Stored in agent_runs.job_id. */
  jobId: string
  /** Any additional action-specific data needed by the worker */
  payload?: Record<string, unknown>
  /** Operator user ID (JWT sub). When set, per-user rate limit is enforced (SEC-JQ1). */
  userId?: string
}

// ── Per-user dispatch rate limit (SEC-JQ1) ────────────────────────────────────
// 10 dispatches / user / actionType / 60 s. Keyed by `${userId}:${actionType}`.
// In-memory — resets on restart, no cross-replica coordination (acceptable for
// single-instance deploy; revisit if horizontal scaling is introduced).
const DISPATCH_RATE_LIMIT    = 10
const DISPATCH_WINDOW_MS     = 60_000
export const dispatchAttempts = new Map<string, number[]>()

function checkDispatchRateLimit(userId: string, actionType: ActionType): void {
  const key  = `${userId}:${actionType}`
  const now  = Date.now()
  const hits = (dispatchAttempts.get(key) ?? []).filter(t => now - t < DISPATCH_WINDOW_MS)
  if (hits.length >= DISPATCH_RATE_LIMIT) {
    throw new Error(
      `Dispatch rate limit exceeded for user ${userId} on action ${actionType} — max ${DISPATCH_RATE_LIMIT} per ${DISPATCH_WINDOW_MS / 1000}s`,
    )
  }
  hits.push(now)
  dispatchAttempts.set(key, hits)
}

export interface AgentJobData {
  jobId: string
  productId: string
  caseId?: string
  actionType: ActionType
  payload: Record<string, unknown> | undefined
}

/**
 * Dispatch an agent job.
 *
 * @throws Error if actionType is not a valid supported action type
 */
export async function dispatch(opts: DispatchOptions): Promise<string> {
  const { actionType, productId, caseId, jobId, payload, userId } = opts

  // ── Per-user rate limit (SEC-JQ1) ─────────────────────────────────────────
  if (userId) checkDispatchRateLimit(userId, actionType)

  // ── Validate action type at dispatch time (ADR-024) ───────────────────────
  if (!isValidActionType(actionType)) {
    throw new Error(
      `Invalid actionType "${actionType}". Dispatch rejected — action type not in TOOL_SETS_BY_ACTION_TYPE.`,
    )
  }

  // ── Category C tier gate (§6.3.4) ─────────────────────────────────────────
  // knowledge_capture requires Growth tier or higher. Reject dispatch early
  // so the budget is not consumed and no job enters the queue.
  if (GROWTH_GATED_ACTIONS.has(actionType)) {
    const currentTier = licenseToProductTier(getLicenseTier())
    if (!meetsMinTier(currentTier, "growth")) {
      throw new Error(
        `Action type "${actionType}" requires Growth tier or higher. Current tier: ${currentTier}.`,
      )
    }
  }

  const queueConfig = QUEUE_CONFIG[actionType]

  // ── Token budget check (AE-13 / ADR-028) ──────────────────────────────────
  const budget = await checkBudget(productId, actionType)
  if (budget.hardLimitExceeded) {
    logger.warn(
      { actionType, productId, currentTokens: budget.currentTokens, hardLimit: budget.hardLimit },
      "Token budget hard limit exceeded — job rejected",
    )
    throw new TokenBudgetError(
      `Monthly token budget hard limit exceeded for ${actionType} (${budget.currentTokens.toLocaleString()} / ${budget.hardLimit.toLocaleString()} tokens)`,
      productId,
      actionType,
      budget.currentTokens,
      budget.hardLimit,
    )
  }
  if (budget.softLimitExceeded) {
    logger.warn(
      { actionType, productId, currentTokens: budget.currentTokens, softLimit: budget.softLimit },
      "Token budget soft limit exceeded — job will proceed but operator should review usage",
    )
  }

  // ── Singleton key: prevents duplicate agent runs on the same case (ADR-025) ──
  const singletonKey = caseId ? `${actionType}:${caseId}` : undefined

  const boss = await getBoss()

  // pg-boss v12: ensure the queue exists before sending (idempotent call).
  await boss.createQueue(actionType)

  const jobData: AgentJobData = {
    jobId,
    productId,
    actionType,
    payload,
    ...(caseId ? { caseId } : {}),
  }

  const options = {
    retryLimit: queueConfig.retryLimit,
    retryDelay: queueConfig.retryDelaySeconds,
    retryBackoff: true,
    ...(singletonKey ? { singletonKey } : {}),
  }

  const id = await boss.send(actionType, jobData, options)

  logger.info(
    { actionType, productId, caseId, jobId, pgBossId: id },
    "Agent job dispatched",
  )

  return id ?? jobId
}

/**
 * Dispatch an agent job inside an existing PostgreSQL transaction — SLICE-15.
 *
 * Inserts directly into the `pgboss.job` table using the transaction SQL instance,
 * ensuring atomicity with whatever DB writes the caller is performing in the same tx.
 *
 * Budget checks and action type validation still apply. Queue creation is skipped
 * (queues are already created by the normal `dispatch()` flow or at startup).
 *
 * @param tx   - postgres.js transaction SQL instance from `withTransaction()`
 * @param opts - Same as `dispatch()`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchInTransaction(
  tx: any,
  opts: DispatchOptions,
): Promise<string> {
  const { actionType, productId, caseId, jobId, payload } = opts

  // ── Validate action type ──────────────────────────────────────────────────
  if (!isValidActionType(actionType)) {
    throw new Error(
      `Invalid actionType "${actionType}". Dispatch rejected — action type not in TOOL_SETS_BY_ACTION_TYPE.`,
    )
  }

  const queueConfig = QUEUE_CONFIG[actionType]

  // ── Token budget check ────────────────────────────────────────────────────
  const budget = await checkBudget(productId, actionType)
  if (budget.hardLimitExceeded) {
    logger.warn(
      { actionType, productId, currentTokens: budget.currentTokens, hardLimit: budget.hardLimit },
      "Token budget hard limit exceeded — job rejected",
    )
    throw new TokenBudgetError(
      `Monthly token budget hard limit exceeded for ${actionType}`,
      productId,
      actionType,
      budget.currentTokens,
      budget.hardLimit,
    )
  }

  // ── Build job data ────────────────────────────────────────────────────────
  const singletonKey = caseId ? `${actionType}:${caseId}` : null

  const jobData: AgentJobData = {
    jobId,
    productId,
    actionType,
    payload,
    ...(caseId ? { caseId } : {}),
  }

  // ── Insert into pgboss.job inside the transaction ─────────────────────────
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO pgboss.job (
      name, data, retry_limit, retry_delay, retry_backoff, singleton_key, state, start_after
    ) VALUES (
      ${actionType},
      ${tx.json(jobData)},
      ${queueConfig.retryLimit},
      ${queueConfig.retryDelaySeconds},
      true,
      ${singletonKey},
      'created',
      now()
    )
    RETURNING id
  `

  const pgBossId = row?.id ?? jobId

  logger.info(
    { actionType, productId, caseId, jobId, pgBossId, transactional: true },
    "Agent job dispatched (transactional)",
  )

  return pgBossId
}
