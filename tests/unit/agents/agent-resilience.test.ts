/**
 * Unit tests: Agent resilience — QE-01 red phase.
 *
 * Proves that auto-reply, known-issue-match, and outage-routing agents
 * do NOT throw when the embedding API is unavailable or retrieval returns
 * no_results. These agents currently crash on embedding failure (no try/catch).
 * After QE-01 refactor they will use buildEvidencePack() which handles it.
 *
 * For each agent, two tests:
 *   - should not throw when embedText() fails
 *   - should not throw when retrieve() returns no_results abstain
 *
 * The LLM call (runAgent) is mocked to return valid structured output so the
 * tests isolate only the resilience path, not LLM behavior.
 *
 * QE-RES-01 through QE-RES-12
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/memory/ingestion/embedder.js", () => ({
  embedText: vi.fn(),
}))

vi.mock("../../../src/memory/retrieval/retrieval-service.js", () => ({
  retrieve: vi.fn(),
}))

vi.mock("../../../src/agents/run-agent.js", () => ({
  runAgent: vi.fn(),
}))

vi.mock("../../../src/agents/llm-provider.js", () => ({
  getLlmProviderForProduct: vi.fn(),
}))

vi.mock("../../../src/agents/tone.js", () => ({
  withTone: vi.fn((_system: unknown, _tone: unknown) => "system prompt"),
}))

vi.mock("../../../src/agents/tool-sets.js", () => ({
  getToolSet: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../src/agents/sanitize.js", () => ({
  prepareUserContent: vi.fn((_text: unknown, _tag: unknown) => "<USER_SIGNAL_CONTENT>signal</USER_SIGNAL_CONTENT>"),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { embedText } from "../../../src/memory/ingestion/embedder.js"
import { retrieve } from "../../../src/memory/retrieval/retrieval-service.js"
import { runAgent } from "../../../src/agents/run-agent.js"
import { getLlmProviderForProduct } from "../../../src/agents/llm-provider.js"
import type { EvidencePack } from "../../../src/memory/types.js"

import { runAutoReplyAgent } from "../../../src/agents/impl/auto-reply.js"
import { runKnownIssueMatchAgent } from "../../../src/agents/impl/known-issue-match.js"
import { runOutageRoutingAgent } from "../../../src/agents/impl/outage-routing.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_EMBEDDING: number[] = [0.1, 0.2, 0.3]

function makeNoResultsPack(): EvidencePack {
  return {
    chunks:       [],
    tierSummary:  { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain:      true,
    abstainReason: "no_results",
  }
}

function makeEmptyPack(): EvidencePack {
  return {
    chunks:       [],
    tierSummary:  { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain:      false,
    abstainReason: null,
  }
}

const MOCK_AUTO_REPLY_RESULT = {
  output: {
    replyText:           "Thank you for reaching out. We are investigating this issue.",
    confidenceScore:     0.92,
    sourceTiers:         [1],
    evidenceRefs:        ["chunk-1"],
    reasoning:           "Strong T1 source match",
    requiresHumanReview: false,
  },
  usage:      { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
  durationMs: 1500,
  modelId:    "claude-3-haiku",
  traceId:    "trace-abc",
}

const MOCK_KNOWN_ISSUE_RESULT = {
  output: {
    matched:        false,
    confidenceScore: 0.4,
  },
  usage:      { inputTokens: 500, outputTokens: 150, totalTokens: 650 },
  durationMs: 800,
  modelId:    "claude-3-haiku",
  traceId:    "trace-def",
}

const MOCK_OUTAGE_ROUTING_RESULT = {
  output: {
    routingTeam:        "on-call-infra",
    severity:           "critical" as const,
    affectedComponents: ["api-gateway"],
    immediateActions:   ["page on-call", "check status page"],
    estimatedImpact:    "All users blocked",
    confidenceScore:    0.88,
    evidenceRefs:       ["runbook-1"],
  },
  usage:      { inputTokens: 900, outputTokens: 300, totalTokens: 1200 },
  durationMs: 2000,
  modelId:    "claude-3-haiku",
  traceId:    "trace-ghi",
}

const MOCK_LLM_PROVIDER = {
  model:                 {} as never,
  tone:                  null,
  outputBudgetMultiplier: undefined,
}

// ── Shared input fixtures ─────────────────────────────────────────────────────

const AUTO_REPLY_INPUT = {
  productId:  "prod-test",
  caseId:     "case-001",
  jobId:      "job-001",
  signalText: "I cannot log in to the application",
}

const KNOWN_ISSUE_INPUT = {
  productId:  "prod-test",
  caseId:     "case-002",
  jobId:      "job-002",
  signalText: "Getting 500 errors on every API call",
}

const OUTAGE_ROUTING_INPUT = {
  productId:        "prod-test",
  caseId:           "case-003",
  jobId:            "job-003",
  outageDescription: "Database cluster unresponsive, all writes failing",
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Happy-path embedding default
  vi.mocked(embedText).mockResolvedValue({
    embedding:  MOCK_EMBEDDING,
    tokenCount: 10,
  })

  // Happy-path LLM provider default
  vi.mocked(getLlmProviderForProduct).mockResolvedValue(MOCK_LLM_PROVIDER as any)
})

// ─────────────────────────────────────────────────────────────────────────────
// QE-RES-01 / QE-RES-02 — runAutoReplyAgent
// ─────────────────────────────────────────────────────────────────────────────

describe("runAutoReplyAgent — resilience: embedding failure (QE-RES-01)", () => {
  it("QE-RES-01: does not throw when embedText() throws 'embedding API unavailable'", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embedding API unavailable"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_AUTO_REPLY_RESULT as any)

    // After QE-01 refactor, this will resolve. Currently it throws — test is red.
    await expect(runAutoReplyAgent(AUTO_REPLY_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-01 (variant): returns an AgentResult when embedText fails, not undefined", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("network timeout"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_AUTO_REPLY_RESULT as any)

    const result = await runAutoReplyAgent(AUTO_REPLY_INPUT)

    expect(result).toBeDefined()
    expect(result.output).toBeDefined()
  })
})

describe("runAutoReplyAgent — resilience: no_results abstain (QE-RES-02)", () => {
  it("QE-RES-02: does not throw when retrieve() returns no_results abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_AUTO_REPLY_RESULT as any)

    // After QE-01 refactor, auto-reply treats no_results as soft abstain.
    // Currently it throws PolicyViolationError because abstain==true and
    // abstainReason !== "insufficient_tier". Test is red.
    await expect(runAutoReplyAgent(AUTO_REPLY_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-02 (variant): runAgent is still called when retrieve returns no_results", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_AUTO_REPLY_RESULT as any)

    await runAutoReplyAgent(AUTO_REPLY_INPUT)

    // The agent should proceed to the LLM call even without RAG evidence
    expect(runAgent).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// QE-RES-03 / QE-RES-04 — runKnownIssueMatchAgent
// ─────────────────────────────────────────────────────────────────────────────

describe("runKnownIssueMatchAgent — resilience: embedding failure (QE-RES-03)", () => {
  it("QE-RES-03: does not throw when embedText() throws 'embedding API unavailable'", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embedding API unavailable"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_KNOWN_ISSUE_RESULT as any)

    // After QE-01 refactor this resolves gracefully. Currently it throws.
    await expect(runKnownIssueMatchAgent(KNOWN_ISSUE_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-03 (variant): result is a KnownIssueMatchResult shape when embedText fails", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("service unavailable"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_KNOWN_ISSUE_RESULT as any)

    const result = await runKnownIssueMatchAgent(KNOWN_ISSUE_INPUT)

    // Should return a valid KnownIssueMatchResult — either with agentResult or capabilityDisabled
    expect(result).toHaveProperty("capabilityDisabled")
  })
})

describe("runKnownIssueMatchAgent — resilience: no_results abstain (QE-RES-04)", () => {
  it("QE-RES-04: does not throw when retrieve() returns no_results abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_KNOWN_ISSUE_RESULT as any)

    // known_issue_match already soft-handles all abstain types (capabilityDisabled path).
    // After QE-01 refactor, no_results is also handled without throwing.
    await expect(runKnownIssueMatchAgent(KNOWN_ISSUE_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-04 (variant): no_results returns capabilityDisabled=true (soft abstain path)", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_KNOWN_ISSUE_RESULT as any)

    const result = await runKnownIssueMatchAgent(KNOWN_ISSUE_INPUT)

    // no_results is a soft abstain — agent should return capabilityDisabled=true
    // and NOT call the LLM, consistent with the existing abstain handling.
    expect(result.capabilityDisabled).toBe(true)
    expect(result.agentResult).toBeNull()
    expect(runAgent).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// QE-RES-05 / QE-RES-06 — runOutageRoutingAgent
// ─────────────────────────────────────────────────────────────────────────────

describe("runOutageRoutingAgent — resilience: embedding failure (QE-RES-05)", () => {
  it("QE-RES-05: does not throw when embedText() throws 'embedding API unavailable'", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embedding API unavailable"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_OUTAGE_ROUTING_RESULT as any)

    // After QE-01 refactor, outage-routing falls back to LLM call without RAG.
    // Currently it throws. Test is red.
    await expect(runOutageRoutingAgent(OUTAGE_ROUTING_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-05 (variant): runAgent is called even when embedText fails (outage is critical path)", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("timeout"))
    vi.mocked(runAgent).mockResolvedValue(MOCK_OUTAGE_ROUTING_RESULT as any)

    await runOutageRoutingAgent(OUTAGE_ROUTING_INPUT)

    // The outage routing LLM call should still be made — this is the critical path
    expect(runAgent).toHaveBeenCalledOnce()
  })
})

describe("runOutageRoutingAgent — resilience: no_results abstain (QE-RES-06)", () => {
  it("QE-RES-06: does not throw when retrieve() returns no_results abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_OUTAGE_ROUTING_RESULT as any)

    // After QE-01 refactor, outage-routing treats no_results as soft abstain and
    // continues with LLM call (no runbooks, but proceeds rather than throwing).
    // Currently it throws PolicyViolationError. Test is red.
    await expect(runOutageRoutingAgent(OUTAGE_ROUTING_INPUT)).resolves.toBeDefined()
  })

  it("QE-RES-06 (variant): runAgent is still called when retrieve returns no_results", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeNoResultsPack())
    vi.mocked(runAgent).mockResolvedValue(MOCK_OUTAGE_ROUTING_RESULT as any)

    await runOutageRoutingAgent(OUTAGE_ROUTING_INPUT)

    // The LLM call must proceed — routing without runbooks is better than no routing
    expect(runAgent).toHaveBeenCalledOnce()
  })
})
