/**
 * Unit tests: agent output normalisation — confidenceScore + sourceTiers.
 *
 * Why: Ollama's grammar enforces JSON shape/types but NOT numeric ranges, so a self-hosted model can
 * return a well-formed but out-of-range number (e.g. 84.19 / 1.10 for a 0–1 field). The range is now
 * enforced in code (fail-safe) instead of rejecting the whole agent run.
 *
 * NF-UNIT-NORM-01: in-range confidence is untouched (incl. 0 and 1)
 * NF-UNIT-NORM-02: slight overshoot (≤ 1.2) → clamped to 1
 * NF-UNIT-NORM-03: negative / far above range / non-finite → 0 (low confidence → human review; never guess a percent)
 * NF-UNIT-NORM-04: sourceTiers — only integer tiers 1–4 survive (dropping can never add tier 1)
 * NF-UNIT-NORM-05: all six agent schemas use the shared schema and send NO min/max to the model
 * NF-UNIT-NORM-06: out-of-range values are logged (so frequency is visible in prod)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { asSchema } from "ai"
import { logger } from "../../../src/shared/logger.js"
import {
  normaliseConfidence,
  normaliseSourceTiers,
  CONFIDENCE_OVERSHOOT_TOLERANCE,
} from "../../../src/agents/output-normalisation.js"
import { triageOutputSchema } from "../../../src/agents/impl/triage.js"
import { knownIssueMatchOutputSchema } from "../../../src/agents/impl/known-issue-match.js"
import { outageRoutingOutputSchema } from "../../../src/agents/impl/outage-routing.js"
import { changePrepOutputSchema } from "../../../src/agents/impl/change-prep.js"
import { prDraftPrepOutputSchema } from "../../../src/agents/impl/pr-draft-prep.js"
import { autoReplyOutputSchema } from "../../../src/agents/impl/auto-reply.js"

beforeEach(() => vi.clearAllMocks())

describe("normaliseConfidence", () => {
  it.each([0, 0.01, 0.5, 0.8531870876557032, 1])("NF-UNIT-NORM-01: in-range %s is untouched", (v) => {
    expect(normaliseConfidence(v)).toBe(v)
  })

  it.each([1.0000001, 1.1, 1.1000018436315757, CONFIDENCE_OVERSHOOT_TOLERANCE])(
    "NF-UNIT-NORM-02: slight overshoot %s → 1",
    (v) => { expect(normaliseConfidence(v)).toBe(1) },
  )

  it.each([-0.0001, -0.5, -84, 1.2000001, 1.5, 2, 5, 10, 84.18793692697936, 95, 100, 1e9, Infinity, -Infinity, NaN])(
    "NF-UNIT-NORM-03: %s → 0 (never scaled up)",
    (v) => { expect(normaliseConfidence(v)).toBe(0) },
  )
})

describe("normaliseSourceTiers", () => {
  it("NF-UNIT-NORM-04: valid tiers are untouched and keep their order", () => {
    expect(normaliseSourceTiers([1, 2, 4])).toEqual([1, 2, 4])
    expect(normaliseSourceTiers([])).toEqual([])
  })

  it("NF-UNIT-NORM-04: invalid entries (0, 5, non-integer, NaN) are dropped, valid ones kept", () => {
    expect(normaliseSourceTiers([1, 0, 5, 2.5, 3, NaN, -1])).toEqual([1, 3])
  })

  it("NF-UNIT-NORM-04: never invents tier 1 — a reply with only invalid tiers cannot auto-send", () => {
    expect(normaliseSourceTiers([0, 5, 9])).toEqual([])
    expect(normaliseSourceTiers([2, 3])).not.toContain(1)
  })
})

describe("agent schemas", () => {
  const schemas = {
    triage:           triageOutputSchema,
    knownIssueMatch:  knownIssueMatchOutputSchema,
    outageRouting:    outageRoutingOutputSchema,
    changePrep:       changePrepOutputSchema,
    prDraftPrep:      prDraftPrepOutputSchema,
    autoReply:        autoReplyOutputSchema,
  } as const

  it.each(Object.entries(schemas))("NF-UNIT-NORM-05: %s — confidenceScore normalises in the schema", (_name, schema) => {
    const field = schema.shape.confidenceScore
    expect(field.parse(0.9)).toBe(0.9)
    expect(field.parse(1.1)).toBe(1)
    expect(field.parse(84.19)).toBe(0)
    expect(field.parse(-2)).toBe(0)
    expect(field.safeParse("0.9").success).toBe(false) // still must be a number
  })

  it.each(Object.entries(schemas))("NF-UNIT-NORM-05: %s — the JSON schema sent to the model has no numeric range", (_name, schema) => {
    const prop = (asSchema(schema).jsonSchema as { properties: Record<string, Record<string, unknown>> }).properties["confidenceScore"]
    expect(prop?.["type"]).toBe("number")
    expect(prop).not.toHaveProperty("minimum")
    expect(prop).not.toHaveProperty("maximum")
    expect(String(prop?.["description"])).toMatch(/0-1/) // the range stays in the description as a hint
  })

  it("NF-UNIT-NORM-05: autoReply sourceTiers normalises and sends no range/int constraint", () => {
    expect(autoReplyOutputSchema.shape.sourceTiers.parse([1, 5, 2.5, 3])).toEqual([1, 3])
    const props = (asSchema(autoReplyOutputSchema).jsonSchema as { properties: Record<string, { items?: Record<string, unknown> }> }).properties
    expect(props["sourceTiers"]?.items).not.toHaveProperty("minimum")
    expect(props["sourceTiers"]?.items).not.toHaveProperty("maximum")
  })

  it("NF-UNIT-NORM-06: an out-of-range value is logged; an in-range one is not", () => {
    triageOutputSchema.shape.confidenceScore.parse(0.7)
    expect(logger.warn).not.toHaveBeenCalled()

    triageOutputSchema.shape.confidenceScore.parse(84.19)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toMatchObject({ rawConfidence: 84.19, normalisedConfidence: 0 })

    autoReplyOutputSchema.shape.sourceTiers.parse([1, 5])
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })
})
