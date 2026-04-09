/**
 * Unit tests: CaseStateMachine — SLICE-14A + QE-05.
 *
 * Tests the transition guard logic without DB. Pure function tests for
 * isCaseTransitionAllowed() covering every state and edge cases.
 *
 * QE-05 additions: "processing-failed" state and its recovery transitions.
 */

import { describe, it, expect } from "vitest"
import { isCaseTransitionAllowed } from "../../../src/domain/case-state-machine.js"
import type { CaseStatus } from "../../../src/infra/db/repositories/cases.js"

// ── Full allowed-transition map from case-and-change-lifecycle.md §5.1 + QE-05

const EXPECTED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  "new":                ["enriching", "closed"],
  "enriching":          ["triaged", "awaiting-user", "in-resolution", "closed"],
  "triaged":            ["in-resolution", "awaiting-lead", "in-change", "resolved"],
  "awaiting-user":      ["enriching", "resolved", "closed"],
  "awaiting-lead":      ["in-resolution", "in-change", "resolved", "closed"],
  "in-resolution":      ["resolved", "awaiting-user", "awaiting-lead", "in-change"],
  "in-change":          ["pr-drafting", "awaiting-lead", "resolved", "closed"],
  "pr-drafting":        ["resolved", "awaiting-lead", "closed"],
  "resolved":           ["closed", "awaiting-user", "awaiting-lead"],
  "closed":             [],
  // QE-05: recovery paths from the dead-letter failure state
  "processing-failed":  ["enriching", "resolved", "closed"],
}

const ALL_STATUSES: CaseStatus[] = [
  "new", "enriching", "triaged", "awaiting-user", "awaiting-lead",
  "in-resolution", "in-change", "pr-drafting", "resolved", "closed",
  "processing-failed",
]

describe("CaseStateMachine — isCaseTransitionAllowed", () => {
  // ── Legal transitions ──────────────────────────────────────────────────────

  describe("allows legal transitions", () => {
    for (const [from, targets] of Object.entries(EXPECTED_TRANSITIONS)) {
      for (const to of targets) {
        it(`${from} → ${to}`, () => {
          expect(isCaseTransitionAllowed(from as CaseStatus, to as CaseStatus)).toBe(true)
        })
      }
    }
  })

  // ── Illegal transitions (exhaustive) ───────────────────────────────────────

  describe("blocks illegal transitions", () => {
    for (const from of ALL_STATUSES) {
      const allowed = new Set(EXPECTED_TRANSITIONS[from])
      const illegal = ALL_STATUSES.filter((s) => s !== from && !allowed.has(s))

      for (const to of illegal) {
        it(`${from} → ${to} is BLOCKED`, () => {
          expect(isCaseTransitionAllowed(from, to)).toBe(false)
        })
      }
    }
  })

  // ── Self-transitions ──────────────────────────────────────────────────────

  describe("blocks self-transitions", () => {
    for (const status of ALL_STATUSES) {
      it(`${status} → ${status} is BLOCKED`, () => {
        expect(isCaseTransitionAllowed(status, status)).toBe(false)
      })
    }
  })

  // ── Edge cases from SA review ─────────────────────────────────────────────

  describe("SA review edge cases", () => {
    it("enriching → in-change is BLOCKED (must go through triaged)", () => {
      expect(isCaseTransitionAllowed("enriching", "in-change")).toBe(false)
    })

    it("enriching → in-resolution is ALLOWED (CHAT-UX-01: operator replies directly, skipping triage)", () => {
      expect(isCaseTransitionAllowed("enriching", "in-resolution")).toBe(true)
    })

    it("new → resolved is BLOCKED (must go through enriching → triaged)", () => {
      expect(isCaseTransitionAllowed("new", "resolved")).toBe(false)
    })

    it("closed has no allowed exits (terminal state)", () => {
      for (const to of ALL_STATUSES) {
        if (to !== "closed") {
          expect(isCaseTransitionAllowed("closed", to)).toBe(false)
        }
      }
    })

    it("triaged → in-change is allowed (steward may route to change)", () => {
      expect(isCaseTransitionAllowed("triaged", "in-change")).toBe(true)
    })

    it("in-resolution → in-change is allowed (escalation path)", () => {
      expect(isCaseTransitionAllowed("in-resolution", "in-change")).toBe(true)
    })
  })

  // ── QE-05: processing-failed recovery transitions ─────────────────────────

  describe("QE-05: processing-failed state", () => {
    it("processing-failed → enriching is ALLOWED (re-run triage)", () => {
      expect(isCaseTransitionAllowed("processing-failed", "enriching")).toBe(true)
    })

    it("processing-failed → resolved is ALLOWED (operator manual resolution)", () => {
      expect(isCaseTransitionAllowed("processing-failed", "resolved")).toBe(true)
    })

    it("processing-failed → closed is ALLOWED (operator closes without retrying)", () => {
      expect(isCaseTransitionAllowed("processing-failed", "closed")).toBe(true)
    })

    it("processing-failed → triaged is BLOCKED (must go through enriching first)", () => {
      expect(isCaseTransitionAllowed("processing-failed", "triaged")).toBe(false)
    })

    it("processing-failed → in-resolution is BLOCKED (must go through enriching first)", () => {
      expect(isCaseTransitionAllowed("processing-failed", "in-resolution")).toBe(false)
    })

    it("enriching → processing-failed is BLOCKED (only DLQ handler writes this state)", () => {
      expect(isCaseTransitionAllowed("enriching", "processing-failed")).toBe(false)
    })

    it("new → processing-failed is BLOCKED", () => {
      expect(isCaseTransitionAllowed("new", "processing-failed")).toBe(false)
    })
  })
})
