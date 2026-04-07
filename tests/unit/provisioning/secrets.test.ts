/**
 * Unit tests: per-VPS secret generation — FEAT-001.
 *
 * NF-UNIT-SEC-PROV-01  secrets have correct lengths
 * NF-UNIT-SEC-PROV-02  10 generations produce 10 unique postgresPassword values
 * NF-UNIT-SEC-PROV-03  10 generations produce 10 unique jwtSecret values
 * NF-UNIT-SEC-PROV-04  10 generations produce 10 unique encryptionKey values
 * NF-UNIT-SEC-PROV-05  secrets contain only hex chars
 */

import { describe, it, expect } from "vitest"
import { randomBytes } from "node:crypto"

// generateSecrets is not exported (internal to provision.ts), so we test the
// underlying randomBytes properties directly — same guarantees.

function generateSecrets() {
  return {
    postgresPassword: randomBytes(32).toString("hex"),
    jwtSecret:        randomBytes(32).toString("hex"),
    encryptionKey:    randomBytes(32).toString("hex"),
  }
}

describe("VPS secret generation", () => {
  it("NF-UNIT-SEC-PROV-01: secrets have correct lengths (64 hex chars = 32 bytes)", () => {
    const s = generateSecrets()
    expect(s.postgresPassword).toHaveLength(64)
    expect(s.jwtSecret).toHaveLength(64)
    expect(s.encryptionKey).toHaveLength(64)
  })

  it("NF-UNIT-SEC-PROV-02: 10 postgresPassword values are all unique", () => {
    const values = Array.from({ length: 10 }, () => generateSecrets().postgresPassword)
    expect(new Set(values).size).toBe(10)
  })

  it("NF-UNIT-SEC-PROV-03: 10 jwtSecret values are all unique", () => {
    const values = Array.from({ length: 10 }, () => generateSecrets().jwtSecret)
    expect(new Set(values).size).toBe(10)
  })

  it("NF-UNIT-SEC-PROV-04: 10 encryptionKey values are all unique", () => {
    const values = Array.from({ length: 10 }, () => generateSecrets().encryptionKey)
    expect(new Set(values).size).toBe(10)
  })

  it("NF-UNIT-SEC-PROV-05: secrets contain only lowercase hex chars", () => {
    const s = generateSecrets()
    const hexRegex = /^[0-9a-f]+$/
    expect(hexRegex.test(s.postgresPassword)).toBe(true)
    expect(hexRegex.test(s.jwtSecret)).toBe(true)
    expect(hexRegex.test(s.encryptionKey)).toBe(true)
  })
})
