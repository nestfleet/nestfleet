/**
 * Tool: lookupSeverityPolicy — retrieve severity classification rules.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: triage
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"

export const lookupSeverityPolicy = (productId: string) =>
  tool({
    description:
      "Retrieve the severity classification policy: what constitutes critical, high, medium, and low severity issues. " +
      "Use when you need to determine the correct severity level for a case.",
    inputSchema: zodSchema(z.object({
      topic: z
        .string()
        .optional()
        .describe(
          "Optional: specific severity level or topic to look up (e.g. 'critical', 'data loss'). " +
          "Leave empty to retrieve all severity policy content.",
        ),
    })),
    execute: async ({ topic }) => {
      const db = getDb()

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        freshness_score: number
        tier: number
        source_uri: string
      }

      const results = topic
        ? (await db`
            SELECT chunk_id, section_path, content, freshness_score, tier, source_uri
            FROM memory_chunks
            WHERE product_id = ${productId}
              AND source_type IN ('ops_runbook', 'internal_policy', 'technical_spec')
              AND content_type IN ('prose', 'procedure')
              AND fts_vector @@ plainto_tsquery('english', ${`severity policy ${topic}`})
            ORDER BY tier ASC, freshness_score DESC
            LIMIT 5
          `) as Row[]
        : (await db`
            SELECT chunk_id, section_path, content, freshness_score, tier, source_uri
            FROM memory_chunks
            WHERE product_id = ${productId}
              AND source_type IN ('ops_runbook', 'internal_policy', 'technical_spec')
              AND section_path ILIKE '%severity%'
            ORDER BY tier ASC, freshness_score DESC
            LIMIT 5
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
