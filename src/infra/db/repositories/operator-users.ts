// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * OperatorUsers repository — SPIKE-07.
 * Stores NestFleet operator credentials, roles, and product access.
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const OperatorUserRowSchema = z.object({
  user_id:       z.string(),
  email:         z.string().email(),
  password_hash: z.string(),
  display_name:  z.string().nullable().optional(),
  roles:         z.array(z.string()),
  product_ids:   z.array(z.string()),
  is_system:     z.boolean().default(false),
  created_at:    z.date(),
  updated_at:    z.date(),
})
export type OperatorUserRow = z.infer<typeof OperatorUserRowSchema>

export const OperatorUserInsertSchema = z.object({
  email:         z.string().email(),
  password_hash: z.string(),
  display_name:  z.string().optional(),
  roles:         z.array(z.string()).optional(),
  product_ids:   z.array(z.string()).optional(),
})
export type OperatorUserInsert = z.infer<typeof OperatorUserInsertSchema>

export const OperatorUserUpdateSchema = z.object({
  email:         z.string().email().optional(),
  password_hash: z.string().optional(),
  display_name:  z.string().nullable().optional(),
  roles:         z.array(z.string()).optional(),
  product_ids:   z.array(z.string()).optional(),
})
export type OperatorUserUpdate = z.infer<typeof OperatorUserUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

export async function listOperatorUsers(): Promise<OperatorUserRow[]> {
  const db = getDb()
  const rows = await db<OperatorUserRow[]>`
    SELECT * FROM operator_users ORDER BY created_at ASC
  `
  return rows.map((r) => OperatorUserRowSchema.parse(r))
}

export async function createOperatorUser(input: OperatorUserInsert): Promise<OperatorUserRow> {
  const db = getDb()
  const userId = newId("user_")
  const v = OperatorUserInsertSchema.parse(input)

  const [row] = await db<OperatorUserRow[]>`
    INSERT INTO operator_users (
      user_id, email, password_hash, display_name, roles, product_ids
    ) VALUES (
      ${userId},
      ${v.email},
      ${v.password_hash},
      ${v.display_name ?? null},
      ${db.array(v.roles ?? [])},
      ${db.array(v.product_ids ?? [])}
    )
    RETURNING *
  `
  return OperatorUserRowSchema.parse(row)
}

export async function findOperatorUserById(userId: string): Promise<OperatorUserRow | null> {
  const db = getDb()
  const [row] = await db<OperatorUserRow[]>`
    SELECT * FROM operator_users WHERE user_id = ${userId}
  `
  return row ? OperatorUserRowSchema.parse(row) : null
}

export async function findOperatorUserByEmail(email: string): Promise<OperatorUserRow | null> {
  const db = getDb()
  const [row] = await db<OperatorUserRow[]>`
    SELECT * FROM operator_users WHERE email = ${email}
  `
  return row ? OperatorUserRowSchema.parse(row) : null
}

export async function updateOperatorUser(
  userId: string,
  input: OperatorUserUpdate,
): Promise<OperatorUserRow | null> {
  const db = getDb()
  const v = OperatorUserUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.email !== undefined)         updates["email"]         = v.email
  if (v.password_hash !== undefined) updates["password_hash"] = v.password_hash
  if (v.display_name !== undefined)  updates["display_name"]  = v.display_name
  if (v.roles !== undefined)         updates["roles"]         = db.array(v.roles)
  if (v.product_ids !== undefined)   updates["product_ids"]   = db.array(v.product_ids)

  if (Object.keys(updates).length === 0) return findOperatorUserById(userId)

  const [row] = await db<OperatorUserRow[]>`
    UPDATE operator_users
    SET ${db(updates)}
    WHERE user_id = ${userId}
    RETURNING *
  `
  return row ? OperatorUserRowSchema.parse(row) : null
}

export async function deleteOperatorUser(userId: string): Promise<boolean> {
  const db = getDb()
  const rows = await db<{ user_id: string }[]>`
    DELETE FROM operator_users WHERE user_id = ${userId} RETURNING user_id
  `
  return rows.length > 0
}
