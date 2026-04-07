/**
 * Transactional state transition + dispatch — SLICE-15.
 *
 * Wraps a case state transition AND a job dispatch in a single PostgreSQL
 * transaction. If either fails, both roll back. Eliminates silent stuck states
 * where updateCase succeeds but dispatch fails.
 *
 * Uses raw SQL for both the case update and the pg-boss job insert to keep
 * everything on the same transaction connection.
 */

import postgres from "postgres"
import { getDb } from "../infra/db/client.js"
import { CaseUpdateSchema, type CaseUpdate, type CaseStatus } from "../infra/db/repositories/cases.js"
import { isCaseTransitionAllowed, InvalidStateTransitionError } from "./case-state-machine.js"
import type { DispatchOptions, AgentJobData } from "../agents/dispatcher.js"
import { isValidActionType, type ActionType } from "../agents/types.js"
import { checkBudget } from "../agents/budget.js"
import { TokenBudgetError } from "../shared/errors.js"
import { logger } from "../shared/logger.js"
import { pgJson } from "../infra/db/id.js"

// Per-queue configuration — must match dispatcher.ts
const QUEUE_CONFIG: Record<ActionType, { retryLimit: number; retryDelaySeconds: number }> = {
  auto_reply:        { retryLimit: 2, retryDelaySeconds: 5  },
  triage:            { retryLimit: 2, retryDelaySeconds: 5  },
  known_issue_match: { retryLimit: 2, retryDelaySeconds: 5  },
  change_prep:       { retryLimit: 2, retryDelaySeconds: 10 },
  pr_draft_prep:     { retryLimit: 2, retryDelaySeconds: 10 },
  outage_routing:    { retryLimit: 2, retryDelaySeconds: 3  },
  knowledge_capture: { retryLimit: 2, retryDelaySeconds: 5  },
}

export interface TransitionAndDispatchOptions {
  /** Case to transition */
  caseId: string
  /** Expected current status (null skips read-check) */
  expectedFrom: CaseStatus | null
  /** Target status */
  to: CaseStatus
  /** Additional case update fields */
  extra?: Omit<CaseUpdate, "status">
  /** Job to dispatch atomically with the transition */
  dispatch: DispatchOptions
}

/**
 * Atomically transition a case and dispatch a job in a single PG transaction.
 *
 * If the state transition guard rejects, throws InvalidStateTransitionError.
 * If the dispatch fails (budget, validation), the case update rolls back.
 * If the case update fails, the job is never inserted.
 */
export async function transitionAndDispatch(opts: TransitionAndDispatchOptions): Promise<string> {
  const { caseId, expectedFrom, to, extra = {}, dispatch: dispatchOpts } = opts
  const { actionType, productId, caseId: dispatchCaseId, jobId, payload } = dispatchOpts

  // ── Pre-flight validation (outside transaction for speed) ─────────────────

  if (!isValidActionType(actionType)) {
    throw new Error(`Invalid actionType "${actionType}". Dispatch rejected.`)
  }

  const budget = await checkBudget(productId, actionType)
  if (budget.hardLimitExceeded) {
    throw new TokenBudgetError(
      `Monthly token budget hard limit exceeded for ${actionType}`,
      productId,
      actionType,
      budget.currentTokens,
      budget.hardLimit,
    )
  }

  const queueConfig = QUEUE_CONFIG[actionType]
  const singletonKey = dispatchCaseId ? `${actionType}:${dispatchCaseId}` : null

  const jobData: AgentJobData = {
    jobId,
    productId,
    actionType,
    payload,
    ...(dispatchCaseId ? { caseId: dispatchCaseId } : {}),
  }

  // ── Parse the update fields ───────────────────────────────────────────────
  const v = CaseUpdateSchema.parse({ ...extra, status: to })

  const db = getDb()

  // ── Single transaction: state guard + case update + job insert ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pgBossId = await db.begin(async (tx: any) => {
    // 1. Read current state + guard (SELECT FOR UPDATE to lock the row)
    if (expectedFrom !== null) {
      const [row] = await tx<{ status: string }[]>`
        SELECT status FROM cases WHERE case_id = ${caseId} FOR UPDATE
      `
      if (!row) throw new Error(`transitionAndDispatch: case not found: ${caseId}`)

      const actual = row.status as CaseStatus
      if (actual !== expectedFrom) {
        logger.warn({ caseId, expectedFrom, actual, to }, "transitionAndDispatch: state mismatch")
      }
      if (!isCaseTransitionAllowed(actual, to)) {
        throw new InvalidStateTransitionError("case", caseId, actual, to)
      }
    }

    // 2. Build update SET clause
    const updates: Record<string, unknown> = {}
    if (v.title !== undefined)                updates["title"]                = v.title
    if (v.summary !== undefined)              updates["summary"]              = v.summary
    if (v.reporter_identity_id !== undefined) updates["reporter_identity_id"] = v.reporter_identity_id
    if (v.status !== undefined)               updates["status"]               = v.status
    if (v.type !== undefined)                 updates["type"]                 = v.type
    if (v.severity !== undefined)             updates["severity"]             = v.severity
    if (v.urgency !== undefined)              updates["urgency"]              = v.urgency
    if (v.confidence !== undefined)           updates["confidence"]           = v.confidence
    if (v.current_persona !== undefined)      updates["current_persona"]      = v.current_persona
    if (v.assigned_lead_role !== undefined)   updates["assigned_lead_role"]   = v.assigned_lead_role
    if (v.triage_output !== undefined)        updates["triage_output"]        = tx.json(pgJson(v.triage_output))
    if (v.github_issue_ref !== undefined)     updates["github_issue_ref"]     = v.github_issue_ref
    if (v.resolved_at !== undefined)          updates["resolved_at"]          = v.resolved_at
    if (v.closed_at !== undefined)            updates["closed_at"]            = v.closed_at

    await tx`
      UPDATE cases SET ${tx(updates)} WHERE case_id = ${caseId}
    `

    // 3. Insert pg-boss job in the same transaction
    const [jobRow] = await tx<{ id: string }[]>`
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

    return jobRow?.id ?? jobId
  })

  logger.info(
    { actionType, productId, caseId, jobId, pgBossId, transactional: true },
    "Case transitioned + job dispatched (atomic)",
  )

  return pgBossId
}
