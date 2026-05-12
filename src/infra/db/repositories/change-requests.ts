// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Change Requests repository.
 *
 * Implements the change request lifecycle from case-and-change-lifecycle.md §6:
 *   draft → analysis → approval-pending → approved →
 *   implementation-prep → pr-drafted → completed | rejected
 *
 * Design notes:
 * - TEXT PK with prefix (cr_), TEXT CHECK constraints (no Postgres enums)
 * - No FK constraints in DB; integrity enforced at application layer
 * - updated_at maintained via trigger (nestfleet_set_updated_at)
 */

import { z } from "zod"
import { getDb } from "../client.js"
import { newId, pgJson } from "../id.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const ChangeRequestStatusSchema = z.enum([
  "draft",
  "analysis",
  "approval-pending",
  "approved",
  "implementation-prep",
  "pr-drafted",
  "completed",
  "rejected",
])
export type ChangeRequestStatus = z.infer<typeof ChangeRequestStatusSchema>

export const ChangeRequestRiskSchema = z.enum(["low", "medium", "high", "critical"])
export type ChangeRequestRisk = z.infer<typeof ChangeRequestRiskSchema>

export const CrTrackSchema = z.enum(["customer_reported", "infra_debt"])
export type CrTrack = z.infer<typeof CrTrackSchema>

export const CiStatusSchema = z.enum(["pending", "passed", "failed"])
export type CiStatus = z.infer<typeof CiStatusSchema>

export const DeployStatusSchema = z.enum(["pending", "success", "failed"])
export type DeployStatus = z.infer<typeof DeployStatusSchema>

export const ChangeRequestRowSchema = z.object({
  change_request_id:    z.string(),
  product_id:           z.string(),
  case_id:              z.string(),
  title:                z.string().nullable(),
  problem_statement:    z.string().nullable(),
  status:               ChangeRequestStatusSchema,
  impact_summary:       z.string().nullable(),
  risk_level:           ChangeRequestRiskSchema.nullable(),
  proposed_scope:       z.string().nullable(),
  affected_surfaces:    z.array(z.string()),
  implementation_notes: z.string().nullable(),
  github_repo:          z.string().nullable(),
  github_issue_number:  z.number().nullable(),
  github_issue_url:     z.string().nullable(),
  github_pr_number:     z.number().nullable(),
  github_pr_url:        z.string().nullable(),
  approval_record:      z.record(z.unknown()).nullable(),
  validation_record:    z.record(z.unknown()).nullable(),
  approved_at:          z.date().nullable(),
  rejected_at:          z.date().nullable(),
  rejection_rationale:  z.string().nullable(),
  completed_at:         z.date().nullable(),
  // SLICE-13: CI / deploy tracking
  ci_status:            CiStatusSchema.nullable(),
  ci_details:           z.record(z.unknown()).nullable(),
  merged_at:            z.date().nullable(),
  deploy_status:        DeployStatusSchema.nullable(),
  deploy_details:       z.record(z.unknown()).nullable(),
  // 0039: origin track
  cr_track:             CrTrackSchema,
  created_at:           z.date(),
  updated_at:           z.date(),
})
export type ChangeRequestRow = z.infer<typeof ChangeRequestRowSchema>

export const ChangeRequestInsertSchema = z.object({
  product_id:           z.string(),
  case_id:              z.string(),
  title:                z.string().optional(),
  problem_statement:    z.string().optional(),
  status:               ChangeRequestStatusSchema.optional(),
  impact_summary:       z.string().optional(),
  risk_level:           ChangeRequestRiskSchema.optional(),
  proposed_scope:       z.string().optional(),
  affected_surfaces:    z.array(z.string()).optional(),
  implementation_notes: z.string().optional(),
  github_repo:          z.string().optional(),
  github_issue_number:  z.number().optional(),
  github_issue_url:     z.string().optional(),
  approval_record:      z.record(z.unknown()).optional(),
  validation_record:    z.record(z.unknown()).optional(),
  cr_track:             CrTrackSchema.optional(),
})
export type ChangeRequestInsert = z.infer<typeof ChangeRequestInsertSchema>

