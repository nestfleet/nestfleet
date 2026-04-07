/**
 * Unit tests: runAgent() execution behavior — AE-02 / SLICE-16.
 *
 * Covers:
 *   - Single-phase path (triage, auto_reply): generateObject called directly
 *   - Two-phase path (change_prep, outage_routing, etc.): generateText → generateObject
 *   - Phase 1 synthesis prompt construction (tool result deduplication threshold at 100 chars)
 *   - Phase 1 budget pre-check → TokenBudgetError
 *   - Phase 2 budget truncation (overlong synthesis prompt)
 *   - Token aggregation across phases
 *   - AI_NoObjectGeneratedError → StructuredOutputError translation
 *   - LlmTimeoutError from withTimeout
 *   - Known error types passed through unchanged
 */

import { vi, describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
}))

vi.mock("@opentelemetry/api", () => ({
  context: {
    with: (_ctx: unknown, fn: () => unknown) => fn(),
    active: () => ({}),
  },
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttributes: () => {},
        setStatus: () => {},
        end: () => {},
        spanContext: () => ({ traceId: "test-trace-id" }),
      }),
    }),
    setSpan: (_ctx: unknown) => _ctx,
  },
  SpanStatusCode: { OK: 0, ERROR: 1 },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { generateText, generateObject } from "ai"
import type { LanguageModel } from "ai"
import { runAgent } from "../../../src/agents/run-agent.js"
import {
  StructuredOutputError,
  TokenBudgetError,
  LlmTimeoutError,
} from "../../../src/agents/types.js"

// ── Shared fixtures ───────────────────────────────────────────────────────────

const mockModel = {} as unknown as LanguageModel

const schema = z.object({ result: z.string() })
type Output = z.infer<typeof schema>

const baseOpts = {
  model: mockModel,
  schema,
  schemaVersion: "1.0",
  system: "You are a helpful assistant.",
  prompt: "Help me with my issue.",
  productId: "prod_test",
}

/** Mock return value for generateText (Phase 1). */
function makePhase1(text: string, inputTokens = 100, outputTokens = 50) {
  return {
    text,
    finishReason: "stop",
    steps: [] as { toolResults?: Array<{ toolName: string; output: unknown }> }[],
    totalUsage: { inputTokens, outputTokens },
    response: { modelId: "claude-test-3" },
  }
}

/** Mock return value for generateObject (Phase 2 or single-phase). */
function makePhase2(inputTokens = 200, outputTokens = 80) {
  return {
    object: { result: "structured output" } satisfies Output,
    usage: { inputTokens, outputTokens },
    response: { modelId: "claude-test-3" },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Single-phase path ─────────────────────────────────────────────────────────

describe("single-phase (triage, auto_reply)", () => {
  it("calls generateObject directly — generateText is NOT called", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2(150, 60) as any)

    await runAgent({ ...baseOpts, actionType: "triage" })

    expect(generateObject).toHaveBeenCalledOnce()
    expect(generateText).not.toHaveBeenCalled()
  })

  it("returns AgentResult with output, usage, modelId, traceId", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2(150, 60) as any)

    const result = await runAgent({ ...baseOpts, actionType: "triage" })

    expect(result.output).toEqual({ result: "structured output" })
    expect(result.usage.inputTokens).toBe(150)
    expect(result.usage.outputTokens).toBe(60)
    expect(result.usage.totalTokens).toBe(210)
    expect(result.modelId).toBe("claude-test-3")
    expect(result.traceId).toBe("test-trace-id")
  })

  it("passes system prompt, user prompt, schema, and mode:json to generateObject", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "triage" })

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(callArgs.system).toBe(baseOpts.system)
    expect(callArgs.prompt).toBe(baseOpts.prompt)
    expect(callArgs.schema).toBe(schema)
    expect(callArgs.mode).toBe("json")
  })

  it("throws TokenBudgetError when input estimate exceeds phase1MaxInput for triage (6000 tokens)", async () => {
    // estimateTokens = Math.ceil(length / 4); 6000 tokens = 24000 chars
    const oversizedPrompt = "x".repeat(24_001 * 4) // definitely > 6000 tokens

    await expect(
      runAgent({ ...baseOpts, actionType: "triage", prompt: oversizedPrompt }),
    ).rejects.toBeInstanceOf(TokenBudgetError)

    expect(generateObject).not.toHaveBeenCalled()
  })

  it("TokenBudgetError from budget pre-check has budgetType 'per_call'", async () => {
    const oversizedPrompt = "x".repeat(100_000)

    const err = await runAgent({ ...baseOpts, actionType: "triage", prompt: oversizedPrompt }).catch(
      (e) => e,
    )

    expect(err).toBeInstanceOf(TokenBudgetError)
    expect((err as TokenBudgetError).budgetType).toBe("per_call")
  })
})

