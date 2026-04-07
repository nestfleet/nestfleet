/**
 * DSAR API — CG-04.
 *
 * Data Subject Access Request support per GDPR Articles 15-20.
 * Searches all product-scoped records associated with an identity (email address)
 * and returns a structured export in JSON or CSV.
 *
 * Routes:
 *   GET /api/v1/products/:productId/dsar/search?identity=email   — search, returns summary + data
 *   GET /api/v1/products/:productId/dsar/export?identity=email&format=json|csv  — download export
 *
 * Auth: requireRole("admin") — sensitive PII operation.
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { getDb } from "../../infra/db/client.js"

export const dsarRouter = new Hono<{ Variables: AuthVariables }>()

// ── DSAR query ────────────────────────────────────────────────────────────────

async function collectDsarData(productId: string, query: string) {
  const db = getDb()

  // Normalise: strip leading @ from Telegram handles so "@johndoe" and "johndoe" both match
  const normQuery = query.startsWith("@") ? query.slice(1) : query
  const likePattern = `%${normQuery}%`

  // 1. Identities — match by email (exact), display_name (ILIKE), or telegram handle (exact)
  //    ILIKE on a small table is fine; see CG-04-B in backlog for pg_trgm upgrade path.
  const identities = await db<{ identity_id: string; type: string; display_name: string | null; email_addresses: string[]; telegram_handles: string[]; created_at: Date }[]>`
    SELECT identity_id, type, display_name, email_addresses, telegram_handles, created_at
    FROM identities
    WHERE product_id = ${productId}
      AND (
        ${query} = ANY(email_addresses)
        OR display_name ILIKE ${likePattern}
        OR ${normQuery} = ANY(telegram_handles)
      )
  `

  const identityIds = identities.map((i) => i.identity_id)

  // Collect all known emails for matched identities — used to query tables that store
  // email strings directly (notifications.recipient_ref, audit_events.actor_ref).
  const allEmails: string[] = Array.from(
    new Set(identities.flatMap((i) => i.email_addresses))
  )
  // Always include the raw query itself in case it's an email not yet in identities
  if (query.includes("@") && !allEmails.includes(query)) allEmails.push(query)

  // 2. Cases reported by this identity
  const cases = identityIds.length > 0
    ? await db<{ case_id: string; title: string | null; status: string; type: string | null; severity: string | null; created_at: Date; closed_at: Date | null }[]>`
        SELECT case_id, title, status, type, severity, created_at, closed_at
        FROM cases
        WHERE product_id = ${productId}
          AND reporter_identity_id = ANY(${db.array(identityIds)})
        ORDER BY created_at DESC
      `
    : []

  const caseIds = cases.map((c) => c.case_id)

  // 3. Signals from this identity
  const signals = identityIds.length > 0
    ? await db<{ signal_id: string; source_type: string; received_at: Date; case_id: string | null; processing_status: string }[]>`
        SELECT signal_id, source_type, received_at, case_id, processing_status
        FROM signals
        WHERE product_id = ${productId}
          AND identity_id = ANY(${db.array(identityIds)})
        ORDER BY received_at DESC
      `
    : []

  // 4. Conversations this identity participated in
  const conversations = identityIds.length > 0
    ? await db<{ conversation_id: string; channel: string; subject: string | null; status: string; created_at: Date }[]>`
        SELECT conversation_id, channel, subject, status, created_at
        FROM conversations
        WHERE product_id = ${productId}
          AND participant_ids && ${db.array(identityIds)}
        ORDER BY created_at DESC
      `
    : []

  // 5. Notifications — search by all emails of matched identities (covers name/handle queries)
  const notifications = allEmails.length > 0
    ? await db<{ notification_id: string; kind: string; priority: string; subject: string | null; status: string; created_at: Date; sent_at: Date | null }[]>`
        SELECT notification_id, kind, priority, subject, status, created_at, sent_at
        FROM notifications
        WHERE product_id = ${productId}
          AND recipient_ref = ANY(${db.array(allEmails)})
        ORDER BY created_at DESC
      `
    : []

  // 6. Audit events — search by all emails of matched identities
  const auditEvents = allEmails.length > 0
    ? await db<{ audit_event_id: string; entity_type: string; entity_ref: string; action: string; actor_type: string; occurred_at: Date }[]>`
        SELECT audit_event_id, entity_type, entity_ref, action, actor_type, occurred_at
        FROM audit_events
        WHERE product_id = ${productId}
          AND actor_ref = ANY(${db.array(allEmails)})
          AND before_state IS NOT NULL  -- exclude already-anonymised events
        ORDER BY occurred_at DESC
        LIMIT 500
      `
    : []

  // 7. Change requests linked to this identity's cases
  const changeRequests = caseIds.length > 0
    ? await db<{ change_request_id: string; title: string | null; status: string; risk_level: string | null; created_at: Date }[]>`
        SELECT change_request_id, title, status, risk_level, created_at
        FROM change_requests
        WHERE product_id = ${productId}
          AND case_id = ANY(${db.array(caseIds)})
        ORDER BY created_at DESC
      `
    : []

  // Canonical identity label: first email found, or the raw query
  const canonicalIdentity = allEmails[0] ?? query

  return {
    identity: canonicalIdentity,
    query,
    generatedAt: new Date().toISOString(),
    summary: {
      identities:     identities.length,
      cases:          cases.length,
      signals:        signals.length,
      conversations:  conversations.length,
      notifications:  notifications.length,
      auditEvents:    auditEvents.length,
      changeRequests: changeRequests.length,
    },
    data: {
      identities,
      cases,
      signals,
      conversations,
      notifications,
      auditEvents,
      changeRequests,
    },
  }
}

// ── CSV serialiser ────────────────────────────────────────────────────────────

function toCsv(data: Record<string, object[]>): string {
  const sections: string[] = []

  for (const [section, rows] of Object.entries(data)) {
    if (rows.length === 0) continue
    const firstRow = rows[0]
    if (!firstRow) continue
    const headers = Object.keys(firstRow)
    const csvRows = rows.map((row) =>
      headers
        .map((h) => {
          const val = (row as Record<string, unknown>)[h]
          const str = val === null || val === undefined ? "" : String(val)
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(","),
    )
    sections.push(`## ${section}\n${headers.join(",")}\n${csvRows.join("\n")}`)
  }

  return sections.join("\n\n")
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const DsarQuerySchema = z.object({
  // Accepts email address, display name, or @telegram handle
  identity: z.string().min(2, "Search query must be at least 2 characters"),
  format:   z.enum(["json", "csv"]).optional().default("json"),
})

// ── GET /api/v1/products/:productId/dsar/search ───────────────────────────────

dsarRouter.get(
  "/products/:productId/dsar/search",
  requireAuth(),
  requireRole("admin"),
  async (c) => {
    const productId = c.req.param("productId")
    const actor     = c.get("user")

    const parsed = DsarQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid query", details: parsed.error.issues }, 400)
    }

    const { identity } = parsed.data

    try {
      const product = await findProductById(productId)
      if (!product) return c.json({ error: "Product not found" }, 404)

      const result = await collectDsarData(productId, identity)

      logger.info({ productId, identity, actor: actor.email, summary: result.summary }, "CG-04: DSAR search performed")
      return c.json({ ok: true, data: result })
    } catch (err) {
      logger.error({ err, productId, identity }, "CG-04: DSAR search failed")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)

// ── GET /api/v1/products/:productId/dsar/export ───────────────────────────────

dsarRouter.get(
  "/products/:productId/dsar/export",
  requireAuth(),
  requireRole("admin"),
  async (c) => {
    const productId = c.req.param("productId")
    const actor     = c.get("user")

    const parsed = DsarQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid query", details: parsed.error.issues }, 400)
    }

    const { identity, format } = parsed.data

    try {
      const product = await findProductById(productId)
      if (!product) return c.json({ error: "Product not found" }, 404)

      const result = await collectDsarData(productId, identity)
      const safeIdentity = identity.replace(/[^a-z0-9@._-]/gi, "_")
      const timestamp    = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
      const filename     = `dsar_${safeIdentity}_${timestamp}`

      logger.info({ productId, identity, format, actor: actor.email, summary: result.summary }, "CG-04: DSAR export downloaded")

      if (format === "csv") {
        const csv = toCsv(result.data as Record<string, object[]>)
        c.header("Content-Type", "text/csv; charset=utf-8")
        c.header("Content-Disposition", `attachment; filename="${filename}.csv"`)
        return c.body(csv)
      }

      // JSON
      const json = JSON.stringify(result, null, 2)
      c.header("Content-Type", "application/json")
      c.header("Content-Disposition", `attachment; filename="${filename}.json"`)
      return c.body(json)
    } catch (err) {
      logger.error({ err, productId, identity }, "CG-04: DSAR export failed")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)
