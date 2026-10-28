/**
 * Unit tests: scripts/audit-gate.mjs — CI security gate with time-boxed
 * advisory allowlist (OPS-M-09).
 *
 * NF-UNIT-500 through NF-UNIT-505
 */

import { describe, it, expect } from "vitest"
import { evaluate } from "../../../scripts/audit-gate.mjs"

const advisory = (ghsa: string, severity: string, name = "zod") => ({
  name, severity, title: `${name} advisory`, url: `https://github.com/advisories/${ghsa}`,
})

const report = (...via: unknown[]) => ({ vulnerabilities: { pkg: { via } } })

describe("audit-gate evaluate()", () => {
  const allowlist = { "GHSA-aaaa": { expires: "2026-12-31" } }

  it("NF-UNIT-500: allowlisted high advisory before expiry → passes", () => {
    const r = evaluate(report(advisory("GHSA-aaaa", "high")), allowlist, "2026-10-28")
    expect(r.failures).toEqual([])
    expect(r.allowed).toHaveLength(1)
  })

  it("NF-UNIT-501: allowlisted advisory after expiry → fails", () => {
    const r = evaluate(report(advisory("GHSA-aaaa", "high")), allowlist, "2027-01-01")
    expect(r.failures[0]).toMatch(/EXPIRED/)
  })

  it("NF-UNIT-502: non-allowlisted high/critical advisory → fails", () => {
    const r = evaluate(report(advisory("GHSA-bbbb", "critical", "undici")), allowlist, "2026-10-28")
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0]).toContain("GHSA-bbbb")
  })

  it("NF-UNIT-503: moderate/low advisories and package-reference strings are ignored", () => {
    const r = evaluate(report(advisory("GHSA-cccc", "moderate"), "other-pkg"), {}, "2026-10-28")
    expect(r.failures).toEqual([])
  })

  it("NF-UNIT-504: clean report → passes", () => {
    expect(evaluate({ vulnerabilities: {} }, {}, "2026-10-28").failures).toEqual([])
  })

  it("NF-UNIT-505: npm error output (no vulnerabilities map) → fails closed", () => {
    const r = evaluate({ error: { code: "ENOTFOUND", summary: "registry down" } }, allowlist, "2026-10-28")
    expect(r.failures).toHaveLength(1)
  })
})
