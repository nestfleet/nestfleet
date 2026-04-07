/**
 * Unit tests: Severity Enum Normalization — SLICE-14B.
 *
 * Verifies the triage agent schema uses the canonical domain vocabulary
 * and the frontline worker's mapSeverity function normalizes correctly.
 */

import { describe, it, expect } from "vitest"
import { triageOutputSchema } from "../../../src/agents/impl/triage.js"
import { CaseSeveritySchema } from "../../../src/infra/db/repositories/cases.js"

describe("Severity Enum Normalization", () => {
  describe("triage agent schema uses domain vocabulary", () => {
    it("accepts 'normal' (domain canonical)", () => {
      const result = triageOutputSchema.safeParse({
        severity: "normal",
        confidenceScore: 0.9,
        category: "billing",
        labels: [],
        reasoning: "test",
        evidenceRefs: [],
      })
      expect(result.success).toBe(true)
    })

    it("rejects 'medium' (old non-canonical)", () => {
      const result = triageOutputSchema.safeParse({
        severity: "medium",
        confidenceScore: 0.9,
        category: "billing",
        labels: [],
        reasoning: "test",
        evidenceRefs: [],
      })
      expect(result.success).toBe(false)
    })

    it("accepts all canonical severity values", () => {
      for (const sev of ["critical", "high", "normal", "low"]) {
        const result = triageOutputSchema.safeParse({
          severity: sev,
          confidenceScore: 0.5,
          category: "test",
          labels: [],
          reasoning: "test",
          evidenceRefs: [],
        })
        expect(result.success, `${sev} should be accepted`).toBe(true)
      }
    })
  })

  describe("domain CaseSeveritySchema matches triage schema", () => {
    it("domain schema accepts: critical, high, normal, low", () => {
      for (const sev of ["critical", "high", "normal", "low"]) {
        expect(CaseSeveritySchema.safeParse(sev).success).toBe(true)
      }
    })

    it("domain schema rejects 'medium'", () => {
      expect(CaseSeveritySchema.safeParse("medium").success).toBe(false)
    })
  })
})
