/**
 * Unit tests: DLQ handler — QE-05.
 *
 * Tests the schema additions and state-machine logic added for dead-letter
 * case recovery. The DLQ handler itself (registerDeadLetterHandler) requires
 * a real pg-boss + DB and is covered by integration tests.
 *
 * What we test here (pure / no I/O):
 *   1. CaseStatusSchema accepts "processing-failed".
 *   2. ProcessingErrorSchema validates the correct shape.
 *   3. CaseUpdateSchema accepts processing_error (full + null).
 *   4. State machine: processing-failed recovery transitions (smoke — full
 *      coverage in domain/case-state-machine.test.ts).
 */

import { describe, it, expect } from "vitest"
import {
  CaseStatusSchema,
  CaseUpdateSchema,
  ProcessingErrorSchema,
} from "../../../../src/infra/db/repositories/cases.js"
import { isCaseTransitionAllowed } from "../../../../src/domain/case-state-machine.js"

// ── 1. CaseStatusSchema ────────────────────────────────────────────────────────

describe("CaseStatusSchema — QE-05 extension", () => {
  it("accepts 'processing-failed' as a valid status", () => {
    expect(CaseStatusSchema.parse("processing-failed")).toBe("processing-failed")
  })

  it("rejects unknown statuses", () => {
    expect(() => CaseStatusSchema.parse("analysis-failed")).toThrow()
    expect(() => CaseStatusSchema.parse("failed")).toThrow()
    expect(() => CaseStatusSchema.parse("")).toThrow()
  })

  it("retains all previous statuses", () => {
    const valid = [
      "new", "enriching", "triaged", "awaiting-user", "awaiting-lead",
      "in-resolution", "in-change", "pr-drafting", "resolved", "closed",
    ]
    for (const s of valid) {
      expect(CaseStatusSchema.parse(s)).toBe(s)
    }
  })
})

// ── 2. ProcessingErrorSchema ───────────────────────────────────────────────────

describe("ProcessingErrorSchema", () => {
  it("parses a well-formed processing error", () => {
    const input = { jobName: "triage", jobId: "job_123", error: "LLM timeout" }
    expect(ProcessingErrorSchema.parse(input)).toStrictEqual(input)
  })

  it("rejects missing fields", () => {
    expect(() => ProcessingErrorSchema.parse({ jobName: "triage", jobId: "job_123" })).toThrow()
    expect(() => ProcessingErrorSchema.parse({ jobName: "triage" })).toThrow()
    expect(() => ProcessingErrorSchema.parse({})).toThrow()
  })

  it("rejects non-string error", () => {
    expect(() =>
      ProcessingErrorSchema.parse({ jobName: "triage", jobId: "job_123", error: 42 }),
    ).toThrow()
  })
})

// ── 3. CaseUpdateSchema — processing_error field ──────────────────────────────

describe("CaseUpdateSchema — processing_error", () => {
  it("accepts a valid ProcessingError object", () => {
    const update = {
      status: "processing-failed" as const,
      processing_error: { jobName: "triage", jobId: "job_abc", error: "DB timeout" },
    }
    const parsed = CaseUpdateSchema.parse(update)
    expect(parsed.status).toBe("processing-failed")
    expect(parsed.processing_error).toStrictEqual(update.processing_error)
  })

  it("accepts null processing_error (clear on recovery)", () => {
    const update = { status: "enriching" as const, processing_error: null }
    const parsed = CaseUpdateSchema.parse(update)
    expect(parsed.processing_error).toBeNull()
  })

  it("accepts update without processing_error (field is optional)", () => {
    const update = { status: "enriching" as const }
    const parsed = CaseUpdateSchema.parse(update)
    expect(parsed.processing_error).toBeUndefined()
  })

  it("rejects processing_error with wrong shape", () => {
    expect(() =>
      CaseUpdateSchema.parse({
        status: "processing-failed",
        processing_error: { jobName: "triage" }, // missing jobId and error
      }),
    ).toThrow()
  })
})

// ── 4. State machine smoke tests for processing-failed ────────────────────────

describe("State machine — processing-failed recovery (smoke)", () => {
  it("allows processing-failed → enriching (re-triage)", () => {
    expect(isCaseTransitionAllowed("processing-failed", "enriching")).toBe(true)
  })

  it("allows processing-failed → resolved (operator closes)", () => {
    expect(isCaseTransitionAllowed("processing-failed", "resolved")).toBe(true)
  })

  it("allows processing-failed → closed", () => {
    expect(isCaseTransitionAllowed("processing-failed", "closed")).toBe(true)
  })

  it("blocks processing-failed → new (cannot go backward)", () => {
    expect(isCaseTransitionAllowed("processing-failed", "new")).toBe(false)
  })

  it("blocks any status → processing-failed (only DLQ handler writes this via updateCase)", () => {
    const allStatuses = [
      "new", "enriching", "triaged", "awaiting-user", "awaiting-lead",
      "in-resolution", "in-change", "pr-drafting", "resolved", "closed",
    ] as const
    for (const from of allStatuses) {
      expect(isCaseTransitionAllowed(from, "processing-failed")).toBe(false)
    }
  })
})
