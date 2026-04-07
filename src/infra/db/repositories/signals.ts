/**
 * Signals repository — SLICE-01.
 * A signal is one inbound or system-generated event (email, Telegram, GitHub webhook, etc.).
 * Raw payload is immutable after creation; mutable fields track processing state.
 *
 * Note: INSERT may throw a unique constraint violation when source_ref is a duplicate.
 * Callers should handle postgres error code '23505' for idempotent ingest.
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const SignalSourceTypeSchema = z.enum([
  "email",
  "telegram",
  "github_webhook",
  "scheduled",
  "manual",
  "contact_form",   // DEFERRED-13: embeddable contact form widget
  "chat",           // DEFERRED-05: live chat widget
  "bridge_event",   // BEF-11: cross-product bridge events
  "external",       // FEAT-003: generic external webhook
])
export type SignalSourceType = z.infer<typeof SignalSourceTypeSchema>

export const SignalProcessingStatusSchema = z.enum([
  "received",
  "normalizing",
  "normalized",
  "linked",
  "failed",
])
export type SignalProcessingStatus = z.infer<typeof SignalProcessingStatusSchema>

export const SignalRowSchema = z.object({
  signal_id:           z.string(),
  product_id:          z.string(),
  source_type:         SignalSourceTypeSchema,
  source_ref:          z.string().nullable(),
  received_at:         z.date(),
  raw_payload:         z.record(z.unknown()),
  normalized_payload:  z.record(z.unknown()),
  identity_id:         z.string().nullable(),
  conversation_id:     z.string().nullable(),
  case_id:             z.string().nullable(),
  processing_status:   SignalProcessingStatusSchema,
  channel_thread_id:   z.string().nullable(),
  channel_context:     z.record(z.unknown()).nullable(),
  created_at:          z.date(),
})
export type SignalRow = z.infer<typeof SignalRowSchema>

export const SignalInsertSchema = z.object({
  product_id:          z.string(),
  source_type:         SignalSourceTypeSchema,
  raw_payload:         z.record(z.unknown()),
  source_ref:          z.string().optional(),
  received_at:         z.date().optional(),
  normalized_payload:  z.record(z.unknown()).optional(),
  identity_id:         z.string().optional(),
  conversation_id:     z.string().optional(),
  case_id:             z.string().optional(),
  processing_status:   SignalProcessingStatusSchema.optional(),
  channel_thread_id:   z.string().optional(),
  channel_context:     z.record(z.unknown()).optional(),
})
export type SignalInsert = z.infer<typeof SignalInsertSchema>

export const SignalUpdateSchema = z.object({
  normalized_payload: z.record(z.unknown()).optional(),
  identity_id:        z.string().optional(),
  conversation_id:    z.string().optional(),
  case_id:            z.string().optional(),
  processing_status:  SignalProcessingStatusSchema.optional(),
  channel_thread_id:  z.string().optional(),
  channel_context:    z.record(z.unknown()).optional(),
})
export type SignalUpdate = z.infer<typeof SignalUpdateSchema>

// ── Repository ────────────────────────────────────────────────────────────────

export async function createSignal(input: SignalInsert): Promise<SignalRow> {
  const db = getDb()
  const signalId = newId("sig_")
  const v = SignalInsertSchema.parse(input)

  const [row] = await db<SignalRow[]>`
    INSERT INTO signals (
      signal_id, product_id, source_type,
      source_ref, received_at, raw_payload,
      normalized_payload, identity_id, conversation_id,
      case_id, processing_status, channel_thread_id, channel_context
    ) VALUES (
      ${signalId},
      ${v.product_id},
      ${v.source_type},
      ${v.source_ref ?? null},
      ${v.received_at ?? new Date()},
      ${db.json(pgJson(v.raw_payload))},
      ${db.json(pgJson(v.normalized_payload ?? {}))},
      ${v.identity_id ?? null},
      ${v.conversation_id ?? null},
      ${v.case_id ?? null},
      ${v.processing_status ?? "received"},
      ${v.channel_thread_id ?? null},
      ${v.channel_context ? db.json(pgJson(v.channel_context)) : null}
    )
    RETURNING *
  `
  return SignalRowSchema.parse(row)
}

export async function findSignalById(signalId: string): Promise<SignalRow | null> {
  const db = getDb()
  const [row] = await db<SignalRow[]>`
    SELECT * FROM signals WHERE signal_id = ${signalId}
  `
  return row ? SignalRowSchema.parse(row) : null
}

export async function findSignalByCaseId(caseId: string): Promise<SignalRow | null> {
  const db = getDb()
  const [row] = await db<SignalRow[]>`
    SELECT * FROM signals WHERE case_id = ${caseId} ORDER BY received_at ASC LIMIT 1
  `
  return row ? SignalRowSchema.parse(row) : null
}

/**
 * SLICE-02: Fetch all signals for a case in chronological order.
 * Used to build the full conversation thread in the case detail view.
 */
