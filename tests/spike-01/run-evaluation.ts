/**
 * SPIKE-01 evaluation runner.
 * Executes the evaluation dataset against the live retrieval service and
 * produces a structured pass/fail report.
 *
 * Usage:
 *   npx tsx tests/spike-01/run-evaluation.ts [--product-id <id>] [--stale-product-id <id>]
 *
 * The runner assumes:
 *  - NestFleet DB is running and migrated
 *  - A "good" product has been ingested (Acme corpus recommended)
 *  - A "stale" product has T1 docs ingested with sourceUpdatedAt = 200 days ago
 *  - DATABASE_URL env var points to the running DB
 */

import "../../src/shared/telemetry.js"
import { parseArgs } from "node:util"
import { EVAL_DATASET, type EvalCase } from "./evaluation-dataset.js"
import { retrieve } from "../../src/memory/retrieval/retrieval-service.js"
import { embedText } from "../../src/memory/ingestion/embedder.js"
import { computeHealthReport } from "../../src/memory/health/health-report.js"
import type { EvidencePack, ActionType, Audience } from "../../src/memory/types.js"

// ── CLI args ─────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "product-id":       { type: "string", default: "acme" },
    "stale-product-id": { type: "string", default: "acme-stale" },
    "empty-product-id": { type: "string", default: "acme-empty" },
    "output":           { type: "string", default: "console" },  // console | json
  },
})

const PRODUCT_ID       = args["product-id"]!
const STALE_PRODUCT_ID = args["stale-product-id"]!
const EMPTY_PRODUCT_ID = args["empty-product-id"]!

// ── Result types ──────────────────────────────────────────────────────────────

interface CaseResult {
  id: string
  category: string
  description: string
  passed: boolean
  actualAbstain: boolean
  actualAbstainReason?: string | null
  actualChunkCount: number
  actualTopTier?: number
  actualMinFreshness?: number
  failReason?: string
  durationMs: number
}

