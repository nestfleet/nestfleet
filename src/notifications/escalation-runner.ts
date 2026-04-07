/**
 * Escalation runner — SLICE-09.
 *
 * Finds overdue unacknowledged notifications and escalates them according to
 * the priority-based escalation policy from notification-model.md section 12:
 *
 *   critical  — max 3 escalation levels, repeat every 30min, target: operators + leads
 *   high      — max 2 levels, repeat every 60min,  target: support_lead
 *   normal    — max 1 level,  repeat every 4h,     target: support_lead
 *   low       — no escalation (ack_required=false by default for low)
 *
 * Call runEscalations() periodically (e.g. every 5 minutes via cron).
 */

import {
  findOverdueForEscalation,
  updateNotification,
  type NotificationRow,
  type NotificationPriority,
} from "../infra/db/repositories/notifications.js"
import { NotificationService } from "./index.js"
import { logger } from "../shared/logger.js"

// ── Policy ────────────────────────────────────────────────────────────────────

interface EscalationPolicy {
  maxLevels:        number
  repeatIntervalMs: number
  escalationAudience: "operator" | "support_lead" | "product_lead"
}

const ESCALATION_POLICY: Record<NotificationPriority, EscalationPolicy | null> = {
  critical: { maxLevels: 3, repeatIntervalMs: 30 * 60 * 1000, escalationAudience: "operator" },
  high:     { maxLevels: 2, repeatIntervalMs: 60 * 60 * 1000, escalationAudience: "support_lead" },
  normal:   { maxLevels: 1, repeatIntervalMs:  4 * 60 * 60 * 1000, escalationAudience: "support_lead" },
  low:      null,
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runEscalations(): Promise<{ processed: number; escalated: number; exhausted: number }> {
  const overdue = await findOverdueForEscalation()

  let escalated = 0
  let exhausted = 0

  for (const notif of overdue) {
    try {
      await escalateOne(notif)
      escalated++
    } catch (err) {
      logger.error({ err, notification_id: notif.notification_id }, "Escalation step failed")
      // Count as exhausted so the caller knows something went wrong
      exhausted++
    }
  }

  logger.info({ processed: overdue.length, escalated, exhausted }, "Escalation run complete")
  return { processed: overdue.length, escalated, exhausted }
}

async function escalateOne(notif: NotificationRow): Promise<void> {
  const policy = ESCALATION_POLICY[notif.priority]

  if (policy === null) {
    // Low priority — should not have ack_required, but handle defensively
    logger.warn({ notification_id: notif.notification_id }, "Low-priority notification found in escalation queue — skipping")
    return
  }

  if (notif.escalation_level >= policy.maxLevels) {
    // Max escalation reached — mark as failed and emit a critical internal alert
    await updateNotification(notif.notification_id, { status: "failed", error_message: "Unacknowledged after all escalations" })

    const ns = new NotificationService()
    await ns.emit({
      productId:    notif.product_id,
      kind:         "escalation_alert",
      priority:     "critical",
      audienceType: "operator",
      recipientRef: notif.recipient_ref,
      sourceType:   notif.source_type,
      sourceRef:    notif.source_ref,
      subject:      `[UNACKNOWLEDGED] Notification escalation exhausted`,
      body:         `A ${notif.priority}-priority notification (${notif.kind}) for ${notif.source_ref} was not acknowledged after ${policy.maxLevels} escalation(s) and has been marked as failed. Manual intervention required.`,
      ackRequired:  false,
    })

    logger.warn(
      { notification_id: notif.notification_id, escalation_level: notif.escalation_level },
      "Notification escalation exhausted — marked failed, internal alert emitted",
    )
    return
  }

  // Advance escalation: bump level, push deadline to next window
  const nextDeadline = new Date(Date.now() + policy.repeatIntervalMs)

  await updateNotification(notif.notification_id, {
    escalation_level: notif.escalation_level + 1,
    ack_deadline:     nextDeadline,
  })

  // Emit a follow-up escalation notification to the appropriate audience
  const ns = new NotificationService()
  await ns.emit({
    productId:    notif.product_id,
    kind:         "escalation_alert",
    priority:     notif.priority,
    audienceType: policy.escalationAudience,
    recipientRef: notif.recipient_ref,
    sourceType:   notif.source_type,
    sourceRef:    notif.source_ref,
    subject:      `[Escalation ${notif.escalation_level + 1}] ${notif.subject ?? notif.kind}`,
    body:         `This is escalation #${notif.escalation_level + 1} for a ${notif.priority}-priority notification that has not been acknowledged. Original: ${notif.subject ?? notif.kind}. Please acknowledge promptly.`,
    ackRequired:  true,
  })

  logger.info(
    {
      notification_id:  notif.notification_id,
      new_level:        notif.escalation_level + 1,
      max_levels:       policy.maxLevels,
      next_deadline:    nextDeadline.toISOString(),
    },
    "Notification escalated",
  )
}
