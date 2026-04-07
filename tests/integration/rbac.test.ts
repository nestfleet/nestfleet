/**
 * Integration tests: Role-Based Access Control (RBAC) enforcement.
 *
 * Validates the full RBAC matrix against real endpoints on a live PostgreSQL
 * container. Each test isolates auth enforcement from business logic:
 *   - "allowed" role  → status is NOT 401 and NOT 403 (auth passed; business
 *                        logic result — 200/400/404 — is irrelevant here)
 *   - "denied" role   → status IS 403
 *   - no token        → status IS 401
 *
 * NF-RBAC-01 through NF-RBAC-60.
 *
 * Target RBAC matrix (PO decision 2026-03-19):
 *
 *   Endpoint                        admin  operator  support_lead  change_lead  product_lead  knowledge_lead
 *   Cases — view list/detail          ✅      ✅          ✅           ✅            ✅             ✅
 *   Cases — patch status              ✅      ❌          ✅           ❌            ❌             ❌
 *   Cases — resolve                   ✅      ❌          ✅           ❌            ❌             ❌
 *   Cases — triage-manual             ✅      ❌          ✅           ❌            ✅             ❌
 *   Cases — draft-clarification       ✅      ✅          ✅           ❌            ❌             ❌
 *   Cases — send-to-change            ✅      ❌          ✅           ✅            ✅             ❌
 *   PR Drafts — view list/detail      ✅      ✅          ✅           ✅            ✅             ❌
 *   PR Drafts — complete              ✅      ❌          ❌           ✅            ❌             ❌
 *   Settings — view                   ✅      ✅          ❌           ❌            ❌             ❌
 *   Settings — edit                   ✅      ❌          ❌           ❌            ❌             ❌
 *   Product Memory — view             ✅      ✅          ❌           ❌            ❌             ✅
 *   Product Memory — delete           ✅      ❌          ❌           ❌            ❌             ❌
 *   Notifications — view/ack          ✅      ✅          ✅           ✅            ✅             ✅
 *   Lineage — view                    ✅      ✅          ✅           ✅            ✅             ✅
 *   Approvals — view queue            ✅      ✅          ❌           ✅            ✅             ❌
 *   Approvals — approve/reject        ✅      ❌          ❌           ✅            ✅             ❌
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:              vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/agents/budget.js", () => ({
  checkBudget: vi.fn().mockResolvedValue({
    hardLimitExceeded: false,
    softLimitExceeded: false,
    currentTokens: 0,
    hardLimit: 1_000_000,
    softLimit: 800_000,
  }),
}))
vi.mock("../../src/domain/transactional-dispatch.js", () => ({
  transitionAndDispatch: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import {
  createChangeRequest,
  updateChangeRequest,
} from "../../src/infra/db/repositories/change-requests.js"
import { createNotification } from "../../src/infra/db/repositories/notifications.js"
import { signJwt } from "../../src/auth/jwt.js"


// ── Token factory ─────────────────────────────────────────────────────────────

function tok(roles: string[], productId: string): string {
  return signJwt({ sub: "rbac-test-user", email: "rbac@test.com", roles, productIds: [productId] })
}

// ── Auth-only assertion helpers ───────────────────────────────────────────────

/** Auth passed: status is not 401 or 403 regardless of business-logic result. */
function authPassed(status: number): boolean {
  return status !== 401 && status !== 403
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

let ctx: TestDbContext
let productId: string
let caseId: string          // awaiting-lead — suitable for patch, resolve, send-to-change
let triageCaseId: string    // new — suitable for triage-manual
let crId: string            // approval-pending — suitable for approve/reject
let prDraftCrId: string     // pr-drafted — suitable for complete
let notificationId: string  // a real notification id for ack tests

beforeAll(async () => {
  ctx = await setupTestDb()

  const product = await createProduct({
    name:             "RBAC Test Product",
    stage:            "beta",
    support_policy:   { github_repo: "test-org/rbac-test" },
    enabled_channels: ["email"],
    lead_assignments: {
      support_lead:  "support@rbac.test",
      change_lead:   "change@rbac.test",
      product_lead:  "product@rbac.test",
    },
    llm_config: { provider: "openai", model: "gpt-4o", apiKey: "sk-test-0000" },
    agent_config: { tone: "formal" },
  })
  productId = product.product_id

  // Case in awaiting-lead (for patch, resolve, send-to-change)
  const c1 = await createCase({
    product_id: productId,
    title:      "RBAC awaiting-lead case",
    status:     "awaiting-lead",
  })
  caseId = c1.case_id

  // Case in new (for triage-manual)
  const c2 = await createCase({
    product_id: productId,
    title:      "RBAC new case for triage",
    status:     "new",
  })
  triageCaseId = c2.case_id

  // CR in approval-pending (for approve/reject)
  const cr1 = await createChangeRequest({
    product_id: productId,
    case_id:    caseId,
    title:      "RBAC approval-pending CR",
    status:     "approval-pending",
    risk_level: "medium",
  })
  await updateChangeRequest(cr1.change_request_id, { status: "approval-pending" })
  crId = cr1.change_request_id

  // CR in pr-drafted (for complete)
  const cr2 = await createChangeRequest({
    product_id: productId,
    case_id:    caseId,
    title:      "RBAC pr-drafted CR",
    status:     "pr-drafted",
    risk_level: "low",
  })
  await updateChangeRequest(cr2.change_request_id, { status: "pr-drafted" })
  prDraftCrId = cr2.change_request_id

  // Seed a notification for ack tests
  const notif = await createNotification({
    product_id:    productId,
    kind:          "status_update",
    priority:      "normal",
    audience_type: "operator",
    recipient_ref: "rbac@test.com",
    source_type:   "case",
    source_ref:    caseId,
    subject:       "RBAC test notification",
    body:          "body",
    ack_required:  false,
  })
  notificationId = notif.notification_id
}, 90_000)

afterAll(async () => {
  await ctx.teardown()
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — view (list + detail)
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — view list and detail", () => {
  it("NF-RBAC-01: all roles can list cases", async () => {
    const roles = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"]
    for (const role of roles) {
      const res = await app.request(`/api/v1/products/${productId}/cases`, {
        headers: { Authorization: `Bearer ${tok([role], productId)}` },
      })
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-02: GET cases list returns 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases`)
    expect(res.status).toBe(401)
  }, 10_000)

  it("NF-RBAC-03: all roles can fetch a case by id", async () => {
    const roles = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"]
    for (const role of roles) {
      const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
        headers: { Authorization: `Bearer ${tok([role], productId)}` },
      })
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — PATCH status
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — PATCH status", () => {
  const patchBody = JSON.stringify({ status: "awaiting-lead" })

  it("NF-RBAC-04: support_lead can patch case status", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body:    patchBody,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-05: admin can patch case status", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body:    patchBody,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-06: operator cannot patch case status → 403", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body:    patchBody,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-07: change_lead cannot patch case status → 403", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body:    patchBody,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-08: product_lead cannot patch case status → 403", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body:    patchBody,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-09: knowledge_lead cannot patch case status → 403", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body:    patchBody,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — resolve
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — resolve", () => {
  const resolveUrl = () => `/api/v1/products/${productId}/cases/${caseId}/resolve`

  it("NF-RBAC-10: support_lead can resolve a case", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body:    JSON.stringify({ resolution: "Resolved via RBAC test" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-11: admin can resolve a case", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body:    JSON.stringify({ resolution: "Admin resolved" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-12: operator cannot resolve a case → 403", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-13: change_lead cannot resolve a case → 403", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-14: product_lead cannot resolve a case → 403", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-15: knowledge_lead cannot resolve a case → 403", async () => {
    const res = await app.request(resolveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — triage-manual
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — triage-manual", () => {
  const triageUrl = () => `/api/v1/products/${productId}/cases/${triageCaseId}/triage-manual`
  const body = JSON.stringify({ category: "bug", severity: "high", summary: "RBAC test triage" })

  it("NF-RBAC-16: support_lead can manually triage a case", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-17: product_lead can manually triage a case", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-18: admin can manually triage a case", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-19: operator cannot manually triage → 403", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-20: change_lead cannot manually triage → 403", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-21: knowledge_lead cannot manually triage → 403", async () => {
    const res = await app.request(triageUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — draft-clarification
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — draft-clarification", () => {
  const clarifUrl = () => `/api/v1/products/${productId}/cases/${caseId}/draft-clarification`
  const body = JSON.stringify({ question: "Can you provide more details?" })

  it("NF-RBAC-22: operator can draft a clarification", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-23: support_lead can draft a clarification", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-24: admin can draft a clarification", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-25: change_lead cannot draft a clarification → 403", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-26: product_lead cannot draft a clarification → 403", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-27: knowledge_lead cannot draft a clarification → 403", async () => {
    const res = await app.request(clarifUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Cases — send-to-change
// ══════════════════════════════════════════════════════════════════════════════

describe("Cases — send-to-change", () => {
  const s2cUrl = () => `/api/v1/products/${productId}/cases/${caseId}/send-to-change`
  const body = JSON.stringify({ title: "RBAC test CR", risk_level: "low" })

  it("NF-RBAC-28: support_lead can send to change", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-29: change_lead can send to change", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-30: product_lead can send to change", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-31: admin can send to change", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-32: operator cannot send to change → 403", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-33: knowledge_lead cannot send to change → 403", async () => {
    const res = await app.request(s2cUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// PR Drafts — view list
// ══════════════════════════════════════════════════════════════════════════════

describe("PR Drafts — view list", () => {
  const prListUrl = () => `/api/v1/products/${productId}/change-requests/pr-drafted`

  it("NF-RBAC-34: admin, operator, support_lead, change_lead, product_lead can view PR drafts list", async () => {
    const allowed = ["admin", "operator", "support_lead", "change_lead", "product_lead"]
    for (const role of allowed) {
      const res = await app.request(prListUrl(), {
        headers: { Authorization: `Bearer ${tok([role], productId)}` },
      })
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-35: knowledge_lead cannot view PR drafts list → 403", async () => {
    const res = await app.request(prListUrl(), {
      headers: { Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-36: GET PR drafts returns 401 without token", async () => {
    const res = await app.request(prListUrl())
    expect(res.status).toBe(401)
  }, 10_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// PR Drafts — complete
// ══════════════════════════════════════════════════════════════════════════════

describe("PR Drafts — complete", () => {
  const completeUrl = () => `/api/v1/products/${productId}/change-requests/${prDraftCrId}/complete`
  const body = JSON.stringify({ pr_url: "https://github.com/test-org/test/pull/1" })

  it("NF-RBAC-37: change_lead can complete a PR draft", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-38: admin can complete a PR draft", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-39: operator cannot complete a PR draft → 403", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-40: support_lead cannot complete a PR draft → 403", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-41: product_lead cannot complete a PR draft → 403", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-42: knowledge_lead cannot complete a PR draft → 403", async () => {
    const res = await app.request(completeUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Settings — view (GET)
// ══════════════════════════════════════════════════════════════════════════════

describe("Settings — view", () => {
  const settingsUrl = () => `/api/v1/products/${productId}/settings`

  it("NF-RBAC-43: operator can view settings", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["operator"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-44: admin can view settings", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["admin"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-45: support_lead cannot view settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["support_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-46: change_lead cannot view settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["change_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-47: product_lead cannot view settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["product_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-48: knowledge_lead cannot view settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      headers: { Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Settings — edit (PUT)
// ══════════════════════════════════════════════════════════════════════════════

describe("Settings — edit", () => {
  const settingsUrl = () => `/api/v1/products/${productId}/settings`
  const body = JSON.stringify({ agent: { tone: "technical" } })

  it("NF-RBAC-49: admin can edit settings", async () => {
    const res = await app.request(settingsUrl(), {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body,
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-50: operator cannot edit settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-51: support_lead cannot edit settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-52: knowledge_lead cannot edit settings → 403", async () => {
    const res = await app.request(settingsUrl(), {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body,
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Product Memory — view
// ══════════════════════════════════════════════════════════════════════════════

describe("Product Memory — view", () => {
  const memorySourcesUrl = () => `/api/v1/products/${productId}/memory/sources`
  const memoryStatsUrl   = () => `/api/v1/products/${productId}/memory/stats`

  it("NF-RBAC-53: operator can view memory sources", async () => {
    const res = await app.request(memorySourcesUrl(), {
      headers: { Authorization: `Bearer ${tok(["operator"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-54: knowledge_lead can view memory sources", async () => {
    const res = await app.request(memorySourcesUrl(), {
      headers: { Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-55: admin can view memory sources", async () => {
    const res = await app.request(memoryStatsUrl(), {
      headers: { Authorization: `Bearer ${tok(["admin"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-56: support_lead cannot view memory sources → 403", async () => {
    const res = await app.request(memorySourcesUrl(), {
      headers: { Authorization: `Bearer ${tok(["support_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-57: change_lead cannot view memory sources → 403", async () => {
    const res = await app.request(memorySourcesUrl(), {
      headers: { Authorization: `Bearer ${tok(["change_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-58: product_lead cannot view memory sources → 403", async () => {
    const res = await app.request(memorySourcesUrl(), {
      headers: { Authorization: `Bearer ${tok(["product_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Product Memory — delete
// ══════════════════════════════════════════════════════════════════════════════

describe("Product Memory — delete", () => {
  // Use a source URI that doesn't exist — auth check fires before DB lookup
  const deleteUrl = () => `/api/v1/products/${productId}/memory/sources/docs%3A%2F%2Fchangelog.md`

  it("NF-RBAC-59: admin can delete memory source", async () => {
    const res = await app.request(deleteUrl(), {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${tok(["admin"], productId)}` },
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-60: operator cannot delete memory source → 403", async () => {
    const res = await app.request(deleteUrl(), {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${tok(["operator"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-61: knowledge_lead cannot delete memory source → 403", async () => {
    const res = await app.request(deleteUrl(), {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-62: support_lead cannot delete memory source → 403", async () => {
    const res = await app.request(deleteUrl(), {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${tok(["support_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Notifications — view and acknowledge
// ══════════════════════════════════════════════════════════════════════════════

describe("Notifications — view and ack (all roles)", () => {
  it("NF-RBAC-63: all 6 roles can view notifications", async () => {
    const roles = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"]
    for (const role of roles) {
      const res = await app.request(`/api/v1/products/${productId}/notifications`, {
        headers: { Authorization: `Bearer ${tok([role], productId)}` },
      })
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-64: all 6 roles can acknowledge a notification", async () => {
    const roles = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"]
    for (const role of roles) {
      const res = await app.request(
        `/api/v1/products/${productId}/notifications/${notificationId}/ack`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok([role], productId)}` },
          body:    JSON.stringify({}),
        },
      )
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-65: GET notifications returns 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/notifications`)
    expect(res.status).toBe(401)
  }, 10_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Lineage — view
// ══════════════════════════════════════════════════════════════════════════════

describe("Lineage — view (all roles)", () => {
  it("NF-RBAC-66: all 6 roles can view case lineage", async () => {
    const roles = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"]
    for (const role of roles) {
      const res = await app.request(
        `/api/v1/products/${productId}/cases/${caseId}/lineage`,
        {
          headers: { Authorization: `Bearer ${tok([role], productId)}` },
        },
      )
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-67: GET lineage returns 401 without token", async () => {
    const res = await app.request(`/api/v1/products/${productId}/cases/${caseId}/lineage`)
    expect(res.status).toBe(401)
  }, 10_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Approvals — view queue
// ══════════════════════════════════════════════════════════════════════════════

describe("Approvals — view pending queue", () => {
  const pendingUrl = () => `/api/v1/products/${productId}/change-requests/pending-approval`

  it("NF-RBAC-68: admin, operator, change_lead, product_lead can view approval queue", async () => {
    const allowed = ["admin", "operator", "change_lead", "product_lead"]
    for (const role of allowed) {
      const res = await app.request(pendingUrl(), {
        headers: { Authorization: `Bearer ${tok([role], productId)}` },
      })
      expect(res.status, `role=${role}`).not.toBe(403)
      expect(res.status, `role=${role}`).not.toBe(401)
    }
  }, 30_000)

  it("NF-RBAC-69: support_lead cannot view approval queue → 403", async () => {
    const res = await app.request(pendingUrl(), {
      headers: { Authorization: `Bearer ${tok(["support_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-70: knowledge_lead cannot view approval queue → 403", async () => {
    const res = await app.request(pendingUrl(), {
      headers: { Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
    })
    expect(res.status).toBe(403)
  }, 15_000)
})

// ══════════════════════════════════════════════════════════════════════════════
// Approvals — approve / reject
// ══════════════════════════════════════════════════════════════════════════════

describe("Approvals — approve and reject", () => {
  const approveUrl = () => `/api/v1/products/${productId}/change-requests/${crId}/approve`
  const rejectUrl  = () => `/api/v1/products/${productId}/change-requests/${crId}/reject`

  it("NF-RBAC-71: change_lead can approve", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body:    JSON.stringify({ rationale: "Approved by change_lead in RBAC test" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-72: product_lead can approve", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["product_lead"], productId)}` },
      body:    JSON.stringify({ rationale: "Approved by product_lead in RBAC test" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-73: admin can approve (superuser bypass)", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["admin"], productId)}` },
      body:    JSON.stringify({ rationale: "Admin bypass" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-74: operator cannot approve → 403", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-75: support_lead cannot approve → 403", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["support_lead"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-76: knowledge_lead cannot approve → 403", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["knowledge_lead"], productId)}` },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-77: change_lead can reject", async () => {
    const res = await app.request(rejectUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["change_lead"], productId)}` },
      body:    JSON.stringify({ rationale: "Not ready for production yet" }),
    })
    expect(authPassed(res.status)).toBe(true)
  }, 15_000)

  it("NF-RBAC-78: operator cannot reject → 403", async () => {
    const res = await app.request(rejectUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok(["operator"], productId)}` },
      body:    JSON.stringify({ rationale: "Operator tries to reject" }),
    })
    expect(res.status).toBe(403)
  }, 15_000)

  it("NF-RBAC-79: GET approve returns 401 without token", async () => {
    const res = await app.request(approveUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  }, 10_000)
})
