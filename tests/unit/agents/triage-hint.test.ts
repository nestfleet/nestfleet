/**
 * Unit tests: triage agent triage_hint — FEAT-015.
 *
 * Tests that runTriageAgent() prepends the OPERATOR OVERRIDE block to the
 * system prompt when a triageHint is present in the input.
 *
 * NF-UNIT-TH-01 through NF-UNIT-TH-02
 *
 * Strategy: mock the runAgent() dependency and capture the `system` argument
 * passed to it. This avoids any LLM call while still exercising the hint
 * injection logic in runTriageAgent().
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock all heavy dependencies ───────────────────────────────────────────────

vi.mock("../../../src/agents/run-agent.js", () => ({
  runAgent: vi.fn(),
}))

vi.mock("../../../src/memory/retrieval/retrieval-service.js", () => ({
  retrieve: vi.fn().mockResolvedValue({
    chunks: [], tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 }, minFreshness: 0,
    avgFreshness: 0, hasConflicts: false, abstain: false, abstainReason: null,
  }),
}))

vi.mock("../../../src/memory/ingestion/embedder.js", () => ({
  embedText: vi.fn().mockResolvedValue({ embedding: [] }),
}))

vi.mock("../../../src/agents/llm-provider.js", () => ({
  getLlmProviderForProduct: vi.fn().mockResolvedValue({
    model:                "mock-model",
    tone:                 "professional",
    outputBudgetMultiplier: 1,
  }),
}))

vi.mock("../../../src/agents/tool-sets.js", () => ({
  getToolSet: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../src/agents/tone.js", () => ({
  withTone: vi.fn().mockImplementation((prompt: string) => prompt),
}))

import { runAgent } from "../../../src/agents/run-agent.js"
import { runTriageAgent } from "../../../src/agents/impl/triage.js"

// ── Fixture ───────────────────────────────────────────────────────────────────

const MOCK_TRIAGE_OUTPUT = {
  severity:       "high",
  confidenceScore: 0.85,
  category:       "auth",
  labels:         ["sso"],
  reasoning:      "SSO login is broken.",
  evidenceRefs:   [],
}

const BASE_INPUT = {
  productId:  "prod_123",
  caseId:     "case_abc",
  jobId:      "job_abc",
  signalText: "User cannot log in with SSO",
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runTriageAgent() triage_hint injection (unit)", () => {

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runAgent).mockResolvedValue({
      output:    MOCK_TRIAGE_OUTPUT,
      modelId:   "mock-model",
      usage:     { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 200,
      traceId:   "trace_abc",
    })
  })

  it("NF-UNIT-TH-01: when triage_hint present, runTriageAgent prepends OPERATOR OVERRIDE to system prompt", async () => {
    await runTriageAgent({
      ...BASE_INPUT,
      triageHint: {
        type:     "user_request",
        severity: "low",
        reason:   "User asked about Zapier, not a bug",
      },
    })

    expect(vi.mocked(runAgent)).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(runAgent).mock.calls[0]![0]

    expect(callArgs.system).toMatch(/OPERATOR OVERRIDE/)
    expect(callArgs.system).toMatch(/type=user_request/)
    expect(callArgs.system).toMatch(/severity=low/)
    expect(callArgs.system).toMatch(/User asked about Zapier, not a bug/)
    expect(callArgs.system).toMatch(/Do not reclassify/)
  })

  it("NF-UNIT-TH-02: when no triage_hint, prompt is unchanged (no OPERATOR OVERRIDE block)", async () => {
    await runTriageAgent(BASE_INPUT)

    expect(vi.mocked(runAgent)).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(runAgent).mock.calls[0]![0]

    expect(callArgs.system).not.toMatch(/OPERATOR OVERRIDE/)
  })
})
