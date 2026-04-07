/**
 * Integration tests: AI disclosure wiring in NotificationService — CG-01.
 * NF-INT-150 through NF-INT-154.
 */

import { vi } from "vitest"
vi.mock("../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchInTransaction: vi.fn().mockResolvedValue("mock-job-id"),
}))
vi.mock("../../src/notifications/email-transport.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}))

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { createProduct } from "../../src/infra/db/repositories/products.js"
import { NotificationService } from "../../src/notifications/service.js"
import { sendEmail } from "../../src/notifications/email-transport.js"

describe("AI disclosure wiring (integration)", () => {
  let ctx: TestDbContext
  let productId: string
  let service: NotificationService

  beforeAll(async () => {
    ctx = await setupTestDb()
    const product = await createProduct({
      name: "DisclosureTestProd", stage: "beta",
      support_policy: { quiet_hours: { start: 0, end: 0, timezone: "UTC", weekends: false } },
      enabled_channels: ["email"], lead_assignments: {},
    })
    productId = product.product_id
    service = new NotificationService()
  }, 60_000)

  afterAll(async () => { await ctx.teardown() })
  beforeEach(() => { vi.mocked(sendEmail).mockClear() })

  it("NF-INT-150: end_user notification includes AI disclosure header", async () => {
    await service.emit({
      productId, kind: "user_follow_up", priority: "critical",
      audienceType: "end_user", recipientRef: "alice@test.com",
      sourceType: "case", sourceRef: "case_150",
      subject: "Re: your ticket", body: "Here is the solution.",
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    const emailText = (vi.mocked(sendEmail).mock.calls[0] as [{ text: string }])[0].text
    expect(emailText).toContain("AI assistant")
    expect(emailText).toContain("Here is the solution.")
  }, 30_000)

  it("NF-INT-151: end_user clarification includes disclosure footer", async () => {
    await service.emit({
      productId, kind: "clarification_request", priority: "critical",
      audienceType: "end_user", recipientRef: "bob@test.com",
      sourceType: "case", sourceRef: "case_151",
      subject: "More info needed", body: "Please share the error message.",
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    const emailText = (vi.mocked(sendEmail).mock.calls[0] as [{ text: string }])[0].text
    expect(emailText).toContain("team member will review")
  }, 30_000)

  it("NF-INT-153: internal notification has NO disclosure", async () => {
    await service.emit({
      productId, kind: "escalation_alert", priority: "critical",
      audienceType: "support_lead", recipientRef: "lead@test.com",
      sourceType: "case", sourceRef: "case_153",
      subject: "Escalated", body: "Case escalated.",
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    const emailText = (vi.mocked(sendEmail).mock.calls[0] as [{ text: string }])[0].text
    expect(emailText).not.toContain("AI assistant")
    expect(emailText).toBe("Case escalated.")
  }, 30_000)

  it("NF-INT-154: disclosure interpolates product name", async () => {
    await service.emit({
      productId, kind: "user_follow_up", priority: "critical",
      audienceType: "end_user", recipientRef: "diana@test.com",
      sourceType: "case", sourceRef: "case_154",
      subject: "Update", body: "Request processed.",
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    const emailText = (vi.mocked(sendEmail).mock.calls[0] as [{ text: string }])[0].text
    expect(emailText).toContain("DisclosureTestProd")
  }, 30_000)
})
