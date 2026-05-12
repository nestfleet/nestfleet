// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * NF-PIVOT-02: Simplified CloudConnection.
 *
 * PlatformCloud SDK dependency removed. The only cloud call that remains is
 * fetchUpdateManifest() — a plain GET to NESTFLEET_CLOUD_URL.
 *
 * Removed (PC coupling):
 *   - PlanLockLoop / HeartbeatSender imports
 *   - refreshLicense() / refreshFromCloud()
 *   - pushCapabilities() (PATCH to PlatformCloud)
 *   - reportOuUsage() (HeartbeatSender telemetry)
 *   - WritePlanFn / writePlan callback
 *
 * Kept:
 *   - fetchUpdateManifest() — plain fetch, fire-and-forget, never throws
 *   - startBackgroundSync() — calls fetchUpdateManifest once on startup
 *   - stop() — no-op stub kept for call-site compatibility
 */

import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

const APP_VERSION = "0.1.0"

export interface UpdateManifest {
  latestVersion: string
  releaseNotes: string
  updateUrl: string
  securityAlert: boolean
  securityMessage?: string
}

export class CloudConnection {
  /**
   * Fetches the update manifest from NestFleet Cloud.
   * Never throws — returns null on any error (network, timeout, non-200).
   */
  async fetchUpdateManifest(): Promise<UpdateManifest | null> {
    const cloudUrl = config.NESTFLEET_CLOUD_URL
    const url = `${cloudUrl}/api/v1/updates/manifest?version=${APP_VERSION}`

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (!response.ok) {
        logger.warn({ status: response.status, url }, "Cloud manifest fetch returned non-200 status")
        return null
      }

      const raw: unknown = await response.json()
      const manifest = _parseManifest(raw)
      if (manifest === null) {
        logger.warn({ url }, "Cloud manifest response has unexpected shape")
        return null
      }

      if (manifest.securityAlert) {
        logger.warn({ securityMessage: manifest.securityMessage }, "SECURITY ALERT from NestFleet Cloud")
      }
      return manifest
    } catch (err) {
      logger.warn({ err, url }, "Cloud manifest fetch failed — skipping")
      return null
    }
  }

  /**
   * Fire-and-forget startup: fetches the update manifest once.
   * Never throws. Additional background work (billing, telemetry)
   * will be added here once the legal entity is registered (BILLING_ENABLED gate).
   */
  async startBackgroundSync(): Promise<void> {
    this.fetchUpdateManifest().catch((err: unknown) => {
      logger.warn({ err }, "Background sync manifest fetch error (non-fatal)")
    })
  }

  /** No-op — kept for call-site compatibility during refactor. */
  stop(): void {
    // Nothing to stop — no background timers in community build
  }
}

/**
 * Narrowly validates the raw JSON response into UpdateManifest.
 * Returns null if the shape is unexpected.
 */
function _parseManifest(raw: unknown): UpdateManifest | null {
  if (typeof raw !== "object" || raw === null) return null
  const obj = raw as Record<string, unknown>

  if (
    typeof obj["latestVersion"] !== "string" ||
    typeof obj["releaseNotes"] !== "string" ||
    typeof obj["updateUrl"] !== "string" ||
    typeof obj["securityAlert"] !== "boolean"
  ) {
    return null
  }

  const base: UpdateManifest = {
    latestVersion: obj["latestVersion"],
    releaseNotes: obj["releaseNotes"],
    updateUrl: obj["updateUrl"],
    securityAlert: obj["securityAlert"],
  }

  if (typeof obj["securityMessage"] === "string") {
    return { ...base, securityMessage: obj["securityMessage"] }
  }

  return base
}