// ── Two-phase path ────────────────────────────────────────────────────────────

describe("two-phase (change_prep, outage_routing, etc.)", () => {
  it("calls generateText first, then generateObject", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("phase 1 analysis") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "change_prep" })

    expect(generateText).toHaveBeenCalledOnce()
    expect(generateObject).toHaveBeenCalledOnce()
    // Order: generateText must complete before generateObject
    const textOrder = vi.mocked(generateText).mock.invocationCallOrder[0]
    const objOrder = vi.mocked(generateObject).mock.invocationCallOrder[0]
    expect(textOrder).toBeLessThan(objOrder)
  })

  it("aggregates tokens across Phase 1 and Phase 2", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis", 300, 150) as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2(400, 200) as any)

    const result = await runAgent({ ...baseOpts, actionType: "change_prep" })

    expect(result.usage.inputTokens).toBe(700)  // 300 + 400
    expect(result.usage.outputTokens).toBe(350) // 150 + 200
    expect(result.usage.totalTokens).toBe(1050) // 700 + 350
  })

  it("returns output from Phase 2 generateObject", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis text") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    const result = await runAgent({ ...baseOpts, actionType: "outage_routing" })

    expect(result.output).toEqual({ result: "structured output" })
  })

  describe("synthesis prompt construction (SLICE-16A deduplication)", () => {
    it("phase1.text >= 100 chars → synthesisPrompt uses 'Analysis and evidence:' (no raw tool results)", async () => {
      const longText = "a".repeat(100) // exactly 100 chars
      vi.mocked(generateText).mockResolvedValue(makePhase1(longText) as any)
      vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

      await runAgent({ ...baseOpts, actionType: "change_prep" })

      const phase2Prompt = (vi.mocked(generateObject).mock.calls[0][0] as any).prompt as string
      expect(phase2Prompt).toContain("Analysis and evidence:")
      expect(phase2Prompt).not.toContain("Tool lookup results:")
    })

    it("phase1.text < 100 chars → synthesisPrompt includes 'Tool lookup results:' with raw data", async () => {
      const shortText = "brief" // < 100 chars
      const phase1WithTools = {
        ...makePhase1(shortText),
        steps: [
          {
            toolResults: [
              { toolName: "lookup_runbook", output: { procedure: "restart service" } },
            ],
          },
        ],
      }
      vi.mocked(generateText).mockResolvedValue(phase1WithTools as any)
      vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

      await runAgent({ ...baseOpts, actionType: "change_prep" })

      const phase2Prompt = (vi.mocked(generateObject).mock.calls[0][0] as any).prompt as string
      expect(phase2Prompt).toContain("Tool lookup results:")
      expect(phase2Prompt).toContain("lookup_runbook")
      expect(phase2Prompt).toContain("restart service")
    })

    it("phase1.text < 100 chars with no tool steps → synthesisPrompt still includes initial analysis", async () => {
      const shortText = "tiny"
      vi.mocked(generateText).mockResolvedValue(makePhase1(shortText) as any)
      vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

      await runAgent({ ...baseOpts, actionType: "outage_routing" })

      const phase2Prompt = (vi.mocked(generateObject).mock.calls[0][0] as any).prompt as string
      expect(phase2Prompt).toContain("Initial analysis:")
      expect(phase2Prompt).toContain(shortText)
    })
  })

  it("throws TokenBudgetError when Phase 1 input estimate exceeds budget", async () => {
    // change_prep phase1MaxInput = 10_000 → ~40_000 chars
    const oversizedPrompt = "x".repeat(41_000 * 4)

    await expect(
      runAgent({ ...baseOpts, actionType: "change_prep", prompt: oversizedPrompt }),
    ).rejects.toBeInstanceOf(TokenBudgetError)

    expect(generateText).not.toHaveBeenCalled()
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("translates AI_NoObjectGeneratedError to StructuredOutputError", async () => {
    const aiError = new Error("failed to parse")
    aiError.name = "AI_NoObjectGeneratedError"
    vi.mocked(generateObject).mockRejectedValue(aiError)

    await expect(
      runAgent({ ...baseOpts, actionType: "triage" }),
    ).rejects.toBeInstanceOf(StructuredOutputError)
  })

  it("StructuredOutputError carries the schemaVersion", async () => {
    const aiError = new Error("parse error")
    aiError.name = "AI_NoObjectGeneratedError"
    vi.mocked(generateObject).mockRejectedValue(aiError)

    const err = await runAgent({ ...baseOpts, actionType: "triage", schemaVersion: "v2" }).catch(
      (e) => e,
    )
    expect((err as StructuredOutputError).schemaVersion).toBe("v2")
  })

  it("re-throws LlmTimeoutError without wrapping", async () => {
    const timeout = new LlmTimeoutError("timeout", 25_000)
    vi.mocked(generateObject).mockRejectedValue(timeout)

    const err = await runAgent({ ...baseOpts, actionType: "triage" }).catch((e) => e)
    expect(err).toBe(timeout) // exact same instance
    expect(err).toBeInstanceOf(LlmTimeoutError)
  })

  it("re-throws TokenBudgetError without wrapping", async () => {
    const budgetErr = new TokenBudgetError("budget exceeded", "monthly")
    vi.mocked(generateObject).mockRejectedValue(budgetErr)

    const err = await runAgent({ ...baseOpts, actionType: "triage" }).catch((e) => e)
    expect(err).toBe(budgetErr)
    expect(err).toBeInstanceOf(TokenBudgetError)
  })

  it("re-throws unexpected errors without wrapping", async () => {
    const unexpected = new Error("db connection lost")
    vi.mocked(generateObject).mockRejectedValue(unexpected)

    const err = await runAgent({ ...baseOpts, actionType: "triage" }).catch((e) => e)
    expect(err).toBe(unexpected)
    expect(err).not.toBeInstanceOf(StructuredOutputError)
  })

  it("timeout: LlmTimeoutError thrown after configured timeout elapses", async () => {
    // Only fake setTimeout — leave setImmediate/Promise machinery real to avoid deadlock
    vi.useFakeTimers({ toFake: ["setTimeout"] })

    // outage_routing is two-phase: Phase 1 uses generateText — never resolves
    vi.mocked(generateText).mockImplementation(() => new Promise(() => {}))

    // outage_routing timeout = 15_000ms — smallest timeout (TIMEOUTS_MS in run-agent.ts)
    const runPromise = runAgent({ ...baseOpts, actionType: "outage_routing" })

    // Fire all pending timeouts synchronously (fires the 15_000ms rejection)
    vi.runAllTimers()

    await expect(runPromise).rejects.toBeInstanceOf(LlmTimeoutError)
    const err = await runPromise.catch((e) => e)
    expect((err as LlmTimeoutError).timeoutMs).toBe(15_000)

    vi.useRealTimers()
  })
})

