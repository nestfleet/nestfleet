/**
 * BIL-02: Outcome Unit (OU) tracker.
 *
 * Tracks qualifying OU events against the monthly limit embedded in the
 * license JWT.  One OU = a resolved support thread OR a completed change
 * request (merged PR / CI-passed deploy).
 *
 * Enforcement thresholds:
 *   ≥ 80% usage  → "warning"  (proceed, surface banner in console)
 *   ≥ 100% usage → "blocked"  (soft-block new case intake)
 *   limit = 0    → "ok"       (unlimited — dev mode or enterprise)
 */

import { getDb } from "../infra/db/client.js"
import { getLicenseState } from "../license/validator.js"
import { logger } from "../shared/logger.js"

export type OuEventType = "case.resolved" | "cr.completed"

export interface OuUsage {
  month:   string   // YYYY-MM
  usage:   number
  limit:   number   // 0 = unlimited
  percent: number   // 0–Infinity; meaningful only when limit > 0
}

export type OuStatus = "ok" | "warning" | "blocked"

/** Returns the current YYYY-MM string in UTC. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Record one OU-qualifying event.
 * Idempotent: duplicate (event_type, entity_ref) pairs are silently ignored.
 */
export async function incrementOu(opts: {
  productId:  string
  eventType:  OuEventType
  entityRef:  string
}): Promise<void> {
  const db = getDb()
  const month = currentMonth()

  try {
    await db`
      INSERT INTO outcome_unit_usage (product_id, event_type, entity_ref, month)
      VALUES (${opts.productId}, ${opts.eventType}, ${opts.entityRef}, ${month})
      ON CONFLICT (event_type, entity_ref) DO NOTHING
    `
    logger.debug({ ...opts, month }, "OU event recorded")
  } catch (err) {
    // Non-fatal: billing tracking must never block the primary workflow
    logger.error({ err, ...opts }, "Failed to record OU event (non-fatal)")
  }
}

/**
 * Returns total OU usage for the current calendar month (all products combined)
 * and the configured monthly limit from the license.
 */
export async function getOuUsage(): Promise<OuUsage> {
  const db = getDb()
  const month = currentMonth()

  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM outcome_unit_usage
    WHERE month = ${month}
  `
  const usage = parseInt(row?.count ?? "0", 10)

  const limit = getLicenseState()?.payload?.maxOutcomeUnitsMonthly ?? 0
  const percent = limit > 0 ? (usage / limit) * 100 : 0

  return { month, usage, limit, percent }
}

/**
 * Returns the enforcement status for the current month.
 */
export async function getOuStatus(): Promise<OuStatus> {
  const { usage, limit } = await getOuUsage()
  if (limit === 0) return "ok"            // unlimited
  if (usage >= limit) return "blocked"
  if (usage >= limit * 0.8) return "warning"
  return "ok"
}
