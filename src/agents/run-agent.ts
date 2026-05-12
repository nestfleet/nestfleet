// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * runAgent() — the universal agent execution wrapper. AE-02 + SLICE-16.
 *
 * Handles:
 *   - Token budget pre-check per phase (SLICE-16A)
 *   - Two execution strategies (SLICE-16B):
 *     a) "two-phase": generateText (tools) → generateObject (structured output)
 *     b) "single-phase": generateObject directly with tools (triage, auto_reply)
 *   - Evidence deduplication in two-phase mode (SLICE-16A)
 *   - Per-phase token usage tracking (SLICE-16A)
 *   - Typed error translation (LlmTimeoutError, StructuredOutputError)
 *   - AgentResult envelope construction
 *   - OTel span creation for agent.llm_call
 *
 * Workers call runAgent() rather than generateObject() directly.
 * Agents never import the AI SDK — they receive the model from the worker.
 */

import { generateText, generateObject, stepCountIs } from "ai"
import type { LanguageModel, ToolSet } from "ai"
import type { ZodSchema } from "zod"
import { context, trace, SpanStatusCode } from "@opentelemetry/api"
import { logger } from "../shared/logger.js"
import {
  StructuredOutputError,
  TokenBudgetError,
  LlmTimeoutError,
  TOKEN_BUDGETS,
  estimateTokens,
  type AgentResult,
  type TokenUsage,
  type ActionType,
} from "./types.js"

// Re-export for consumers that imported from here historically
export type { AgentResult }

const TRACER = trace.getTracer("nestfleet.agents")

// Timeout constants per SLO (phase2-agentic-engine-design.md §7)
const TIMEOUTS_MS: Record<ActionType, number> = {
  auto_reply:        25_000,
  triage:            90_000,
  known_issue_match: 20_000,
  change_prep:       60_000,
  pr_draft_prep:     90_000,
  outage_routing:    15_000,
  knowledge_capture: 30_000,
}

export interface RunAgentOptions<TOutput> {
  /** LLM model instance from getLlmProvider(). */
  model: LanguageModel
  /** Zod schema — validated at the output boundary. */
  schema: ZodSchema<TOutput>
  /** Schema version string stored in agent_runs for audit. */
  schemaVersion: string
  /** System prompt (trusted content only — no user input). */
  system: string
  /** User turn content (must be pre-sanitized via prepareUserContent()). */
  prompt: string
  /** Action type — used for budget lookup and tracing. */
  actionType: ActionType
  /** Product ID for tracing and budget enforcement. */
  productId: string
  /** Optional case ID for tracing. */
  caseId?: string
  /**
   * Read-only tool set the LLM may call during inference.
   * Must be a compile-time constant from TOOL_SETS_BY_ACTION_TYPE.
   * ADR-024: all tools are read-only; writes happen only in the worker.
   */
  tools?: ToolSet
  /**
   * Maximum agent steps (LLM call + tool calls).
   * Default: 3 (one reasoning step + up to 2 tool lookups).
   */
  maxSteps?: number
  /**
   * Output token budget multiplier from getLlmProviderForProduct().
   * Applied to phase1MaxOutput / phase2MaxOutput before each call.
   * Google/Gemini = 1.5; all others = 1.0 (default).
   */
  outputBudgetMultiplier?: number
  /**
   * Whether the provider supports function/tool calling.
   * From getLlmProviderForProduct() → ProductLlmContext.supportsTools.
   * When false and tools are provided, overrides two-phase strategy to
   * single-phase and suppresses tool calls — prevents HTTP 400 from providers
   * whose models don't support function calling (Ollama, self-hosted, etc.).
   * Defaults to true (no change for known-capable providers).
   */
  supportsTools?: boolean
}

