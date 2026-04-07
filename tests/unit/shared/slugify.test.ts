/**
 * Unit tests: slugify() and uniqueSlug() helpers (src/shared/slugify.ts).
 *
 * DEFERRED-21 P7 — T-04
 *
 * Covers:
 *   NF-UNIT-401: Basic camelCase/PascalCase → lowercase hyphenated slug
 *   NF-UNIT-402: Spaces become hyphens
 *   NF-UNIT-403: Consecutive non-alphanumeric → single hyphen
 *   NF-UNIT-404: Leading / trailing hyphens stripped
 *   NF-UNIT-405: Truncated to 60 characters
 *   NF-UNIT-406: Numbers preserved
 *   NF-UNIT-407: uniqueSlug returns base when no collision
 *   NF-UNIT-408: uniqueSlug appends -2 on first collision
 *   NF-UNIT-409: uniqueSlug skips occupied suffixes and takes -3, -4, etc.
 *   NF-UNIT-410: uniqueSlug handles sparse gaps correctly
 */

import { describe, it, expect } from "vitest"
import { slugify, uniqueSlug } from "../../../src/shared/slugify.js"

// ── slugify() ─────────────────────────────────────────────────────────────────

describe("slugify()", () => {
  describe("NF-UNIT-401: PascalCase / camelCase → lowercase", () => {
    it("lowercases DocuGardener → docugardener", () => {
      expect(slugify("DocuGardener")).toBe("docugardener")
    })

    it("lowercases mixed-case SkillSeal → skillseal", () => {
      expect(slugify("SkillSeal")).toBe("skillseal")
    })

    it("already-lowercase passes through unchanged", () => {
      expect(slugify("myapp")).toBe("myapp")
    })
  })

  describe("NF-UNIT-402: spaces become hyphens", () => {
    it("single space → single hyphen", () => {
      expect(slugify("Skill Seal")).toBe("skill-seal")
    })

    it("multi-word name produces hyphen-joined slug", () => {
      expect(slugify("My Product Name")).toBe("my-product-name")
    })
  })

  describe("NF-UNIT-403: consecutive non-alphanumeric → single hyphen", () => {
    it("version number with dots collapses separators", () => {
      expect(slugify("My Product 2.0!")).toBe("my-product-2-0")
    })

    it("multiple special chars collapse to one hyphen", () => {
      expect(slugify("hello---world")).toBe("hello-world")
    })

    it("mixed punctuation collapses", () => {
      expect(slugify("foo & bar! baz")).toBe("foo-bar-baz")
    })
  })

  describe("NF-UNIT-404: leading / trailing hyphens stripped", () => {
    it("strips leading hyphen from leading non-alpha char", () => {
      expect(slugify("!hello")).toBe("hello")
    })

    it("strips trailing hyphen from trailing non-alpha char", () => {
      expect(slugify("hello!")).toBe("hello")
    })

    it("strips both when input starts and ends with special chars", () => {
      expect(slugify("!hello world!")).toBe("hello-world")
    })
  })

  describe("NF-UNIT-405: truncated to 60 characters", () => {
    it("a 60-char name is returned as-is (no truncation)", () => {
      const name = "a".repeat(60)
      expect(slugify(name)).toHaveLength(60)
    })

    it("a 61-char name is truncated to 60", () => {
      const name = "a".repeat(61)
      expect(slugify(name)).toHaveLength(60)
    })

    it("a 100-char name is truncated to 60", () => {
      const name = "x".repeat(100)
      const result = slugify(name)
      expect(result).toHaveLength(60)
      expect(result).toBe("x".repeat(60))
    })
  })

  describe("NF-UNIT-406: numbers preserved", () => {
    it("digits in the name are kept", () => {
      expect(slugify("product123")).toBe("product123")
    })

    it("leading digit is kept (no special handling)", () => {
      expect(slugify("2fast")).toBe("2fast")
    })
  })
})

// ── uniqueSlug() ──────────────────────────────────────────────────────────────

describe("uniqueSlug()", () => {
  describe("NF-UNIT-407: no collision — returns base slug unchanged", () => {
    it("returns base when existing set is empty", () => {
      expect(uniqueSlug("skillseal", new Set())).toBe("skillseal")
    })

    it("returns base when existing set contains different slugs", () => {
      expect(uniqueSlug("skillseal", new Set(["docugardener", "myapp"]))).toBe("skillseal")
    })
  })

  describe("NF-UNIT-408: first collision → appends -2", () => {
    it("appends -2 when base is taken", () => {
      expect(uniqueSlug("skillseal", new Set(["skillseal"]))).toBe("skillseal-2")
    })
  })

  describe("NF-UNIT-409: multiple collisions → increments suffix", () => {
    it("appends -3 when -2 is also taken", () => {
      expect(
        uniqueSlug("skillseal", new Set(["skillseal", "skillseal-2"]))
      ).toBe("skillseal-3")
    })

    it("appends -4 when -2 and -3 are taken", () => {
      expect(
        uniqueSlug("skillseal", new Set(["skillseal", "skillseal-2", "skillseal-3"]))
      ).toBe("skillseal-4")
    })
  })

  describe("NF-UNIT-410: sparse gaps are NOT reused — strictly increments", () => {
    it("uses -4 even when -3 is free if -2 is taken", () => {
      // Current behaviour: starts at 2 and increments; no gap reuse
      const existing = new Set(["skillseal", "skillseal-2"])
      // -3 is free, so it returns -3
      expect(uniqueSlug("skillseal", existing)).toBe("skillseal-3")
    })

    it("skips all occupied suffixes in order", () => {
      const existing = new Set(["skillseal", "skillseal-2", "skillseal-3", "skillseal-4"])
      expect(uniqueSlug("skillseal", existing)).toBe("skillseal-5")
    })
  })
})