// ── durationMs ────────────────────────────────────────────────────────────────

describe("result envelope", () => {
  it("durationMs is a positive number", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    const result = await runAgent({ ...baseOpts, actionType: "triage" })

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.durationMs).toBe("number")
  })
})

// ── outputBudgetMultiplier ────────────────────────────────────────────────────
//
// NF-UNIT-350: multiplier 1.5 → maxOutputTokens passed to generateObject is phase1MaxOutput * 1.5
// NF-UNIT-351: multiplier 1.0 (default) → maxOutputTokens equals phase1MaxOutput unchanged
// NF-UNIT-352: multiplier applied to two-phase phase2 generateObject call
// NF-UNIT-353: effective output capped at 8_000 regardless of multiplier

describe("outputBudgetMultiplier — per-provider output token headroom", () => {
  // triage: phase1MaxOutput = 1_500

  // NF-UNIT-350 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-350: multiplier 1.5 → generateObject receives phase1MaxOutput * 1.5 (single-phase)", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "triage", outputBudgetMultiplier: 1.5 })

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any
    // triage phase1MaxOutput = 1_500; 1_500 * 1.5 = 2_250
    expect(callArgs.maxOutputTokens).toBe(2_250)
  })

  // NF-UNIT-351 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-351: default multiplier (1.0) → maxOutputTokens equals base budget unchanged", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "triage" })

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(callArgs.maxOutputTokens).toBe(1_500)
  })

  it("NF-UNIT-351 (explicit 1.0): explicit multiplier 1.0 is same as omitting it", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "triage", outputBudgetMultiplier: 1.0 })

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(callArgs.maxOutputTokens).toBe(1_500)
  })

  // NF-UNIT-352 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-352: multiplier applied to phase2 generateObject in two-phase path", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis text") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // change_prep: phase2MaxOutput = 2_000; 2_000 * 1.5 = 3_000
    await runAgent({ ...baseOpts, actionType: "change_prep", outputBudgetMultiplier: 1.5 })

    const phase2Args = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(phase2Args.maxOutputTokens).toBe(3_000)
  })

  // NF-UNIT-353 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-353: effective output capped at 8_000 regardless of multiplier", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // pr_draft_prep: phase2MaxOutput = 3_000; 3_000 * 3.0 = 9_000 → capped at 8_000
    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", outputBudgetMultiplier: 3.0 })

    const phase2Args = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(phase2Args.maxOutputTokens).toBe(8_000)
  })
})

