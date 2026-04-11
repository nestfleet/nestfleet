// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Fleet health worker — NF-OPS-01 Phase 3.
 *
 * Runs every 10 minutes via pg-boss cron.
 * For each active provisioning: polls GET https://{slug}.{baseDomain}/health
 * with a 5s timeout. Updates last_health_check_at + last_health_status.
 * Sends alert email to OPS_ALERT_EMAIL if unreachable for > 2 hours.
 */

import { getBoss } from "../../infra/queue/boss.js"
import { logger } from "../../shared/logger.js"
import { config } from "../../shared/config.js"
import { listProvisionings, updateProvisioning } from "../../infra/db/repositories/provisionings.js"
import type { ProvisioningRow } from "../../infra/db/repositories/provisionings.js"
import { sendEmail } from "../../email/sender.js"

const SCHEDULE_NAME   = "fleet_health_check"
const CRON_EVERY_10M  = "*/10 * * * *"
const HEALTH_TIMEOUT  = 5_000          // 5 seconds
const ALERT_THRESHOLD = 2 * 60 * 60 * 1000  // 2 hours in ms

type HealthStatus = "ok" | "degraded" | "unreachable"

type HealthCheckProv = Pick<
  ProvisioningRow,
  "id" | "org_slug" | "customer_email" | "last_health_check_at" | "last_health_status"
>

/**
 * Check the health of a single provisioning instance.
 *
 * Exported for unit testing — keeps the pg-boss plumbing out of tests.
 *
 * Side effects:
 *  - calls updateProvisioning to persist the result
 *  - may call sendEmail if the instance has been unreachable for > 2 hours
 */
export async function checkInstanceHealth(
  prov: HealthCheckProv,
  baseDomain: string,
  now: Date,
): Promise<HealthStatus> {
  const url = `https://${prov.org_slug}.${baseDomain}/health`
  let status: HealthStatus = "unreachable"

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    })
    if (res.ok) {
      status = "ok"
    } else if (res.status >= 500) {
      status = "degraded"
    } else {
      status = "unreachable"
    }
  } catch {
    status = "unreachable"
  }

  await updateProvisioning(prov.id, {
    last_health_check_at: now,
    last_health_status:   status,
  }).catch((err: unknown) => {
    logger.error({ err, slug: prov.org_slug }, "FleetHealthWorker: DB update failed")
  })

  // Alert if unreachable for > ALERT_THRESHOLD
  if (status === "unreachable" && config.OPS_ALERT_EMAIL) {
    const lastCheck = prov.last_health_check_at
      ? new Date(prov.last_health_check_at).getTime()
      : 0
    const wasAlreadyUnreachable = prov.last_health_status === "unreachable"
    const downMs = wasAlreadyUnreachable && lastCheck ? now.getTime() - lastCheck : 0

    if (downMs > ALERT_THRESHOLD) {
      await sendEmail({
        to:      config.OPS_ALERT_EMAIL,
        subject: `[NestFleet Alert] Instance unreachable: ${prov.org_slug}`,
        text: [
          `Instance ${prov.org_slug}.${baseDomain} has been unreachable for over 2 hours.`,
          `Last successful check: ${lastCheck ? new Date(lastCheck).toISOString() : "never"}`,
          `Customer email: ${prov.customer_email}`,
        ].join("\n"),
      }).catch((err: unknown) => {
        logger.error({ err, slug: prov.org_slug }, "FleetHealthWorker: alert email failed")
      })
    }
  }

  logger.info({ slug: prov.org_slug, status }, "FleetHealthWorker: checked")

  return status
}

export async function registerFleetHealthWorker(): Promise<void> {
  if (!config.PROVISIONING_ENABLED) return

  const boss = await getBoss()
  await boss.createQueue(SCHEDULE_NAME)
  await boss.schedule(SCHEDULE_NAME, CRON_EVERY_10M, {})

  await boss.work(SCHEDULE_NAME, { localConcurrency: 1 }, async () => {
    logger.info("FleetHealthWorker: starting health check run")

    // Fetch all active provisionings (no pagination needed for Phase 1 fleet size)
    const { rows } = await listProvisionings({ status: "active", limit: 200, offset: 0 })
    if (rows.length === 0) {
      logger.info("FleetHealthWorker: no active provisionings to check")
      return
    }

    logger.info({ count: rows.length }, "FleetHealthWorker: checking instances")

    const baseDomain = config.CUSTOMER_BASE_DOMAIN
    const now = new Date()

    await Promise.allSettled(
      rows.map((prov) =>
        checkInstanceHealth(prov, baseDomain, now).catch((err: unknown) => {
          logger.error({ err, slug: prov.org_slug }, "FleetHealthWorker: unexpected error for instance")
        }),
      ),
    )

    logger.info("FleetHealthWorker: health check run complete")
  })

  logger.info("FleetHealthWorker: registered (cron: every 10 min)")
}
