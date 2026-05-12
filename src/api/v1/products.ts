// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Products list + create endpoints — DEFERRED-21.
 *
 * GET /api/v1/products
 *   Returns all products the authenticated user has access to (filtered by JWT productIds).
 *   Used by the Console ProductProvider to populate the product switcher.
 *
 * POST /api/v1/products
 *   Creates a new product for the authenticated user's organisation.
 *   Enforces license tier product limit. Assigns new product to calling user.
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { getDb } from "../../infra/db/client.js"
import { createProduct, updateProduct, findProductById, ProductRowSchema } from "../../infra/db/repositories/products.js"
import { updateOperatorUser, findOperatorUserById } from "../../infra/db/repositories/operator-users.js"
import { signJwt } from "../../auth/jwt.js"
import { logger } from "../../shared/logger.js"

export const productsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Lean summary type returned to the Console ─────────────────────────────────

const ProductSummarySchema = z.object({
  productId:   z.string(),
  slug:        z.string(),
  name:        z.string(),
  stage:       z.string(),
  accentColor: z.string(),
})
type ProductSummary = z.infer<typeof ProductSummarySchema>

// ── GET /api/v1/products ──────────────────────────────────────────────────────

productsRouter.get("/products", requireAuth(), async (c) => {
  const user   = c.get("user")
  const userId = user.sub

  const db = getDb()

  // Always query from DB, not JWT productIds.
  // JWT productIds are stale whenever a product is created outside POST /products
  // (setup wizard, customer VPS provisioning, admin assignment). Using the DB as
  // the source of truth means no re-login is needed after any product creation path.
  // Admins see all products; regular users see only their assigned products.
  const isAdmin = user.roles.includes("admin")
  const rows = await db<{ product_id: string; slug: string; name: string; stage: string; accent_color: string }[]>`
    SELECT product_id, slug, name, stage, accent_color
    FROM products
    WHERE ${isAdmin
      ? db`TRUE`
      : db`product_id = ANY(
             SELECT unnest(product_ids)
             FROM operator_users
             WHERE user_id = ${userId}
           )`
    }
    ORDER BY created_at ASC
  `

  const products: ProductSummary[] = rows.map((r) => ({
    productId:   r.product_id,
    slug:        r.slug,
    name:        r.name,
    stage:       r.stage,
    accentColor: r.accent_color ?? "#6366f1",
  }))

  return c.json({ ok: true, products })
})

// ── POST /api/v1/products ─────────────────────────────────────────────────────

const CreateProductBodySchema = z.object({
  name:  z.string().min(1).max(100),
  stage: z.enum(["pre-launch", "beta", "production"]).default("beta"),
})

productsRouter.post("/products", requireAuth(), async (c) => {
  const user   = c.get("user")
  const userId = user.sub

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = CreateProductBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Invalid request", details: parsed.error.issues }, 400)
  }

  const { name, stage } = parsed.data

  try {
    // createProduct() already enforces the license productLimit — throws if over limit
    const product = await createProduct({ name, stage })

    // Assign new product to the calling user's product_ids
    const operator = await findOperatorUserById(userId)
    const updatedProductIds = operator
      ? [...new Set([...(operator.product_ids ?? []), product.product_id])]
      : [product.product_id]

    if (operator && !operator.product_ids?.includes(product.product_id)) {
      await updateOperatorUser(userId, { product_ids: updatedProductIds })
    }

    // Re-issue JWT with updated productIds so the console can navigate immediately
    // without requiring a re-login to pick up the new product.
    const freshToken = signJwt({
      sub:        user.sub,
      email:      user.email,
      roles:      user.roles,
      productIds: updatedProductIds,
    })

    logger.info({ userId, productId: product.product_id, slug: product.slug }, "Product created")

    return c.json({
      ok: true,
      product: {
        productId:   product.product_id,
        slug:        product.slug,
        name:        product.name,
        stage:       product.stage,
        accentColor: product.accent_color ?? "#6366f1",
      },
      token: freshToken,
    }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error"
    // Product limit error from createProduct()
    if (msg.includes("Product limit reached")) {
      return c.json({ ok: false, error: msg }, 402)
    }
    logger.error({ err, userId }, "Failed to create product")
    return c.json({ ok: false, error: "Internal error" }, 500)
  }
})

// ── PATCH /api/v1/products/:productId ────────────────────────────────────────

const UpdateProductBodySchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  stage:       z.enum(["pre-launch", "beta", "production", "deprecated"]).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

productsRouter.patch("/products/:productId", requireAuth(), async (c) => {
  const user      = c.get("user")
  const productId = c.req.param("productId")

  // Ensure the calling user has access to this product
  if (!(user.productIds ?? []).includes(productId)) {
    return c.json({ ok: false, error: "Not found" }, 404)
  }

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = UpdateProductBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json({ ok: false, error: "Invalid request", details: parsed.error.issues }, 400)
  }

  const { name, stage, accentColor } = parsed.data

  try {
    const updated = await updateProduct(productId, {
      ...(name        !== undefined ? { name }                         : {}),
      ...(stage       !== undefined ? { stage }                        : {}),
      ...(accentColor !== undefined ? { accent_color: accentColor }    : {}),
    })

    if (!updated) {
      return c.json({ ok: false, error: "Product not found" }, 404)
    }

    logger.info({ userId: user.sub, productId, fields: Object.keys(parsed.data) }, "Product updated")

    return c.json({
      ok: true,
      product: {
        productId:   updated.product_id,
        slug:        updated.slug,
        name:        updated.name,
        stage:       updated.stage,
        accentColor: updated.accent_color ?? "#6366f1",
      },
    })
  } catch (err) {
    logger.error({ err, productId }, "Failed to update product")
    return c.json({ ok: false, error: "Internal error" }, 500)
  }
})
