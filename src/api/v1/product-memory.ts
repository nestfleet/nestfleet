/**
 * Product Memory API — SLICE-03 / WAVE-5.
 *
 * Management routes for product memory: sources, search, health, ingestion trigger.
 *
 *   GET    /products/:productId/memory/sources            — list memory sources
 *   GET    /products/:productId/memory/stats              — chunk statistics
 *   POST   /products/:productId/memory/search             — search product memory (debug/test)
 *   GET    /products/:productId/memory/health             — documentation health report
 *   POST   /products/:productId/memory/ingest             — ingest a markdown document (WAVE-5)
 *   DELETE /products/:productId/memory/sources/:sourceUri — remove chunks from a source
 */

import { Hono } from "hono"
import { z } from "zod"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import { getDb } from "../../infra/db/client.js"
import { retrieve } from "../../memory/retrieval/retrieval-service.js"
import { computeHealthReport } from "../../memory/health/health-report.js"
import { ingestMarkdown } from "../../memory/ingestion/pipeline.js"
import { assignTier } from "../../memory/ingestion/tier-assigner.js"
import { logger } from "../../shared/logger.js"
import type { ActionType, SourceType, Audience } from "../../memory/types.js"

export const productMemoryRouter = new Hono()

// ── GET /products/:productId/memory/sources ────────────────────────────────
// Returns distinct source URIs with chunk counts, tier, and freshness info.

