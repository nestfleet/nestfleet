/**
 * Integration tests: DSAR API — CG-04.
 * NF-INT-210 through NF-INT-219.
 *
 * Covers:
 *   GET /api/v1/products/:productId/dsar/search?identity=<query>
 *   GET /api/v1/products/:productId/dsar/export?identity=<query>&format=json|csv
 *
 * Search modes tested: exact email, display_name ILIKE, @telegram handle.
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
import { createIdentity } from "../../src/infra/db/repositories/identities.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { createSignal } from "../../src/infra/db/repositories/signals.js"
import { createNotification } from "../../src/infra/db/repositories/notifications.js"
import { createAuditEvent } from "../../src/infra/db/repositories/audit-events.js"
import { signJwt } from "../../src/auth/jwt.js"

function makeToken(roles: string[], productId: string): string {
  return signJwt({ sub: "test-user", email: "admin@test.com", roles, productIds: [productId] })
}

describe("DSAR API (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  // Seeded identity data reused across search-mode tests
  const TEST_EMAIL    = "alice@dsar-test.local"
  const TEST_NAME     = "Alice Wonderland"
  const TEST_TELEGRAM = "alice_w"

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "DSAR Test Product", stage: "beta",
      enabled_channels: ["email"],
    })
    productId = product.product_id

    // Create identity with email, display_name, and telegram handle
    const identity = await createIdentity({
      product_id: productId, type: "end_user",
      display_name: TEST_NAME,
      email_addresses: [TEST_EMAIL],
      telegram_handles: [TEST_TELEGRAM],
    })

    // Create linked case
    const caseRow = await createCase({
      product_id: productId,
      title: "Alice support case",
      status: "new",
      reporter_identity_id: identity.identity_id,
    })

    // Signal linked to identity
    await createSignal({
      product_id: productId, source_type: "email",
      raw_payload: { text: "help" }, identity_id: identity.identity_id,
    })

    // Notification sent to Alice's email
    await createNotification({
      product_id: productId, kind: "status_update", priority: "normal",
      audience_type: "end_user", recipient_ref: TEST_EMAIL,
      source_type: "case", source_ref: caseRow.case_id,
    })

    // Audit event with actor_ref = Alice's email
    await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: caseRow.case_id,
      actor_type: "user", actor_ref: TEST_EMAIL, action: "case.created",
      before_state: {}, after_state: { status: "open" },
    })

    // Anonymised audit event — should NOT appear in DSAR results
    await createAuditEvent({
      product_id: productId, entity_type: "case", entity_ref: caseRow.case_id,
      actor_type: "user", actor_ref: TEST_EMAIL, action: "case.anonymised",
      before_state: undefined, after_state: undefined,  // simulates anonymised (null states)
    })
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── Search — exact email ───────────────────────────────────────────────────

  it("NF-INT-210: GET dsar/search by exact email returns matching identity and linked records", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent(TEST_EMAIL)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    const summary = data.summary as Record<string, number>
    expect(summary.identities).toBeGreaterThanOrEqual(1)
    expect(summary.cases).toBeGreaterThanOrEqual(1)
    expect(summary.signals).toBeGreaterThanOrEqual(1)
    expect(summary.notifications).toBeGreaterThanOrEqual(1)
    expect(summary.auditEvents).toBeGreaterThanOrEqual(1)
    expect(data.identity).toBe(TEST_EMAIL)
  }, 30_000)

  // ── Search — display_name ILIKE ────────────────────────────────────────────

  it("NF-INT-211: GET dsar/search by display_name partial match returns identity", async () => {
    const token = makeToken(["admin"], productId)
    // Search by first name only — exercises ILIKE %Alice%
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=Alice`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    const summary = data.summary as Record<string, number>
    expect(summary.identities).toBeGreaterThanOrEqual(1)
    // Canonical identity should resolve to the matched email, not the search term
    expect(data.identity).toBe(TEST_EMAIL)
    expect(data.query).toBe("Alice")
  }, 30_000)

  // ── Search — telegram handle ───────────────────────────────────────────────

  it("NF-INT-212: GET dsar/search by @telegram handle (with prefix) returns identity", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent("@" + TEST_TELEGRAM)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const summary = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).summary as Record<string, number>
    expect(summary.identities).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("NF-INT-212b: GET dsar/search by telegram handle (without @) returns identity", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${TEST_TELEGRAM}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const summary = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).summary as Record<string, number>
    expect(summary.identities).toBeGreaterThanOrEqual(1)
  }, 30_000)

  // ── Search — unknown identity ──────────────────────────────────────────────

  it("NF-INT-213: GET dsar/search for unknown identity returns all-zero summary", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=nobody%40nowhere.invalid`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const summary = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).summary as Record<string, number>
    const total = Object.values(summary).reduce((s, v) => s + v, 0)
    expect(total).toBe(0)
  }, 30_000)

  // ── Auth / RBAC ────────────────────────────────────────────────────────────

  it("NF-INT-214: GET dsar/search returns 401 without auth", async () => {
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent(TEST_EMAIL)}`,
    )
    expect(res.status).toBe(401)
  }, 30_000)

  it("NF-INT-215: GET dsar/search returns 403 for non-admin role", async () => {
    const token = makeToken(["operator"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent(TEST_EMAIL)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(403)
  }, 30_000)

  it("NF-INT-215b: GET dsar/search returns 400 for query shorter than 2 chars", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=a`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(400)
  }, 30_000)

  // ── Export — JSON ──────────────────────────────────────────────────────────

  it("NF-INT-216: GET dsar/export JSON returns file with correct top-level structure", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/export?identity=${encodeURIComponent(TEST_EMAIL)}&format=json`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(res.headers.get("content-disposition")).toContain("attachment")

    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty("identity")
    expect(body).toHaveProperty("generatedAt")
    expect(body).toHaveProperty("summary")
    expect(body).toHaveProperty("data")
    expect((body.data as Record<string, unknown[]>).identities).toBeInstanceOf(Array)
  }, 30_000)

  // ── Export — CSV ───────────────────────────────────────────────────────────

  it("NF-INT-217: GET dsar/export CSV returns multi-section file", async () => {
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/export?identity=${encodeURIComponent(TEST_EMAIL)}&format=csv`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("content-disposition")).toContain("attachment")

    const text = await res.text()
    // Must contain at least one section header
    expect(text).toMatch(/^## \w+/m)
    // Must contain at least one data row (comma-separated)
    expect(text).toMatch(/,/)
  }, 30_000)

  // ── Anonymised audit events excluded ──────────────────────────────────────

  it("NF-INT-218: GET dsar/search excludes anonymised audit events (before_state IS NULL)", async () => {
    // We created one normal audit event and one with null before/after_state.
    // The query filters `AND before_state IS NOT NULL`, so count should be 1 not 2.
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent(TEST_EMAIL)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const summary = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).summary as Record<string, number>
    // Only the non-anonymised event should appear (before_state IS NOT NULL guard)
    expect(summary.auditEvents).toBe(1)
  }, 30_000)

  // ── Notifications linked via identity emails ───────────────────────────────

  it("NF-INT-219: GET dsar/search by display_name still finds notifications sent to matched email", async () => {
    // When searching by name, collectDsarData resolves the email from matched identities
    // and uses it to search notifications — not the raw name query.
    const token = makeToken(["admin"], productId)
    const res = await app.request(
      `/api/v1/products/${productId}/dsar/search?identity=Wonderland`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const summary = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).summary as Record<string, number>
    expect(summary.notifications).toBeGreaterThanOrEqual(1)
  }, 30_000)
})
