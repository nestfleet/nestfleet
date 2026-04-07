/**
 * Tool: searchSimilarCases — find historically similar cases via embeddings.
 * ADR-024: read-only, enforces product_id isolation by construction.
 * Used by: known_issue_match
 */

import { tool, zodSchema } from "ai"
import { z } from "zod"
import { getDb } from "../../infra/db/client.js"
import { embedText } from "../../memory/ingestion/embedder.js"

export const searchSimilarCases = (productId: string) =>
  tool({
    description:
      "Find historically similar support cases using semantic search. " +
      "Use when you want to check if the current issue matches a pattern from past cases.",
    inputSchema: zodSchema(z.object({
      issueDescription: z
        .string()
        .describe("A concise description of the current issue to find similar historical cases for"),
      limit: z.number().int().min(1).max(5).default(3).describe("Number of similar cases to return"),
    })),
    execute: async ({ issueDescription, limit }) => {
      const db = getDb()

      const { embedding } = await embedText(issueDescription, productId)

      type Row = {
        chunk_id: string
        section_path: string
        content: string
        source_uri: string
        similarity: number
      }

      const results = (await db`
        SELECT
          chunk_id, section_path, content, source_uri,
          1 - (embedding <=> ${JSON.stringify(embedding)}::vector) AS similarity
        FROM memory_chunks
        WHERE product_id = ${productId}
          AND source_type = 'case_history'
          AND (1 - (embedding <=> ${JSON.stringify(embedding)}::vector)) > 0.75
        ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
        LIMIT ${limit}
      `) as Row[]

      return results.map((r) => ({
        id: r.chunk_id,
        section: r.section_path,
        content: r.content,
        source: r.source_uri,
        similarity: r.similarity,
      }))
    },
  })
