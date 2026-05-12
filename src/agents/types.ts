// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Agent base types — AE-02.
 * ADR-023: agents are pure async functions, not stateful classes.
 * ADR-027: prompt injection defense — sanitizeUserContent is a required step.
 */

// ── Domain types ──────────────────────────────────────────────────────────────

/** All action types supported by the agentic engine. */
export type ActionType =
  | "auto_reply"
  | "triage"
  | "known_issue_match"
  | "change_prep"
  | "pr_draft_prep"
  | "outage_routing"
  | "knowledge_capture"

// ── Agent function shape ──────────────────────────────────────────────────────

/**
 * Every agent is a pure async function: input in, structured result out.
 * Agents carry no state between invocations. All state lives in PostgreSQL.
 * ADR-023.
 */
export type AgentFn<TInput, TOutput> = (input: TInput) => Promise<AgentResult<TOutput>>

/** Uniform result envelope returned by every successful agent invocation. */
export interface AgentResult<TOutput> {
  /** Zod-validated structured output. */
  output: TOutput
  /** Token usage from the LLM call. */
  usage: TokenUsage
  /** Wall-clock duration of the full agent invocation in ms. */
  durationMs: number
  /** Model identifier as reported by the AI SDK (e.g. "gemini-2.0-flash"). */
  modelId: string
  /** OTel trace ID for correlation with the distributed trace. */
  traceId: string
}

/** Token usage reported by the AI SDK (ai v6 uses inputTokens/outputTokens). */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

// ── Agent error hierarchy ─────────────────────────────────────────────────────

/** Base class for all typed agent errors. */
export class AgentError extends Error {
  public readonly code: string

  constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause })
    this.name = "AgentError"
    this.code = code
  }
}

/**
 * LLM returned output that failed Zod schema validation after maxRetries.
 * ADR-022: generateObject retries up to maxRetries:2 before throwing.
 */
export class StructuredOutputError extends AgentError {
  public readonly schemaVersion: string

  constructor(message: string, schemaVersion: string, cause?: unknown) {
    super(message, "STRUCTURED_OUTPUT_ERROR", cause)
    this.name = "StructuredOutputError"
    this.schemaVersion = schemaVersion
  }
}

/**
 * Input token estimate or monthly product budget exceeded.
 * ADR-028: token budget enforcement.
 */
export class TokenBudgetError extends AgentError {
  public readonly budgetType: "per_call" | "monthly"

  constructor(message: string, budgetType: "per_call" | "monthly", cause?: unknown) {
    super(message, "TOKEN_BUDGET_ERROR", cause)
    this.name = "TokenBudgetError"
    this.budgetType = budgetType
  }
}

/**
 * LLM provider did not respond within the configured timeout.
 * Workers retry subject to per-queue retry limits.
 */
export class LlmTimeoutError extends AgentError {
  public readonly timeoutMs: number

