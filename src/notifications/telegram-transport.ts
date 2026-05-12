// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Telegram transport for the notification control plane — SLICE-25.
 *
 * Uses the Telegram Bot API sendMessage endpoint.
 * Parse mode is HTML — callers are responsible for HTML-safe content.
 *
 * Best-effort: errors are logged as warn and return false — never throws.
 * Returns false immediately if TELEGRAM_BOT_TOKEN is not configured.
 */

import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

export interface TelegramMessage {
  chatId: string
  text:   string
}

/**
 * Send a message via the Telegram Bot API.
 * Returns true on successful delivery, false if not configured or on error.
 */
export async function sendTelegram(msg: TelegramMessage): Promise<boolean> {
  const token = config.TELEGRAM_BOT_TOKEN

  if (!token) {
    logger.info(
      { chatId: msg.chatId },
      "telegram transport not configured — skipping delivery",
    )
    return false
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`

  try {
    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chat_id:    msg.chatId,
        text:       msg.text,
        parse_mode: "HTML",
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)")
      logger.warn(
        { chatId: msg.chatId, status: response.status, errorBody },
        "Telegram API returned non-OK status",
      )
      return false
    }

    logger.info({ chatId: msg.chatId }, "Telegram message sent")
    return true
  } catch (err) {
    logger.warn({ err, chatId: msg.chatId }, "Telegram delivery failed")
    return false
  }
}
