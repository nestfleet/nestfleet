/**
 * Tool: lookupFaq — search FAQ content for a product.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: auto_reply
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupFaq = (productId: string) =>
  tool({
    description:
      "Search the product FAQ for answers to common customer questions. " +
      "Use when you need factual, pre-approved answers about product features, pricing, or policies.",
    inputSchema: zodSchema(z.object({
      query: z.string().describe("The customer question or topic to search for"),
      limit: z.number().int().min(1).max(10).default(5).describe("Number of FAQ entries to return"),
    })),
    execute: async ({ query, limit }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        source_uri: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, source_uri
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND content_type = 'faq'
          AND audience = 'public'
          AND fts_vector @@ plainto_tsquery('english', ${query})
        ORDER BY
          ts_rank(fts_vector, plainto_tsquery('english', ${query})) DESC,
          freshness_score DESC
        LIMIT ${limit}
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