  constructor(message: string, timeoutMs: number, cause?: unknown) {
    super(message, "LLM_TIMEOUT_ERROR", cause)
    this.name = "LlmTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

/**
 * A post-validation policy was violated (e.g. confidence below threshold,
 * forbidden phrase in draft, credential pattern in PR body).
 */
export class PolicyViolationError extends AgentError {
  public readonly policy: string

  constructor(message: string, policy: string, cause?: unknown) {
    super(message, "POLICY_VIOLATION_ERROR", cause)
    this.name = "PolicyViolationError"
    this.policy = policy
  }
}

// ── Agent run record (persisted to agent_runs) ────────────────────────────────

/** Outcome values stored in agent_runs.outcome. */
export type AgentOutcome = "success" | "abstain" | "error" | "validation_failure"

/** Record written to agent_runs for every invocation. AE-05 / ADR-026. */
export interface AgentRunRecord {
  jobId: string
  productId: string
  caseId?: string
  actionType: ActionType
  outcome: AgentOutcome
  abstainReason?: string
  modelId: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  evidenceChunkIds?: string[]
  outputSchemaVersion?: string
  outputValid?: boolean
  outputSnapshot?: unknown
  errorCode?: string
  errorMessage?: string
  otelTraceId?: string
  otelSpanId?: string
}

// ── Token budget config per action type ──────────────────────────────────────

/**
 * Per-action-type token budget — SLICE-16A: separate Phase 1 and Phase 2 limits.
 * ADR-028.
 */
export interface TokenBudget {
  /** Phase 1 (tool-calling) input token limit. */
  phase1MaxInput: number
  /** Phase 1 output token limit (maxOutputTokens for generateText). */
  phase1MaxOutput: number
  /** Phase 2 (structured extraction) input token limit — accounts for synthesisPrompt. */
  phase2MaxInput: number
  /** Phase 2 output token limit (maxOutputTokens for generateObject). */
  phase2MaxOutput: number
  /**
   * SLICE-16B: Phasing strategy.
   * "two-phase" (default): Phase 1 generateText → Phase 2 generateObject.
   * "single-phase": Skip Phase 1, call generateObject directly with tools.
   *   Halves latency + token cost for simple agents (triage, auto_reply).
   */
  phasingStrategy: "two-phase" | "single-phase"
}

/** Legacy accessor — returns combined maxInputTokens for backward compat. */
export function getMaxInputTokens(b: TokenBudget): number {
  return b.phase1MaxInput // used by pre-flight budget check
}

export const TOKEN_BUDGETS: Record<ActionType, TokenBudget> = {
  // ── Simple agents: single-phase (SLICE-16B) ──────────────────────────────
  triage: {
    phase1MaxInput: 10_000, phase1MaxOutput: 1_500,
    phase2MaxInput: 12_000, phase2MaxOutput: 1_500,
    phasingStrategy: "single-phase",
  },
  auto_reply: {
    phase1MaxInput: 8_000, phase1MaxOutput: 3_000,
    phase2MaxInput: 12_000, phase2MaxOutput: 3_000,
    phasingStrategy: "single-phase",
  },

  // ── Complex agents: two-phase (default) ──────────────────────────────────
  known_issue_match: {
    phase1MaxInput: 5_000, phase1MaxOutput: 600,
    phase2MaxInput: 8_000, phase2MaxOutput: 600,
    phasingStrategy: "two-phase",
  },
  change_prep: {
    phase1MaxInput: 10_000, phase1MaxOutput: 2_000,
    phase2MaxInput: 18_000, phase2MaxOutput: 2_000,
    phasingStrategy: "two-phase",
  },
  pr_draft_prep: {
    phase1MaxInput: 12_000, phase1MaxOutput: 3_000,
    phase2MaxInput: 20_000, phase2MaxOutput: 3_000,
    phasingStrategy: "two-phase",
  },
  outage_routing: {
    phase1MaxInput: 6_000, phase1MaxOutput: 800,
    phase2MaxInput: 10_000, phase2MaxOutput: 800,
    phasingStrategy: "two-phase",
  },
  knowledge_capture: {
    phase1MaxInput: 8_000, phase1MaxOutput: 1_500,
    phase2MaxInput: 12_000, phase2MaxOutput: 1_500,
    phasingStrategy: "single-phase",
  },
}

/** Estimate token count from text length (rough: chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Validate that a string is a supported action type.
 * Dispatch is rejected at compile-time for unknown types (exhaustive switch in getToolSet),
 * and at runtime via this guard for string inputs (e.g. from job payloads).
 */
export function isValidActionType(actionType: string): actionType is ActionType {
  const valid: ActionType[] = [
    "auto_reply",
    "triage",
    "known_issue_match",
    "change_prep",
    "pr_draft_prep",
    "outage_routing",
    "knowledge_capture",
  ]
  return valid.includes(actionType as ActionType)
}
