// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Slack transport for the notification control plane — SLICE-26.
 *
 * Priority order:
 *   1. SLACK_WEBHOOK_URL is set → POST to Incoming Webhook URL
 *   2. SLACK_BOT_TOKEN is set   → POST to chat.postMessage with Bearer auth;
 *                                  channel from message or SLACK_DEFAULT_CHANNEL
 *   3. Neither set              → log info and return false (non-fatal)
 *
 * Best-effort: errors are logged as warn and return false — never throws.
 */

import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

export interface SlackMessage {
  /** Slack channel ID or name (e.g. "C01ABC123" or "#alerts").
   *  Required in bot-token mode when SLACK_DEFAULT_CHANNEL is not set.
   *  Ignored in webhook mode — the webhook is already bound to a channel. */
  channel?: string
  /** Plain-text body of the message (also used as fallback when blocks are provided). */
  text: string
  /** Optional subject line — rendered as a bold header above the body. */
  subject?: string
  /** Optional Block Kit blocks for rich message formatting. When provided,
   *  the plain `text` field is used as the fallback for notifications. */
  blocks?: object[]
  /** Optional sidebar color for the attachment (hex, e.g. "#ef4444"). */
  color?: string
}

export interface SendSlackOptions {
  /** Override the webhook URL (e.g. per-product DB-stored URL). Falls back to env config. */
  webhookUrl?: string
}

/**
 * Send a Slack message using whichever transport is configured.
 * Returns true on successful delivery, false if unconfigured or on error.
 */
export async function sendSlack(msg: SlackMessage, opts?: SendSlackOptions): Promise<boolean> {
  const payload = buildPayload(msg)

  // ── 1. Webhook mode: per-product override > env var ─────────────────────────
  const webhookUrl = opts?.webhookUrl ?? config.SLACK_WEBHOOK_URL
  if (webhookUrl) {
    return sendViaWebhook(payload, webhookUrl)
  }

  // ── 2. Bot API mode ─────────────────────────────────────────────────────────
  if (config.SLACK_BOT_TOKEN) {
    const channel = msg.channel ?? config.SLACK_DEFAULT_CHANNEL
    if (!channel) {
      logger.warn(
        { subject: msg.subject },
        "Slack bot-token mode: no channel provided and SLACK_DEFAULT_CHANNEL not set — skipping delivery",
      )
      return false
    }
    return sendViaBotApi(payload, config.SLACK_BOT_TOKEN, channel)
  }

  // ── 3. Neither configured ───────────────────────────────────────────────────
  logger.info(
    { subject: msg.subject },
    "Slack transport not configured — skipping delivery",
  )
  return false
}

// ── Internal ───────────────────────────────────────────────────────────────────

/**
 * Build the Slack payload.
 * Priority: caller-provided blocks → auto Block Kit when subject present → plain text.
 * All variants use colored sidebar attachments for visual severity cues.
 */
function buildPayload(msg: SlackMessage): Record<string, unknown> {
  const fallbackText = msg.subject ? `*${msg.subject}*\n${msg.text}` : msg.text
  const color        = msg.color ?? "#4f46e5"

  // Caller-provided blocks — wrap in attachment for sidebar color
  if (msg.blocks && msg.blocks.length > 0) {
    return {
      text: fallbackText,
      attachments: [{ color, blocks: msg.blocks }],
    }
  }

  // Auto Block Kit: colored sidebar + bold title + body text
  if (msg.subject) {
    const blocks: object[] = [
      { type: "section", text: { type: "mrkdwn", text: `*${msg.subject}*` } },
      { type: "section", text: { type: "mrkdwn", text: msg.text } },
    ]
    return {
      text: fallbackText,
      attachments: [{ color, blocks }],
    }
  }

  return { text: fallbackText }
}

async function sendViaWebhook(payload: Record<string, unknown>, webhookUrl: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)")
      logger.warn(
        { status: response.status, body },
        "Slack webhook delivery failed — non-2xx response",
      )
      return false
    }

    logger.info({ mode: "webhook" }, "Slack message sent")
    return true
  } catch (err) {
    logger.warn({ err }, "Slack webhook delivery failed")
    return false
  }
}

async function sendViaBotApi(payload: Record<string, unknown>, botToken: string, channel: string): Promise<boolean> {
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json; charset=utf-8",
        "Authorization": `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, ...payload }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)")
      logger.warn(
        { status: response.status, body, channel },
        "Slack bot API delivery failed — non-2xx response",
      )
      return false
    }

    // Slack's chat.postMessage always returns 200, but encodes errors in JSON body
    const json = (await response.json()) as { ok: boolean; error?: string }
    if (!json.ok) {
      logger.warn({ slackError: json.error, channel }, "Slack bot API delivery failed — API error in response body")
      return false
    }

    logger.info({ mode: "bot_api", channel }, "Slack message sent")
    return true
  } catch (err) {
    logger.warn({ err, channel }, "Slack bot API delivery failed")
    return false
  }
}
