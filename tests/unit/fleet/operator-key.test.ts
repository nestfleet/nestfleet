/**
 * Unit tests: FEAT-018-A — Fleet Operator Key verification
 *
 * NF-UNIT-OPK-01  Valid JWT signed by matching Ed25519 private key → authorized
 * NF-UNIT-OPK-02  JWT with invalid signature (different key) → rejected, not authorized
 * NF-UNIT-OPK-03  Expired JWT → rejected, not authorized
 * NF-UNIT-OPK-04  JWT with wrong issuer → rejected, not authorized
 * NF-UNIT-OPK-05  JWT with wrong sub → rejected, not authorized
 * NF-UNIT-OPK-06  isFleetOperatorAuthorized() returns false before any verification call
 * NF-UNIT-OPK-07  isFleetOperatorAuthorized() returns true after successful verification
 * NF-UNIT-OPK-08  State resets correctly between tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SignJWT, generateKeyPair, exportSPKI, exportPKCS8 } from "jose"
import {
  verifyOperatorKey,
  isFleetOperatorAuthorized,
  _resetOperatorState,
  _setPublicKeyForTest,
} from "../../../src/fleet/operator-key.js"

// ── Test keypair (generated once for the suite) ────────────────────────────

let testPrivKey: CryptoKey
let testPubKeyPem: string
let altPrivKey: CryptoKey   // a second key — used to forge invalid signatures

async function makeToken(
  opts: { issuer?: string; sub?: string; expiresIn?: string; key?: CryptoKey } = {},
): Promise<string> {
  const key       = opts.key       ?? testPrivKey
  const issuer    = opts.issuer    ?? "nestfleet.dev"
  const sub       = opts.sub       ?? "nestfleet-operator"
  const expiresIn = opts.expiresIn ?? "1y"

  return new SignJWT({ sub })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(issuer)
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(key)
}

// Generate keypairs once before all tests
const keygenPromise = (async () => {
  const kp1 = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })
  testPrivKey  = kp1.privateKey
  testPubKeyPem = await exportSPKI(kp1.publicKey)

  const kp2 = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })
  altPrivKey = kp2.privateKey
})()

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("operator-key", () => {

  beforeEach(async () => {
    await keygenPromise
    _resetOperatorState()
    _setPublicKeyForTest(testPubKeyPem)
  })

  // NF-UNIT-OPK-06
  it("NF-UNIT-OPK-06: isFleetOperatorAuthorized() is false before verification", () => {
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

  // NF-UNIT-OPK-01 + NF-UNIT-OPK-07
  it("NF-UNIT-OPK-01/07: valid JWT authorizes fleet operations", async () => {
    const token = await makeToken()
    await verifyOperatorKey(token)
    expect(isFleetOperatorAuthorized()).toBe(true)
  })

  // NF-UNIT-OPK-02
  it("NF-UNIT-OPK-02: JWT signed by different key is rejected", async () => {
    const token = await makeToken({ key: altPrivKey })
    await expect(verifyOperatorKey(token)).rejects.toThrow()
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

  // NF-UNIT-OPK-03
  it("NF-UNIT-OPK-03: expired JWT is rejected", async () => {
    const token = await makeToken({ expiresIn: "-1s" })
    await expect(verifyOperatorKey(token)).rejects.toThrow()
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

  // NF-UNIT-OPK-04
  it("NF-UNIT-OPK-04: JWT with wrong issuer is rejected", async () => {
    const token = await makeToken({ issuer: "evil.example.com" })
    await expect(verifyOperatorKey(token)).rejects.toThrow()
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

  // NF-UNIT-OPK-05
  it("NF-UNIT-OPK-05: JWT with wrong sub is rejected", async () => {
    const token = await makeToken({ sub: "some-other-subject" })
    await expect(verifyOperatorKey(token)).rejects.toThrow()
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

  // NF-UNIT-OPK-08
  it("NF-UNIT-OPK-08: state resets between tests — fresh start", () => {
    // verifyOperatorKey was NOT called in this test's setup
    expect(isFleetOperatorAuthorized()).toBe(false)
  })

})
