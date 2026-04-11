/**
 * Unit tests: slug validation — FEAT-001.
 *
 * NF-UNIT-SLUG-01  valid slug passes format check
 * NF-UNIT-SLUG-02  too short (2 chars) is rejected
 * NF-UNIT-SLUG-03  too long (41 chars) is rejected
 * NF-UNIT-SLUG-04  leading hyphen is rejected
 * NF-UNIT-SLUG-05  trailing hyphen is rejected
 * NF-UNIT-SLUG-06  uppercase letters are rejected
 * NF-UNIT-SLUG-07  underscore is rejected
 * NF-UNIT-SLUG-08  each reserved slug is blocked
 * NF-UNIT-SLUG-09  empty string is rejected
 * NF-UNIT-SLUG-10  hyphens in the middle are valid
 * NF-UNIT-SLUG-11  exactly 3 chars is valid
 * NF-UNIT-SLUG-12  exactly 40 chars is valid
 */

import { describe, it, expect } from "vitest"
import { validateSlugFormat, RESERVED_SLUGS } from "../../../src/fleet/provisioning/slug.js"

describe("validateSlugFormat", () => {
  it("NF-UNIT-SLUG-01: valid slug passes", () => {
    expect(validateSlugFormat("acme")).toEqual({ ok: true })
  })

  it("NF-UNIT-SLUG-02: 2-char slug is rejected", () => {
    const r = validateSlugFormat("ab")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-03: 41-char slug is rejected", () => {
    const r = validateSlugFormat("a".repeat(41))
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-04: leading hyphen is rejected", () => {
    const r = validateSlugFormat("-acme")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-05: trailing hyphen is rejected", () => {
    const r = validateSlugFormat("acme-")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-06: uppercase letters are rejected", () => {
    const r = validateSlugFormat("Acme")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-07: underscore is rejected", () => {
    const r = validateSlugFormat("my_company")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-08: all reserved slugs are blocked", () => {
    for (const reserved of RESERVED_SLUGS) {
      const r = validateSlugFormat(reserved)
      expect(r.ok, `expected '${reserved}' to be blocked`).toBe(false)
    }
  })

  it("NF-UNIT-SLUG-09: empty string is rejected", () => {
    const r = validateSlugFormat("")
    expect(r.ok).toBe(false)
  })

  it("NF-UNIT-SLUG-10: hyphens in the middle are valid", () => {
    expect(validateSlugFormat("my-company-name")).toEqual({ ok: true })
  })

  it("NF-UNIT-SLUG-11: exactly 3 chars is valid", () => {
    expect(validateSlugFormat("abc")).toEqual({ ok: true })
  })

  it("NF-UNIT-SLUG-12: exactly 40 chars is valid", () => {
    // Must start and end with alphanumeric
    expect(validateSlugFormat("a" + "b".repeat(38) + "c")).toEqual({ ok: true })
  })
})