productMemoryRouter.get("/products/:productId/memory/sources", requireAuth(), requireRole("operator", "knowledge_lead"), async (c) => {
  const productId = c.req.param("productId")

  try {
    const db = getDb()
    const rows = await db`
      SELECT
        source_type,
        source_uri,
        tier,
        count(*)::int            AS chunk_count,
        min(freshness_score)     AS min_freshness,
        avg(freshness_score)     AS avg_freshness,
        max(ingested_at)         AS last_ingested_at,
        bool_or(conflict_flag)   AS has_conflicts
      FROM memory_chunks
      WHERE product_id = ${productId}
      GROUP BY source_type, source_uri, tier
      ORDER BY source_type, source_uri
    `

    return c.json({
      ok: true,
      data: {
        sources: rows.map((r: Record<string, unknown>) => ({
          sourceType:     r.source_type,
          sourceUri:      r.source_uri,
          tier:           r.tier,
          chunkCount:     r.chunk_count,
          minFreshness:   Number(r.min_freshness).toFixed(2),
          avgFreshness:   Number(r.avg_freshness).toFixed(2),
          lastIngestedAt: r.last_ingested_at,
          hasConflicts:   r.has_conflicts,
        })),
        totalSources: rows.length,
      },
    })
  } catch (err) {
    logger.error({ err, productId }, "Failed to list memory sources")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /products/:productId/memory/stats ──────────────────────────────────
// Returns aggregate statistics about the product memory.

productMemoryRouter.get("/products/:productId/memory/stats", requireAuth(), requireRole("operator", "knowledge_lead"), async (c) => {
  const productId = c.req.param("productId")

  try {
    const db = getDb()
    const [stats] = await db`
      SELECT
        count(*)::int                                              AS total_chunks,
        count(DISTINCT source_uri)::int                            AS total_sources,
        count(*) FILTER (WHERE embedding IS NOT NULL)::int         AS embedded_chunks,
        count(*) FILTER (WHERE conflict_flag = true)::int          AS conflict_chunks,
        count(*) FILTER (WHERE tier = 1)::int                      AS t1_chunks,
        count(*) FILTER (WHERE tier = 2)::int                      AS t2_chunks,
        count(*) FILTER (WHERE tier = 3)::int                      AS t3_chunks,
        count(*) FILTER (WHERE tier = 4)::int                      AS t4_chunks,
        avg(freshness_score)                                       AS avg_freshness,
        min(ingested_at)                                           AS earliest_ingestion,
        max(ingested_at)                                           AS latest_ingestion
      FROM memory_chunks
      WHERE product_id = ${productId}
    `

    return c.json({ ok: true, data: stats })
  } catch (err) {
    logger.error({ err, productId }, "Failed to get memory stats")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /products/:productId/memory/search ────────────────────────────────
// Debug/test endpoint for searching product memory with a natural language query.

const SearchBodySchema = z.object({
  query:      z.string().min(3),
  actionType: z.enum(["auto_reply", "triage", "known_issue_match", "change_prep", "pr_draft_prep", "outage_routing"]).optional(),
  topN:       z.number().int().min(1).max(20).optional().default(5),
})

productMemoryRouter.post("/products/:productId/memory/search", requireAuth(), requireRole("operator", "knowledge_lead"), async (c) => {
  const productId = c.req.param("productId")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = SearchBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  try {
    // Generate embedding for the query using the product's LLM config
    const { embedText } = await import("../../memory/ingestion/embedder.js")
    const embedResult = await embedText(parsed.data.query, productId)
    const queryEmbedding = embedResult.embedding

    const pack = await retrieve({
      productId,
      queryText:      parsed.data.query,
      queryEmbedding,
      audience:       "public",
      topN:           parsed.data.topN,
      ...(parsed.data.actionType ? { actionType: parsed.data.actionType as ActionType } : {}),
    })

    return c.json({
      ok: true,
      data: {
        chunks:        pack.chunks.map((ch) => ({
          chunkId:        ch.chunkId,
          sourceType:     ch.sourceType,
          sourceUri:      ch.sourceUri,
          sectionPath:    ch.sectionPath,
          content:        ch.content.substring(0, 500),  // truncate for readability
          tier:           ch.tier,
          freshnessScore: ch.freshnessScore,
          score:          Number(ch.score.toFixed(4)),
        })),
        abstain:       pack.abstain,
        abstainReason: pack.abstainReason,
        tierSummary:   pack.tierSummary,
        avgFreshness:  pack.avgFreshness,
        hasConflicts:  pack.hasConflicts,
      },
    })
  } catch (err) {
    logger.error({ err, productId }, "Memory search failed")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /products/:productId/memory/health ─────────────────────────────────
// Returns the documentation health report for the product.

productMemoryRouter.get("/products/:productId/memory/health", requireAuth(), requireRole("operator", "knowledge_lead"), async (c) => {
  const productId = c.req.param("productId")

  try {
    const report = await computeHealthReport(productId)
    return c.json({ ok: true, data: report })
  } catch (err) {
    logger.error({ err, productId }, "Health report computation failed")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /products/:productId/memory/ingest ────────────────────────────────
// Ingest a markdown document into product memory. Accepts all markdown-capable
// source types. Returns chunk counts and token usage for the ingestion run.

const SOURCE_TYPES = [
  "product_spec", "feature_spec", "faq", "known_issues", "api_docs",
  "openapi_spec", "architecture_overview", "technical_spec", "deployment_guide",
  "troubleshooting_guide", "runbook", "changelog", "readme",
  "github_issue_filtered", "github_pr_merged", "github_issue_raw", "commit_message",
] as const

const IngestBodySchema = z.object({
  sourceType:          z.enum(SOURCE_TYPES),
  sourceUri:           z.string().min(1).max(2048),
  content:             z.string().min(1).max(500_000),
  sourceUpdatedAt:     z.string().datetime(),
  productVersion:      z.string().max(64).optional(),
  audience:            z.enum(["public", "internal", "developer"]).optional(),
  language:            z.string().max(10).optional(),
  runConflictDetection: z.boolean().optional(),
})

productMemoryRouter.post("/products/:productId/memory/ingest", requireAuth(), requireRole("admin", "knowledge_lead"), async (c) => {
  const productId = c.req.param("productId")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = IngestBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  const {
    sourceType, sourceUri, content,
    sourceUpdatedAt, productVersion, audience, language,
    runConflictDetection,
  } = parsed.data

  try {
    const result = await ingestMarkdown({
      productId,
      sourceType: sourceType as SourceType,
      sourceUri,
      content,
      sourceUpdatedAt: new Date(sourceUpdatedAt),
      ...(productVersion  ? { productVersion }  : {}),
      ...(audience        ? { audience: audience as Audience } : {}),
      ...(language        ? { language }         : {}),
      ...(runConflictDetection !== undefined ? { runConflictDetection } : {}),
    })

    const tier = assignTier(sourceType as SourceType)

    logger.info({ productId, sourceUri, sourceType, tier, ...result }, "Memory ingest via API")

    return c.json({
      ok: true,
      data: {
        chunksIngested: result.chunksIngested,
        chunksSkipped:  result.chunksSkipped,
        totalTokens:    result.totalTokens,
        sourceUri,
        tier,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Embedding config errors are operator-fixable — return 422 with the reason
    const isConfigError =
      message.includes("API key is required") ||
      message.includes("Embedding API key") ||
      message.includes("embedding provider") ||
      message.includes("llm_config") ||
      message.includes("not configured")

    if (isConfigError) {
      logger.warn({ productId, sourceUri, message }, "Memory ingest failed — embedding not configured")
      return c.json({
        error: "Embedding not configured. Go to Settings → LLM and save a valid embedding model and API key before ingesting documents.",
      }, 422)
    }

    // Propagate the actual error message for other known failure modes
    const isKnownError =
      message.includes("embedding API error") ||
      message.includes("Ollama") ||
      message.includes("OpenAI")

    if (isKnownError) {
      logger.error({ err, productId, sourceUri }, "Memory ingest failed — embedding API error")
      return c.json({ error: `Embedding error: ${message}` }, 502)
    }

    logger.error({ err, productId, sourceUri }, "Memory ingest failed")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── DELETE /products/:productId/memory/sources/:sourceUri ───────────────────
// Remove all chunks from a specific source URI.

productMemoryRouter.delete("/products/:productId/memory/sources/*", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")
  // Hono wildcard: extract everything after /sources/
  const sourceUri = c.req.url.split("/memory/sources/")[1]
  if (!sourceUri) {
    return c.json({ error: "Source URI required" }, 400)
  }

  try {
    const db = getDb()
    const deleted = await db`
      DELETE FROM memory_chunks
      WHERE product_id = ${productId}
        AND source_uri = ${decodeURIComponent(sourceUri)}
      RETURNING chunk_id
    `

    logger.info({ productId, sourceUri, deletedCount: deleted.length }, "Memory source chunks deleted")
    return c.json({ ok: true, data: { deletedChunks: deleted.length } })
  } catch (err) {
    logger.error({ err, productId, sourceUri }, "Failed to delete memory source")
    return c.json({ error: "Internal server error" }, 500)
  }
})
