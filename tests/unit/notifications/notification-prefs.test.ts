/**
 * Unit tests — FEAT-014: Notification Preferences email gate in NotificationService.emit()
 *
 * Tests:
 *   NP-U-01  email_disabled_events contains event.kind → dispatchMessage NOT called, notification marked "sent"
 *   NP-U-02  email_disabled_events empty → dispatchMessage called normally
 *   NP-U-03  email_disabled_events contains different kind → dispatchMessage still called
 *   NP-U-04  gate only applies to channel="email" (telegram not gated)
 *   NP-U-05  getNotificationPreferences throws → defaults to empty list (non-fatal)
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Mocks must be declared before imports ─────────────────────────────────────

vi.mock("../../../src/infra/db/repositories/products.js", () => ({
  findProductById: vi.fn(),
  getNotificationPreferences: vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/notifications.js", () => ({
  createNotification: vi.fn(),
  updateNotification: vi.fn(),
  suppressLowerPriorityPending: vi.fn(),
}))

vi.mock("../../../src/notifications/email-transport.js", () => ({
  sendEmail: vi.fn(),
}))

vi.mock("../../../src/notifications/telegram-transport.js", () => ({
  sendTelegram: vi.fn(),
}))

vi.mock("../../../src/notifications/slack-transport.js", () => ({
  sendSlack: vi.fn(),
}))

vi.mock("../../../src/shared/crypto.js", () => ({
  decryptSecret: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../src/shared/ai-disclosure.js", () => ({
  applyDisclosure: vi.fn((body: string) => body),
}))

import { NotificationService } from "../../../src/notifications/service.js"
import { findProductById, getNotificationPreferences } from "../../../src/infra/db/repositories/products.js"
import {
  createNotification,
  updateNotification,
  suppressLowerPriorityPending,
} from "../../../src/infra/db/repositories/notifications.js"
import { sendEmail } from "../../../src/notifications/email-transport.js"
import { sendTelegram } from "../../../src/notifications/telegram-transport.js"
import type { NotificationEvent } from "../../../src/notifications/service.js"

const mockFindProductById = vi.mocked(findProductById)
const mockGetNotificationPreferences = vi.mocked(getNotificationPreferences)
const mockCreateNotification = vi.mocked(createNotification)
const mockUpdateNotification = vi.mocked(updateNotification)
const mockSuppressLowerPriorityPending = vi.mocked(suppressLowerPriorityPending)
const mockSendEmail = vi.mocked(sendEmail)
const mockSendTelegram = vi.mocked(sendTelegram)

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRODUCT_ID = "prod_test123"

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    product_id: PRODUCT_ID,
    slug: "test-product",
    name: "Test Product",
    stage: "beta",
    support_policy: {},
    enabled_channels: ["email"],
    lead_assignments: {},
    llm_config: {},
    agent_config: {},
    ci_config: {},
    accent_color: "#6366f1",
    notification_preferences: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeNotifRow(id = "notif_001") {
  return {
    notification_id: id,
    product_id: PRODUCT_ID,
    kind: "approval_request" as const,
    priority: "high" as const,
    audience_type: "operator" as const,
    channel: "email" as const,
    recipient_ref: "ops@example.com",
    source_type: "case",
    source_ref: "case_001",
    correlation_id: null,
    subject: "Test Subject",
    body: "Test Body",
    status: "pending" as const,
    scheduled_for: new Date(Date.now() - 1000),
    sent_at: null,
    ack_required: true,
    ack_deadline: null,
    acked_at: null,
    acked_by: null,
    escalation_level: 0,
    retry_count: 0,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    productId:    PRODUCT_ID,
    kind:         "approval_request",
    priority:     "critical",
    audienceType: "operator",
    recipientRef: "ops@example.com",
    sourceType:   "case",
    sourceRef:    "case_001",
    subject:      "Test Subject",
    body:         "Test Body",
    channel:      "email",
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NotificationService.emit — email gate (FEAT-014)", () => {
  let service: NotificationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new NotificationService()

    mockFindProductById.mockResolvedValue(makeProduct())
    mockCreateNotification.mockResolvedValue(makeNotifRow())
    mockUpdateNotification.mockResolvedValue(makeNotifRow())
    mockSuppressLowerPriorityPending.mockResolvedValue(0)
    mockSendEmail.mockResolvedValue(true)
    mockSendTelegram.mockResolvedValue(true)
    // Default: preferences return empty disabled list
    mockGetNotificationPreferences.mockResolvedValue({ email_disabled_events: [] })
  })

  it("NP-U-01: email_disabled_events contains event.kind → dispatchMessage NOT called, notification marked sent", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      email_disabled_events: ["approval_request"],
    })

    await service.emit(makeEvent({ kind: "approval_request", channel: "email" }))

    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockUpdateNotification).toHaveBeenCalledWith(
      "notif_001",
      expect.objectContaining({ status: "sent", sent_at: expect.any(Date) }),
    )
  })

  it("NP-U-02: email_disabled_events empty → dispatchMessage called normally", async () => {
    mockGetNotificationPreferences.mockResolvedValue({ email_disabled_events: [] })

    await service.emit(makeEvent({ kind: "approval_request", channel: "email" }))

    expect(mockSendEmail).toHaveBeenCalledOnce()
  })

  it("NP-U-03: email_disabled_events contains different kind → dispatchMessage still called", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      email_disabled_events: ["case_triaged"],
    })

    await service.emit(makeEvent({ kind: "approval_request", channel: "email" }))

    expect(mockSendEmail).toHaveBeenCalledOnce()
  })

  it("NP-U-04: gate only applies to channel=email — telegram not gated even if kind is disabled", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      email_disabled_events: ["approval_request"],
    })

    await service.emit(makeEvent({ kind: "approval_request", channel: "telegram" }))

    expect(mockSendTelegram).toHaveBeenCalledOnce()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("NP-U-05: getNotificationPreferences throws → defaults to empty list (non-fatal, email sent)", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB error"))

    await service.emit(makeEvent({ kind: "approval_request", channel: "email" }))

    // Email should still be sent — failure is non-fatal
    expect(mockSendEmail).toHaveBeenCalledOnce()
  })
})
