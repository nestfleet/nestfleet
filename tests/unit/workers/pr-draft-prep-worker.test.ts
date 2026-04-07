/**
 * Unit tests: PrDraftPrepWorker — SLICE-06.
 *
 * Covers:
 *   NF-UNIT-340: throws if changeRequestId missing from payload
 *   NF-UNIT-341: throws if change request not found in DB
 *   NF-UNIT-342: idempotency — skips entire flow when CR is already pr-drafted
 *   NF-UNIT-343: runs agent with correct context derived from CR fields
 *   NF-UNIT-344: creates GitHub PR draft when token and repo are available
 *   NF-UNIT-345: GitHub PR creation failure is non-fatal (continues without prNumber)
 *   NF-UNIT-346: transitions CR from implementation-prep to pr-drafted
 *   NF-UNIT-347: transitions case when status is not already resolved
 *   NF-UNIT-348: skips case transition when case is already resolved
 *   NF-UNIT-349: creates two audit events (cr.pr_drafted, case.pr_drafted)
 *   NF-UNIT-350: returns success result with expected outputSnapshot fields
 *   NF-UNIT-351: appends agent output to existing implementation_notes
 *   NF-UNIT-352: uses agent output directly when implementation_notes is null
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/agents/impl/pr-draft-prep.js", () => ({
  runPrDraftPrepAgent: vi.fn(),
  PR_DRAFT_PREP_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findChangeRequestById: vi.fn(),
  findCaseById: vi.fn(),
  findProductById: vi.fn(),
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/domain/cr-state-machine.js", () => ({
  transitionChangeRequest: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/domain/case-state-machine.js", () => ({
  transitionCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/github/client.js", () => ({
  createGitHubClient: vi.fn(),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: { GITHUB_TOKEN: "test-gh-token" },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("../../../src/agents/worker.js", () => ({
  AbstractAgentWorker: class {
    readonly actionType = "pr_draft_prep"
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { PrDraftPrepWorker } from "../../../src/workers/pr-draft-prep-worker.js"
import { runPrDraftPrepAgent } from "../../../src/agents/impl/pr-draft-prep.js"
import {
  findChangeRequestById,
  findCaseById,
  findProductById,
  createAuditEvent,
} from "../../../src/infra/db/repositories/index.js"
import { transitionChangeRequest } from "../../../src/domain/cr-state-machine.js"
import { transitionCase } from "../../../src/domain/case-state-machine.js"
import { createGitHubClient } from "../../../src/infra/github/client.js"
import type { WorkerExecuteContext } from "../../../src/agents/worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Builds a minimal WorkerExecuteContext with an arbitrary payload. */
function makeCtx(payload: Record<string, unknown> = {}): WorkerExecuteContext {
  return {
    job: {
      data: {
        jobId: "test-job-id",
        productId: "prod-1",
        actionType: "pr_draft_prep",
        caseId: "case-1",
        payload,
      },
    },
  } as any
}

/** Default agent result returned by runPrDraftPrepAgent. */
const mockAgentResult = {
  output: {
    prTitle: "Fix: broken auth flow",
    prBody: "This PR fixes the broken auth flow by resetting token expiry.",
    branchName: "fix/auth-flow",
    implementationContext: "Auth module changes affecting token validation",
    diffSummary: "- src/auth/verify.ts (modify): Update token expiry logic\n- src/types/user.ts (modify): Add refreshedAt field",
    fileChanges: [] as { filePath: string; operation: "create" | "modify" | "delete"; content: string; explanation: string }[],
    testingNotes: "Verify token refresh endpoint returns 200 after expiry.",
    riskAssessment: "Low risk — isolated to auth module. Rollback: revert verify.ts.",
    confidenceScore: 0.85,
    evidenceRefs: [],
  },
  modelId: "gpt-4",
  usage: { inputTokens: 1000, outputTokens: 500 },
  durationMs: 3000,
  traceId: "trace-1",
}

/** Minimal CR record for happy-path tests. */
function makeCr(overrides: Record<string, unknown> = {}) {
  return {
    id: "cr-1",
    product_id: "prod-1",
    case_id: "case-1",
    status: "implementation-prep",
    title: "Auth flow is broken",
    problem_statement: "Users cannot log in after token expiry",
    impact_summary: "All users affected",
    implementation_notes: null,
    github_issue_number: null,
    ...overrides,
  }
}

