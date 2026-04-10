/**
 * Unit tests: triage post-processing — applyTriageOverrides + inferCaseType.
 *
 * Both are pure functions (no I/O). Covers:
 *   Rule 1 — config/how-to question downgrade cap  (high/critical → normal)
 *   Rule 2 — enterprise sales severity floor        (low → normal)
 *   inferCaseType — category → CaseType mapping, including sales_inquiry
 *
 * NF-UNIT-FLTW-01 through NF-UNIT-FLTW-22
 */

import { describe, it, expect } from "vitest"
import { applyTriageOverrides, inferCaseType } from "../../../src/workers/frontline-worker.js"

// ─── applyTriageOverrides ─────────────────────────────────────────────────────

describe("applyTriageOverrides — Rule 1: config/how-to downgrade cap", () => {
  // ── Category key detection ──────────────────────────────────────────────────

  it("NF-UNIT-FLTW-01: caps high → normal for 'configuration' category", () => {
    const { severity, overrideReason } = applyTriageOverrides("high", "configuration", [])
    expect(severity).toBe("normal")
    expect(overrideReason).toMatch(/config_question_cap/)
    expect(overrideReason).toMatch(/high→normal/)
  })

  it("NF-UNIT-FLTW-02: caps critical → normal for 'how-to' category", () => {
    const { severity, overrideReason } = applyTriageOverrides("critical", "how-to", [])
    expect(severity).toBe("normal")
    expect(overrideReason).toMatch(/critical→normal/)
  })

  it("NF-UNIT-FLTW-03: caps high → normal for 'setup' category", () => {
    const { severity } = applyTriageOverrides("high", "setup", [])
    expect(severity).toBe("normal")
  })

  it("NF-UNIT-FLTW-04: caps high → normal for 'question' category", () => {
    const { severity } = applyTriageOverrides("high", "question", [])
    expect(severity).toBe("normal")
  })

  it("NF-UNIT-FLTW-05: caps high → normal for 'feature-request' category", () => {
    const { severity } = applyTriageOverrides("high", "feature-request", [])
    expect(severity).toBe("normal")
  })

  // ── Label key detection ─────────────────────────────────────────────────────

  it("NF-UNIT-FLTW-06: caps high → normal when labels include 'how-to' (bug category)", () => {
    const { severity } = applyTriageOverrides("high", "authentication", ["how-to", "setup-guide"])
    expect(severity).toBe("normal")
  })

  it("NF-UNIT-FLTW-07: caps high → normal when labels include 'configuration'", () => {
    const { severity } = applyTriageOverrides("high", "integration", ["configuration"])
    expect(severity).toBe("normal")
  })

  // ── No-op cases ─────────────────────────────────────────────────────────────

  it("NF-UNIT-FLTW-08: does NOT cap when severity is already normal", () => {
    const { severity, overrideReason } = applyTriageOverrides("normal", "configuration", [])
    expect(severity).toBe("normal")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-09: does NOT cap when severity is low (not a downgrade scenario)", () => {
    const { severity, overrideReason } = applyTriageOverrides("low", "how-to", [])
    expect(severity).toBe("low")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-10: does NOT cap a non-config category with high severity", () => {
    const { severity, overrideReason } = applyTriageOverrides("high", "authentication", [])
    expect(severity).toBe("high")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-11: case-insensitive category matching", () => {
    const { severity } = applyTriageOverrides("high", "Configuration", [])
    expect(severity).toBe("normal")
  })
})

describe("applyTriageOverrides — Rule 2: enterprise sales severity floor", () => {
  // ── Happy path: category + enterprise label → raises low → normal ───────────

  it("NF-UNIT-FLTW-12: raises low → normal for sales_inquiry + enterprise label", () => {
    const { severity, overrideReason } = applyTriageOverrides("low", "sales_inquiry", ["enterprise", "soc2"])
    expect(severity).toBe("normal")
    expect(overrideReason).toMatch(/enterprise_sales_floor/)
    expect(overrideReason).toMatch(/low→normal/)
  })

  it("NF-UNIT-FLTW-13: raises low → normal for 'sales' category + soc2 label (DG-08 scenario)", () => {
    const { severity } = applyTriageOverrides("low", "sales", ["soc2", "on-premise", "sso", "okta", "sla", "enterprise"])
    expect(severity).toBe("normal")
  })

  it("NF-UNIT-FLTW-14: raises low → normal for 'pre-sales' category + compliance label", () => {
    const { severity } = applyTriageOverrides("low", "pre-sales", ["compliance"])
    expect(severity).toBe("normal")
  })

  it("NF-UNIT-FLTW-15: raises low → normal for 'presales' category + hipaa label", () => {
    const { severity } = applyTriageOverrides("low", "presales", ["hipaa"])
    expect(severity).toBe("normal")
  })

  // ── Does NOT fire when one condition is missing ────────────────────────────

  it("NF-UNIT-FLTW-16: does NOT raise when sales category but NO enterprise labels", () => {
    const { severity, overrideReason } = applyTriageOverrides("low", "sales_inquiry", ["pricing", "trial"])
    expect(severity).toBe("low")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-17: does NOT raise when enterprise labels but NOT a sales category", () => {
    const { severity, overrideReason } = applyTriageOverrides("low", "billing_inquiry", ["enterprise", "soc2"])
    // billing_inquiry is not in ENTERPRISE_CATEGORY_KEYS — no floor applied
    expect(severity).toBe("low")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-18: does NOT raise when severity is already normal (floor already met)", () => {
    const { severity, overrideReason } = applyTriageOverrides("normal", "sales_inquiry", ["enterprise"])
    expect(severity).toBe("normal")
    expect(overrideReason).toBeNull()
  })

  it("NF-UNIT-FLTW-19: does NOT raise high severity (floor only applies to low)", () => {
    const { severity, overrideReason } = applyTriageOverrides("high", "sales_inquiry", ["enterprise"])
    expect(severity).toBe("high")
    expect(overrideReason).toBeNull()
  })

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("NF-UNIT-FLTW-20: empty labels array — no enterprise floor", () => {
    const { severity } = applyTriageOverrides("low", "sales_inquiry", [])
    expect(severity).toBe("low")
  })
})

