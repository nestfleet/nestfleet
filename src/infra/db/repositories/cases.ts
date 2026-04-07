/**
 * Cases repository — SLICE-01.
 * The Case is the central operational object in NestFleet v1.
 * It tracks a support issue, request, or concern from first signal to resolution.
 *
 * State machine (from case-and-change-lifecycle.md §5.1):
 *   new → enriching → triaged → in-resolution → resolved → closed
 *                            → awaiting-user → enriching
 *                            → awaiting-lead → in-resolution | in-change
 *                            → in-change → pr-drafting → resolved
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const CaseStatusSchema = z.enum([
  "new",
  "enriching",
  "triaged",
  "awaiting-user",
  "awaiting-lead",
  "in-resolution",
  "in-change",
  "pr-drafting",
  "resolved",
  "closed",
])
export type CaseStatus = z.infer<typeof CaseStatusSchema>

export const CaseTypeSchema = z.enum([
  "user_request",
  "bug_report",
  "outage_report",
  "user_feedback",
  "sales_inquiry",
])
export type CaseType = z.infer<typeof CaseTypeSchema>

export const CaseSeveritySchema = z.enum(["critical", "high", "normal", "low"])
export type CaseSeverity = z.infer<typeof CaseSeveritySchema>

export const CaseUrgencySchema = z.enum(["immediate", "high", "normal", "low"])
export type CaseUrgency = z.infer<typeof CaseUrgencySchema>

export const CasePersonaSchema = z.enum(["frontline", "steward", "change", "none"])
export type CasePersona = z.infer<typeof CasePersonaSchema>

export const LeadRoleSchema = z.enum([
  "support_lead",
  "product_lead",
  "change_lead",
  "knowledge_lead",
])
export type LeadRole = z.infer<typeof LeadRoleSchema>

export const CaseRowSchema = z.object({
  case_id:               z.string(),
  product_id:            z.string(),
  title:                 z.string().nullable(),
  summary:               z.string().nullable(),
  reporter_identity_id:  z.string().nullable(),
  conversation_ids:      z.array(z.string()),
  status:                CaseStatusSchema,
  type:                  CaseTypeSchema.nullable(),
  severity:              CaseSeveritySchema.nullable(),
  urgency:               CaseUrgencySchema.nullable(),
  confidence:            z.number().nullable(),
  current_persona:       CasePersonaSchema.nullable(),
  assigned_lead_role:    LeadRoleSchema.nullable(),
  triage_output:         z.record(z.unknown()).nullable(),
  github_issue_ref:      z.string().nullable(),
  signal_text:           z.string().nullable(),
  created_at:            z.date(),
  updated_at:            z.date(),
  resolved_at:           z.date().nullable(),
  closed_at:             z.date().nullable(),
  // Populated by findCasesByProduct CTEs — absent on single-row fetches
  last_event_action:     z.string().nullable().optional(),
  last_event_at:         z.date().nullable().optional(),
  // SLICE-10: true if resolved with zero human-actor events (all agent/system)
  ai_resolved:           z.boolean().optional(),
  // DEFERRED-24: AI draft reply stored when auto-send gates fail → awaiting-lead
  draft_reply:           z.string().nullable().optional(),
  draft_metadata:        z.record(z.unknown()).nullable().optional(),
})
export type CaseRow = z.infer<typeof CaseRowSchema>

export const CaseInsertSchema = z.object({
  product_id:           z.string(),
  title:                z.string().optional(),
  summary:              z.string().optional(),
  reporter_identity_id: z.string().optional(),
  conversation_ids:     z.array(z.string()).optional(),
  status:               CaseStatusSchema.optional(),
  type:                 CaseTypeSchema.optional(),
  severity:             CaseSeveritySchema.optional(),
  urgency:              CaseUrgencySchema.optional(),
  confidence:           z.number().min(0).max(1).optional(),
  current_persona:      CasePersonaSchema.optional(),
  assigned_lead_role:   LeadRoleSchema.optional(),
  triage_output:        z.record(z.unknown()).optional(),
  github_issue_ref:     z.string().optional(),
  signal_text:          z.string().optional(),
})
export type CaseInsert = z.infer<typeof CaseInsertSchema>

export const CaseUpdateSchema = z.object({
  title:                z.string().optional(),
  summary:              z.string().optional(),
  reporter_identity_id: z.string().optional(),
  conversation_ids:     z.array(z.string()).optional(),
  status:               CaseStatusSchema.optional(),
  type:                 CaseTypeSchema.optional(),
  severity:             CaseSeveritySchema.optional(),
  urgency:              CaseUrgencySchema.optional(),
  confidence:           z.number().min(0).max(1).optional(),
  current_persona:      CasePersonaSchema.optional(),
  assigned_lead_role:   LeadRoleSchema.optional(),
  triage_output:        z.record(z.unknown()).optional(),
  github_issue_ref:     z.string().optional(),
  resolved_at:          z.date().optional(),
  closed_at:            z.date().optional(),
  draft_reply:          z.string().nullable().optional(),
})
export type CaseUpdate = z.infer<typeof CaseUpdateSchema>

export interface FindCasesOptions {
  status:   CaseStatus | undefined
  severity: CaseSeverity | undefined
  limit:    number | undefined
  offset:   number | undefined
  channel:  string | undefined
}

// ── Repository ────────────────────────────────────────────────────────────────

export async function createCase(input: CaseInsert): Promise<CaseRow> {
  const db = getDb()
  const caseId = newId("case_")
  const v = CaseInsertSchema.parse(input)

  const [row] = await db<CaseRow[]>`
    INSERT INTO cases (
      case_id, product_id, title, summary,
      reporter_identity_id, conversation_ids,
      status, type, severity, urgency,
      confidence, current_persona, assigned_lead_role,
      triage_output, github_issue_ref
    ) VALUES (
      ${caseId},
      ${v.product_id},
      ${v.title ?? null},
      ${v.summary ?? null},
      ${v.reporter_identity_id ?? null},
      ${db.array(v.conversation_ids ?? [])},
      ${v.status ?? "new"},
      ${v.type ?? null},
      ${v.severity ?? null},
      ${v.urgency ?? null},
      ${v.confidence ?? null},
      ${v.current_persona ?? null},
      ${v.assigned_lead_role ?? null},
      ${v.triage_output !== undefined ? db.json(pgJson(v.triage_output)) : null},
      ${v.github_issue_ref ?? null}
    )
    RETURNING *
  `
  return CaseRowSchema.parse(row)
}

export async function findCaseById(caseId: string): Promise<CaseRow | null> {
  const db = getDb()
  const [row] = await db<CaseRow[]>`
    SELECT * FROM cases WHERE case_id = ${caseId}
  `
  return row ? CaseRowSchema.parse(row) : null
}

/**
 * List cases for a product with optional filtering.
 * Primary query path for the operator queue.
 */
