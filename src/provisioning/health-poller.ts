/**
 * Health poller — FEAT-001.
 *
 * Polls GET https://{slug}.{baseDomain}/health until the VPS is ready.
 * Writes last_health_check_at and last_health_status to the provisionings table
 * on each attempt so ops can see progress in real time.
 *
 * Timing:
 *   - 60s initial delay (DNS TTL propagation before Cloudflare serves the record)
 *   - 15s between attempts
 *   - 30 max attempts → 7.5 min total polling window
 *   - Caddy ACME adds ~30–60s on the first HTTPS request — covered by initial delay
 */

import { logger } from "../shared/logger.js"
import { updateProvisioning } from "../infra/db/repositories/provisionings.js"

export interface PollOpts {
  provisioningId: string
  slug:           string
  baseDomain:     string
  maxAttempts?:   number   // default: 30
  intervalMs?:    number   // default: 15_000
  initialDelayMs?: number  // default: 60_000
}

export type PollResult = "ok" | "timeout"

/**
 * Poll the customer VPS /health endpoint until it responds healthy or times out.
 * Updates the provisionings row after each attempt.
 */
export async function pollUntilHealthy(opts: PollOpts): Promise<PollResult> {
  const {
    provisioningId,
    slug,
    baseDomain,
    maxAttempts    = 30,
    intervalMs     = 15_000,
    initialDelayMs = 60_000,
  } = opts

  const healthUrl = `https://${slug}.${baseDomain}/health`

  logger.info(
    { slug, healthUrl, initialDelayMs, maxAttempts, intervalMs },
    "Health poller: waiting for DNS propagation before first poll",
  )

  await sleep(initialDelayMs)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info({ slug, attempt, maxAttempts, healthUrl }, "Health poller: polling")

    let healthy = false
    let healthStatus: "ok" | "degraded" | "unreachable" = "unreachable"

    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(10_000),  // 10s per request timeout
      })

      if (res.ok) {
        const body = await res.json() as { status?: string; db?: string }
        if (body.status === "ok" && body.db === "ok") {
          healthy      = true
          healthStatus = "ok"
        } else {
          healthStatus = "degraded"
          logger.info({ slug, attempt, body }, "Health poller: degraded response")
        }
      } else {
        logger.info({ slug, attempt, status: res.status }, "Health poller: non-200 response")
      }
    } catch (err) {
      // Network error, DNS not yet propagated, TLS challenge in progress — all expected early on
      logger.debug({ slug, attempt, err }, "Health poller: fetch error (expected during startup)")
    }

    // Write progress to DB after every attempt
    await updateProvisioning(provisioningId, {
      last_health_check_at: new Date(),
      last_health_status:   healthStatus,
    }).catch((dbErr) => {
      logger.warn({ dbErr, slug, attempt }, "Health poller: DB update failed (non-fatal)")
    })

    if (healthy) {
      logger.info({ slug, attempt }, "Health poller: VPS is healthy")
      return "ok"
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs)
    }
  }

  logger.warn({ slug, maxAttempts }, "Health poller: timeout — VPS did not become healthy")
  return "timeout"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
