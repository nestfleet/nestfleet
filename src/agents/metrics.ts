/**
 * Agent observability metrics — AE-12.
 * ADR-011 (OTel), phase2-agentic-engine-design.md §8.
 *
 * Metrics:
 *   nestfleet.agent.run.count       — counter: action_type, outcome, product_id
 *   nestfleet.agent.run.duration_ms — histogram: action_type
 *   nestfleet.agent.tokens.input    — histogram: action_type, model_id
 *   nestfleet.agent.tokens.output   — histogram: action_type, model_id
 *   nestfleet.agent.abstain.count   — counter: action_type, abstain_reason, product_id
 *   nestfleet.agent.dlq.count       — observable gauge: action_type (read from DB)
 *
 * All span enrichment is done in worker.ts and run-agent.ts.
 * This module initializes the metric instruments.
 */

import { metrics } from "@opentelemetry/api"
import type { AgentOutcome, ActionType } from "./types.js"

const meter = metrics.getMeter("nestfleet.agents", "1.0.0")

// ── Instruments ──────────────────────────────────────────────────────────────

/** Total agent job completions (success, abstain, error, validation_failure). */
const agentRunCount = meter.createCounter("nestfleet.agent.run.count", {
  description: "Total agent job executions by outcome",
  unit: "1",
})

/** Distribution of agent job wall-clock duration. */
const agentRunDuration = meter.createHistogram("nestfleet.agent.run.duration_ms", {
  description: "Agent job duration from dispatch to completion",
  unit: "ms",
  advice: { explicitBucketBoundaries: [500, 1000, 2000, 5000, 10000, 20000, 40000, 60000, 90000] },
})

/** Distribution of input tokens per agent call (ai v6: inputTokens). */
const agentInputTokens = meter.createHistogram("nestfleet.agent.tokens.input", {
  description: "Input token usage per agent LLM call",
  unit: "tokens",
  advice: { explicitBucketBoundaries: [500, 1000, 2000, 4000, 6000, 8000, 10000, 12000] },
})

/** Distribution of output tokens per agent call. */
const agentOutputTokens = meter.createHistogram("nestfleet.agent.tokens.output", {
  description: "Output token usage per agent LLM call",
  unit: "tokens",
  advice: { explicitBucketBoundaries: [100, 300, 600, 800, 1000, 2000, 3000] },
})

/** Total abstain events — helps tune abstain thresholds. */
const agentAbstainCount = meter.createCounter("nestfleet.agent.abstain.count", {
  description: "Total agent abstain events by reason",
  unit: "1",
})

// ── Public recording functions ────────────────────────────────────────────────

/**
 * Record a completed agent run. Called by the worker after execute() returns.
 */
export function recordAgentRun(opts: {
  actionType: ActionType
  outcome: AgentOutcome
  productId: string
  durationMs: number
  modelId?: string
  inputTokens?: number
  outputTokens?: number
  abstainReason?: string
}): void {
  const { actionType, outcome, productId, durationMs, modelId, inputTokens, outputTokens, abstainReason } = opts

  agentRunCount.add(1, {
    "agent.action_type": actionType,
    "agent.outcome": outcome,
    "agent.product_id": productId,
  })

  agentRunDuration.record(durationMs, {
    "agent.action_type": actionType,
  })

  if (inputTokens != null && modelId) {
    agentInputTokens.record(inputTokens, {
      "agent.action_type": actionType,
      "agent.model_id": modelId,
    })
  }

  if (outputTokens != null && modelId) {
    agentOutputTokens.record(outputTokens, {
      "agent.action_type": actionType,
      "agent.model_id": modelId,
    })
  }

  if (outcome === "abstain" && abstainReason) {
    agentAbstainCount.add(1, {
      "agent.action_type": actionType,
      "agent.abstain_reason": abstainReason,
      "agent.product_id": productId,
    })
  }
}
