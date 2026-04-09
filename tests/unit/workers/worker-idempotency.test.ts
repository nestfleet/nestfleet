/**
 * Unit tests: Worker idempotency guards — QE-02 red phase.
 *
 * Proves that FrontlineWorker, StewardWorker, and OutageRoutingWorker are
 * retry-safe: when pg-boss retries a job and the case has already advanced
 * past the worker's expected entry status, the worker must detect this and
 * return outcome="abstain" WITHOUT calling transitionCase/transitionAndDispatch.
 *
 * Reference implementation: ChangePrepWorker line ~71 — `if (cr.status === "draft")`
 *
 * Pattern tested for each worker:
 *   - findCaseById returns a case whose status is PAST the expected entry state
 *   - worker.execute(ctx) is called
 *   - result.outcome === "abstain"
 *   - transitionCase / transitionAndDispatch NOT called
 *
 * QE-IDEM-01 through QE-IDEM-12
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

// Repositories
vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findCaseById:       vi.fn(),
  findProductById:    vi.fn(),
  findSignalById:     vi.fn().mockResolvedValue(null),
  createAuditEvent:   vi.fn().mockResolvedValue(undefined),
  createChangeRequest: vi.fn(),
}))

// Case state machine — must NOT be called on idempotent retry
vi.mock("../../../src/domain/case-state-machine.js", () => ({
  transitionCase: vi.fn(),
  InvalidStateTransitionError: class InvalidStateTransitionError extends Error {
    constructor(
      public readonly entityType: string,
      public readonly entityId: string,
      public readonly from: string,
      public readonly to: string,
    ) {
      super(`Illegal ${entityType} transition: ${from} → ${to} (entity: ${entityId})`)
      this.name = "InvalidStateTransitionError"
    }
  },
}))

// Transactional dispatch — must NOT be called on idempotent retry
vi.mock("../../../src/domain/transactional-dispatch.js", () => ({
  transitionAndDispatch: vi.fn(),
}))

// Agent implementations — mocked so we test only the worker guard logic
vi.mock("../../../src/agents/impl/triage.js", () => ({
  runTriageAgent:       vi.fn(),
  TRIAGE_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/agents/impl/known-issue-match.js", () => ({
  runKnownIssueMatchAgent:       vi.fn(),
  KNOWN_ISSUE_MATCH_SCHEMA_VERSION: "1.0",
}))

vi.mock("../../../src/agents/impl/outage-routing.js", () => ({
  runOutageRoutingAgent:       vi.fn(),
  OUTAGE_ROUTING_SCHEMA_VERSION: "1.0",
}))

// Dispatcher (used by StewardWorker for outage dispatch)
vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}))

// Notifications (best-effort, non-critical for these tests)
vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

// License / RBAC (StewardWorker uses these for the known-issue-match tier gate)
vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue("starter"),
}))

vi.mock("../../../src/rbac/permission-engine.js", () => ({
  licenseToProductTier: vi.fn().mockReturnValue("starter"),
}))

vi.mock("../../../src/auth/middleware.js", () => ({
  meetsMinTier: vi.fn().mockReturnValue(false),
}))

// AbstractAgentWorker base class — stripped to its minimal contract
vi.mock("../../../src/agents/worker.js", () => ({
  AbstractAgentWorker: class {
    readonly actionType = "triage"
  },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { FrontlineWorker } from "../../../src/workers/frontline-worker.js"
import { StewardWorker } from "../../../src/workers/steward-worker.js"
import { OutageRoutingWorker } from "../../../src/workers/outage-routing-worker.js"
import { findCaseById, createAuditEvent } from "../../../src/infra/db/repositories/index.js"
import { transitionCase } from "../../../src/domain/case-state-machine.js"
import { transitionAndDispatch } from "../../../src/domain/transactional-dispatch.js"
import type { WorkerExecuteContext } from "../../../src/agents/worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(caseId = "case-test-1", payload: Record<string, unknown> = {}): WorkerExecuteContext {
  return {
    job: {
      data: {
        jobId:      "job-test-1",
        productId:  "prod-test",
        actionType: "triage",
        caseId,
        payload,
      },
    },
    productId: "prod-test",
    caseId,
  } as WorkerExecuteContext
}

function makeCase(status: string, overrides: Record<string, unknown> = {}) {
  return {
    case_id:         "case-test-1",
    product_id:      "prod-test",
    status,
    title:           "Auth service is down",
    signal_text:     "Users cannot log in — auth service returning 503",
    severity:        "high",
    type:            "bug_report",
    triage_output:   null,
    github_issue_ref: null,
    created_at:      new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function callExecute(worker: FrontlineWorker | StewardWorker | OutageRoutingWorker, ctx: WorkerExecuteContext) {
  return (worker as any).execute.call(worker, ctx)
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createAuditEvent).mockResolvedValue(undefined as any)
})

// ─────────────────────────────────────────────────────────────────────────────
// FrontlineWorker — expected entry state: "enriching"
// If the case is already "triaged" (or beyond), this is a pg-boss retry.
// ─────────────────────────────────────────────────────────────────────────────

describe("FrontlineWorker — idempotency guard (QE-02)", () => {
  it("QE-IDEM-01: returns outcome='abstain' when case is already 'triaged' (past enriching)", async () => {
    // Case has advanced past the expected entry state (enriching → triaged)
    vi.mocked(findCaseById).mockResolvedValue(makeCase("triaged") as any)

    const worker = new FrontlineWorker()
    const result = await callExecute(worker, makeCtx())

    // After QE-02 fix, FrontlineWorker detects case.status !== "enriching" and abstains.
    // Currently it calls runTriageAgent → transitionAndDispatch regardless. Test is red.
    expect(result.outcome).toBe("abstain")
  })

  it("QE-IDEM-02: transitionAndDispatch is NOT called when case is already past enriching", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("triaged") as any)

    const worker = new FrontlineWorker()
    await callExecute(worker, makeCtx())

    // The atomic transition must not fire on retry — that would corrupt state
    expect(transitionAndDispatch).not.toHaveBeenCalled()
  })

  it("QE-IDEM-03: transitionCase is NOT called when case is already past enriching", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("triaged") as any)

    const worker = new FrontlineWorker()
    await callExecute(worker, makeCtx())

    expect(transitionCase).not.toHaveBeenCalled()
  })

  it("QE-IDEM-04: returns outcome='abstain' for any status beyond enriching (in-resolution)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("in-resolution") as any)

    const worker = new FrontlineWorker()
    const result = await callExecute(worker, makeCtx())

    expect(result.outcome).toBe("abstain")
    expect(transitionAndDispatch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// StewardWorker — expected entry state: "triaged"
// If the case is already "in-resolution", "awaiting-lead", or "in-change",
// this is a pg-boss retry. The Steward must not re-transition.
// ─────────────────────────────────────────────────────────────────────────────

describe("StewardWorker — idempotency guard (QE-02)", () => {
  it("QE-IDEM-05: returns outcome='abstain' when case is already 'in-resolution' (past triaged)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("in-resolution") as any)

    const worker = new StewardWorker()
    const result = await callExecute(worker, makeCtx("case-test-1", { signalText: "Auth down" }))

    // After QE-02 fix, StewardWorker detects case.status !== "triaged" and abstains.
    // Currently it calls runKnownIssueMatchAgent → transitionAndDispatch regardless. Test is red.
    expect(result.outcome).toBe("abstain")
  })

  it("QE-IDEM-06: transitionAndDispatch is NOT called when case is already past triaged", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("in-resolution") as any)

    const worker = new StewardWorker()
    await callExecute(worker, makeCtx("case-test-1", { signalText: "Auth down" }))

    expect(transitionAndDispatch).not.toHaveBeenCalled()
  })

  it("QE-IDEM-07: transitionCase is NOT called when case is already past triaged", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("in-resolution") as any)

    const worker = new StewardWorker()
    await callExecute(worker, makeCtx("case-test-1", { signalText: "Auth down" }))

    expect(transitionCase).not.toHaveBeenCalled()
  })

  it("QE-IDEM-08: returns outcome='abstain' for 'awaiting-lead' status (another post-triaged state)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("awaiting-lead") as any)

    const worker = new StewardWorker()
    const result = await callExecute(worker, makeCtx("case-test-1", { signalText: "Auth down" }))

    expect(result.outcome).toBe("abstain")
    expect(transitionAndDispatch).not.toHaveBeenCalled()
  })

  it("QE-IDEM-09: returns outcome='abstain' for 'in-change' status (another post-triaged state)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCase("in-change") as any)

    const worker = new StewardWorker()
    const result = await callExecute(worker, makeCtx("case-test-1", { signalText: "Auth down" }))

    expect(result.outcome).toBe("abstain")
    expect(transitionAndDispatch).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// OutageRoutingWorker — does not own a state transition (it only creates audit
// events + sends notifications). Idempotency guard: if the outage routing has
// already run for this case (detected via case metadata or a duplicate audit
// event), the worker should abstain rather than re-notifying all leads.
//
// The guard pattern: check case status — if case is already "resolved" or
// "closed", skip re-routing and return abstain.
// ─────────────────────────────────────────────────────────────────────────────

describe("OutageRoutingWorker — idempotency guard (QE-02)", () => {
  it("QE-IDEM-10: returns outcome='abstain' when case is already 'resolved'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(
      makeCase("resolved", { severity: "critical" }) as any,
    )

    const worker = new OutageRoutingWorker()
    const ctx = makeCtx("case-test-1", {
      signalText: "Database unreachable",
      reportedAt: "2026-01-01T00:00:00Z",
    })
    const result = await callExecute(worker, ctx)

    // After QE-02 fix, OutageRoutingWorker skips re-running when case is resolved/closed.
    // Currently it calls runOutageRoutingAgent regardless. Test is red.
    expect(result.outcome).toBe("abstain")
  })

  it("QE-IDEM-11: returns outcome='abstain' when case is already 'closed'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(
      makeCase("closed", { severity: "critical" }) as any,
    )

    const worker = new OutageRoutingWorker()
    const ctx = makeCtx("case-test-1", {
      signalText: "Database unreachable",
      reportedAt: "2026-01-01T00:00:00Z",
    })
    const result = await callExecute(worker, ctx)

    expect(result.outcome).toBe("abstain")
  })

  it("QE-IDEM-12: runOutageRoutingAgent is NOT called when case is already resolved", async () => {
    const { runOutageRoutingAgent } = await import("../../../src/agents/impl/outage-routing.js")
    vi.mocked(findCaseById).mockResolvedValue(
      makeCase("resolved", { severity: "critical" }) as any,
    )

    const worker = new OutageRoutingWorker()
    const ctx = makeCtx("case-test-1", {
      signalText: "Database unreachable",
      reportedAt: "2026-01-01T00:00:00Z",
    })
    await callExecute(worker, ctx)

    // The agent must not be invoked — that would re-send critical notifications
    expect(runOutageRoutingAgent).not.toHaveBeenCalled()
  })
})
