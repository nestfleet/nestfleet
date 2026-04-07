/**
 * Unit tests: Retrieval service internal logic — P0 abstain paths.
 *
 * Tests the three pure-function layers that determine whether an evidence pack
 * is returned or an abstain signal is raised:
 *
 *   1. rerankCandidates   — composite score formula (fused * tier_weight * freshness)
 *   2. applyVersionFilter — version-aware chunk filtering
 *   3. evaluateAbstain    — policy gates: audience_violation, knowledge_conflict,
 *                          insufficient_tier, stale_evidence
 *
 * Note on audience_violation: EvidenceChunk does not carry an `audience` field
 * (it is stripped during assembly in assembleEvidencePack). The evaluateAbstain
 * function accesses (c as any).audience, which means `audience_violation` never
 * fires through the normal pipeline. Tests below exercise the function in
 * isolation using synthetic chunks with `audience` set to cover the branch.
 * This is a known gap — tracked as a follow-up to propagate `audience` through
 * to EvidenceChunk.
 */

import { describe, it, expect } from "vitest"
import {
  rerankCandidates,
  applyVersionFilter,
  evaluateAbstain,
  type RawCandidate,
} from "../../../src/memory/retrieval/retrieval-service.js"
import type { EvidenceChunk, RetrievalRequest } from "../../../src/memory/types.js"

// ── Test factories ────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    chunkId: "chunk1",
    sourceType: "faq",
    sourceUri: "docs/faq.md",
    sectionPath: "section/1",
    contentType: "prose",
    content: "some content",
    tier: 1,
    freshnessScore: 1.0,
    conflictFlag: false,
    productVersion: "*",
    audience: "public",
    vectorScore: 0.5,
    textScore: 0.5,
    ...overrides,
  }
}

function makeChunk(overrides: Partial<EvidenceChunk> = {}): EvidenceChunk {
  return {
    chunkId: "chunk1",
    sourceType: "faq",
    sourceUri: "docs/faq.md",
    sectionPath: "section/1",
    contentType: "prose",
    content: "some content",
    tier: 1,
    freshnessScore: 1.0,
    conflictFlag: false,
    score: 0.8,
    ...overrides,
  }
}

const baseRequest: RetrievalRequest = {
  productId: "prod1",
  queryText: "how to reset password",
  queryEmbedding: [],
  audience: "public",
}

// ── rerankCandidates ──────────────────────────────────────────────────────────

