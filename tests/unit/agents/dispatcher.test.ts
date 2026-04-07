/**
 * Unit tests: dispatch() and dispatchInTransaction() — AE-04 / ADR-025.
 *
 * NF-UNIT-300: dispatch() rejects invalid action type
 * NF-UNIT-301: dispatch() rejects growth-gated action on free tier
 * NF-UNIT-302: dispatch() allows growth-gated action on growth tier
 * NF-UNIT-303: dispatch() rejects when hard budget limit exceeded
 * NF-UNIT-304: dispatch() warns but proceeds on soft limit exceeded
 * NF-UNIT-305: dispatch() generates singleton key from actionType:caseId
 * NF-UNIT-306: dispatch() has no singleton key when caseId undefined
 * NF-UNIT-307: dispatch() creates queue before sending
 * NF-UNIT-308: dispatch() returns pg-boss job ID
 * NF-UNIT-309: dispatch() falls back to jobId when boss.send returns null
 * NF-UNIT-310: dispatchInTransaction() rejects invalid action type
 * NF-UNIT-311: dispatchInTransaction() rejects when hard budget exceeded
 * NF-UNIT-312: dispatchInTransaction() inserts into pgboss.job via tx
 * NF-UNIT-313: dispatchInTransaction() uses tx.json for JSONB serialization
 * NF-UNIT-314: dispatchInTransaction() builds singleton key from actionType:caseId
 * NF-UNIT-315: dispatchInTransaction() returns row.id or falls back to jobId
 *
 * All DB calls and pg-boss are mocked — no real DB needed.
 */

import { vi } from "vitest"

// ── Module mocks (must appear before any imports from mocked modules) ─────────

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn(),
}))

vi.mock("../../../src/agents/budget.js", () => ({
  checkBudget: vi.fn(),
}))

vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn(),
}))

vi.mock("../../../src/rbac/permission-engine.js", () => ({
  licenseToProductTier: vi.fn(),
}))

