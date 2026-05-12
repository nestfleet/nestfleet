// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Tool: lookupRunbook — search operational runbooks.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: outage_routing
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupRunbook = (productId: string) =>
  tool({
    description:
      "Search operational runbooks for incident response procedures, escalation steps, and recovery actions. " +
      "Use during outage routing to find the correct incident response procedure.",
    inputSchema: zodSchema(z.object({
      incidentType: z
        .string()
        .describe("The type of incident or outage to find a runbook for (e.g. 'database down', 'payment failure')"),
      limit: z.number().int().min(1).max(5).default(3).describe("Number of runbook sections to return"),
    })),
    execute: async ({ incidentType, limit }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        tier: number
        source_uri: string
        audience: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, tier, source_uri, audience
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type = 'ops_runbook'
          AND fts_vector @@ plainto_tsquery('english', ${incidentType})
        ORDER BY
          tier ASC,
          ts_rank(fts_vector, plainto_tsquery('english', ${incidentType})) DESC,
          freshness_score DESC
        LIMIT ${limit}
      `) as Row[]

      return results.map((r) => ({
        id: r.chunk_id,
        section: r.section_path,
        content: r.content,
        freshness: r.freshness_score,
        tier: r.tier,
        source: r.source_uri,
        audience: r.audience,
      }))
    },
  })
