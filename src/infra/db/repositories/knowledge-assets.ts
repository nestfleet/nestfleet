// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Knowledge Assets repository — SLICE-24.
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId } from "../id.js"

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const KnowledgeAssetTypeSchema = z.enum(["faq", "known_issue", "runbook_update", "docs_update"])
export const KnowledgeAssetStatusSchema = z.enum(["proposed", "approved", "rejected", "published"])

export const KnowledgeAssetRowSchema = z.object({
  asset_id:     z.string(),
  product_id:   z.string(),
  case_id:      z.string(),
  asset_type:   KnowledgeAssetTypeSchema,
  status:       KnowledgeAssetStatusSchema,
  title:        z.string(),
  content:      z.string(),
  source_refs:  z.unknown().default([]),
  confidence:   z.number().default(0),
  review_note:  z.string().nullable().optional(),
  reviewed_by:  z.string().nullable().optional(),
  reviewed_at:  z.date().nullable().optional(),
  published_at: z.date().nullable().optional(),
  created_at:   z.date(),
  updated_at:   z.date(),
})

export type KnowledgeAssetRow = z.infer<typeof KnowledgeAssetRowSchema>

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateKnowledgeAssetInput {
  product_id: string
  case_id: string
  asset_type: z.infer<typeof KnowledgeAssetTypeSchema>
  title: string
  content: string
  confidence?: number
  source_refs?: string[]
}

export async function createKnowledgeAsset(input: CreateKnowledgeAssetInput): Promise<KnowledgeAssetRow> {
  const db = getDb()
  const assetId = newId("ka_")
  const sourceRefs = JSON.stringify(input.source_refs ?? [])

  const [row] = await db<KnowledgeAssetRow[]>`
    INSERT INTO knowledge_assets (asset_id, product_id, case_id, asset_type, title, content, confidence, source_refs)
    VALUES (${assetId}, ${input.product_id}, ${input.case_id}, ${input.asset_type}, ${input.title}, ${input.content}, ${input.confidence ?? 0}, ${sourceRefs}::jsonb)
    RETURNING *
  `
  return KnowledgeAssetRowSchema.parse(row)
}

// ── Find ─────────────────────────────────────────────────────────────────────

export async function findKnowledgeAssetById(assetId: string): Promise<KnowledgeAssetRow | null> {
  const db = getDb()
  const [row] = await db<KnowledgeAssetRow[]>`
    SELECT * FROM knowledge_assets WHERE asset_id = ${assetId}
  `
  return row ? KnowledgeAssetRowSchema.parse(row) : null
}

export async function findKnowledgeAssetsByProduct(
  productId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<KnowledgeAssetRow[]> {
  const db = getDb()
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const rows = await db<KnowledgeAssetRow[]>`
    SELECT * FROM knowledge_assets
    WHERE product_id = ${productId}
      ${opts.status ? db`AND status = ${opts.status}` : db``}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows.map((r) => KnowledgeAssetRowSchema.parse(r))
}

// ── Update status ────────────────────────────────────────────────────────────

export async function updateKnowledgeAssetStatus(
  assetId: string,
  status: z.infer<typeof KnowledgeAssetStatusSchema>,
  extra: { review_note?: string; reviewed_by?: string } = {},
): Promise<KnowledgeAssetRow | null> {
  const db = getDb()

  const [row] = await db<KnowledgeAssetRow[]>`
    UPDATE knowledge_assets SET
      status = ${status},
      review_note = COALESCE(${extra.review_note ?? null}, review_note),
      reviewed_by = COALESCE(${extra.reviewed_by ?? null}, reviewed_by),
      reviewed_at = ${status === "approved" || status === "rejected" ? db`now()` : db`reviewed_at`},
      published_at = ${status === "published" ? db`now()` : db`published_at`},
      updated_at = now()
    WHERE asset_id = ${assetId}
    RETURNING *
  `
  return row ? KnowledgeAssetRowSchema.parse(row) : null
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getKnowledgeAssetStats(productId: string): Promise<{
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
}> {
  const db = getDb()

  type CountRow = { key: string; cnt: number }

  const [totalRow] = await db<{ cnt: number }[]>`SELECT count(*)::int AS cnt FROM knowledge_assets WHERE product_id = ${productId}`
  const byStatusRows = await db<CountRow[]>`SELECT status AS key, count(*)::int AS cnt FROM knowledge_assets WHERE product_id = ${productId} GROUP BY status`
  const byTypeRows = await db<CountRow[]>`SELECT asset_type AS key, count(*)::int AS cnt FROM knowledge_assets WHERE product_id = ${productId} GROUP BY asset_type`

  const byStatus: Record<string, number> = {}
  for (const r of byStatusRows) byStatus[r.key] = r.cnt

  const byType: Record<string, number> = {}
  for (const r of byTypeRows) byType[r.key] = r.cnt

  return { total: totalRow?.cnt ?? 0, byStatus, byType }
}
