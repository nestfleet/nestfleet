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
