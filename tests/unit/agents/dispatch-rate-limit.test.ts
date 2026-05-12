// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * NF-UNIT-DRL-01..05 — Per-user dispatch rate limit (SEC-JQ1)
 *
 * Covers:
 *   dispatcher.dispatch() — 10 calls/user/actionType/60s limit
 *   Tested via the exported dispatchAttempts map and a full dispatch() call
 *   with all infrastructure mocked (no DB, no pg-boss).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Config mock (must precede any module that imports config) ──────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:            "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL:          "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:          "anthropic",
    LLM_API_KEY:           "sk-ant-test",
    NODE_ENV:              "test",
    PORT:                  3001,
    BCRYPT_ROUNDS:         12,
    REGISTRATION_ENABLED:  false,
    BILLING_ENABLED:       false,
    PROVISIONING_ENABLED:  false,
  },
}))

// ── Infrastructure mocks ───────────────────────────────────────────────────────

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

const mockBossSend = vi.fn().mockResolvedValue("pg-boss-id")

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss:  vi.fn().mockResolvedValue({
    send:        mockBossSend,
    createQueue: vi.fn().mockResolvedValue(undefined),
  }),
  initBoss: vi.fn(),
}))

vi.mock("../../../src/infra/db/client.js", () => ({
  db: {}, setDb: vi.fn(), closeDb: vi.fn(), pingDb: vi.fn().mockResolvedValue(true),
}))

// ── Agent infra mocks ──────────────────────────────────────────────────────────

vi.mock("../../../src/agents/budget.js", () => ({
  checkBudget: vi.fn().mockResolvedValue({ hardLimitExceeded: false, softLimitExceeded: false }),
}))

vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue("growth"),
}))

vi.mock("../../../src/rbac/permission-engine.js", () => ({
  licenseToProductTier: vi.fn().mockReturnValue("growth"),
  meetsMinTier: vi.fn().mockReturnValue(true),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOpts(userId?: string, actionType = "triage" as const) {
  return {
    actionType,
    productId: "prod_test",
    caseId:    "case_test",
    jobId:     `job_${Math.random().toString(36).slice(2)}`,
    userId,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Per-user dispatch rate limit (SEC-JQ1)", () => {
  let dispatch:        (opts: ReturnType<typeof makeOpts>) => Promise<string>
  let dispatchAttempts: Map<string, number[]>

  beforeEach(async () => {
    vi.resetModules()

    // Re-mock after resetModules so the fresh dispatcher module picks them up
    vi.mock("../../../src/shared/config.js", () => ({
      config: {
        JWT_SECRET:            "test-secret-32-chars-minimum-ok!",
        SECRET_ENCRYPTION_KEY: "a".repeat(64),
        DATABASE_URL:          "postgres://localhost/nestfleet_test",
        LLM_PROVIDER:          "anthropic",
        LLM_API_KEY:           "sk-ant-test",
        NODE_ENV:              "test",
        PORT:                  3001,
        BCRYPT_ROUNDS:         12,
        REGISTRATION_ENABLED:  false,
        BILLING_ENABLED:       false,
        PROVISIONING_ENABLED:  false,
      },
    }))
    vi.mock("../../../src/infra/queue/boss.js", () => ({
      getBoss:  vi.fn().mockResolvedValue({
        send:        vi.fn().mockResolvedValue("pg-boss-id"),
        createQueue: vi.fn().mockResolvedValue(undefined),
      }),
      initBoss: vi.fn(),
    }))
    vi.mock("../../../src/agents/budget.js", () => ({
      checkBudget: vi.fn().mockResolvedValue({ hardLimitExceeded: false, softLimitExceeded: false }),
    }))
    vi.mock("../../../src/license/validator.js", () => ({
      getLicenseTier: vi.fn().mockReturnValue("growth"),
    }))
    vi.mock("../../../src/rbac/permission-engine.js", () => ({
      licenseToProductTier: vi.fn().mockReturnValue("growth"),
      meetsMinTier: vi.fn().mockReturnValue(true),
    }))
    vi.mock("../../../src/shared/logger.js", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
    }))

    const mod = await import("../../../src/agents/dispatcher.js")
    dispatch         = mod.dispatch as typeof dispatch
    dispatchAttempts = mod.dispatchAttempts
    dispatchAttempts.clear()
  })

  // NF-UNIT-DRL-01: 10 dispatches succeed, 11th throws
  it("NF-UNIT-DRL-01: 10 dispatches succeed; 11th throws rate-limit error", async () => {
    const userId = "user_test_001"

    for (let i = 0; i < 10; i++) {
      await expect(dispatch(makeOpts(userId))).resolves.toBeDefined()
    }

    await expect(dispatch(makeOpts(userId))).rejects.toThrow(/Dispatch rate limit exceeded/)
  })

  // NF-UNIT-DRL-02: quota is per actionType — different action types don't share budget
  it("NF-UNIT-DRL-02: different actionType for same user has independent quota", async () => {
    const userId = "user_test_002"

    // Exhaust triage quota
    for (let i = 0; i < 10; i++) {
      await dispatch(makeOpts(userId, "triage"))
    }
    await expect(dispatch(makeOpts(userId, "triage"))).rejects.toThrow(/rate limit/)

    // auto_reply quota is untouched
    await expect(dispatch(makeOpts(userId, "auto_reply"))).resolves.toBeDefined()
  })

  // NF-UNIT-DRL-03: quota is per user — different users don't share budget
  it("NF-UNIT-DRL-03: different userId for same actionType has independent quota", async () => {
    // Exhaust user A
    for (let i = 0; i < 10; i++) {
      await dispatch(makeOpts("user_A"))
    }
    await expect(dispatch(makeOpts("user_A"))).rejects.toThrow(/rate limit/)

    // user B is unaffected
    await expect(dispatch(makeOpts("user_B"))).resolves.toBeDefined()
  })

  // NF-UNIT-DRL-04: timestamps older than the window don't count against the quota
  it("NF-UNIT-DRL-04: expired timestamps are evicted; slot reopens after window", async () => {
    const userId = "user_test_004"
    const key    = `${userId}:triage`

    // Pre-populate 10 timestamps that are already outside the 60s window
    const expired = Date.now() - 61_000
    dispatchAttempts.set(key, Array.from({ length: 10 }, () => expired))

    // 11th call should succeed because all prior timestamps are expired
    await expect(dispatch(makeOpts(userId))).resolves.toBeDefined()
  })

  // NF-UNIT-DRL-05: no userId → no rate limit applied (system/internal dispatch compat)
  it("NF-UNIT-DRL-05: omitting userId bypasses rate limit entirely", async () => {
    // 20 dispatches with no userId — all succeed
    for (let i = 0; i < 20; i++) {
      await expect(dispatch(makeOpts(undefined))).resolves.toBeDefined()
    }
    // Map should remain empty — no entries written for system dispatches
    expect(dispatchAttempts.size).toBe(0)
  })
})
