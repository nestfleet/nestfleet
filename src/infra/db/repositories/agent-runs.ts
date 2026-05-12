// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Agent Runs repository — AE-05.
 * Immutable audit trail for every agent invocation.
 *
 * Design notes:
 * - Read-only access from the application (insert is done by the worker layer)
 * - TEXT PK (no typed prefix — worker uses plain UUID or custom id)
 * - No UPDATE path — rows are append-only per ADR-026
 */

import { z } from "zod"
import { getDb } from "../client.js"

// ── Schemas ───────────────────────────────────────────────────────────────────

export const AgentRunOutcomeSchema = z.enum([
  "success",
  "abstain",
  "error",
  "validation_failure",
])
export type AgentRunOutcome = z.infer<typeof AgentRunOutcomeSchema>

export const AgentRunRowSchema = z.object({
  id:                    z.string(),
  job_id:                z.string(),
  product_id:            z.string(),
  case_id:               z.string().nullable(),
  action_type:           z.string(),
  outcome:               AgentRunOutcomeSchema,
  abstain_reason:        z.string().nullable(),
  model_id:              z.string(),
  input_tokens:          z.number().nullable(),
  output_tokens:         z.number().nullable(),
  duration_ms:           z.number().nullable(),
  evidence_chunk_ids:    z.array(z.string()).nullable(),
  output_schema_version: z.string().nullable(),
  output_valid:          z.boolean().nullable(),
  output_snapshot:       z.record(z.unknown()).nullable(),
  error_code:            z.string().nullable(),
  error_message:         z.string().nullable(),
  otel_trace_id:         z.string().nullable(),
  otel_span_id:          z.string().nullable(),
  created_at:            z.date(),
})
export type AgentRunRow = z.infer<typeof AgentRunRowSchema>

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Find all agent runs for a given case, ordered by creation time (ascending).
 * Used by the lineage assembler to attach agent detail to timeline nodes.
 */
export async function findAgentRunsByCaseId(caseId: string): Promise<AgentRunRow[]> {
  const db = getDb()
  const rows = await db<AgentRunRow[]>`
    SELECT * FROM agent_runs
    WHERE case_id = ${caseId}
    ORDER BY created_at ASC
  `
  return rows.map((r) => AgentRunRowSchema.parse(r))
}

/**
 * Find a single agent run by its primary key.
 */
export async function findAgentRunById(runId: string): Promise<AgentRunRow | null> {
  const db = getDb()
  const [row] = await db<AgentRunRow[]>`
    SELECT * FROM agent_runs WHERE id = ${runId}
  `
  return row ? AgentRunRowSchema.parse(row) : null
}
