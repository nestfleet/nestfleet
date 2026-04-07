/**
 * Integration tests: Slack auto-mirror in NotificationService — DEFERRED-12.
 *
 * After a successful primary-channel dispatch for an operator-audience event,
 * service.emit() fires a best-effort Slack mirror.  These tests verify:
 *
 * NF-INT-SM-01  mirror fires for email → operator when global SLACK_WEBHOOK_URL set
 * NF-INT-SM-02  mirror is suppressed for end_user audience
 * NF-INT-SM-03  mirror is suppressed when primary channel is already Slack
 * NF-INT-SM-04  mirror uses per-product webhook URL (takes priority over env)
 * NF-INT-SM-05  mirror falls back to SLACK_BOT_TOKEN when no webhook configured
 * NF-INT-SM-06  mirror failure is non-fatal — primary dispatch still resolves
 * NF-INT-SM-07  mirror not fired when no Slack credentials at all
 */

import { vi } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

vi.mock("../../src/notifications/email-transport.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../src/notifications/slack-transport.js", () => ({
  sendSlack: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../src/notifications/telegram-transport.js", () => ({
  sendTelegram: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../src/email/sender.js", () => ({
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct, updateProduct } from "../../src/infra/db/repositories/products.js"
import { NotificationService } from "../../src/notifications/service.js"
import { sendSlack } from "../../src/notifications/slack-transport.js"
import { config } from "../../src/shared/config.js"
import { encryptSecret } from "../../src/shared/crypto.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mutate the real config object at runtime — avoids breaking pino logger
// (which reads config.LOG_LEVEL at module initialisation time).
function setSlackConfig(overrides: {
  SLACK_WEBHOOK_URL?: string
  SLACK_BOT_TOKEN?: string
  SLACK_DEFAULT_CHANNEL?: string
}): void {
  (config as Record<string, unknown>).SLACK_WEBHOOK_URL     = overrides.SLACK_WEBHOOK_URL
  ;(config as Record<string, unknown>).SLACK_BOT_TOKEN      = overrides.SLACK_BOT_TOKEN
  ;(config as Record<string, unknown>).SLACK_DEFAULT_CHANNEL = overrides.SLACK_DEFAULT_CHANNEL
}

function clearSlackConfig(): void {
  setSlackConfig({})
}

function operatorEvent(productId: string, overrides: Record<string, unknown> = {}) {
  return {
    productId,
    kind: "escalation_alert" as const,
    priority: "critical" as const,
    audienceType: "support_lead" as const,
    recipientRef: "lead@example.com",
    sourceType: "case",
    sourceRef: "case_test",
    subject: "Case escalated",
    body: "Needs urgent attention.",
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Slack auto-mirror (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let service: NotificationService

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "MirrorTestProduct", stage: "beta",
      support_policy: { quiet_hours: { start: 0, end: 0, timezone: "UTC", weekends: false } },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@example.com" },
    })
    productId = product.product_id
    service = new NotificationService()
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  beforeEach(() => {
    vi.mocked(sendSlack).mockClear()
    vi.mocked(sendSlack).mockResolvedValue(true)
    clearSlackConfig()
  })

  it("NF-INT-SM-01: mirror fires for email → operator when global SLACK_WEBHOOK_URL set", async () => {
    setSlackConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/sm01" })

    await service.emit(operatorEvent(productId, { sourceRef: "case_sm01" }))

    expect(vi.mocked(sendSlack)).toHaveBeenCalled()
  }, 30_000)

  it("NF-INT-SM-02: mirror is suppressed for end_user audience", async () => {
    setSlackConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/sm02" })

    await service.emit(operatorEvent(productId, {
      sourceRef: "case_sm02",
      audienceType: "end_user",
      kind: "user_follow_up",
    }))

    // Mirror must NOT fire for end_user audience
    expect(vi.mocked(sendSlack)).not.toHaveBeenCalled()
  }, 30_000)

  it("NF-INT-SM-03: mirror is suppressed when primary channel is already Slack", async () => {
    setSlackConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/sm03" })

    await service.emit(operatorEvent(productId, {
      sourceRef: "case_sm03",
      channel: "slack",
    }))

    // With channel=slack, only the primary call happens — no second mirror call.
    // sendSlack may be called once (primary), but never a second time as mirror.
    const callCount = vi.mocked(sendSlack).mock.calls.length
    expect(callCount).toBeLessThanOrEqual(1)
  }, 30_000)

  it("NF-INT-SM-04: mirror uses per-product webhook URL (overrides env)", async () => {
    const perProductUrl = "https://hooks.slack.com/services/T/B/per-product-sm04"
    await updateProduct(productId, {
      support_policy: {
        quiet_hours: { start: 0, end: 0, timezone: "UTC", weekends: false },
        slackWebhookUrl: encryptSecret(perProductUrl),
      },
    })
    setSlackConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/global-sm04" })

    await service.emit(operatorEvent(productId, { sourceRef: "case_sm04" }))

    const calls = vi.mocked(sendSlack).mock.calls as Array<[unknown, { webhookUrl?: string } | undefined]>
    const usedPerProduct = calls.some(([, opts]) => opts?.webhookUrl === perProductUrl)
    expect(usedPerProduct).toBe(true)

    // Clean up per-product webhook
    await updateProduct(productId, {
      support_policy: { quiet_hours: { start: 0, end: 0, timezone: "UTC", weekends: false } },
    })
  }, 30_000)

  it("NF-INT-SM-05: mirror fires via SLACK_BOT_TOKEN fallback", async () => {
    setSlackConfig({ SLACK_BOT_TOKEN: "xoxb-test-sm05", SLACK_DEFAULT_CHANNEL: "#ops" })

    await service.emit(operatorEvent(productId, { sourceRef: "case_sm05" }))

    expect(vi.mocked(sendSlack)).toHaveBeenCalled()
  }, 30_000)

  it("NF-INT-SM-06: mirror failure is non-fatal — emit() resolves normally", async () => {
    setSlackConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/sm06" })
    vi.mocked(sendSlack).mockRejectedValue(new Error("Slack down"))

    await expect(
      service.emit(operatorEvent(productId, { sourceRef: "case_sm06" })),
    ).resolves.not.toThrow()
  }, 30_000)

  it("NF-INT-SM-07: mirror not fired when no Slack credentials configured", async () => {
    clearSlackConfig() // no SLACK_WEBHOOK_URL, no SLACK_BOT_TOKEN

    await service.emit(operatorEvent(productId, { sourceRef: "case_sm07" }))

    expect(vi.mocked(sendSlack)).not.toHaveBeenCalled()
  }, 30_000)
})
