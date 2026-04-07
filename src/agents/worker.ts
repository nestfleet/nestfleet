/**
 * AbstractAgentWorker — base class for all agent workers. AE-04.
 * ADR-025: pg-boss worker registration pattern.
 * ADR-023: workers handle state transitions; agents handle LLM inference only.
 * ADR-024: worker reads product_id from the case record — never trusts job payload.
 *
 * Subclasses implement:
 *   - actionType: the queue name this worker handles
 *   - execute(job): the agent invocation logic
 *
 * The base class provides:
 *   - Worker registration with pg-boss
 *   - Dead-letter handling + operator notification
 *   - OTel parent span (agent.run.{actionType})
 *   - Abstain pre-check before calling the agent
 */

import type { Job } from "pg-boss"
import { context, trace, SpanStatusCode } from "@opentelemetry/api"
import { getBoss } from "../infra/queue/boss.js"
import { logger } from "../shared/logger.js"
import type { AgentJobData } from "./dispatcher.js"
import type { ActionType, AgentRunRecord, AgentOutcome } from "./types.js"
import { writeAgentRun } from "./audit.js"
import { recordAgentRun } from "./metrics.js"

// Re-export for worker subclass convenience
export type { AgentJobData }

const TRACER = trace.getTracer("nestfleet.agents")

// Per-queue concurrency (mirrors dispatcher.ts)
const WORKER_CONCURRENCY: Record<ActionType, number> = {
  auto_reply:        5,
  triage:            10,
  known_issue_match: 10,
  change_prep:       3,
  pr_draft_prep:     2,
  outage_routing:    5,
  knowledge_capture: 3,
}

export interface WorkerExecuteContext {
  job: Job<AgentJobData>
  /** Authoritative product ID — read from DB case record by the worker, not from job data. */
  productId: string
  /** Authoritative case ID if applicable. */
  caseId: string | undefined
}

export type WorkerExecuteResult = Pick<
  AgentRunRecord,
  | "outcome"
  | "abstainReason"
  | "modelId"
  | "inputTokens"
  | "outputTokens"
  | "durationMs"
  | "evidenceChunkIds"
  | "outputSchemaVersion"
  | "outputValid"
  | "outputSnapshot"
  | "errorCode"
  | "errorMessage"
  | "otelTraceId"
  | "otelSpanId"
>

export abstract class AbstractAgentWorker {
  abstract readonly actionType: ActionType

  /**
   * Register this worker with pg-boss. Call once at server startup.
   */
  async register(): Promise<void> {
    const boss = await getBoss()
    const concurrency = WORKER_CONCURRENCY[this.actionType]

    // pg-boss v12: queues must be created before work() or send() can use them.
    await boss.createQueue(this.actionType)

    // pg-boss v12: WorkHandler receives Job<T>[] (batch). We process each individually.
    await boss.work<AgentJobData>(
      this.actionType,
      { localConcurrency: concurrency },
      async (jobs: Job<AgentJobData>[]) => {
        await Promise.all(jobs.map((job) => this._handleJob(job)))
      },
    )

    logger.info({ actionType: this.actionType, concurrency }, "Agent worker registered")
  }

  /**
   * Implement in subclass: perform the agent invocation and return the run record fields.
   * The subclass is responsible for:
   *   1. Reading the authoritative product_id from the DB (NOT from job.data.productId)
   *   2. Pre-retrieving the evidence pack (abstain check before calling LLM)
   *   3. Calling runAgent() with the tool set from getToolSet()
   *   4. Post-validation (confidence thresholds, forbidden phrases, etc.)
   *   5. Writing any domain state (triage record, draft reply, etc.)
   */
  protected abstract execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult>

  /**
   * Internal: wraps execute() with OTel span + audit record write + DLQ handling.
   */
  private async _handleJob(job: Job<AgentJobData>): Promise<void> {
    const { jobId, productId, caseId, actionType } = job.data

    const span = TRACER.startSpan(`agent.run.${actionType}`, {
      attributes: {
        "agent.action_type": actionType,
        "agent.product_id": productId,
        "agent.job_id": jobId,
        ...(caseId ? { "agent.case_id": caseId } : {}),
      },
    })

    logger.info({ actionType, productId, caseId, jobId }, "Agent job started")

    const startMs = Date.now()
    let result: WorkerExecuteResult | null = null

    try {
      result = await context.with(trace.setSpan(context.active(), span), () =>
        this.execute({ job, productId, caseId }),
      )

      span.setAttributes({
        "agent.outcome": result.outcome,
        ...(result.modelId ? { "agent.model_id": result.modelId } : {}),
        ...(result.inputTokens != null ? { "agent.input_tokens": result.inputTokens } : {}),
        ...(result.outputTokens != null ? { "agent.output_tokens": result.outputTokens } : {}),
        ...(result.durationMs != null ? { "agent.duration_ms": result.durationMs } : {}),
        ...(result.abstainReason ? { "agent.abstain_reason": result.abstainReason } : {}),
      })
      span.setStatus({ code: SpanStatusCode.OK })

      logger.info({ actionType, productId, caseId, jobId, outcome: result.outcome }, "Agent job complete")
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      logger.error({ err, actionType, productId, caseId, jobId }, "Agent job failed")

      result = {
        outcome: "error" as AgentOutcome,
        modelId: "unknown",
        errorCode: (err as { code?: string }).code ?? "UNKNOWN_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
        otelTraceId: span.spanContext().traceId,
        otelSpanId: span.spanContext().spanId,
      }

      throw err  // Re-throw so pg-boss retries (or dead-letters) the job
    } finally {
      if (result) {
        const durationMs = result.durationMs ?? (Date.now() - startMs)

        const runRecord: AgentRunRecord = {
          jobId,
          productId,
          actionType,
          outcome: result.outcome,
          modelId: result.modelId ?? "unknown",
          durationMs,
          otelTraceId: result.otelTraceId ?? span.spanContext().traceId,
          otelSpanId: result.otelSpanId ?? span.spanContext().spanId,
          ...(caseId ? { caseId } : {}),
          ...(result.abstainReason ? { abstainReason: result.abstainReason } : {}),
          ...(result.inputTokens != null ? { inputTokens: result.inputTokens } : {}),
          ...(result.outputTokens != null ? { outputTokens: result.outputTokens } : {}),
          ...(result.evidenceChunkIds ? { evidenceChunkIds: result.evidenceChunkIds } : {}),
          ...(result.outputSchemaVersion ? { outputSchemaVersion: result.outputSchemaVersion } : {}),
          ...(result.outputValid != null ? { outputValid: result.outputValid } : {}),
          ...(result.outputSnapshot ? { outputSnapshot: result.outputSnapshot } : {}),
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
        }

        // Best-effort audit write — never fail the job over audit record issues
        await writeAgentRun(runRecord).catch((auditErr) => {
          logger.error({ auditErr, jobId, actionType }, "Failed to write agent_run audit record")
        })

        // Record OTel metrics (AE-12)
        recordAgentRun({
          actionType: actionType as ActionType,
          outcome: result.outcome,
          productId,
          durationMs,
          ...(result.modelId ? { modelId: result.modelId } : {}),
          ...(result.inputTokens != null ? { inputTokens: result.inputTokens } : {}),
          ...(result.outputTokens != null ? { outputTokens: result.outputTokens } : {}),
          ...(result.abstainReason ? { abstainReason: result.abstainReason } : {}),
        })
      }

      span.end()
    }
  }
}
