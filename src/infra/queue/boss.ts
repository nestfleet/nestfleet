// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * pg-boss singleton — AE-04.
 * ADR-025: pg-boss (PostgreSQL-backed job queue), pg-boss v12.
 *
 * Provides a lazily-initialized pg-boss instance used by the dispatcher
 * and all workers. The same PG connection string is used as the main DB
 * (zero new infrastructure).
 *
 * Dead-letter queue (QE-02):
 *   Every agent queue is created with a shared DLQ ("agent_jobs_dlq").
 *   When a job exhausts all retries, pg-boss copies it into the DLQ.
 *   registerDeadLetterHandler() must be called once at startup (after all
 *   queues are registered) to consume DLQ entries and log them at error level.
 *
 * QE-05: DLQ handler extended to mark associated cases as "processing-failed"
 *   so operators see a visible failure rather than a silently-stuck case.
 */

import { PgBoss } from "pg-boss"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { updateCase, findCaseById } from "../db/repositories/cases.js"
import { createAuditEvent } from "../db/repositories/audit-events.js"

let _boss: PgBoss | null = null
// Promise-based init lock: all concurrent callers await the same Promise,
// guaranteeing exactly one PgBoss instance even under parallel worker registration.
let _initPromise: Promise<PgBoss> | null = null

/** Name of the shared dead-letter queue for all agent job queues. */
export const AGENT_DLQ_NAME = "agent_jobs_dlq"

/**
 * Return the pg-boss singleton, starting it on first call.
 * Safe to call multiple times concurrently — the Promise lock ensures
 * exactly one instance is created even when called from parallel worker registration.
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const boss = new PgBoss({
      connectionString: config.DATABASE_URL,
      // Reduce polling interval to keep queue responsive
      monitorIntervalSeconds: 30,
      // Let pg-boss manage its own schema migrations
      migrate: true,
    })

    boss.on("error", (err: Error) => {
      logger.error({ err: err.message }, "pg-boss error")
    })

    await boss.start()
    _boss = boss

    logger.info("pg-boss started")
    return boss
  })()

  return _initPromise
}

/**
 * Register a worker on the shared dead-letter queue.
 *
 * For every dead-lettered job:
 *   1. Logs at error level for observability/alerting (QE-02).
 *   2. If the job has a caseId, marks the case as "processing-failed" with
 *      failure context in the processing_error JSONB column (QE-05).
 *   3. Emits a case.processing_failed audit event (QE-05).
 *
 * Call once at startup after all agent queues have been created, so the DLQ
 * queue itself is guaranteed to exist before `boss.work()` is registered.
 *
 * pg-boss v12 DLQ pattern: each agent queue is created with `deadLetter: AGENT_DLQ_NAME`.
 * When a job exhausts retries, pg-boss copies the job payload into the DLQ.
 */
export async function registerDeadLetterHandler(): Promise<void> {
  const boss = await getBoss()

  // Ensure the DLQ queue exists before registering a worker on it.
  await boss.createQueue(AGENT_DLQ_NAME)

  await boss.work<Record<string, unknown>>(
    AGENT_DLQ_NAME,
    { localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const payload = job.data
        // Extract common fields from the AgentJobData payload if present.
        // caseId and actionType are top-level fields in AgentJobData.
        const jobName  = (payload["actionType"] as string | undefined) ?? job.name
        const caseId   = (payload["caseId"] as string | undefined) ?? undefined
        const crId     = (payload["changeRequestId"] as string | undefined) ?? undefined

        // job.output holds the serialised error from the last failed attempt
        // in pg-boss v12; fall back to payload-embedded fields for older shapes.
        const jobOutput = (job as unknown as Record<string, unknown>)["output"] as Record<string, unknown> | null | undefined
        const errorMsg  =
          (jobOutput?.["message"] as string | undefined) ??
          (payload["error"] as string | undefined) ??
          (payload["errorMessage"] as string | undefined) ??
          "unknown error"

        // ── 1. Structured error log (QE-02) ────────────────────────────────
        logger.error(
          {
            dlqJobId: job.id,
            jobName,
            caseId,
            crId,
            error:    errorMsg,
            payload,
          },
          "Agent job dead-lettered after all retries exhausted",
        )

        // ── 2. Mark case as processing-failed (QE-05) ──────────────────────
        if (caseId) {
          await _markCaseProcessingFailed({
            caseId,
            jobName,
            jobId:    job.id,
            errorMsg,
            productId: payload["productId"] as string | undefined,
          })
        }

        // ── 3. Change request: no "analysis-failed" status exists yet ──────
        // CR status schema does not include a failure state; skip CR update.
        // Track in: https://github.com/nestfleet/nestfleet/issues (QE-05 follow-up)
        if (crId && !caseId) {
          logger.warn(
            { dlqJobId: job.id, crId, jobName },
            "Dead-lettered job has changeRequestId but no caseId — no CR status update (no failure state defined)",
          )
        }
      }
    },
  )

  logger.info({ queue: AGENT_DLQ_NAME }, "Dead-letter queue handler registered")
}

/**
 * Internal helper: set case status to "processing-failed" and emit audit event.
 * Best-effort — errors are logged but not re-thrown so the DLQ job is still
 * consumed (prevents infinite DLQ re-delivery loops).
 */
async function _markCaseProcessingFailed(opts: {
  caseId:    string
  jobName:   string
  jobId:     string
  errorMsg:  string
  productId: string | undefined
}): Promise<void> {
  const { caseId, jobName, jobId, errorMsg } = opts

  try {
    const processingError = { jobName, jobId, error: errorMsg }

    await updateCase(caseId, {
      status:           "processing-failed",
      processing_error: processingError,
    })

    // Resolve productId: prefer job payload field (cheap), fall back to DB read.
    let productId = opts.productId
    if (!productId) {
      const caseRow = await findCaseById(caseId)
      productId = caseRow?.product_id
    }

    if (productId) {
      await createAuditEvent({
        product_id:   productId,
        entity_type:  "case",
        entity_ref:   caseId,
        actor_type:   "system",
        actor_ref:    "dlq/dead-letter-handler",
        action:       "case.processing_failed",
        after_state:  { status: "processing-failed" },
        metadata:     processingError,
      })
    } else {
      logger.warn(
        { caseId, jobName, jobId },
        "DLQ handler: could not resolve productId for audit event — case not found",
      )
    }

    logger.error(
      { caseId, jobName, jobId, error: errorMsg },
      "Case marked as processing-failed after DLQ dead-letter",
    )
  } catch (markErr) {
    // Best-effort: log but do not re-throw. The DLQ job must still be consumed
    // to prevent pg-boss from re-delivering it indefinitely.
    logger.error(
      { markErr, caseId, jobName, jobId },
      "DLQ handler: failed to mark case as processing-failed — case update error",
    )
  }
}

/**
 * Return the current pg-boss lifecycle state for health reporting.
 * "started" means the instance is live and processing jobs.
 * "stopped" means it has not yet started or was shut down.
 */
export function getBossState(): "started" | "stopped" {
  return _boss ? "started" : "stopped"
}

/**
 * Graceful shutdown — call on SIGTERM/SIGINT.
 */
export async function stopBoss(): Promise<void> {
  if (!_boss) return
  logger.info("pg-boss stopping...")
  await _boss.stop()
  _boss = null
  _initPromise = null
  logger.info("pg-boss stopped")
}
