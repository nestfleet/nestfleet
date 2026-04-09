/**
 * NotificationService — SLICE-07, extended for multi-channel in SLICE-25/26.
 *
 * Core notification control plane. Handles:
 *   - Priority-based scheduling (critical → now, high → +15min, normal/low → digest window)
 *   - Quiet hours enforcement (product.support_policy.quiet_hours, bypassed for critical)
 *   - Dedup suppression via DB unique index (23505 handled in repository)
 *   - Immediate delivery for notifications scheduled <= now
 *   - Digest flush: groups pending notifications by audienceType and sends one message per group
 *   - Channel routing: "email" (default), "telegram", or "slack" per notification event
 */

import {
  createNotification,
  findPendingNotifications,
  updateNotification,
  suppressLowerPriorityPending,
  type NotificationKind,
  type NotificationPriority,
  type NotificationAudienceType,
} from "../infra/db/repositories/notifications.js"
import { findProductById } from "../infra/db/repositories/products.js"
import { sendEmail } from "./email-transport.js"
import { sendTelegram } from "./telegram-transport.js"
import { sendSlack } from "./slack-transport.js"
import { applyDisclosure, type DisclosureContext, type DisclosureChannel, type DisclosureTemplates } from "../shared/ai-disclosure.js"
import { config } from "../shared/config.js"
import { decryptSecret } from "../shared/crypto.js"
import { logger } from "../shared/logger.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type { NotificationKind, NotificationPriority, NotificationAudienceType }

export type NotificationChannel = "email" | "telegram" | "slack"

export interface NotificationEvent {
  productId:    string
  kind:         NotificationKind
  priority:     NotificationPriority
  audienceType: NotificationAudienceType
  /**
   * For email: the recipient email address.
   * For telegram: the chat ID (numeric string or @username).
   * For slack: the channel ID or user ID (ignored in webhook mode).
   */
  recipientRef: string
  sourceType:   string
  sourceRef:    string
  correlationId?: string
  subject:      string
  body:         string
  ackRequired?: boolean
  /** Transport channel. Defaults to "email" when omitted. */
  channel?:     NotificationChannel
}

// ── Quiet hours helpers ────────────────────────────────────────────────────────

interface QuietHoursConfig {
  start:    number   // UTC hour, 0-23, e.g. 20
  end:      number   // UTC hour, 0-23, e.g. 8
  timezone: string   // informational — scheduling uses UTC hours in v1
  weekends: boolean  // suppress on weekends
}

const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  start:    20,
  end:      8,
  timezone: "UTC",
  weekends: true,
}

function parseQuietHours(raw: unknown): QuietHoursConfig {
  if (raw === null || typeof raw !== "object") return DEFAULT_QUIET_HOURS
  const r = raw as Record<string, unknown>
  return {
    start:    typeof r["start"]    === "number" ? r["start"]    : DEFAULT_QUIET_HOURS.start,
    end:      typeof r["end"]      === "number" ? r["end"]      : DEFAULT_QUIET_HOURS.end,
    timezone: typeof r["timezone"] === "string" ? r["timezone"] : DEFAULT_QUIET_HOURS.timezone,
    weekends: typeof r["weekends"] === "boolean" ? r["weekends"] : DEFAULT_QUIET_HOURS.weekends,
  }
}

/**
 * Returns true if the given UTC Date falls within quiet hours.
 * Handles overnight ranges (e.g. start=20, end=8 means 20:00–08:00 next day).
 */
function isInQuietHours(now: Date, qh: QuietHoursConfig): boolean {
  const hour = now.getUTCHours()
  const day  = now.getUTCDay() // 0=Sun, 6=Sat

  if (qh.weekends && (day === 0 || day === 6)) return true

  if (qh.start > qh.end) {
    // Overnight window: quiet from start through midnight and 00:00 through end
    return hour >= qh.start || hour < qh.end
  }
  // Same-day window
  return hour >= qh.start && hour < qh.end
}

/**
 * Given a Date inside quiet hours, returns a new Date at qh.end:00 UTC
 * on the same or next day, accounting for weekends.
 */
function quietHoursEndTime(now: Date, qh: QuietHoursConfig): Date {
  const candidate = new Date(now)
  // Set to the end hour of the same day
  candidate.setUTCHours(qh.end, 0, 0, 0)

  // If the end hour is already past (or same as now because we're in an overnight window
  // and it's currently past midnight before the end), we may need to advance to next day.
  if (candidate <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
    candidate.setUTCHours(qh.end, 0, 0, 0)
  }

  // Skip weekends if configured
  if (qh.weekends) {
    while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
      candidate.setUTCDate(candidate.getUTCDate() + 1)
      candidate.setUTCHours(qh.end, 0, 0, 0)
    }
  }

  return candidate
}

