// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Ingestion pipeline orchestrator.
 * Spec: product-memory-specification.md section 4 (ingestion pipeline).
 * ADR-019: chunking strategy; ADR-021: freshness metadata.
 *
 * Pipeline stages (in order):
 *  1. Chunk       — split raw content into typed RawChunks
 *  2. Tier        — assign SourceTier based on SourceType
 *  3. Freshness   — compute freshnessScore from sourceUpdatedAt + tier
 *  4. Embed       — generate embedding vectors (batched)
 *  5. Upsert      — write to memory_chunks (dedup on content_hash)
 *  6. Detect      — post-ingestion conflict detection (async, best-effort)
 */

import crypto from "node:crypto"
import { getDb } from "../../infra/db/client.js"
import { logger } from "../../shared/logger.js"
import { chunkMarkdown, chunkOpenAPI, chunkGitHubItem, type RawChunk } from "./chunker.js"
import { assignTier } from "./tier-assigner.js"
import { computeFreshnessScore } from "./freshness.js"
import { embedBatch } from "./embedder.js"
import { detectConflicts } from "./conflict-detector.js"
import type { SourceType, Audience, Chunk } from "../types.js"

// ── Public API ──────────────────────────────────────────────────────────────

export interface IngestMarkdownOptions {
  productId: string
  sourceType: SourceType
  sourceUri: string
  content: string
  sourceUpdatedAt: Date
  productVersion?: string
  audience?: Audience
  language?: string
  runConflictDetection?: boolean
}

export interface IngestOpenAPIOptions {
  productId: string
  sourceUri: string
  spec: Record<string, unknown>
  sourceUpdatedAt: Date
  productVersion?: string
  audience?: Audience
  runConflictDetection?: boolean
}

export interface IngestGitHubItemOptions {
  productId: string
  sourceType: Extract<SourceType, "github_issue_filtered" | "github_pr_merged" | "github_issue_raw">
  title: string
  body: string
  url: string
  labels?: string[]
  resolutionNote?: string
  sourceUpdatedAt: Date
  productVersion?: string
}

export interface IngestionResult {
  chunksIngested: number
  chunksSkipped: number  // skipped due to dedup (same content_hash already exists)
  totalTokens: number
}

/**
 * Ingest a markdown document (product spec, README, FAQ, etc.).
 */
export async function ingestMarkdown(opts: IngestMarkdownOptions): Promise<IngestionResult> {
  logger.info({ productId: opts.productId, sourceUri: opts.sourceUri, sourceType: opts.sourceType }, "Ingesting markdown")

  const rawChunks = chunkMarkdown(opts.content)
  return runPipeline(rawChunks, opts)
}

/**
 * Ingest an OpenAPI specification document.
 */
export async function ingestOpenAPI(opts: IngestOpenAPIOptions): Promise<IngestionResult> {
  logger.info({ productId: opts.productId, sourceUri: opts.sourceUri }, "Ingesting OpenAPI spec")

  const rawChunks = chunkOpenAPI(opts.spec, opts.sourceUri)
  return runPipeline(rawChunks, {
    ...opts,
    sourceType: "openapi_spec",
  })
}

/**
 * Ingest a GitHub issue or PR.
 */
export async function ingestGitHubItem(opts: IngestGitHubItemOptions): Promise<IngestionResult> {
  logger.info({ productId: opts.productId, url: opts.url, sourceType: opts.sourceType }, "Ingesting GitHub item")

  const githubOpts: Parameters<typeof chunkGitHubItem>[0] = {
    title: opts.title,
    body: opts.body,
    url: opts.url,
  }
  if (opts.labels) githubOpts.labels = opts.labels
  if (opts.resolutionNote) githubOpts.resolutionNote = opts.resolutionNote
  const rawChunk = chunkGitHubItem(githubOpts)

  const pipelineOpts: Parameters<typeof runPipeline>[1] = {
    productId: opts.productId,
    sourceType: opts.sourceType,
    sourceUri: opts.url,
    sourceUpdatedAt: opts.sourceUpdatedAt,
    audience: "internal",
    runConflictDetection: false,
  }
  if (opts.productVersion) pipelineOpts.productVersion = opts.productVersion
  return runPipeline([rawChunk], pipelineOpts)
}