export const ChangeRequestUpdateSchema = z.object({
  title:                z.string().optional(),
  problem_statement:    z.string().optional(),
  status:               ChangeRequestStatusSchema.optional(),
  impact_summary:       z.string().optional(),
  risk_level:           ChangeRequestRiskSchema.optional(),
  proposed_scope:       z.string().optional(),
  affected_surfaces:    z.array(z.string()).optional(),
  implementation_notes: z.string().optional(),
  github_repo:          z.string().optional(),
  github_issue_number:  z.number().optional(),
  github_issue_url:     z.string().optional(),
  github_pr_number:     z.number().optional(),
  github_pr_url:        z.string().optional(),
  approval_record:      z.record(z.unknown()).optional(),
  validation_record:    z.record(z.unknown()).optional(),
  approved_at:          z.date().optional(),
  rejected_at:          z.date().optional(),
  rejection_rationale:  z.string().optional(),
  completed_at:         z.date().optional(),
  // SLICE-13: CI / deploy tracking
  ci_status:            CiStatusSchema.optional(),
  ci_details:           z.record(z.unknown()).optional(),
  merged_at:            z.date().optional(),
  deploy_status:        DeployStatusSchema.optional(),
  deploy_details:       z.record(z.unknown()).optional(),
})
export type ChangeRequestUpdate = z.infer<typeof ChangeRequestUpdateSchema>

export interface FindChangeRequestsOptions {
  status:  ChangeRequestStatus | undefined
  limit:   number | undefined
  offset:  number | undefined
}

// ── Repository ────────────────────────────────────────────────────────────────

export async function createChangeRequest(input: ChangeRequestInsert): Promise<ChangeRequestRow> {
  const db = getDb()
  const crId = newId("cr_")
  const v = ChangeRequestInsertSchema.parse(input)

  const [row] = await db<ChangeRequestRow[]>`
    INSERT INTO change_requests (
      change_request_id, product_id, case_id,
      title, problem_statement, status,
      impact_summary, risk_level, proposed_scope,
      affected_surfaces, implementation_notes,
      github_repo, github_issue_number, github_issue_url,
      approval_record, validation_record,
      cr_track
    ) VALUES (
      ${crId},
      ${v.product_id},
      ${v.case_id},
      ${v.title ?? null},
      ${v.problem_statement ?? null},
      ${v.status ?? "draft"},
      ${v.impact_summary ?? null},
      ${v.risk_level ?? null},
      ${v.proposed_scope ?? null},
      ${db.array(v.affected_surfaces ?? [])},
      ${v.implementation_notes ?? null},
      ${v.github_repo ?? null},
      ${v.github_issue_number ?? null},
      ${v.github_issue_url ?? null},
      ${v.approval_record !== undefined ? db.json(pgJson(v.approval_record)) : null},
      ${v.validation_record !== undefined ? db.json(pgJson(v.validation_record)) : null},
      ${v.cr_track ?? "customer_reported"}
    )
    RETURNING *
  `
  return ChangeRequestRowSchema.parse(row)
}

export async function findChangeRequestById(crId: string): Promise<ChangeRequestRow | null> {
  const db = getDb()
  const [row] = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests WHERE change_request_id = ${crId}
  `
  return row ? ChangeRequestRowSchema.parse(row) : null
}

export async function findChangeRequestsByCase(caseId: string): Promise<ChangeRequestRow[]> {
  const db = getDb()
  const rows = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests
    WHERE case_id = ${caseId}
    ORDER BY created_at DESC
  `
  return rows.map((r) => ChangeRequestRowSchema.parse(r))
}

export async function findChangeRequestsByProduct(
  productId: string,
  opts: FindChangeRequestsOptions = { status: undefined, limit: undefined, offset: undefined },
): Promise<ChangeRequestRow[]> {
  const db = getDb()
  const limit  = opts.limit  ?? 50
  const offset = opts.offset ?? 0

  const rows = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests
    WHERE product_id = ${productId}
      ${opts.status !== undefined ? db`AND status = ${opts.status}` : db``}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows.map((r) => ChangeRequestRowSchema.parse(r))
}

