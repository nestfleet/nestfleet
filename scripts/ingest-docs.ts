/**
 * SPIKE-01 ingestion script: ingest the DocuGardener documentation corpus.
 *
 * Usage:
 *   npx tsx scripts/ingest-docs.ts [options]
 *
 * Options:
 *   --product-id      Product ID to ingest under             (default: "docugardener")
 *   --docs-dir        Path to the docs directory to scan     (required)
 *   --product-version Product version string                 (default: "1.0")
 *
 * After the main ingestion, also ingests a "stale" product variant
 * (product-id: docugardener-stale) with T1 docs backdated 200 days to
 * trigger `stale_evidence` abstain for eval cases B-01 and B-02.
 *
 * DATABASE_URL defaults to postgresql://nestfleet:nestfleet@localhost:5434/nestfleet
 */

// ── 1. OTel init — MUST be first ────────────────────────────────────────────
import "../src/shared/telemetry.js"
import { initTelemetry, shutdownTelemetry } from "../src/shared/telemetry.js"
initTelemetry()

// ── 2. Imports ───────────────────────────────────────────────────────────────
import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "../src/shared/logger.js"
import {
  ingestFromFilesystem,
  ingestMarkdown,
  type BatchFilesystemIngestionOptions,
} from "../src/memory/ingestion/pipeline.js"
import { computeHealthReport } from "../src/memory/health/health-report.js"
import { discoverFiles, inferSourceType, inferAudience } from "../src/memory/sources/filesystem.js"
import { assignTier } from "../src/memory/ingestion/tier-assigner.js"
import type { DocumentationHealthReport } from "../src/memory/types.js"

// ── 3. Constants ─────────────────────────────────────────────────────────────

const DEFAULT_PRODUCT_ID = "docugardener"
const DEFAULT_PRODUCT_VERSION = "1.0"
const STALE_PRODUCT_ID_SUFFIX = "-stale"
const STALE_MS = 200 * 24 * 60 * 60 * 1000

// ── 4. CLI argument parsing ──────────────────────────────────────────────────

function parseArgs(): { productId: string; docsDir: string | undefined; productVersion: string } {
  const args = process.argv.slice(2)
  let productId = DEFAULT_PRODUCT_ID
  let docsDir: string | undefined = undefined
  let productVersion = DEFAULT_PRODUCT_VERSION

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--product-id" && args[i + 1]) {
      productId = args[++i]!
    } else if (arg === "--docs-dir" && args[i + 1]) {
      docsDir = args[++i]!
    } else if (arg === "--product-version" && args[i + 1]) {
      productVersion = args[++i]!
    } else if (arg?.startsWith("--product-id=")) {
      productId = arg.slice("--product-id=".length)
    } else if (arg?.startsWith("--docs-dir=")) {
      docsDir = arg.slice("--docs-dir=".length)
    } else if (arg?.startsWith("--product-version=")) {
      productVersion = arg.slice("--product-version=".length)
    }
  }

  return { productId, docsDir, productVersion }
}

// ── 5. Health report summary printer ────────────────────────────────────────

function printHealthSummary(report: DocumentationHealthReport): void {
  const { reportId, productId, computedAt, dimensions, capabilities, metrics, recommendedActions } = report

  console.log("")
  console.log("═══════════════════════════════════════════════════════════")
  console.log(` Documentation Health Report`)
  console.log(`   Product:    ${productId}`)
  console.log(`   Report ID:  ${reportId}`)
  console.log(`   Computed:   ${computedAt.toISOString()}`)
  console.log("───────────────────────────────────────────────────────────")
  console.log(" Dimensions:")
  console.log(`   t1Coverage:    ${dimensions.t1Coverage.padEnd(6)}  (chunks: ${metrics.t1ChunkCount}, coverage: ${Math.round(metrics.t1CoveragePercent * 100)}%)`)
  console.log(`   faqCoverage:   ${dimensions.faqCoverage.padEnd(6)}  (entries: ${metrics.faqEntryCount})`)
  console.log(`   knownIssues:   ${dimensions.knownIssues.padEnd(6)}  (entries: ${metrics.knownIssueCount})`)
  console.log(`   architecture:  ${dimensions.architecture.padEnd(6)}  (present: ${metrics.architecturePresent}, fresh: ${metrics.architectureFresh})`)
  console.log(`   technicalSpec: ${dimensions.technicalSpec.padEnd(6)}  (present: ${metrics.technicalSpecPresent}, fresh: ${metrics.technicalSpecFresh})`)
  console.log(`   freshness:     ${dimensions.freshness.padEnd(6)}  (fresh T1: ${Math.round(metrics.freshT1Percent * 100)}%)`)
  console.log(`   conflicts:     ${dimensions.conflicts.padEnd(6)}  (open: ${metrics.openConflictCount})`)
  console.log(`   language:      ${dimensions.language.padEnd(6)}  (primary: ${metrics.primaryLanguage})`)
  console.log("───────────────────────────────────────────────────────────")
  console.log(" Capability Gates:")
  console.log(`   autoReply:        ${capabilities.autoReply}`)
  console.log(`   knownIssueMatch:  ${capabilities.knownIssueMatch}`)
  console.log(`   changePrep:       ${capabilities.changePrep}`)
  console.log(`   prDraft:          ${capabilities.prDraft}`)
  console.log(`   outageRouting:    ${capabilities.outageRouting}`)
  console.log(`   totalChunks:      ${metrics.totalChunks}`)

  if (recommendedActions.length > 0) {
    console.log("───────────────────────────────────────────────────────────")
    console.log(" Recommended Actions:")
    for (const action of recommendedActions) {
      console.log(`   • ${action}`)
    }
  }

  console.log("═══════════════════════════════════════════════════════════")
  console.log("")
}

