/**
 * Knowledge Assets API — SLICE-24.
 *
 * Routes:
 *   GET    /products/:productId/knowledge-assets            — list assets (filterable by status)
 *   GET    /products/:productId/knowledge-assets/stats       — aggregate counts
 *   POST   /products/:productId/knowledge-assets            — create proposal (knowledge_lead)
 *   PUT    /products/:productId/knowledge-assets/:id/approve — approve (knowledge_lead)
 *   PUT    /products/:productId/knowledge-assets/:id/reject  — reject (knowledge_lead)
 *   PUT    /products/:productId/knowledge-assets/:id/publish — publish approved asset (knowledge_lead)
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { logger } from "../../shared/logger.js"
import {
  createKnowledgeAsset,
  findKnowledgeAssetById,
  findKnowledgeAssetsByProduct,
  updateKnowledgeAssetStatus,
  getKnowledgeAssetStats,
  KnowledgeAssetTypeSchema,
} from "../../infra/db/repositories/knowledge-assets.js"
import { createAuditEvent } from "../../infra/db/repositories/audit-events.js"

export const knowledgeAssetsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateAssetBodySchema = z.object({
  caseId:     z.string().min(1),
  assetType:  KnowledgeAssetTypeSchema,
  title:      z.string().min(5),
  content:    z.string().min(20),
  confidence: z.number().min(0).max(1).optional().default(0),
  sourceRefs: z.array(z.string()).optional().default([]),
})

const ReviewBodySchema = z.object({
  reviewNote: z.string().optional(),
})

// ── GET /knowledge-assets ───────────────────────────────────────────────────

knowledgeAssetsRouter.get(
  "/products/:productId/knowledge-assets",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")
    const status = c.req.query("status")

    try {
      const assets = await findKnowledgeAssetsByProduct(productId, status ? { status } : {})
      return c.json({
        ok: true,
        data: {
          assets: assets.map((a) => ({
            assetId:     a.asset_id,
            caseId:      a.case_id,
            assetType:   a.asset_type,
            status:      a.status,
            title:       a.title,
            content:     a.content,
            confidence:  a.confidence,
            sourceRefs:  a.source_refs,
            reviewNote:  a.review_note,
            reviewedBy:  a.reviewed_by,
            reviewedAt:  a.reviewed_at,
            publishedAt: a.published_at,
            createdAt:   a.created_at,
          })),
        },
      })
    } catch (err) {
      logger.error({ err, productId }, "Failed to list knowledge assets")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── GET /knowledge-assets/stats ─────────────────────────────────────────────

knowledgeAssetsRouter.get(
  "/products/:productId/knowledge-assets/stats",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")
    try {
      const stats = await getKnowledgeAssetStats(productId)
      return c.json({ ok: true, data: stats })
    } catch (err) {
      logger.error({ err, productId }, "Failed to get knowledge asset stats")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── POST /knowledge-assets ──────────────────────────────────────────────────

knowledgeAssetsRouter.post(
  "/products/:productId/knowledge-assets",
  requireAuth(),
  requireRole("knowledge_lead"),
  async (c) => {
    const productId = c.req.param("productId")
    const user = c.get("user")

    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = CreateAssetBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
    }

    try {
      const asset = await createKnowledgeAsset({
        product_id:  productId,
        case_id:     parsed.data.caseId,
        asset_type:  parsed.data.assetType,
        title:       parsed.data.title,
        content:     parsed.data.content,
        confidence:  parsed.data.confidence,
        source_refs: parsed.data.sourceRefs,
      })

      await createAuditEvent({
        product_id:  productId,
        entity_type: "knowledge_asset",
        entity_ref:  asset.asset_id,
        actor_type:  "lead",
        actor_ref:   user.sub,
        action:      "ka.proposed",
        before_state: {},
        after_state:  { status: "proposed", assetType: asset.asset_type },
        metadata:     { caseId: parsed.data.caseId, title: asset.title },
      })

      logger.info({ assetId: asset.asset_id, productId, caseId: parsed.data.caseId }, "Knowledge asset proposed")

      return c.json({
        ok: true,
        data: { assetId: asset.asset_id, status: asset.status },
      })
    } catch (err) {
      logger.error({ err, productId }, "Failed to create knowledge asset")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── PUT /knowledge-assets/:assetId/approve ──────────────────────────────────

knowledgeAssetsRouter.put(
  "/products/:productId/knowledge-assets/:assetId/approve",
  requireAuth(),
  requireRole("knowledge_lead"),
  async (c) => {
    const productId = c.req.param("productId")
    const assetId = c.req.param("assetId")
    const user = c.get("user")

    let body: unknown = {}
    try { body = await c.req.json() } catch { /* no body is fine */ }
    const parsed = ReviewBodySchema.safeParse(body)

    try {
      const existing = await findKnowledgeAssetById(assetId)
      if (!existing || existing.product_id !== productId) {
        return c.json({ error: "Knowledge asset not found" }, 404)
      }
      if (existing.status !== "proposed") {
        return c.json({ error: "Only proposed assets can be approved" }, 400)
      }

      const updated = await updateKnowledgeAssetStatus(assetId, "approved", {
        ...(parsed.success && parsed.data.reviewNote ? { review_note: parsed.data.reviewNote } : {}),
        reviewed_by: user.sub,
      })

      await createAuditEvent({
        product_id:  productId,
        entity_type: "knowledge_asset",
        entity_ref:  assetId,
        actor_type:  "lead",
        actor_ref:   user.sub,
        action:      "ka.approved",
        before_state: { status: "proposed" },
        after_state:  { status: "approved" },
        metadata:     { reviewNote: parsed.success ? parsed.data.reviewNote : null },
      })

      return c.json({ ok: true, data: { assetId, status: updated?.status } })
    } catch (err) {
      logger.error({ err, productId, assetId }, "Failed to approve knowledge asset")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── PUT /knowledge-assets/:assetId/reject ───────────────────────────────────

knowledgeAssetsRouter.put(
  "/products/:productId/knowledge-assets/:assetId/reject",
  requireAuth(),
  requireRole("knowledge_lead"),
  async (c) => {
    const productId = c.req.param("productId")
    const assetId = c.req.param("assetId")
    const user = c.get("user")

    let body: unknown = {}
    try { body = await c.req.json() } catch { /* no body is fine */ }
    const parsed = ReviewBodySchema.safeParse(body)

    try {
      const existing = await findKnowledgeAssetById(assetId)
      if (!existing || existing.product_id !== productId) {
        return c.json({ error: "Knowledge asset not found" }, 404)
      }
      if (existing.status !== "proposed") {
        return c.json({ error: "Only proposed assets can be rejected" }, 400)
      }

      const updated = await updateKnowledgeAssetStatus(assetId, "rejected", {
        ...(parsed.success && parsed.data.reviewNote ? { review_note: parsed.data.reviewNote } : {}),
        reviewed_by: user.sub,
      })

      await createAuditEvent({
        product_id:  productId,
        entity_type: "knowledge_asset",
        entity_ref:  assetId,
        actor_type:  "lead",
        actor_ref:   user.sub,
        action:      "ka.rejected",
        before_state: { status: "proposed" },
        after_state:  { status: "rejected" },
        metadata:     { reviewNote: parsed.success ? parsed.data.reviewNote : null },
      })

      return c.json({ ok: true, data: { assetId, status: updated?.status } })
    } catch (err) {
      logger.error({ err, productId, assetId }, "Failed to reject knowledge asset")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)

// ── PUT /knowledge-assets/:assetId/publish ──────────────────────────────────

knowledgeAssetsRouter.put(
  "/products/:productId/knowledge-assets/:assetId/publish",
  requireAuth(),
  requireRole("knowledge_lead"),
  async (c) => {
    const productId = c.req.param("productId")
    const assetId = c.req.param("assetId")
    const user = c.get("user")

    try {
      const existing = await findKnowledgeAssetById(assetId)
      if (!existing || existing.product_id !== productId) {
        return c.json({ error: "Knowledge asset not found" }, 404)
      }
      if (existing.status !== "approved") {
        return c.json({ error: "Only approved assets can be published" }, 400)
      }

      const updated = await updateKnowledgeAssetStatus(assetId, "published")

      await createAuditEvent({
        product_id:  productId,
        entity_type: "knowledge_asset",
        entity_ref:  assetId,
        actor_type:  "lead",
        actor_ref:   user.sub,
        action:      "ka.published",
        before_state: { status: "approved" },
        after_state:  { status: "published" },
        metadata:     {},
      })

      logger.info({ assetId, productId }, "Knowledge asset published")

      return c.json({
        ok: true,
        data: { assetId, status: updated?.status, publishedAt: updated?.published_at },
      })
    } catch (err) {
      logger.error({ err, productId, assetId }, "Failed to publish knowledge asset")
      return c.json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
)
