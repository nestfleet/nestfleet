/**
 * Unit tests: AgentRunRowSchema — BUG-02 regression.
 *
 * Validates that the Zod schema correctly handles nullable evidence_chunk_ids,
 * preventing silent data corruption when the DB returns NULL for TEXT[] columns.
 *
 * NF-UNIT-30 through NF-UNIT-33.
 */

import { describe, it, expect } from "vitest"
import { AgentRunRowSchema } from "../../../src/infra/db/repositories/agent-runs.js"

// ── Shared fixture ─────────────────────────────────────────────────────────────

/** Build a complete, valid agent_runs row. Override individual fields per test. */
function buildValidRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:                    "run_abc123",
    job_id:                "job_def456",
    product_id:            "prod_789",
    case_id:               "case_001",
    action_type:           "triage",
    outcome:               "success",
    abstain_reason:        null,
    model_id:              "gpt-4o",
    input_tokens:          512,
    output_tokens:         256,
    duration_ms:           1200,
    evidence_chunk_ids:    null,
    output_schema_version: "1.0",
    output_valid:          true,
    output_snapshot:       { severity: "high" },
    error_code:            null,
    error_message:         null,
    otel_trace_id:         null,
    otel_span_id:          null,
    created_at:            new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("AgentRunRowSchema (BUG-02 regression)", () => {
  // NF-UNIT-30 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-30: Parses a complete row with evidence_chunk_ids = null without throwing", () => {
    const row = buildValidRow({ evidence_chunk_ids: null })
    expect(() => AgentRunRowSchema.parse(row)).not.toThrow()
  })

  // NF-UNIT-31 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-31: evidence_chunk_ids parsed as null stays null (not coerced to [])", () => {
    const row = buildValidRow({ evidence_chunk_ids: null })
    const parsed = AgentRunRowSchema.parse(row)
    expect(parsed.evidence_chunk_ids).toBeNull()
    expect(Array.isArray(parsed.evidence_chunk_ids)).toBe(false)
  })

  // NF-UNIT-32 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-32: Parses a row with evidence_chunk_ids as an array of strings", () => {
    const row = buildValidRow({ evidence_chunk_ids: ["chunk_1", "chunk_2"] })
    const parsed = AgentRunRowSchema.parse(row)
    expect(parsed.evidence_chunk_ids).toEqual(["chunk_1", "chunk_2"])
    expect(Array.isArray(parsed.evidence_chunk_ids)).toBe(true)
  })

  // NF-UNIT-33 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-33: A row missing evidence_chunk_ids entirely fails Zod validation", () => {
    const { evidence_chunk_ids: _dropped, ...rowWithoutField } = buildValidRow()
    expect(() => AgentRunRowSchema.parse(rowWithoutField)).toThrow()
  })
})
