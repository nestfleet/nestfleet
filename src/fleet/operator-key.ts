// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Fleet Operator Key — FEAT-018-A.
 *
 * Verifies the NESTFLEET_OPERATOR_KEY JWT (EdDSA/Ed25519) issued by NestFleet.
 * The public key is hardcoded here; the matching private key is held by NestFleet.
 *
 * Operators receive a signed JWT from NestFleet and configure it via the
 * NESTFLEET_OPERATOR_KEY environment variable.  At startup (src/index.ts),
 * verifyOperatorKey() is called and any fleet routes/workers are only
 * registered when isFleetOperatorAuthorized() returns true.
 *
 * Key generation:  scripts/generate-operator-keypair.ts  (NestFleet-internal)
 */

import { jwtVerify, importSPKI } from "jose"

// ── Hardcoded NestFleet operator public key (Ed25519 SPKI PEM) ────────────────
// Generated 2026-04-10 via scripts/generate-operator-keypair.ts.
// To rotate: generate a new keypair, update this constant, re-issue all operator
// JWTs with the new private key, and redeploy.

const NESTFLEET_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOGURoccBTKnJksBSFSZGIoHyp1kkC9MGmHLPQhd1dHM=
-----END PUBLIC KEY-----`

// ── Module state ──────────────────────────────────────────────────────────────

let _authorized = false
let _publicKeyPem = NESTFLEET_PUBLIC_KEY_PEM

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify an operator JWT against the hardcoded NestFleet public key.
 *
 * Throws if the token is invalid (bad signature, expired, wrong issuer/sub).
 * Sets the internal authorized flag on success.
 */
export async function verifyOperatorKey(token: string): Promise<void> {
  const publicKey = await importSPKI(_publicKeyPem, "EdDSA")

  const { payload } = await jwtVerify(token, publicKey, {
    issuer:     "nestfleet.dev",
    algorithms: ["EdDSA"],
  })

  if (payload["sub"] !== "nestfleet-operator") {
    throw new Error(`Invalid operator key: unexpected sub "${String(payload["sub"])}"`)
  }

  _authorized = true
}

/**
 * Returns true only after a successful verifyOperatorKey() call.
 * Startup gate in src/index.ts uses this to conditionally mount fleet routes.
 */
export function isFleetOperatorAuthorized(): boolean {
  return _authorized
}

// ── Test helpers (not for production use) ────────────────────────────────────

/** Reset cached state — for testing only. */
export function _resetOperatorState(): void {
  _authorized   = false
  _publicKeyPem = NESTFLEET_PUBLIC_KEY_PEM
}

/** Override the public key PEM — for testing only. */
export function _setPublicKeyForTest(pem: string): void {
  _publicKeyPem = pem
  _authorized   = false
}
