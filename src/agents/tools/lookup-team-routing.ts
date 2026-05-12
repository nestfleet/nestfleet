// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Tool: lookupTeamRouting — retrieve team routing and escalation policies.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: outage_routing
 *
 * Team routing data is stored in ops_runbook chunks and internal_policy chunks.
 * Section path convention: contains 'routing', 'escalation', 'on-call', or 'team'.
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupTeamRouting = (productId: string) =>
  tool({
    description:
      "Retrieve team routing policies, on-call assignments, and escalation paths for incident response. " +
      "Use to determine which team or person to route an outage notification to.",
    inputSchema: zodSchema(z.object({
      incidentSeverity: z
        .enum(["critical", "high", "medium", "low"])
        .describe("The severity level of the incident, used to find the correct routing policy"),
      component: z
        .string()
        .optional()
        .describe("Optional: the affected component or service to find component-specific routing for"),
    })),
    execute: async ({ incidentSeverity, component }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        source_uri: string
      }

      const searchTerms = component
        ? `routing escalation ${incidentSeverity} ${component}`
        : `routing escalation ${incidentSeverity} on-call`

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, source_uri
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type IN ('ops_runbook', 'internal_policy')
          AND (
            section_path ILIKE '%routing%'
            OR section_path ILIKE '%escalation%'
            OR section_path ILIKE '%on-call%'
            OR section_path ILIKE '%team%'
            OR fts_vector @@ plainto_tsquery('english', ${searchTerms})
          )
        ORDER BY freshness_score DESC
        LIMIT 5
      `) as Row[]

      return results.map((r) => ({
        id: r.chunk_id,
        section: r.section_path,
        content: r.content,
        freshness: r.freshness_score,
        source: r.source_uri,
      }))
    },
  })
