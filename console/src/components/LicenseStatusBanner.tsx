// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * LicenseStatusBanner — NF-PIVOT: no-op.
 *
 * PlatformCloud cloud-status states (grace, read_only, revoked, offline) have
 * been removed. The banner will be re-implemented when direct NF billing lands
 * (BILLING_ENABLED gate). Until then this component renders nothing.
 */

export function LicenseStatusBanner() {
  return null;
}
