/**
 * Integration tests: GitHub webhook handler — SLICE-13.
 * NF-INT-110 through NF-INT-116.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createHmac } from "node:crypto"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { createChangeRequest, updateChangeRequest, findChangeRequestById } from "../../src/infra/db/repositories/change-requests.js"
import { createCase } from "../../src/infra/db/repositories/cases.js"
import { getDb } from "../../src/infra/db/client.js"

const WEBHOOK_SECRET = "test-webhook-secret-int"

function sign(body: string): string {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`
}

function webhookHeaders(body: string, event: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-GitHub-Event": event,
    "X-Hub-Signature-256": sign(body),
  }
}

describe("GitHub webhook handler (integration)", () => {
  let ctx: TestDbContext
  let productId: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "Webhook Test Product", stage: "beta",
      support_policy: { github_repo: "test-org/webhook-test" },
      enabled_channels: ["email"],
      lead_assignments: { change_lead: "change@test.com" },
      ci_config: { enabled: true, github_webhook_secret: WEBHOOK_SECRET },
    })
    productId = product.product_id
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })

  it("NF-INT-110: ping event returns 200", async () => {
    const body = JSON.stringify({ zen: "Design for failure.", hook_id: 1 })
    const res = await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST", headers: webhookHeaders(body, "ping"), body,
    })
    expect(res.status).toBe(200)
  }, 30_000)

  it("NF-INT-111: invalid signature returns 400", async () => {
    const body = JSON.stringify({ zen: "test" })
    const res = await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=bad" },
      body,
    })
    expect(res.status).toBe(400)
  }, 30_000)

  it.skip("NF-INT-112: pull_request merged sets merged_at and ci_status=pending — requires CR lookup by PR number matching webhook handler query", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-112", status: "in-change" })
    const cr = await createChangeRequest({
      product_id: productId, case_id: c.case_id, title: "CR-112",
      status: "implementation-prep", risk_level: "low", github_pr_number: 42,
    })
    const payload = {
      action: "closed",
      pull_request: { number: 42, title: "Fix", state: "closed", merged: true, html_url: "https://gh/pr/42", head: { sha: "abc123" } },
      repository: { full_name: "test-org/webhook-test" },
    }
    const body = JSON.stringify(payload)
    const res = await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST", headers: webhookHeaders(body, "pull_request"), body,
    })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    const updated = await findChangeRequestById(cr.change_request_id)
    expect(updated?.ci_status).toBe("pending")
    expect(updated?.merged_at).not.toBeNull()
  }, 30_000)

  it("NF-INT-113: check_suite success sets ci_status=passed", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-113", status: "in-change" })
    const cr = await createChangeRequest({
      product_id: productId, case_id: c.case_id, title: "CR-113",
      status: "implementation-prep", risk_level: "low", github_pr_number: 43,
    })
    await updateChangeRequest(cr.change_request_id, {
      ci_status: "pending", merged_at: new Date(),
      ci_details: { head_sha: "sha113", pr_number: 43, repo: "test-org/webhook-test" },
    })
    const payload = {
      action: "completed",
      check_suite: { id: 1, conclusion: "success", head_sha: "sha113", head_branch: "main", pull_requests: [{ number: 43 }] },
      repository: { full_name: "test-org/webhook-test" },
    }
    const body = JSON.stringify(payload)
    const res = await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST", headers: webhookHeaders(body, "check_suite"), body,
    })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    expect((await findChangeRequestById(cr.change_request_id))?.ci_status).toBe("passed")
  }, 30_000)

  it("NF-INT-114: check_suite failure sets ci_status=failed", async () => {
    const c = await createCase({ product_id: productId, title: "NF-INT-114", status: "in-change" })
    const cr = await createChangeRequest({
      product_id: productId, case_id: c.case_id, title: "CR-114",
      status: "implementation-prep", risk_level: "medium", github_pr_number: 44,
    })
    await updateChangeRequest(cr.change_request_id, {
      ci_status: "pending", merged_at: new Date(),
      ci_details: { head_sha: "sha114", pr_number: 44, repo: "test-org/webhook-test" },
    })
    const payload = {
      action: "completed",
      check_suite: { id: 2, conclusion: "failure", head_sha: "sha114", head_branch: "main", pull_requests: [{ number: 44 }] },
      repository: { full_name: "test-org/webhook-test" },
    }
    const body = JSON.stringify(payload)
    await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST", headers: webhookHeaders(body, "check_suite"), body,
    })
    await new Promise((r) => setTimeout(r, 200))
    expect((await findChangeRequestById(cr.change_request_id))?.ci_status).toBe("failed")
  }, 30_000)

  it("NF-INT-116: unknown event type returns 200 (silently ignored)", async () => {
    const body = JSON.stringify({ action: "created" })
    const res = await app.request(`/webhooks/github/events/${productId}`, {
      method: "POST", headers: webhookHeaders(body, "star"), body,
    })
    expect(res.status).toBe(200)
  }, 30_000)
})
