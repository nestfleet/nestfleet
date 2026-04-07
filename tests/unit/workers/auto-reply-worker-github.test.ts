/**
 * Unit tests: AutoReplyWorker — DEFERRED-22 GitHub comment posting.
 *
 * Covers:
 *   NF-UNIT-440: autoSend=true + github_issue_ref set → addIssueComment called with correct args
 *   NF-UNIT-441: comment body includes AI disclosure text
 *   NF-UNIT-442: autoSend=false + github_issue_ref set → addIssueComment NOT called
 *   NF-UNIT-443: autoSend=true + github_issue_ref=null → addIssueComment NOT called
 *   NF-UNIT-444: autoSend=true + GITHUB_TOKEN absent → addIssueComment NOT called
 *   NF-UNIT-445: malformed github_issue_ref (no "#") → warning logged, worker succeeds
 *   NF-UNIT-446: addIssueComment throws → warning logged, worker returns success (non-fatal)
 *   NF-UNIT-447: outputSnapshot includes githubIssueRef when set
 *   NF-UNIT-448: outputSnapshot does NOT include githubIssueRef when null
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/agents/impl/auto-reply.js", () => ({
  runAutoReplyAgent: vi.fn(),
  AUTO_REPLY_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findCaseById:    vi.fn(),
  findProductById: vi.fn(),
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/db/repositories/identities.js", () => ({
  findIdentityById: vi.fn().mockResolvedValue(null),
}))

vi.mock("../../../src/infra/db/repositories/cases.js", () => ({
  saveDraftReply: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/domain/case-state-machine.js", () => ({
  transitionCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/github/client.js", () => ({
  createGitHubClient: vi.fn(),
}))

vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue("starter"),
}))

vi.mock("../../../src/rbac/permission-engine.js", () => ({
  licenseToProductTier: vi.fn().mockReturnValue("starter"),
}))

vi.mock("../../../src/auth/middleware.js", () => ({
  meetsMinTier: vi.fn().mockReturnValue(true),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: { GITHUB_TOKEN: "test-gh-token" },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("../../../src/agents/worker.js", () => ({
  AbstractAgentWorker: class {
    readonly actionType = "auto_reply"
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { AutoReplyWorker } from "../../../src/workers/auto-reply-worker.js"
import { runAutoReplyAgent } from "../../../src/agents/impl/auto-reply.js"
import { findCaseById, findProductById } from "../../../src/infra/db/repositories/index.js"
import { createGitHubClient } from "../../../src/infra/github/client.js"
import { logger } from "../../../src/shared/logger.js"
import { config } from "../../../src/shared/config.js"
import type { WorkerExecuteContext } from "../../../src/agents/worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(payload: Record<string, unknown> = {}): WorkerExecuteContext {
  return {
    job: {
      data: {
        jobId: "test-job-id",
        productId: "prod-1",
        actionType: "auto_reply",
        caseId:    "case-1",
        payload,
      },
    },
    productId: "prod-1",
    caseId:    "case-1",
  } as any
}

const GOOD_AGENT_RESULT = {
  output: {
    replyText:          "Thank you for reaching out. We are investigating this.",
    confidenceScore:    0.92,
    sourceTiers:        [1],
    evidenceRefs:       ["doc-1"],
    reasoning:          "Strong T1 source match",
    requiresHumanReview: false,
  },
  modelId:    "claude-3-haiku",
  usage:      { inputTokens: 800, outputTokens: 200 },
  durationMs: 1500,
  traceId:    "trace-abc",
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    case_id:             "case-1",
    product_id:          "prod-1",
    status:              "in-resolution",
    title:               "Login broken after update",
    reporter_identity_id: null,
    github_issue_ref:    null,
    signal_text:         "I cannot log in",
    ...overrides,
  }
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    product_id:    "prod-1",
    name:          "TestApp",
    agent_config:  {},
    lead_assignments: {},
    ...overrides,
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

let mockAddIssueComment: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(findCaseById).mockResolvedValue(makeCase() as any)
  vi.mocked(findProductById).mockResolvedValue(makeProduct() as any)
  vi.mocked(runAutoReplyAgent).mockResolvedValue(GOOD_AGENT_RESULT as any)

  mockAddIssueComment = vi.fn().mockResolvedValue({ id: 999, url: "https://github.com/acme/app/issues/42#comment-999" })
  vi.mocked(createGitHubClient).mockReturnValue({
    addIssueComment: mockAddIssueComment,
  } as any)
})

function callExecute(ctx: WorkerExecuteContext) {
  const worker = new AutoReplyWorker()
  return (worker as any).execute.call(worker, ctx)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AutoReplyWorker.execute() — DEFERRED-22 GitHub comment", () => {

  describe("NF-UNIT-440: happy path — comment posted when autoSend=true + github_issue_ref set", () => {
    it("calls addIssueComment with correct repo and issue number", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(createGitHubClient).toHaveBeenCalledWith("test-gh-token")
      expect(mockAddIssueComment).toHaveBeenCalledOnce()
      const [repo, num] = mockAddIssueComment.mock.calls[0]
      expect(repo).toBe("acme/app")
      expect(num).toBe(42)
    })
  })

  describe("NF-UNIT-441: comment body includes disclosure text", () => {
    it("comment body contains the agent reply text", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      const commentBody = mockAddIssueComment.mock.calls[0][2] as string
      expect(commentBody).toContain(GOOD_AGENT_RESULT.output.replyText)
    })

    it("comment body wraps reply with AI disclosure", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      const commentBody = mockAddIssueComment.mock.calls[0][2] as string
      // Disclosure references the product name
      expect(commentBody).toContain("TestApp")
    })
  })

  describe("NF-UNIT-442: autoSend=false → comment NOT posted", () => {
    it("does not call addIssueComment when validation gates fail", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )
      // Fail gate 1 — low confidence
      vi.mocked(runAutoReplyAgent).mockResolvedValue({
        ...GOOD_AGENT_RESULT,
        output: { ...GOOD_AGENT_RESULT.output, confidenceScore: 0.50 },
      } as any)

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(mockAddIssueComment).not.toHaveBeenCalled()
    })
  })

  describe("NF-UNIT-443: github_issue_ref=null → comment NOT posted", () => {
    it("does not call addIssueComment when case has no github_issue_ref", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: null }) as any,
      )

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(mockAddIssueComment).not.toHaveBeenCalled()
    })
  })

  describe("NF-UNIT-444: GITHUB_TOKEN absent → comment NOT posted", () => {
    it("skips GitHub comment when token is not configured", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )
      // Temporarily remove the token
      const originalToken = (config as any).GITHUB_TOKEN
      ;(config as any).GITHUB_TOKEN = undefined

      await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(mockAddIssueComment).not.toHaveBeenCalled()

      // Restore
      ;(config as any).GITHUB_TOKEN = originalToken
    })
  })

  describe("NF-UNIT-445: malformed github_issue_ref → warning logged, no throw", () => {
    it("logs a warning and continues when github_issue_ref has no '#'", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme-app-42-no-hash" }) as any,
      )

      const result = await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(result.outcome).toBe("success")
      expect(mockAddIssueComment).not.toHaveBeenCalled()
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ github_issue_ref: "acme-app-42-no-hash" }),
        expect.stringContaining("malformed github_issue_ref"),
      )
    })
  })

  describe("NF-UNIT-446: addIssueComment throws → non-fatal, worker returns success", () => {
    it("continues and returns success even when GitHub API call fails", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )
      mockAddIssueComment.mockRejectedValue(new Error("GitHub API 503"))

      const result = await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(result.outcome).toBe("success")
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: "case-1" }),
        expect.stringContaining("GitHub comment failed"),
      )
    })
  })

  describe("NF-UNIT-447: outputSnapshot includes githubIssueRef when set", () => {
    it("includes githubIssueRef in outputSnapshot", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: "acme/app#42" }) as any,
      )

      const result = await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(result.outputSnapshot).toMatchObject({ githubIssueRef: "acme/app#42" })
    })
  })

  describe("NF-UNIT-448: outputSnapshot omits githubIssueRef when null", () => {
    it("does not include githubIssueRef in outputSnapshot when case has no ref", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ github_issue_ref: null }) as any,
      )

      const result = await callExecute(makeCtx({ signalText: "Login is broken" }))

      expect(result.outputSnapshot).not.toHaveProperty("githubIssueRef")
    })
  })
})
