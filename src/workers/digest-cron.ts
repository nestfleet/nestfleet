/**
 * DigestCronWorker — SLICE-07.
 *
 * Scheduled pg-boss cron job that flushes pending notifications for all active
 * products twice daily: 09:00 UTC and 14:00 UTC.
 *
 * Uses pg-boss schedule() rather than work() — fired on a cron expression,
 * not driven by a queue message.
 *
 * For each product: calls NotificationService.flushDigest(productId) which
 * groups pending notifications by audienceType and sends digest emails.
 */

import { getBoss } from "../infra/queue/boss.js"
import { findProductsByStage } from "../infra/db/repositories/products.js"
import { NotificationService } from "../notifications/index.js"
import { logger } from "../shared/logger.js"

const DIGEST_JOB_NAME = "digest_flush"

// ── Scheduler registration ────────────────────────────────────────────────────

/**
 * Register the digest flush cron schedule with pg-boss.
 * Safe to call multiple times — pg-boss upserts schedules.
 * Cron: "0 9,14 * * *" — 09:00 and 14:00 UTC daily.
 */
export async function registerDigestCron(): Promise<void> {
  const boss = await getBoss()

  await boss.createQueue(DIGEST_JOB_NAME)

  // pg-boss schedule: fires twice daily at 09:00 and 14:00 UTC
  await boss.schedule(DIGEST_JOB_NAME, "0 9,14 * * *", {})

  await boss.work<Record<string, never>>(
    DIGEST_JOB_NAME,
    { localConcurrency: 1 },
    async () => {
      await runDigestFlush()
    },
  )

  logger.info({ schedule: "0 9,14 * * *" }, "Digest flush cron registered")
}

// ── Flush logic ───────────────────────────────────────────────────────────────

async function runDigestFlush(): Promise<void> {
  logger.info("Digest flush started")

  let products: Awaited<ReturnType<typeof findProductsByStage>>
  try {
    // Flush for all non-archived products (beta + production)
    products = await findProductsByStage(["beta", "production"])
  } catch (err) {
    logger.error({ err }, "Digest flush: failed to load products — aborting")
    return
  }

  const ns = new NotificationService()
  let flushed = 0
  let failed = 0

  for (const product of products) {
    try {
      await ns.flushDigest(product.product_id)
      flushed++
    } catch (err) {
      logger.warn({ err, productId: product.product_id }, "Digest flush: product flush failed (non-fatal)")
      failed++
    }
  }

  logger.info({ flushed, failed, total: products.length }, "Digest flush complete")
}