// ── Digest window helpers ─────────────────────────────────────────────────────

/**
 * Returns the next digest window time (09:00 or 14:00 UTC) strictly after now.
 */
function nextDigestWindow(now: Date): Date {
  const digestHours = [9, 14]
  const currentHour = now.getUTCHours()
  const currentMin  = now.getUTCMinutes()

  for (const h of digestHours) {
    if (h > currentHour || (h === currentHour && currentMin < 0)) {
      const d = new Date(now)
      d.setUTCHours(h, 0, 0, 0)
      return d
    }
  }

  // All windows passed today — use first window tomorrow
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(digestHours[0]!, 0, 0, 0)
  return d
}

// ── Ack deadline helpers ──────────────────────────────────────────────────────

function ackDeadlineForPriority(scheduledFor: Date, priority: NotificationPriority): Date | undefined {
  if (priority === "critical") {
    return new Date(scheduledFor.getTime() + 10 * 60 * 1000)    // 10 minutes
  }
  if (priority === "high") {
    return new Date(scheduledFor.getTime() + 60 * 60 * 1000)    // 60 minutes
  }
  if (priority === "normal") {
    return new Date(scheduledFor.getTime() + 4 * 60 * 60 * 1000) // 4 hours
  }
  return undefined  // low — no deadline
}

// ── Slack helpers ─────────────────────────────────────────────────────────────

/** Maps notification priority to a Slack sidebar color for Block Kit attachments. */
function priorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case "critical": return "#ef4444"  // red
    case "high":     return "#f97316"  // orange
    case "normal":   return "#4f46e5"  // indigo
    case "low":      return "#6b7280"  // gray
  }
}

// ── Transport dispatch ────────────────────────────────────────────────────────

interface DispatchOptions {
  /** Per-product Slack Incoming Webhook URL (overrides env SLACK_WEBHOOK_URL). */
  slackWebhookUrl?: string
  /** Sidebar color for Slack Block Kit attachment (hex). */
  slackColor?: string
}

async function dispatchMessage(
  channel: NotificationChannel,
  recipientRef: string,
  subject: string,
  body: string,
  opts?: DispatchOptions,
): Promise<boolean> {
  switch (channel) {
    case "telegram":
      return sendTelegram({ chatId: recipientRef, text: body })
    case "slack":
      return sendSlack(
        {
          channel: recipientRef,
          text: body,
          subject,
          ...(opts?.slackColor !== undefined ? { color: opts.slackColor } : {}),
        },
        opts?.slackWebhookUrl ? { webhookUrl: opts.slackWebhookUrl } : undefined,
      )
    default:
      return sendEmail({ to: recipientRef, subject, text: body })
  }
}

// ── NotificationService ───────────────────────────────────────────────────────

export class NotificationService {

