/**
 * Integration tests: Notifications API filter params — SLICE-07.
 *
 * Tests GET /api/v1/products/:productId/notifications with status, kind,
 * priority, limit, and combined filter params against a real PostgreSQL
 * testcontainers instance.
 *
 * NF-INT-70 through NF-INT-76.
 */

import { vi } from "vitest"

// Prevent dispatcher from trying to connect to pg-boss during app import
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import {
  createNotification,
  updateNotification,
} from "../../src/infra/db/repositories/notifications.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(productId: string): string {
  return signJwt({
    sub:        "test-user",
    email:      "test@example.com",
    roles:      ["operator"],
    productIds: [productId],
  })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Notifications API — filter params (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let token: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "Notifications Filter Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/notif-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "lead@test.com" },
    })
    productId = product.product_id
    token = makeToken(productId)

    // Seed notifications covering all filter dimensions:
    //   #1  sent      + approval_request + high
    //   #2  pending   + reminder         + normal
    //   #3  sent      + reminder         + high
    //   #4  pending   + approval_request + normal
    //   #5  sent      + escalation_alert + high

    const caseRef = "case_notif_filter_test"

    const n1 = await createNotification({
      product_id:    productId,
      kind:          "approval_request",
      priority:      "high",
      audience_type: "change_lead",
      recipient_ref: "lead@test.com",
      source_type:   "case",
      source_ref:    caseRef,
      subject:       "Approval needed #1",
    })
    if (n1) {
      await updateNotification(n1.notification_id, { status: "sent", sent_at: new Date() })
    }

    await createNotification({
      product_id:    productId,
      kind:          "reminder",
      priority:      "normal",
      audience_type: "operator",
      recipient_ref: "ops@test.com",
      source_type:   "case",
      source_ref:    caseRef,
      subject:       "Reminder #2",
    })
    // status stays pending (default)

    const n3 = await createNotification({
      product_id:    productId,
      kind:          "reminder",
      priority:      "high",
      audience_type: "operator",
      recipient_ref: "ops@test.com",
      source_type:   "case",
      source_ref:    "case_notif_filter_test_b",
      subject:       "Reminder #3 high",
    })
    if (n3) {
      await updateNotification(n3.notification_id, { status: "sent", sent_at: new Date() })
    }

    await createNotification({
      product_id:    productId,
      kind:          "approval_request",
      priority:      "normal",
      audience_type: "change_lead",
      recipient_ref: "lead@test.com",
      source_type:   "case",
      source_ref:    "case_notif_filter_test_c",
      subject:       "Approval needed #4",
    })
    // status stays pending

    const n5 = await createNotification({
      product_id:    productId,
      kind:          "escalation_alert",
      priority:      "high",
      audience_type: "support_lead",
      recipient_ref: "support@test.com",
      source_type:   "case",
      source_ref:    "case_notif_filter_test_d",
      subject:       "Escalation #5",
    })
    if (n5) {
      await updateNotification(n5.notification_id, { status: "sent", sent_at: new Date() })
    }
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // NF-INT-70: no filters — returns all 5 notifications ─────────────────────────

  it("NF-INT-70: No filters returns all seeded notifications (respects default limit=50)", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[]; meta: { count: number } }
    expect(body.data.length).toBeGreaterThanOrEqual(5)
    expect(body.meta.count).toBe(body.data.length)
  })

  // NF-INT-71: ?status=sent ──────────────────────────────────────────────────────

  it("NF-INT-71: ?status=sent returns only sent notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?status=sent`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ status: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const notif of body.data) {
      expect(notif.status).toBe("sent")
    }
  })

  // NF-INT-72: ?status=pending ───────────────────────────────────────────────────

  it("NF-INT-72: ?status=pending returns only pending notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?status=pending`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ status: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const notif of body.data) {
      expect(notif.status).toBe("pending")
    }
  })

  // NF-INT-73: ?priority=high ───────────────────────────────────────────────────

  it("NF-INT-73: ?priority=high returns only high priority notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?priority=high`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ priority: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const notif of body.data) {
      expect(notif.priority).toBe("high")
    }
  })

  // NF-INT-74: ?kind=approval_request ──────────────────────────────────────────

  it("NF-INT-74: ?kind=approval_request returns only approval_request kind notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?kind=approval_request`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ kind: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const notif of body.data) {
      expect(notif.kind).toBe("approval_request")
    }
  })

  // NF-INT-75: ?limit=2 ─────────────────────────────────────────────────────────

  it("NF-INT-75: ?limit=2 returns at most 2 rows", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?limit=2`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[]; meta: { limit: number } }
    expect(body.data.length).toBeLessThanOrEqual(2)
    expect(body.meta.limit).toBe(2)
  })

  // NF-INT-76: ?status=sent&priority=high ───────────────────────────────────────

  it("NF-INT-76: ?status=sent&priority=high returns only sent+high notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/notifications?status=sent&priority=high`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ status: string; priority: string }> }
    expect(body.data.length).toBeGreaterThan(0)
    for (const notif of body.data) {
      expect(notif.status).toBe("sent")
      expect(notif.priority).toBe("high")
    }
  })
})
