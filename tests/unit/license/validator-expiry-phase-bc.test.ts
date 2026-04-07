/**
 * NF-SEC-02 Phase B — exp/iat as primary expiry source in validateLicense()
 * NF-SEC-02 Phase C — jwt.verify() enforces exp; TokenExpiredError → graceful degradation
 *
 * NF-UNIT-SEC-08  JWT with exp (future) → payload.expiresAt set to exp value, not custom expiresAt
 * NF-UNIT-SEC-09  JWT with exp (past) + expiresAt (future) → expired=true  (exp wins)
 * NF-UNIT-SEC-10  Legacy JWT with no exp → payload.expiresAt falls back to custom expiresAt
 * NF-UNIT-SEC-11  JWT with iat → payload.issuedAt set to iat value, not custom issuedAt
 * NF-UNIT-SEC-12  Legacy JWT with no iat → payload.issuedAt falls back to custom issuedAt
 * NF-UNIT-SEC-13  JWT with exp (past) → expired=true AND valid=true (graceful, not a hard reject)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import jwt from "jsonwebtoken"

const TEST_SECRET = "test-secret-exactly-32-chars-xxxxx"

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn(),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    LICENSE_FILE_PATH: "/tmp/test.license",
    LICENSE_SECRET: "test-secret-exactly-32-chars-xxxxx",
    NODE_ENV: "test",
    NESTFLEET_LICENSE_KEY: undefined,
  },
}))

// Import after mocks are registered
import { validateLicense, _resetLicenseState } from "../../../src/license/validator.js"
import { readFileSync } from "node:fs"

// ── Helpers ────────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000)
const FUTURE = NOW + 7200   // 2 hours from now
const PAST   = NOW - 3600   // 1 hour ago

/** Base custom fields — no standard JWT claims (exp/iat/nbf/jti) */
function baseCustomPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub:         "org-test",
    tier:        "starter",
    productLimit: 3,
    features:    ["case_management"],
    issuedAt:    NOW - 60,   // custom issued-at (1 min ago)
    expiresAt:   FUTURE,     // custom expiry (2h from now)
    customerId:  "cus_test",
    customerName: "Test Corp",
    ...overrides,
  }
}

/**
 * Signs a JWT using HS256 with the test secret.
 * Pass `exp` / `iat` via options.expiresIn / options.noTimestamp to control
 * whether standard claims are included.
 */
function sign(
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(payload, TEST_SECRET, { algorithm: "HS256", ...options })
}

function setToken(token: string) {
  vi.mocked(readFileSync).mockReturnValue(token as unknown as Buffer)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("NF-SEC-02 Phase B — exp/iat as primary source", () => {
  beforeEach(() => { _resetLicenseState() })

  it("NF-UNIT-SEC-08: JWT with exp (future) → payload.expiresAt uses exp, ignores custom expiresAt", () => {
    // custom expiresAt is far future (9999999999), but exp is only 2h from now
    const token = sign(baseCustomPayload({ expiresAt: 9_999_999_999 }), { expiresIn: 7200 })
    setToken(token)

    const state = validateLicense()

    expect(state.valid).toBe(true)
    expect(state.expired).toBe(false)
    // payload.expiresAt should be close to NOW+7200 (exp), NOT 9_999_999_999
    expect(state.payload!.expiresAt).toBeGreaterThan(NOW)
    expect(state.payload!.expiresAt).toBeLessThan(NOW + 7205) // within 5s of sign time
    expect(state.payload!.expiresAt).not.toBe(9_999_999_999)
  })

  it("NF-UNIT-SEC-09: JWT with exp (past) + expiresAt (future) → expired=true (exp wins)", () => {
    // exp is in the past, but custom expiresAt is far future
    const token = sign(baseCustomPayload({ expiresAt: FUTURE }), { expiresIn: -1 })
    setToken(token)

    const state = validateLicense()

    expect(state.expired).toBe(true)
  })

  it("NF-UNIT-SEC-10: legacy JWT with no exp → payload.expiresAt falls back to custom expiresAt", () => {
    // noTimestamp disables iat; no expiresIn → no exp
    const token = sign(baseCustomPayload({ expiresAt: FUTURE }), { noTimestamp: true })
    setToken(token)

    const state = validateLicense()

    expect(state.valid).toBe(true)
    expect(state.expired).toBe(false)
    expect(state.payload!.expiresAt).toBe(FUTURE)
  })

  it("NF-UNIT-SEC-11: JWT with iat → payload.issuedAt uses iat value, not custom issuedAt", () => {
    // custom issuedAt is 0, but jwt.sign adds iat = NOW automatically
    const token = sign(baseCustomPayload({ issuedAt: 0 }))
    setToken(token)

    const state = validateLicense()

    // payload.issuedAt should be close to NOW (iat), NOT 0
    expect(state.payload!.issuedAt).toBeGreaterThan(NOW - 5)
    expect(state.payload!.issuedAt).not.toBe(0)
  })

  it("NF-UNIT-SEC-12: legacy JWT with no iat → payload.issuedAt falls back to custom issuedAt", () => {
    const CUSTOM_ISSUED_AT = NOW - 999
    const token = sign(baseCustomPayload({ issuedAt: CUSTOM_ISSUED_AT }), { noTimestamp: true })
    setToken(token)

    const state = validateLicense()

    expect(state.payload!.issuedAt).toBe(CUSTOM_ISSUED_AT)
  })
})

describe("NF-SEC-02 Phase C — jwt.verify() enforces exp with graceful degradation", () => {
  beforeEach(() => { _resetLicenseState() })

  it("NF-UNIT-SEC-13: JWT with exp (past) → expired=true AND valid=true (graceful, not hard reject)", () => {
    // Phase C: jwt.verify() throws TokenExpiredError for this token.
    // The handler must catch it and return graceful degradation (valid=true, expired=true)
    // rather than the hard-reject path (valid=false) used for bad signatures.
    const token = sign(baseCustomPayload(), { expiresIn: -1 })
    setToken(token)

    const state = validateLicense()

    expect(state.expired).toBe(true)
    expect(state.valid).toBe(true)    // graceful — local features continue
    expect(state.payload).not.toBeNull()
  })
})
