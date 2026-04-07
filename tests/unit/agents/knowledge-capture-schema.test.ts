/**
 * TDD: Unit tests for Knowledge Capture agent output schema — SLICE-24.
 * Written BEFORE implementation. Tests define the contract.
 *
 * NF-UNIT-KC-01 through NF-UNIT-KC-10.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"

// ── Schema under test (will be imported from src/agents/impl/knowledge-capture.ts) ──
// For TDD: define the expected schema here first, then move to implementation.

const KnowledgeCaptureOutputSchema = z.object({
  /** Whether the resolved case warrants a knowledge asset */
  shouldCapture: z.boolean(),

  /** Why or why not to capture */
  reasoning: z.string().min(10),

  /** Proposed assets (empty array if shouldCapture=false) */
  proposals: z.array(z.object({
    assetType: z.enum(["faq", "known_issue", "runbook_update", "docs_update"]),
    title: z.string().min(5),
    content: z.string().min(20),
    confidence: z.number().min(0).max(1),
    sourceRefs: z.array(z.string()).default([]),
  })).default([]),
})

type KnowledgeCaptureOutput = z.infer<typeof KnowledgeCaptureOutputSchema>

// ── Tests ────────────────────────────────────────────────────────────────────

describe("KnowledgeCaptureOutputSchema", () => {
  it("NF-UNIT-KC-01: accepts valid capture with one FAQ proposal", () => {
    const valid: KnowledgeCaptureOutput = {
      shouldCapture: true,
      reasoning: "This case revealed a common user confusion about SSO configuration that is not in our FAQ.",
      proposals: [{
        assetType: "faq",
        title: "How do I configure SSO with Okta?",
        content: "To configure SSO with Okta, navigate to Settings > Authentication > SSO. Enter your Okta domain and client ID. Click Test Connection to verify.",
        confidence: 0.92,
        sourceRefs: ["mc_chunk_001", "mc_chunk_042"],
      }],
    }
    expect(KnowledgeCaptureOutputSchema.parse(valid)).toEqual(valid)
  })

  it("NF-UNIT-KC-02: accepts valid no-capture decision", () => {
    const valid: KnowledgeCaptureOutput = {
      shouldCapture: false,
      reasoning: "This case was a one-off user error (wrong password). No reusable knowledge to capture.",
      proposals: [],
    }
    expect(KnowledgeCaptureOutputSchema.parse(valid)).toEqual(valid)
  })

  it("NF-UNIT-KC-03: accepts multiple proposals from one case", () => {
    const valid: KnowledgeCaptureOutput = {
      shouldCapture: true,
      reasoning: "This case exposed both a documentation gap and a known issue pattern.",
      proposals: [
        {
          assetType: "known_issue",
          title: "Authentication fails after password reset",
          content: "Users who reset their password via the forgot-password flow may experience login failures for up to 5 minutes due to session cache invalidation delay.",
          confidence: 0.88,
          sourceRefs: ["case_01abc"],
        },
        {
          assetType: "docs_update",
          title: "Add cache invalidation note to auth troubleshooting guide",
          content: "Section 'Login Issues' should mention the 5-minute cache delay after password reset and suggest clearing browser cookies as a workaround.",
          confidence: 0.75,
          sourceRefs: [],
        },
      ],
    }
    const result = KnowledgeCaptureOutputSchema.parse(valid)
    expect(result.proposals).toHaveLength(2)
  })

  it("NF-UNIT-KC-04: rejects reasoning shorter than 10 chars", () => {
    expect(() => KnowledgeCaptureOutputSchema.parse({
      shouldCapture: false,
      reasoning: "No.",
      proposals: [],
    })).toThrow()
  })

  it("NF-UNIT-KC-05: rejects proposal title shorter than 5 chars", () => {
    expect(() => KnowledgeCaptureOutputSchema.parse({
      shouldCapture: true,
      reasoning: "Valid reasoning for the capture decision here.",
      proposals: [{
        assetType: "faq",
        title: "Hi",
        content: "This content is long enough to pass validation.",
        confidence: 0.9,
        sourceRefs: [],
      }],
    })).toThrow()
  })

  it("NF-UNIT-KC-06: rejects proposal content shorter than 20 chars", () => {
    expect(() => KnowledgeCaptureOutputSchema.parse({
      shouldCapture: true,
      reasoning: "Valid reasoning for the capture decision here.",
      proposals: [{
        assetType: "faq",
        title: "Valid title here",
        content: "Too short",
        confidence: 0.9,
        sourceRefs: [],
      }],
    })).toThrow()
  })

  it("NF-UNIT-KC-07: rejects confidence outside 0–1 range", () => {
    expect(() => KnowledgeCaptureOutputSchema.parse({
      shouldCapture: true,
      reasoning: "Valid reasoning for the capture decision here.",
      proposals: [{
        assetType: "faq",
        title: "Valid title here",
        content: "This content is long enough to pass validation.",
        confidence: 1.5,
        sourceRefs: [],
      }],
    })).toThrow()
  })

  it("NF-UNIT-KC-08: rejects invalid asset type", () => {
    expect(() => KnowledgeCaptureOutputSchema.parse({
      shouldCapture: true,
      reasoning: "Valid reasoning for the capture decision here.",
      proposals: [{
        assetType: "blog_post",
        title: "Valid title here",
        content: "This content is long enough to pass validation.",
        confidence: 0.9,
        sourceRefs: [],
      }],
    })).toThrow()
  })

  it("NF-UNIT-KC-09: defaults sourceRefs to empty array when omitted", () => {
    const result = KnowledgeCaptureOutputSchema.parse({
      shouldCapture: true,
      reasoning: "Valid reasoning for the capture decision here.",
      proposals: [{
        assetType: "runbook_update",
        title: "Add restart procedure for export service",
        content: "When the export pipeline times out, restart the export-worker pod. Check logs for memory pressure.",
        confidence: 0.85,
      }],
    })
    expect(result.proposals[0]!.sourceRefs).toEqual([])
  })

  it("NF-UNIT-KC-10: defaults proposals to empty array when omitted", () => {
    const result = KnowledgeCaptureOutputSchema.parse({
      shouldCapture: false,
      reasoning: "No actionable knowledge from this case — routine inquiry.",
    })
    expect(result.proposals).toEqual([])
  })
})
