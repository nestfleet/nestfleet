// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Deprovisioning nightly scheduler — FEAT-001 (NF-OPS-06).
 *
 * Runs at 03:00 UTC every night via pg-boss cron.
 * Queries provisionings WHERE status='deprovisioning' AND deprovision_after < now()
 * and calls deprovisionOne() for each expired row.
 *
 * Each customer is processed independently — one failure does not block others.
 */

import { getBoss } from "../../infra/queue/boss.js"
import { logger } from "../../shared/logger.js"
import { findExpiredDeprovisionings } from "../../infra/db/repositories/provisionings.js"
import { deprovisionOne } from "../provisioning/deprovision.js"
import { config } from "../../shared/config.js"

const SCHEDULE_NAME = "deprovision_nightly"
const CRON_UTC_3AM  = "0 3 * * *"

export async function registerDeprovisionScheduler(): Promise<void> {
  const boss = await getBoss()

  await boss.createQueue(SCHEDULE_NAME)

  // Register the scheduled trigger
  await boss.schedule(SCHEDULE_NAME, CRON_UTC_3AM, {})

  // Register the worker that handles the triggered job (pg-boss v12 batch handler)
  await boss.work(SCHEDULE_NAME, { localConcurrency: 1 }, async () => {
    logger.info("DeprovisionScheduler: nightly run starting")

    let expired
    try {
      expired = await findExpiredDeprovisionings()
    } catch (err) {
      logger.error({ err }, "DeprovisionScheduler: DB query failed")
      throw err
    }

    if (expired.length === 0) {
      logger.info("DeprovisionScheduler: no expired provisionings")
      return
    }

    logger.info({ count: expired.length }, "DeprovisionScheduler: processing expired provisionings")

    // Process each independently — failures are logged but don't block others
    const results = await Promise.allSettled(
      expired.map((prov) =>
        deprovisionOne(prov).catch((err) => {
          logger.error({ err, slug: prov.org_slug }, "DeprovisionScheduler: deprovisionOne failed")
          throw err
        }),
      ),
    )

    const failed  = results.filter((r) => r.status === "rejected").length
    const success = results.length - failed

    logger.info(
      { total: results.length, success, failed },
      "DeprovisionScheduler: nightly run complete",
    )
  })

  logger.info("DeprovisionScheduler: registered (cron: 03:00 UTC)")
}

/** Immediately deprovision a single slug — used by owner console emergency action. */
export async function enqueueImmediateDeprovision(slug: string): Promise<void> {
  if (!config.PROVISIONING_ENABLED) return
  const boss = await getBoss()
  await boss.send("deprovision_immediate", { slug }, { singletonKey: `deprovision:${slug}` })
}