// ── Retry on structured output truncation ─────────────────────────────────────
//
// NF-UNIT-360: AI_NoObjectGeneratedError on first call → retries once → returns result
// NF-UNIT-361: retry uses 2× the original maxOutputTokens
// NF-UNIT-362: retry capped at 8_000 output tokens
// NF-UNIT-363: retry fails → throws StructuredOutputError (not the original AI error)
// NF-UNIT-364: non-structured errors NOT retried (plain Error, LlmTimeoutError)
// NF-UNIT-365: two-phase — retry applies to phase 2 generateObject

describe("retry on structured output truncation (AI_NoObjectGeneratedError)", () => {
  function makeTruncatedError() {
    const err = new Error("No object generated: response was truncated")
    err.name = "AI_NoObjectGeneratedError"
    return err
  }

  // NF-UNIT-360 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-360: first call truncated → retries once → returns successful result", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    const result = await runAgent({ ...baseOpts, actionType: "triage" })

    expect(generateObject).toHaveBeenCalledTimes(2)
    expect(result.output).toEqual({ result: "structured output" })
  })

  it("NF-UNIT-360 (variant): generateText NOT called during retry (single-phase only retries generateObject)", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "triage" })

    expect(generateText).not.toHaveBeenCalled()
    expect(generateObject).toHaveBeenCalledTimes(2)
  })

  // NF-UNIT-361 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-361: retry call uses 2× the original maxOutputTokens", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    // triage: effectivePhase1Output = 1_500 (no multiplier); retry = 1_500 * 2 = 3_000
    await runAgent({ ...baseOpts, actionType: "triage" })

    const firstCallMax  = (vi.mocked(generateObject).mock.calls[0][0] as any).maxOutputTokens
    const retryCallMax  = (vi.mocked(generateObject).mock.calls[1][0] as any).maxOutputTokens
    expect(retryCallMax).toBe(firstCallMax * 2)
    expect(retryCallMax).toBe(3_000)
  })

  it("NF-UNIT-361 (with multiplier): retry doubles the already-multiplied budget", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    // triage: effectivePhase1Output = round(1_500 * 1.5) = 2_250; retry = 2_250 * 2 = 4_500
    await runAgent({ ...baseOpts, actionType: "triage", outputBudgetMultiplier: 1.5 })

    const retryCallMax = (vi.mocked(generateObject).mock.calls[1][0] as any).maxOutputTokens
    expect(retryCallMax).toBe(4_500)
  })

  // NF-UNIT-362 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-362: retry maxOutputTokens capped at 8_000", async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    // pr_draft_prep phase1MaxOutput = 3_000; multiplier 1.5 → effective = 4_500; retry = min(9_000, 8_000) = 8_000
    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", outputBudgetMultiplier: 1.5 })

    const retryCallMax = (vi.mocked(generateObject).mock.calls[1][0] as any).maxOutputTokens
    expect(retryCallMax).toBe(8_000)
  })

  // NF-UNIT-363 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-363: both calls truncated → throws StructuredOutputError", async () => {
    vi.mocked(generateObject).mockRejectedValue(makeTruncatedError())

    await expect(
      runAgent({ ...baseOpts, actionType: "triage" }),
    ).rejects.toBeInstanceOf(StructuredOutputError)

    expect(generateObject).toHaveBeenCalledTimes(2)
  })

  it("NF-UNIT-363 (variant): StructuredOutputError carries the schemaVersion after retry failure", async () => {
    vi.mocked(generateObject).mockRejectedValue(makeTruncatedError())

    const err = await runAgent({ ...baseOpts, actionType: "triage", schemaVersion: "v3" }).catch(e => e)

    expect(err).toBeInstanceOf(StructuredOutputError)
    expect((err as StructuredOutputError).schemaVersion).toBe("v3")
  })

  // NF-UNIT-364 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-364: plain Error (non-structured) NOT retried — throws immediately, generateObject called once", async () => {
    const plainErr = new Error("network error")
    vi.mocked(generateObject).mockRejectedValue(plainErr)

    await expect(
      runAgent({ ...baseOpts, actionType: "triage" }),
    ).rejects.toBe(plainErr)

    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it("NF-UNIT-364 (LlmTimeoutError): timeout errors NOT retried", async () => {
    const timeout = new LlmTimeoutError("timeout", 25_000)
    vi.mocked(generateObject).mockRejectedValue(timeout)

    const err = await runAgent({ ...baseOpts, actionType: "triage" }).catch(e => e)

    expect(err).toBeInstanceOf(LlmTimeoutError)
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  // NF-UNIT-365 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-365: two-phase — truncation on phase2 generateObject triggers retry", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis text") as any)
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    const result = await runAgent({ ...baseOpts, actionType: "change_prep" })

    expect(generateText).toHaveBeenCalledTimes(1)   // phase1 not retried
    expect(generateObject).toHaveBeenCalledTimes(2)  // phase2 retried
    expect(result.output).toEqual({ result: "structured output" })
  })

  it("NF-UNIT-365 (variant): two-phase — retry doubles phase2 budget", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis") as any)
    vi.mocked(generateObject)
      .mockRejectedValueOnce(makeTruncatedError())
      .mockResolvedValueOnce(makePhase2() as any)

    // change_prep: phase2MaxOutput = 2_000 (default multiplier 1.0); retry = 4_000
    await runAgent({ ...baseOpts, actionType: "change_prep" })

    const firstMax = (vi.mocked(generateObject).mock.calls[0][0] as any).maxOutputTokens
    const retryMax = (vi.mocked(generateObject).mock.calls[1][0] as any).maxOutputTokens
    expect(firstMax).toBe(2_000)
    expect(retryMax).toBe(4_000)
  })
})

