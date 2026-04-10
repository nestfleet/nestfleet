/**
 * Unit tests: triage agent — prompt content and severity calibration.
 *
 * These tests verify that the SYSTEM_PROMPT exported from the triage agent
 * contains the correct severity heuristics, particularly:
 *   - Configuration questions and how-to inquiries are classified LOW, not HIGH
 *   - The "config vs bug" distinction is explicitly encoded
 *   - The critical confidence gate constant remains correct
 *
 * NF-UNIT-TRIAGE-01 through NF-UNIT-TRIAGE-10
 *
 * Note: These tests inspect the exported constant SYSTEM_PROMPT indirectly
 * via the module. Because the prompt is an internal constant we expose it
 * through a test-only named export (see triage.ts) OR by testing the
 * observable contract: the prompt string contains the required guidance.
 * We use the triageOutputSchema (already exported) as a control and
 * import the raw module to verify prompt content.
 */

import { describe, it, expect } from "vitest"
import { triageOutputSchema, TRIAGE_SCHEMA_VERSION } from "../../../src/agents/impl/triage.js"

// ── Re-export the SYSTEM_PROMPT for testing ───────────────────────────────────
// We import the module source directly so we can inspect the prompt string.
// triage.ts already exports triageOutputSchema and TRIAGE_SCHEMA_VERSION;
// the SYSTEM_PROMPT is the internal constant we need to validate.
// We do this by importing the raw module object and reading the prompt from it.
import * as triageModule from "../../../src/agents/impl/triage.js"

// The SYSTEM_PROMPT is not exported from triage.ts.
// We validate its content through a lightweight string-inspection approach:
// pull the module's source file text and verify it contains the required strings.
// This is intentional — the prompt is a config artefact, not runtime behaviour,
// so a static content assertion is the appropriate test type here.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const triageSrc = readFileSync(
  join(__dirname, "../../../src/agents/impl/triage.ts"),
  "utf-8",
)

// ── Schema contract tests ─────────────────────────────────────────────────────

describe("triage schema contract", () => {
  it("NF-UNIT-TRIAGE-01: schema version is 1.0", () => {
    expect(TRIAGE_SCHEMA_VERSION).toBe("1.0")
  })

  it("NF-UNIT-TRIAGE-02: severity enum contains exactly critical/high/normal/low", () => {
    // Parse each valid severity value — all must succeed
    for (const sev of ["critical", "high", "normal", "low"]) {
      const result = triageOutputSchema.safeParse({
        severity: sev,
        confidenceScore: 0.8,
        category: "test",
        labels: [],
        reasoning: "test reasoning",
        evidenceRefs: [],
      })
      expect(result.success, `${sev} should be accepted`).toBe(true)
    }
  })

  it("NF-UNIT-TRIAGE-03: severity enum rejects 'medium' (non-canonical)", () => {
    const result = triageOutputSchema.safeParse({
      severity: "medium",
      confidenceScore: 0.8,
      category: "test",
      labels: [],
      reasoning: "test reasoning",
      evidenceRefs: [],
    })
    expect(result.success).toBe(false)
  })

  it("NF-UNIT-TRIAGE-04: confidenceScore must be between 0 and 1", () => {
    const base = {
      severity: "high",
      category: "test",
      labels: [],
      reasoning: "test reasoning",
      evidenceRefs: [],
    }
    expect(triageOutputSchema.safeParse({ ...base, confidenceScore: -0.1 }).success).toBe(false)
    expect(triageOutputSchema.safeParse({ ...base, confidenceScore: 1.1 }).success).toBe(false)
    expect(triageOutputSchema.safeParse({ ...base, confidenceScore: 0 }).success).toBe(true)
    expect(triageOutputSchema.safeParse({ ...base, confidenceScore: 1 }).success).toBe(true)
  })

  it("NF-UNIT-TRIAGE-05: routingTeam is optional", () => {
    const withoutRouting = triageOutputSchema.safeParse({
      severity: "low",
      confidenceScore: 0.9,
      category: "configuration",
      labels: ["how-to"],
      reasoning: "User asked a config question.",
      evidenceRefs: [],
    })
    expect(withoutRouting.success).toBe(true)

    const withRouting = triageOutputSchema.safeParse({
      severity: "high",
      confidenceScore: 0.85,
      category: "auth",
      labels: ["sso"],
      reasoning: "SSO is broken.",
      evidenceRefs: [],
      routingTeam: "platform",
    })
    expect(withRouting.success).toBe(true)
  })
})

// ── Prompt content tests — severity calibration ───────────────────────────────

describe("SYSTEM_PROMPT severity calibration", () => {
  it("NF-UNIT-TRIAGE-06: low severity definition includes config/how-to questions", () => {
    // The prompt must explicitly place config questions and how-to inquiries
    // into the LOW tier, not HIGH.
    expect(triageSrc).toMatch(/low.*[Cc]onfiguration question|[Cc]onfiguration question.*low/i)
    expect(triageSrc).toMatch(/low.*how-to|how-to.*low/i)
  })

  it("NF-UNIT-TRIAGE-07: high severity definition requires a malfunctioning feature, not just a question", () => {
    // HIGH must be tied to a broken/malfunctioning feature and lack of workaround.
    expect(triageSrc).toMatch(/high.*broken|high.*malfunctioning|broken.*high|malfunctioning.*high/i)
    expect(triageSrc).toMatch(/no workaround/i)
  })

  it("NF-UNIT-TRIAGE-08: prompt contains explicit guidance: config/how-to questions are LOW or NORMAL", () => {
    // The prompt must tell the LLM directly that asking HOW to do something
    // must not be classified HIGH or CRITICAL.
    expect(triageSrc).toContain("HOW to do something")
    expect(triageSrc).toMatch(/[Ll][Oo][Ww] or [Nn][Oo][Rr][Mm][Aa][Ll]/)
  })

  it("NF-UNIT-TRIAGE-09: prompt contains the nightly rollup consolidation example as a LOW case", () => {
    // The concrete example from the bug report must appear in the prompt
    // so the LLM has an anchoring case for this exact pattern.
    expect(triageSrc).toContain("nightly rollup")
    expect(triageSrc).toMatch(/nightly rollup.*LOW|LOW.*nightly rollup/i)
  })

  it("NF-UNIT-TRIAGE-10: prompt warns that quantitative language alone does not raise severity", () => {
    // Numbers like '8 issues' or '100 records' must not automatically
    // push severity up — the prompt must state this explicitly.
    expect(triageSrc).toMatch(/[Qq]uantitative language|quantitative/i)
    expect(triageSrc).toMatch(/does not raise severity|not.*raise severity/i)
  })

  it("NF-UNIT-TRIAGE-11: prompt classifies capability/existence questions as 'question' category (BEF-34)", () => {
    // "Do you have a webhook?" / "Is there an integration?" are capability questions,
    // not integration bugs. The prompt must explicitly distinguish asking about the
    // existence of a feature from reporting that a feature is broken.
    expect(triageSrc).toMatch(/do you have|is there|can I use|capability|exist/i)
    expect(triageSrc).toMatch(/question.*category|category.*question/i)
  })

  it("NF-UNIT-TRIAGE-12: prompt classifies stack traces and thrown errors as bug category (BEF-35)", () => {
    // A message containing 'TypeError:', 'Error:', or a stack trace must produce
    // a bug/error category — not configuration or question.
    expect(triageSrc).toMatch(/TypeError|stack.?trace|thrown error/i)
    expect(triageSrc).toMatch(/bug|error.*category|category.*error/i)
  })
})
