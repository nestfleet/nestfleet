/**
 * Conversations repository — SLICE-01.
 * A conversation is a channel-specific thread of communication (email thread,
 * Telegram chat, internal operator thread).
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const ConversationChannelSchema = z.enum(["email", "telegram", "internal", "chat", "external"])
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>

export const ConversationStatusSchema = z.enum(["active", "resolved", "closed"])
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>

export const ConversationRowSchema = z.object({
  conversation_id:  z.string(),
  product_id:       z.string(),
  channel:          ConversationChannelSchema,
  subject:          z.string().nullable(),
  thread_key:       z.string().nullable(),
  participant_ids:  z.array(z.string()),
  status:           ConversationStatusSchema,
  last_message_at:  z.date().nullable(),
  created_at:       z.date(),
  updated_at:       z.date(),
})
export type ConversationRow = z.infer<typeof ConversationRowSchema>

export const ConversationInsertSchema = z.object({
  product_id:      z.string(),
  channel:         ConversationChannelSchema,
  subject:         z.string().optional(),
  thread_key:      z.string().optional(),
  participant_ids: z.array(z.string()).optional(),
  status:          ConversationStatusSchema.optional(),
  last_message_at: z.date().optional(),
})
export type ConversationInsert = z.infer<typeof ConversationInsertSchema>

export const ConversationUpdateSchema = z.object({
  subject:         z.string().optional(),
  thread_key:      z.string().optional(),
  participant_ids: z.array(z.string()).optional(),
  status:          ConversationStatusSchema.optional(),
  last_message_at: z.date().optional(),
})
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

export async function createConversation(input: ConversationInsert): Promise<ConversationRow> {
  const db = getDb()
  const conversationId = newId("conv_")
  const v = ConversationInsertSchema.parse(input)

  const [row] = await db<ConversationRow[]>`
    INSERT INTO conversations (
      conversation_id, product_id, channel,
      subject, thread_key, participant_ids,
      status, last_message_at
    ) VALUES (
      ${conversationId},
      ${v.product_id},
      ${v.channel},
      ${v.subject ?? null},
      ${v.thread_key ?? null},
      ${db.array(v.participant_ids ?? [])},
      ${v.status ?? "active"},
      ${v.last_message_at ?? null}
    )
    RETURNING *
  `
  return ConversationRowSchema.parse(row)
}

export async function findConversationById(
  conversationId: string,
): Promise<ConversationRow | null> {
  const db = getDb()
  const [row] = await db<ConversationRow[]>`
    SELECT * FROM conversations WHERE conversation_id = ${conversationId}
  `
  return row ? ConversationRowSchema.parse(row) : null
}

/**
 * Find an existing conversation by thread key.
 * Used for dedup — prevents creating a new conversation for a reply in an existing thread.
 */
export async function findConversationByThreadKey(
  productId: string,
  channel: ConversationChannel,
  threadKey: string,
): Promise<ConversationRow | null> {
  const db = getDb()
  const [row] = await db<ConversationRow[]>`
    SELECT * FROM conversations
    WHERE product_id = ${productId}
      AND channel = ${channel}
      AND thread_key = ${threadKey}
    LIMIT 1
  `
  return row ? ConversationRowSchema.parse(row) : null
}

export async function updateConversation(
  conversationId: string,
  input: ConversationUpdate,
): Promise<ConversationRow | null> {
  const db = getDb()
  const v = ConversationUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.subject !== undefined)         updates["subject"]         = v.subject
  if (v.thread_key !== undefined)      updates["thread_key"]      = v.thread_key
  if (v.participant_ids !== undefined) updates["participant_ids"] = db.array(v.participant_ids)
  if (v.status !== undefined)          updates["status"]          = v.status
  if (v.last_message_at !== undefined) updates["last_message_at"] = v.last_message_at

  if (Object.keys(updates).length === 0) return findConversationById(conversationId)

  const [row] = await db<ConversationRow[]>`
    UPDATE conversations
    SET ${db(updates)}
    WHERE conversation_id = ${conversationId}
    RETURNING *
  `
  return row ? ConversationRowSchema.parse(row) : null
}
