/**
 * Products repository — SLICE-01.
 * One product = one operated service (e.g. DocuGardener, SkillSeal).
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"
import { slugify } from "../../../shared/slugify.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const ProductStageSchema = z.enum([
  "pre-launch",
  "beta",
  "production",
  "deprecated",
])
export type ProductStage = z.infer<typeof ProductStageSchema>

export const ProductRowSchema = z.object({
  product_id:       z.string(),
  slug:             z.string(),
  name:             z.string(),
  stage:            ProductStageSchema,
  support_policy:   z.record(z.unknown()),
  enabled_channels: z.array(z.string()),
  lead_assignments: z.record(z.unknown()),
  llm_config:       z.record(z.unknown()),
  agent_config:     z.record(z.unknown()),
  // SLICE-13: CI integration config
  ci_config:        z.record(z.unknown()),
  // DEFERRED-21 U-06: per-product accent colour (CSS hex string)
  accent_color:     z.string().default("#6366f1"),
  // FEAT-014: per-product notification preferences
  notification_preferences: z.record(z.unknown()).optional().default({}),
  created_at:       z.date(),
  updated_at:       z.date(),
})
export type ProductRow = z.infer<typeof ProductRowSchema>

export const ProductInsertSchema = z.object({
  name:             z.string().min(1),
  stage:            ProductStageSchema.default("pre-launch"),
  support_policy:   z.record(z.unknown()).optional(),
  enabled_channels: z.array(z.string()).optional(),
  lead_assignments: z.record(z.unknown()).optional(),
  llm_config:       z.record(z.unknown()).optional(),
  agent_config:     z.record(z.unknown()).optional(),
  ci_config:        z.record(z.unknown()).optional(),
})
export type ProductInsert = z.infer<typeof ProductInsertSchema>

export const ProductUpdateSchema = z.object({
  name:             z.string().min(1).optional(),
  stage:            ProductStageSchema.optional(),
  support_policy:   z.record(z.unknown()).optional(),
  enabled_channels: z.array(z.string()).optional(),
  lead_assignments: z.record(z.unknown()).optional(),
  llm_config:       z.record(z.unknown()).optional(),
  agent_config:     z.record(z.unknown()).optional(),
  // SLICE-13: CI integration config
  ci_config:        z.record(z.unknown()).optional(),
  // DEFERRED-21 U-06: per-product accent colour
  accent_color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

export async function createProduct(input: ProductInsert): Promise<ProductRow> {
  // SLICE-19: Enforce product limit from license
  const { getLicenseState } = await import("../../../license/validator.js")
  const license = getLicenseState()
  if (license?.payload) {
    const db2 = getDb()
    const [countRow] = await db2<{ count: number }[]>`SELECT count(*)::int AS count FROM products`
    if (countRow && countRow.count >= license.payload.productLimit) {
      throw new Error(
        `Product limit reached (${countRow.count}/${license.payload.productLimit}). Upgrade your license to create more products.`,
      )
    }
  }

  const db = getDb()
  const productId = newId("prod_")
  const v = ProductInsertSchema.parse(input)

  // Auto-generate slug from name; resolve collisions by appending -2, -3, etc.
  const baseSlug = slugify(v.name)
  const existingSlugs = await db<{ slug: string }[]>`SELECT slug FROM products WHERE slug LIKE ${baseSlug + "%"}`
  const slugSet = new Set(existingSlugs.map((r) => r.slug))
  let slug = baseSlug
  if (slugSet.has(slug)) {
    let n = 2
    while (slugSet.has(`${baseSlug}-${n}`)) n++
    slug = `${baseSlug}-${n}`
  }

  const [row] = await db<ProductRow[]>`
    INSERT INTO products (
      product_id, slug, name, stage,
      support_policy, enabled_channels, lead_assignments,
      llm_config, agent_config, ci_config
    ) VALUES (
      ${productId},
      ${slug},
      ${v.name},
      ${v.stage},
      ${db.json(pgJson(v.support_policy ?? {}))},
      ${db.array(v.enabled_channels ?? [])},
      ${db.json(pgJson(v.lead_assignments ?? {}))},
      ${db.json(pgJson(v.llm_config ?? {}))},
      ${db.json(pgJson(v.agent_config ?? {}))},
      ${db.json(pgJson(v.ci_config ?? {}))}
    )
    RETURNING *
  `
  return ProductRowSchema.parse(row)
}

export async function findProductById(productId: string): Promise<ProductRow | null> {
  const db = getDb()
  const [row] = await db<ProductRow[]>`
    SELECT * FROM products WHERE product_id = ${productId}
  `
  return row ? ProductRowSchema.parse(row) : null
}

export async function findProductBySlug(slug: string): Promise<ProductRow | null> {
  const db = getDb()
  const [row] = await db<ProductRow[]>`
    SELECT * FROM products WHERE slug = ${slug} LIMIT 1
  `
  return row ? ProductRowSchema.parse(row) : null
}

export async function listProducts(): Promise<ProductRow[]> {
  const db = getDb()
  const rows = await db<ProductRow[]>`
    SELECT * FROM products ORDER BY created_at DESC
  `
  return rows.map((r) => ProductRowSchema.parse(r))
}

/**
 * Find all products in one of the given stages.
 * Used by the digest cron to flush notifications for all active products.
 */