export async function findCasesByProduct(
  productId: string,
  opts: FindCasesOptions = { status: undefined, severity: undefined, limit: undefined, offset: undefined, channel: undefined },
): Promise<CaseRow[]> {
  const db = getDb()
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  // CTE: for each case in this product, find the most-recent audit event
  // (ranked by occurred_at DESC) across BOTH case-level events and any
  // change_request events linked to that case via the change_requests table.
  // ROW_NUMBER avoids LATERAL JOINs which can have edge-case issues with
  // correlated subqueries in prepared-statement mode.
  const rows = await db<CaseRow[]>`
    WITH case_last_events AS (
      SELECT
        CASE
          WHEN ae.entity_type = 'case' THEN ae.entity_ref
          ELSE cr.case_id
        END                                                         AS case_id,
        ae.action,
        ae.occurred_at,
        ROW_NUMBER() OVER (
          PARTITION BY
            CASE
              WHEN ae.entity_type = 'case' THEN ae.entity_ref
              ELSE cr.case_id
            END
          ORDER BY ae.occurred_at DESC
        ) AS rn
      FROM  audit_events ae
      LEFT JOIN change_requests cr
        ON  ae.entity_type = 'change_request'
        AND ae.entity_ref  = cr.change_request_id
      WHERE ae.product_id = ${productId}
        AND (ae.entity_type = 'case' OR ae.entity_type = 'change_request')
    ),
    case_human_actions AS (
      -- SLICE-10: count human-actor events per case (after initial signal).
      -- If count = 0 AND case is resolved → ai_resolved = true.
      SELECT
        CASE
          WHEN ae.entity_type = 'case' THEN ae.entity_ref
          ELSE cr2.case_id
        END AS case_id,
        COUNT(*) AS human_action_count
      FROM  audit_events ae
      LEFT JOIN change_requests cr2
        ON  ae.entity_type = 'change_request'
        AND ae.entity_ref  = cr2.change_request_id
      WHERE ae.product_id = ${productId}
        AND (ae.entity_type = 'case' OR ae.entity_type = 'change_request')
        AND ae.actor_type NOT IN ('agent', 'system')
        AND ae.action != 'case.created'
      GROUP BY 1
    )
    SELECT c.*,
           cle.action      AS last_event_action,
           cle.occurred_at AS last_event_at,
           CASE
             WHEN c.status = 'resolved' AND COALESCE(cha.human_action_count, 0) = 0
             THEN true
             ELSE false
           END AS ai_resolved
    FROM   cases c
    LEFT JOIN case_last_events cle
      ON  cle.case_id = c.case_id
      AND cle.rn      = 1
    LEFT JOIN case_human_actions cha
      ON  cha.case_id = c.case_id
    WHERE c.product_id = ${productId}
      ${opts.status   !== undefined ? db`AND c.status   = ${opts.status}`   : db``}
      ${opts.severity !== undefined ? db`AND c.severity = ${opts.severity}` : db``}
      ${opts.channel  !== undefined ? db`AND EXISTS (
        SELECT 1 FROM conversations conv
        WHERE  conv.conversation_id = ANY(c.conversation_ids)
          AND  conv.channel         = ${opts.channel}
      )` : db``}
    ORDER BY COALESCE(cle.occurred_at, c.created_at) DESC
    LIMIT  ${limit} OFFSET ${offset}
  `
  return rows.map((r) => CaseRowSchema.parse(r))
}