describe("rerankCandidates", () => {
  it("T1 fresh: composite score = fusedScore * 1.0 * 1.0", () => {
    const c = makeRaw({ vectorScore: 0.8, tier: 1, freshnessScore: 1.0 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.8)
  })

  it("T2: tier_weight = 0.85", () => {
    const c = makeRaw({ vectorScore: 1.0, tier: 2, freshnessScore: 1.0 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.85)
  })

  it("T3: tier_weight = 0.65", () => {
    const c = makeRaw({ vectorScore: 1.0, tier: 3, freshnessScore: 1.0 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.65)
  })

  it("T4: tier_weight = 0.45", () => {
    const c = makeRaw({ vectorScore: 1.0, tier: 4, freshnessScore: 1.0 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.45)
  })

  it("freshness 0.5 halves the score", () => {
    const c = makeRaw({ vectorScore: 1.0, tier: 1, freshnessScore: 0.5 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.5) // 1.0 * 1.0 * 0.5
  })

  it("freshness 0.0 is floored to 0.1 — score is not zeroed out", () => {
    // Formula uses Math.max(freshnessScore, 0.1) to prevent total score collapse
    const c = makeRaw({ vectorScore: 1.0, tier: 1, freshnessScore: 0.0 })
    const [result] = rerankCandidates([c])
    expect(result.vectorScore).toBeCloseTo(0.1) // 1.0 * 1.0 * max(0, 0.1) = 0.1
  })

  it("sorts candidates by composite score descending", () => {
    const low = makeRaw({ chunkId: "low", vectorScore: 0.5, tier: 4, freshnessScore: 1.0 })  // 0.5 * 0.45 * 1.0 = 0.225
    const high = makeRaw({ chunkId: "high", vectorScore: 0.5, tier: 1, freshnessScore: 1.0 }) // 0.5 * 1.0 * 1.0 = 0.5
    const result = rerankCandidates([low, high])
    expect(result[0].chunkId).toBe("high")
    expect(result[1].chunkId).toBe("low")
  })

  it("T1 fresh at moderate base score outranks T4 at high base score", () => {
    // T1: 0.7 * 1.0 * 0.8 = 0.56  vs  T4: 1.0 * 0.45 * 1.0 = 0.45
    const t1 = makeRaw({ chunkId: "t1", vectorScore: 0.7, tier: 1, freshnessScore: 0.8 })
    const t4 = makeRaw({ chunkId: "t4", vectorScore: 1.0, tier: 4, freshnessScore: 1.0 })
    const result = rerankCandidates([t4, t1])
    expect(result[0].chunkId).toBe("t1")
  })

  it("does not mutate the original array", () => {
    const a = makeRaw({ chunkId: "a", vectorScore: 0.1 })
    const b = makeRaw({ chunkId: "b", vectorScore: 0.9 })
    const original = [a, b]
    rerankCandidates(original)
    expect(original[0].chunkId).toBe("a") // original order preserved
  })
})

// ── applyVersionFilter ────────────────────────────────────────────────────────

describe("applyVersionFilter", () => {
  it("returns all candidates when no version specified", () => {
    const candidates = [makeRaw({ productVersion: "1.0" }), makeRaw({ chunkId: "c2", productVersion: "2.0" })]
    expect(applyVersionFilter(candidates)).toHaveLength(2)
  })

  it("returns all candidates when version is undefined", () => {
    const candidates = [makeRaw()]
    expect(applyVersionFilter(candidates, undefined)).toHaveLength(1)
  })

  it("keeps only chunks matching the requested version", () => {
    const candidates = [
      makeRaw({ chunkId: "v1", productVersion: "1.0" }),
      makeRaw({ chunkId: "v2", productVersion: "2.0" }),
    ]
    const result = applyVersionFilter(candidates, "1.0")
    expect(result).toHaveLength(1)
    expect(result[0].chunkId).toBe("v1")
  })

  it("keeps version-agnostic chunks ('*') regardless of requested version", () => {
    const candidates = [
      makeRaw({ chunkId: "any", productVersion: "*" }),
      makeRaw({ chunkId: "v2", productVersion: "2.0" }),
    ]
    const result = applyVersionFilter(candidates, "1.0")
    expect(result).toHaveLength(1)
    expect(result[0].chunkId).toBe("any")
  })

  it("keeps both wildcard and version-matching chunks", () => {
    const candidates = [
      makeRaw({ chunkId: "any", productVersion: "*" }),
      makeRaw({ chunkId: "v1", productVersion: "1.0" }),
      makeRaw({ chunkId: "v2", productVersion: "2.0" }),
    ]
    const result = applyVersionFilter(candidates, "1.0")
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.chunkId)).toContain("any")
    expect(result.map((c) => c.chunkId)).toContain("v1")
  })

  it("returns empty array when nothing matches", () => {
    const candidates = [makeRaw({ productVersion: "3.0" })]
    expect(applyVersionFilter(candidates, "1.0")).toHaveLength(0)
  })
})

// ── evaluateAbstain ───────────────────────────────────────────────────────────

describe("evaluateAbstain", () => {
  describe("null — no abstain", () => {
    it("returns null when all conditions pass (T1 fresh chunk, auto_reply)", () => {
      const chunks = [makeChunk({ tier: 1, freshnessScore: 0.8 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBeNull()
    })

    it("returns null with no actionType specified", () => {
      const chunks = [makeChunk()]
      expect(evaluateAbstain(chunks, baseRequest)).toBeNull()
    })
  })

  describe("audience_violation", () => {
    // NOTE: In the live pipeline, EvidenceChunk doesn't carry `audience` so this
    // branch can't fire through assembleEvidencePack. Tests exercise the branch
    // directly with synthetic chunks that carry the `audience` property.

    it("returns 'audience_violation' when public request has only internal chunks", () => {
      const chunk = makeChunk()
      ;(chunk as any).audience = "internal"
      expect(evaluateAbstain([chunk], { ...baseRequest, audience: "public" })).toBe("audience_violation")
    })

    it("returns null when public request has at least one non-internal chunk", () => {
      const chunk = makeChunk() // audience undefined → treated as public
      expect(evaluateAbstain([chunk], { ...baseRequest, audience: "public" })).toBeNull()
    })

    it("audience_violation is checked before knowledge_conflict", () => {
      const chunk = makeChunk({ conflictFlag: true })
      ;(chunk as any).audience = "internal"
      // Conflict is present, but audience_violation fires first
      expect(evaluateAbstain([chunk], { ...baseRequest, audience: "public" })).toBe("audience_violation")
    })
  })

  describe("knowledge_conflict", () => {
    it("returns 'knowledge_conflict' when any chunk has conflictFlag === true", () => {
      const chunks = [makeChunk({ conflictFlag: true })]
      expect(evaluateAbstain(chunks, baseRequest)).toBe("knowledge_conflict")
    })

    it("returns 'knowledge_conflict' when one of multiple chunks conflicts", () => {
      const chunks = [
        makeChunk({ chunkId: "clean" }),
        makeChunk({ chunkId: "conflict", conflictFlag: true }),
      ]
      expect(evaluateAbstain(chunks, baseRequest)).toBe("knowledge_conflict")
    })

    it("fires before tier gate (wrong tier AND conflict → conflict wins)", () => {
      const chunks = [makeChunk({ tier: 3, conflictFlag: true })]
      // Tier 3 would fail the auto_reply T1 gate, but conflict fires first
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("knowledge_conflict")
    })
  })

  describe("insufficient_tier", () => {
    it("auto_reply requires T1 — returns 'insufficient_tier' when only T2 present", () => {
      const chunks = [makeChunk({ tier: 2 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("insufficient_tier")
    })

    it("auto_reply: returns null when T1 chunk is present", () => {
      const chunks = [makeChunk({ tier: 1 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBeNull()
    })

    it("outage_routing requires T1 — returns 'insufficient_tier' when only T2 present", () => {
      const chunks = [makeChunk({ tier: 2 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "outage_routing" })).toBe("insufficient_tier")
    })

    it("triage requires T2 — returns 'insufficient_tier' when only T3/T4 present", () => {
      const chunks = [
        makeChunk({ chunkId: "t3", tier: 3 }),
        makeChunk({ chunkId: "t4", tier: 4 }),
      ]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).toBe("insufficient_tier")
    })

    it("triage: T2 is sufficient — returns null", () => {
      const chunks = [makeChunk({ tier: 2 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).toBeNull()
    })

    it("triage: T1 also satisfies the T2 requirement", () => {
      const chunks = [makeChunk({ tier: 1 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).toBeNull()
    })

    it("change_prep, known_issue_match, pr_draft_prep all require T2", () => {
      const t3Only = [makeChunk({ tier: 3 })]
      for (const actionType of ["change_prep", "known_issue_match", "pr_draft_prep"] as const) {
        expect(
          evaluateAbstain(t3Only, { ...baseRequest, actionType }),
          `${actionType} should return insufficient_tier`,
        ).toBe("insufficient_tier")
      }
    })
  })

  describe("stale_evidence", () => {
    it("returns 'stale_evidence' for auto_reply when best T1 chunk freshness < 0.3", () => {
      const chunks = [makeChunk({ tier: 1, freshnessScore: 0.1 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("stale_evidence")
    })

    it("returns 'stale_evidence' for outage_routing with stale T1", () => {
      const chunks = [makeChunk({ tier: 1, freshnessScore: 0.0 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "outage_routing" })).toBe("stale_evidence")
    })

    it("returns null for auto_reply when best T1 freshness is exactly 0.3 (boundary exclusive)", () => {
      // Implementation: freshnessScore < 0.3, so 0.3 is NOT stale
      const chunks = [makeChunk({ tier: 1, freshnessScore: 0.3 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBeNull()
    })

    it("returns 'stale_evidence' for auto_reply when best T2 chunk freshness < 0.3", () => {
      // auto_reply MIN_TIER = 1, but evaluateAbstain checks T1/T2 (tier <= 2)
      // To reach stale check with T2, we need a T1 present for tier gate but T2 as best
      // Actually: auto_reply requires T1 in pack. If T2 only → insufficient_tier fires first.
      // So for stale_evidence with T2: need a T1 present too, but T2 ranked first.
      // However, chunks.find(c => c.tier <= 2) finds T1 or T2 — whichever appears first.
      // With a fresh T1 ranked second and stale T2 ranked first, T2 is checked.
      const chunks = [
        makeChunk({ chunkId: "stale-t2", tier: 2, freshnessScore: 0.1, score: 0.9 }), // first
        makeChunk({ chunkId: "fresh-t1", tier: 1, freshnessScore: 0.9, score: 0.5 }), // second
      ]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("stale_evidence")
    })

    it("uses the first (highest-ranked) T1/T2 chunk — fresh first means no abstain", () => {
      // First chunk is T1 fresh; second is T1 stale → check uses first only
      const chunks = [
        makeChunk({ chunkId: "fresh", tier: 1, freshnessScore: 0.9, score: 0.9 }),
        makeChunk({ chunkId: "stale", tier: 1, freshnessScore: 0.0, score: 0.5 }),
      ]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBeNull()
    })

    it("fresh T3 chunks do not rescue a stale T1 — SPIKE-01 finding", () => {
      // T3 chunks with freshness=1.0 should NOT prevent stale_evidence from triggering
      const chunks = [
        makeChunk({ chunkId: "stale-t1", tier: 1, freshnessScore: 0.1, score: 0.8 }),
        makeChunk({ chunkId: "fresh-t3", tier: 3, freshnessScore: 1.0, score: 0.6 }),
      ]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("stale_evidence")
    })

    it("does NOT trigger for triage — triage is not in the stale-check list", () => {
      // triage is not auto_reply or outage_routing, so stale check is skipped
      const chunks = [makeChunk({ tier: 1, freshnessScore: 0.0 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).toBeNull()
    })

    it("does NOT trigger when pack has no T1/T2 chunks (T3 only)", () => {
      // For outage_routing: if no T1 → insufficient_tier fires before stale check
      // To test: use triage (T2 sufficient) with only T3 — no stale check since no T1/T2
      // For triage T3-only → insufficient_tier (no T2)
      // Edge: action with T2 gate + only T3/T4 → insufficient_tier, not stale_evidence
      const chunks = [makeChunk({ tier: 3, freshnessScore: 0.0 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).toBe("insufficient_tier")
      // Confirm it's not stale_evidence
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "triage" })).not.toBe("stale_evidence")
    })
  })

  describe("abstain priority order", () => {
    it("audience_violation > knowledge_conflict", () => {
      const chunk = makeChunk({ conflictFlag: true })
      ;(chunk as any).audience = "internal"
      expect(evaluateAbstain([chunk], { ...baseRequest, audience: "public" })).toBe("audience_violation")
    })

    it("knowledge_conflict > insufficient_tier", () => {
      const chunks = [makeChunk({ tier: 3, conflictFlag: true })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("knowledge_conflict")
    })

    it("insufficient_tier > stale_evidence", () => {
      // No T1 in pack for auto_reply AND the T2 is stale — tier check fires first
      const chunks = [makeChunk({ tier: 2, freshnessScore: 0.0 })]
      expect(evaluateAbstain(chunks, { ...baseRequest, actionType: "auto_reply" })).toBe("insufficient_tier")
    })
  })
})
