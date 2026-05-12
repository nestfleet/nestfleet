// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * GitHub webhook signature validator — SPIKE-04.
 *
 * Validates X-Hub-Signature-256 header using HMAC-SHA256 and timing-safe comparison.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Validates a GitHub webhook payload signature.
 *
 * @param body      Raw request body string (before any JSON parsing)
 * @param signature Value of the X-Hub-Signature-256 header (format: "sha256=<hex>")
 * @param secret    Webhook secret configured in GitHub
 * @returns true if the signature is valid, false otherwise
 */
export function validateGitHubWebhook(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

  // Both buffers must be the same length for timingSafeEqual
  if (signature.length !== expected.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
