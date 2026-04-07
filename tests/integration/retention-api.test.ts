/**
 * Integration tests: Retention & Deletion API — CG-03.
 * NF-INT-200 through NF-INT-207.
 *
 * Covers:
 *   DELETE /api/v1/products/:productId/cases/:caseId   — single case deletion with propagation
 *   POST   /api/v1/products/:productId/retention/run   — retention sweep
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase, findCaseById } from "../../src/infra/db/repositories/cases.js"
import { createSignal } from "../../src/infra/db/repositories/signals.js"
import { createNotification } from "../../src/infra/db/repositories/notifications.js"
import { createAuditEvent } from "../../src/infra/db/repositories/audit-events.js"
import { createChangeRequest } from "../../src/infra/db/repositories/change-requests.js"
import { getDb } from "../../src/infra/db/client.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "admin@test.com", roles, productIds: [productId] })
}

describe("Retention & Deletion API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "Retention Test Product",
      stage: "beta",
      support_policy: { retentionDays: 90 },
      enabled_channels: ["email"],
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── DELETE /cases/:caseId ──────────────────────────────────────────────────

  it("NF-INT-200: DELETE case returns 200 and caseDeleted=true", async () => {
    const caseRow = await createCase({ product_id: productId, title: "Delete me", status: "new" })
    const token = makeToken(["admin"], productId)

    const res = await app.request(`/api/v1/products/${productId}/cases/${caseRow.case_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.caseDeleted).toBe(true)
    expect(data.caseId).toBe(caseRow.case_id)
  }, 30_000)

  it("NF-INT-201: DELETE case propagates — removes linked records, anonymises audit events", async () => {
    const db = getDb()
    const caseRow = await createCase({ product_id: productId, title: "Propagation test", status: "new" })
    const caseId = caseRow.case_id

    // Seed linked data
    const signal = await createSignal({
      product_id: productId, source_type: "email",
      raw_payload: { text: "test" }, case_id: caseId,
    })
    const notification = await createNotification({
      product_id: productId, kind: "status_update", priority: "normal",
      audience_type: "operator", recipient_ref: "op@test.com",
      source_type: "case", source_ref: caseId,
    })
    const auditEvent = await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: caseId,
      actor_type: "user", actor_ref: "admin@test.com", action: "case.created",
      before_state: { status: "new" }, after_state: { status: "open" },
    })

    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const data = (await res.json() as Record<string, unknown>).data as Record<string, unknown>
    expect(data.signalsDeleted).toBeGreaterThanOrEqual(1)
    expect(data.notificationsDeleted).toBeGreaterThanOrEqual(1)
    expect(data.auditEventsAnonymised).toBeGreaterThanOrEqual(1)

    // Case is gone
    const deletedCase = await findCaseById(caseId)
    expect(deletedCase).toBeNull()

    // Signal is gone
    const [sigRow] = await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM signals WHERE signal_id = ${signal.signal_id}
    `
    expect(sigRow?.count).toBe(0)

    // Notification is gone
    const [notifRow] = await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM notifications WHERE notification_id = ${notification.notification_id}
    `
    expect(notifRow?.count).toBe(0)

    // Audit event preserved but anonymised
    const [aeRow] = await db<{ before_state: unknown; after_state: unknown; metadata: Record<string, unknown> }[]>`
      SELECT before_state, after_state, metadata
      FROM audit_events WHERE audit_event_id = ${auditEvent.audit_event_id}
    `
    expect(aeRow).toBeDefined()
    expect(aeRow?.before_state).toBeNull()
    expect(aeRow?.after_state).toBeNull()
    expect(aeRow?.metadata._anonymised).toBe(true)
  }, 30_000)

  it("NF-INT-202: DELETE case returns 404 for unknown caseId", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/cases/case_nonexistent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(404)
  }, 30_000)

  it("NF-INT-203: DELETE case returns 401 without auth", async () => {
    const caseRow = await createCase({ product_id: productId, title: "Auth test", status: "new" })
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseRow.case_id}`, {
      method: "DELETE",
    })
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-204: DELETE case returns 403 for non-admin role", async () => {
    const caseRow = await createCase({ product_id: productId, title: "RBAC test", status: "new" })
    const token = makeToken(["operator"], productId)
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseRow.case_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  }, 30_000)

  // ── POST /retention/run ────────────────────────────────────────────────────

  it("NF-INT-205: POST retention/run deletes cases past the retention window", async () => {
    const db = getDb()

    // Create a case closed well past the 90-day window (200 days ago)
    const expiredCase = await createCase({
      product_id: productId, title: "Expired case",
      status: "closed",
    })
    await db`
      UPDATE cases SET closed_at = now() - interval '200 days'
      WHERE case_id = ${expiredCase.case_id}
    `

    const token = makeToken(["admin"], productId)
    const res = await app.request(`/api/v1/products/${productId}/retention/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.retentionDays).toBe(90)
    expect((data.casesFound as number)).toBeGreaterThanOrEqual(1)
    expect((data.casesDeleted as number)).toBeGreaterThanOrEqual(1)

    // Expired case is gone
    const found = await findCaseById(expiredCase.case_id)
    expect(found).toBeNull()
  }, 30_000)

  it("NF-INT-206: POST retention/run skips cases within the retention window", async () => {
    // Create a case closed 10 days ago (within 90-day window)
    const db = getDb()
    const recentCase = await createCase({
      product_id: productId, title: "Recent closed case",
      status: "closed",
    })
    await db`
      UPDATE cases SET closed_at = now() - interval '10 days'
      WHERE case_id = ${recentCase.case_id}
    `

    const countBefore = (await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM cases WHERE case_id = ${recentCase.case_id}
    `)[0]?.count

    const token = makeToken(["admin"], productId)
    await app.request(`/api/v1/products/${productId}/retention/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    const countAfter = (await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM cases WHERE case_id = ${recentCase.case_id}
    `)[0]?.count

    expect(countBefore).toBe(1)
    expect(countAfter).toBe(1)  // still present
  }, 30_000)

  it("NF-INT-207: POST retention/run returns 401 without auth", async () => {
    const res = await app.request(`/api/v1/products/${productId}/retention/run`, {
      method: "POST",
    })
    expect(res.status).toBe(401)
  }, 30_000)
})
