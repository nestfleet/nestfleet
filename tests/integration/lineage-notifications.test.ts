/**
 * Integration tests: Lineage API — notification nodes in timeline — SLICE-07.
 *
 * Verifies that:
 *   - sent notifications appear in the lineage timeline as notification_sent nodes
 *   - suppressed notifications are excluded from the timeline
 *   - notification nodes carry the correct kind field in metadata
 *
 * NF-INT-80 through NF-INT-82.
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
import { createCase } from "../../src/infra/db/repositories/cases.js"
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

// ── Types for response assertions ─────────────────────────────────────────────

interface LineageNode {
  nodeId:     string
  type:       string
  occurredAt: string
  metadata:   Record<string, unknown>
}

interface LineageResponse {
  caseId:        string
  productId:     string
  currentStatus: string
  nodes:         LineageNode[]
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Lineage API — notification nodes (integration)", () => {
  let ctx: TestDbContext
  let productId:  string
  let caseId:     string
  let token:      string

  let sentNotificationId:        string
  let suppressedNotificationId:  string

  beforeAll(async () => {
    ctx = await setupTestDb()

    // Create product
    const product = await createProduct({
      name:             "Lineage Notifications Test Product",
      stage:            "beta",
      support_policy:   { github_repo: "test-org/lineage-notif-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "lead@test.com" },
    })
    productId = product.product_id
    token     = makeToken(productId)

    // Create a case to anchor notifications
    const caseRow = await createCase({
      product_id: productId,
      title:      "Lineage Notifications Test Case",
      status:     "triaged",
    })
    caseId = caseRow.case_id

    // Seed #1: a sent notification — must appear in lineage
    const sent = await createNotification({
      product_id:    productId,
      kind:          "approval_request",
      priority:      "high",
      audience_type: "change_lead",
      recipient_ref: "lead@test.com",
      source_type:   "case",
      source_ref:    caseId,
      subject:       "Approval needed for lineage test",
    })
    if (!sent) throw new Error("Failed to create sent notification fixture")
    await updateNotification(sent.notification_id, { status: "sent", sent_at: new Date() })
    sentNotificationId = sent.notification_id

    // Seed #2: a suppressed notification — must NOT appear in lineage
    const suppressed = await createNotification({
      product_id:    productId,
      kind:          "reminder",
      priority:      "normal",
      audience_type: "operator",
      recipient_ref: "ops@test.com",
      source_type:   "case",
      source_ref:    caseId,
      subject:       "Suppressed reminder",
    })
    if (!suppressed) throw new Error("Failed to create suppressed notification fixture")
    await updateNotification(suppressed.notification_id, { status: "suppressed" })
    suppressedNotificationId = suppressed.notification_id
  }, 60_000)

  afterAll(async () => {
    await ctx.teardown()
  })

  // NF-INT-80 ───────────────────────────────────────────────────────────────────

  it("NF-INT-80: Response includes notification_sent nodes for sent notifications", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseId}/lineage`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: LineageResponse }
    const nodes = body.data.nodes

    const sentNode = nodes.find((n) => n.nodeId === sentNotificationId)
    expect(sentNode).toBeDefined()
    expect(sentNode?.type).toBe("notification_sent")
  })

  // NF-INT-81 ───────────────────────────────────────────────────────────────────

  it("NF-INT-81: suppressed notifications do NOT appear in the lineage timeline", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseId}/lineage`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: LineageResponse }
    const nodes = body.data.nodes

    const suppressedNode = nodes.find((n) => n.nodeId === suppressedNotificationId)
    expect(suppressedNode).toBeUndefined()
  })

  // NF-INT-82 ───────────────────────────────────────────────────────────────────

  it("NF-INT-82: notification_sent nodes carry the correct kind field in metadata", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/cases/${caseId}/lineage`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { data: LineageResponse }
    const nodes = body.data.nodes

    const sentNode = nodes.find((n) => n.nodeId === sentNotificationId)
    expect(sentNode).toBeDefined()
    expect(sentNode?.metadata["kind"]).toBe("approval_request")
  })
})
