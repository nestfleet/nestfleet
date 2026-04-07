/**
 * Freshness score computation.
 * ADR-021: freshness and product version are mandatory retrieval signals.
 * Spec: product-memory-specification.md section 7.
 */

import type { SourceTier } from "../types.js"

/** Staleness window per tier in days (spec section 7.1). */
const STALENESS_WINDOW_DAYS: Record<SourceTier, number | null> = {
  1: 90,    // T1: 90 days
  2: 180,   // T2: 180 days
  3: 365,   // T3: 365 days
  4: null,  // T4: no decay — always 1.0 (signal only)
}

/**
 * Compute freshness score for a chunk.
 * Returns 1.0 for T4 sources (no decay).
 * Returns a linear decay from 1.0 → 0.0 over the staleness window for T1–T3.
 * Clamps to [0.0, 1.0].
 *
 * Formula: max(0, 1 - (days_since_update / staleness_window))
 */
export function computeFreshnessScore(
  tier: SourceTier,
  sourceUpdatedAt: Date,
  now: Date = new Date(),
): number {
  const window = STALENESS_WINDOW_DAYS[tier]
  if (window === null) return 1.0  // T4: no decay

  const msPerDay = 24 * 60 * 60 * 1000
  const daysSince = (now.getTime() - sourceUpdatedAt.getTime()) / msPerDay

  return Math.max(0, 1 - daysSince / window)
}

/**
 * Returns true if a chunk's freshness is below the auto-reply exclusion threshold.
 * Chunks below this threshold must not appear in auto-reply evidence packs (T1/T2 only).
 */
export function isStaleForAutoReply(freshnessScore: number, tier: SourceTier): boolean {
  if (tier >= 3) return false  // T3/T4 staleness is handled differently
  return freshnessScore < 0.3
}

/**
 * Returns true if a chunk should carry a staleness warning in the validation record.
 * Triggered when evidence pack includes a chunk with freshness < 0.5.
 */
export function hasStalenessWarning(freshnessScore: number): boolean {
  return freshnessScore < 0.5
}

/** Staleness windows exported for health report computation. */
export { STALENESS_WINDOW_DAYS }
