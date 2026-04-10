/**
 * Integration tests — FEAT-014: Notification Preferences API
 *
 * NF-INT-NP-01  GET returns empty default { email_disabled_events: [] }
 * NF-INT-NP-02  PUT stores prefs, GET returns them
 * NF-INT-NP-03  Notification emitted for disabled event → console record created, email NOT sent
 * NF-INT-NP-04  requireAuth: GET without token → 401
 * NF-INT-NP-05  requireRole: GET with end_user token → 403
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

// Mock email so we can verify it is NOT called when suppressed
const mockSendEmail = vi.fn().mockResolvedValue(true)
vi.mock("../../src/notifications/email-transport.js", () => ({
  sendEmail: mockSendEmail,
}))

vi.mock("../../src/notifications/telegram-transport.js", () => ({
  sendTelegram: vi.fn().mockResolvedValue(false),
}))

vi.mock("../../src/notifications/slack-transport.js", () => ({
  sendSlack: vi.fn().mockResolvedValue(false),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { findNotificationsByProduct } from "../../src/infra/db/repositories/notifications.js"
import { NotificationService } from "../../src/notifications/service.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Token helpers ─────────────────────────────────────────────────────────────

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "test@example.com", roles, productIds: [productId] })
}

function makeEndUserToken(productId: string): string {
  return signJwt({ sub: "end-user", email: "user@example.com", roles: ["end_user"], productIds: [productId] })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Notification Preferences API (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let operatorToken: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "NotifPrefs Test Product",
      stage:            "beta",
      support_policy:   {},
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com" },
    })
    productId = product.product_id
    operatorToken = makeToken(["operator"], productId)
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue(true)
  })

  // ── NF-INT-NP-01: GET default ───────────────────────────────────────────────

  it("NF-INT-NP-01: GET returns empty default email_disabled_events", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { email_disabled_events: string[] } }
    expect(body.data).toBeDefined()
    expect(Array.isArray(body.data.email_disabled_events)).toBe(true)
    expect(body.data.email_disabled_events).toHaveLength(0)
  }, 30_000)

  // ── NF-INT-NP-02: PUT stores, GET returns ──────────────────────────────────

  it("NF-INT-NP-02: PUT stores prefs and GET returns them", async () => {
    const putRes = await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_disabled_events: ["case_triaged", "auto_reply_sent"] }),
      },
    )

    expect(putRes.status).toBe(200)
    const putBody = await putRes.json() as { data: { email_disabled_events: string[] } }
    expect(putBody.data.email_disabled_events).toEqual(["case_triaged", "auto_reply_sent"])

    // GET should return same
    const getRes = await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    )
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json() as { data: { email_disabled_events: string[] } }
    expect(getBody.data.email_disabled_events).toEqual(["case_triaged", "auto_reply_sent"])
  }, 30_000)

  // ── NF-INT-NP-03: Disabled email kind → console record, no email ───────────

  it("NF-INT-NP-03: disabled event kind → notification record created, email NOT sent", async () => {
    // Disable approval_request email
    await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_disabled_events: ["approval_request"] }),
      },
    )

    const service = new NotificationService()
    await service.emit({
      productId,
      kind:         "approval_request",
      priority:     "critical",
      audienceType: "operator",
      recipientRef: "ops@test.com",
      sourceType:   "case",
      sourceRef:    `case_np03_${Date.now()}`,
      subject:      "NP-03 approval",
      body:         "NP-03 body",
      channel:      "email",
    })

    // Email transport must NOT have been called
    expect(mockSendEmail).not.toHaveBeenCalled()

    // But a notification record must exist in the DB
    const records = await findNotificationsByProduct(productId, { kind: "approval_request" })
    const matchingRecord = records.find((r) => r.source_ref.startsWith("case_np03_"))
    expect(matchingRecord).toBeDefined()
    expect(matchingRecord?.status).toBe("sent")
  }, 30_000)

  // ── NF-INT-NP-04: No auth → 401 ────────────────────────────────────────────

  it("NF-INT-NP-04: GET without token returns 401", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
    )
    expect(res.status).toBe(401)
  }, 30_000)

  // ── NF-INT-NP-05: end_user role → 403 ─────────────────────────────────────

  it("NF-INT-NP-05: GET with end_user role returns 403", async () => {
    const token = makeEndUserToken(productId)
    const res = await app.request(
      `/api/v1/products/${productId}/notification-preferences`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(403)
  }, 30_000)
})
