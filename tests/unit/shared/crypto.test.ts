/**
 * Unit tests: shared/crypto
 *
 * C1-T01  throws in production when SECRET_ENCRYPTION_KEY and ENCRYPTION_KEY both unset
 * C1-T02  throws when key is present but not 64 hex chars
 * C1-T03  round-trips plaintext correctly when key is valid 64-char hex
 * C1-T04  decryptSecret throws when key absent and value is encrypted (enc: prefix)
 * C1-T05  accepts SECRET_ENCRYPTION_KEY (primary name)
 * C1-T06  emits deprecation warn when only legacy ENCRYPTION_KEY is set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const VALID_KEY = "a".repeat(64)  // 64 hex chars = 32 bytes

// crypto.ts reads process.env directly in resolveKey(), so we must reset
// the module between tests that need different env state.
async function freshCrypto() {
  vi.resetModules()
  return import("../../../src/shared/crypto.js")
}

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // ── Key resolution ──────────────────────────────────────────────────────────

  it("C1-T01: encryptSecret throws in production when both env vars are unset", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "")
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { encryptSecret } = await freshCrypto()
    expect(() => encryptSecret("my-secret")).toThrow(/SECRET_ENCRYPTION_KEY must be set/i)
  })

  it("C1-T02: resolveKey throws when key is set but not 64 hex chars", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "tooshort")
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { encryptSecret } = await freshCrypto()
    expect(() => encryptSecret("my-secret")).toThrow(/64/)
  })

  it("C1-T03: encrypts and decrypts round-trip correctly", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", VALID_KEY)
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { encryptSecret, decryptSecret } = await freshCrypto()
    const plaintext = "super-secret-api-key"
    const encrypted = encryptSecret(plaintext)
    expect(encrypted).toMatch(/^enc:/)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it("C1-T04: decryptSecret throws when key absent and value has enc: prefix", async () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "")
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { decryptSecret } = await freshCrypto()
    expect(() => decryptSecret("enc:aabbcc:ddeeff:001122")).toThrow(/SECRET_ENCRYPTION_KEY/i)
  })

  it("C1-T05: accepts SECRET_ENCRYPTION_KEY as primary name", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", VALID_KEY)
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { encryptSecret, decryptSecret } = await freshCrypto()
    const result = decryptSecret(encryptSecret("hello"))
    expect(result).toBe("hello")
  })

  it("C1-T06: emits deprecation warn when only legacy ENCRYPTION_KEY is set", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "")
    vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { encryptSecret } = await freshCrypto()
    encryptSecret("value")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ENCRYPTION_KEY"))
    warnSpy.mockRestore()
  })

  // ── Pass-through (no key set, non-production) ───────────────────────────────

  it("C1-T07: encryptSecret throws (not silently passes) when key absent in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "")
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { encryptSecret } = await freshCrypto()
    // After C1 fix: no more silent pass-through — always throws when key absent
    expect(() => encryptSecret("value")).toThrow(/SECRET_ENCRYPTION_KEY/i)
  })

  // ── decryptSecret pass-through for legacy plaintext values ─────────────────

  it("C1-T08: decryptSecret returns plaintext values unchanged (no enc: prefix)", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", VALID_KEY)
    vi.stubEnv("ENCRYPTION_KEY", "")
    const { decryptSecret } = await freshCrypto()
    expect(decryptSecret("plain-value-no-prefix")).toBe("plain-value-no-prefix")
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret(undefined)).toBeUndefined()
  })
})
