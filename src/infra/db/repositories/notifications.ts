/**
 * Notifications repository — SLICE-07.
 * Stores the Notification Control Plane records with dedup, scheduling, and ack.
 *
 * Design rules:
 *   - createNotification catches 23505 (unique_violation) and returns null — dedup suppression
 *   - updateNotification and ackNotification return null when row not found
 *   - status transitions are the caller's responsibility; this layer persists them
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId } from "../id.js"
import { logger } from "../../../shared/logger.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const NotificationKindSchema = z.enum([
  "approval_request",
  "escalation_alert",
  "reminder",
  "digest_summary",
  "pr_ready",
  "stale_case_alert",
  "stale_change_alert",
  "user_follow_up",
  "clarification_request",
  "resolution_message",
  "status_update",
])
export type NotificationKind = z.infer<typeof NotificationKindSchema>

export const NotificationPrioritySchema = z.enum(["critical", "high", "normal", "low"])
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>

export const NotificationAudienceTypeSchema = z.enum([
  "operator",
  "support_lead",
  "product_lead",
  "change_lead",
  "knowledge_lead",
  "end_user",
])
export type NotificationAudienceType = z.infer<typeof NotificationAudienceTypeSchema>

export const NotificationStatusSchema = z.enum([
  "pending",
  "scheduled",
  "sent",
  "suppressed",
  "failed",
  "acked",
])
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>

export const NotificationRowSchema = z.object({
  notification_id: z.string(),
  product_id:      z.string(),
  kind:            NotificationKindSchema,
  priority:        NotificationPrioritySchema,
  audience_type:   NotificationAudienceTypeSchema,
  channel:         z.enum(["email", "telegram", "slack"]),
  recipient_ref:   z.string(),
  source_type:     z.string(),
  source_ref:      z.string(),
  correlation_id:  z.string().nullable(),
  subject:         z.string().nullable(),
  body:            z.string().nullable(),
  status:          NotificationStatusSchema,
  scheduled_for:   z.date(),
  sent_at:         z.date().nullable(),
  ack_required:    z.boolean(),
  ack_deadline:    z.date().nullable(),
  acked_at:        z.date().nullable(),
  acked_by:        z.string().nullable(),
  escalation_level: z.number(),
  retry_count:     z.number(),
  error_message:   z.string().nullable(),
  created_at:      z.date(),
  updated_at:      z.date(),
})
export type NotificationRow = z.infer<typeof NotificationRowSchema>

export const NotificationInsertSchema = z.object({
  product_id:     z.string(),
  kind:           NotificationKindSchema,
  priority:       NotificationPrioritySchema,
  audience_type:  NotificationAudienceTypeSchema,
  channel:        z.enum(["email", "telegram", "slack"]).optional(),
  recipient_ref:  z.string(),
  source_type:    z.string(),
  source_ref:     z.string(),
  correlation_id: z.string().optional(),
  subject:        z.string().optional(),
  body:           z.string().optional(),
  scheduled_for:  z.date().optional(),
  ack_required:   z.boolean().optional(),
  ack_deadline:   z.date().optional(),
})
export type NotificationInsert = z.infer<typeof NotificationInsertSchema>

export const NotificationUpdateSchema = z.object({
  status:           NotificationStatusSchema.optional(),
  sent_at:          z.date().optional(),
  acked_at:         z.date().optional(),
  acked_by:         z.string().optional(),
  escalation_level: z.number().optional(),
  ack_deadline:     z.date().optional(),
  retry_count:      z.number().optional(),
  error_message:    z.string().optional(),
  scheduled_for:    z.date().optional(),
})
export type NotificationUpdate = z.infer<typeof NotificationUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a notification record.
 * Returns null (and logs as suppressed) on 23505 unique_violation — dedup protection.
 */
export async function createNotification(
  input: NotificationInsert,
): Promise<NotificationRow | null> {
  const db = getDb()
  const notificationId = newId("notif_")
  const v = NotificationInsertSchema.parse(input)

  try {
    const [row] = await db<NotificationRow[]>`
      INSERT INTO notifications (
        notification_id, product_id,
        kind, priority, audience_type,
        channel, recipient_ref,
        source_type, source_ref,
        correlation_id,
        subject, body,
        scheduled_for, ack_required, ack_deadline
      ) VALUES (
        ${notificationId},
        ${v.product_id},
        ${v.kind},
        ${v.priority},
        ${v.audience_type},
        ${v.channel ?? "email"},
        ${v.recipient_ref},
        ${v.source_type},
        ${v.source_ref},
        ${v.correlation_id ?? null},
        ${v.subject ?? null},
        ${v.body ?? null},
        ${v.scheduled_for ?? new Date()},
        ${v.ack_required ?? false},
        ${v.ack_deadline ?? null}
      )
      RETURNING *
    `
    return NotificationRowSchema.parse(row)
  } catch (err) {
    // 23505 = unique_violation — dedup index fired, treat as suppressed
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: unknown }).code === "23505"
    ) {
      logger.info(
        { product_id: v.product_id, kind: v.kind, source_type: v.source_type, source_ref: v.source_ref },
        "Notification suppressed (duplicate)",
      )
      return null
    }
    throw err
  }
}

