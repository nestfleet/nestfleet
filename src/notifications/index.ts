// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Notification Control Plane barrel — SLICE-07.
 * Import NotificationService and event types from this module.
 */

export { NotificationService } from "./service.js"
export type {
  NotificationEvent,
  NotificationChannel,
  NotificationKind,
  NotificationPriority,
  NotificationAudienceType,
} from "./service.js"
export { sendTelegram } from "./telegram-transport.js"
export { sendSlack } from "./slack-transport.js"