export async function findSignalsByCaseId(caseId: string): Promise<SignalRow[]> {
  const db = getDb()
  const rows = await db<SignalRow[]>`
    SELECT * FROM signals WHERE case_id = ${caseId} ORDER BY received_at ASC
  `
  return rows.map((r) => SignalRowSchema.parse(r))
}

/**
 * Fetch unprocessed signals for a product, oldest-first.
 * Used by the signal ingress worker.
 */
export async function findPendingSignals(
  productId: string,
  limit = 50,
): Promise<SignalRow[]> {
  const db = getDb()
  const rows = await db<SignalRow[]>`
    SELECT * FROM signals
    WHERE product_id = ${productId}
      AND processing_status NOT IN ('linked', 'failed')
    ORDER BY received_at ASC
    LIMIT ${limit}
  `
  return rows.map((r) => SignalRowSchema.parse(r))
}

/**
 * FEAT-003: Find an open case for a given product that already has a signal
 * with the supplied channel_thread_id.  Returns the case_id if found, or null.
 *
 * Used by the signal ingress pipeline to thread follow-up signals (e.g. email
 * In-Reply-To, external webhook threadId) into the existing open case rather
 * than opening a new one.
 */
export async function findOpenCaseByChannelThreadId(
  productId: string,
  channelThreadId: string,
): Promise<string | null> {
  const db = getDb()
  const [row] = await db<{ case_id: string }[]>`
    SELECT c.case_id
    FROM cases c
    JOIN signals s ON s.case_id = c.case_id
    WHERE c.product_id  = ${productId}
      AND s.channel_thread_id = ${channelThreadId}
      AND c.status NOT IN ('resolved', 'closed')
    ORDER BY c.created_at DESC
    LIMIT 1
  `
  return row?.case_id ?? null
}

export async function updateSignal(
  signalId: string,
  input: SignalUpdate,
): Promise<SignalRow | null> {
  const db = getDb()
  const v = SignalUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.normalized_payload !== undefined) updates["normalized_payload"] = db.json(pgJson(v.normalized_payload))
  if (v.identity_id !== undefined)        updates["identity_id"]        = v.identity_id
  if (v.conversation_id !== undefined)    updates["conversation_id"]    = v.conversation_id
  if (v.case_id !== undefined)            updates["case_id"]            = v.case_id
  if (v.processing_status !== undefined)  updates["processing_status"]  = v.processing_status
  if (v.channel_thread_id !== undefined)  updates["channel_thread_id"]  = v.channel_thread_id
  if (v.channel_context !== undefined)    updates["channel_context"]    = db.json(pgJson(v.channel_context))

  if (Object.keys(updates).length === 0) return findSignalById(signalId)

  const [row] = await db<SignalRow[]>`
    UPDATE signals
    SET ${db(updates)}
    WHERE signal_id = ${signalId}
    RETURNING *
  `
  return row ? SignalRowSchema.parse(row) : null
}