// ── supportsTools: false — capability-driven phase override ───────────────────
//
// NF-UNIT-370: two-phase action + supportsTools:false → runs single-phase (no generateText)
// NF-UNIT-371: two-phase action + supportsTools:false → generateObject called without tools
// NF-UNIT-372: two-phase action + supportsTools:false → warning logged
// NF-UNIT-373: two-phase action + supportsTools:true (default) → runs two-phase normally
// NF-UNIT-374: single-phase action + supportsTools:false → still single-phase (unchanged)
// NF-UNIT-375: supportsTools:false with no tools provided → no override, no warning

describe("supportsTools: false — capability-driven phase override (Ollama / self-hosted)", () => {
  const toolSet = { fakeTool: {} as any }

  // NF-UNIT-370 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-370: two-phase action + supportsTools:false → runs single-phase (generateText NOT called)", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // pr_draft_prep is two-phase by default; with supportsTools:false + tools → override to single
    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", tools: toolSet, supportsTools: false })

    expect(generateText).not.toHaveBeenCalled()
    expect(generateObject).toHaveBeenCalledOnce()
  })

  it("NF-UNIT-370 (change_prep): change_prep also overrides to single-phase when supportsTools:false", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "change_prep", tools: toolSet, supportsTools: false })

    expect(generateText).not.toHaveBeenCalled()
    expect(generateObject).toHaveBeenCalledOnce()
  })

  // NF-UNIT-371 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-371: two-phase + supportsTools:false → generateObject called WITHOUT tools in params", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", tools: toolSet, supportsTools: false })

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(callArgs.tools).toBeUndefined()
    expect(callArgs.maxSteps).toBeUndefined()
  })

  // NF-UNIT-372 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-372: supportsTools:false + tools → warning is logged once", async () => {
    const { logger } = await import("../../../src/shared/logger.js")
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", tools: toolSet, supportsTools: false })

    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce()
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "pr_draft_prep" }),
      expect.stringContaining("does not support tool calling"),
    )
  })

  // NF-UNIT-373 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-373: supportsTools:true (default) + two-phase action → runs two-phase normally", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", tools: toolSet, supportsTools: true })

    expect(generateText).toHaveBeenCalledOnce()
    expect(generateObject).toHaveBeenCalledOnce()
  })

  it("NF-UNIT-373 (omitted): omitting supportsTools defaults to true → two-phase unchanged", async () => {
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // No supportsTools prop → should default to true
    await runAgent({ ...baseOpts, actionType: "change_prep", tools: toolSet })

    expect(generateText).toHaveBeenCalledOnce()
  })

  // NF-UNIT-374 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-374: single-phase action + supportsTools:false stays single-phase (no extra override needed)", async () => {
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // triage is already single-phase; supportsTools:false should not break it
    await runAgent({ ...baseOpts, actionType: "triage", tools: toolSet, supportsTools: false })

    expect(generateText).not.toHaveBeenCalled()
    expect(generateObject).toHaveBeenCalledOnce()
  })

  // NF-UNIT-375 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-375: supportsTools:false with NO tools → no override, no warning, runs as configured", async () => {
    const { logger } = await import("../../../src/shared/logger.js")
    vi.mocked(generateText).mockResolvedValue(makePhase1("analysis") as any)
    vi.mocked(generateObject).mockResolvedValue(makePhase2() as any)

    // pr_draft_prep is two-phase but no tools provided — supportsTools:false has nothing to block
    await runAgent({ ...baseOpts, actionType: "pr_draft_prep", supportsTools: false })

    // No tools to block → no warning
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
    // Two-phase still runs normally (no tools to suppress anyway)
    expect(generateText).toHaveBeenCalledOnce()
    expect(generateObject).toHaveBeenCalledOnce()
  })
})
