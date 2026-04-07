/**
 * Tool: lookupGithubContext — retrieve GitHub PR/issue context from memory.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: pr_draft_prep
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupGithubContext = (productId: string) =>
  tool({
    description:
      "Search for related GitHub pull requests, issues, and code context for the product. " +
      "Use to find existing related PRs, conventions, or implementation references.",
    inputSchema: zodSchema(z.object({
      query: z.string().describe("The feature or component to find GitHub context for"),
      limit: z.number().int().min(1).max(5).default(3).describe("Number of results to return"),
    })),
    execute: async ({ query, limit }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        source_uri: string
        freshness_score: number
        source_type: string
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, source_uri, freshness_score, source_type
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type IN ('github_pr', 'github_issue_filtered')
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
        url: r.source_uri,
        freshness: r.freshness_score,
        type: r.source_type,
      }))
    },
  })
