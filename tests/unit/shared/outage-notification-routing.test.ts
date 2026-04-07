/**
 * Unit tests for routing logic in steward-worker.ts — SLICE-02/SLICE-14.
 * NF-UNIT-70+
 *
 * decideRouting() and lead-selection logic are not exported, so pure logic
 * is mirrored here for testability.
 */

import { describe, it, expect } from "vitest"

type CaseType     = "bug_report" | "outage_report" | "user_request" | "user_feedback"
type CaseSeverity = "critical" | "high" | "normal" | "low"

type RoutingDecision =
  | { nextStatus: "awaiting-lead"; reason: string }
  | { nextStatus: "in-resolution"; reason: string }
  | { nextStatus: "in-change"; reason: string; createChangeRequest: true }

function decideRouting(
  caseType: CaseType | null,
  severity: CaseSeverity | null,
  knownIssueMatched: boolean,
  knownIssueConfidence: number,
): RoutingDecision {
  if (severity === "critical") {
    return { nextStatus: "awaiting-lead", reason: "critical_severity_requires_lead" }
  }
  if (caseType === "outage_report") {
    return { nextStatus: "awaiting-lead", reason: "outage_always_escalates" }
  }
  if (caseType === "bug_report" && knownIssueMatched && knownIssueConfidence >= 0.80) {
    return { nextStatus: "in-resolution", reason: "bug_known_issue_match" }
  }
  if (caseType === "bug_report") {
    return { nextStatus: "in-change", reason: "bug_no_known_issue", createChangeRequest: true }
  }
  if (caseType === "user_request") {
    return { nextStatus: "in-resolution", reason: "user_request_direct_resolution" }
  }
  if (caseType === "user_feedback") {
    return { nextStatus: "in-resolution", reason: "user_feedback_acknowledged" }
  }
  return { nextStatus: "awaiting-lead", reason: "unknown_case_type_escalated" }
}

function decideLeadRoles(
  nextStatus: RoutingDecision["nextStatus"],
  caseType: CaseType | null,
  severity: CaseSeverity | null,
): readonly string[] {
  const isOutage         = caseType === "outage_report"
  const isHighOrCritical = severity === "critical" || severity === "high"
  const shouldNotify     = nextStatus === "awaiting-lead" && (isOutage || severity === "critical")
  if (!shouldNotify) return []
  return (isOutage && isHighOrCritical)
    ? ["support_lead", "product_lead", "change_lead"]
    : ["support_lead"]
}

describe("decideRouting()", () => {
  it("NF-UNIT-70: critical severity → awaiting-lead", () => {
    const r = decideRouting("user_request", "critical", false, 0)
    expect(r.nextStatus).toBe("awaiting-lead")
    expect(r.reason).toBe("critical_severity_requires_lead")
  })

  it("NF-UNIT-71: outage_report → awaiting-lead", () => {
    const r = decideRouting("outage_report", "normal", false, 0)
    expect(r.nextStatus).toBe("awaiting-lead")
    expect(r.reason).toBe("outage_always_escalates")
  })

  it("NF-UNIT-72: bug_report no known issue → in-change", () => {
    const r = decideRouting("bug_report", "normal", false, 0)
    expect(r.nextStatus).toBe("in-change")
    expect("createChangeRequest" in r).toBe(true)
  })

  it("NF-UNIT-73: bug_report + known issue >= 0.80 → in-resolution", () => {
    const r = decideRouting("bug_report", "normal", true, 0.85)
    expect(r.nextStatus).toBe("in-resolution")
  })

  it("NF-UNIT-74: bug_report + known issue < 0.80 → in-change", () => {
    const r = decideRouting("bug_report", "normal", true, 0.75)
    expect(r.nextStatus).toBe("in-change")
  })

  it("NF-UNIT-75: user_request → in-resolution", () => {
    const r = decideRouting("user_request", "normal", false, 0)
    expect(r.nextStatus).toBe("in-resolution")
  })

  it("NF-UNIT-76: user_feedback → in-resolution", () => {
    const r = decideRouting("user_feedback", "low", false, 0)
    expect(r.nextStatus).toBe("in-resolution")
  })

  it("NF-UNIT-77: null case type → awaiting-lead", () => {
    const r = decideRouting(null, "normal", false, 0)
    expect(r.nextStatus).toBe("awaiting-lead")
  })

  it("NF-UNIT-78: critical overrides outage_report routing reason", () => {
    const r = decideRouting("outage_report", "critical", false, 0)
    expect(r.reason).toBe("critical_severity_requires_lead")
  })
})

describe("Notification lead-selection logic", () => {
  it("NF-UNIT-79: outage + critical → all 3 leads", () => {
    const roles = decideLeadRoles("awaiting-lead", "outage_report", "critical")
    expect(roles).toHaveLength(3)
    expect(roles).toContain("support_lead")
    expect(roles).toContain("product_lead")
    expect(roles).toContain("change_lead")
  })

  it("NF-UNIT-80: outage + high → all 3 leads", () => {
    const roles = decideLeadRoles("awaiting-lead", "outage_report", "high")
    expect(roles).toHaveLength(3)
  })

  it("NF-UNIT-81: outage + normal → support_lead only", () => {
    const roles = decideLeadRoles("awaiting-lead", "outage_report", "normal")
    expect(roles).toEqual(["support_lead"])
  })

  it("NF-UNIT-82: outage + low → support_lead only", () => {
    const roles = decideLeadRoles("awaiting-lead", "outage_report", "low")
    expect(roles).toEqual(["support_lead"])
  })

  it("NF-UNIT-83: non-outage critical → support_lead only", () => {
    const roles = decideLeadRoles("awaiting-lead", "bug_report", "critical")
    expect(roles).toEqual(["support_lead"])
  })

  it("NF-UNIT-84: in-resolution → no notifications", () => {
    const roles = decideLeadRoles("in-resolution", "user_request", "normal")
    expect(roles).toHaveLength(0)
  })

  it("NF-UNIT-85: in-change → no notifications", () => {
    const roles = decideLeadRoles("in-change", "bug_report", "high")
    expect(roles).toHaveLength(0)
  })
})
