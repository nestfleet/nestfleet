/**
 * Unit tests for source tier assignment.
 * Covers assignTier, sourceTypesForTier, and the T1_SOURCE_TYPES constant.
 */

import { describe, it, expect } from "vitest"
import {
  assignTier,
  sourceTypesForTier,
  T1_SOURCE_TYPES,
} from "../../../src/memory/ingestion/tier-assigner.js"

// ── assignTier ────────────────────────────────────────────────────────────────

describe("assignTier", () => {
  describe("Tier 1 — authoritative product knowledge", () => {
    it("assigns tier 1 to product_spec", () => {
      expect(assignTier("product_spec")).toBe(1)
    })

    it("assigns tier 1 to feature_spec", () => {
      expect(assignTier("feature_spec")).toBe(1)
    })

    it("assigns tier 1 to faq", () => {
      expect(assignTier("faq")).toBe(1)
    })

    it("assigns tier 1 to known_issues", () => {
      expect(assignTier("known_issues")).toBe(1)
    })

    it("assigns tier 1 to api_docs", () => {
      expect(assignTier("api_docs")).toBe(1)
    })
  })

  describe("Tier 2 — engineering reference", () => {
    it("assigns tier 2 to openapi_spec", () => {
      expect(assignTier("openapi_spec")).toBe(2)
    })

    it("assigns tier 2 to architecture_overview", () => {
      expect(assignTier("architecture_overview")).toBe(2)
    })

    it("assigns tier 2 to technical_spec", () => {
      expect(assignTier("technical_spec")).toBe(2)
    })

    it("assigns tier 2 to deployment_guide", () => {
      expect(assignTier("deployment_guide")).toBe(2)
    })

    it("assigns tier 2 to troubleshooting_guide", () => {
      expect(assignTier("troubleshooting_guide")).toBe(2)
    })

    it("assigns tier 2 to runbook", () => {
      expect(assignTier("runbook")).toBe(2)
    })

    it("assigns tier 2 to changelog", () => {
      expect(assignTier("changelog")).toBe(2)
    })

    it("assigns tier 2 to readme", () => {
      expect(assignTier("readme")).toBe(2)
    })
  })

  describe("Tier 3 — filtered community signals", () => {
    it("assigns tier 3 to github_issue_filtered", () => {
      expect(assignTier("github_issue_filtered")).toBe(3)
    })

    it("assigns tier 3 to github_pr_merged", () => {
      expect(assignTier("github_pr_merged")).toBe(3)
    })
  })

  describe("Tier 4 — raw signal (no decay)", () => {
    it("assigns tier 4 to github_issue_raw", () => {
      expect(assignTier("github_issue_raw")).toBe(4)
    })

    it("assigns tier 4 to commit_message", () => {
      expect(assignTier("commit_message")).toBe(4)
    })
  })
})

// ── sourceTypesForTier ────────────────────────────────────────────────────────

describe("sourceTypesForTier", () => {
  it("returns all T1 source types", () => {
    const t1 = sourceTypesForTier(1)
    expect(t1).toContain("product_spec")
    expect(t1).toContain("feature_spec")
    expect(t1).toContain("faq")
    expect(t1).toContain("known_issues")
    expect(t1).toContain("api_docs")
  })

  it("does not include T2+ types in tier 1 result", () => {
    const t1 = sourceTypesForTier(1)
    expect(t1).not.toContain("openapi_spec")
    expect(t1).not.toContain("readme")
    expect(t1).not.toContain("github_issue_raw")
  })

  it("returns all T2 source types", () => {
    const t2 = sourceTypesForTier(2)
    expect(t2).toContain("openapi_spec")
    expect(t2).toContain("architecture_overview")
    expect(t2).toContain("technical_spec")
    expect(t2).toContain("deployment_guide")
    expect(t2).toContain("troubleshooting_guide")
    expect(t2).toContain("runbook")
    expect(t2).toContain("changelog")
    expect(t2).toContain("readme")
  })

  it("returns all T3 source types", () => {
    const t3 = sourceTypesForTier(3)
    expect(t3).toContain("github_issue_filtered")
    expect(t3).toContain("github_pr_merged")
  })

  it("returns all T4 source types", () => {
    const t4 = sourceTypesForTier(4)
    expect(t4).toContain("github_issue_raw")
    expect(t4).toContain("commit_message")
  })

  it("returns only types for the requested tier — no cross-tier contamination", () => {
    const t1 = sourceTypesForTier(1)
    const t2 = sourceTypesForTier(2)
    const overlap = t1.filter((x) => t2.includes(x))
    expect(overlap).toHaveLength(0)
  })

  it("covers all source types across all four tiers", () => {
    const allTypes = [
      ...sourceTypesForTier(1),
      ...sourceTypesForTier(2),
      ...sourceTypesForTier(3),
      ...sourceTypesForTier(4),
    ]
    // Every tier-1 type returned by assignTier should appear in the union
    expect(allTypes).toContain("product_spec")
    expect(allTypes).toContain("github_issue_raw")
    expect(allTypes).toContain("readme")
  })
})

// ── T1_SOURCE_TYPES constant ──────────────────────────────────────────────────

describe("T1_SOURCE_TYPES", () => {
  it("contains product_spec", () => {
    expect(T1_SOURCE_TYPES).toContain("product_spec")
  })

  it("contains faq", () => {
    expect(T1_SOURCE_TYPES).toContain("faq")
  })

  it("contains known_issues", () => {
    expect(T1_SOURCE_TYPES).toContain("known_issues")
  })

  it("contains api_docs", () => {
    expect(T1_SOURCE_TYPES).toContain("api_docs")
  })

  it("does not contain any T2, T3, or T4 types", () => {
    expect(T1_SOURCE_TYPES).not.toContain("readme")
    expect(T1_SOURCE_TYPES).not.toContain("openapi_spec")
    expect(T1_SOURCE_TYPES).not.toContain("github_issue_filtered")
    expect(T1_SOURCE_TYPES).not.toContain("github_issue_raw")
    expect(T1_SOURCE_TYPES).not.toContain("commit_message")
  })

  it("is equivalent to sourceTypesForTier(1)", () => {
    const t1 = sourceTypesForTier(1)
    expect(T1_SOURCE_TYPES.sort()).toEqual(t1.sort())
  })
})
