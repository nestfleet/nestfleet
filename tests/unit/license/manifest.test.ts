/**
 * Unit tests: NF-MAN-01 — Capability Manifest Serializer
 *
 * NF-UNIT-460: buildManifest returns version 1
 * NF-UNIT-461: quota_dimensions contains all 4 expected dimensions
 * NF-UNIT-462: quota_dimensions keys match pattern ^[a-z][a-z0-9_]*$
 * NF-UNIT-463: quota_dimensions all have type "number"
 * NF-UNIT-464: features array is non-empty
 * NF-UNIT-465: features with featureFlag get gate="flag" and key=featureFlag
 * NF-UNIT-466: features without featureFlag get gate="tier" and key=feature.id
 * NF-UNIT-467: tier features include min_tier from feature.minTier
 * NF-UNIT-468: flag features do NOT include min_tier
 * NF-UNIT-469: comingSoon features are excluded from manifest
 * NF-UNIT-470: sso_saml and sso_group_mapping appear as separate manifest entries
 * NF-UNIT-471: all manifest feature keys match pattern ^[a-z][a-z0-9_]*$
 * NF-UNIT-472: all manifest feature keys are unique (no duplicates)
 * NF-UNIT-473: group field is populated for every feature
 * NF-UNIT-474: every feature has a non-empty label and description
 * NF-UNIT-475: buildManifest is pure / referentially stable (same object shape each call)
 */

import { describe, it, expect } from "vitest"
import { buildManifest } from "../../../src/license/manifest.js"
import { FEATURE_CATALOG } from "../../../src/rbac/feature-catalog.js"

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/

describe("buildManifest", () => {
  // NF-UNIT-460
  it("NF-UNIT-460: returns version 1", () => {
    const manifest = buildManifest()
    expect(manifest.version).toBe(1)
  })

  // NF-UNIT-461
  it("NF-UNIT-461: quota_dimensions contains all 4 expected dimensions", () => {
    const { quota_dimensions } = buildManifest()
    const keys = quota_dimensions.map((d) => d.key)
    expect(keys).toContain("outcome_units_monthly")
    expect(keys).toContain("active_products")
    expect(keys).toContain("lead_slots")
    expect(keys).toContain("users")
    expect(keys).toHaveLength(4)
  })

  // NF-UNIT-462
  it("NF-UNIT-462: quota_dimensions keys match pattern ^[a-z][a-z0-9_]*$", () => {
    const { quota_dimensions } = buildManifest()
    for (const dim of quota_dimensions) {
      expect(dim.key).toMatch(KEY_PATTERN)
    }
  })

  // NF-UNIT-463
  it("NF-UNIT-463: quota_dimensions all have type 'number'", () => {
    const { quota_dimensions } = buildManifest()
    for (const dim of quota_dimensions) {
      expect(dim.type).toBe("number")
    }
  })

  // NF-UNIT-464
  it("NF-UNIT-464: features array is non-empty", () => {
    const { features } = buildManifest()
    expect(features.length).toBeGreaterThan(0)
  })

  // NF-UNIT-465
  it("NF-UNIT-465: features with featureFlag get gate='flag' and key=featureFlag", () => {
    const { features } = buildManifest()
    // channel_slack has featureFlag: "slack_channel"
    const slackFeature = features.find((f) => f.key === "slack_channel")
    expect(slackFeature).toBeDefined()
    expect(slackFeature!.gate).toBe("flag")
    expect(slackFeature!.min_tier).toBeUndefined()
  })

  // NF-UNIT-466
  it("NF-UNIT-466: features without featureFlag get gate='tier' and key=feature.id", () => {
    const { features } = buildManifest()
    // case_management has no featureFlag
    const caseManagement = features.find((f) => f.key === "case_management")
    expect(caseManagement).toBeDefined()
    expect(caseManagement!.gate).toBe("tier")
  })

  // NF-UNIT-467
  it("NF-UNIT-467: tier features include min_tier from feature.minTier", () => {
    const { features } = buildManifest()
    // ci_auto_complete has minTier: "growth"
    const ciAutoComplete = features.find((f) => f.key === "ci_auto_complete")
    expect(ciAutoComplete).toBeDefined()
    expect(ciAutoComplete!.gate).toBe("tier")
    expect(ciAutoComplete!.min_tier).toBe("growth")
  })

  // NF-UNIT-468
  it("NF-UNIT-468: flag features do NOT include min_tier", () => {
    const { features } = buildManifest()
    const flagFeatures = features.filter((f) => f.gate === "flag")
    expect(flagFeatures.length).toBeGreaterThan(0)
    for (const f of flagFeatures) {
      expect(f.min_tier).toBeUndefined()
    }
  })

  // NF-UNIT-469
  it("NF-UNIT-469: comingSoon features are excluded from manifest", () => {
    // channel_telegram and compliance_dsar are comingSoon
    const comingSoonIds = FEATURE_CATALOG.flatMap((g) =>
      g.features.filter((f) => f.comingSoon).map((f) => f.id),
    )
    expect(comingSoonIds.length).toBeGreaterThan(0) // sanity: there are some

    const { features } = buildManifest()
    const manifestKeys = new Set(features.map((f) => f.key))

    for (const id of comingSoonIds) {
      // Neither the id nor any featureFlag that maps to it should appear
      expect(manifestKeys.has(id)).toBe(false)
    }
    // Specifically check the known coming-soon entries
    expect(manifestKeys.has("telegram_channel")).toBe(false)
    expect(manifestKeys.has("channel_telegram")).toBe(false)
  })

  // NF-UNIT-470
  it("NF-UNIT-470: sso_saml and sso_group_mapping appear as separate manifest entries", () => {
    const { features } = buildManifest()
    const ssoSaml = features.find((f) => f.key === "sso_saml")
    const ssoGroupMapping = features.find((f) => f.key === "sso_group_mapping")
    expect(ssoSaml).toBeDefined()
    expect(ssoGroupMapping).toBeDefined()
    expect(ssoSaml!.gate).toBe("flag")
    expect(ssoGroupMapping!.gate).toBe("flag")
  })

  // NF-UNIT-471
  it("NF-UNIT-471: all manifest feature keys match pattern ^[a-z][a-z0-9_]*$", () => {
    const { features } = buildManifest()
    for (const f of features) {
      expect(f.key).toMatch(KEY_PATTERN)
    }
  })

  // NF-UNIT-472
  it("NF-UNIT-472: all manifest feature keys are unique", () => {
    const { features } = buildManifest()
    const keys = features.map((f) => f.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  // NF-UNIT-473
  it("NF-UNIT-473: group field is populated for every feature", () => {
    const { features } = buildManifest()
    for (const f of features) {
      expect(typeof f.group).toBe("string")
      expect(f.group!.length).toBeGreaterThan(0)
    }
  })

  // NF-UNIT-474
  it("NF-UNIT-474: every feature has a non-empty label and description", () => {
    const { features } = buildManifest()
    for (const f of features) {
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.description).toBeDefined()
      expect(f.description!.length).toBeGreaterThan(0)
    }
  })

  // NF-UNIT-475
  it("NF-UNIT-475: buildManifest is pure — two calls produce same shape", () => {
    const a = buildManifest()
    const b = buildManifest()
    expect(a.version).toBe(b.version)
    expect(a.quota_dimensions).toEqual(b.quota_dimensions)
    expect(a.features).toEqual(b.features)
  })
})
