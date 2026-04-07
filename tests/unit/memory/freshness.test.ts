/**
 * Unit tests for freshness score computation.
 * Covers computeFreshnessScore, isStaleForAutoReply, and hasStalenessWarning.
 *
 * Staleness windows per spec section 7.1:
 *   T1: 90 days   T2: 180 days   T3: 365 days   T4: null (no decay)
 */

import { describe, it, expect } from "vitest"
import {
  computeFreshnessScore,
  isStaleForAutoReply,
  hasStalenessWarning,
} from "../../../src/memory/ingestion/freshness.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a `now` date that is `daysAgo` days after `updatedAt`,
 * giving precise control over the elapsed-day count.
 */
function daysAgo(days: number): { updatedAt: Date; now: Date } {
  const now = new Date("2024-06-01T00:00:00.000Z")
  const updatedAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return { updatedAt, now }
}

// ── computeFreshnessScore ─────────────────────────────────────────────────────

describe("computeFreshnessScore", () => {
  describe("T4 — no decay, always 1.0", () => {
    it("returns 1.0 for T4 at 0 days old", () => {
      const { updatedAt, now } = daysAgo(0)
      expect(computeFreshnessScore(4, updatedAt, now)).toBe(1.0)
    })

    it("returns 1.0 for T4 at 365 days old", () => {
      const { updatedAt, now } = daysAgo(365)
      expect(computeFreshnessScore(4, updatedAt, now)).toBe(1.0)
    })

    it("returns 1.0 for T4 at 1000 days old", () => {
      const { updatedAt, now } = daysAgo(1000)
      expect(computeFreshnessScore(4, updatedAt, now)).toBe(1.0)
    })
  })

  describe("T1 — 90-day window", () => {
    it("returns 1.0 at day 0 (just updated)", () => {
      const { updatedAt, now } = daysAgo(0)
      expect(computeFreshnessScore(1, updatedAt, now)).toBe(1.0)
    })

    it("returns 0.5 at day 45 (half the window)", () => {
      const { updatedAt, now } = daysAgo(45)
      expect(computeFreshnessScore(1, updatedAt, now)).toBeCloseTo(0.5, 5)
    })

    it("returns 0.0 at day 90 (exactly at window boundary)", () => {
      const { updatedAt, now } = daysAgo(90)
      expect(computeFreshnessScore(1, updatedAt, now)).toBeCloseTo(0.0, 5)
    })

    it("clamps to 0.0 at day 100 (beyond window)", () => {
      const { updatedAt, now } = daysAgo(100)
      expect(computeFreshnessScore(1, updatedAt, now)).toBe(0.0)
    })

    it("returns ~0.667 at day 30", () => {
      const { updatedAt, now } = daysAgo(30)
      expect(computeFreshnessScore(1, updatedAt, now)).toBeCloseTo(1 - 30 / 90, 5)
    })
  })

  describe("T2 — 180-day window", () => {
    it("returns 1.0 at day 0", () => {
      const { updatedAt, now } = daysAgo(0)
      expect(computeFreshnessScore(2, updatedAt, now)).toBe(1.0)
    })

    it("returns 0.5 at day 90 (half the window)", () => {
      const { updatedAt, now } = daysAgo(90)
      expect(computeFreshnessScore(2, updatedAt, now)).toBeCloseTo(0.5, 5)
    })

    it("returns 0.0 at day 180 (exactly at window boundary)", () => {
      const { updatedAt, now } = daysAgo(180)
      expect(computeFreshnessScore(2, updatedAt, now)).toBeCloseTo(0.0, 5)
    })

    it("clamps to 0.0 beyond 180 days", () => {
      const { updatedAt, now } = daysAgo(200)
      expect(computeFreshnessScore(2, updatedAt, now)).toBe(0.0)
    })
  })

  describe("T3 — 365-day window", () => {
    it("returns 1.0 at day 0", () => {
      const { updatedAt, now } = daysAgo(0)
      expect(computeFreshnessScore(3, updatedAt, now)).toBe(1.0)
    })

    it("returns 0.5 at day 182.5 (half the window)", () => {
      const { updatedAt, now } = daysAgo(182.5)
      expect(computeFreshnessScore(3, updatedAt, now)).toBeCloseTo(0.5, 4)
    })

    it("returns 0.0 at day 365 (exactly at window boundary)", () => {
      const { updatedAt, now } = daysAgo(365)
      expect(computeFreshnessScore(3, updatedAt, now)).toBeCloseTo(0.0, 5)
    })

    it("clamps to 0.0 beyond 365 days", () => {
      const { updatedAt, now } = daysAgo(400)
      expect(computeFreshnessScore(3, updatedAt, now)).toBe(0.0)
    })
  })

  describe("default now parameter", () => {
    it("uses current time when now is not provided", () => {
      // A document updated just now should have a freshness very close to 1.0
      const justNow = new Date()
      const score = computeFreshnessScore(1, justNow)
      expect(score).toBeGreaterThan(0.99)
    })
  })
})

