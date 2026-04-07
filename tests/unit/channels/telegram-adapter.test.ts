/**
 * TDD: Unit tests for Telegram channel adapter — SLICE-25.
 * Written BEFORE implementation.
 *
 * NF-UNIT-TG-01 through NF-UNIT-TG-08.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"

// ── Schema for Telegram webhook payload (TDD: define contract first) ────────

const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }),
    chat: z.object({
      id: z.number(),
      type: z.enum(["private", "group", "supergroup", "channel"]),
      title: z.string().optional(),
    }),
    date: z.number(),
    text: z.string().optional(),
  }).optional(),
})

// ── Signal normalization (TDD: define expected output) ──────────────────────

interface NormalizedSignal {
  sourceType: "telegram"
  externalId: string
  senderIdentity: {
    telegramId: number
    username: string | null
    displayName: string
  }
  chatId: number
  chatType: string
  text: string
  receivedAt: Date
}

function normalizeTelegramUpdate(raw: z.infer<typeof TelegramUpdateSchema>): NormalizedSignal | null {
  const msg = raw.message
  if (!msg || !msg.text) return null // Skip non-text messages

  return {
    sourceType: "telegram",
    externalId: `tg_${msg.chat.id}_${msg.message_id}`,
    senderIdentity: {
      telegramId: msg.from.id,
      username: msg.from.username ?? null,
      displayName: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" "),
    },
    chatId: msg.chat.id,
    chatType: msg.chat.type,
    text: msg.text,
    receivedAt: new Date(msg.date * 1000),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TelegramUpdateSchema", () => {
  it("NF-UNIT-TG-01: parses a valid private message", () => {
    const valid = {
      update_id: 123456,
      message: {
        message_id: 789,
        from: { id: 42, is_bot: false, first_name: "Alice", username: "alice_dev" },
        chat: { id: 42, type: "private" as const },
        date: 1710000000,
        text: "Export pipeline keeps timing out",
      },
    }
    expect(() => TelegramUpdateSchema.parse(valid)).not.toThrow()
  })

  it("NF-UNIT-TG-02: parses a group message", () => {
    const valid = {
      update_id: 123457,
      message: {
        message_id: 790,
        from: { id: 43, is_bot: false, first_name: "Bob", last_name: "Smith" },
        chat: { id: -100123, type: "supergroup" as const, title: "DocuGardener Support" },
        date: 1710000100,
        text: "Getting 500 errors on the API",
      },
    }
    expect(() => TelegramUpdateSchema.parse(valid)).not.toThrow()
  })

  it("NF-UNIT-TG-03: rejects invalid chat type", () => {
    expect(() => TelegramUpdateSchema.parse({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 1, is_bot: false, first_name: "X" },
        chat: { id: 1, type: "forum" },
        date: 1,
        text: "test",
      },
    })).toThrow()
  })
})

describe("normalizeTelegramUpdate()", () => {
  const baseUpdate = {
    update_id: 100,
    message: {
      message_id: 200,
      from: { id: 42, is_bot: false, first_name: "Alice", last_name: "Dev", username: "alice_dev" },
      chat: { id: 42, type: "private" as const },
      date: 1710000000,
      text: "Help! My export is broken.",
    },
  }

  it("NF-UNIT-TG-04: normalizes a text message into a signal", () => {
    const signal = normalizeTelegramUpdate(baseUpdate)
    expect(signal).not.toBeNull()
    expect(signal!.sourceType).toBe("telegram")
    expect(signal!.externalId).toBe("tg_42_200")
    expect(signal!.text).toBe("Help! My export is broken.")
    expect(signal!.senderIdentity.telegramId).toBe(42)
    expect(signal!.senderIdentity.username).toBe("alice_dev")
    expect(signal!.senderIdentity.displayName).toBe("Alice Dev")
  })

  it("NF-UNIT-TG-05: returns null for updates without message", () => {
    const signal = normalizeTelegramUpdate({ update_id: 101 } as z.infer<typeof TelegramUpdateSchema>)
    expect(signal).toBeNull()
  })

  it("NF-UNIT-TG-06: returns null for messages without text (e.g., stickers)", () => {
    const signal = normalizeTelegramUpdate({
      update_id: 102,
      message: {
        message_id: 201,
        from: { id: 42, is_bot: false, first_name: "Alice" },
        chat: { id: 42, type: "private" },
        date: 1710000000,
        // no text field
      },
    })
    expect(signal).toBeNull()
  })

  it("NF-UNIT-TG-07: handles missing username gracefully", () => {
    const noUsername = {
      ...baseUpdate,
      message: {
        ...baseUpdate.message,
        from: { id: 42, is_bot: false, first_name: "NoUser" },
      },
    }
    const signal = normalizeTelegramUpdate(noUsername)
    expect(signal!.senderIdentity.username).toBeNull()
    expect(signal!.senderIdentity.displayName).toBe("NoUser")
  })

  it("NF-UNIT-TG-08: converts Unix timestamp to Date", () => {
    const signal = normalizeTelegramUpdate(baseUpdate)
    expect(signal!.receivedAt).toBeInstanceOf(Date)
    expect(signal!.receivedAt.getTime()).toBe(1710000000 * 1000)
  })
})
