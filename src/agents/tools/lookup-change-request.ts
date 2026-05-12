// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Tool: lookupChangeRequest — retrieve a change request's approved details.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: pr_draft_prep
 *
 * Note: change requests are not stored in memory_chunks — they're domain
 * records. This tool queries the change_requests table directly.
 * In v1, change request table is created in the change domain migration.
 * Falls back to a stub until that migration exists.
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"
import { logger } from "../../shared/logger.js"

export const lookupChangeRequest = (productId: string) =>
  tool({
    description:
      "Retrieve the details of an approved change request: title, description, scope, " +
      "acceptance criteria, and any technical notes. Use to understand what the PR should implement.",
    inputSchema: zodSchema(z.object({
      changeRequestId: z.string().describe("The UUID of the change request to retrieve"),
    })),
    execute: async ({ changeRequestId }) => {
      const db = getDb()

      // Check if change_requests table exists; if not (migration pending), return stub
      try {
        type Row = {
          id: string
          product_id: string
          title: string
          description: string
          status: string
          scope: string | null
          acceptance_criteria: string | null
          technical_notes: string | null
          created_at: Date
        }

        const [row] = (await db`
          SELECT
            id, product_id, title, description, status,
            scope, acceptance_criteria, technical_notes, created_at
          FROM change_requests
          WHERE id = ${changeRequestId}
            AND product_id = ${productId}
        `) as Row[]

        if (!row) {
          return { error: "Change request not found or access denied" }
        }

        if (row.status !== "approved") {
          return {
            error: `Change request is in '${row.status}' state, not 'approved'. PR draft requires approved state.`,
          }
        }

        return {
          id: row.id,
          title: row.title,
          description: row.description,
          status: row.status,
          scope: row.scope,
          acceptanceCriteria: row.acceptance_criteria,
          technicalNotes: row.technical_notes,
          createdAt: row.created_at.toISOString(),
        }
      } catch (err) {
        // change_requests table may not exist yet (change domain migration pending)
        logger.warn({ changeRequestId, productId, err }, "change_requests table not available")
        return { error: "Change request system not yet available in this deployment" }
      }
    },
  })
