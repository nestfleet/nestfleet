/**
 * ChangeRequestStateMachine — SLICE-14A.
 *
 * Enforces the allowed-transition rules from case-and-change-lifecycle.md §6.1.
 * Every CR status update MUST go through `transitionChangeRequest()`.
 *
 * Throws InvalidStateTransitionError on illegal transitions.
 */

import type { ChangeRequestStatus } from "../infra/db/repositories/change-requests.js"
import type { ChangeRequestUpdate } from "../infra/db/repositories/change-requests.js"
import {
  findChangeRequestById,
  updateChangeRequest,
} from "../infra/db/repositories/change-requests.js"
import { InvalidStateTransitionError } from "./case-state-machine.js"
import { logger } from "../shared/logger.js"

// ── Allowed transitions (§6.1) ──────────────────────────────────────────────

const CR_TRANSITIONS: Record<ChangeRequestStatus, readonly ChangeRequestStatus[]> = {
  "draft":               ["analysis", "rejected"],
  "analysis":            ["approval-pending", "rejected"],
  "approval-pending":    ["approved", "rejected"],
  "approved":            ["implementation-prep", "rejected"],
  "implementation-prep": ["pr-drafted", "rejected"],
  "pr-drafted":          ["completed", "rejected"],
  "completed":           [],
  "rejected":            [],
}

export function isCrTransitionAllowed(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return CR_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Transition a change request to a new status with guard.
 */
export async function transitionChangeRequest(
  crId: string,
  expectedFrom: ChangeRequestStatus | null,
  to: ChangeRequestStatus,
  extra: Omit<ChangeRequestUpdate, "status"> = {},
): Promise<void> {
  if (expectedFrom === null) {
    await updateChangeRequest(crId, { ...extra, status: to })
    return
  }

  const cr = await findChangeRequestById(crId)
  if (!cr) {
    throw new Error(`transitionChangeRequest: CR not found: ${crId}`)
  }

  const actual = cr.status

  if (actual !== expectedFrom) {
    logger.warn(
      { crId, expectedFrom, actual, to },
      "transitionChangeRequest: current state does not match expectedFrom",
    )
  }

  if (!isCrTransitionAllowed(actual, to)) {
    throw new InvalidStateTransitionError("change_request", crId, actual, to)
  }

  await updateChangeRequest(crId, { ...extra, status: to })

  logger.debug({ crId, from: actual, to }, "CR state transitioned")
}