export async function updateCase(
  caseId: string,
  input: CaseUpdate,
): Promise<CaseRow | null> {
  const db = getDb()
  const v = CaseUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.title !== undefined)                updates["title"]                = v.title
  if (v.summary !== undefined)              updates["summary"]              = v.summary
  if (v.reporter_identity_id !== undefined) updates["reporter_identity_id"] = v.reporter_identity_id
  if (v.conversation_ids !== undefined)     updates["conversation_ids"]     = db.array(v.conversation_ids)
  if (v.status !== undefined)               updates["status"]               = v.status
  if (v.type !== undefined)                 updates["type"]                 = v.type
  if (v.severity !== undefined)             updates["severity"]             = v.severity
  if (v.urgency !== undefined)              updates["urgency"]              = v.urgency
  if (v.confidence !== undefined)           updates["confidence"]           = v.confidence
  if (v.current_persona !== undefined)      updates["current_persona"]      = v.current_persona
  if (v.assigned_lead_role !== undefined)   updates["assigned_lead_role"]   = v.assigned_lead_role
  if (v.triage_output !== undefined)        updates["triage_output"]        = db.json(pgJson(v.triage_output))
  if (v.github_issue_ref !== undefined)     updates["github_issue_ref"]     = v.github_issue_ref
  if (v.resolved_at !== undefined)          updates["resolved_at"]          = v.resolved_at
  if (v.closed_at !== undefined)            updates["closed_at"]            = v.closed_at
  if (v.draft_reply !== undefined)          updates["draft_reply"]          = v.draft_reply

  if (Object.keys(updates).length === 0) return findCaseById(caseId)

  const [row] = await db<CaseRow[]>`
    UPDATE cases
    SET ${db(updates)}
    WHERE case_id = ${caseId}
    RETURNING *
  `
  return row ? CaseRowSchema.parse(row) : null
}

// ── Draft reply helpers ───────────────────────────────────────────────────────

/**
 * Persist an AI-generated draft reply on a case.
 * Called by AutoReplyWorker when validation gates fail (awaiting-lead) or
 * after a successful auto-send so the thread shows what was sent.
 *
 * @param caseId     - target case
 * @param draftReply - full reply text from the agent
 * @param metadata   - provenance: { confidenceScore, reasoning, sourceTiers, evidenceRefs, createdAt, createdBy }
 */
export async function saveDraftReply(
  caseId: string,
  draftReply: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  await db`
    UPDATE cases
    SET    draft_reply    = ${draftReply},
           draft_metadata = ${db.json(metadata as Parameters<typeof db.json>[0])},
           updated_at     = NOW()
    WHERE  case_id = ${caseId}
  `
}

/**
 * Clear the draft reply fields after the operator has sent the email.
 * Prevents stale drafts from appearing if the case is ever re-opened.
 */
export async function clearDraftReply(caseId: string): Promise<void> {
  const db = getDb()
  await db`
    UPDATE cases
    SET    draft_reply    = NULL,
           draft_metadata = NULL,
           updated_at     = NOW()
    WHERE  case_id = ${caseId}
  `
}

/**
 * Touch a case's updated_at without changing any other fields.
 *
 * Used when a linked entity (change request, notification) changes state
 * and we need the case to surface as "recently active" in list views.
 * Keeps case.updated_at as the single source of truth for "last event in
 * this case's flow", regardless of which entity triggered it.
 */
export async function touchCase(caseId: string): Promise<void> {
  const db = getDb()
  await db`
    UPDATE cases
    SET    updated_at = NOW()
    WHERE  case_id = ${caseId}
  `
}

/**
 * Transition a case status with validation.
 * Records resolved_at / closed_at timestamps automatically.
 */
export async function transitionCaseStatus(
  caseId: string,
  newStatus: CaseStatus,
  actorRef: string,
): Promise<CaseRow | null> {
  const timestamps: CaseUpdate = { status: newStatus }
  if (newStatus === "resolved") timestamps.resolved_at = new Date()
  if (newStatus === "closed")   timestamps.closed_at   = new Date()
  return updateCase(caseId, { ...timestamps, current_persona: undefined })
}
