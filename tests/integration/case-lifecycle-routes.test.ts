/**
 * Integration tests: Case lifecycle routes — end-to-end state machine coverage.
 *
 * Each test exercises a real-world path through the case state machine via HTTP
 * requests to the Hono app, backed by a real PostgreSQL container.
 *
 * NF-INT-200 through NF-INT-223.
 *
 * Covered route groups:
 *   A) Full multi-step happy paths (ROUTE-01 … ROUTE-06)
 *   B) Individual transition verifications (ROUTE-07 … ROUTE-12)
 *   C) Invalid transition guards via API (ROUTE-13 … ROUTE-19)
 *   D) Auth / RBAC on state transitions (ROUTE-20 … ROUTE-24)
 */

import { vi } from "vitest"

vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch:               vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction:  vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/agents/budget.js", () => ({
  checkBudget: vi.fn().mockResolvedValue({
    hardLimitExceeded: false, softLimitExceeded: false,
    currentTokens: 0, hardLimit: 1_000_000, softLimit: 800_000,
  }),
}))
// Mock transitionAndDispatch — no pg-boss in test container, but still run the
// case transition so DB state is updated correctly.
vi.mock("../../src/domain/transactional-dispatch.js", () => ({
  transitionAndDispatch: vi.fn().mockImplementation(async (opts: Record<string, unknown>) => {
    const { transitionCase } = await import("../../src/domain/case-state-machine.js")
    await transitionCase(
      opts.caseId as string,
      opts.expectedFrom as string | null,
      opts.to as string,
      (opts.extra ?? {}) as Record<string, unknown>,
    )
    return "mock-job-id"
  }),
}))
vi.mock("../../src/billing/ou-tracker.js", () => ({
  incrementOu: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createCase, findCaseById } from "../../src/infra/db/repositories/cases.js"
import { signJwt } from "../../src/auth/jwt.js"

// ── Token helpers ─────────────────────────────────────────────────────────────

function tok(roles: string[], productId: string) {
  return signJwt({ sub: "test-user", email: "tester@example.com", roles, productIds: [productId] })
}

// ── Request helpers ───────────────────────────────────────────────────────────

async function apiPost(path: string, token: string, body?: unknown) {
  return app.request(path, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function apiPatch(path: string, token: string, body: unknown) {
  return app.request(path, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  })
}

// Shorthand for common transitions
const triage  = (pid: string, cid: string, t: string) => apiPost(`/api/v1/products/${pid}/cases/${cid}/triage-manual`, t, { type: "bug_report", severity: "normal", summary: "Triage summary for this test case" })
const clarify = (pid: string, cid: string, t: string) => apiPost(`/api/v1/products/${pid}/cases/${cid}/draft-clarification`, t)
const signal  = (pid: string, cid: string, t: string) => apiPost(`/api/v1/products/${pid}/cases/${cid}/signal-received`, t)
const escalate = (pid: string, cid: string, t: string) => apiPatch(`/api/v1/products/${pid}/cases/${cid}`, t, { status: "awaiting-lead" })
const change  = (pid: string, cid: string, t: string) => apiPost(`/api/v1/products/${pid}/cases/${cid}/send-to-change`, t)
const resolve = (pid: string, cid: string, t: string, msg = "Issue confirmed resolved by operator") => apiPost(`/api/v1/products/${pid}/cases/${cid}/resolve`, t, { resolution: msg })

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Case lifecycle routes (integration)", () => {
  let ctx: TestDbContext
  let pid: string
  let opTok: string       // operator
  let leadTok: string     // support_lead (also has operator access to resolve)
  let adminTok: string

  beforeAll(async () => {
    ctx = await setupTestDb()

    const product = await createProduct({
      name:             "Lifecycle Routes Test",
      stage:            "beta",
      support_policy:   { github_repo: "org/lifecycle-test" },
      enabled_channels: ["email"],
      lead_assignments: { support_lead: "lead@test.com" },
    })
    pid = product.product_id

    opTok    = tok(["operator"],                 pid)
    leadTok  = tok(["operator", "support_lead"], pid)
    adminTok = tok(["admin"],                    pid)
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  // ── A) Full multi-step happy paths ──────────────────────────────────────────

  it("NF-INT-200 ROUTE-01: enriching → triaged → resolve → resolved", async () => {
    const c = await createCase({ product_id: pid, title: "RT-01", status: "enriching" })
    expect((await triage(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("triaged")

    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-201 ROUTE-02: enriching → triaged → escalate → awaiting-lead → resolve → resolved", async () => {
    const c = await createCase({ product_id: pid, title: "RT-02", status: "enriching" })
    expect((await triage(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await escalate(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")

    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-202 ROUTE-03: enriching → triaged → awaiting-lead → send-to-change → in-change → resolve → resolved", async () => {
    const c = await createCase({ product_id: pid, title: "RT-03", status: "enriching" })
    await triage(pid, c.case_id, leadTok)
    await escalate(pid, c.case_id, leadTok)

    const chRes = await change(pid, c.case_id, leadTok)
    expect(chRes.status).toBe(200)
    const chBody = await chRes.json() as Record<string, unknown>
    expect(typeof (chBody.data as Record<string, unknown>).changeRequestId).toBe("string")
    expect((await findCaseById(c.case_id))?.status).toBe("in-change")

    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-203 ROUTE-04: enriching → awaiting-user → re-enriched → triaged → resolved (clarification cycle)", async () => {
    const c = await createCase({ product_id: pid, title: "RT-04", status: "enriching" })

    expect((await clarify(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-user")

    expect((await signal(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("enriching")

    await triage(pid, c.case_id, leadTok)
    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-204 ROUTE-05: in-resolution → escalate → awaiting-lead → resolve → resolved", async () => {
    const c = await createCase({ product_id: pid, title: "RT-05", status: "in-resolution" })

    expect((await escalate(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")

    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  it("NF-INT-205 ROUTE-06: in-change → awaiting-lead (bounce back) → resolve → resolved", async () => {
    const c = await createCase({ product_id: pid, title: "RT-06", status: "in-change" })

    expect((await escalate(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")

    expect((await resolve(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)

  // ── B) Individual transition verifications ──────────────────────────────────

  it("NF-INT-206 ROUTE-07: triage-manual persists type, severity, summary", async () => {
    const c = await createCase({ product_id: pid, title: "RT-07", status: "enriching" })
    const res = await triage(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    const updated = await findCaseById(c.case_id)
    expect(updated?.status).toBe("triaged")
    expect(updated?.type).toBe("bug_report")
    expect(updated?.severity).toBe("normal")
    expect((updated?.triage_output as Record<string, unknown>)?.method).toBe("manual")
  }, 30_000)

  it("NF-INT-207 ROUTE-08: draft-clarification transitions enriching → awaiting-user and returns question", async () => {
    const c = await createCase({ product_id: pid, title: "RT-08", status: "enriching" })
    const res = await clarify(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.status).toBe("awaiting-user")
    expect(typeof data.clarificationQuestion).toBe("string")
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-user")
  }, 30_000)

  it("NF-INT-208 ROUTE-09: signal-received transitions awaiting-user → enriching", async () => {
    const c = await createCase({ product_id: pid, title: "RT-09", status: "awaiting-user" })
    const res = await signal(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("enriching")
  }, 30_000)

  it("NF-INT-209 ROUTE-10: PATCH escalate from triaged → awaiting-lead", async () => {
    const c = await createCase({ product_id: pid, title: "RT-10", status: "triaged" })
    const res = await escalate(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).status).toBe("awaiting-lead")
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")
  }, 30_000)

  it("NF-INT-210 ROUTE-11: PATCH escalate from in-resolution → awaiting-lead", async () => {
    const c = await createCase({ product_id: pid, title: "RT-11", status: "in-resolution" })
    expect((await escalate(pid, c.case_id, leadTok)).status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")
  }, 30_000)

  it("NF-INT-211 ROUTE-12: send-to-change creates a draft CR linked to the case", async () => {
    const c = await createCase({ product_id: pid, title: "RT-12", status: "awaiting-lead" })
    const res = await change(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(typeof data.changeRequestId).toBe("string")
    expect((data.changeRequestId as string).startsWith("cr_")).toBe(true)
    expect((await findCaseById(c.case_id))?.status).toBe("in-change")
  }, 30_000)

  // ── C) Invalid transition guards via API ────────────────────────────────────

  it("NF-INT-212 ROUTE-13: resolve on already-resolved case returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-13", status: "resolved" })
    const res = await resolve(pid, c.case_id, leadTok)
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toMatch(/already resolved/i)
  }, 30_000)

  it("NF-INT-213 ROUTE-14: draft-clarification on non-enriching case returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-14", status: "triaged" })
    const res = await clarify(pid, c.case_id, leadTok)
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-214 ROUTE-15: triage-manual on non-enriching case returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-15", status: "awaiting-user" })
    const res = await triage(pid, c.case_id, leadTok)
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-215 ROUTE-16: signal-received on non-awaiting-user case returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-16", status: "triaged" })
    const res = await signal(pid, c.case_id, leadTok)
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-216 ROUTE-17: send-to-change from non-awaiting-lead case returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-17", status: "in-resolution" })
    const res = await change(pid, c.case_id, leadTok)
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-217 ROUTE-18: PATCH with invalid status value returns 400", async () => {
    const c = await createCase({ product_id: pid, title: "RT-18", status: "in-resolution" })
    const res = await apiPatch(`/api/v1/products/${pid}/cases/${c.case_id}`, leadTok, { status: "resolved" })
    expect(res.status).toBe(400)
  }, 30_000)

  it("NF-INT-218 ROUTE-19: PATCH escalate on closed case returns 500 (state machine guard)", async () => {
    const c = await createCase({ product_id: pid, title: "RT-19", status: "closed" })
    const res = await escalate(pid, c.case_id, leadTok)
    // closed → awaiting-lead is not in CASE_TRANSITIONS — transitionCase throws InvalidStateTransitionError
    expect(res.status).toBe(500)
  }, 30_000)

  // ── D) Auth / RBAC on state transitions ────────────────────────────────────

  it("NF-INT-219 ROUTE-20: triage-manual requires support_lead — plain operator gets 403", async () => {
    const c = await createCase({ product_id: pid, title: "RT-20", status: "enriching" })
    const res = await triage(pid, c.case_id, opTok)
    expect(res.status).toBe(403)
    // Case must not have moved
    expect((await findCaseById(c.case_id))?.status).toBe("enriching")
  }, 30_000)

  it("NF-INT-220 ROUTE-21: draft-clarification is accessible to operator role", async () => {
    const c = await createCase({ product_id: pid, title: "RT-21", status: "enriching" })
    const res = await clarify(pid, c.case_id, opTok)
    expect(res.status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-user")
  }, 30_000)

  it("NF-INT-221 ROUTE-22: send-to-change requires support_lead — plain operator gets 403", async () => {
    const c = await createCase({ product_id: pid, title: "RT-22", status: "awaiting-lead" })
    const res = await change(pid, c.case_id, opTok)
    expect(res.status).toBe(403)
    expect((await findCaseById(c.case_id))?.status).toBe("awaiting-lead")
  }, 30_000)

  it("NF-INT-222 ROUTE-23: PATCH escalate requires support_lead — plain operator gets 403", async () => {
    const c = await createCase({ product_id: pid, title: "RT-23", status: "in-resolution" })
    const res = await escalate(pid, c.case_id, opTok)
    expect(res.status).toBe(403)
    expect((await findCaseById(c.case_id))?.status).toBe("in-resolution")
  }, 30_000)

  it("NF-INT-223 ROUTE-24: resolve is accessible to support_lead role", async () => {
    const c = await createCase({ product_id: pid, title: "RT-24", status: "in-resolution" })
    const res = await resolve(pid, c.case_id, leadTok)
    expect(res.status).toBe(200)
    expect((await findCaseById(c.case_id))?.status).toBe("resolved")
  }, 30_000)
})
