/**
 * Unit tests: StewardWorker — sidecar infra-debt CR creation and routing.
 *
 * Tests the full sidecar path when a bug_report case with infra labels
 * auto-resolves via the known-issue match (in-resolution branch):
 *   - CR created with cr_track: "infra_debt"
 *   - change_prep dispatched for sidecar CR
 *   - sidecarChangeRequestId in audit event + outputSnapshot
 *   - No sidecar when predicate is false
 *   - Non-fatal behavior when CR creation or dispatch fails
 *
 * NF-UNIT-STWD-21 through NF-UNIT-STWD-32
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../../../src/agents/impl/known-issue-match.js", () => ({
  runKnownIssueMatchAgent: vi.fn(),
  KNOWN_ISSUE_MATCH_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findCaseById:         vi.fn(),
  findProductById:      vi.fn(),
  createAuditEvent:     vi.fn().mockResolvedValue(undefined),
  createChangeRequest:  vi.fn(),
}))

vi.mock("../../../src/domain/transactional-dispatch.js", () => ({
  transitionAndDispatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue("mock-job-id"),
}))

vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue("growth"),
}))

vi.mock("../../../src/rbac/permission-engine.js", () => ({
  licenseToProductTier: vi.fn().mockReturnValue("growth"),
}))

vi.mock("../../../src/auth/middleware.js", () => ({
  meetsMinTier: vi.fn().mockReturnValue(true),
}))

vi.mock("../../../src/infra/db/id.js", () => ({
  newId: vi.fn((prefix: string) => `${prefix}test`),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("../../../src/agents/worker.js", () => ({
  AbstractAgentWorker: class {
    readonly actionType = "known_issue_match"
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { StewardWorker } from "../../../src/workers/steward-worker.js"
import { runKnownIssueMatchAgent } from "../../../src/agents/impl/known-issue-match.js"
import { findCaseById, createAuditEvent, createChangeRequest } from "../../../src/infra/db/repositories/index.js"
import { transitionAndDispatch } from "../../../src/domain/transactional-dispatch.js"
import { dispatch } from "../../../src/agents/dispatcher.js"
import { logger } from "../../../src/shared/logger.js"
import type { WorkerExecuteContext } from "../../../src/agents/worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(caseId = "case-1"): WorkerExecuteContext {
  return {
    job: {
      data: {
        jobId:      "job-test",
        productId:  "prod-1",
        actionType: "known_issue_match",
        caseId,
        payload:    { signalText: "ZK proof generation times out after 30s" },
      },
    },
    productId: "prod-1",
    caseId,
  } as any
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    case_id:       "case-1",
    product_id:    "prod-1",
    status:        "triaged",
    type:          "bug_report",
    severity:      "normal",
    title:         "ZK proof timeout on batch > 5",
    signal_text:   "ZK proof generation times out after 30s",
    triage_output: {
      category:   "performance",
      labels:     ["timeout", "worker", "performance"],
      reasoning:  "ZK proof generation exceeds the 30s worker timeout for batches larger than 5 candidates.",
    },
    lead_assignments: {},
    created_at:    new Date(),
    ...overrides,
  }
}

function makeKnownIssueMatch(matched = true, confidence = 0.92) {
  return {
    capabilityDisabled: false,
    agentResult: {
      output: {
        matched,
        confidenceScore: confidence,
        knownIssueId:    matched ? "ki-zk-timeout" : undefined,
        knownIssueTitle: matched ? "ZK Batch Timeout" : undefined,
        matchSummary:    matched ? "Matches known ZK batch limit issue" : undefined,
      },
      usage:      { inputTokens: 200, outputTokens: 50 },
      durationMs: 800,
      modelId:    "claude-haiku",
    },
  }
}

function makeSidecarCr(crId = "cr_sidecar-test") {
  return { change_request_id: crId, cr_track: "infra_debt" }
}

const worker = new StewardWorker()

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findCaseById).mockResolvedValue(makeCase() as any)
  vi.mocked(runKnownIssueMatchAgent).mockResolvedValue(makeKnownIssueMatch() as any)
  vi.mocked(createChangeRequest).mockResolvedValue(makeSidecarCr() as any)
})

// ── Sidecar CR creation ───────────────────────────────────────────────────────

describe("StewardWorker — sidecar infra-debt CR: creation", () => {
  it("NF-UNIT-STWD-21: creates sidecar CR with cr_track='infra_debt' for bug_report + infra labels + known match", async () => {
    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledOnce()
    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ cr_track: "infra_debt" }),
    )
  })

  it("NF-UNIT-STWD-22: sidecar CR title is prefixed with [Infra debt]", async () => {
    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ title: "[Infra debt] ZK proof timeout on batch > 5" }),
    )
  })

  it("NF-UNIT-STWD-23: sidecar CR carries problem_statement from triage reasoning", async () => {
    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        problem_statement: expect.stringContaining("ZK proof"),
      }),
    )
  })

  it("NF-UNIT-STWD-24: sidecar CR status is 'draft' (not auto-advanced to approval-pending)", async () => {
    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    )
  })

  it("NF-UNIT-STWD-25: sidecar CR risk_level is 'medium' for normal severity", async () => {
    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ risk_level: "medium" }),
    )
  })

  it("NF-UNIT-STWD-26: sidecar CR risk_level is 'high' for high severity case", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase({ severity: "high" }) as any)

    await worker["execute"](makeCtx())

    expect(createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ risk_level: "high" }),
    )
  })
})

// ── change_prep dispatch ──────────────────────────────────────────────────────

describe("StewardWorker — sidecar infra-debt CR: change_prep dispatch", () => {
  it("NF-UNIT-STWD-27: dispatches change_prep with sidecar CR id after creation", async () => {
    await worker["execute"](makeCtx())

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType:      "change_prep",
        payload: expect.objectContaining({ changeRequestId: "cr_sidecar-test" }),
      }),
    )
  })

  it("NF-UNIT-STWD-28: change_prep dispatch includes signalText", async () => {
    await worker["execute"](makeCtx())

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          signalText: "ZK proof generation times out after 30s",
        }),
      }),
    )
  })
})

// ── Audit event + outputSnapshot ─────────────────────────────────────────────

describe("StewardWorker — sidecar infra-debt CR: audit + output", () => {
  it("NF-UNIT-STWD-29: audit event metadata includes sidecarChangeRequestId", async () => {
    await worker["execute"](makeCtx())

    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sidecarChangeRequestId: "cr_sidecar-test",
        }),
      }),
    )
  })

  it("NF-UNIT-STWD-30: outputSnapshot includes sidecarChangeRequestId", async () => {
    const result = await worker["execute"](makeCtx())

    expect((result as any).outputSnapshot).toMatchObject({
      sidecarChangeRequestId: "cr_sidecar-test",
    })
  })
})

// ── Predicate guards — no sidecar ────────────────────────────────────────────

describe("StewardWorker — sidecar infra-debt CR: predicate guards", () => {
  it("NF-UNIT-STWD-31: no sidecar CR when bug_report has no infra labels", async () => {
    vi.mocked(findCaseById).mockResolvedValue(
      makeCase({ triage_output: { labels: ["ui", "login"], reasoning: "Login UI bug" } }) as any,
    )

    await worker["execute"](makeCtx())

    expect(createChangeRequest).not.toHaveBeenCalled()
  })

  it("NF-UNIT-STWD-32: no sidecar CR when case type is user_request (even with infra labels)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(
      makeCase({ type: "user_request", triage_output: { labels: ["timeout", "performance"], reasoning: "Slow response" } }) as any,
    )
    // user_request routes directly to in-resolution but sidecar predicate fails on type
    await worker["execute"](makeCtx())

    expect(createChangeRequest).not.toHaveBeenCalled()
  })
})

// ── Non-fatal failure handling ────────────────────────────────────────────────

describe("StewardWorker — sidecar infra-debt CR: non-fatal failures", () => {
  it("NF-UNIT-STWD-33: worker succeeds even if sidecar CR creation throws", async () => {
    vi.mocked(createChangeRequest).mockRejectedValue(new Error("DB write failed"))

    const result = await worker["execute"](makeCtx())

    expect(result.outcome).toBe("success")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-1" }),
      expect.stringContaining("Sidecar CR creation failed"),
    )
  })

  it("NF-UNIT-STWD-34: worker succeeds even if change_prep dispatch throws after CR is created", async () => {
    // CR creation succeeds, dispatch fails
    vi.mocked(dispatch).mockRejectedValue(new Error("Queue unavailable"))

    const result = await worker["execute"](makeCtx())

    expect(result.outcome).toBe("success")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sidecarChangeRequestId: "cr_sidecar-test" }),
      expect.stringContaining("Sidecar change_prep dispatch failed"),
    )
  })

  it("NF-UNIT-STWD-35: transitionAndDispatch (primary path) is still called even when sidecar CR fails", async () => {
    vi.mocked(createChangeRequest).mockRejectedValue(new Error("DB write failed"))

    await worker["execute"](makeCtx())

    expect(transitionAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ to: "in-resolution" }),
    )
  })
})
