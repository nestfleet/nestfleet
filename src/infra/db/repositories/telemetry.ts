// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Telemetry pings repository — NF-OPS-01 Phase 2.
 *
 * All queries are parameterised (postgres.js tagged templates).
 * No string interpolation is used.
 */

import { getDb } from "../client.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TelemetryPingInsert {
  instanceId: string
  version:    string
  payload?:   Record<string, unknown>
}

export interface TelemetryPingRow {
  id:          string
  instance_id: string
  version:     string
  reported_at: string   // ISO string from DB
  payload:     Record<string, unknown>
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Inserts one telemetry ping row. id and reported_at are DB-generated. */
export async function insertTelemetryPing(data: TelemetryPingInsert): Promise<void> {
  const db = getDb()
  // Cast through unknown: postgres.js db.json() accepts any serialisable value
  // but its type signature requires JSONValue — the cast is safe here.
  const payload = db.json((data.payload ?? {}) as unknown as import("postgres").JSONValue)
  await db`
    INSERT INTO telemetry_pings (instance_id, version, payload)
    VALUES (${data.instanceId}, ${data.version}, ${payload})
  `
}

/** Returns all rows WHERE reported_at >= since, ordered by reported_at DESC. */
export async function getRecentTelemetry(since: Date): Promise<TelemetryPingRow[]> {
  const db = getDb()
  return db<TelemetryPingRow[]>`
    SELECT id, instance_id, version, reported_at::text AS reported_at, payload
    FROM telemetry_pings
    WHERE reported_at >= ${since}
    ORDER BY reported_at DESC
  `
}

/** Returns COUNT(DISTINCT instance_id) WHERE reported_at >= since. */
export async function countDistinctInstances(since: Date): Promise<number> {
  const db = getDb()
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(DISTINCT instance_id)::text AS count
    FROM telemetry_pings
    WHERE reported_at >= ${since}
  `
  return parseInt(row?.count ?? "0", 10)
}
