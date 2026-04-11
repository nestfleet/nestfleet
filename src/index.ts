// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * NestFleet entry point.
 *
 * Import order matters:
 * 1. Telemetry MUST be first — patches libraries before they are imported
 * 2. Config (already loaded as side-effect of telemetry import chain)
 * 3. Everything else
 */

import { initTelemetry, shutdownTelemetry } from "./shared/telemetry.js"

// Initialise OTel before any other imports
initTelemetry()

import { serve } from "@hono/node-server"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { config } from "./shared/config.js"
import { logger } from "./shared/logger.js"
import { validateLicense, CloudConnection } from "./license/index.js"
import { runMigrations } from "./infra/db/migrate.js"
import { closeDb } from "./infra/db/client.js"
import { app } from "./api/index.js"
import { frontlineWorker } from "./workers/frontline-worker.js"
import { stewardWorker } from "./workers/steward-worker.js"
import { changePrepWorker } from "./workers/change-prep-worker.js"
import { autoReplyWorker } from "./workers/auto-reply-worker.js"
import { prDraftPrepWorker } from "./workers/pr-draft-prep-worker.js"
import { outageRoutingWorker } from "./workers/outage-routing-worker.js"
import { registerDigestCron } from "./workers/digest-cron.js"
import { registerProvisioningWorker } from "./fleet/workers/provisioning-worker.js"
import { registerDeprovisionScheduler } from "./fleet/workers/deprovision-scheduler.js"
import { registerFleetHealthWorker } from "./fleet/workers/fleet-health-worker.js"
import { registerLicenseReissueWorker } from "./fleet/workers/license-reissue-worker.js"
import { verifyOperatorKey, isFleetOperatorAuthorized } from "./fleet/operator-key.js"
import { registerDeadLetterHandler } from "./infra/queue/boss.js"

async function main(): Promise<void> {
  logger.info({ version: "0.1.0", env: config.NODE_ENV }, "NestFleet starting")

  // Validate license — community mode (no license) = all features enabled
  const licenseState = validateLicense()
  logger.info(
    { tier: licenseState.payload?.tier ?? "community", statusMessage: licenseState.statusMessage },
    "License state",
  )

  // Run database migrations on startup
  try {
    await runMigrations()
    logger.info("Database migrations complete")
  } catch (err) {
    logger.error({ err }, "Database migration failed — aborting startup")
    process.exit(1)
  }

  // Register agent workers — parallel registration cuts startup time
  try {
    const workerRegistrations: Promise<void>[] = [
      frontlineWorker.register(),
      stewardWorker.register(),
      changePrepWorker.register(),
      autoReplyWorker.register(),
      prDraftPrepWorker.register(),
      outageRoutingWorker.register(),
      registerDigestCron(),
    ]

    // Fleet provisioning workers — gated on NESTFLEET_OPERATOR_KEY (FEAT-018).
    // Skipped in test environment. In community deployments (no operator key), these
    // workers are not registered and fleet routes return 404 (PROVISIONING_ENABLED=false).
    if (config.PROVISIONING_ENABLED && config.NODE_ENV !== "test") {
      const operatorKey = process.env["NESTFLEET_OPERATOR_KEY"]
      if (operatorKey) {
        try {
          await verifyOperatorKey(operatorKey)
          logger.info("Fleet operator key verified — fleet workers enabled")
        } catch (err) {
          logger.error({ err }, "Fleet operator key invalid — fleet workers disabled")
        }
      } else {
        logger.warn("NESTFLEET_OPERATOR_KEY not set — fleet workers disabled")
      }
    }

    if (config.PROVISIONING_ENABLED && (config.NODE_ENV === "test" || isFleetOperatorAuthorized())) {
      workerRegistrations.push(registerProvisioningWorker())
      workerRegistrations.push(registerDeprovisionScheduler())
      workerRegistrations.push(registerFleetHealthWorker())
      workerRegistrations.push(registerLicenseReissueWorker())
    }

    await Promise.all(workerRegistrations)
    logger.info("Agent workers registered")

    // Register dead-letter queue handler after all agent queues are created (QE-02).
    // Logs dead-lettered jobs at error level for alerting and observability.
    await registerDeadLetterHandler()
  } catch (err) {
    logger.error({ err }, "Agent worker registration failed — aborting startup")
    process.exit(1)
  }

  // Opt-in startup telemetry ping — non-fatal, fire-and-forget (NF-OPS-01 Phase 2)
  if (config.TELEMETRY_OPT_IN) {
    const { version } = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string }
    fetch(`${config.NESTFLEET_CLOUD_URL}/api/v1/telemetry/ping`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        instanceId: config.INSTANCE_ID ?? "unknown",
        version,
        payload:    { nodeEnv: config.NODE_ENV },
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {/* non-fatal */})
  }

  // Start HTTP server
  const server = serve(
    { fetch: app.fetch, port: config.PORT },
    () => {
      logger.info({ port: config.PORT }, `NestFleet listening`)
    },
  )

  // NF-PIVOT: Start update manifest background check — always runs, no license gate.
  // Only fetches from NESTFLEET_CLOUD_URL (no PlatformCloud dependency).
  const cloud = new CloudConnection()
  cloud.startBackgroundSync().catch((err: unknown) => {
    logger.warn({ err }, "Background sync startup error (non-fatal)")
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received")
    server.close(async () => {
      await closeDb()
      await shutdownTelemetry()
      logger.info("Shutdown complete")
      process.exit(0)
    })
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

// Only bind port when run directly, not when imported by tests
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    logger.error({ err }, "Fatal startup error")
    process.exit(1)
  })
}

export { app }