/**
 * Find all pending notifications for a product scheduled before a given time.
 * Used by the digest flush and scheduler.
 */
export async function findPendingNotifications(
  productId: string,
  beforeTime: Date,
): Promise<NotificationRow[]> {
  const db = getDb()
  const rows = await db<NotificationRow[]>`
    SELECT * FROM notifications
    WHERE product_id = ${productId}
      AND status = 'pending'
      AND scheduled_for <= ${beforeTime}
    ORDER BY scheduled_for ASC
  `
  return rows.map((r) => NotificationRowSchema.parse(r))
}

/**
 * Update mutable fields on a notification (status, sent_at, acked_*, retry, error).
 * Returns null if the notification does not exist.
 */
export async function updateNotification(
  notificationId: string,
  input: NotificationUpdate,
): Promise<NotificationRow | null> {
  const db = getDb()
  const v = NotificationUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.status           !== undefined) updates["status"]           = v.status
  if (v.sent_at          !== undefined) updates["sent_at"]          = v.sent_at
  if (v.acked_at         !== undefined) updates["acked_at"]         = v.acked_at
  if (v.acked_by         !== undefined) updates["acked_by"]         = v.acked_by
  if (v.escalation_level !== undefined) updates["escalation_level"] = v.escalation_level
  if (v.ack_deadline     !== undefined) updates["ack_deadline"]     = v.ack_deadline
  if (v.retry_count      !== undefined) updates["retry_count"]      = v.retry_count
  if (v.error_message    !== undefined) updates["error_message"]    = v.error_message
  if (v.scheduled_for    !== undefined) updates["scheduled_for"]    = v.scheduled_for

  if (Object.keys(updates).length === 0) {
    const [row] = await db<NotificationRow[]>`
      SELECT * FROM notifications WHERE notification_id = ${notificationId}
    `
    return row ? NotificationRowSchema.parse(row) : null
  }

  const [row] = await db<NotificationRow[]>`
    UPDATE notifications
    SET ${db(updates)}
    WHERE notification_id = ${notificationId}
    RETURNING *
  `
  return row ? NotificationRowSchema.parse(row) : null
}

/**
 * Acknowledge a notification. Sets status=acked, acked_at=now, acked_by.
 * Returns null if the notification does not exist.
 */
export async function ackNotification(
  notificationId: string,
  ackedBy: string,
): Promise<NotificationRow | null> {
  const db = getDb()
  const [row] = await db<NotificationRow[]>`
    UPDATE notifications
    SET status   = 'acked',
        acked_at = NOW(),
        acked_by = ${ackedBy}
    WHERE notification_id = ${notificationId}
    RETURNING *
  `
  return row ? NotificationRowSchema.parse(row) : null
}

/**
 * Find all notifications whose source_ref is the caseId or one of the provided
 * changeRequestIds, across all statuses. Used by the lineage assembler.
 */
export async function findNotificationsByCaseLineage(
  productId: string,
  caseId: string,
  changeRequestIds: string[],
): Promise<NotificationRow[]> {
  const db = getDb()
  const refs = [caseId, ...changeRequestIds]

  const rows = await db<NotificationRow[]>`
    SELECT * FROM notifications
    WHERE product_id = ${productId}
      AND source_ref = ANY(${db.array(refs)})
    ORDER BY created_at ASC
  `
  return rows.map((r) => NotificationRowSchema.parse(r))
}

// ── Options for product-level list query ──────────────────────────────────────

export interface FindNotificationsOptions {
  status?: string
  kind?: string
  priority?: string
  limit?: number
  offset?: number
}

/**
 * List notifications for a product with optional filters.
 * Used by the notifications API endpoint (SLICE-07).
 */
