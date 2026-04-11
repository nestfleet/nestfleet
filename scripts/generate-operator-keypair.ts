/**
 * Generate a NestFleet fleet operator keypair (Ed25519) and issue a signed
 * operator JWT.
 *
 * INTERNAL TOOL — run this once to rotate or issue new operator keys.
 * The private key is used to sign operator JWTs. Keep it secret.
 * The public key must match NESTFLEET_PUBLIC_KEY_PEM in src/fleet/operator-key.ts.
 *
 * Usage:
 *   npx tsx scripts/generate-operator-keypair.ts
 *
 * Output:
 *   - PUBLIC KEY PEM  → paste into src/fleet/operator-key.ts
 *   - PRIVATE KEY PEM → store in a secrets manager (never commit)
 *   - OPERATOR JWT    → set as NESTFLEET_OPERATOR_KEY in docker-compose.prod.yml
 */

import { generateKeyPair, exportSPKI, exportPKCS8, SignJWT } from "jose"

const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
  crv: "Ed25519",
  extractable: true,
})

const publicKeyPem  = await exportSPKI(publicKey)
const privateKeyPem = await exportPKCS8(privateKey)

// Issue a 10-year operator JWT — reissue when rotating keys
const operatorJwt = await new SignJWT({ sub: "nestfleet-operator" })
  .setProtectedHeader({ alg: "EdDSA" })
  .setIssuer("nestfleet.dev")
  .setIssuedAt()
  .setExpirationTime("3650d")
  .sign(privateKey)

console.log("=".repeat(72))
console.log("1) PUBLIC KEY — hardcode in src/fleet/operator-key.ts")
console.log("=".repeat(72))
console.log(publicKeyPem)

console.log("=".repeat(72))
console.log("2) PRIVATE KEY — store in secrets manager, NEVER commit")
console.log("=".repeat(72))
console.log(privateKeyPem)

console.log("=".repeat(72))
console.log("3) OPERATOR JWT — set as NESTFLEET_OPERATOR_KEY env var")
console.log("=".repeat(72))
console.log(operatorJwt)
console.log()