/**
 * Execute an agent invocation.
 *
 * SLICE-16B: If `TOKEN_BUDGETS[actionType].phasingStrategy === "single-phase"`,
 * calls generateObject() directly with tools — no Phase 1 generateText.
 * Otherwise uses the original two-phase approach.
 *
 * @throws TokenBudgetError     if input token estimate exceeds per-phase limit
 * @throws LlmTimeoutError      if the LLM call times out
 * @throws StructuredOutputError if structured output production fails after retries
 */
export async function runAgent<TOutput>(
  opts: RunAgentOptions<TOutput>,
): Promise<AgentResult<TOutput>> {
  const {
    model,
    schema,
    schemaVersion,
    system,
    prompt,
    actionType,
    productId,
    caseId,
    tools,
    maxSteps = 3,
    outputBudgetMultiplier = 1.0,
    supportsTools = true,
  } = opts
  const budget = TOKEN_BUDGETS[actionType]

  // Capability guard: if the provider doesn't support tool calling, force
  // single-phase and suppress tools so agents degrade gracefully instead of
  // throwing HTTP 400 at the provider API.
  const hasToolsInSet = !!tools && Object.keys(tools).length > 0
  const toolsBlocked = !supportsTools && hasToolsInSet
  if (toolsBlocked) {
    logger.warn(
      { actionType, productId, caseId },
      "Provider does not support tool calling — overriding to single-phase without tools. " +
      "Agents will still produce structured output but without RAG lookups. " +
      "Use a tool-capable model (e.g. llama3.1+) to enable full functionality.",
    )
  }
  const effectiveStrategy = toolsBlocked ? "single-phase" : budget.phasingStrategy

  // Apply provider multiplier to output budgets — gives verbose models (e.g. Gemini) more headroom.
  // Hard cap at 8_000 to prevent runaway costs on any single call.
  const multiplier = Math.max(1.0, outputBudgetMultiplier)
  const effectivePhase1Output = Math.min(Math.round(budget.phase1MaxOutput * multiplier), 8_000)
  const effectivePhase2Output = Math.min(Math.round(budget.phase2MaxOutput * multiplier), 8_000)

  const startMs = Date.now()
  const span = TRACER.startSpan("agent.llm_call", {
    attributes: {
      "agent.action_type": actionType,
      "agent.product_id": productId,
      "agent.phasing_strategy": budget.phasingStrategy,
      ...(caseId ? { "agent.case_id": caseId } : {}),
    },
  })

  try {
    const timeoutMs = TIMEOUTS_MS[actionType]

    const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new LlmTimeoutError(`LLM call timed out after ${timeoutMs}ms for action ${actionType}`, timeoutMs)),
            timeoutMs,
          ),
        ),
      ])

    // ── Retry helper: re-attempt generateObject with 2× output budget on truncation ──
    //
    // AI_NoObjectGeneratedError means the model ran out of output tokens mid-JSON.
    // Retrying with more tokens resolves it for any provider without manual tuning.
    // Hard cap at 8_000 ensures the retry stays within reasonable cost limits.
    //
    // Uses `any` for params to avoid TypeScript overload-resolution issues with
    // generateObject's generic signature — the schema is passed through unchanged
    // so the actual output type is preserved by the caller's assignment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generateObjectWithRetry = async (params: Record<string, any> & { maxOutputTokens: number }) => {
      try {
        return await context.with(trace.setSpan(context.active(), span), () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          withTimeout((generateObject as any)(params)),
        )
      } catch (firstErr) {
        if (firstErr instanceof Error && firstErr.name === "AI_NoObjectGeneratedError") {
          const retryMaxOutput = Math.min(params.maxOutputTokens * 2, 8_000)
          logger.warn(
            { actionType, productId, caseId, originalMax: params.maxOutputTokens, retryMax: retryMaxOutput },
            "Structured output truncated — retrying with 2× output budget",
          )
          // If the retry also fails, propagate to the outer catch → StructuredOutputError
          return await context.with(trace.setSpan(context.active(), span), () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            withTimeout((generateObject as any)({ ...params, maxOutputTokens: retryMaxOutput })),
          )
        }
        throw firstErr
      }
    }

    let typedOutput: TOutput
    let usage: TokenUsage
    let modelId: string

    if (effectiveStrategy === "single-phase") {
      // ══════════════════════════════════════════════════════════════════════
      // SINGLE-PHASE: generateObject directly with tools (SLICE-16B)
      // For simple agents (triage, auto_reply) — halves latency + tokens.
      // Also used as fallback when provider doesn't support tools (toolsBlocked).
      // ══════════════════════════════════════════════════════════════════════

      // Budget pre-check: single call uses phase1 limits
      const estimatedInput = estimateTokens(system + prompt)
      if (estimatedInput > budget.phase1MaxInput) {
        throw new TokenBudgetError(
          `Input token estimate ${estimatedInput} exceeds phase1 budget ${budget.phase1MaxInput} for ${actionType}`,
          "per_call",
        )
      }

      // When tools are blocked by capability, run without tools (schema stays in prompt)
      const hasTools = hasToolsInSet && !toolsBlocked

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateObjectWithRetry({
        model,
        system,
        prompt,
        schema,
        mode: "json",
        temperature: 0,
        maxOutputTokens: effectivePhase1Output,
        maxRetries: 2,
        ...(hasTools ? { tools, maxSteps } : {}),
      }) as any

      typedOutput = result.object as TOutput
      modelId = (result.response?.modelId as string | undefined) ?? "unknown"
      usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      }

      logger.debug(
        { actionType, phasingStrategy: "single-phase", usage, modelId },
        "Agent single-phase call complete",
      )

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // TWO-PHASE: generateText → generateObject (original design)
      // For complex agents (change_prep, pr_draft_prep, outage_routing, etc.)
      // ══════════════════════════════════════════════════════════════════════

      // ── Phase 1 budget pre-check ──────────────────────────────────────
      const estimatedP1Input = estimateTokens(system + prompt)
      if (estimatedP1Input > budget.phase1MaxInput) {
        throw new TokenBudgetError(
          `Phase 1 input estimate ${estimatedP1Input} exceeds budget ${budget.phase1MaxInput} for ${actionType}`,
          "per_call",
        )
      }

      // ── Phase 1: Tool-calling ─────────────────────────────────────────
      // toolsBlocked is always false here (effectiveStrategy === "two-phase" only when supportsTools)
      const hasTools = hasToolsInSet
      const phase1 = await context.with(trace.setSpan(context.active(), span), () =>
        withTimeout(
          generateText({
            model,
            system,
            prompt,
            temperature: 0,
            maxOutputTokens: effectivePhase1Output,
            maxRetries: 2,
            stopWhen: stepCountIs(maxSteps),
            ...(hasTools ? { tools } : {}),
          }),
        ),
      )

      logger.debug(
        { actionType, steps: phase1.steps?.length, finishReason: phase1.finishReason, text: phase1.text?.slice(0, 120) },
        "Agent phase1 complete",
      )

      // ── Phase 2: Structured output extraction ─────────────────────────
      // SLICE-16A: Deduplicate tool results.
      // Only inject raw toolResultContext when phase1.text is very short
      // (< 100 chars) — meaning the model didn't summarize tool results itself.
      // Otherwise, phase1.text already incorporates tool evidence.
      const phase1Text = phase1.text ?? ""

      let synthesisPrompt: string
      if (phase1Text.length < 100) {
        // Phase 1 produced minimal text — inject raw tool results
        const toolResultContext = phase1.steps
          ?.flatMap((s) => s.toolResults ?? [])
          .map((tr) => `Tool result [${tr.toolName}]: ${JSON.stringify(tr.output)}`)
          .join("\n") ?? ""

        synthesisPrompt =
          `${prompt}\n\n` +
          (toolResultContext ? `Tool lookup results:\n${toolResultContext}\n\n` : "") +
          (phase1Text ? `Initial analysis:\n${phase1Text}\n\n` : "") +
          `Based on all the above, produce the structured JSON output.`
      } else {
        // Phase 1 produced substantial text — skip raw tool results to avoid duplication
        synthesisPrompt =
          `${prompt}\n\n` +
          `Analysis and evidence:\n${phase1Text}\n\n` +
          `Based on the analysis above, produce the structured JSON output.`
      }

      // SLICE-16A: Phase 2 budget pre-check
      const estimatedP2Input = estimateTokens(system + synthesisPrompt)
      if (estimatedP2Input > budget.phase2MaxInput) {
        logger.warn(
          { actionType, estimatedP2Input, phase2MaxInput: budget.phase2MaxInput },
          "Phase 2 input exceeds budget — truncating synthesis prompt",
        )
        // Truncate phase1 text to fit within budget (keep prompt + instruction)
        const overageChars = (estimatedP2Input - budget.phase2MaxInput) * 4
        const truncatedText = phase1Text.slice(0, Math.max(200, phase1Text.length - overageChars))
        synthesisPrompt =
          `${prompt}\n\n` +
          `Analysis (truncated):\n${truncatedText}\n\n` +
          `Based on the analysis above, produce the structured JSON output.`
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phase2 = await generateObjectWithRetry({
        model,
        system,
        prompt: synthesisPrompt,
        schema,
        mode: "json",
        temperature: 0,
        maxOutputTokens: effectivePhase2Output,
        maxRetries: 2,
      }) as any

      typedOutput = phase2.object as TOutput

      // Aggregate token usage across both phases (SLICE-16A: per-phase tracking)
      const p1Usage = phase1.totalUsage
      const p2Usage = phase2.usage
      usage = {
        inputTokens: (p1Usage.inputTokens ?? 0) + (p2Usage.inputTokens ?? 0),
        outputTokens: (p1Usage.outputTokens ?? 0) + (p2Usage.outputTokens ?? 0),
        totalTokens:
          (p1Usage.inputTokens ?? 0) + (p1Usage.outputTokens ?? 0) +
          (p2Usage.inputTokens ?? 0) + (p2Usage.outputTokens ?? 0),
      }
      modelId = (phase1.response?.modelId as string | undefined) ?? "unknown"

      logger.debug(
        {
          actionType,
          phasingStrategy: "two-phase",
          phase1Input: p1Usage.inputTokens, phase1Output: p1Usage.outputTokens,
          phase2Input: p2Usage.inputTokens, phase2Output: p2Usage.outputTokens,
          modelId,
        },
        "Agent two-phase call complete",
      )
    }

    const durationMs = Date.now() - startMs

    // OTel span enrichment
    span.setAttributes({
      "agent.model_id": modelId,
      "agent.input_tokens": usage.inputTokens,
      "agent.output_tokens": usage.outputTokens,
      "agent.duration_ms": durationMs,
      "agent.schema_version": schemaVersion,
    })
    span.setStatus({ code: SpanStatusCode.OK })

    const traceId = span.spanContext().traceId

    logger.debug(
      { actionType, productId, caseId, durationMs, usage, modelId },
      "Agent LLM call complete",
    )

    return {
      output: typedOutput,
      usage,
      durationMs,
      modelId,
      traceId,
    }
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })

    if (err instanceof LlmTimeoutError || err instanceof TokenBudgetError) {
      throw err
    }

    // generateObject throws AI_NoObjectGeneratedError when it can't parse structured output
    if (err instanceof Error && err.name === "AI_NoObjectGeneratedError") {
      throw new StructuredOutputError(
        `Structured output generation failed for ${actionType}: ${err.message}`,
        schemaVersion,
        err,
      )
    }

    logger.error({ err, actionType, productId }, "Agent LLM call failed")
    throw err
  } finally {
    span.end()
  }
}
