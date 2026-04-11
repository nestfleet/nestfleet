// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial
/**
 * Slug validation and reservation — FEAT-001.
 *
 * Slugs become customer subdomains: {slug}.nestfleet.dev
 * Rules: lowercase alphanumeric + hyphens, 3–40 chars, no leading/trailing hyphen.
 * Reserved slugs are blocked permanently. Deprovisioned slugs are not reissued
 * (prevents DNS caching confusion from old → new tenant on same subdomain).
 */

import { slugHasSignupIntent, findProvisioningBySlug } from "../../infra/db/repositories/provisionings.js"

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export const RESERVED_SLUGS = new Set([
  "www", "api", "app", "mail", "hub", "static", "cdn", "status", "ops",
  "admin", "support", "help", "billing", "console", "dashboard", "docs",
  "blog", "about", "contact", "login", "signup", "register", "nestfleet",
  "health", "owner", "internal", "system", "root", "ns", "mx", "smtp",
  "pop", "imap", "ftp", "ssh", "git", "dev", "staging", "prod", "demo",
])

export type SlugValidationResult =
  | { ok: true }
  | { ok: false; error: string }

/** Validate format only (no DB call — safe to call frequently). */
export function validateSlugFormat(slug: string): SlugValidationResult {
  if (!slug || typeof slug !== "string") {
    return { ok: false, error: "Slug is required" }
  }
  if (slug.length < 3 || slug.length > 40) {
    return { ok: false, error: "Slug must be between 3 and 40 characters" }
  }
  if (!SLUG_REGEX.test(slug)) {
    return { ok: false, error: "Slug must contain only lowercase letters, numbers, and hyphens, and must not start or end with a hyphen" }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: `'${slug}' is a reserved name and cannot be used` }
  }
  return { ok: true }
}

/** Full validation including DB uniqueness check. */
export async function validateAndCheckSlug(slug: string): Promise<SlugValidationResult> {
  const formatResult = validateSlugFormat(slug)
  if (!formatResult.ok) return formatResult

  // Check provisionings table (includes deprovisioned — slugs are never reissued)
  const existing = await findProvisioningBySlug(slug)
  if (existing) {
    return { ok: false, error: `'${slug}' is already taken` }
  }

  // Check signup_intents (pending payment — slug is reserved once checkout starts)
  const hasIntent = await slugHasSignupIntent(slug)
  if (hasIntent) {
    return { ok: false, error: `'${slug}' is already taken` }
  }

  return { ok: true }
}
