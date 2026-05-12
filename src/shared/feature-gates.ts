// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Feature gating middleware — SLICE-19 / Wave C.
 *
 * Enforces license-tier-based feature access at the API level.
 * Used as Hono middleware: `requireFeature("advanced_analytics")`
 *
 * In development mode (no license), all features are enabled.
 */

import type { MiddlewareHandler } from "hono"
import { isFeatureEnabled } from "../license/validator.js"
import { logger } from "./logger.js"

/**
 * Middleware that checks if a feature is enabled in the current license.
 * Returns 403 if the feature is not available for the current tier.
 */
export function requireFeature(feature: string): MiddlewareHandler {
  return async (c, next) => {
    if (!isFeatureEnabled(feature)) {
      logger.warn({ feature }, "Feature not available for current license tier")
      return c.json({
        error: "Feature not available",
        message: `The "${feature}" feature is not included in your current plan. Please upgrade to access this feature.`,
        feature,
      }, 403)
    }
    await next()
  }
}
