/**
 * Unit tests: correctTriage() service — FEAT-015.
 *
 * Tests pure business logic with all DB and queue dependencies mocked.
 * No network, no Postgres, no pg-boss.
 *
 * NF-UNIT-CT-01 through NF-UNIT-CT-10
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock all external dependencies ────────────────────────────────────────────

vi.mock("../../../src/infra/db/repositories/cases.js", () => ({
  findCaseById: vi.fn(),
  updateCase:   vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/change-requests.js", () => ({
  findChangeRequestsByCase:  vi.fn(),
  updateChangeRequest:       vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/audit-events.js", () => ({
  createAuditEvent: vi.fn(),
}))

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn(),
}))

vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("../../../src/infra/db/id.js", () => ({
  newId: vi.fn().mockReturnValue("job_test123"),
}))

vi.mock("../../../src/infra/db/repositories/products.js", () => ({
  findProductById: vi.fn().mockResolvedValue(null),
}))

import {
  findCaseById,
  updateCase,
} from "../../../src/infra/db/repositories/cases.js"
import {
  findChangeRequestsByCase,
  updateChangeRequest,
} from "../../../src/infra/db/repositories/change-requests.js"
import { createAuditEvent } from "../../../src/infra/db/repositories/audit-events.js"
import { dispatch } from "../../../src/agents/dispatcher.js"

import { correctTriage } from "../../../src/domain/correct-triage.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    case_id:              "case_abc",
    product_id:           "prod_123",
    title:                "User can't log in",
    summary:              null,
    reporter_identity_id: null,
    conversation_ids:     [],
    status:               "triaged",
    type:                 "bug_report",
    severity:             "high",
    urgency:              null,
    confidence:           null,
    current_persona:      "steward",
    assigned_lead_role:   null,
    triage_output:        null,
    github_issue_ref:     null,
    signal_text:          "User can't log in with SSO",
    created_at:           new Date("2026-04-01"),
    updated_at:           new Date("2026-04-01"),
    resolved_at:          null,
    closed_at:            null,
    ...overrides,
  }
}

function makeCrRow(overrides: Record<string, unknown> = {}) {
  return {
    change_request_id:    "cr_abc",
    product_id:           "prod_123",
    case_id:              "case_abc",
    title:                "Fix SSO login",
    problem_statement:    null,
    status:               "analysis",
    impact_summary:       null,
    risk_level:           "medium",
    proposed_scope:       null,
    affected_surfaces:    [],
    implementation_notes: null,
    github_repo:          null,
    github_issue_number:  null,
    github_issue_url:     null,
    github_pr_number:     null,
    github_pr_url:        null,
    approval_record:      null,
    validation_record:    null,
    approved_at:          null,
    rejected_at:          null,
    rejection_rationale:  null,
    completed_at:         null,
    ci_status:            null,
    ci_details:           null,
    merged_at:            null,
    deploy_status:        null,
    deploy_details:       null,
    cr_track:             "customer_reported",
    created_at:           new Date("2026-04-01"),
    updated_at:           new Date("2026-04-01"),
    ...overrides,
  }
}

const BASE_PARAMS = {
  caseId:      "case_abc",
  productId:   "prod_123",
  actorRef:    "user_lead1",
  actorName:   "Jane Smith",
  newType:     "user_request" as const,
  newSeverity: "low" as const,
  reason:      "User asked about Zapier integration, not a bug",
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("correctTriage() service (unit)", () => {

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateCase).mockResolvedValue(makeCaseRow() as ReturnType<typeof makeCaseRow>)
    vi.mocked(findChangeRequestsByCase).mockResolvedValue([])
    vi.mocked(updateChangeRequest).mockResolvedValue(makeCrRow() as ReturnType<typeof makeCrRow>)
    vi.mocked(createAuditEvent).mockResolvedValue({
      audit_event_id: "ae_1",
      product_id: "prod_123",
      entity_type: "case",
      entity_ref: "case_abc",
      actor_type: "lead",
      actor_ref: "user_lead1",
      action: "case.triage_corrected",
      before_state: null,
      after_state: null,
      metadata: {},
      occurred_at: new Date(),
    })
    vi.mocked(dispatch).mockResolvedValue("job_test123")
  })

  it("NF-UNIT-CT-01: returns 409 if case status is 'resolved'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "resolved" }) as ReturnType<typeof makeCaseRow>)

    await expect(correctTriage(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("resolved"),
    })
  })

  it("NF-UNIT-CT-02: returns 409 if case status is 'processing-failed'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "processing-failed" }) as ReturnType<typeof makeCaseRow>)

    await expect(correctTriage(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("processing-failed"),
    })
  })

  it("NF-UNIT-CT-03: cancels CR and sets crCancelled: true when case is 'in-change'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "in-change" }) as ReturnType<typeof makeCaseRow>)
    vi.mocked(findChangeRequestsByCase).mockResolvedValue([
      makeCrRow({ status: "analysis" }) as ReturnType<typeof makeCrRow>,
    ])

    const result = await correctTriage(BASE_PARAMS)

    expect(vi.mocked(updateChangeRequest)).toHaveBeenCalledWith(
      "cr_abc",
      expect.objectContaining({ status: "rejected" }),
    )
    expect(result.crCancelled).toBe(true)
  })

  it("NF-UNIT-CT-04: cancels CR when case is 'awaiting-approval'", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "awaiting-approval" }) as ReturnType<typeof makeCaseRow>)
    vi.mocked(findChangeRequestsByCase).mockResolvedValue([
      makeCrRow({ status: "approval-pending" }) as ReturnType<typeof makeCrRow>,
    ])

    const result = await correctTriage(BASE_PARAMS)

    expect(vi.mocked(updateChangeRequest)).toHaveBeenCalledWith(
      "cr_abc",
      expect.objectContaining({ status: "rejected" }),
    )
    expect(result.crCancelled).toBe(true)
  })

  it("NF-UNIT-CT-05: no CR to cancel when case is 'triaged' — crCancelled: false", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)
    vi.mocked(findChangeRequestsByCase).mockResolvedValue([])

    const result = await correctTriage(BASE_PARAMS)

    expect(vi.mocked(updateChangeRequest)).not.toHaveBeenCalled()
    expect(result.crCancelled).toBe(false)
  })

  it("NF-UNIT-CT-06: updates case type + severity + status → triaged", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)

    await correctTriage(BASE_PARAMS)

    expect(vi.mocked(updateCase)).toHaveBeenCalledWith(
      "case_abc",
      expect.objectContaining({
        type:     "user_request",
        severity: "low",
        status:   "triaged",
      }),
    )
  })

  it("NF-UNIT-CT-07: dispatches pg-boss job with triage_hint payload", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)

    await correctTriage(BASE_PARAMS)

    expect(vi.mocked(dispatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "known_issue_match",
        caseId:     "case_abc",
        productId:  "prod_123",
        payload: expect.objectContaining({
          triage_hint: expect.objectContaining({
            type:     "user_request",
            severity: "low",
            reason:   BASE_PARAMS.reason,
            operator: "Jane Smith",
          }),
        }),
      }),
    )
  })

  it("NF-UNIT-CT-08: writes audit event with action triage_corrected", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)

    await correctTriage(BASE_PARAMS)

    expect(vi.mocked(createAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action:     "case.triage_corrected",
        entity_ref: "case_abc",
        actor_ref:  "user_lead1",
        metadata: expect.objectContaining({
          reason:      BASE_PARAMS.reason,
          crCancelled: false,
        }),
      }),
    )
  })

  it("NF-UNIT-CT-09: requires reason (rejects empty string)", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)

    await expect(correctTriage({ ...BASE_PARAMS, reason: "" })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it("NF-UNIT-CT-10: requires at least one of type or severity", async () => {
    vi.mocked(findCaseById).mockResolvedValue(makeCaseRow({ status: "triaged" }) as ReturnType<typeof makeCaseRow>)

    await expect(correctTriage({
      ...BASE_PARAMS,
      newType:     undefined,
      newSeverity: undefined,
    })).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})
