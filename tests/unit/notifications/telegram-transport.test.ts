/**
 * Unit tests: notifications/telegram-transport — SLICE-25
 *
 * NF-UNIT-TG-01  returns false when TELEGRAM_BOT_TOKEN is not configured
 * NF-UNIT-TG-02  calls Telegram API with correct URL, method, and payload
 * NF-UNIT-TG-03  returns true on a 200 OK response
 * NF-UNIT-TG-04  returns false and logs warn when API returns non-OK status
 * NF-UNIT-TG-05  returns false and logs warn on network failure
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest"

// ── Mock config before importing the transport ────────────────────────────────

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    TELEGRAM_BOT_TOKEN: undefined as string | undefined,
  },
}))

const mockWarn = vi.fn()
const mockInfo = vi.fn()

vi.mock("../../../src/shared/logger.js", () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
    info: (...args: unknown[]) => mockInfo(...args),
  },
}))

import { config } from "../../../src/shared/config.js"
import { sendTelegram } from "../../../src/notifications/telegram-transport.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetchResponse(status: number, body: unknown): Response {
  return {
    ok:   status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sendTelegram", () => {
  let fetchSpy: MockInstance

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
    mockWarn.mockClear()
    mockInfo.mockClear()
    ;(config as { TELEGRAM_BOT_TOKEN: string | undefined }).TELEGRAM_BOT_TOKEN = undefined
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it("NF-UNIT-TG-01: returns false when TELEGRAM_BOT_TOKEN is not configured", async () => {
    const result = await sendTelegram({ chatId: "123456", text: "hello" })

    expect(result).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockInfo).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "123456" }),
      expect.stringContaining("not configured"),
    )
  })

  it("NF-UNIT-TG-02: calls Telegram API with correct URL and JSON payload", async () => {
    ;(config as { TELEGRAM_BOT_TOKEN: string | undefined }).TELEGRAM_BOT_TOKEN = "bot-token-abc"
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(200, { ok: true }))

    await sendTelegram({ chatId: "987654", text: "test message" })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]

    expect(url).toBe("https://api.telegram.org/botbot-token-abc/sendMessage")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }))

    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      chat_id:    "987654",
      text:       "test message",
      parse_mode: "HTML",
    })
  })

  it("NF-UNIT-TG-03: returns true on 200 OK response", async () => {
    ;(config as { TELEGRAM_BOT_TOKEN: string | undefined }).TELEGRAM_BOT_TOKEN = "valid-token"
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(200, { ok: true, result: { message_id: 1 } }))

    const result = await sendTelegram({ chatId: "111", text: "hi" })

    expect(result).toBe(true)
    expect(mockInfo).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "111" }),
      expect.stringContaining("sent"),
    )
  })

  it("NF-UNIT-TG-04: returns false and logs warn when API returns non-OK status", async () => {
    ;(config as { TELEGRAM_BOT_TOKEN: string | undefined }).TELEGRAM_BOT_TOKEN = "valid-token"
    fetchSpy.mockResolvedValueOnce(makeFetchResponse(400, { ok: false, description: "Bad Request: chat not found" }))

    const result = await sendTelegram({ chatId: "bad-chat", text: "hi" })

    expect(result).toBe(false)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "bad-chat", status: 400 }),
      expect.stringContaining("non-OK"),
    )
  })

  it("NF-UNIT-TG-05: returns false and logs warn on network failure", async () => {
    ;(config as { TELEGRAM_BOT_TOKEN: string | undefined }).TELEGRAM_BOT_TOKEN = "valid-token"
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    const result = await sendTelegram({ chatId: "222", text: "hello" })

    expect(result).toBe(false)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "222" }),
      expect.stringContaining("failed"),
    )
  })
})
