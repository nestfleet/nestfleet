// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * License JWT issuer — generates per-instance license tokens during VPS provisioning.
 *
 * Each customer VPS is self-signed with its own LICENSE_SECRET (generated at provisioning
 * time and stored encrypted in the DB). The same secret is used by validator.ts on the VPS
 * to verify the token — no platform-wide secret is required.
 */

import jwt from "jsonwebtoken"
import type { LicenseTier } from "./types.js"

// ── Feature flags per tier ────────────────────────────────────────────────────

const STARTER_FEATURES = [
  "website_widget_channel",
  "basic_compliance_templates",
]

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  "slack_channel",
  "telegram_channel",
  "gdpr_ai_act_templates",
]

const SCALE_FEATURES = [
  ...GROWTH_FEATURES,
  "discord_channel",
  "internal_api_channel",
  "sso_saml",
  "sso_group_mapping",
]

// ── Product limits per tier ───────────────────────────────────────────────────

const PRODUCT_LIMITS: Record<string, number> = {
  starter: 3,
  growth:  10,
  scale:   999,
}

const TIER_FEATURES: Record<string, string[]> = {
  starter: STARTER_FEATURES,
  growth:  GROWTH_FEATURES,
  scale:   SCALE_FEATURES,
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface IssueLicenseOpts {
  slug:          string   // installation ID / sub
  plan:          string   // "starter" | "growth" | "scale"
  licenseSecret: string   // per-instance LICENSE_SECRET
  customerEmail: string
  /** Override expiry date. Defaults to 1 year from now when omitted. */
  expiresAt?:    Date
}

/**
 * Issue a signed license JWT for a customer VPS.
 *
 * The payload exactly matches the `isRawPayload` type guard in validator.ts.
 * Algorithm is pinned to HS256 (matching the validator's `algorithms: ["HS256"]`).
 *
 * @throws {Error} if `plan` is not one of: starter, growth, scale
 */
export function issueLicenseToken(opts: IssueLicenseOpts): string {
  const { slug, plan, licenseSecret, customerEmail } = opts

  const features = TIER_FEATURES[plan]
  if (features === undefined) {
    throw new Error(`Unknown plan: ${plan}`)
  }

  const productLimit = PRODUCT_LIMITS[plan]!
  const tier = plan as LicenseTier

  const issuedAt  = Math.floor(Date.now() / 1000)
  const expiresAt = opts.expiresAt
    ? Math.floor(opts.expiresAt.getTime() / 1000)
    : issuedAt + 365 * 24 * 60 * 60

  const payload = {
    sub:          slug,
    tier,
    productLimit,
    features,
    issuedAt,
    expiresAt,
    customerId:   slug,
    customerName: customerEmail,
  }

  return jwt.sign(payload, licenseSecret, {
    algorithm: "HS256",
    // Pin exp to the computed expiresAt so custom expiry is honoured exactly.
    expiresIn: expiresAt - issuedAt,
  })
}
