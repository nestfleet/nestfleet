/**
 * Unit tests: buildEvidencePack() — QE-01 red phase.
 *
 * Tests the shared evidence pack builder that will live at src/agents/evidence.ts.
 * This module does NOT exist yet — all tests are expected to fail (red state)
 * with "Cannot find module" or "buildEvidencePack is not a function".
 *
 * Covers:
 *   QE-EVID-01: Success path — embedText + retrieve both succeed
 *   QE-EVID-02: Embedding failure — soft fail, returns empty evidence pack, no throw
 *   QE-EVID-03: Soft abstain — no_results → pass through, no throw
 *   QE-EVID-04: Soft abstain — insufficient_tier → pass through, no throw
 *   QE-EVID-05: Hard abstain — audience_violation → throws PolicyViolationError
 *   QE-EVID-06: Hard abstain — stale_evidence → throws PolicyViolationError
 *   QE-EVID-07: Hard abstain — knowledge_conflict → throws PolicyViolationError
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/memory/ingestion/embedder.js", () => ({
  embedText: vi.fn(),
}))

vi.mock("../../../src/memory/retrieval/retrieval-service.js", () => ({
  retrieve: vi.fn(),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { embedText } from "../../../src/memory/ingestion/embedder.js"
import { retrieve } from "../../../src/memory/retrieval/retrieval-service.js"
import type { EvidencePack } from "../../../src/memory/types.js"
import { PolicyViolationError } from "../../../src/agents/types.js"

// NOTE: This import is expected to fail (module not yet created) — that is the
// intentional red state for QE-01.
import { buildEvidencePack } from "../../../src/agents/evidence.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  productId: "prod-test",
  queryText: "Service is down and users cannot log in",
  actionType: "auto_reply",
  audience: "internal",
  topK: 15,
  topN: 5,
}

const MOCK_EMBEDDING: number[] = [0.1, 0.2, 0.3]

const FULL_EVIDENCE_PACK: EvidencePack = {
  chunks: [
    {
      chunkId:       "chunk-1",
      sourceType:    "faq",
      sourceUri:     "docs/faq.md",
      sectionPath:   "auth",
      contentType:   "prose",
      content:       "Authentication troubleshooting steps...",
      tier:          1,
      freshnessScore: 0.9,
      conflictFlag:  false,
      audience:      "public",
      score:         0.85,
    },
  ],
  tierSummary:  { 1: 1, 2: 0, 3: 0, 4: 0 },
  minFreshness: 0.9,
  avgFreshness: 0.9,
  hasConflicts: false,
  abstain:      false,
  abstainReason: null,
}

const EMPTY_EVIDENCE_PACK: EvidencePack = {
  chunks:       [],
  tierSummary:  { 1: 0, 2: 0, 3: 0, 4: 0 },
  minFreshness: 0,
  avgFreshness: 0,
  hasConflicts: false,
  abstain:      false,
  abstainReason: null,
}

function makeAbstainPack(reason: EvidencePack["abstainReason"]): EvidencePack {
  return {
    chunks:       [],
    tierSummary:  { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain:      true,
    abstainReason: reason,
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Happy-path defaults — individual tests override as needed
  vi.mocked(embedText).mockResolvedValue({
    embedding:  MOCK_EMBEDDING,
    tokenCount: 10,
  })
  vi.mocked(retrieve).mockResolvedValue(FULL_EVIDENCE_PACK)
})

// ── QE-EVID-01: Success path ───────────────────────────────────────────────────

describe("QE-EVID-01: success path — embedText + retrieve both succeed", () => {
  it("returns the evidence pack from retrieve() unchanged", async () => {
    const pack = await buildEvidencePack(BASE_INPUT)

    expect(pack).toEqual(FULL_EVIDENCE_PACK)
  })

  it("calls embedText with the query text sliced to 512 chars and the productId", async () => {
    await buildEvidencePack(BASE_INPUT)

    expect(embedText).toHaveBeenCalledOnce()
    expect(embedText).toHaveBeenCalledWith(
      BASE_INPUT.queryText.slice(0, 512),
      BASE_INPUT.productId,
    )
  })

  it("calls retrieve() with the computed embedding and all input parameters", async () => {
    await buildEvidencePack(BASE_INPUT)

    expect(retrieve).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(retrieve).mock.calls[0][0]
    expect(callArgs.productId).toBe(BASE_INPUT.productId)
    expect(callArgs.queryText).toBe(BASE_INPUT.queryText)
    expect(callArgs.queryEmbedding).toEqual(MOCK_EMBEDDING)
    expect(callArgs.actionType).toBe(BASE_INPUT.actionType)
  })

  it("passes optional audience, contentTypes, topK, topN through to retrieve()", async () => {
    const input = {
      ...BASE_INPUT,
      contentTypes: ["prose", "structured"] as const,
      topK: 20,
      topN: 8,
    }

    await buildEvidencePack(input)

    const callArgs = vi.mocked(retrieve).mock.calls[0][0]
    expect(callArgs.topK).toBe(20)
    expect(callArgs.topN).toBe(8)
    expect(callArgs.contentTypes).toEqual(["prose", "structured"])
  })
})

// ── QE-EVID-02: Embedding failure — soft fail ────────────────────────────────

describe("QE-EVID-02: embedding failure — soft fail, returns empty pack, no throw", () => {
  it("does NOT throw when embedText() throws", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embedding API unavailable"))

    await expect(buildEvidencePack(BASE_INPUT)).resolves.toBeDefined()
  })

  it("returns an evidence pack with abstain: false when embedText fails", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("connection refused"))

    const pack = await buildEvidencePack(BASE_INPUT)

    expect(pack.abstain).toBe(false)
  })

  it("returns an empty chunks array when embedText fails", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("timeout"))

    const pack = await buildEvidencePack(BASE_INPUT)

    expect(pack.chunks).toEqual([])
  })

  it("does NOT call retrieve() when embedText fails", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("API key invalid"))

    await buildEvidencePack(BASE_INPUT)

    expect(retrieve).not.toHaveBeenCalled()
  })
})

// ── QE-EVID-03: Soft abstain — no_results ────────────────────────────────────

describe("QE-EVID-03: soft abstain — no_results → pass through, no throw", () => {
  it("does NOT throw when retrieve returns no_results abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("no_results"))

    await expect(buildEvidencePack(BASE_INPUT)).resolves.toBeDefined()
  })

  it("returns the pack as-is (with abstain: true and reason 'no_results')", async () => {
    const noResultsPack = makeAbstainPack("no_results")
    vi.mocked(retrieve).mockResolvedValue(noResultsPack)

    const pack = await buildEvidencePack(BASE_INPUT)

    expect(pack.abstain).toBe(true)
    expect(pack.abstainReason).toBe("no_results")
    expect(pack.chunks).toEqual([])
  })
})

// ── QE-EVID-04: Soft abstain — insufficient_tier ─────────────────────────────

describe("QE-EVID-04: soft abstain — insufficient_tier → pass through, no throw", () => {
  it("does NOT throw when retrieve returns insufficient_tier abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("insufficient_tier"))

    await expect(buildEvidencePack(BASE_INPUT)).resolves.toBeDefined()
  })

  it("returns the pack as-is (with abstain: true and reason 'insufficient_tier')", async () => {
    const insufficientPack = makeAbstainPack("insufficient_tier")
    vi.mocked(retrieve).mockResolvedValue(insufficientPack)

    const pack = await buildEvidencePack(BASE_INPUT)

    expect(pack.abstain).toBe(true)
    expect(pack.abstainReason).toBe("insufficient_tier")
  })
})

// ── QE-EVID-05: Hard abstain — audience_violation ────────────────────────────

describe("QE-EVID-05: hard abstain — audience_violation → throws PolicyViolationError", () => {
  it("throws PolicyViolationError when retrieve returns audience_violation abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("audience_violation"))

    await expect(buildEvidencePack(BASE_INPUT)).rejects.toBeInstanceOf(PolicyViolationError)
  })

  it("error message contains the abstain reason 'audience_violation'", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("audience_violation"))

    const err = await buildEvidencePack(BASE_INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PolicyViolationError)
    expect((err as PolicyViolationError).message).toContain("audience_violation")
  })
})

// ── QE-EVID-06: Hard abstain — stale_evidence ────────────────────────────────

describe("QE-EVID-06: hard abstain — stale_evidence → throws PolicyViolationError", () => {
  it("throws PolicyViolationError when retrieve returns stale_evidence abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("stale_evidence"))

    await expect(buildEvidencePack(BASE_INPUT)).rejects.toBeInstanceOf(PolicyViolationError)
  })

  it("error message contains the abstain reason 'stale_evidence'", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("stale_evidence"))

    const err = await buildEvidencePack(BASE_INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PolicyViolationError)
    expect((err as PolicyViolationError).message).toContain("stale_evidence")
  })
})

// ── QE-EVID-07: Hard abstain — knowledge_conflict ────────────────────────────

describe("QE-EVID-07: hard abstain — knowledge_conflict → throws PolicyViolationError", () => {
  it("throws PolicyViolationError when retrieve returns knowledge_conflict abstain", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("knowledge_conflict"))

    await expect(buildEvidencePack(BASE_INPUT)).rejects.toBeInstanceOf(PolicyViolationError)
  })

  it("error message contains the abstain reason 'knowledge_conflict'", async () => {
    vi.mocked(retrieve).mockResolvedValue(makeAbstainPack("knowledge_conflict"))

    const err = await buildEvidencePack(BASE_INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PolicyViolationError)
    expect((err as PolicyViolationError).message).toContain("knowledge_conflict")
  })
})