// ── Internal pipeline ─────────────────────────────────────────────────────────

async function runPipeline(
  rawChunks: RawChunk[],
  opts: {
    productId: string
    sourceType: SourceType
    sourceUri: string
    sourceUpdatedAt: Date
    productVersion?: string
    audience?: Audience
    language?: string
    runConflictDetection?: boolean
  },
): Promise<IngestionResult> {
  if (rawChunks.length === 0) {
    return { chunksIngested: 0, chunksSkipped: 0, totalTokens: 0 }
  }

  const db = getDb()
  const tier = assignTier(opts.sourceType)
  const freshnessScore = computeFreshnessScore(tier, opts.sourceUpdatedAt)
  const audience: Audience = opts.audience ?? "public"
  const productVersion = opts.productVersion ?? "*"
  const language = opts.language ?? "en"

  // Stage 4: batch embed all chunks
  const texts = rawChunks.map((c) => c.content)
  const embedResults = await embedBatch(texts, opts.productId)

  let chunksIngested = 0
  let chunksSkipped = 0
  let totalTokens = 0

  // Stage 5: upsert each chunk
  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i]!
    const embedResult = embedResults[i]!
    totalTokens += embedResult.tokenCount

    const chunkId = generateChunkId(opts.productId, opts.sourceUri, raw.sectionPath, raw.contentHash)

    try {
      const result = await db`
        INSERT INTO memory_chunks (
          chunk_id,
          product_id,
          source_type,
          tier,
          source_uri,
          section_path,
          content_type,
          content,
          product_version,
          source_updated_at,
          ingested_at,
          freshness_score,
          audience,
          language,
          conflict_flag,
          embedding,
          content_hash
        ) VALUES (
          ${chunkId},
          ${opts.productId},
          ${opts.sourceType},
          ${tier},
          ${opts.sourceUri},
          ${raw.sectionPath},
          ${raw.contentType},
          ${raw.content},
          ${productVersion},
          ${opts.sourceUpdatedAt},
          NOW(),
          ${freshnessScore},
          ${audience},
          ${raw.language ?? language},
          false,
          ${JSON.stringify(embedResult.embedding)},
          ${raw.contentHash}
        )
        ON CONFLICT (product_id, source_uri, section_path, content_hash)
        DO UPDATE SET
          freshness_score  = EXCLUDED.freshness_score,
          source_updated_at = EXCLUDED.source_updated_at,
          ingested_at      = EXCLUDED.ingested_at,
          embedding        = EXCLUDED.embedding,
          tier             = EXCLUDED.tier
        RETURNING (xmax = 0) AS inserted
      `

      // xmax = 0 means row was inserted (not updated)
      const wasInserted = (result[0] as { inserted: boolean } | undefined)?.inserted ?? true
      if (wasInserted) {
        chunksIngested++
      } else {
        chunksSkipped++
      }
    } catch (err) {
      logger.error({ err, chunkId, sourceUri: opts.sourceUri }, "Failed to upsert chunk")
    }
  }

  logger.info(
    { productId: opts.productId, sourceUri: opts.sourceUri, chunksIngested, chunksSkipped, totalTokens },
    "Ingestion complete",
  )

  // Stage 6: conflict detection (best-effort, async)
  if (opts.runConflictDetection !== false && chunksIngested > 0) {
    detectConflicts(opts.productId).catch((err) => {
      logger.error({ err, productId: opts.productId }, "Conflict detection failed (non-fatal)")
    })
  }

  return { chunksIngested, chunksSkipped, totalTokens }
}

