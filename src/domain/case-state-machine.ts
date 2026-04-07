/**
 * CaseStateMachine — SLICE-14A.
 *
 * Enforces the allowed-transition rules from case-and-change-lifecycle.md §5.1.
 * Every case status update MUST go through `transitionCase()` — direct
 * `updateCase(id, { status })` calls are prohibited after this module ships.
 *
 * Pattern: read current state → validate from→to → delegate to updateCase().
 * Throws InvalidStateTransitionError on illegal transitions.
 */

import type { CaseStatus, CaseUpdate } from "../infra/db/repositories/cases.js"
import { findCaseById, updateCase } from "../infra/db/repositories/cases.js"
import { logger } from "../shared/logger.js"

// ── Error ────────────────────────────────────────────────────────────────────

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly entityType: "case" | "change_request",
    public readonly entityId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Illegal ${entityType} transition: ${from} → ${to} (entity: ${entityId})`)
    this.name = "InvalidStateTransitionError"
  }
}

// ── Allowed transitions (§5.1) ───────────────────────────────────────────────

const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  "new":            ["enriching", "closed"],
  "enriching":      ["triaged", "awaiting-user", "in-resolution", "closed"],
  "triaged":        ["in-resolution", "awaiting-lead", "in-change", "resolved"],
  "awaiting-user":  ["enriching", "resolved", "closed"],
  "awaiting-lead":  ["in-resolution", "in-change", "resolved", "closed"],
  "in-resolution":  ["resolved", "awaiting-user", "awaiting-lead", "in-change"],
  "in-change":      ["pr-drafting", "awaiting-lead", "resolved", "closed"],
  "pr-drafting":    ["resolved", "awaiting-lead", "closed"],
  "resolved":       ["closed", "awaiting-user", "awaiting-lead"],
  "closed":         [],
}

/**
 * Check whether a case transition is legal without performing it.
 */
export function isCaseTransitionAllowed(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Transition a case to a new status with guard.
 *
 * @param caseId       - Case ID
 * @param expectedFrom - The status you expect the case to be in right now.
 *                        Pass `null` to skip the from-check (used only at creation: new → enriching).
 * @param to           - Target status
 * @param extra        - Additional fields to update alongside the status
 * @throws InvalidStateTransitionError if transition is not in CASE_TRANSITIONS
 */
export async function transitionCase(
  caseId: string,
  expectedFrom: CaseStatus | null,
  to: CaseStatus,
  extra: Omit<CaseUpdate, "status"> = {},
): Promise<void> {
  // If expectedFrom is null we're creating — just write
  if (expectedFrom === null) {
    await updateCase(caseId, { ...extra, status: to })
    return
  }

  // Read current state
  const caseRow = await findCaseById(caseId)
  if (!caseRow) {
    throw new Error(`transitionCase: case not found: ${caseId}`)
  }

  const actual = caseRow.status

  // Verify caller's assumption matches reality
  if (actual !== expectedFrom) {
    logger.warn(
      { caseId, expectedFrom, actual, to },
      "transitionCase: current state does not match expectedFrom — checking if to is still legal from actual",
    )
  }

  // Guard: is the transition legal from the ACTUAL current state?
  if (!isCaseTransitionAllowed(actual, to)) {
    throw new InvalidStateTransitionError("case", caseId, actual, to)
  }

  await updateCase(caseId, { ...extra, status: to })

  logger.debug({ caseId, from: actual, to }, "Case state transitioned")
}
