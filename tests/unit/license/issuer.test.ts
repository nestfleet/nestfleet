/**
 * Unit tests: license JWT issuer — src/license/issuer.ts
 *
 * NF-UNIT-LIC-01  starter plan: correct tier, productLimit=3, correct features
 * NF-UNIT-LIC-02  growth plan: correct tier, productLimit=10, includes starter + growth flags
 * NF-UNIT-LIC-03  scale plan: correct tier, productLimit=999, includes all flags
 * NF-UNIT-LIC-04  JWT verifies with licenseSecret using HS256
 * NF-UNIT-LIC-05  decoded payload contains sub, tier, productLimit, features, issuedAt, expiresAt, customerId, customerName
 * NF-UNIT-LIC-06  expiresAt is approximately 1 year from now
 * NF-UNIT-LIC-07  growth features are a superset of starter features
 * NF-UNIT-LIC-08  scale features are a superset of growth features
 * NF-UNIT-LIC-09  unknown plan throws with descriptive error
 * NF-UNIT-LIC-10  standard JWT exp claim matches expiresAt custom field
 * NF-UNIT-LIC-11  custom expiresAt Date is honoured in both exp and expiresAt fields
 * NF-UNIT-LIC-12  expiresAt omitted → default ~1 year (backwards-compatible)
 */

import { describe, it, expect } from "vitest"
import jwt from "jsonwebtoken"
import { issueLicenseToken } from "../../../src/license/issuer.js"

const SECRET = "test-license-secret-32-bytes-xxxx"
const SLUG   = "acme-corp"
const EMAIL  = "admin@acme.example.com"

const STARTER_FEATURES = ["website_widget_channel", "basic_compliance_templates"]
const GROWTH_EXTRA     = ["slack_channel", "telegram_channel", "gdpr_ai_act_templates"]
const SCALE_EXTRA      = ["discord_channel", "internal_api_channel", "sso_saml", "sso_group_mapping"]

function decode(token: string, secret: string): Record<string, unknown> {
  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as Record<string, unknown>
}

