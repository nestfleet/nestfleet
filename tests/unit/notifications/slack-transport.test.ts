/**
 * Unit tests: Slack transport — SLICE-26.
 *
 * NF-UNIT-SL-01  returns false when neither webhook nor bot token configured
 * NF-UNIT-SL-02  sends via webhook when SLACK_WEBHOOK_URL configured
 * NF-UNIT-SL-03  sends via bot API when SLACK_BOT_TOKEN configured
 * NF-UNIT-SL-04  webhook takes priority over bot token
 * NF-UNIT-SL-05  formats message with subject as bold header
 * NF-UNIT-SL-06  returns false on webhook non-2xx
 * NF-UNIT-SL-07  returns false on bot API ok:false
 * NF-UNIT-SL-08  returns false on network error (never throws)
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    SLACK_WEBHOOK_URL:     undefined as string | undefined,
    SLACK_BOT_TOKEN:       undefined as string | undefined,
    SLACK_DEFAULT_CHANNEL: undefined as string | undefined,
  },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { sendSlack } from "../../../src/notifications/slack-transport.js"
import { config }    from "../../../src/shared/config.js"

// ── Helpers ────────────────────────────────────────────────────────────────────

function setConfig(overrides: Partial<typeof config>): void {
  Object.assign(config, {
    SLACK_WEBHOOK_URL:     undefined,
    SLACK_BOT_TOKEN:       undefined,
    SLACK_DEFAULT_CHANNEL: undefined,
    ...overrides,
  })
}

function mockFetch(status: number, body: unknown): MockInstance {
  const stub = vi.fn().mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal("fetch", stub)
  return stub
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("sendSlack", () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    setConfig({})
  })

  it("NF-UNIT-SL-01: returns false when neither webhook URL nor bot token configured", async () => {
    const result = await sendSlack({ text: "hello" })
    expect(result).toBe(false)
  })

  it("NF-UNIT-SL-02: sends via webhook when SLACK_WEBHOOK_URL configured", async () => {
    setConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/xxxx" })
    const fetchStub = mockFetch(200, "ok")

    const result = await sendSlack({ text: "case escalated" })

    expect(result).toBe(true)
    expect(fetchStub).toHaveBeenCalledOnce()

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://hooks.slack.com/services/T000/B000/xxxx")
    expect(init.method).toBe("POST")

    const sentBody = JSON.parse(init.body as string) as { text: string }
    expect(sentBody.text).toBe("case escalated")
  })

  it("NF-UNIT-SL-03: sends via bot API when SLACK_BOT_TOKEN configured", async () => {
    setConfig({
      SLACK_BOT_TOKEN:       "xoxb-test-token",
      SLACK_DEFAULT_CHANNEL: "C01CHANNEL",
    })
    const fetchStub = mockFetch(200, { ok: true })

    const result = await sendSlack({ text: "approval required" })

    expect(result).toBe(true)
    expect(fetchStub).toHaveBeenCalledOnce()

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://slack.com/api/chat.postMessage")

    const headers = init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer xoxb-test-token")

    const sentBody = JSON.parse(init.body as string) as { channel: string; text: string }
    expect(sentBody.channel).toBe("C01CHANNEL")
    expect(sentBody.text).toBe("approval required")
  })

  it("NF-UNIT-SL-04: webhook takes priority over bot token when both configured", async () => {
    setConfig({
      SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/yyyy",
      SLACK_BOT_TOKEN:   "xoxb-should-not-be-used",
    })
    const fetchStub = mockFetch(200, "ok")

    const result = await sendSlack({ text: "ping" })

    expect(result).toBe(true)
    const [url] = fetchStub.mock.calls[0] as [string]
    expect(url).toBe("https://hooks.slack.com/services/T000/B000/yyyy")
  })

  it("NF-UNIT-SL-05: formats message with subject as bold header", async () => {
    setConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/zzzz" })
    const fetchStub = mockFetch(200, "ok")

    await sendSlack({ subject: "Case #42 escalated", text: "Customer has not received a reply in 48h." })

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { text: string }
    expect(sentBody.text).toBe("*Case #42 escalated*\nCustomer has not received a reply in 48h.")
  })

  it("NF-UNIT-SL-06: returns false when webhook returns non-2xx", async () => {
    setConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/bad" })
    mockFetch(403, "no_permission")

    const result = await sendSlack({ text: "test" })
    expect(result).toBe(false)
  })

  it("NF-UNIT-SL-07: returns false when bot API returns ok:false", async () => {
    setConfig({
      SLACK_BOT_TOKEN:       "xoxb-bad-token",
      SLACK_DEFAULT_CHANNEL: "C01CHANNEL",
    })
    mockFetch(200, { ok: false, error: "channel_not_found" })

    const result = await sendSlack({ text: "test" })
    expect(result).toBe(false)
  })

  it("NF-UNIT-SL-08: returns false on network error (never throws)", async () => {
    setConfig({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/offline" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const result = await sendSlack({ text: "network failure test" })
    expect(result).toBe(false)
  })
})
