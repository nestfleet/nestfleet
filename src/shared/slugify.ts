// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Derives a URL-safe slug from a product name.
 *
 * Rules:
 *   - Lowercase
 *   - Non-alphanumeric runs → single hyphen
 *   - Leading / trailing hyphens stripped
 *   - Truncated to 60 characters
 *
 * Examples:
 *   slugify("Acme Corp")    → "acme-corp"
 *   slugify("Acme")         → "acme"
 *   slugify("My Product 2.0!") → "my-product-2-0"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * Ensures a slug is unique within a set of existing slugs.
 * Appends -2, -3, etc. until unique.
 */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
