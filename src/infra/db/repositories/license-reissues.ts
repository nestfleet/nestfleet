/**
 * license_reissues repository — FEAT-012.
 *
 * Audit table for every license reissue attempt (success or failure).
 */

import { getDb } from "../client.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LicenseReissueRow {
  id:                  string
  provisioning_id:     string
  performed_by:        string
  previous_tier:       string
  new_tier:            string
  previous_expires_at: Date | null
  new_expires_at:      Date
  reason:              string
  status:              "pending" | "complete" | "failed"
  failed_reason:       string | null
  pending_jwt:         string | null
  created_at:          Date
  completed_at:        Date | null
}

export type LicenseReissuePatch = Partial<Pick<
  LicenseReissueRow,
  | "status"
  | "failed_reason"
  | "pending_jwt"
  | "completed_at"
>>

// ── Queries ───────────────────────────────────────────────────────────────────

export async function createLicenseReissue(data: {
  provisioning_id:     string
  performed_by:        string
  previous_tier:       string
  new_tier:            string
  previous_expires_at: Date | null
  new_expires_at:      Date
  reason:              string
}): Promise<LicenseReissueRow> {
  const db = getDb()
  const [row] = await db<LicenseReissueRow[]>`
    INSERT INTO license_reissues
      (provisioning_id, performed_by, previous_tier, new_tier,
       previous_expires_at, new_expires_at, reason)
    VALUES
      (${data.provisioning_id}, ${data.performed_by}, ${data.previous_tier},
       ${data.new_tier}, ${data.previous_expires_at ?? null}, ${data.new_expires_at},
       ${data.reason})
    RETURNING *
  `
  if (!row) throw new Error("createLicenseReissue: insert returned no row")
  return row
}

export async function findLicenseReissueById(id: string): Promise<LicenseReissueRow | null> {
  const db = getDb()
  const [row] = await db<LicenseReissueRow[]>`
    SELECT * FROM license_reissues WHERE id = ${id}
  `
  return row ?? null
}

export async function updateLicenseReissue(
  id:    string,
  patch: LicenseReissuePatch,
): Promise<void> {
  const db = getDb()
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) fields[k] = v
  }
  await db`
    UPDATE license_reissues
    SET ${db(fields)}
    WHERE id = ${id}
  `
}

export async function listLicenseReissues(
  provisioningId: string,
  limit = 10,
): Promise<LicenseReissueRow[]> {
  const db = getDb()
  return db<LicenseReissueRow[]>`
    SELECT * FROM license_reissues
    WHERE  provisioning_id = ${provisioningId}
    ORDER  BY created_at DESC
    LIMIT  ${limit}
  `
}

export async function findFailedPendingJwt(
  reissueId: string,
): Promise<string | null> {
  const db = getDb()
  const [row] = await db<{ pending_jwt: string | null }[]>`
    SELECT pending_jwt FROM license_reissues
    WHERE  id = ${reissueId} AND status = 'failed' AND pending_jwt IS NOT NULL
  `
  return row?.pending_jwt ?? null
}

export async function clearPendingJwt(reissueId: string): Promise<void> {
  const db = getDb()
  await db`
    UPDATE license_reissues SET pending_jwt = NULL WHERE id = ${reissueId}
  `
}