// ── 6. Stale product ingestion ───────────────────────────────────────────────

/**
 * Ingest the same docs directory as the "stale" product variant.
 * T1 markdown files have their sourceUpdatedAt backdated 200 days to trigger
 * stale_evidence abstain logic in eval cases B-01 and B-02.
 */
async function ingestStaleVariant(
  docsDir: string,
  baseProductId: string,
  productVersion: string,
): Promise<void> {
  const staleProductId = `${baseProductId}${STALE_PRODUCT_ID_SUFFIX}`
  const staleDate = new Date(Date.now() - STALE_MS)

  logger.info(
    { staleProductId, staleDate: staleDate.toISOString() },
    "Starting stale variant ingestion",
  )

  const files = await discoverFiles({ rootDir: docsDir })
  logger.info({ fileCount: files.length }, "Files discovered for stale variant")

  let filesProcessed = 0
  let filesErrored = 0

  for (const file of files) {
    try {
      const sourceType = inferSourceType(file.relativePath, file.format)
      const audience = inferAudience(file.relativePath)
      const tier = assignTier(sourceType)

      // Use stale date for T1 markdown docs; use real mtime for everything else
      const isT1Markdown = file.format === "markdown" && tier === 1
      const sourceUpdatedAt = isT1Markdown ? staleDate : file.mtime

      if (file.format === "markdown") {
        await ingestMarkdown({
          productId: staleProductId,
          sourceType,
          sourceUri: `file://${file.absolutePath}`,
          content: file.content,
          sourceUpdatedAt,
          productVersion,
          audience,
          runConflictDetection: false,
        })
        filesProcessed++
      } else {
        // Non-markdown (OpenAPI) — delegate to a mini filesystem ingest for this file
        // We re-use ingestFromFilesystem scoped to the single file's parent for simplicity,
        // but that would re-discover other files. Instead, parse and call ingestOpenAPI directly.
        const { ingestOpenAPI } = await import("../src/memory/ingestion/pipeline.js")
        const yaml = (await import("js-yaml")).default
        let spec: Record<string, unknown>
        try {
          spec = (yaml.load(file.content) ?? {}) as Record<string, unknown>
        } catch {
          spec = JSON.parse(file.content) as Record<string, unknown>
        }
        await ingestOpenAPI({
          productId: staleProductId,
          sourceUri: `file://${file.absolutePath}`,
          spec,
          sourceUpdatedAt: file.mtime,
          audience,
          productVersion,
          runConflictDetection: false,
        })
        filesProcessed++
      }
    } catch (err) {
      logger.error({ err, file: file.relativePath }, "Failed to ingest file for stale variant")
      filesErrored++
    }
  }

  logger.info(
    { staleProductId, filesProcessed, filesErrored },
    "Stale variant ingestion complete",
  )
}

// ── 7. Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Apply DATABASE_URL default before any DB client initialises
  if (!process.env["DATABASE_URL"]) {
    process.env["DATABASE_URL"] = "postgresql://nestfleet:nestfleet@localhost:5434/nestfleet"
  }

  const { productId, docsDir, productVersion } = parseArgs()

  if (!docsDir) {
    console.error("Usage: tsx scripts/ingest-docs.ts --docs-dir <path>")
    process.exit(1)
  }

  logger.info(
    { productId, docsDir, productVersion },
    "ingest-docs starting",
  )

  // ── Main ingestion ─────────────────────────────────────────────────────────
  const fsOpts: BatchFilesystemIngestionOptions = {
    productId,
    rootDir: docsDir,
    productVersion,
    runConflictDetection: false,
  }

  let batchResult
  try {
    batchResult = await ingestFromFilesystem(fsOpts)
  } catch (err) {
    logger.error({ err }, "Filesystem ingestion failed")
    process.exitCode = 1
    return
  }

  logger.info(
    {
      productId,
      filesProcessed: batchResult.filesProcessed,
      filesErrored: batchResult.filesErrored,
      totalChunksIngested: batchResult.totalChunksIngested,
      totalChunksSkipped: batchResult.totalChunksSkipped,
      totalTokens: batchResult.totalTokens,
    },
    "Main ingestion finished",
  )

  // ── Health report ──────────────────────────────────────────────────────────
  let report: DocumentationHealthReport
  try {
    report = await computeHealthReport(productId)
  } catch (err) {
    logger.error({ err, productId }, "Health report computation failed")
    process.exitCode = 1
    return
  }

  printHealthSummary(report)

  // ── Stale variant ingestion ────────────────────────────────────────────────
  try {
    await ingestStaleVariant(docsDir, productId, productVersion)
  } catch (err) {
    logger.error({ err }, "Stale variant ingestion failed")
    process.exitCode = 1
    return
  }

  // ── Health report for stale variant ───────────────────────────────────────
  const staleProductId = `${productId}${STALE_PRODUCT_ID_SUFFIX}`
  let staleReport: DocumentationHealthReport
  try {
    staleReport = await computeHealthReport(staleProductId)
  } catch (err) {
    logger.error({ err, staleProductId }, "Stale variant health report computation failed")
    process.exitCode = 1
    return
  }

  printHealthSummary(staleReport)

  logger.info("ingest-docs completed successfully")
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, "Unhandled error in ingest-docs")
    process.exitCode = 1
  })
  .finally(() => {
    shutdownTelemetry().catch(() => {/* ignore shutdown errors */})
  })
