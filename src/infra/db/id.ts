// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Domain entity ID generation.
 *
 * All IDs follow the pattern: `${prefix}${ulid().toLowerCase()}`
 *
 * ULID is monotonically time-sortable, so TEXT PKs stay naturally ordered
 * by insertion time — index-friendly without a separate created_at sort.
 *
 * Examples:
 *   newId('prod_')  → 'prod_01hs2p...'
 *   newId('case_')  → 'case_01hs2p...'
 *   newId('sig_')   → 'sig_01hs2p...'
 */

import { ulid } from "ulid"
import type postgres from "postgres"

/**
 * Generate a new prefixed, time-sortable ID.
 * @param prefix - e.g. 'prod_', 'sig_', 'conv_', 'case_', 'id_', 'ae_'
 */
export function newId(prefix: string): string {
  return `${prefix}${ulid().toLowerCase()}`
}

/**
 * Cast a plain object to postgres.js's JSONValue type.
 *
 * postgres.js's JSONValue uses readonly keys + recursive value constraints that
 * Record<string, unknown> doesn't satisfy under strict TS. All domain JSON fields
 * hold only JSON-serializable data, so the cast is safe at runtime.
 */
export function pgJson(value: Record<string, unknown>): Parameters<postgres.Sql["json"]>[0] {
  return value as unknown as Parameters<postgres.Sql["json"]>[0]
}
