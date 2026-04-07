/**
 * NF-MAN-01 — Capability Manifest Serializer
 *
 * Serializes FEATURE_CATALOG into the ProductCapabilityManifest schema
 * (SAD-06 §3.1 / capability-manifest-v1.yaml).
 *
 * Rules:
 *   - featureFlag present  → gate: "flag",  key: featureFlag
 *   - featureFlag absent   → gate: "tier",  key: feature.id, min_tier: feature.minTier
 *   - comingSoon: true     → excluded (feature not yet implemented)
 *   - Each featureFlag key must be unique — catalog entries share no featureFlag values
 *     after the sso_group_mapping correction in feature-catalog.ts.
 */

import { FEATURE_CATALOG } from "../rbac/feature-catalog.js"

// ── Schema types (mirrors SAD-06 §3.1 / capability-manifest-v1.yaml) ─────────

export interface QuotaDimension {
  key: string
  label: string
  type: "number" | "boolean"
}

export interface FeatureDeclaration {
  key: string
  label: string
  description?: string
  group?: string
  gate: "tier" | "flag"
  min_tier?: string
}

export interface ProductCapabilityManifest {
  version: 1
  quota_dimensions: QuotaDimension[]
  features: FeatureDeclaration[]
}

// ── Quota dimensions ──────────────────────────────────────────────────────────
// Hardcoded: these are not derivable from FEATURE_CATALOG.
// Keys must match what NestFleet sends in telemetry and what the cloud quota_json uses.

const QUOTA_DIMENSIONS: QuotaDimension[] = [
  { key: "outcome_units_monthly", label: "Outcome Units / Month", type: "number" },
  { key: "active_products",       label: "Active Products",       type: "number" },
  { key: "lead_slots",            label: "Lead Slots",            type: "number" },
  { key: "users",                 label: "Console Users",         type: "number" },
]

// ── Manifest builder ──────────────────────────────────────────────────────────

/**
 * Builds the ProductCapabilityManifest from the FEATURE_CATALOG.
 *
 * Called on startup (NF-MAN-02) and used for debounce hash comparison.
 * Pure function — no side effects, stable output for the same catalog.
 */
export function buildManifest(): ProductCapabilityManifest {
  const features: FeatureDeclaration[] = []
  const seenKeys = new Set<string>()

  for (const group of FEATURE_CATALOG) {
    for (const feature of group.features) {
      // Exclude features that are not yet implemented
      if (feature.comingSoon) continue

      const key = feature.featureFlag ?? feature.id

      // Guard against duplicate keys (defensive — catalog should have unique keys)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      if (feature.featureFlag !== undefined) {
        // Category B: explicitly toggled per plan via feature flags
        features.push({
          key,
          label: feature.label,
          description: feature.description,
          group: group.label,
          gate: "flag",
        })
      } else {
        // Category A: implicitly available at min_tier and above
        features.push({
          key,
          label: feature.label,
          description: feature.description,
          group: group.label,
          gate: "tier",
          min_tier: feature.minTier,
        })
      }
    }
  }

  return {
    version: 1,
    quota_dimensions: QUOTA_DIMENSIONS,
    features,
  }
}
