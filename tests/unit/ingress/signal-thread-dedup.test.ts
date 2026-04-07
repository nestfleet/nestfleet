/**
 * Unit tests: signal-ingress threading (FEAT-003 Slice 1).
 *
 * Covers:
 *   NF-UNIT-THR-01: email with inReplyTo → createSignal called with channel_thread_id set
 *   NF-UNIT-THR-02: email without inReplyTo → createSignal called with channel_thread_id null/undefined
 *   NF-UNIT-THR-03: inReplyTo matches open case → findOpenCaseByChannelThreadId called with correct args
 *   NF-UNIT-THR-04: inReplyTo matches open case → createCase NOT called (signal appended to existing case)
 *   NF-UNIT-THR-05: inReplyTo matches open case → dispatch NOT called (no re-triage)
 *   NF-UNIT-THR-06: inReplyTo matches open case → caseId in IngestResult equals existing case id
 *   NF-UNIT-THR-07: inReplyTo present but no open case found → createCase IS called (new case)
 *   NF-UNIT-THR-08: inReplyTo absent → findOpenCaseByChannelThreadId NOT called
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findProductById:                vi.fn(),
  createSignal:                   vi.fn(),
  updateSignal:                   vi.fn().mockResolvedValue(undefined),
  findIdentityByEmail:            vi.fn(),
  createIdentity:                 vi.fn(),
  findConversationByThreadKey:    vi.fn(),
  createConversation:             vi.fn(),
  updateConversation:             vi.fn().mockResolvedValue(undefined),
  createCase:                     vi.fn(),
  createAuditEvent:               vi.fn().mockResolvedValue(undefined),
  findOpenCaseByChannelThreadId:  vi.fn(),
}))

vi.mock("../../../src/domain/case-state-machine.js", () => ({
  transitionCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/agents/dispatcher.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/email/sender.js", () => ({
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/billing/ou-tracker.js", () => ({
  getOuStatus: vi.fn().mockResolvedValue("ok"),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { ingestEmailSignal } from "../../../src/ingress/signal-ingress.js"
import * as repo from "../../../src/infra/db/repositories/index.js"
import { dispatch } from "../../../src/agents/dispatcher.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_ID = "prod_001"
const SIGNAL_ID  = "sig_001"
const CONV_ID    = "conv_001"
const CASE_ID    = "case_001"
const IDENT_ID   = "id_001"

const baseProduct = {
  product_id:       PRODUCT_ID,
  name:             "TestProduct",
  slug:             "testproduct",
  stage:            "beta",
  lead_assignments: {},
  settings:         {},
}

const baseSignal = {
  signal_id:         SIGNAL_ID,
  product_id:        PRODUCT_ID,
  source_type:       "email" as const,
  source_ref:        "msg-001",
  received_at:       new Date(),
  raw_payload:       {},
  normalized_payload:{},
  identity_id:       null,
  conversation_id:   null,
  case_id:           null,
  processing_status: "received" as const,
  channel_thread_id: null,
  created_at:        new Date(),
}

const baseConv = {
  conversation_id: CONV_ID,
  product_id:      PRODUCT_ID,
  channel:         "email",
  subject:         "Hello",
  thread_key:      "thread-key-001",
  participant_ids: [IDENT_ID],
  status:          "active",
  last_message_at: new Date(),
  created_at:      new Date(),
}

const baseCase = {
  case_id:             CASE_ID,
  product_id:          PRODUCT_ID,
  title:               "Hello",
  status:              "new",
  current_persona:     "frontline",
  reporter_identity_id: IDENT_ID,
  conversation_ids:    [CONV_ID],
  signal_text:         "hello",
  created_at:          new Date(),
  updated_at:          new Date(),
}

const baseIdentity = {
  identity_id:     IDENT_ID,
  product_id:      PRODUCT_ID,
  type:            "end_user",
  email_addresses: ["user@example.com"],
  display_name:    "Test User",
  created_at:      new Date(),
}

function makeEmail(inReplyTo: string | null = null) {
  return {
    messageId:       "msg-001",
    fromEmail:       "user@example.com",
    fromName:        "Test User",
    subject:         "Hello",
    bodyText:        "Hello world",
    replyTo:         null,
    inReplyTo,
    references:      null,
    receivedAt:      new Date(),
    attachmentCount: 0,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("signal-ingress thread dedup (FEAT-003)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findProductById).mockResolvedValue(baseProduct as never)
    vi.mocked(repo.createSignal).mockResolvedValue(baseSignal as never)
    vi.mocked(repo.updateSignal).mockResolvedValue(undefined as never)
    vi.mocked(repo.findIdentityByEmail).mockResolvedValue(baseIdentity as never)
    vi.mocked(repo.findConversationByThreadKey).mockResolvedValue(baseConv as never)
    vi.mocked(repo.createCase).mockResolvedValue(baseCase as never)
    vi.mocked(repo.createAuditEvent).mockResolvedValue(undefined as never)
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue(null)
  })

  it("NF-UNIT-THR-01: email with inReplyTo → createSignal receives channel_thread_id", async () => {
    const email = makeEmail("<thread-111@mail.com>")
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(repo.createSignal).toHaveBeenCalledWith(
      expect.objectContaining({ channel_thread_id: "<thread-111@mail.com>" }),
    )
  })

  it("NF-UNIT-THR-02: email without inReplyTo → createSignal receives own messageId as channel_thread_id", async () => {
    const email = makeEmail(null)
    await ingestEmailSignal(PRODUCT_ID, email)

    const call = vi.mocked(repo.createSignal).mock.calls[0]?.[0]
    // Original emails use their own messageId so future replies can find them
    expect(call?.channel_thread_id).toBe("msg-001")
  })

  it("NF-UNIT-THR-03: inReplyTo present → findOpenCaseByChannelThreadId called with productId + threadId", async () => {
    const threadId = "<thread-111@mail.com>"
    const email = makeEmail(threadId)
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(repo.findOpenCaseByChannelThreadId).toHaveBeenCalledWith(PRODUCT_ID, threadId)
  })

  it("NF-UNIT-THR-04: inReplyTo matches open case → createCase NOT called", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue("case_existing")

    const email = makeEmail("<thread-111@mail.com>")
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(repo.createCase).not.toHaveBeenCalled()
  })

  it("NF-UNIT-THR-05: inReplyTo matches open case → dispatch NOT called (no re-triage)", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue("case_existing")

    const email = makeEmail("<thread-111@mail.com>")
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it("NF-UNIT-THR-06: inReplyTo matches open case → result.caseId equals existing case id", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue("case_existing")

    const email = makeEmail("<thread-111@mail.com>")
    const result = await ingestEmailSignal(PRODUCT_ID, email)

    expect(result.caseId).toBe("case_existing")
  })

  it("NF-UNIT-THR-07: inReplyTo present but no open case → createCase IS called", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue(null)

    const email = makeEmail("<thread-new@mail.com>")
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(repo.createCase).toHaveBeenCalledOnce()
  })

  it("NF-UNIT-THR-08: inReplyTo absent → findOpenCaseByChannelThreadId NOT called", async () => {
    const email = makeEmail(null)
    await ingestEmailSignal(PRODUCT_ID, email)

    expect(repo.findOpenCaseByChannelThreadId).not.toHaveBeenCalled()
  })
})
