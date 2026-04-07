/**
 * Unit tests: CaseStateMachine — SLICE-14A.
 *
 * Tests the transition guard logic without DB. Pure function tests for
 * isCaseTransitionAllowed() covering every state and edge cases.
 */

import { describe, it, expect } from "vitest"
import { isCaseTransitionAllowed } from "../../../src/domain/case-state-machine.js"
import type { CaseStatus } from "../../../src/infra/db/repositories/cases.js"

// ── Full allowed-transition map from case-and-change-lifecycle.md §5.1 ───────

const EXPECTED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  "new":            ["enriching", "closed"],
  "enriching":      ["triaged", "awaiting-user", "in-resolution", "closed"],
  "triaged":        ["in-resolution", "awaiting-lead", "in-change", "resolved"],
  "awaiting-user":  ["enriching", "resolved", "closed"],
  "awaiting-lead":  ["in-resolution", "in-change", "resolved", "closed"],
  "in-resolution":  ["resolved", "awaiting-user", "awaiting-lead", "in-change"],
  "in-change":      ["pr-drafting", "awaiting-lead", "resolved", "closed"],
  "pr-drafting":    ["resolved", "awaiting-lead", "closed"],
  "resolved":       ["closed", "awaiting-user", "awaiting-lead"],
  "closed":         [],
}

const ALL_STATUSES: CaseStatus[] = [
  "new", "enriching", "triaged", "awaiting-user", "awaiting-lead",
  "in-resolution", "in-change", "pr-drafting", "resolved", "closed",
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
})
