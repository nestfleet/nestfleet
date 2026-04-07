/**
 * Audit events repository — SLICE-01.
 * Append-only immutable log of all significant domain actions.
 *
 * Design rules:
 *   - Never UPDATE or DELETE rows from this table
 *   - Every material state transition must emit an audit event
 *   - actor_type + actor_ref identify who/what caused the action
 *
 * Common action strings (non-exhaustive):
 *   'signal.received'        'signal.normalized'       'signal.linked'
 *   'conversation.created'   'conversation.closed'
 *   'case.created'           'case.status_changed'     'case.triaged'
 *   'case.resolved'          'case.closed'
 *   'agent.triage_complete'  'agent.abstained'
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const AuditEventRowSchema = z.object({
  audit_event_id: z.string(),
  product_id:     z.string(),
  entity_type:    z.string(),
  entity_ref:     z.string(),
  actor_type:     z.string(),
  actor_ref:      z.string(),
  action:         z.string(),
  before_state:   z.record(z.unknown()).nullable(),
  after_state:    z.record(z.unknown()).nullable(),
  metadata:       z.record(z.unknown()),
  occurred_at:    z.date(),
})
export type AuditEventRow = z.infer<typeof AuditEventRowSchema>

export const AuditEventInsertSchema = z.object({
  product_id:   z.string(),
  entity_type:  z.string(),
  entity_ref:   z.string(),
  actor_type:   z.string(),
  actor_ref:    z.string(),
  action:       z.string(),
  before_state: z.record(z.unknown()).optional(),
  after_state:  z.record(z.unknown()).optional(),
  metadata:     z.record(z.unknown()).optional(),
  occurred_at:  z.date().optional(),
})
export type AuditEventInsert = z.infer<typeof AuditEventInsertSchema>

export interface FindAuditEventsOptions {
  entityType: string | undefined
  entityRef:  string | undefined
  action:     string | undefined
  limit:      number | undefined
  offset:     number | undefined
}

// ── Repository ────────────────────────────────────────────────────────────────

export async function createAuditEvent(input: AuditEventInsert): Promise<AuditEventRow> {
  const db = getDb()
  const auditEventId = newId("ae_")
  const v = AuditEventInsertSchema.parse(input)

  const [row] = await db<AuditEventRow[]>`
    INSERT INTO audit_events (
      audit_event_id, product_id,
      entity_type, entity_ref,
      actor_type, actor_ref,
      action,
      before_state, after_state,
      metadata, occurred_at
    ) VALUES (
      ${auditEventId},
      ${v.product_id},
      ${v.entity_type},
      ${v.entity_ref},
      ${v.actor_type},
      ${v.actor_ref},
      ${v.action},
      ${v.before_state !== undefined ? db.json(pgJson(v.before_state)) : null},
      ${v.after_state !== undefined ? db.json(pgJson(v.after_state)) : null},
      ${db.json(pgJson(v.metadata ?? {}))},
      ${v.occurred_at ?? new Date()}
    )
    RETURNING *
  `
  return AuditEventRowSchema.parse(row)
}

/**
 * Find all audit events related to a case and its change requests, ordered
 * by occurred_at ASC. Used by the lineage assembler.
 *
 * Fetches events where entity_ref is the caseId itself OR one of the provided
 * changeRequestIds. Pass an empty array when there are no CRs yet.
 */
export async function findAuditEventsByCaseLineage(
  productId: string,
  caseId: string,
  changeRequestIds: string[],
): Promise<AuditEventRow[]> {
  const db = getDb()

  // Build the IN list — always include the case itself
  const refs = [caseId, ...changeRequestIds]

  const rows = await db<AuditEventRow[]>`
    SELECT * FROM audit_events
    WHERE product_id = ${productId}
      AND entity_ref = ANY(${db.array(refs)})
    ORDER BY occurred_at ASC
  `
  return rows.map((r) => AuditEventRowSchema.parse(r))
}

/**
 * Query audit events for a product with optional filters.
 * Results are ordered by occurred_at DESC (most recent first).
 */
export async function findAuditEvents(
  productId: string,
  opts: FindAuditEventsOptions = {
    entityType: undefined,
    entityRef: undefined,
    action: undefined,
    limit: undefined,
    offset: undefined,
  },
): Promise<AuditEventRow[]> {
  const db = getDb()
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  const rows = await db<AuditEventRow[]>`
    SELECT * FROM audit_events
    WHERE product_id = ${productId}
      ${opts.entityType !== undefined ? db`AND entity_type = ${opts.entityType}` : db``}
      ${opts.entityRef !== undefined  ? db`AND entity_ref  = ${opts.entityRef}`  : db``}
      ${opts.action !== undefined     ? db`AND action      = ${opts.action}`     : db``}
    ORDER BY occurred_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows.map((r) => AuditEventRowSchema.parse(r))
}
