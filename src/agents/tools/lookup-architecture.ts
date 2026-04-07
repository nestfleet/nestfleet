/**
 * Tool: lookupArchitecture — search architecture documentation.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: change_prep
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupArchitecture = (productId: string) =>
  tool({
    description:
      "Search the product architecture overview: components, subsystems, data flows, and integration points. " +
      "Use when you need to understand the system architecture to assess the impact of a proposed change.",
    inputSchema: zodSchema(z.object({
      query: z
        .string()
        .describe("The component, subsystem, or architectural concept to look up"),
      limit: z.number().int().min(1).max(8).default(5).describe("Number of sections to return"),
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
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, tier, source_uri
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type = 'architecture_overview'
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
      }))
    },
  })
