/**
 * Tool: lookupKnownIssue — search known issues for a product.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: auto_reply, triage, known_issue_match, outage_routing
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupKnownIssue = (productId: string) =>
  tool({
    description:
      "Search for known issues, bugs, or ongoing incidents that match a described problem. " +
      "Use when a customer reports an issue that might be a known bug or active incident.",
    inputSchema: zodSchema(z.object({
      description: z.string().describe("Description of the issue or symptoms to match against"),
      limit: z.number().int().min(1).max(5).default(3).describe("Number of known issues to return"),
    })),
    execute: async ({ description, limit }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        tier: number
        source_uri: string
        source_type: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, freshness_score, tier, source_uri, source_type
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type IN ('known_issues', 'github_issue_filtered')
          AND fts_vector @@ plainto_tsquery('english', ${description})
        ORDER BY
          tier ASC,
          ts_rank(fts_vector, plainto_tsquery('english', ${description})) DESC,
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
        sourceType: r.source_type,
      }))
    },
  })