/** Minimal product record. */
function makeProduct(githubRepo?: string) {
  return {
    id: "prod-1",
    support_policy: githubRepo ? { github_repo: githubRepo } : {},
  }
}

/** Minimal case record. */
function makeCase(status = "in-change") {
  return { id: "case-1", status }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default happy-path mock chain
  vi.mocked(findChangeRequestById).mockResolvedValue(makeCr() as any)
  vi.mocked(findProductById).mockResolvedValue(makeProduct("org/repo") as any)
  vi.mocked(findCaseById).mockResolvedValue(makeCase() as any)
  vi.mocked(runPrDraftPrepAgent).mockResolvedValue(mockAgentResult as any)

  // Default GitHub client mock — all methods succeed
  const mockGhClient = {
    getRepoInfo:                  vi.fn().mockResolvedValue({ defaultBranch: "main" }),
    createBranchWithCommit:       vi.fn().mockResolvedValue(undefined),
    createBranchWithMultipleFiles: vi.fn().mockResolvedValue(undefined),
    createPullRequest:            vi.fn().mockResolvedValue({ number: 42, url: "https://github.com/org/repo/pull/42" }),
  }
  vi.mocked(createGitHubClient).mockReturnValue(mockGhClient as any)
})

// ── Helper: call the protected execute method via cast ────────────────────────

