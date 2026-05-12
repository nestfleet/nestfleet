// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Tool: lookupChangelog — search the product changelog for recent changes.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: change_prep
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupChangelog = (productId: string) =>
  tool({
    description:
      "Search the product changelog for recent changes, releases, and breaking changes. " +
      "Use to understand what has changed recently and avoid conflicting changes.",
    inputSchema: zodSchema(z.object({
      query: z
        .string()
        .describe("The feature, component, or API to search changelog entries for"),
      limit: z.number().int().min(1).max(5).default(3).describe("Number of changelog entries to return"),
    })),
    execute: async ({ query, limit }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        tier: number
        source_uri: string
        product_version: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, tier, source_uri, product_version
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type = 'changelog'
          AND fts_vector @@ plainto_tsquery('english', ${query})
        ORDER BY
          freshness_score DESC,
          ts_rank(fts_vector, plainto_tsquery('english', ${query})) DESC
        LIMIT ${limit}
      `) as Row[]

      return results.map((r) => ({
        id: r.chunk_id,
        section: r.section_path,
        content: r.content,
        freshness: r.freshness_score,
        tier: r.tier,
        source: r.source_uri,
        version: r.product_version,
      }))
    },
  })