vi.mock("../../../src/auth/middleware.js", () => ({
  meetsMinTier: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest"
import { dispatch, dispatchInTransaction } from "../../../src/agents/dispatcher.js"
import { TokenBudgetError } from "../../../src/shared/errors.js"
import { getBoss } from "../../../src/infra/queue/boss.js"
import { checkBudget } from "../../../src/agents/budget.js"
import { getLicenseTier } from "../../../src/license/validator.js"
import { licenseToProductTier } from "../../../src/rbac/permission-engine.js"
import { meetsMinTier } from "../../../src/auth/middleware.js"
import { logger } from "../../../src/shared/logger.js"
import type { BudgetStatus } from "../../../src/agents/budget.js"

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockGetBoss          = vi.mocked(getBoss)
const mockCheckBudget      = vi.mocked(checkBudget)
const mockGetLicenseTier   = vi.mocked(getLicenseTier)
const mockLicenseToTier    = vi.mocked(licenseToProductTier)
const mockMeetsMinTier     = vi.mocked(meetsMinTier)
const mockLoggerWarn       = vi.mocked(logger.warn)

// ── Shared boss mock ──────────────────────────────────────────────────────────

const mockBoss = {
  createQueue: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue("pg-boss-job-id"),
}

// ── Shared tx mock (postgres.js tagged template + .json helper) ───────────────

const mockTx = Object.assign(
  vi.fn().mockResolvedValue([{ id: "pg-boss-tx-id" }]),
  { json: vi.fn().mockImplementation((v) => v) },
)

// ── Budget status factories ───────────────────────────────────────────────────

function setupBudgetOk(): void {
  mockCheckBudget.mockResolvedValue({
    hardLimitExceeded: false,
    softLimitExceeded: false,
    currentTokens:     1_000,
    hardLimit:         100_000,
    softLimit:         80_000,
    monthYear:         "2026-03",
  } satisfies BudgetStatus)
}

function budgetSoftExceeded(): BudgetStatus {
  return {
    hardLimitExceeded: false,
    softLimitExceeded: true,
    currentTokens:     85_000,
    hardLimit:         100_000,
    softLimit:         80_000,
    monthYear:         "2026-03",
  }
}

function budgetHardExceeded(): BudgetStatus {
  return {
    hardLimitExceeded: true,
    softLimitExceeded: true,
    currentTokens:     1_000_001,
    hardLimit:         1_000_000,
    softLimit:         800_000,
    monthYear:         "2026-03",
  }
}

// ── Default dispatch opts ─────────────────────────────────────────────────────

const baseOpts = {
  productId: "prod_test",
  caseId:    "case_123",
  jobId:     "job_uuid-001",
} as const

// ── Test suites ───────────────────────────────────────────────────────────────

describe("dispatch()", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBoss.mockResolvedValue(mockBoss as any)
    mockBoss.createQueue.mockResolvedValue(undefined)
    mockBoss.send.mockResolvedValue("pg-boss-job-id")
    // Default: growth-tier gate passes (non-gated actions don't call these at all)
    mockGetLicenseTier.mockReturnValue("growth")
    mockLicenseToTier.mockReturnValue("growth")
    mockMeetsMinTier.mockReturnValue(true)
    setupBudgetOk()
  })

  // NF-UNIT-300 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-300: rejects invalid action type", async () => {
    await expect(
      dispatch({ ...baseOpts, actionType: "foo" as any }),
    ).rejects.toThrow('Invalid actionType "foo"')
  })

  it("NF-UNIT-300 (variant): error message mentions TOOL_SETS_BY_ACTION_TYPE rejection", async () => {
    await expect(
      dispatch({ ...baseOpts, actionType: "bar" as any }),
    ).rejects.toThrow("Dispatch rejected")
  })

  // NF-UNIT-301 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-301: rejects growth-gated action on non-growth tier", async () => {
    mockGetLicenseTier.mockReturnValue("starter")
    mockLicenseToTier.mockReturnValue("starter")
    mockMeetsMinTier.mockReturnValue(false)

    await expect(
      dispatch({ ...baseOpts, actionType: "knowledge_capture" }),
    ).rejects.toThrow('Action type "knowledge_capture" requires Growth tier or higher')
  })

  it("NF-UNIT-301 (variant): error includes current tier in message", async () => {
    mockGetLicenseTier.mockReturnValue("community")
    mockLicenseToTier.mockReturnValue("community")
    mockMeetsMinTier.mockReturnValue(false)

    await expect(
      dispatch({ ...baseOpts, actionType: "knowledge_capture" }),
    ).rejects.toThrow("community")
  })

  // NF-UNIT-302 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-302: allows growth-gated action on growth tier", async () => {
    mockGetLicenseTier.mockReturnValue("growth")
    mockLicenseToTier.mockReturnValue("growth")
    mockMeetsMinTier.mockReturnValue(true)

    await expect(
      dispatch({ ...baseOpts, actionType: "knowledge_capture" }),
    ).resolves.toBeDefined()
  })

  it("NF-UNIT-302 (scale tier): allows growth-gated action on scale tier", async () => {
    mockGetLicenseTier.mockReturnValue("scale")
    mockLicenseToTier.mockReturnValue("scale")
    mockMeetsMinTier.mockReturnValue(true)

    await expect(
      dispatch({ ...baseOpts, actionType: "knowledge_capture" }),
    ).resolves.toBeDefined()
  })

  // NF-UNIT-303 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-303: rejects when hard budget limit exceeded", async () => {
    mockCheckBudget.mockResolvedValue(budgetHardExceeded())

    await expect(
      dispatch({ ...baseOpts, actionType: "triage" }),
    ).rejects.toThrow(TokenBudgetError)
  })

  it("NF-UNIT-303 (variant): thrown TokenBudgetError has correct metadata", async () => {
    mockCheckBudget.mockResolvedValue(budgetHardExceeded())

    let caught: unknown
    try {
      await dispatch({ ...baseOpts, actionType: "triage", productId: "prod_over_budget" })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TokenBudgetError)
    const err = caught as TokenBudgetError
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe("TOKEN_BUDGET_EXCEEDED")
    expect(err.productId).toBe("prod_over_budget")
    expect(err.actionType).toBe("triage")
    expect(err.hardLimit).toBe(1_000_000)
    expect(err.currentTokens).toBe(1_000_001)
  })

  // NF-UNIT-304 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-304: warns but proceeds on soft limit exceeded", async () => {
    mockCheckBudget.mockResolvedValue(budgetSoftExceeded())

    const result = await dispatch({ ...baseOpts, actionType: "triage" })

    expect(result).toBeDefined()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ currentTokens: 85_000, softLimit: 80_000 }),
      expect.stringContaining("soft limit"),
    )
  })

  it("NF-UNIT-304 (variant): job is enqueued even on soft limit", async () => {
    mockCheckBudget.mockResolvedValue(budgetSoftExceeded())

    await dispatch({ ...baseOpts, actionType: "triage" })

    expect(mockBoss.send).toHaveBeenCalledTimes(1)
  })

  // NF-UNIT-305 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-305: generates singleton key from actionType:caseId", async () => {
    await dispatch({ ...baseOpts, actionType: "triage", caseId: "case_singleton" })

    expect(mockBoss.send).toHaveBeenCalledWith(
      "triage",
      expect.any(Object),
      expect.objectContaining({ singletonKey: "triage:case_singleton" }),
    )
  })

  // NF-UNIT-306 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-306: no singleton key when caseId is undefined", async () => {
    const { caseId: _omit, ...optsWithoutCase } = baseOpts
    await dispatch({ ...optsWithoutCase, actionType: "triage" })

    const sendCall = mockBoss.send.mock.calls[0]
    const options = sendCall[2] as Record<string, unknown>
    expect(options).not.toHaveProperty("singletonKey")
  })

  // NF-UNIT-307 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-307: creates queue before sending", async () => {
    await dispatch({ ...baseOpts, actionType: "auto_reply" })

    expect(mockBoss.createQueue).toHaveBeenCalledWith("auto_reply")
    // createQueue must be called before send
    const createOrder = mockBoss.createQueue.mock.invocationCallOrder[0]
    const sendOrder   = mockBoss.send.mock.invocationCallOrder[0]
    expect(createOrder).toBeLessThan(sendOrder)
  })

  it("NF-UNIT-307 (variant): createQueue is called with the correct queue name", async () => {
    await dispatch({ ...baseOpts, actionType: "known_issue_match" })

    expect(mockBoss.createQueue).toHaveBeenCalledWith("known_issue_match")
    expect(mockBoss.createQueue).toHaveBeenCalledTimes(1)
  })

  // NF-UNIT-308 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-308: returns the pg-boss job ID when boss.send resolves with an ID", async () => {
    mockBoss.send.mockResolvedValue("boss-assigned-id-abc")

    const id = await dispatch({ ...baseOpts, actionType: "triage" })

    expect(id).toBe("boss-assigned-id-abc")
  })

  // NF-UNIT-309 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-309: falls back to opts.jobId when boss.send returns null", async () => {
    mockBoss.send.mockResolvedValue(null)

    const id = await dispatch({ ...baseOpts, actionType: "triage", jobId: "caller-job-id" })

    expect(id).toBe("caller-job-id")
  })
})