function generateChunkId(
  productId: string,
  sourceUri: string,
  sectionPath: string,
  contentHash: string,
): string {
  const key = `${productId}:${sourceUri}:${sectionPath}:${contentHash}`
  return `mc_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`
}

// ── Batch filesystem ingestion ────────────────────────────────────────────────

import { discoverFiles, inferSourceType, inferAudience } from "../sources/filesystem.js"
import type { FilesystemSourceOptions } from "../sources/filesystem.js"
// js-yaml 5 is ESM named-only (no default export); namespace import keeps
// the yaml.load(...) call site unchanged and links under native Node ESM.
import * as yaml from "js-yaml"

export interface BatchFilesystemIngestionOptions extends FilesystemSourceOptions {
  productId: string
  productVersion?: string
  defaultLanguage?: string
  runConflictDetection?: boolean
}

export interface BatchIngestionResult {
  filesProcessed: number
  filesErrored: number
  totalChunksIngested: number
  totalChunksSkipped: number
  totalTokens: number
}

/**
 * Ingest all documents from a filesystem directory.
 * Discovers, classifies, and ingests each file via the pipeline.
 */
export async function ingestFromFilesystem(opts: BatchFilesystemIngestionOptions): Promise<BatchIngestionResult> {
  logger.info({ productId: opts.productId, rootDir: opts.rootDir }, "Starting filesystem ingestion")

  const files = await discoverFiles(opts)
  logger.info({ productId: opts.productId, fileCount: files.length }, "Files discovered")

  let filesProcessed = 0
  let filesErrored = 0
  let totalChunksIngested = 0
  let totalChunksSkipped = 0
  let totalTokens = 0

  for (const file of files) {
    try {
      const sourceType = inferSourceType(file.relativePath, file.format)
      const audience = inferAudience(file.relativePath)

      let result: IngestionResult

      if (file.format === "markdown") {
        const mdOpts: IngestMarkdownOptions = {
          productId: opts.productId,
          sourceType,
          sourceUri: `file://${file.absolutePath}`,
          content: file.content,
          sourceUpdatedAt: file.mtime,
          audience,
          runConflictDetection: false,
        }
        if (opts.productVersion) mdOpts.productVersion = opts.productVersion
        if (opts.defaultLanguage) mdOpts.language = opts.defaultLanguage
        result = await ingestMarkdown(mdOpts)
      } else {
        // OpenAPI
        let spec: Record<string, unknown>
        try {
          spec = (yaml.load(file.content) ?? {}) as Record<string, unknown>
        } catch {
          spec = JSON.parse(file.content) as Record<string, unknown>
        }

        const openApiOpts: IngestOpenAPIOptions = {
          productId: opts.productId,
          sourceUri: `file://${file.absolutePath}`,
          spec,
          sourceUpdatedAt: file.mtime,
          audience,
          runConflictDetection: false,
        }
        if (opts.productVersion) openApiOpts.productVersion = opts.productVersion
        result = await ingestOpenAPI(openApiOpts)
      }

      totalChunksIngested += result.chunksIngested
      totalChunksSkipped += result.chunksSkipped
      totalTokens += result.totalTokens
      filesProcessed++
    } catch (err) {
      logger.error({ err, file: file.relativePath }, "Failed to ingest file")
      filesErrored++
    }
  }

  // Run conflict detection once for the whole batch
  if (opts.runConflictDetection !== false && totalChunksIngested > 0) {
    detectConflicts(opts.productId).catch((err) => {
      logger.error({ err, productId: opts.productId }, "Post-batch conflict detection failed")
    })
  }

  logger.info(
    {
      productId: opts.productId,
      filesProcessed,
      filesErrored,
      totalChunksIngested,
      totalChunksSkipped,
      totalTokens,
    },
    "Filesystem ingestion batch complete",
  )

  return { filesProcessed, filesErrored, totalChunksIngested, totalChunksSkipped, totalTokens }
}
