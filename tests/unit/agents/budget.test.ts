/**
 * Unit tests: TokenBudgetError + dispatcher budget enforcement — AE-13.
 *
 * NF-UNIT-34: TokenBudgetError is an instance of AppError with correct statusCode/code.
 * NF-UNIT-35: TokenBudgetError constructor stores all params.
 * NF-UNIT-36: dispatch() throws TokenBudgetError when checkBudget returns hardLimitExceeded.
 *
 * All DB calls and pg-boss are mocked — no real DB needed.
 */

import { vi } from "vitest"

// Mock pg-boss so getBoss() never tries to connect
vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn().mockResolvedValue({
    createQueue: vi.fn().mockResolvedValue(undefined),
    send:        vi.fn().mockResolvedValue("pg-boss-job-id"),
  }),
}))

// Mock checkBudget — we control its return value per test
vi.mock("../../../src/agents/budget.js", () => ({
  checkBudget: vi.fn(),
}))

import { describe, it, expect, beforeEach } from "vitest"
import { AppError, TokenBudgetError } from "../../../src/shared/errors.js"
import { checkBudget } from "../../../src/agents/budget.js"
import { dispatch } from "../../../src/agents/dispatcher.js"
import type { BudgetStatus } from "../../../src/agents/budget.js"

// ── Typed mock helper ─────────────────────────────────────────────────────────

const mockCheckBudget = vi.mocked(checkBudget)

// ── Shared budget status factories ────────────────────────────────────────────

function withinBudget(): BudgetStatus {
  return {
    hardLimitExceeded: false,
    softLimitExceeded: false,
    currentTokens:     100,
    softLimit:         300_000,
    hardLimit:         1_000_000,
    monthYear:         "2025-01",
  }
}

function hardLimitExceeded(): BudgetStatus {
  return {
    hardLimitExceeded: true,
    softLimitExceeded: true,
    currentTokens:     1_000_001,
    softLimit:         300_000,
    hardLimit:         1_000_000,
    monthYear:         "2025-01",
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("TokenBudgetError (NF-UNIT-34, NF-UNIT-35)", () => {
  // NF-UNIT-34 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-34: TokenBudgetError is an instance of AppError with statusCode=429 and code=TOKEN_BUDGET_EXCEEDED", () => {
    const err = new TokenBudgetError(
      "Budget exceeded",
      "prod_001",
      "triage",
      1_000_001,
      1_000_000,
    )

    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(TokenBudgetError)
    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe("TOKEN_BUDGET_EXCEEDED")
  })

  // NF-UNIT-35 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-35: TokenBudgetError constructor stores productId, actionType, currentTokens, hardLimit", () => {
    const err = new TokenBudgetError(
      "Monthly limit hit",
      "prod_42",
      "auto_reply",
      2_000_001,
      2_000_000,
    )

    expect(err.message).toBe("Monthly limit hit")
    expect(err.productId).toBe("prod_42")
    expect(err.actionType).toBe("auto_reply")
    expect(err.currentTokens).toBe(2_000_001)
    expect(err.hardLimit).toBe(2_000_000)
  })
})

describe("dispatch() budget enforcement (NF-UNIT-36)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // NF-UNIT-36 ─────────────────────────────────────────────────────────────────

  it("NF-UNIT-36: dispatch() throws TokenBudgetError when checkBudget returns hardLimitExceeded=true", async () => {
    mockCheckBudget.mockResolvedValueOnce(hardLimitExceeded())

    await expect(
      dispatch({
        actionType: "triage",
        productId:  "prod_001",
        caseId:     "case_001",
        jobId:      "job_abc",
      }),
    ).rejects.toThrow(TokenBudgetError)
  })

  it("NF-UNIT-36 (variant): thrown TokenBudgetError carries correct product and action metadata", async () => {
    mockCheckBudget.mockResolvedValueOnce(hardLimitExceeded())

    let caught: unknown
    try {
      await dispatch({
        actionType: "triage",
        productId:  "prod_budget_test",
        caseId:     "case_001",
        jobId:      "job_abc",
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TokenBudgetError)
    const budgetErr = caught as TokenBudgetError
    expect(budgetErr.statusCode).toBe(429)
    expect(budgetErr.code).toBe("TOKEN_BUDGET_EXCEEDED")
    expect(budgetErr.productId).toBe("prod_budget_test")
    expect(budgetErr.actionType).toBe("triage")
    expect(budgetErr.hardLimit).toBe(1_000_000)
  })

  it("NF-UNIT-36 (within budget): dispatch() does NOT throw when budget is within limits", async () => {
    mockCheckBudget.mockResolvedValueOnce(withinBudget())

    await expect(
      dispatch({
        actionType: "triage",
        productId:  "prod_001",
        caseId:     "case_001",
        jobId:      "job_abc",
      }),
    ).resolves.toBeDefined()
  })
})
