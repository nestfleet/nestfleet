/**
 * Unit tests: ChangeRequestStateMachine — SLICE-14A.
 *
 * Tests the CR transition guard logic. Pure function tests for
 * isCrTransitionAllowed() covering every state.
 */

import { describe, it, expect } from "vitest"
import { isCrTransitionAllowed } from "../../../src/domain/cr-state-machine.js"
import type { ChangeRequestStatus } from "../../../src/infra/db/repositories/change-requests.js"

const EXPECTED_CR_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  "draft":               ["analysis", "rejected"],
  "analysis":            ["approval-pending", "rejected"],
  "approval-pending":    ["approved", "rejected"],
  "approved":            ["implementation-prep", "rejected"],
  "implementation-prep": ["pr-drafted", "rejected"],
  "pr-drafted":          ["completed", "rejected"],
  "completed":           [],
  "rejected":            [],
}

const ALL_CR_STATUSES: ChangeRequestStatus[] = [
  "draft", "analysis", "approval-pending", "approved",
  "implementation-prep", "pr-drafted", "completed", "rejected",
]

describe("CRStateMachine — isCrTransitionAllowed", () => {
  describe("allows legal transitions", () => {
    for (const [from, targets] of Object.entries(EXPECTED_CR_TRANSITIONS)) {
      for (const to of targets) {
        it(`${from} → ${to}`, () => {
          expect(isCrTransitionAllowed(from as ChangeRequestStatus, to as ChangeRequestStatus)).toBe(true)
        })
      }
    }
  })

  describe("blocks illegal transitions", () => {
    for (const from of ALL_CR_STATUSES) {
      const allowed = new Set(EXPECTED_CR_TRANSITIONS[from])
      const illegal = ALL_CR_STATUSES.filter((s) => s !== from && !allowed.has(s))

      for (const to of illegal) {
        it(`${from} → ${to} is BLOCKED`, () => {
          expect(isCrTransitionAllowed(from, to)).toBe(false)
        })
      }
    }
  })

  describe("terminal states have no exits", () => {
    it("completed has no allowed exits", () => {
      for (const to of ALL_CR_STATUSES) {
        if (to !== "completed") {
          expect(isCrTransitionAllowed("completed", to)).toBe(false)
        }
      }
    })

    it("rejected has no allowed exits", () => {
      for (const to of ALL_CR_STATUSES) {
        if (to !== "rejected") {
          expect(isCrTransitionAllowed("rejected", to)).toBe(false)
        }
      }
    })
  })

  describe("every non-terminal state can reach rejected", () => {
    for (const from of ALL_CR_STATUSES) {
      if (from !== "completed" && from !== "rejected") {
        it(`${from} → rejected is allowed`, () => {
          expect(isCrTransitionAllowed(from, "rejected")).toBe(true)
        })
      }
    }
  })

  describe("SA review edge case: draft cannot skip to pr-drafted", () => {
    it("draft → pr-drafted is BLOCKED", () => {
      expect(isCrTransitionAllowed("draft", "pr-drafted")).toBe(false)
    })

    it("draft → completed is BLOCKED", () => {
      expect(isCrTransitionAllowed("draft", "completed")).toBe(false)
    })
  })
})