export async function findProductsByStage(stages: string[]): Promise<ProductRow[]> {
  const db = getDb()
  const rows = await db<ProductRow[]>`
    SELECT * FROM products
    WHERE stage = ANY(${db.array(stages)})
    ORDER BY created_at ASC
  `
  return rows.map((r) => ProductRowSchema.parse(r))
}

export async function updateProduct(
  productId: string,
  input: ProductUpdate,
): Promise<ProductRow | null> {
  const db = getDb()
  const v = ProductUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.name !== undefined)             updates["name"]             = v.name
  if (v.stage !== undefined)            updates["stage"]            = v.stage
  if (v.support_policy !== undefined)   updates["support_policy"]   = db.json(pgJson(v.support_policy))
  if (v.enabled_channels !== undefined) updates["enabled_channels"] = db.array(v.enabled_channels)
  if (v.lead_assignments !== undefined) updates["lead_assignments"] = db.json(pgJson(v.lead_assignments))
  if (v.llm_config !== undefined)       updates["llm_config"]       = db.json(pgJson(v.llm_config))
  if (v.agent_config !== undefined)     updates["agent_config"]     = db.json(pgJson(v.agent_config))
  if (v.ci_config !== undefined)        updates["ci_config"]        = db.json(pgJson(v.ci_config))
  if (v.accent_color !== undefined)     updates["accent_color"]     = v.accent_color

  if (Object.keys(updates).length === 0) return findProductById(productId)

  const [row] = await db<ProductRow[]>`
    UPDATE products
    SET ${db(updates)}
    WHERE product_id = ${productId}
    RETURNING *
  `
  return row ? ProductRowSchema.parse(row) : null
}

// ── FEAT-014: Notification Preferences ───────────────────────────────────────

export interface NotificationPreferences {
  email_disabled_events: string[]
}

/**
 * Load notification preferences for a product.
 * Returns { email_disabled_events: [] } as the default when the column is empty
 * or the product is not found.
 */
export async function getNotificationPreferences(productId: string): Promise<NotificationPreferences> {
  const db = getDb()
  const [row] = await db<{ notification_preferences: Record<string, unknown> }[]>`
    SELECT notification_preferences
    FROM products
    WHERE product_id = ${productId}
  `

  if (!row) {
    return { email_disabled_events: [] }
  }

  const prefs = row.notification_preferences ?? {}
  const disabled = prefs["email_disabled_events"]
  const emailDisabledEvents = Array.isArray(disabled)
    ? (disabled as unknown[]).filter((v): v is string => typeof v === "string")
    : []

  return { email_disabled_events: emailDisabledEvents }
}

/**
 * Persist notification preferences for a product.
 */
export async function setNotificationPreferences(
  productId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  const db = getDb()
  await db`
    UPDATE products
    SET notification_preferences = ${db.json(pgJson(prefs as unknown as Record<string, unknown>))}
    WHERE product_id = ${productId}
  `
}
