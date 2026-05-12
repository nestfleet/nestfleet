// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Identities repository — SLICE-01.
 * Represents end users, operators, leads, and system actors known to NestFleet.
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const IdentityTypeSchema = z.enum(["end_user", "operator", "lead", "system"])
export type IdentityType = z.infer<typeof IdentityTypeSchema>

export const IdentityRowSchema = z.object({
  identity_id:      z.string(),
  product_id:       z.string(),
  type:             IdentityTypeSchema,
  display_name:     z.string().nullable(),
  email_addresses:  z.array(z.string()),
  telegram_handles: z.array(z.string()),
  external_refs:    z.record(z.unknown()),
  created_at:       z.date(),
  updated_at:       z.date(),
})
export type IdentityRow = z.infer<typeof IdentityRowSchema>

export const IdentityInsertSchema = z.object({
  product_id:       z.string(),
  type:             IdentityTypeSchema,
  display_name:     z.string().optional(),
  email_addresses:  z.array(z.string()).optional(),
  telegram_handles: z.array(z.string()).optional(),
  external_refs:    z.record(z.unknown()).optional(),
})
export type IdentityInsert = z.infer<typeof IdentityInsertSchema>

export const IdentityUpdateSchema = z.object({
  display_name:     z.string().optional(),
  email_addresses:  z.array(z.string()).optional(),
  telegram_handles: z.array(z.string()).optional(),
  external_refs:    z.record(z.unknown()).optional(),
})
export type IdentityUpdate = z.infer<typeof IdentityUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

export async function createIdentity(input: IdentityInsert): Promise<IdentityRow> {
  const db = getDb()
  const identityId = newId("id_")
  const v = IdentityInsertSchema.parse(input)

  const [row] = await db<IdentityRow[]>`
    INSERT INTO identities (
      identity_id, product_id, type,
      display_name, email_addresses, telegram_handles, external_refs
    ) VALUES (
      ${identityId},
      ${v.product_id},
      ${v.type},
      ${v.display_name ?? null},
      ${db.array(v.email_addresses ?? [])},
      ${db.array(v.telegram_handles ?? [])},
      ${db.json(pgJson(v.external_refs ?? {}))}
    )
    RETURNING *
  `
  return IdentityRowSchema.parse(row)
}

export async function findIdentityById(identityId: string): Promise<IdentityRow | null> {
  const db = getDb()
  const [row] = await db<IdentityRow[]>`
    SELECT * FROM identities WHERE identity_id = ${identityId}
  `
  return row ? IdentityRowSchema.parse(row) : null
}

/**
 * Find an identity by email within a product scope.
 * Used for deduplication on inbound signals.
 */
export async function findIdentityByEmail(
  productId: string,
  email: string,
): Promise<IdentityRow | null> {
  const db = getDb()
  const [row] = await db<IdentityRow[]>`
    SELECT * FROM identities
    WHERE product_id = ${productId}
      AND ${email} = ANY(email_addresses)
    LIMIT 1
  `
  return row ? IdentityRowSchema.parse(row) : null
}

/**
 * BEF-20: Find all identities across ALL products that share a given email.
 * Used to surface cross-product lineage links when the same person has cases
 * in multiple products.
 */
export async function findIdentitiesByEmailCrossProduct(email: string): Promise<IdentityRow[]> {
  const db = getDb()
  const rows = await db<IdentityRow[]>`
    SELECT * FROM identities
    WHERE ${email} = ANY(email_addresses)
  `
  return rows.map((r) => IdentityRowSchema.parse(r))
}

/**
 * FEAT-003: Find an identity by an external reference key within a product scope.
 * external_refs is stored as a JSONB map of { [senderRef]: true } — the `?`
 * operator checks for key existence.
 */
export async function findIdentityByExternalRef(
  productId: string,
  externalRef: string,
): Promise<IdentityRow | null> {
  const db = getDb()
  const [row] = await db<IdentityRow[]>`
    SELECT * FROM identities
    WHERE product_id = ${productId}
      AND external_refs ? ${externalRef}
    LIMIT 1
  `
  return row ? IdentityRowSchema.parse(row) : null
}

export async function updateIdentity(
  identityId: string,
  input: IdentityUpdate,
): Promise<IdentityRow | null> {
  const db = getDb()
  const v = IdentityUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.display_name !== undefined)     updates["display_name"]     = v.display_name
  if (v.email_addresses !== undefined)  updates["email_addresses"]  = db.array(v.email_addresses)
  if (v.telegram_handles !== undefined) updates["telegram_handles"] = db.array(v.telegram_handles)
  if (v.external_refs !== undefined)    updates["external_refs"]    = db.json(pgJson(v.external_refs))

  if (Object.keys(updates).length === 0) return findIdentityById(identityId)

  const [row] = await db<IdentityRow[]>`
    UPDATE identities
    SET ${db(updates)}
    WHERE identity_id = ${identityId}
    RETURNING *
  `
  return row ? IdentityRowSchema.parse(row) : null
}