// ── isStaleForAutoReply ───────────────────────────────────────────────────────

describe("isStaleForAutoReply", () => {
  describe("T1 — auto-reply staleness enforced", () => {
    it("returns true when score is 0.29 (below 0.3 threshold)", () => {
      expect(isStaleForAutoReply(0.29, 1)).toBe(true)
    })

    it("returns false when score is 0.31 (above threshold)", () => {
      expect(isStaleForAutoReply(0.31, 1)).toBe(false)
    })

    it("returns false when score is exactly 0.3 (threshold is exclusive)", () => {
      // Implementation uses freshnessScore < 0.3, so 0.3 is NOT stale
      expect(isStaleForAutoReply(0.3, 1)).toBe(false)
    })

    it("returns true when score is 0.0", () => {
      expect(isStaleForAutoReply(0.0, 1)).toBe(true)
    })

    it("returns false when score is 1.0", () => {
      expect(isStaleForAutoReply(1.0, 1)).toBe(false)
    })
  })

  describe("T2 — auto-reply staleness enforced", () => {
    it("returns true when score is 0.1 for T2", () => {
      expect(isStaleForAutoReply(0.1, 2)).toBe(true)
    })

    it("returns false when score is 0.5 for T2", () => {
      expect(isStaleForAutoReply(0.5, 2)).toBe(false)
    })
  })

  describe("T3 — staleness never triggers auto-reply exclusion", () => {
    it("returns false for T3 regardless of score (0.0)", () => {
      expect(isStaleForAutoReply(0.0, 3)).toBe(false)
    })

    it("returns false for T3 regardless of score (0.1)", () => {
      expect(isStaleForAutoReply(0.1, 3)).toBe(false)
    })

    it("returns false for T3 with score 1.0", () => {
      expect(isStaleForAutoReply(1.0, 3)).toBe(false)
    })
  })

  describe("T4 — staleness never triggers auto-reply exclusion", () => {
    it("returns false for T4 regardless of score (0.0)", () => {
      expect(isStaleForAutoReply(0.0, 4)).toBe(false)
    })

    it("returns false for T4 regardless of score (0.29)", () => {
      expect(isStaleForAutoReply(0.29, 4)).toBe(false)
    })
  })
})

// ── hasStalenessWarning ───────────────────────────────────────────────────────

describe("hasStalenessWarning", () => {
  it("returns true when score is 0.49 (below 0.5 threshold)", () => {
    expect(hasStalenessWarning(0.49)).toBe(true)
  })

  it("returns false when score is 0.51 (above threshold)", () => {
    expect(hasStalenessWarning(0.51)).toBe(false)
  })

  it("returns false when score is exactly 0.5 (threshold is exclusive)", () => {
    // Implementation uses freshnessScore < 0.5, so 0.5 is NOT a warning
    expect(hasStalenessWarning(0.5)).toBe(false)
  })

  it("returns true when score is 0.0", () => {
    expect(hasStalenessWarning(0.0)).toBe(true)
  })

  it("returns false when score is 1.0", () => {
    expect(hasStalenessWarning(1.0)).toBe(false)
  })

  it("returns true when score is 0.1", () => {
    expect(hasStalenessWarning(0.1)).toBe(true)
  })
})
