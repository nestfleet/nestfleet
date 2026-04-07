/**
 * Unit tests: external-ingress pipeline (FEAT-003 Slice 2).
 *
 * Covers:
 *   NF-UNIT-EXT-01: createSignal called with source_type "external"
 *   NF-UNIT-EXT-02: createSignal called with channel_thread_id = threadId
 *   NF-UNIT-EXT-03: createSignal called with channel_context when provided
 *   NF-UNIT-EXT-04: duplicate payload returns duplicate:true, no case created
 *   NF-UNIT-EXT-05: reply threadId matching open case → createCase NOT called (thread dedup)
 *   NF-UNIT-EXT-06: reply threadId matching open case → dispatch NOT called
 *   NF-UNIT-EXT-07: result.channelThreadId equals payload.threadId
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock("../../../src/infra/db/repositories/index.js", () => ({
  findProductById:               vi.fn(),
  createSignal:                  vi.fn(),
  updateSignal:                  vi.fn().mockResolvedValue(undefined),
  createConversation:            vi.fn(),
  findConversationByThreadKey:   vi.fn(),
  updateConversation:            vi.fn().mockResolvedValue(undefined),
  createCase:                    vi.fn(),
  createAuditEvent:              vi.fn().mockResolvedValue(undefined),
  findOpenCaseByChannelThreadId: vi.fn(),
}))

vi.mock("../../../src/infra/db/repositories/identities.js", () => ({
  findIdentityByExternalRef: vi.fn(),
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

import { ingestExternalSignal } from "../../../src/ingress/external-ingress.js"
import * as repo from "../../../src/infra/db/repositories/index.js"
import * as identityRepo from "../../../src/infra/db/repositories/identities.js"
import { dispatch } from "../../../src/agents/dispatcher.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_ID = "prod_ext_001"
const SIGNAL_ID  = "sig_ext_001"
const CONV_ID    = "conv_ext_001"
const CASE_ID    = "case_ext_001"
const IDENT_ID   = "id_ext_001"

const baseProduct = {
  product_id:       PRODUCT_ID,
  name:             "ExtTestProduct",
  slug:             "ext-test-product",
  stage:            "beta",
  lead_assignments: {},
  settings:         {},
}

function makeSignalRow(overrides: Record<string, unknown> = {}) {
  return {
    signal_id:         SIGNAL_ID,
    product_id:        PRODUCT_ID,
    source_type:       "external" as const,
    source_ref:        "hash-001",
    received_at:       new Date(),
    raw_payload:       {},
    normalized_payload:{},
    identity_id:       null,
    conversation_id:   null,
    case_id:           null,
    processing_status: "received" as const,
    channel_thread_id: null,
    channel_context:   null,
    created_at:        new Date(),
    ...overrides,
  }
}

const baseConv = {
  conversation_id: CONV_ID,
  product_id:      PRODUCT_ID,
  channel:         "external",
  subject:         "External message",
  thread_key:      `external:${PRODUCT_ID}:thread-001`,
  participant_ids: [IDENT_ID],
  status:          "active",
  last_message_at: new Date(),
  created_at:      new Date(),
}

const baseCase = {
  case_id:              CASE_ID,
  product_id:           PRODUCT_ID,
  title:                "Help me",
  status:               "new",
  current_persona:      "frontline",
  reporter_identity_id: IDENT_ID,
  conversation_ids:     [CONV_ID],
  signal_text:          "Help me",
  created_at:           new Date(),
  updated_at:           new Date(),
}

const baseIdentity = {
  identity_id:      IDENT_ID,
  product_id:       PRODUCT_ID,
  type:             "end_user",
  email_addresses:  [],
  telegram_handles: [],
  external_refs:    { "discord:user-001": true },
  display_name:     "Ext User",
  created_at:       new Date(),
  updated_at:       new Date(),
}

function makePayload(overrides: Partial<{
  threadId:       string
  senderName:     string
  senderRef:      string
  message:        string
  channelContext: Record<string, unknown>
}> = {}) {
  return {
    threadId:   "thread-001",
    senderName: "Ext User",
    senderRef:  "discord:user-001",
    message:    "Help me with my issue",
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("external-ingress (FEAT-003)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findProductById).mockResolvedValue(baseProduct as never)
    vi.mocked(repo.createSignal).mockResolvedValue(makeSignalRow() as never)
    vi.mocked(repo.updateSignal).mockResolvedValue(undefined as never)
    vi.mocked(repo.findConversationByThreadKey).mockResolvedValue(baseConv as never)
    vi.mocked(repo.createCase).mockResolvedValue(baseCase as never)
    vi.mocked(repo.createAuditEvent).mockResolvedValue(undefined as never)
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue(null)
    vi.mocked(identityRepo.findIdentityByExternalRef).mockResolvedValue(baseIdentity as never)
  })

  it("NF-UNIT-EXT-01: createSignal called with source_type 'external'", async () => {
    await ingestExternalSignal(PRODUCT_ID, makePayload())

    expect(repo.createSignal).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "external" }),
    )
  })

  it("NF-UNIT-EXT-02: createSignal called with channel_thread_id = threadId", async () => {
    await ingestExternalSignal(PRODUCT_ID, makePayload({ threadId: "thread-ext-002" }))

    expect(repo.createSignal).toHaveBeenCalledWith(
      expect.objectContaining({ channel_thread_id: "thread-ext-002" }),
    )
  })

  it("NF-UNIT-EXT-03: createSignal called with channel_context when provided", async () => {
    const channelContext = { guild_id: "123", channel_id: "456" }
    await ingestExternalSignal(PRODUCT_ID, makePayload({ channelContext }))

    expect(repo.createSignal).toHaveBeenCalledWith(
      expect.objectContaining({ channel_context: channelContext }),
    )
  })

  it("NF-UNIT-EXT-04: duplicate payload returns duplicate:true, no case created", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: "23505" })
    vi.mocked(repo.createSignal).mockRejectedValue(dupError)

    const result = await ingestExternalSignal(PRODUCT_ID, makePayload())

    expect(result.duplicate).toBe(true)
    expect(repo.createCase).not.toHaveBeenCalled()
  })

  it("NF-UNIT-EXT-05: threadId matching open case → createCase NOT called", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue("case_existing")

    await ingestExternalSignal(PRODUCT_ID, makePayload())

    expect(repo.createCase).not.toHaveBeenCalled()
  })

  it("NF-UNIT-EXT-06: threadId matching open case → dispatch NOT called", async () => {
    vi.mocked(repo.findOpenCaseByChannelThreadId).mockResolvedValue("case_existing")

    await ingestExternalSignal(PRODUCT_ID, makePayload())

    expect(dispatch).not.toHaveBeenCalled()
  })

  it("NF-UNIT-EXT-07: result.channelThreadId equals payload.threadId", async () => {
    const result = await ingestExternalSignal(PRODUCT_ID, makePayload({ threadId: "my-thread-007" }))

    expect(result.channelThreadId).toBe("my-thread-007")
  })
})
