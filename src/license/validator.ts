// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

import { readFileSync, existsSync } from "node:fs"
import jwt from "jsonwebtoken"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"
import type { LicenseState, LicenseTier, LicensePayload } from "./types.js"

// Module-level singleton — evaluated once at startup via validateLicense()
let _state: LicenseState | null = null

/**
 * Narrow type guard for the raw decoded JWT object.
 * We assert all required fields are present before constructing LicensePayload.
 */
function isRawPayload(
  v: unknown,
): v is {
  sub: string
  tier: string
  productLimit: number
  features: string[]
  issuedAt: number
  expiresAt: number
  customerId: string
  customerName: string
  max_outcome_units_monthly?: number
  // NF-SEC-02 (PC-SEC-22): standard JWT claims — present in new JWTs, absent in legacy
  exp?: number
  iat?: number
  nbf?: number
  jti?: string
} {
  if (typeof v !== "object" || v === null) return false
  const obj = v as Record<string, unknown>
  // Standard JWT claims are optional (legacy JWTs lack them) but must have correct types if present
  if (obj["exp"] !== undefined && typeof obj["exp"] !== "number") return false
  if (obj["iat"] !== undefined && typeof obj["iat"] !== "number") return false
  if (obj["nbf"] !== undefined && typeof obj["nbf"] !== "number") return false
  if (obj["jti"] !== undefined && typeof obj["jti"] !== "string") return false
  return (
    typeof obj["sub"] === "string" &&
    typeof obj["tier"] === "string" &&
    typeof obj["productLimit"] === "number" &&
    Array.isArray(obj["features"]) &&
    (obj["features"] as unknown[]).every((f) => typeof f === "string") &&
    typeof obj["issuedAt"] === "number" &&
    typeof obj["expiresAt"] === "number" &&
    typeof obj["customerId"] === "string" &&
    typeof obj["customerName"] === "string" &&
    (obj["max_outcome_units_monthly"] === undefined ||
      typeof obj["max_outcome_units_monthly"] === "number")
  )
}

const VALID_TIERS: ReadonlySet<string> = new Set<LicenseTier>([
  "trial",
  "community",
  "starter",
  "growth",
  "scale",
])

function isLicenseTier(v: string): v is LicenseTier {
  return VALID_TIERS.has(v)
}

export function validateLicense(): LicenseState {
  if (_state !== null) return _state

  const filePath = config.LICENSE_FILE_PATH
  const secret = config.LICENSE_SECRET

  // No license configured — development mode
  if (filePath === undefined || filePath === "") {
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage:
        "No license file configured — running in development mode",
    }
    return _state
  }

  // License file path configured but no secret — misconfigured
  if (!secret) {
    const msg = "LICENSE_FILE_PATH is set but LICENSE_SECRET is not configured"
    logger.error(msg)
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage: `${msg} — running in community mode`,
    }
    return _state
  }

  // License path configured but file not found
  if (!existsSync(filePath)) {
    const msg = `License file not found at path: ${filePath}`
    logger.error({ filePath }, msg)
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage: `${msg} — running in community mode`,
    }
    return _state
  }

  let token: string
  try {
    token = readFileSync(filePath, "utf-8").trim()
  } catch (err) {
    logger.error({ err, filePath }, "Failed to read license file")
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage: "Failed to read license file — running in community mode",
    }
    return _state
  }

  // Verify JWT signature and enforce exp when present.
  // NF-SEC-02 Phase C: ignoreExpiration removed — jwt.verify() now enforces exp.
  // TokenExpiredError is caught separately to preserve graceful degradation
  // (valid=true, expired=true) for expired-but-valid-signature tokens.
  // SEC-C2: Explicitly pin to HS256 to prevent alg:none and asymmetric-key confusion attacks.
  let decoded: unknown
  let jwtExpired = false
  try {
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] })
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // Signature is valid — token is simply past its exp. Use jwt.decode() to
      // extract the payload and let manual expiry handling apply graceful degradation.
      jwtExpired = true
      decoded = jwt.decode(token)
    } else {
      logger.error({ err }, "License JWT verification failed — invalid signature or malformed token")
      _state = {
        valid: false,
        expired: false,
        payload: null,
        statusMessage: "Invalid license token — running in community mode",
      }
      return _state
    }
  }

  if (!isRawPayload(decoded)) {
    logger.error({ decoded }, "License JWT payload is missing required fields")
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage: "Malformed license payload — running in community mode",
    }
    return _state
  }

  const tier = decoded.tier
  if (!isLicenseTier(tier)) {
    logger.error({ tier }, "License JWT contains unknown tier")
    _state = {
      valid: false,
      expired: false,
      payload: null,
      statusMessage: `Unknown license tier "${tier}" — running in community mode`,
    }
    return _state
  }

  const payload: LicensePayload = {
    sub: decoded.sub,
    tier,
    productLimit: decoded.productLimit,
    features: decoded.features,
    // NF-SEC-02 Phase B: prefer standard JWT claims (exp/iat) over legacy custom fields.
    // Falls back to custom fields for legacy JWTs issued before PC-SEC-22.
    issuedAt:  decoded.iat      ?? decoded.issuedAt,
    expiresAt: decoded.exp      ?? decoded.expiresAt,
    customerId: decoded.customerId,
    customerName: decoded.customerName,
    maxOutcomeUnitsMonthly: decoded.max_outcome_units_monthly ?? 0,
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  // NF-SEC-02 Phase C: jwtExpired flag set when jwt.verify() threw TokenExpiredError.
  const isExpired =
    jwtExpired || (payload.expiresAt !== 0 && payload.expiresAt < nowSeconds)

  if (isExpired) {
    _state = {
      valid: true,
      expired: true,
      payload,
      statusMessage:
        "License expired — update channel disabled, local features continue",
    }
    return _state
  }

  _state = {
    valid: true,
    expired: false,
    payload,
    statusMessage: "License valid",
  }
  return _state
}

/**
 * Returns true if the feature is enabled.
 * - Dev mode (no license): all features enabled.
 * - Trial tier: all features enabled for the first 30 days.
 * - Otherwise: checks payload.features array.
 */
export function isFeatureEnabled(feature: string): boolean {
  const state = _state ?? validateLicense()

  // No license — dev mode, everything enabled
  if (!state.valid || state.payload === null) return true

  const { payload } = state

  // Trial tier: Starter feature set for 30 days (Pattern B — no full-access trial)
  // Features are still checked against payload.features (issued as Starter set by the license issuer)

  return payload.features.includes(feature)
}

/**
 * Returns the effective license tier, or null in dev mode.
 *
 * BIL-06: A trial that has passed its expiresAt date degrades to "community"
 * rather than remaining on "trial" (which carries Starter-tier features).
 */
export function getLicenseTier(): LicenseTier | null {
  const state = _state ?? validateLicense()
  if (!state.payload) return null
  if (state.payload.tier === "trial" && state.expired) return "community"
  return state.payload.tier
}

/**
 * Returns the full license state for status display and enforcement.
 */
export function getLicenseState(): LicenseState | null {
  return _state ?? validateLicense()
}

/**
 * Reset all cached state — for testing only.
 */
export function _resetLicenseState(): void {
  _state = null
}
