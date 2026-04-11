// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Deprovisioning saga — FEAT-001 (NF-OPS-06).
 *
 * Called by the nightly scheduler for rows where:
 *   status = 'deprovisioning' AND deprovision_after < now()
 *
 * Each customer is deprovisioned independently — one failure does not block others.
 * Best-effort: if Hetzner DELETE fails, Cloudflare DELETE still runs (and vice versa).
 * Both results are logged; the row is updated regardless (partial success is logged).
 *
 * S3 backups: retained 90 days by lifecycle rule on the bucket — no action needed here.
 */

import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import { sendEmail } from "../../email/sender.js"
import { updateProvisioning, type ProvisioningRow } from "../../infra/db/repositories/provisionings.js"
import { createHetznerClient } from "./hetzner-client.js"
import { createCloudflareClient } from "./cloudflare-client.js"

/**
 * Deprovision a single customer VPS: delete Hetzner server + Cloudflare DNS record.
 * Best-effort: both operations are attempted even if one fails.
 */
export async function deprovisionOne(prov: ProvisioningRow): Promise<void> {
  const hetzner    = createHetznerClient(config.HETZNER_API_TOKEN!)
  const cloudflare = createCloudflareClient(config.CLOUDFLARE_API_TOKEN!)
  const slug       = prov.org_slug

  logger.info({ slug, provId: prov.id }, "Deprovision: starting")

  const errors: string[] = []

  // Delete Hetzner VPS
  if (prov.hetzner_server_id) {
    try {
      await hetzner.deleteServer(prov.hetzner_server_id)
      logger.info({ slug, serverId: prov.hetzner_server_id }, "Deprovision: VPS deleted")
    } catch (err) {
      const msg = `Hetzner delete failed (server ${prov.hetzner_server_id}): ${String(err)}`
      errors.push(msg)
      logger.error({ err, slug }, "Deprovision: Hetzner VPS delete failed")
    }
  } else {
    logger.info({ slug }, "Deprovision: no Hetzner server ID — skipping VPS delete")
  }

  // Delete Cloudflare DNS record
  if (prov.cloudflare_record_id) {
    try {
      await cloudflare.deleteDnsRecord(config.CLOUDFLARE_ZONE_ID!, prov.cloudflare_record_id)
      logger.info({ slug, recordId: prov.cloudflare_record_id }, "Deprovision: DNS record deleted")
    } catch (err) {
      const msg = `Cloudflare delete failed (record ${prov.cloudflare_record_id}): ${String(err)}`
      errors.push(msg)
      logger.error({ err, slug }, "Deprovision: Cloudflare DNS delete failed")
    }
  } else {
    logger.info({ slug }, "Deprovision: no Cloudflare record ID — skipping DNS delete")
  }

  // Update status regardless of partial failures (log errors for ops)
  await updateProvisioning(prov.id, {
    status:           "deprovisioned",
    deprovisioned_at: new Date(),
    ...(errors.length > 0 ? { error_message: errors.join("; ") } : {}),
  })

  if (errors.length > 0) {
    logger.warn({ slug, errors }, "Deprovision: completed with errors — manual cleanup may be needed")
  } else {
    logger.info({ slug }, "Deprovision: complete")
  }
}

/**
 * Immediately schedule a provisioning for deprovisioning.
 * Used by: subscription cancellation webhook, owner console emergency deprovision.
 * The nightly job picks it up within 24h; for urgent cases use deprovisionOne() directly.
 */
export async function startDeprovisioning(
  prov: ProvisioningRow,
  graceDays = 30,
): Promise<void> {
  const deprovisionAfter = new Date()
  deprovisionAfter.setDate(deprovisionAfter.getDate() + graceDays)

  await updateProvisioning(prov.id, {
    status:            "deprovisioning",
    deprovision_after: deprovisionAfter,
  })

  logger.info(
    { slug: prov.org_slug, deprovisionAfter },
    "Deprovision: grace period started",
  )

  // Send data export window email
  const loginUrl = `https://${prov.org_slug}.${config.CUSTOMER_BASE_DOMAIN}`
  await sendEmail({
    to:      prov.customer_email,
    subject: "Your NestFleet subscription has been cancelled",
    text: [
      `Your NestFleet subscription has been cancelled.`,
      "",
      `Your instance at ${loginUrl} will remain accessible for ${graceDays} days.`,
      `Data export deadline: ${deprovisionAfter.toDateString()}`,
      "",
      `To export your data, visit: ${loginUrl}/settings/export`,
      "",
      "After the grace period, your instance and all data will be permanently deleted.",
      "",
      "Questions? Contact support@nestfleet.dev",
    ].join("\n"),
  }).catch((err) => {
    logger.error({ err, slug: prov.org_slug }, "Deprovision: grace period email failed (non-fatal)")
  })
}