  /**
   * Emit a notification event.
   *
   * 1. Checks quiet hours (critical bypasses)
   * 2. Computes scheduledFor based on priority + quiet hours
   * 3. Creates notification record (23505 → suppressed, returns)
   * 4. Delivers immediately if scheduledFor <= now
   */
  async emit(event: NotificationEvent): Promise<void> {
    const now     = new Date()
    const channel = event.channel ?? "email"

    // ── 1. Load product config (quiet hours + per-product Slack webhook) ────────
    let qh = DEFAULT_QUIET_HOURS
    let productSlackWebhookUrl: string | undefined
    try {
      const product = await findProductById(event.productId)
      if (product?.support_policy?.["quiet_hours"] !== undefined) {
        qh = parseQuietHours(product.support_policy["quiet_hours"])
      }
      // DEFERRED-12: decrypt per-product Slack webhook for operator mirroring
      const rawWebhook = product?.support_policy?.["slackWebhookUrl"] as string | undefined
      productSlackWebhookUrl = decryptSecret(rawWebhook) ?? undefined
    } catch (err) {
      logger.warn({ err, productId: event.productId }, "Failed to load product config — using defaults")
    }

    // ── 2. Compute scheduledFor ───────────────────────────────────────────────
    let scheduledFor: Date

    if (event.priority === "critical" || event.audienceType !== "end_user") {
      // Critical and all operator-facing notifications fire immediately.
      // For operators the console IS the inbox — batch windows don't apply.
      // Quiet hours are for end-user outbound messages only.
      scheduledFor = now
    } else if (event.priority === "high") {
      // end_user high: 15-minute batch window, then quiet hours check
      const candidate = new Date(now.getTime() + 15 * 60 * 1000)
      scheduledFor = isInQuietHours(candidate, qh)
        ? quietHoursEndTime(candidate, qh)
        : candidate
    } else {
      // end_user normal / low → next digest window, then quiet hours check
      const candidate = nextDigestWindow(now)
      scheduledFor = isInQuietHours(candidate, qh)
        ? quietHoursEndTime(candidate, qh)
        : candidate
    }

    // ── 3. Compute ack settings ───────────────────────────────────────────────
    const ackRequired = event.ackRequired ?? (event.priority !== "low")
    const ackDeadline = ackRequired ? ackDeadlineForPriority(scheduledFor, event.priority) : undefined

    // ── 3b. Priority upgrade — suppress pending lower-priority duplicates ──────
    if (event.priority !== "low") {
      const suppressed = await suppressLowerPriorityPending(
        event.productId,
        event.kind,
        event.sourceType,
        event.sourceRef,
        event.priority,
      )
      if (suppressed > 0) {
        logger.info(
          { productId: event.productId, kind: event.kind, sourceRef: event.sourceRef, suppressed, newPriority: event.priority },
          "Suppressed lower-priority pending notifications (priority upgrade)",
        )
      }
    }

    // ── 4. Persist notification record ────────────────────────────────────────
    const notif = await createNotification({
      product_id:    event.productId,
      kind:          event.kind,
      priority:      event.priority,
      audience_type: event.audienceType,
      recipient_ref: event.recipientRef,
      source_type:   event.sourceType,
      source_ref:    event.sourceRef,
      subject:       event.subject,
      body:          event.body,
      scheduled_for: scheduledFor,
      ack_required:  ackRequired,
      channel,
      ...(event.correlationId !== undefined ? { correlation_id: event.correlationId } : {}),
      ...(ackDeadline !== undefined         ? { ack_deadline:   ackDeadline         } : {}),
    })

    if (notif === null) {
      // Duplicate suppressed by dedup index — nothing more to do
      return
    }

    // ── 5. Deliver immediately if scheduledFor <= now ─────────────────────────
    if (scheduledFor <= now) {
      try {
        // Apply AI disclosure for end-user-facing notifications (CG-01)
        let messageBody = event.body
        if (event.audienceType === "end_user") {
          const disclosureContext: DisclosureContext =
            event.kind === "user_follow_up"          ? "auto_reply"    :
            event.kind === "clarification_request"   ? "clarification" :
            event.kind === "resolution_message"      ? "resolution"    :
            "notification"

          const disclosureChannel: DisclosureChannel =
            channel === "telegram" ? "telegram" :
            channel === "slack"    ? "slack"    :
            "email"

          // Load product for name + disclosure overrides
          let productName = event.productId
          let disclosureOverrides: DisclosureTemplates | null = null
          try {
            const prod = await findProductById(event.productId)
            if (prod) {
              productName = prod.name
              const agentConfig = prod.agent_config as Record<string, unknown> | null
              disclosureOverrides = (agentConfig?.["disclosure_templates"] as DisclosureTemplates) ?? null
            }
          } catch { /* use defaults */ }

          messageBody = applyDisclosure(messageBody, {
            channel: disclosureChannel,
            context: disclosureContext,
            productName,
          }, disclosureOverrides)
        }

        const slackColor = priorityColor(event.priority)
        const sent = await dispatchMessage(
          channel, event.recipientRef, event.subject, messageBody,
          {
            slackColor,
            ...(productSlackWebhookUrl !== undefined ? { slackWebhookUrl: productSlackWebhookUrl } : {}),
          },
        )

        if (sent) {
          await updateNotification(notif.notification_id, {
            status:  "sent",
            sent_at: new Date(),
          })

          // DEFERRED-12: Mirror operator notifications to Slack alongside the primary channel.
          // Fires when: primary channel is not already Slack, audience is not end_user,
          // and Slack is configured (per-product webhook or global env).
          if (channel !== "slack" && event.audienceType !== "end_user") {
            const mirrorAvailable = !!(productSlackWebhookUrl || config.SLACK_WEBHOOK_URL || config.SLACK_BOT_TOKEN)
            if (mirrorAvailable) {
              sendSlack(
                { text: messageBody, subject: event.subject, color: slackColor },
                productSlackWebhookUrl ? { webhookUrl: productSlackWebhookUrl } : undefined,
              ).catch((err: unknown) => {
                logger.warn({ err, notificationId: notif.notification_id }, "Slack mirror delivery failed (non-fatal)")
              })
            }
          }
        } else if (event.audienceType !== "end_user") {
          // Transport not configured, but operator-facing notifications are delivered
          // via the console inbox the moment they are created — mark as sent.
          await updateNotification(notif.notification_id, {
            status:  "sent",
            sent_at: new Date(),
          })
          logger.info(
            { notificationId: notif.notification_id, kind: event.kind, channel },
            "Notification transport not configured — marked sent (console inbox delivery)",
          )
        } else {
          // end_user transport not configured — leave pending for later flush
          logger.info(
            { notificationId: notif.notification_id, kind: event.kind, channel },
            "Notification skipped (transport not configured) — remains pending",
          )
        }
      } catch (deliveryErr) {
        const errorMessage =
          deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr)
        logger.error(
          { deliveryErr, notificationId: notif.notification_id },
          "Notification delivery failed",
        )
        await updateNotification(notif.notification_id, {
          status:        "failed",
          error_message: errorMessage,
        })
      }
    } else {
      logger.info(
        {
          notificationId: notif.notification_id,
          kind:           event.kind,
          priority:       event.priority,
          channel,
          scheduledFor:   scheduledFor.toISOString(),
        },
        "Notification scheduled for future delivery",
      )
    }
  }

  /**
   * Flush all pending notifications for a product whose scheduled_for <= now.
   * Groups by audienceType and sends one digest message per group per recipient.
   * Channel is read from each stored notification record.
   * Marks all flushed notifications as sent.
   */
  async flushDigest(productId: string): Promise<void> {
    const now = new Date()
    const pending = await findPendingNotifications(productId, now)

    if (pending.length === 0) {
      logger.info({ productId }, "flushDigest: no pending notifications")
      return
    }

    // DEFERRED-12: load per-product Slack webhook so explicit slack-channel digests use the right URL
    let productSlackWebhookUrl: string | undefined
    try {
      const product = await findProductById(productId)
      const rawWebhook = product?.support_policy?.["slackWebhookUrl"] as string | undefined
      productSlackWebhookUrl = decryptSecret(rawWebhook) ?? undefined
    } catch { /* non-fatal — sendSlack falls back to env var */ }

    // Group by audienceType
    const byAudience = new Map<string, typeof pending>()
    for (const n of pending) {
      const existing = byAudience.get(n.audience_type) ?? []
      existing.push(n)
      byAudience.set(n.audience_type, existing)
    }

    for (const [audienceType, items] of byAudience) {
      // Collect unique recipient refs for this audience group
      const recipientSet = new Set<string>()
      for (const item of items) {
        recipientSet.add(item.recipient_ref)
      }

      // Build digest body
      const digestLines: string[] = [
        `NestFleet Digest — ${audienceType} (${items.length} item${items.length === 1 ? "" : "s"})`,
        `Generated: ${now.toUTCString()}`,
        "",
      ]

      for (const item of items) {
        digestLines.push(`[${item.priority.toUpperCase()}] ${item.kind} — ${item.subject ?? "(no subject)"}`)
        if (item.body) {
          digestLines.push(item.body)
        }
        digestLines.push(`Source: ${item.source_type}/${item.source_ref}`)
        digestLines.push("---")
      }

      const digestText    = digestLines.join("\n")
      const digestSubject = `NestFleet digest: ${items.length} notification${items.length === 1 ? "" : "s"} for ${audienceType}`

      // Send one message per unique recipient in this audience group.
      // Use the channel stored on the first item for this recipient.
      for (const recipient of recipientSet) {
        const recipientItems = items.filter(i => i.recipient_ref === recipient)
        const itemChannel = (recipientItems[0]?.channel ?? "email") as NotificationChannel

        let sent = false
        try {
          sent = await dispatchMessage(
            itemChannel, recipient, digestSubject, digestText,
            productSlackWebhookUrl ? { slackWebhookUrl: productSlackWebhookUrl } : undefined,
          )
        } catch (err) {
          logger.error({ err, productId, audienceType, recipient, channel: itemChannel }, "Digest delivery failed")
        }

        if (sent) {
          for (const item of recipientItems) {
            await updateNotification(item.notification_id, {
              status:  "sent",
              sent_at: new Date(),
            })
          }
          logger.info(
            { productId, audienceType, recipient, channel: itemChannel, count: recipientItems.length },
            "Digest sent",
          )
        }
      }
    }
  }
}
