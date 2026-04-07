/**
 * Unit tests: StewardWorker — shouldCreateSidecarCr predicate.
 *
 * Pure function (no I/O). Covers:
 *   - bug_report + infra labels  → true  (sidecar CR should be created)
 *   - bug_report + non-infra labels → false
 *   - bug_report + no labels     → false
 *   - non-bug_report types       → false (regardless of labels)
 *   - label case-insensitivity
 *   - all 10 canonical infra label tokens
 *
 * NF-UNIT-STWD-01 through NF-UNIT-STWD-20
 */

import { describe, it, expect } from "vitest"
import { shouldCreateSidecarCr } from "../../../src/workers/steward-worker.js"

// ── bug_report + infra labels → true ─────────────────────────────────────────

describe("shouldCreateSidecarCr — bug_report with infra labels", () => {
  it("NF-UNIT-STWD-01: returns true for 'performance' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["performance"])).toBe(true)
  })

  it("NF-UNIT-STWD-02: returns true for 'scaling' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["scaling"])).toBe(true)
  })

  it("NF-UNIT-STWD-03: returns true for 'infrastructure' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["infrastructure"])).toBe(true)
  })

  it("NF-UNIT-STWD-04: returns true for 'timeout' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["timeout"])).toBe(true)
  })

  it("NF-UNIT-STWD-05: returns true for 'worker' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["worker"])).toBe(true)
  })

  it("NF-UNIT-STWD-06: returns true for 'capacity' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["capacity"])).toBe(true)
  })

  it("NF-UNIT-STWD-07: returns true for 'memory' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["memory"])).toBe(true)
  })

  it("NF-UNIT-STWD-08: returns true for 'latency' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["latency"])).toBe(true)
  })

  it("NF-UNIT-STWD-09: returns true for 'queue' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["queue"])).toBe(true)
  })

  it("NF-UNIT-STWD-10: returns true for 'throughput' label", () => {
    expect(shouldCreateSidecarCr("bug_report", ["throughput"])).toBe(true)
  })

  it("NF-UNIT-STWD-11: returns true when infra label is mixed among non-infra labels", () => {
    expect(shouldCreateSidecarCr("bug_report", ["ui", "timeout", "login"])).toBe(true)
  })

  it("NF-UNIT-STWD-12: is case-insensitive — 'Performance' matches", () => {
    expect(shouldCreateSidecarCr("bug_report", ["Performance"])).toBe(true)
  })

  it("NF-UNIT-STWD-13: is case-insensitive — 'TIMEOUT' matches", () => {
    expect(shouldCreateSidecarCr("bug_report", ["TIMEOUT"])).toBe(true)
  })
})

// ── bug_report + no infra labels → false ────────────────────────────────────

describe("shouldCreateSidecarCr — bug_report without infra labels", () => {
  it("NF-UNIT-STWD-14: returns false when labels array is empty", () => {
    expect(shouldCreateSidecarCr("bug_report", [])).toBe(false)
  })

  it("NF-UNIT-STWD-15: returns false when labels contain no infra signals", () => {
    expect(shouldCreateSidecarCr("bug_report", ["ui", "login", "export"])).toBe(false)
  })
})

// ── non-bug_report types → always false ─────────────────────────────────────

describe("shouldCreateSidecarCr — non-bug_report case types", () => {
  it("NF-UNIT-STWD-16: returns false for user_request even with infra labels", () => {
    expect(shouldCreateSidecarCr("user_request", ["timeout", "performance"])).toBe(false)
  })

  it("NF-UNIT-STWD-17: returns false for user_feedback even with infra labels", () => {
    expect(shouldCreateSidecarCr("user_feedback", ["scaling"])).toBe(false)
  })

  it("NF-UNIT-STWD-18: returns false for sales_inquiry even with infra labels", () => {
    expect(shouldCreateSidecarCr("sales_inquiry", ["infrastructure"])).toBe(false)
  })

  it("NF-UNIT-STWD-19: returns false for outage_report (outage is always escalated, not this path)", () => {
    expect(shouldCreateSidecarCr("outage_report", ["timeout", "worker"])).toBe(false)
  })

  it("NF-UNIT-STWD-20: returns false for null case type", () => {
    expect(shouldCreateSidecarCr(null, ["performance"])).toBe(false)
  })
})