export async function findNotificationsByProduct(
  productId: string,
  opts: FindNotificationsOptions = {},
): Promise<NotificationRow[]> {
  const db = getDb()
  const limit  = opts.limit  ?? 50
  const offset = opts.offset ?? 0

  const rows = await db<NotificationRow[]>`
    SELECT * FROM notifications
    WHERE product_id = ${productId}
      ${opts.status   ? db`AND status   = ${opts.status}`   : db``}
      ${opts.kind     ? db`AND kind     = ${opts.kind}`     : db``}
      ${opts.priority ? db`AND priority = ${opts.priority}` : db``}
    ORDER BY scheduled_for DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows.map((r) => NotificationRowSchema.parse(r))
}

/**
 * Find all notifications for a given source entity across all statuses.
 * Useful for dedup checks and audit display.
 */
export async function findNotificationsBySource(
  productId: string,
  sourceType: string,
  sourceRef: string,
): Promise<NotificationRow[]> {
  const db = getDb()
  const rows = await db<NotificationRow[]>`
    SELECT * FROM notifications
    WHERE product_id  = ${productId}
      AND source_type = ${sourceType}
      AND source_ref  = ${sourceRef}
    ORDER BY created_at DESC
  `
  return rows.map((r) => NotificationRowSchema.parse(r))
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
}

/**
 * SLICE-08: Priority upgrade.
 *
 * When a higher-priority notification is emitted for a source, suppress any
 * existing pending notifications for the same product/kind/source with strictly
 * lower priority. This prevents stale low-priority noise from accumulating when
 * the situation escalates.
 *
 * Returns the number of rows suppressed (0 if nothing needed suppressing).
 */
export async function suppressLowerPriorityPending(
  productId: string,
  kind: NotificationKind,
  sourceType: string,
  sourceRef: string,
  newPriority: NotificationPriority,
): Promise<number> {
  const db = getDb()
  const newRank = PRIORITY_RANK[newPriority]

  // Find lower-priority pending notifications for this source
  const lowerPriorities = (Object.entries(PRIORITY_RANK) as [NotificationPriority, number][])
    .filter(([, rank]) => rank < newRank)
    .map(([p]) => p)

  if (lowerPriorities.length === 0) return 0

  const result = await db<{ notification_id: string }[]>`
    UPDATE notifications
    SET    status = 'suppressed'
    WHERE  product_id  = ${productId}
      AND  kind        = ${kind}
      AND  source_type = ${sourceType}
      AND  source_ref  = ${sourceRef}
      AND  priority    = ANY(${db.array(lowerPriorities)})
      AND  status      = 'pending'
    RETURNING notification_id
  `
  return result.length
}

/**
 * SLICE-09: Find all notifications that are overdue for escalation.
 * A notification is overdue when:
 *   - ack_required = true
 *   - acked_at IS NULL (never acknowledged)
 *   - ack_deadline has passed
 *   - status is not terminal (suppressed / failed)
 */
export async function findOverdueForEscalation(): Promise<NotificationRow[]> {
  const db = getDb()
  const rows = await db<NotificationRow[]>`
    SELECT * FROM notifications
    WHERE ack_required = true
      AND acked_at     IS NULL
      AND ack_deadline  < NOW()
      AND status NOT IN ('suppressed', 'failed', 'acked')
    ORDER BY ack_deadline ASC
  `
  return rows.map((r) => NotificationRowSchema.parse(r))
}

export interface NotificationMetrics {
  sendSuccessRate:      number   // 0-1, fraction of notifications that were sent
  meanAckLatencyMs:     number | null
  escalationRate:       number   // 0-1, fraction of ack-required notifs that escalated
  dedupSuppressionCount: number  // suppressed rows in last 7 days
}

/**
 * SLICE-09: Aggregate notification health metrics for the operator dashboard.
 * All queries run directly against the notifications table — no separate store needed.
 */
export async function getNotificationMetrics(
  productId: string,
): Promise<NotificationMetrics> {
  const db = getDb()

  const [sendRow] = await db<{ total: string; sent: string }[]>`
    SELECT
      COUNT(*)::text                                               AS total,
      COUNT(*) FILTER (WHERE status = 'sent')::text               AS sent
    FROM notifications
    WHERE product_id = ${productId}
      AND created_at >= NOW() - INTERVAL '7 days'
  `
  const total = parseInt(sendRow?.total ?? "0", 10)
  const sent  = parseInt(sendRow?.sent  ?? "0", 10)
  const sendSuccessRate = total > 0 ? sent / total : 0

  const [ackRow] = await db<{ mean_ms: string | null }[]>`
    SELECT AVG(
      EXTRACT(EPOCH FROM (acked_at - created_at)) * 1000
    )::text AS mean_ms
    FROM notifications
    WHERE product_id = ${productId}
      AND acked_at IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days'
  `
  const meanAckLatencyMs = ackRow?.mean_ms != null ? parseFloat(ackRow.mean_ms) : null

  const [escRow] = await db<{ ack_required_total: string; escalated: string }[]>`
    SELECT
      COUNT(*) FILTER (WHERE ack_required = true)::text           AS ack_required_total,
      COUNT(*) FILTER (WHERE ack_required = true AND escalation_level > 0)::text AS escalated
    FROM notifications
    WHERE product_id = ${productId}
      AND created_at >= NOW() - INTERVAL '7 days'
  `
  const ackRequiredTotal = parseInt(escRow?.ack_required_total ?? "0", 10)
  const escalated        = parseInt(escRow?.escalated           ?? "0", 10)
  const escalationRate   = ackRequiredTotal > 0 ? escalated / ackRequiredTotal : 0

  const [dedupRow] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM notifications
    WHERE product_id = ${productId}
      AND status     = 'suppressed'
      AND created_at >= NOW() - INTERVAL '7 days'
  `
  const dedupSuppressionCount = parseInt(dedupRow?.count ?? "0", 10)

  return { sendSuccessRate, meanAckLatencyMs, escalationRate, dedupSuppressionCount }
}