function callExecute(ctx: WorkerExecuteContext) {
  const worker = new PrDraftPrepWorker()
  const execute = (worker as any).execute.bind(worker)
  return execute(ctx)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PrDraftPrepWorker.execute()", () => {

  // ── Payload validation ──────────────────────────────────────────────────────

  describe("NF-UNIT-340: payload validation", () => {
    it("throws when changeRequestId is missing from payload", async () => {
      const ctx = makeCtx({}) // no changeRequestId

      await expect(callExecute(ctx)).rejects.toThrow("job missing changeRequestId")
    })

    it("does not call findChangeRequestById when changeRequestId is absent", async () => {
      await callExecute(makeCtx({})).catch(() => {})

      expect(findChangeRequestById).not.toHaveBeenCalled()
    })
  })

  // ── DB lookup ───────────────────────────────────────────────────────────────

  describe("NF-UNIT-341: change request not found", () => {
    it("throws when findChangeRequestById returns null", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(null as any)
      const ctx = makeCtx({ changeRequestId: "cr-missing" })

      await expect(callExecute(ctx)).rejects.toThrow("change request not found")
    })

    it("error message includes the changeRequestId", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(null as any)
      const ctx = makeCtx({ changeRequestId: "cr-missing" })

      const err = await callExecute(ctx).catch((e: Error) => e)

      expect(err.message).toContain("cr-missing")
    })
  })

  // ── Idempotency ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-342: idempotency when CR is already pr-drafted", () => {
    it("returns abstain result without running the agent", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(makeCr({ status: "pr-drafted" }) as any)
      const ctx = makeCtx({ changeRequestId: "cr-1" })

      const result = await callExecute(ctx)

      expect(result).toMatchObject({ outcome: "abstain" })
      expect(runPrDraftPrepAgent).not.toHaveBeenCalled()
    })

    it("does not call transitionChangeRequest when already pr-drafted", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(makeCr({ status: "pr-drafted" }) as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionChangeRequest).not.toHaveBeenCalled()
    })

    it("does not call transitionCase when already pr-drafted", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(makeCr({ status: "pr-drafted" }) as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionCase).not.toHaveBeenCalled()
    })
  })

  // ── Agent invocation ────────────────────────────────────────────────────────

  describe("NF-UNIT-343: agent invocation context", () => {
    it("calls runPrDraftPrepAgent with problemStatement from CR", async () => {
      const ctx = makeCtx({ changeRequestId: "cr-1" })

      await callExecute(ctx)

      expect(runPrDraftPrepAgent).toHaveBeenCalledOnce()
      const agentArg = vi.mocked(runPrDraftPrepAgent).mock.calls[0][0]
      expect(agentArg.problemStatement).toBe("Users cannot log in after token expiry")
    })

    it("passes impactSummary when CR has impact_summary", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const agentArg = vi.mocked(runPrDraftPrepAgent).mock.calls[0][0]
      expect(agentArg.impactSummary).toBe("All users affected")
    })

    it("omits impactSummary when CR impact_summary is null", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ impact_summary: null }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const agentArg = vi.mocked(runPrDraftPrepAgent).mock.calls[0][0]
      expect(agentArg).not.toHaveProperty("impactSummary")
    })

    it("passes productId, caseId, changeRequestId, and jobId from CR and job", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const agentArg = vi.mocked(runPrDraftPrepAgent).mock.calls[0][0]
      expect(agentArg.productId).toBe("prod-1")
      expect(agentArg.caseId).toBe("case-1")
      expect(agentArg.changeRequestId).toBe("cr-1")
      expect(agentArg.jobId).toBe("test-job-id")
    })

    it("falls back to CR title for problemStatement when problem_statement is null", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ problem_statement: null }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const agentArg = vi.mocked(runPrDraftPrepAgent).mock.calls[0][0]
      expect(agentArg.problemStatement).toBe("Auth flow is broken")
    })
  })

  // ── GitHub PR creation ──────────────────────────────────────────────────────

  describe("NF-UNIT-344: GitHub PR creation when token and repo are available", () => {
    it("calls createGitHubClient with the configured token", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(createGitHubClient).toHaveBeenCalledWith("test-gh-token")
    })

    it("creates PR with title, body, branch, and draft:true", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      // Read after the call — createGitHubClient is invoked inside execute()
      const ghClient = vi.mocked(createGitHubClient).mock.results[0]?.value as any
      // Worker uses deterministicBranchName(crId, cr.title) — not the LLM's branchName
      expect(ghClient.createPullRequest).toHaveBeenCalledWith(
        "org/repo",
        expect.objectContaining({
          title: mockAgentResult.output.prTitle,
          body:  mockAgentResult.output.prBody,
          head:  "fix/auth-flow-is-broken-cr-1",
          draft: true,
        }),
      )
    })

    it("includes githubPrUrl in the returned outputSnapshot", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outputSnapshot).toMatchObject({
        githubPrUrl: "https://github.com/org/repo/pull/42",
      })
    })
  })

  // ── GitHub failure is non-fatal ─────────────────────────────────────────────

  describe("NF-UNIT-345: GitHub PR creation failure is non-fatal", () => {
    it("continues execution and returns success when createPullRequest throws", async () => {
      const failingGhClient = {
        getRepoInfo: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
        createPullRequest: vi.fn().mockRejectedValue(new Error("GitHub API unavailable")),
      }
      vi.mocked(createGitHubClient).mockReturnValue(failingGhClient as any)

      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outcome).toBe("success")
    })

    it("outputSnapshot has no githubPrUrl when PR creation fails", async () => {
      const failingGhClient = {
        getRepoInfo: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
        createPullRequest: vi.fn().mockRejectedValue(new Error("GitHub API unavailable")),
      }
      vi.mocked(createGitHubClient).mockReturnValue(failingGhClient as any)

      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outputSnapshot).not.toHaveProperty("githubPrUrl")
    })

    it("still calls transitionChangeRequest despite GitHub failure", async () => {
      const failingGhClient = {
        getRepoInfo: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
        createPullRequest: vi.fn().mockRejectedValue(new Error("GitHub API unavailable")),
      }
      vi.mocked(createGitHubClient).mockReturnValue(failingGhClient as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionChangeRequest).toHaveBeenCalledOnce()
    })
  })

  // ── CR state transition ─────────────────────────────────────────────────────

  describe("NF-UNIT-346: CR transition to pr-drafted", () => {
    it("calls transitionChangeRequest with from=implementation-prep, to=pr-drafted", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionChangeRequest).toHaveBeenCalledWith(
        "cr-1",
        "implementation-prep",
        "pr-drafted",
        expect.any(Object),
      )
    })

    it("passes implementation_notes in the transition patch", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3]
      expect(patch).toHaveProperty("implementation_notes")
    })
  })

  // ── Case state transition guards ────────────────────────────────────────────

  describe("NF-UNIT-347: transitions case when not already resolved", () => {
    it("calls transitionCase when case status is in-change", async () => {
      vi.mocked(findCaseById).mockResolvedValue(makeCase("in-change") as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionCase).toHaveBeenCalledOnce()
    })

    it("transitions case to resolved with resolved_at and summary=prTitle", async () => {
      vi.mocked(findCaseById).mockResolvedValue(makeCase("in-change") as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const [caseId, , toStatus, patch] = vi.mocked(transitionCase).mock.calls[0]!
      expect(caseId).toBe("case-1")
      expect(toStatus).toBe("resolved")
      expect(patch).toMatchObject({
        summary: mockAgentResult.output.prTitle,
      })
      expect((patch as any).resolved_at).toBeInstanceOf(Date)
    })
  })

  describe("NF-UNIT-348: skips case transition when already resolved", () => {
    it("does NOT call transitionCase when case status is resolved", async () => {
      vi.mocked(findCaseById).mockResolvedValue(makeCase("resolved") as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(transitionCase).not.toHaveBeenCalled()
    })
  })

  // ── Audit events ────────────────────────────────────────────────────────────

  describe("NF-UNIT-349: audit event creation", () => {
    it("calls createAuditEvent exactly twice", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(createAuditEvent).toHaveBeenCalledTimes(2)
    })

    it("first audit event has action cr.pr_drafted on entity change_request", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const firstCall = vi.mocked(createAuditEvent).mock.calls[0][0]
      expect(firstCall.action).toBe("cr.pr_drafted")
      expect(firstCall.entity_type).toBe("change_request")
      expect(firstCall.entity_ref).toBe("cr-1")
    })

    it("second audit event has action case.pr_drafted on entity case", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const secondCall = vi.mocked(createAuditEvent).mock.calls[1][0]
      expect(secondCall.action).toBe("case.pr_drafted")
      expect(secondCall.entity_type).toBe("case")
      expect(secondCall.entity_ref).toBe("case-1")
    })

    it("audit events include prTitle in metadata", async () => {
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const [firstCall, secondCall] = vi.mocked(createAuditEvent).mock.calls.map((c) => c[0])
      expect(firstCall.metadata).toMatchObject({ prTitle: mockAgentResult.output.prTitle })
      expect(secondCall.metadata).toMatchObject({ prTitle: mockAgentResult.output.prTitle })
    })
  })

  // ── Return value ────────────────────────────────────────────────────────────

  describe("NF-UNIT-350: success result shape", () => {
    it("returns outcome=success", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outcome).toBe("success")
    })

    it("outputSnapshot contains prTitle, branchName, and confidenceScore", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outputSnapshot).toMatchObject({
        prTitle: mockAgentResult.output.prTitle,
        branchName: mockAgentResult.output.branchName,
        confidenceScore: mockAgentResult.output.confidenceScore,
      })
    })

    it("result includes token usage from agent", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.inputTokens).toBe(1000)
      expect(result.outputTokens).toBe(500)
    })

    it("result includes modelId and durationMs from agent", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.modelId).toBe("gpt-4")
      expect(result.durationMs).toBe(3000)
    })

    it("outputSchemaVersion is set to PR_DRAFT_PREP_SCHEMA_VERSION", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outputSchemaVersion).toBe("1.0")
    })

    it("outputValid is true", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outputValid).toBe(true)
    })

    it("otelTraceId is set from agent result", async () => {
      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.otelTraceId).toBe("trace-1")
    })
  })

  // ── Implementation notes concatenation ──────────────────────────────────────

  describe("NF-UNIT-351: appends to existing implementation_notes", () => {
    it("concatenates existing notes with separator before agent context and diff", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ implementation_notes: "Previous analysis from change_prep." }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3] as Record<string, unknown>
      expect(patch["implementation_notes"]).toContain("Previous analysis from change_prep.")
      expect(patch["implementation_notes"]).toContain("---")
      expect(patch["implementation_notes"]).toContain(mockAgentResult.output.implementationContext)
      expect(patch["implementation_notes"]).toContain(mockAgentResult.output.diffSummary)
    })

    it("existing notes appear before the new agent output", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ implementation_notes: "EXISTING" }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3] as Record<string, unknown>
      const existingIdx = (patch["implementation_notes"] as string).indexOf("EXISTING")
      const newIdx = (patch["implementation_notes"] as string).indexOf(
        mockAgentResult.output.implementationContext
      )
      expect(existingIdx).toBeLessThan(newIdx)
    })
  })

  describe("NF-UNIT-352: handles null implementation_notes", () => {
    it("sets implementation_notes to implementationContext + diffSummary when null", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ implementation_notes: null }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3] as Record<string, unknown>
      expect(patch["implementation_notes"]).toBe(
        `${mockAgentResult.output.implementationContext}\n\n${mockAgentResult.output.diffSummary}`
      )
    })

    it("does not include separator when implementation_notes was null", async () => {
      vi.mocked(findChangeRequestById).mockResolvedValue(
        makeCr({ implementation_notes: null }) as any
      )

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3] as Record<string, unknown>
      expect(patch["implementation_notes"]).not.toContain("---")
    })
  })

  // ── BEF-14: fileChanges → multi-file commit ──────────────────────────────────

  describe("NF-UNIT-353: uses createBranchWithMultipleFiles when fileChanges present (BEF-14)", () => {
    const fileChangesResult = {
      ...mockAgentResult,
      output: {
        ...mockAgentResult.output,
        fileChanges: [
          { filePath: "src/auth/verify.ts", operation: "modify" as const, content: "export function verify() {}", explanation: "Update token expiry logic" },
          { filePath: "src/types/user.ts",  operation: "modify" as const, content: "export type User = { refreshedAt: Date }", explanation: "Add refreshedAt field" },
        ],
      },
    }

    it("calls createBranchWithMultipleFiles when fileChanges is non-empty", async () => {
      vi.mocked(runPrDraftPrepAgent).mockResolvedValue(fileChangesResult as any)
      const ctx = makeCtx({ changeRequestId: "cr-1" })
      await callExecute(ctx)

      const ghClient = vi.mocked(createGitHubClient).mock.results[0]!.value as any
      expect(ghClient.createBranchWithMultipleFiles).toHaveBeenCalledOnce()
      expect(ghClient.createBranchWithCommit).not.toHaveBeenCalled()
    })

    it("commit includes code files + spec file", async () => {
      vi.mocked(runPrDraftPrepAgent).mockResolvedValue(fileChangesResult as any)
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const ghClient = vi.mocked(createGitHubClient).mock.results[0]!.value as any
      const opts = ghClient.createBranchWithMultipleFiles.mock.calls[0][1] as { files: { filePath: string }[] }
      const paths = opts.files.map((f) => f.filePath)
      expect(paths).toContain("src/auth/verify.ts")
      expect(paths).toContain("src/types/user.ts")
      expect(paths.some((p: string) => p.startsWith("docs/pr-spec-"))).toBe(true)
    })

    it("implementation_notes includes ## Files Changed section", async () => {
      vi.mocked(runPrDraftPrepAgent).mockResolvedValue(fileChangesResult as any)
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const patch = vi.mocked(transitionChangeRequest).mock.calls[0]![3] as Record<string, unknown>
      expect(patch["implementation_notes"]).toContain("## Files Changed")
      expect(patch["implementation_notes"]).toContain("src/auth/verify.ts")
      expect(patch["implementation_notes"]).toContain("src/types/user.ts")
    })

    it("falls back to createBranchWithCommit when fileChanges is empty", async () => {
      // Default mockAgentResult has fileChanges: []
      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      const ghClient = vi.mocked(createGitHubClient).mock.results[0]!.value as any
      expect(ghClient.createBranchWithCommit).toHaveBeenCalledOnce()
      expect(ghClient.createBranchWithMultipleFiles).not.toHaveBeenCalled()
    })
  })

  // ── GitHub not called when repo is absent ───────────────────────────────────

  describe("GitHub PR skipped when githubRepo is unavailable", () => {
    it("does not call createGitHubClient when product has no github_repo", async () => {
      vi.mocked(findProductById).mockResolvedValue(makeProduct(undefined) as any)

      await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(createGitHubClient).not.toHaveBeenCalled()
    })

    it("returns success with no githubPrUrl when repo is absent", async () => {
      vi.mocked(findProductById).mockResolvedValue(makeProduct(undefined) as any)

      const result = await callExecute(makeCtx({ changeRequestId: "cr-1" }))

      expect(result.outcome).toBe("success")
      expect(result.outputSnapshot).not.toHaveProperty("githubPrUrl")
    })
  })
})