// ── dispatchInTransaction() ───────────────────────────────────────────────────

describe("dispatchInTransaction()", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTx.mockResolvedValue([{ id: "pg-boss-tx-id" }])
    mockTx.json.mockImplementation((v) => v)
    mockGetLicenseTier.mockReturnValue("growth")
    mockLicenseToTier.mockReturnValue("growth")
    mockMeetsMinTier.mockReturnValue(true)
    setupBudgetOk()
  })

  // NF-UNIT-310 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-310: rejects invalid action type", async () => {
    await expect(
      dispatchInTransaction(mockTx, { ...baseOpts, actionType: "foo" as any }),
    ).rejects.toThrow('Invalid actionType "foo"')
  })

  it("NF-UNIT-310 (variant): no tx call is made for invalid action type", async () => {
    try {
      await dispatchInTransaction(mockTx, { ...baseOpts, actionType: "invalid" as any })
    } catch {
      // expected
    }

    expect(mockTx).not.toHaveBeenCalled()
  })

  // NF-UNIT-311 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-311: rejects when hard budget exceeded", async () => {
    mockCheckBudget.mockResolvedValue(budgetHardExceeded())

    await expect(
      dispatchInTransaction(mockTx, { ...baseOpts, actionType: "triage" }),
    ).rejects.toThrow(TokenBudgetError)
  })

  it("NF-UNIT-311 (variant): no tx call is made when hard budget exceeded", async () => {
    mockCheckBudget.mockResolvedValue(budgetHardExceeded())

    try {
      await dispatchInTransaction(mockTx, { ...baseOpts, actionType: "triage" })
    } catch {
      // expected
    }

    expect(mockTx).not.toHaveBeenCalled()
  })

  // NF-UNIT-312 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-312: inserts into pgboss.job via the tx tagged-template function", async () => {
    await dispatchInTransaction(mockTx, { ...baseOpts, actionType: "triage" })

    expect(mockTx).toHaveBeenCalledTimes(1)
  })

  it("NF-UNIT-312 (variant): tx is called with the action type and job data", async () => {
    await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "auto_reply",
      productId:  "prod_tx_test",
    })

    // The tagged-template call args include the raw string parts and the interpolated values.
    // We verify the tx was invoked with arguments that include the action type string.
    const callArgs = mockTx.mock.calls[0]
    const allArgs  = callArgs.flat(Infinity)
    const hasActionType = allArgs.some((a) => a === "auto_reply")
    expect(hasActionType).toBe(true)
  })

  // NF-UNIT-313 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-313: uses tx.json() for JSONB serialization of job data (bug-fix regression)", async () => {
    await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "triage",
      payload:    { contextKey: "value" },
    })

    expect(mockTx.json).toHaveBeenCalledTimes(1)
    // tx.json must be called with the job data object
    const jsonArg = mockTx.json.mock.calls[0][0] as Record<string, unknown>
    expect(jsonArg).toMatchObject({
      actionType: "triage",
      productId:  "prod_test",
      jobId:      "job_uuid-001",
    })
  })

  it("NF-UNIT-313 (variant): payload is included in the object passed to tx.json", async () => {
    await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "triage",
      payload:    { ticketId: "TKT-42" },
    })

    const jsonArg = mockTx.json.mock.calls[0][0] as Record<string, unknown>
    expect(jsonArg.payload).toEqual({ ticketId: "TKT-42" })
  })

  // NF-UNIT-314 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-314: builds singleton key from actionType:caseId in SQL args", async () => {
    await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "triage",
      caseId:     "case_tx_singleton",
    })

    const callArgs = mockTx.mock.calls[0]
    const allArgs  = callArgs.flat(Infinity)
    const hasSingletonKey = allArgs.some((a) => a === "triage:case_tx_singleton")
    expect(hasSingletonKey).toBe(true)
  })

  it("NF-UNIT-314 (no caseId): singleton key is null when caseId not provided", async () => {
    const { caseId: _omit, ...optsWithoutCase } = baseOpts
    await dispatchInTransaction(mockTx, { ...optsWithoutCase, actionType: "triage" })

    const callArgs = mockTx.mock.calls[0]
    const allArgs  = callArgs.flat(Infinity)
    // null is passed as the singleton_key parameter
    const hasNull = allArgs.some((a) => a === null)
    expect(hasNull).toBe(true)
  })

  // NF-UNIT-315 ─────────────────────────────────────────────────────────────

  it("NF-UNIT-315: returns row.id from the INSERT RETURNING result", async () => {
    mockTx.mockResolvedValue([{ id: "returned-pg-boss-id" }])

    const id = await dispatchInTransaction(mockTx, { ...baseOpts, actionType: "triage" })

    expect(id).toBe("returned-pg-boss-id")
  })

  it("NF-UNIT-315 (fallback): returns opts.jobId when INSERT returns no row", async () => {
    mockTx.mockResolvedValue([])

    const id = await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "triage",
      jobId:      "fallback-job-id",
    })

    expect(id).toBe("fallback-job-id")
  })

  it("NF-UNIT-315 (undefined row): returns opts.jobId when row has no id", async () => {
    mockTx.mockResolvedValue([undefined])

    const id = await dispatchInTransaction(mockTx, {
      ...baseOpts,
      actionType: "triage",
      jobId:      "fallback-undefined-row",
    })

    expect(id).toBe("fallback-undefined-row")
  })
})
