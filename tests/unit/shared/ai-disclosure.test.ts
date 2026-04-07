/**
 * Unit tests for src/shared/ai-disclosure.ts — CG-01.
 * NF-UNIT-50+
 */

import { describe, it, expect } from "vitest"
import {
  getDisclosure,
  applyDisclosure,
  type DisclosureOptions,
  type DisclosureTemplates,
} from "../../../src/shared/ai-disclosure.js"

const BASE_OPTS: DisclosureOptions = {
  channel: "email",
  context: "auto_reply",
  productName: "Acme Support",
}

describe("getDisclosure()", () => {
  it("NF-UNIT-50: returns non-empty English header for auto_reply", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "en" })
    expect(result.header).toContain("AI assistant")
    expect(result.header.length).toBeGreaterThan(0)
  })

  it("NF-UNIT-51: returns non-empty English footer for auto_reply", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "en" })
    expect(result.footer).toContain("AI")
    expect(result.footer.length).toBeGreaterThan(0)
  })

  it("NF-UNIT-52: returns German header for de locale", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "de" })
    expect(result.header).toContain("KI-Assistenten")
  })

  it("NF-UNIT-53: returns German footer for de locale", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "de" })
    expect(result.footer).toContain("KI")
    expect(result.footer).toContain("MENSCH")
  })

  it("NF-UNIT-54: uses product override header when provided", () => {
    const overrides: DisclosureTemplates = {
      en: { auto_reply_header: "Custom override header from {productName}." },
    }
    const result = getDisclosure({ ...BASE_OPTS, locale: "en" }, overrides)
    expect(result.header).toContain("Custom override header")
    expect(result.header).not.toContain("{productName}")
  })

  it("NF-UNIT-55: uses product override footer and falls back to default header", () => {
    const overrides: DisclosureTemplates = {
      en: { auto_reply_footer: "Powered by {productName} AI." },
    }
    const result = getDisclosure({ ...BASE_OPTS, locale: "en" }, overrides)
    expect(result.footer).toBe("Powered by Acme Support AI.")
    expect(result.header).toContain("AI assistant")
  })

  it("NF-UNIT-56: interpolates {productName} placeholder", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "en", productName: "FleetBot" })
    expect(result.header).toContain("FleetBot")
    expect(result.header).not.toContain("{productName}")
  })

  it("NF-UNIT-57: returns empty strings for notification context", () => {
    const result = getDisclosure({ ...BASE_OPTS, context: "notification", locale: "en" })
    expect(result.header).toBe("")
    expect(result.footer).toBe("")
  })

  it("NF-UNIT-58: returns empty header for resolution context", () => {
    const result = getDisclosure({ ...BASE_OPTS, context: "resolution", locale: "en" })
    expect(result.header).toBe("")
    expect(result.footer.length).toBeGreaterThan(0)
  })

  it("NF-UNIT-59: falls back to English for unknown locale", () => {
    const result = getDisclosure({ ...BASE_OPTS, locale: "fr" as "en" })
    expect(result.header).toContain("AI assistant")
  })

  it("NF-UNIT-60: returns non-empty header and footer for clarification", () => {
    const result = getDisclosure({ ...BASE_OPTS, context: "clarification", locale: "en" })
    expect(result.header.length).toBeGreaterThan(0)
    expect(result.footer.length).toBeGreaterThan(0)
  })
})

describe("applyDisclosure()", () => {
  it("NF-UNIT-61: wraps body with header, body, separator, footer", () => {
    const body = "Your ticket has been received."
    const result = applyDisclosure(body, { ...BASE_OPTS, locale: "en" })
    expect(result.startsWith("This message was generated")).toBe(true)
    expect(result).toContain(body)
    expect(result).toContain("---")
  })

  it("NF-UNIT-62: skips header when context header is empty (resolution)", () => {
    const body = "Your case has been resolved."
    const result = applyDisclosure(body, { ...BASE_OPTS, context: "resolution", locale: "en" })
    expect(result.startsWith(body)).toBe(true)
    expect(result).toContain("---")
  })

  it("NF-UNIT-63: skips footer separator when override produces empty footer", () => {
    const overrides: DisclosureTemplates = {
      en: { auto_reply_header: "AI generated.", auto_reply_footer: "" },
    }
    const body = "Here is your answer."
    const result = applyDisclosure(body, { ...BASE_OPTS, locale: "en" }, overrides)
    expect(result).toContain("AI generated.")
    expect(result).toContain(body)
    expect(result).not.toContain("---")
  })

  it("NF-UNIT-64: produces bare body for notification context", () => {
    const body = "Outage detected in region EU-WEST."
    const result = applyDisclosure(body, { ...BASE_OPTS, context: "notification", locale: "en" })
    expect(result).toBe(body)
  })

  it("NF-UNIT-65: interpolates productName in final output", () => {
    const body = "Please review the attached report."
    const result = applyDisclosure(body, { ...BASE_OPTS, locale: "en", productName: "NestFleet" })
    expect(result).toContain("NestFleet")
    expect(result).not.toContain("{productName}")
  })
})