// ─── inferCaseType ────────────────────────────────────────────────────────────

describe("inferCaseType — category → CaseType mapping", () => {
  it("NF-UNIT-FLTW-21: maps 'sales_inquiry' category to sales_inquiry type", () => {
    expect(inferCaseType("sales_inquiry")).toBe("sales_inquiry")
  })

  it("NF-UNIT-FLTW-22: maps 'sales' category to sales_inquiry type", () => {
    expect(inferCaseType("sales")).toBe("sales_inquiry")
  })

  it("NF-UNIT-FLTW-23: maps 'pre-sales' category to sales_inquiry type", () => {
    expect(inferCaseType("pre-sales")).toBe("sales_inquiry")
  })

  it("NF-UNIT-FLTW-24: maps 'presales' category to sales_inquiry type", () => {
    expect(inferCaseType("presales")).toBe("sales_inquiry")
  })

  it("NF-UNIT-FLTW-25: maps 'sales inquiry' (space) category to sales_inquiry type", () => {
    expect(inferCaseType("sales inquiry")).toBe("sales_inquiry")
  })

  it("NF-UNIT-FLTW-26: maps 'authentication' to bug_report", () => {
    expect(inferCaseType("authentication")).toBe("bug_report")
  })

  it("NF-UNIT-FLTW-27: maps 'outage' to outage_report", () => {
    expect(inferCaseType("outage")).toBe("outage_report")
  })

  it("NF-UNIT-FLTW-28: maps 'feedback' to user_feedback", () => {
    expect(inferCaseType("feedback")).toBe("user_feedback")
  })

  it("NF-UNIT-FLTW-29: unknown category falls back to user_request", () => {
    expect(inferCaseType("unknown-xyz-category")).toBe("user_request")
  })

  // BEF-35 — stack trace / error categories
  it("NF-UNIT-FLTW-30: maps 'error' category to bug_report (BEF-35)", () => {
    expect(inferCaseType("error")).toBe("bug_report")
  })

  it("NF-UNIT-FLTW-30b: maps 'bug' category to bug_report (BEF-35 — LLM output variant)", () => {
    expect(inferCaseType("bug")).toBe("bug_report")
  })

  it("NF-UNIT-FLTW-31: maps 'crash' category to bug_report (BEF-35)", () => {
    expect(inferCaseType("crash")).toBe("bug_report")
  })

  it("NF-UNIT-FLTW-32: maps 'runtime error' category to bug_report (BEF-35)", () => {
    expect(inferCaseType("runtime error")).toBe("bug_report")
  })

  // BEF-34 — capability questions must not route to bug_report
  it("NF-UNIT-FLTW-33: maps 'capability question' category to user_request (BEF-34)", () => {
    expect(inferCaseType("capability question")).toBe("user_request")
  })

  it("NF-UNIT-FLTW-34: maps 'integration question' category to user_request (BEF-34)", () => {
    expect(inferCaseType("integration question")).toBe("user_request")
  })

  it("NF-UNIT-FLTW-35: plain 'integration' (broken) still maps to bug_report (BEF-34 no regression)", () => {
    expect(inferCaseType("integration")).toBe("bug_report")
  })
})

// BEF-35 — stack trace override rule
describe("applyTriageOverrides — Rule 3: stack trace signals are never config-downgraded", () => {
  it("NF-UNIT-FLTW-36: 'error' category with high severity is NOT downgraded by config cap", () => {
    // Config cap must not fire for error/crash categories even if labels include 'question'
    const { severity } = applyTriageOverrides("high", "error", ["question"])
    expect(severity).toBe("high")
  })

  it("NF-UNIT-FLTW-37: 'crash' category with critical severity is NOT downgraded by config cap", () => {
    const { severity } = applyTriageOverrides("critical", "crash", ["setup"])
    expect(severity).toBe("critical")
  })

  it("NF-UNIT-FLTW-38: 'runtime error' category with high severity is NOT downgraded", () => {
    const { severity } = applyTriageOverrides("high", "runtime error", ["configuration"])
    expect(severity).toBe("high")
  })

  it("NF-UNIT-FLTW-39: 'configuration' category with high severity IS still downgraded (rule 1 unchanged)", () => {
    const { severity } = applyTriageOverrides("high", "configuration", [])
    expect(severity).toBe("normal")
  })
})
