/**
 * Source tier assignment.
 * Maps source types to T1–T4 tiers per product-memory-specification.md section 3.2.
 * ADR-018: tier governs both retrieval ranking AND policy gating.
 */

import type { SourceTier, SourceType } from "../types.js"

const SOURCE_TYPE_TIER: Record<SourceType, SourceTier> = {
  product_spec:           1,
  feature_spec:           1,
  faq:                    1,
  known_issues:           1,
  api_docs:               1,
  openapi_spec:           2,  // auto-generated specs are T2, not T1
  architecture_overview:  2,
  technical_spec:         2,
  deployment_guide:       2,
  troubleshooting_guide:  2,
  runbook:                2,
  changelog:              2,
  readme:                 2,  // README is high-level but not a spec — T2
  github_issue_filtered:  3,
  github_pr_merged:       3,
  github_issue_raw:       4,
  commit_message:         4,
}

export function assignTier(sourceType: SourceType): SourceTier {
  return SOURCE_TYPE_TIER[sourceType]
}

/**
 * Returns all source types for a given tier — used in health assessment
 * to check which tiers are covered in the index.
 */
export function sourceTypesForTier(tier: SourceTier): SourceType[] {
  return (Object.entries(SOURCE_TYPE_TIER) as [SourceType, SourceTier][])
    .filter(([, t]) => t === tier)
    .map(([sourceType]) => sourceType)
}

/** T1 source types — the authoritative set. */
export const T1_SOURCE_TYPES: SourceType[] = sourceTypesForTier(1)

/** Source types that constitute "architecture coverage" in health report. */
export const ARCHITECTURE_SOURCE_TYPES: SourceType[] = ["architecture_overview"]

/** Source types that constitute "technical spec coverage" in health report. */
export const TECHNICAL_SPEC_SOURCE_TYPES: SourceType[] = ["technical_spec"]
