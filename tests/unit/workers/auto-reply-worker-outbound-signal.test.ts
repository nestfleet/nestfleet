/**
 * Unit tests: AutoReplyWorker — outbound signal creation.
 *
 * Covers:
 *   NF-UNIT-450: autoSend=true → createSignal called with direction "outbound"
 *   NF-UNIT-451: outbound signal carries correct body (raw agent reply text)
 *   NF-UNIT-452: outbound signal carries correct case linkage (case_id, conversation_id)
 *   NF-UNIT-453: outbound signal uses processing_status "linked"
 *   NF-UNIT-454: outbound signal uses source_type "email"
 *   NF-UNIT-455: outbound signal uses fromEmail "nestfleet-auto-reply" in normalized_payload
 *   NF-UNIT-456: autoSend=false (gate failure) → createSignal NOT called
 *   NF-UNIT-457: sendEmail throws → createSignal is still called (signal always persisted)
 *   NF-UNIT-458: createSignal throws → warning logged, worker returns success (non-fatal)
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/agents/impl/auto-reply.js", () => ({
  runAutoReplyAgent: vi.fn(),
  AUTO_REPLY_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findCaseById:     vi.fn(),
  findProductById:  vi.fn(),
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/db/repositories/identities.js", () => ({
  findIdentityById: vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/cases.js", () => ({
  saveDraftReply: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/db/repositories/signals.js", () => ({
  createSignal: vi.fn(),
}))

vi.mock("../../../src/domain/case-state-machine.js", () => ({
  transitionCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/github/client.js", () => ({
  createGitHubClient: vi.fn().mockReturnValue({
    addIssueComment: vi.fn().mockResolvedValue({}),
  }),
}))

vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/shared/ai-disclosure.js", () => ({
  // Pass-through — just return the text unchanged so tests can assert on agent output
  applyDisclosure: vi.fn().mockImplementation((text: string) => text),
}))

vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("../../../src/chat/session-registry.js", () => ({
  publish: vi.fn(),
}))

vi.mock("../../../src/notifications/operator-registry.js", () => ({
  publish: vi.fn(),
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
  config: { GITHUB_TOKEN: undefined },
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
import { findIdentityById } from "../../../src/infra/db/repositories/identities.js"
import { createSignal } from "../../../src/infra/db/repositories/signals.js"
import { sendEmail } from "../../../src/email/sender.js"
import { logger } from "../../../src/shared/logger.js"
import type { WorkerExecuteContext } from "../../../src/agents/worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(payload: Record<string, unknown> = {}): WorkerExecuteContext {
  return {
    job: {
      data: {
        jobId:      "test-job-id",
        productId:  "prod-1",
        actionType: "auto_reply",
        caseId:     "case-1",
        payload,
      },
    },
    productId: "prod-1",
    caseId:    "case-1",
  } as any
}

const GOOD_AGENT_RESULT = {
  output: {
    replyText:           "Thank you for reaching out. We are looking into this.",
    confidenceScore:     0.92,
    sourceTiers:         [1],
    evidenceRefs:        ["doc-1"],
    reasoning:           "Strong T1 source match",
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
    reporter_identity_id: "identity-1",
    github_issue_ref:    null,
    conversation_ids:    ["conv-1"],
    ...overrides,
  }
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    product_id:       "prod-1",
    name:             "TestApp",
    agent_config:     {},
    lead_assignments: {},
    ...overrides,
  }
}

function makeIdentity(email: string) {
  return { identity_id: "identity-1", email_addresses: [email] }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(findCaseById).mockResolvedValue(makeCase() as any)
  vi.mocked(findProductById).mockResolvedValue(makeProduct() as any)
  vi.mocked(runAutoReplyAgent).mockResolvedValue(GOOD_AGENT_RESULT as any)
  vi.mocked(findIdentityById).mockResolvedValue(makeIdentity("customer@example.com") as any)
  vi.mocked(createSignal).mockResolvedValue({ signal_id: "sig-new" } as any)
})

function callExecute(ctx: WorkerExecuteContext) {
  const worker = new AutoReplyWorker()
  return (worker as any).execute.call(worker, ctx)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AutoReplyWorker.execute() — outbound signal creation", () => {

  describe("NF-UNIT-450: autoSend=true → createSignal called with direction outbound", () => {
    it("calls createSignal exactly once when all gates pass", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      expect(vi.mocked(createSignal)).toHaveBeenCalledOnce()
      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.raw_payload).toMatchObject({ direction: "outbound" })
      expect(arg.normalized_payload).toMatchObject({ direction: "outbound" })
    })
  })

  describe("NF-UNIT-451: outbound signal carries the agent reply text in body", () => {
    it("raw_payload.body equals the agent replyText", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.raw_payload["body"]).toBe(GOOD_AGENT_RESULT.output.replyText)
    })

    it("normalized_payload.body equals the agent replyText", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect((arg.normalized_payload as Record<string, unknown>)["body"]).toBe(
        GOOD_AGENT_RESULT.output.replyText,
      )
    })
  })

  describe("NF-UNIT-452: outbound signal carries correct case linkage", () => {
    it("signal has case_id set", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.case_id).toBe("case-1")
    })

    it("signal has conversation_id from case.conversation_ids[0]", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ conversation_ids: ["conv-42"] }) as any,
      )

      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.conversation_id).toBe("conv-42")
    })

    it("signal conversation_id is undefined when case has no conversation_ids", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ conversation_ids: [] }) as any,
      )

      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.conversation_id).toBeUndefined()
    })
  })

  describe("NF-UNIT-453: outbound signal uses processing_status linked", () => {
    it("processing_status is 'linked'", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.processing_status).toBe("linked")
    })
  })

  describe("NF-UNIT-454: outbound signal uses source_type email", () => {
    it("source_type is 'email'", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.source_type).toBe("email")
    })
  })

  describe("NF-UNIT-455: normalized_payload.fromEmail is nestfleet-auto-reply", () => {
    it("fromEmail identifies the sender as the auto-reply system", async () => {
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect((arg.normalized_payload as Record<string, unknown>)["fromEmail"]).toBe(
        "nestfleet-auto-reply",
      )
    })
  })

  describe("NF-UNIT-456: autoSend=false → createSignal NOT called", () => {
    it("does not create a signal when gate 1 (confidence) fails", async () => {
      vi.mocked(runAutoReplyAgent).mockResolvedValue({
        ...GOOD_AGENT_RESULT,
        output: { ...GOOD_AGENT_RESULT.output, confidenceScore: 0.50 },
      } as any)

      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      expect(vi.mocked(createSignal)).not.toHaveBeenCalled()
    })

    it("does not create a signal when gate 3 (requiresHumanReview) fails", async () => {
      vi.mocked(runAutoReplyAgent).mockResolvedValue({
        ...GOOD_AGENT_RESULT,
        output: { ...GOOD_AGENT_RESULT.output, requiresHumanReview: true },
      } as any)

      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      expect(vi.mocked(createSignal)).not.toHaveBeenCalled()
    })

    it("does not create a signal when forceDraftOnly=true", async () => {
      vi.mocked(findCaseById).mockResolvedValue(
        makeCase({ status: "awaiting-lead" }) as any,
      )

      await callExecute(makeCtx({ signalText: "I cannot log in", forceDraftOnly: true }))

      expect(vi.mocked(createSignal)).not.toHaveBeenCalled()
    })
  })

  describe("NF-UNIT-457: sendEmail throws → createSignal is still called", () => {
    it("persists the outbound signal even when email delivery fails", async () => {
      vi.mocked(sendEmail).mockRejectedValue(new Error("SMTP 503"))

      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      // Signal should still be created despite the email failure
      expect(vi.mocked(createSignal)).toHaveBeenCalledOnce()
      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.raw_payload).toMatchObject({ direction: "outbound" })
    })

    it("uses raw replyText in raw_payload.body regardless of email send outcome", async () => {
      vi.mocked(sendEmail).mockRejectedValue(new Error("SMTP 503"))
      // raw_payload.body is always output.replyText — not the disclosure-wrapped
      // email body — so the signal stores the canonical agent text
      await callExecute(makeCtx({ signalText: "I cannot log in" }))

      const arg = vi.mocked(createSignal).mock.calls[0][0]
      expect(arg.raw_payload["body"]).toBe(GOOD_AGENT_RESULT.output.replyText)
    })
  })

  describe("NF-UNIT-458: createSignal throws → warning logged, worker still succeeds", () => {
    it("logs a warning and returns outcome=success when signal creation fails", async () => {
      vi.mocked(createSignal).mockRejectedValue(new Error("DB constraint violation"))

      const result = await callExecute(makeCtx({ signalText: "I cannot log in" }))

      expect(result.outcome).toBe("success")
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: "case-1" }),
        expect.stringContaining("outbound signal creation failed"),
      )
    })
  })
})
