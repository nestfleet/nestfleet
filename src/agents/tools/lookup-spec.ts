// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Tool: lookupSpec — search technical specifications.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: change_prep, pr_draft_prep
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupSpec = (productId: string) =>
  tool({
    description:
      "Search the product technical specification for architecture details, API contracts, and design constraints. " +
      "Use when you need to understand the spec requirements before drafting a change or PR.",
    inputSchema: zodSchema(z.object({
      query: z
        .string()
        .describe("The technical topic or component to look up in the specification"),
      limit: z.number().int().min(1).max(8).default(5).describe("Number of spec sections to return"),
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
        content_type: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, tier, source_uri, content_type
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type = 'technical_spec'
          AND fts_vector @@ plainto_tsquery('english', ${query})
        ORDER BY
          tier ASC,
          ts_rank(fts_vector, plainto_tsquery('english', ${query})) DESC,
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
        contentType: r.content_type,
      }))
    },
  })