export async function updateChangeRequest(
  crId: string,
  input: ChangeRequestUpdate,
): Promise<ChangeRequestRow | null> {
  const db = getDb()
  const v = ChangeRequestUpdateSchema.parse(input)

  const updates: Record<string, unknown> = {}
  if (v.title !== undefined)                updates["title"]                = v.title
  if (v.problem_statement !== undefined)    updates["problem_statement"]    = v.problem_statement
  if (v.status !== undefined)               updates["status"]               = v.status
  if (v.impact_summary !== undefined)       updates["impact_summary"]       = v.impact_summary
  if (v.risk_level !== undefined)           updates["risk_level"]           = v.risk_level
  if (v.proposed_scope !== undefined)       updates["proposed_scope"]       = v.proposed_scope
  if (v.affected_surfaces !== undefined)    updates["affected_surfaces"]    = db.array(v.affected_surfaces)
  if (v.implementation_notes !== undefined) updates["implementation_notes"] = v.implementation_notes
  if (v.github_repo !== undefined)          updates["github_repo"]          = v.github_repo
  if (v.github_issue_number !== undefined)  updates["github_issue_number"]  = v.github_issue_number
  if (v.github_issue_url !== undefined)     updates["github_issue_url"]     = v.github_issue_url
  if (v.github_pr_number !== undefined)     updates["github_pr_number"]     = v.github_pr_number
  if (v.github_pr_url !== undefined)        updates["github_pr_url"]        = v.github_pr_url
  if (v.approval_record !== undefined)      updates["approval_record"]      = db.json(pgJson(v.approval_record))
  if (v.validation_record !== undefined)    updates["validation_record"]    = db.json(pgJson(v.validation_record))
  if (v.approved_at !== undefined)          updates["approved_at"]          = v.approved_at
  if (v.rejected_at !== undefined)          updates["rejected_at"]          = v.rejected_at
  if (v.rejection_rationale !== undefined)  updates["rejection_rationale"]  = v.rejection_rationale
  if (v.completed_at !== undefined)         updates["completed_at"]         = v.completed_at
  // SLICE-13: CI / deploy tracking
  if (v.ci_status     !== undefined)        updates["ci_status"]            = v.ci_status
  if (v.ci_details    !== undefined)        updates["ci_details"]           = db.json(pgJson(v.ci_details))
  if (v.merged_at     !== undefined)        updates["merged_at"]            = v.merged_at
  if (v.deploy_status !== undefined)        updates["deploy_status"]        = v.deploy_status
  if (v.deploy_details !== undefined)       updates["deploy_details"]       = db.json(pgJson(v.deploy_details))

  if (Object.keys(updates).length === 0) return findChangeRequestById(crId)

  const [row] = await db<ChangeRequestRow[]>`
    UPDATE change_requests
    SET ${db(updates)}
    WHERE change_request_id = ${crId}
    RETURNING *
  `
  return row ? ChangeRequestRowSchema.parse(row) : null
}

/**
 * Approve a change request — transitions to 'approved', records the approval actor.
 */
export async function approveChangeRequest(
  crId: string,
  approverRef: string,
  role: string,
  rationale: string,
): Promise<ChangeRequestRow | null> {
  return updateChangeRequest(crId, {
    status:        "approved",
    approved_at:   new Date(),
    approval_record: {
      approver_ref: approverRef,
      role,
      rationale,
      approved_at: new Date().toISOString(),
    },
  })
}

/**
 * Find a change request by GitHub issue number, scoped to a product.
 * Returns null if not found or if the CR has no GitHub issue linkage.
 */
export async function findChangeRequestByGithubIssueNumber(
  productId: string,
  issueNumber: number,
): Promise<ChangeRequestRow | null> {
  const db = getDb()
  const [row] = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests
    WHERE product_id = ${productId}
      AND github_issue_number = ${issueNumber}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ? ChangeRequestRowSchema.parse(row) : null
}

/**
 * Find a change request by GitHub PR number, scoped to a product.
 * Returns null if not found or if the CR has no GitHub PR linkage.
 */
export async function findChangeRequestByGithubPrNumber(
  productId: string,
  prNumber: number,
): Promise<ChangeRequestRow | null> {
  const db = getDb()
  const [row] = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests
    WHERE product_id = ${productId}
      AND github_pr_number = ${prNumber}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ? ChangeRequestRowSchema.parse(row) : null
}

/**
 * SLICE-13: Find a change request by the head SHA stored in ci_details.
 * The head SHA is written when we record ci_details on the pr_merged event.
 * Scoped to a product to prevent cross-product leaks.
 */
export async function findChangeRequestByHeadSha(
  productId: string,
  headSha: string,
): Promise<ChangeRequestRow | null> {
  const db = getDb()
  const [row] = await db<ChangeRequestRow[]>`
    SELECT * FROM change_requests
    WHERE product_id = ${productId}
      AND ci_details->>'head_sha' = ${headSha}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ? ChangeRequestRowSchema.parse(row) : null
}

/**
 * Reject a change request — transitions to 'rejected', records rationale.
 */
export async function rejectChangeRequest(
  crId: string,
  rationale: string,
): Promise<ChangeRequestRow | null> {
  return updateChangeRequest(crId, {
    status:              "rejected",
    rejected_at:         new Date(),
    rejection_rationale: rationale,
  })
}