interface EvaluationReport {
  runAt: string
  productId: string
  totalCases: number
  passed: number
  failed: number
  passRate: number
  byCategory: Record<string, { total: number; passed: number }>
  results: CaseResult[]
  healthReport?: {
    autoReply: string
    knownIssueMatch: string
    changePrep: string
    t1ChunkCount: number
    openConflicts: number
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 SPIKE-01 Evaluation Runner`)
  console.log(`   Product:       ${PRODUCT_ID}`)
  console.log(`   Stale Product: ${STALE_PRODUCT_ID}`)
  console.log(`   Empty Product: ${EMPTY_PRODUCT_ID}\n`)

  const results: CaseResult[] = []

  for (const evalCase of EVAL_DATASET) {
    const result = await runCase(evalCase)
    results.push(result)

    const icon = result.passed ? "✅" : "❌"
    const abstainStr = result.actualAbstain
      ? `abstain(${result.actualAbstainReason ?? "?"})`
      : `${result.actualChunkCount} chunks`
    console.log(`${icon} ${evalCase.id.padEnd(5)} ${evalCase.description.padEnd(60)} ${abstainStr}`)

    if (!result.passed) {
      console.log(`   ↳ FAIL: ${result.failReason}`)
    }
  }

  // Compute health report for the main product
  let healthSummary: EvaluationReport["healthReport"]
  try {
    const health = await computeHealthReport(PRODUCT_ID)
    healthSummary = {
      autoReply: health.capabilities.autoReply,
      knownIssueMatch: health.capabilities.knownIssueMatch,
      changePrep: health.capabilities.changePrep,
      t1ChunkCount: health.metrics.t1ChunkCount,
      openConflicts: health.metrics.openConflictCount,
    }
  } catch (err) {
    console.warn(`⚠️  Health report computation failed: ${err}`)
  }

  // Build final report
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  const byCategory: Record<string, { total: number; passed: number }> = {}
  for (const r of results) {
    const cat = EVAL_DATASET.find((e) => e.id === r.id)?.category ?? "unknown"
    if (!byCategory[cat]) byCategory[cat] = { total: 0, passed: 0 }
    byCategory[cat]!.total++
    if (r.passed) byCategory[cat]!.passed++
  }

  const report: EvaluationReport = {
    runAt: new Date().toISOString(),
    productId: PRODUCT_ID,
    totalCases: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    byCategory,
    results,
    healthReport: healthSummary,
  }

  console.log("\n" + "─".repeat(80))
  console.log(`SPIKE-01 Evaluation: ${passed}/${results.length} passed (${Math.round(report.passRate * 100)}%)`)
  console.log("\nBy category:")
  for (const [cat, counts] of Object.entries(byCategory)) {
    const pct = Math.round((counts.passed / counts.total) * 100)
    console.log(`  ${cat.padEnd(20)} ${counts.passed}/${counts.total} (${pct}%)`)
  }

  if (healthSummary) {
    console.log("\nCapability gates (main product):")
    console.log(`  auto_reply:         ${healthSummary.autoReply}`)
    console.log(`  known_issue_match:  ${healthSummary.knownIssueMatch}`)
    console.log(`  change_prep:        ${healthSummary.changePrep}`)
    console.log(`  T1 chunk count:     ${healthSummary.t1ChunkCount}`)
    console.log(`  Open conflicts:     ${healthSummary.openConflicts}`)
  }

  if (args["output"] === "json") {
    console.log("\n" + JSON.stringify(report, null, 2))
  }

  // Exit with failure code if any cases failed
  process.exit(failed > 0 ? 1 : 0)
}

// ── Case runner ───────────────────────────────────────────────────────────────

async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const start = Date.now()

  try {
    // Determine which product to use based on category
    const productId = resolveProductId(evalCase.category)

    // Embed the query
    const { embedding } = await embedText(evalCase.queryText)

    // Execute retrieval
    const pack: EvidencePack = await retrieve({
      productId,
      queryText: evalCase.queryText,
      queryEmbedding: embedding,
      audience: evalCase.audience as Audience,
      actionType: evalCase.actionType as ActionType,
      topK: 20,
      topN: 5,
    })

    const durationMs = Date.now() - start

    // Validate expectations
    const { passed, failReason } = validatePack(pack, evalCase)

    const topTier = pack.chunks.length > 0 ? pack.chunks[0]!.tier : undefined
    const minFreshness = pack.chunks.length > 0
      ? Math.min(...pack.chunks.map((c) => c.freshnessScore))
      : undefined

    return {
      id: evalCase.id,
      category: evalCase.category,
      description: evalCase.description,
      passed,
      actualAbstain: pack.abstain,
      actualAbstainReason: pack.abstainReason,
      actualChunkCount: pack.chunks.length,
      actualTopTier: topTier,
      actualMinFreshness: minFreshness,
      failReason,
      durationMs,
    }
  } catch (err) {
    return {
      id: evalCase.id,
      category: evalCase.category,
      description: evalCase.description,
      passed: false,
      actualAbstain: false,
      actualChunkCount: 0,
      failReason: `Exception: ${String(err)}`,
      durationMs: Date.now() - start,
    }
  }
}

function resolveProductId(category: EvalCase["category"]): string {
  if (category === "empty_corpus") return EMPTY_PRODUCT_ID
  if (category === "freshness") return STALE_PRODUCT_ID
  return PRODUCT_ID
}

function validatePack(pack: EvidencePack, evalCase: EvalCase): { passed: boolean; failReason?: string } {
  // Check abstain expectation
  if (evalCase.expectedAbstain !== pack.abstain) {
    return {
      passed: false,
      failReason: evalCase.expectedAbstain
        ? `Expected abstain but got ${pack.chunks.length} chunks`
        : `Expected results but got abstain(${pack.abstainReason})`,
    }
  }

  // Check abstain reason
  if (evalCase.expectedAbstain && evalCase.expectedAbstainReason) {
    if (pack.abstainReason !== evalCase.expectedAbstainReason) {
      return {
        passed: false,
        failReason: `Wrong abstain reason: expected '${evalCase.expectedAbstainReason}', got '${pack.abstainReason}'`,
      }
    }
  }

  // When not abstaining, check min chunks
  if (!evalCase.expectedAbstain && evalCase.expectedMinChunks !== undefined) {
    if (pack.chunks.length < evalCase.expectedMinChunks) {
      return {
        passed: false,
        failReason: `Expected >= ${evalCase.expectedMinChunks} chunks, got ${pack.chunks.length}`,
      }
    }
  }

  // Check top chunk tier
  if (!evalCase.expectedAbstain && evalCase.expectedMaxTier !== undefined && pack.chunks.length > 0) {
    const topTier = pack.chunks[0]!.tier
    if (topTier > evalCase.expectedMaxTier) {
      return {
        passed: false,
        failReason: `Top chunk tier is T${topTier}, expected <= T${evalCase.expectedMaxTier}`,
      }
    }
  }

  // Check min freshness
  if (!evalCase.expectedAbstain && evalCase.expectedMinFreshness !== undefined && pack.chunks.length > 0) {
    const minFreshness = Math.min(...pack.chunks.map((c) => c.freshnessScore))
    if (minFreshness < evalCase.expectedMinFreshness) {
      return {
        passed: false,
        failReason: `Min freshness ${minFreshness.toFixed(2)} < expected ${evalCase.expectedMinFreshness}`,
      }
    }
  }

  return { passed: true }
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Evaluation runner failed:", err)
  process.exit(1)
})
