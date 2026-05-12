// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

export type LicenseTier = "trial" | "community" | "starter" | "growth" | "scale" | "enterprise"

export interface LicensePayload {
  sub: string           // installation ID
  tier: LicenseTier
  productLimit: number  // max products
  features: string[]   // feature flags e.g. ["auto_reply", "pr_draft", "telegram"]
  issuedAt: number     // Unix timestamp
  expiresAt: number    // Unix timestamp (0 = never)
  customerId: string
  customerName: string
  maxOutcomeUnitsMonthly: number  // 0 = unlimited
}

export interface LicenseState {
  valid: boolean
  expired: boolean
  payload: LicensePayload | null
  /** Human-readable status for operator console banner */
  statusMessage: string
}
