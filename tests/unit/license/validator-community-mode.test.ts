/**
 * NF-PIVOT Phase 1: Community-mode and process.exit removal tests.
 *
 * These tests FAIL against the current codebase and PASS after Phase 1 implementation.
 *
 * NF-PIV-01  validateLicense() never calls process.exit(1) — even in production
 * NF-PIV-02  No LICENSE_FILE_PATH → community mode, valid:false, no crash
 * NF-PIV-03  isFeatureEnabled() returns true for any feature when no license configured
 * NF-PIV-04  isFeatureEnabled() returns true when license is invalid (graceful degradation)
 *
 * Note: NF-PIV-05 (config.BILLING_ENABLED) lives in tests/unit/config-billing.test.ts
 *
 * Uses vi.doMock (not vi.mock) to avoid hoisting issues with per-test config overrides.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const LOGGER_MOCK = {
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}

// ── NF-PIV-01: process.exit is never called by validateLicense() ─────────────
// Currently FAILS: current code calls process.exit(1) when NODE_ENV=production
// and LICENSE_FILE_PATH is set but LICENSE_SECRET is missing.
describe("NF-PIV-01: validateLicense() never calls process.exit", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("../../../src/shared/logger.js", () => LOGGER_MOCK)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock("../../../src/shared/config.js")
    vi.doUnmock("../../../src/shared/logger.js")
  })

  it("NF-PIV-01a: no process.exit when LICENSE_SECRET is missing in production", async () => {
    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: "/some/license.jwt",
        LICENSE_SECRET:    undefined,
        NODE_ENV:          "production",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error("process.exit was called — NF-PIV-01a FAIL")
    })

    const { validateLicense } = await import("../../../src/license/validator.js")

    // Should NOT throw (process.exit must NOT be called)
    expect(() => validateLicense()).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("NF-PIV-01b: no process.exit when license file not found in production", async () => {
    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: "/nonexistent/path/license.jwt",
        LICENSE_SECRET:    "a-secret-value-that-is-long-enough-for-validation",
        NODE_ENV:          "production",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error("process.exit was called — NF-PIV-01b FAIL")
    })

    const { validateLicense } = await import("../../../src/license/validator.js")

    expect(() => validateLicense()).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("NF-PIV-01c: no process.exit when JWT verification fails in production", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-piv-test-"))
    const licensePath = join(dir, "license.jwt")
    writeFileSync(licensePath, "not.a.valid.jwt")

    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: licensePath,
        LICENSE_SECRET:    "a-secret-value-that-is-long-enough-for-validation",
        NODE_ENV:          "production",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error("process.exit was called — NF-PIV-01c FAIL")
    })

    const { validateLicense } = await import("../../../src/license/validator.js")

    expect(() => validateLicense()).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})

// ── NF-PIV-02: No license → community mode ───────────────────────────────────
// Currently PASSES (no exit for missing LICENSE_FILE_PATH). Locked in as contract.
describe("NF-PIV-02: no LICENSE_FILE_PATH returns community dev mode without crash", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("../../../src/shared/logger.js", () => LOGGER_MOCK)
    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: undefined,
        LICENSE_SECRET:    undefined,
        NODE_ENV:          "development",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))
  })

  afterEach(() => {
    vi.doUnmock("../../../src/shared/config.js")
    vi.doUnmock("../../../src/shared/logger.js")
  })

  it("NF-PIV-02: returns valid:false, expired:false, payload:null with a status message", async () => {
    const { validateLicense } = await import("../../../src/license/validator.js")
    const state = validateLicense()

    expect(state.valid).toBe(false)
    expect(state.expired).toBe(false)
    expect(state.payload).toBeNull()
    expect(typeof state.statusMessage).toBe("string")
    expect(state.statusMessage.length).toBeGreaterThan(0)
  })
})

// ── NF-PIV-03: isFeatureEnabled returns true with no license ─────────────────
// Currently PASSES (guard already returns true for null payload). Contract lock-in.
describe("NF-PIV-03: isFeatureEnabled returns true for any feature when no license", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("../../../src/shared/logger.js", () => LOGGER_MOCK)
    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: undefined,
        LICENSE_SECRET:    undefined,
        NODE_ENV:          "development",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))
  })

  afterEach(() => {
    vi.doUnmock("../../../src/shared/config.js")
    vi.doUnmock("../../../src/shared/logger.js")
  })

  it("NF-PIV-03: returns true for all features in community/dev mode", async () => {
    const { validateLicense, isFeatureEnabled } = await import("../../../src/license/validator.js")
    validateLicense() // warm cache

    expect(isFeatureEnabled("case_management")).toBe(true)
    expect(isFeatureEnabled("auto_reply")).toBe(true)
    expect(isFeatureEnabled("change_prep")).toBe(true)
    expect(isFeatureEnabled("any_future_feature")).toBe(true)
  })
})

// ── NF-PIV-04: isFeatureEnabled returns true when license is invalid ──────────
// Currently FAILS: current code calls process.exit(1) before reaching isFeatureEnabled.
// After Phase 1: no exit → isFeatureEnabled gets to run → returns true.
describe("NF-PIV-04: isFeatureEnabled returns true when license failed to validate", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.doMock("../../../src/shared/logger.js", () => LOGGER_MOCK)

    // Intercept process.exit so the test doesn't actually exit the process
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      // Don't throw — just swallow to let assertions run
      return undefined as never
    })
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.doUnmock("../../../src/shared/config.js")
    vi.doUnmock("../../../src/shared/logger.js")
  })

  it("NF-PIV-04: returns true for any feature after JWT verification failure", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-piv04-"))
    const licensePath = join(dir, "license.jwt")
    writeFileSync(licensePath, "invalid.jwt.content")

    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        LICENSE_FILE_PATH: licensePath,
        LICENSE_SECRET:    "a-secret-value-that-is-long-enough-for-validation",
        NODE_ENV:          "production",
        NESTFLEET_LICENSE_KEY: undefined,
      },
    }))

    const { validateLicense, isFeatureEnabled } = await import("../../../src/license/validator.js")
    validateLicense() // triggers the bad-JWT path

    // After Phase 1: no process.exit called, state is gracefully invalid
    // isFeatureEnabled should return true (community unlimited = graceful degradation)
    expect(exitSpy).not.toHaveBeenCalled()
    expect(isFeatureEnabled("case_management")).toBe(true)
  })
})