describe("issueLicenseToken", () => {
  it("NF-UNIT-LIC-01: starter plan has tier=starter, productLimit=3, correct features", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    const payload = decode(token, SECRET)
    expect(payload["tier"]).toBe("starter")
    expect(payload["productLimit"]).toBe(3)
    expect(payload["features"]).toEqual(expect.arrayContaining(STARTER_FEATURES))
    expect((payload["features"] as string[]).length).toBe(STARTER_FEATURES.length)
  })

  it("NF-UNIT-LIC-02: growth plan has tier=growth, productLimit=10, includes starter + growth flags", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "growth", licenseSecret: SECRET, customerEmail: EMAIL })
    const payload = decode(token, SECRET)
    expect(payload["tier"]).toBe("growth")
    expect(payload["productLimit"]).toBe(10)
    const features = payload["features"] as string[]
    expect(features).toEqual(expect.arrayContaining([...STARTER_FEATURES, ...GROWTH_EXTRA]))
  })

  it("NF-UNIT-LIC-03: scale plan has tier=scale, productLimit=999, includes all flags", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "scale", licenseSecret: SECRET, customerEmail: EMAIL })
    const payload = decode(token, SECRET)
    expect(payload["tier"]).toBe("scale")
    expect(payload["productLimit"]).toBe(999)
    const features = payload["features"] as string[]
    expect(features).toEqual(expect.arrayContaining([...STARTER_FEATURES, ...GROWTH_EXTRA, ...SCALE_EXTRA]))
  })

  it("NF-UNIT-LIC-04: JWT verifies with licenseSecret using HS256", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    // Should not throw
    expect(() => jwt.verify(token, SECRET, { algorithms: ["HS256"] })).not.toThrow()
    // Should fail with wrong secret
    expect(() => jwt.verify(token, "wrong-secret", { algorithms: ["HS256"] })).toThrow()
  })

  it("NF-UNIT-LIC-05: payload contains all required fields", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "growth", licenseSecret: SECRET, customerEmail: EMAIL })
    const payload = decode(token, SECRET)
    expect(payload["sub"]).toBe(SLUG)
    expect(typeof payload["tier"]).toBe("string")
    expect(typeof payload["productLimit"]).toBe("number")
    expect(Array.isArray(payload["features"])).toBe(true)
    expect(typeof payload["issuedAt"]).toBe("number")
    expect(typeof payload["expiresAt"]).toBe("number")
    expect(payload["customerId"]).toBe(SLUG)
    expect(payload["customerName"]).toBe(EMAIL)
  })

  it("NF-UNIT-LIC-06: expiresAt is approximately 1 year from now", () => {
    const before = Math.floor(Date.now() / 1000)
    const token = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    const after = Math.floor(Date.now() / 1000)
    const payload = decode(token, SECRET)
    const expiresAt = payload["expiresAt"] as number
    const oneYear = 365 * 24 * 60 * 60
    expect(expiresAt).toBeGreaterThanOrEqual(before + oneYear - 2)
    expect(expiresAt).toBeLessThanOrEqual(after + oneYear + 2)
  })

  it("NF-UNIT-LIC-07: growth features are a strict superset of starter features", () => {
    const starterToken = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    const growthToken  = issueLicenseToken({ slug: SLUG, plan: "growth",  licenseSecret: SECRET, customerEmail: EMAIL })
    const starterFeatures = decode(starterToken, SECRET)["features"] as string[]
    const growthFeatures  = decode(growthToken,  SECRET)["features"] as string[]
    for (const f of starterFeatures) {
      expect(growthFeatures).toContain(f)
    }
    expect(growthFeatures.length).toBeGreaterThan(starterFeatures.length)
  })

  it("NF-UNIT-LIC-08: scale features are a strict superset of growth features", () => {
    const growthToken = issueLicenseToken({ slug: SLUG, plan: "growth", licenseSecret: SECRET, customerEmail: EMAIL })
    const scaleToken  = issueLicenseToken({ slug: SLUG, plan: "scale",  licenseSecret: SECRET, customerEmail: EMAIL })
    const growthFeatures = decode(growthToken, SECRET)["features"] as string[]
    const scaleFeatures  = decode(scaleToken,  SECRET)["features"] as string[]
    for (const f of growthFeatures) {
      expect(scaleFeatures).toContain(f)
    }
    expect(scaleFeatures.length).toBeGreaterThan(growthFeatures.length)
  })

  it("NF-UNIT-LIC-09: unknown plan throws with descriptive error", () => {
    expect(() =>
      issueLicenseToken({ slug: SLUG, plan: "enterprise", licenseSecret: SECRET, customerEmail: EMAIL })
    ).toThrow("Unknown plan: enterprise")

    expect(() =>
      issueLicenseToken({ slug: SLUG, plan: "", licenseSecret: SECRET, customerEmail: EMAIL })
    ).toThrow("Unknown plan: ")
  })

  it("NF-UNIT-LIC-10: standard JWT exp claim matches expiresAt custom field", () => {
    const token = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    const payload = decode(token, SECRET)
    expect(payload["exp"]).toBe(payload["expiresAt"])
  })

  it("NF-UNIT-LIC-11: custom expiresAt Date is honoured in exp and expiresAt", () => {
    const customExpiry = new Date("2028-01-01T00:00:00.000Z")
    const expectedSecs = Math.floor(customExpiry.getTime() / 1000)
    const token = issueLicenseToken({ slug: SLUG, plan: "growth", licenseSecret: SECRET, customerEmail: EMAIL, expiresAt: customExpiry })
    const payload = decode(token, SECRET)
    expect(payload["expiresAt"]).toBe(expectedSecs)
    expect(payload["exp"]).toBe(expectedSecs)
  })

  it("NF-UNIT-LIC-12: omitting expiresAt keeps default 1-year behaviour", () => {
    const before = Math.floor(Date.now() / 1000)
    const token = issueLicenseToken({ slug: SLUG, plan: "starter", licenseSecret: SECRET, customerEmail: EMAIL })
    const after  = Math.floor(Date.now() / 1000)
    const payload = decode(token, SECRET)
    const oneYear = 365 * 24 * 60 * 60
    expect(payload["expiresAt"] as number).toBeGreaterThanOrEqual(before + oneYear - 2)
    expect(payload["expiresAt"] as number).toBeLessThanOrEqual(after  + oneYear + 2)
  })
})
