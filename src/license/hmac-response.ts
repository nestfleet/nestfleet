/**
 * SEC-M4 — HMAC-SHA256 signing and verification for signed cloud responses.
 *
 * The cloud signs the JSON response body; NestFleet verifies the signature
 * before trusting the payload. This closes the MITM response-injection vector.
 *
 * Canonical form: JSON.stringify(payload, sortedKeys) — key order is sorted
 * alphabetically and the `signature` field is excluded before hashing.
 *
 * Algorithm: HMAC-SHA256, base64url encoding.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export interface SignedValidateResponse extends Record<string, unknown> {
  signature: string
}

/**
 * Canonicalise a response payload for HMAC computation.
 * Sorts keys alphabetically and excludes the `signature` field.
 * PC-SEC-39: explicit sorted-object approach — correct for nested objects.
 */
function canonical(payload: Record<string, unknown>): string {
  const { signature: _sig, ...rest } = payload
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(rest).sort()) {
    sorted[key] = rest[key]
  }
  return JSON.stringify(sorted)
}

/**
 * Signs a validate response payload.
 * Returns a new object with the `signature` field appended.
 */
export function signValidateResponse(
  payload: Record<string, unknown>,
  secret: string,
): SignedValidateResponse {
  const sig = createHmac("sha256", secret)
    .update(canonical(payload))
    .digest("base64url")
  return { ...payload, signature: sig }
}

/**
 * Verifies a signed validate response.
 * Returns the payload without the `signature` field if valid.
 * Throws if the signature is absent or does not match.
 */
export function verifyValidateResponse(
  data: SignedValidateResponse,
  secret: string,
): Omit<SignedValidateResponse, "signature"> {
  const { signature, ...rest } = data

  if (typeof signature !== "string" || signature.length === 0) {
    throw new Error("SEC-M4: validate response signature missing")
  }

  const expected = createHmac("sha256", secret)
    .update(canonical(data))
    .digest("base64url")

  const sigBuf      = Buffer.from(signature, "base64url")
  const expectedBuf = Buffer.from(expected,  "base64url")

  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error("SEC-M4: validate response signature verification failed — possible MITM")
  }

  return rest
}
