/**
 * Unit tests: SEC-M4 — Cloud refresh HMAC response signing and verification.
 *
 * NF-UNIT-450: signValidateResponse returns object with signature field appended
 * NF-UNIT-451: signature is a non-empty base64url string
 * NF-UNIT-452: verifyValidateResponse returns payload without signature when valid
 * NF-UNIT-453: verifyValidateResponse throws when signature is missing
 * NF-UNIT-454: verifyValidateResponse throws when signature is tampered
 * NF-UNIT-455: verifyValidateResponse throws when payload field is mutated after signing
 * NF-UNIT-456: signing is deterministic (same inputs → same signature)
 * NF-UNIT-457: different secrets produce different signatures
 * NF-UNIT-458: verifyValidateResponse ignores unknown extra fields in canonical computation
 * NF-UNIT-459: signValidateResponse works with minimal valid=false payload
 */

import { describe, it, expect } from "vitest"
import { signValidateResponse, verifyValidateResponse } from "../../../src/license/hmac-response.js"

const SECRET = "test-secret-32-chars-exactly!!!!"

const BASE_PAYLOAD = {
  valid:   true,
  plan:    "growth",
  expires_at: "2027-01-01T00:00:00.000Z",
  features: ["auto_reply", "chat_widget"],
  max_outcome_units_monthly: 50000,
  cancel_at: null,
}

// NF-UNIT-450
describe("signValidateResponse", () => {
  it("NF-UNIT-450: appends signature field to the response object", () => {
    const signed = signValidateResponse(BASE_PAYLOAD, SECRET)
    expect(signed).toHaveProperty("signature")
  })

  // NF-UNIT-451
  it("NF-UNIT-451: signature is a non-empty base64url string", () => {
    const { signature } = signValidateResponse(BASE_PAYLOAD, SECRET)
    expect(typeof signature).toBe("string")
    expect(signature.length).toBeGreaterThan(0)
    // base64url: only [A-Za-z0-9_-]
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  // NF-UNIT-456
  it("NF-UNIT-456: signing is deterministic", () => {
    const a = signValidateResponse(BASE_PAYLOAD, SECRET)
    const b = signValidateResponse(BASE_PAYLOAD, SECRET)
    expect(a.signature).toBe(b.signature)
  })

  // NF-UNIT-457
  it("NF-UNIT-457: different secrets produce different signatures", () => {
    const a = signValidateResponse(BASE_PAYLOAD, SECRET)
    const b = signValidateResponse(BASE_PAYLOAD, "different-secret-32-chars!!!!!!!")
    expect(a.signature).not.toBe(b.signature)
  })

  // NF-UNIT-459
  it("NF-UNIT-459: works with minimal valid=false payload", () => {
    const signed = signValidateResponse({ valid: false, reason: "license_expired" }, SECRET)
    expect(signed).toHaveProperty("signature")
    expect(signed.valid).toBe(false)
  })
})

// NF-UNIT-452..455, NF-UNIT-458
describe("verifyValidateResponse", () => {
  it("NF-UNIT-452: returns payload without signature when valid", () => {
    const signed = signValidateResponse(BASE_PAYLOAD, SECRET)
    const result = verifyValidateResponse(signed, SECRET)
    expect(result).not.toHaveProperty("signature")
    expect(result.valid).toBe(BASE_PAYLOAD.valid)
    expect(result.plan).toBe(BASE_PAYLOAD.plan)
  })

  it("NF-UNIT-453: throws when signature field is absent", () => {
    expect(() =>
      verifyValidateResponse(BASE_PAYLOAD as never, SECRET),
    ).toThrow("missing")
  })

  it("NF-UNIT-454: throws when signature is tampered", () => {
    const signed = signValidateResponse(BASE_PAYLOAD, SECRET)
    expect(() =>
      verifyValidateResponse({ ...signed, signature: "tampered_sig" }, SECRET),
    ).toThrow("signature")
  })

  it("NF-UNIT-455: throws when payload field is mutated after signing", () => {
    const signed = signValidateResponse(BASE_PAYLOAD, SECRET)
    expect(() =>
      verifyValidateResponse({ ...signed, plan: "scale" }, SECRET),
    ).toThrow("signature")
  })

  it("NF-UNIT-458: verification is key-order-independent in input", () => {
    // Canonical JSON sorts keys — input key order should not affect result
    const signed = signValidateResponse(BASE_PAYLOAD, SECRET)
    // Reconstruct with different field ordering
    const reordered = {
      features: signed.features,
      valid:    signed.valid,
      plan:     signed.plan,
      signature: signed.signature,
      expires_at: signed.expires_at,
      max_outcome_units_monthly: signed.max_outcome_units_monthly,
      cancel_at: signed.cancel_at,
    }
    expect(() => verifyValidateResponse(reordered, SECRET)).not.toThrow()
  })
})
