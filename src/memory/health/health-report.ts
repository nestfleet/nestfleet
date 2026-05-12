// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Documentation health assessment.
 * ADR-020: health report is a first-class feature.
 * Spec: product-memory-specification.md section 7.
 *
 * Computes 8 health dimensions and 5 capability gates, persists to
 * documentation_health_reports, and returns the report.
 */

import crypto from "node:crypto"
import { getDb } from "../../infra/db/client.js"
import { logger } from "../../shared/logger.js"
import { STALENESS_WINDOW_DAYS } from "../ingestion/freshness.js"
import { T1_SOURCE_TYPES, ARCHITECTURE_SOURCE_TYPES, TECHNICAL_SPEC_SOURCE_TYPES } from "../ingestion/tier-assigner.js"
import type {
  DocumentationHealthReport,
  HealthDimensions,
  CapabilityGates,
  HealthMetrics,
  HealthLevel,
  CapabilityStatus,
} from "../types.js"

// ── Thresholds ───────────────────────────────────────────────────────────────

const T1_GOOD_THRESHOLD = 10      // ≥10 T1 chunks = good coverage
const T1_WARN_THRESHOLD = 3       // ≥3 = warn; <3 = fail
const T1_COVERAGE_GOOD = 0.8     // ≥80% of expected T1 types present = good
const T1_COVERAGE_WARN = 0.5

const FAQ_GOOD_THRESHOLD = 5
const FAQ_WARN_THRESHOLD = 1

const KNOWN_ISSUE_GOOD_THRESHOLD = 1  // at least some known issues documented

const FRESHNESS_GOOD = 0.8         // 80% of T1 chunks fresh
const FRESHNESS_WARN = 0.5

const OPEN_CONFLICT_FAIL = 1       // any open conflict = warn; >3 = fail
const OPEN_CONFLICT_WARN = 0

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute and persist a documentation health report for a product.
 */
export async function computeHealthReport(productId: string): Promise<DocumentationHealthReport> {
  logger.info({ productId }, "Computing documentation health report")

  const db = getDb()
  const metrics = await gatherMetrics(productId)
  const dimensions = computeDimensions(metrics)
  const capabilities = computeCapabilityGates(dimensions, metrics)
  const recommendedActions = buildRecommendations(dimensions, metrics)

  const reportId = `hr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
  const computedAt = new Date()

  const report: DocumentationHealthReport = {
    reportId,
    productId,
    computedAt,
    dimensions,
    capabilities,
    metrics,
    recommendedActions,
  }

  // Persist to DB
  await db`
    INSERT INTO documentation_health_reports (
      report_id,
      product_id,
      computed_at,
      t1_coverage,
      faq_coverage,
      known_issues,
      architecture,
      technical_spec,
      freshness,
      conflicts,
      language,
      auto_reply_gate,
      known_issue_match_gate,
      change_prep_gate,
      pr_draft_gate,
      outage_routing_gate,
      metrics
    ) VALUES (
      ${reportId},
      ${productId},
      ${computedAt},
      ${dimensions.t1Coverage},
      ${dimensions.faqCoverage},
      ${dimensions.knownIssues},
      ${dimensions.architecture},
      ${dimensions.technicalSpec},
      ${dimensions.freshness},
      ${dimensions.conflicts},
      ${dimensions.language},
      ${capabilities.autoReply},
      ${capabilities.knownIssueMatch},
      ${capabilities.changePrep},
      ${capabilities.prDraft},
      ${capabilities.outageRouting},
      ${JSON.parse(JSON.stringify(metrics))}
    )
  `

  logger.info(
    { productId, reportId, autoReply: capabilities.autoReply, changePrep: capabilities.changePrep },
    "Health report persisted",
  )

  return report
}

/**
 * Retrieve the most recent health report for a product.
 * Returns null if no report has been computed yet.
 */
export async function getLatestHealthReport(productId: string): Promise<DocumentationHealthReport | null> {
  const db = getDb()

  type HealthReportRow = {
    report_id: string
    product_id: string
    computed_at: Date
    t1_coverage: string
    faq_coverage: string
    known_issues: string
    architecture: string
    technical_spec: string
    freshness: string
    conflicts: string
    language: string
    auto_reply_gate: string
    known_issue_match_gate: string
    change_prep_gate: string
    pr_draft_gate: string
    outage_routing_gate: string
    metrics: HealthMetrics
  }
  const rows = (await db`
    SELECT *
    FROM documentation_health_reports
    WHERE product_id = ${productId}
    ORDER BY computed_at DESC
    LIMIT 1
  `) as HealthReportRow[]

  const row = rows[0]
  if (!row) return null

  return {
    reportId: row.report_id,
    productId: row.product_id,
    computedAt: row.computed_at,
    dimensions: {
      t1Coverage: row.t1_coverage as HealthLevel,
      faqCoverage: row.faq_coverage as HealthLevel,
      knownIssues: row.known_issues as HealthLevel,
      architecture: row.architecture as HealthLevel,
      technicalSpec: row.technical_spec as HealthLevel,
      freshness: row.freshness as HealthLevel,
      conflicts: row.conflicts as HealthLevel,
      language: row.language as "good" | "warn",
    },
    capabilities: {
      autoReply: row.auto_reply_gate as CapabilityStatus,
      knownIssueMatch: row.known_issue_match_gate as CapabilityStatus,
      changePrep: row.change_prep_gate as CapabilityStatus,
      prDraft: row.pr_draft_gate as CapabilityStatus,
      outageRouting: row.outage_routing_gate as CapabilityStatus,
    },
    metrics: row.metrics,
    recommendedActions: buildRecommendations(
      {
        t1Coverage: row.t1_coverage as HealthLevel,
        faqCoverage: row.faq_coverage as HealthLevel,
        knownIssues: row.known_issues as HealthLevel,
        architecture: row.architecture as HealthLevel,
        technicalSpec: row.technical_spec as HealthLevel,
        freshness: row.freshness as HealthLevel,
        conflicts: row.conflicts as HealthLevel,
        language: row.language as "good" | "warn",
      },
      row.metrics,
    ),
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function gatherMetrics(productId: string): Promise<HealthMetrics> {
  const db = getDb()

  // T1 chunk count and coverage
  const t1Counts = (await db`
    SELECT source_type, COUNT(*)::int AS count
    FROM memory_chunks
    WHERE product_id = ${productId}
      AND tier = 1
    GROUP BY source_type
  `) as { source_type: string; count: number }[]

  const t1ChunkCount = t1Counts.reduce((sum: number, r: { count: number }) => sum + r.count, 0)
  const t1TypesPresent = new Set(t1Counts.map((r: { source_type: string }) => r.source_type))
  const t1CoveragePercent = T1_SOURCE_TYPES.length > 0
    ? t1TypesPresent.size / T1_SOURCE_TYPES.length
    : 0

  // FAQ and known issues counts
  const faqEntry = t1Counts.find((r: { source_type: string }) => r.source_type === "faq")
  const faqEntryCount = faqEntry?.count ?? 0

  const knownIssueEntry = t1Counts.find((r: { source_type: string }) => r.source_type === "known_issues")
  const knownIssueCount = knownIssueEntry?.count ?? 0

  // Architecture and tech spec presence + freshness
  const archRows = (await db`
    SELECT freshness_score
    FROM memory_chunks
    WHERE product_id = ${productId}
      AND source_type = ANY(${ARCHITECTURE_SOURCE_TYPES})
    LIMIT 1
  `) as { freshness_score: number }[]

  const techRows = (await db`
    SELECT freshness_score
    FROM memory_chunks
    WHERE product_id = ${productId}
      AND source_type = ANY(${TECHNICAL_SPEC_SOURCE_TYPES})
    LIMIT 1
  `) as { freshness_score: number }[]

  const archRow = archRows[0]
  const techRow = techRows[0]

  const architecturePresent = archRow !== undefined
  const architectureFresh = architecturePresent && (archRow?.freshness_score ?? 0) >= 0.5

  const technicalSpecPresent = techRow !== undefined
  const technicalSpecFresh = technicalSpecPresent && (techRow?.freshness_score ?? 0) >= 0.5

  // Fresh T1 percent (freshness_score >= 0.5)
  const freshT1 = (await db`
    SELECT
      COUNT(*) FILTER (WHERE freshness_score >= 0.5)::int AS fresh_count,
      COUNT(*)::int                                        AS total_count
    FROM memory_chunks
    WHERE product_id = ${productId}
      AND tier = 1
  `) as { fresh_count: number; total_count: number }[]

  const freshT1Row = freshT1[0]
  const freshT1Percent = freshT1Row && freshT1Row.total_count > 0
    ? freshT1Row.fresh_count / freshT1Row.total_count
    : 0

  // Open conflicts
  const conflictRows = (await db`
    SELECT COUNT(*)::int AS count
    FROM knowledge_conflicts
    WHERE product_id = ${productId}
      AND status = 'open'
  `) as { count: number }[]

  const openConflictCount = conflictRows[0]?.count ?? 0

  // Primary language — most common lang tag in T1 chunks
  const langRows = (await db`
    SELECT language, COUNT(*)::int AS count
    FROM memory_chunks
    WHERE product_id = ${productId}
      AND tier = 1
    GROUP BY language
    ORDER BY count DESC
    LIMIT 1
  `) as { language: string; count: number }[]

  const primaryLanguage = langRows[0]?.language ?? "en"

  // Total chunks
  const totalRows = (await db`
    SELECT COUNT(*)::int AS count
    FROM memory_chunks
    WHERE product_id = ${productId}
  `) as { count: number }[]

  const totalChunks = totalRows[0]?.count ?? 0

  return {
    t1ChunkCount,
    t1CoveragePercent,
    faqEntryCount,
    knownIssueCount,
    architecturePresent,
    architectureFresh,
    technicalSpecPresent,
    technicalSpecFresh,
    freshT1Percent,
    openConflictCount,
    primaryLanguage,
    totalChunks,
  }
}

function computeDimensions(m: HealthMetrics): HealthDimensions {
  return {
    t1Coverage: triLevel(
      m.t1ChunkCount >= T1_GOOD_THRESHOLD && m.t1CoveragePercent >= T1_COVERAGE_GOOD,
      m.t1ChunkCount >= T1_WARN_THRESHOLD && m.t1CoveragePercent >= T1_COVERAGE_WARN,
    ),

    faqCoverage: triLevel(
      m.faqEntryCount >= FAQ_GOOD_THRESHOLD,
      m.faqEntryCount >= FAQ_WARN_THRESHOLD,
    ),

    knownIssues: triLevel(
      m.knownIssueCount >= KNOWN_ISSUE_GOOD_THRESHOLD,
      m.knownIssueCount > 0,
    ),

    architecture: triLevel(
      m.architecturePresent && m.architectureFresh,
      m.architecturePresent,
    ),

    technicalSpec: triLevel(
      m.technicalSpecPresent && m.technicalSpecFresh,
      m.technicalSpecPresent,
    ),

    freshness: triLevel(
      m.freshT1Percent >= FRESHNESS_GOOD,
      m.freshT1Percent >= FRESHNESS_WARN,
    ),

    conflicts: triLevel(
      m.openConflictCount === 0,
      m.openConflictCount <= OPEN_CONFLICT_FAIL,
    ),

    language: m.primaryLanguage !== "" ? "good" : "warn",
  }
}

function triLevel(good: boolean, warn: boolean): HealthLevel {
  if (good) return "good"
  if (warn) return "warn"
  return "fail"
}

function computeCapabilityGates(d: HealthDimensions, m: HealthMetrics): CapabilityGates {
  /**
   * auto_reply: requires T1 good + freshness good + no conflicts
   * If T1 = warn or freshness = warn → degraded
   */
  const autoReply = capGate(
    d.t1Coverage === "good" && d.freshness === "good" && d.conflicts === "good",
    d.t1Coverage !== "fail" && d.freshness !== "fail" && d.conflicts !== "fail",
  )

  /**
   * known_issue_match: requires known_issues present
   */
  const knownIssueMatch = capGate(
    d.knownIssues === "good",
    d.knownIssues !== "fail",
  )

  /**
   * change_prep: requires architecture + technical spec present (fresh preferred)
   */
  const changePrep = capGate(
    d.architecture === "good" && d.technicalSpec === "good",
    d.architecture !== "fail" && d.technicalSpec !== "fail",
  )

  /**
   * pr_draft: requires T1 + technical spec
   */
  const prDraft = capGate(
    d.t1Coverage !== "fail" && d.technicalSpec === "good",
    d.t1Coverage !== "fail" && d.technicalSpec !== "fail",
  )

  /**
   * outage_routing: requires T1 good + freshness good (stale = disabled for outages)
   */
  const outageRouting = capGate(
    d.t1Coverage === "good" && d.freshness === "good",
    d.t1Coverage !== "fail" && d.freshness !== "fail",
  )

  return { autoReply, knownIssueMatch, changePrep, prDraft, outageRouting }
}

function capGate(enabled: boolean, degraded: boolean): CapabilityStatus {
  if (enabled) return "enabled"
  if (degraded) return "degraded"
  return "disabled"
}

function buildRecommendations(d: HealthDimensions, m: HealthMetrics): string[] {
  const actions: string[] = []

  if (d.t1Coverage === "fail") {
    actions.push(
      `Add T1 source documents (product specs, FAQs, known issues). Currently only ${m.t1ChunkCount} T1 chunks indexed.`,
    )
  } else if (d.t1Coverage === "warn") {
    actions.push("Increase T1 coverage by adding more product spec and FAQ documents.")
  }

  if (d.faqCoverage === "fail") {
    actions.push("No FAQ document indexed. Add a FAQ to enable auto-reply capability.")
  }

  if (d.knownIssues === "fail") {
    actions.push("No known issues document indexed. Add known_issues source to enable known-issue matching.")
  }

  if (d.architecture === "fail") {
    actions.push("No architecture overview document found. Add an architecture_overview source.")
  } else if (d.architecture === "warn") {
    actions.push(
      `Architecture document is stale (freshness < 0.5). Staleness window: ${STALENESS_WINDOW_DAYS[2]} days for T2.`,
    )
  }

  if (d.technicalSpec === "fail") {
    actions.push("No technical spec indexed. Add technical_spec source for change-prep capability.")
  }

  if (d.freshness === "fail") {
    actions.push(
      `T1 document freshness is critically low (${Math.round(m.freshT1Percent * 100)}% fresh). Re-ingest updated documents.`,
    )
  } else if (d.freshness === "warn") {
    actions.push("Some T1 documents are approaching staleness. Schedule a re-ingestion.")
  }

  if (d.conflicts !== "good") {
    actions.push(
      `${m.openConflictCount} open knowledge conflict(s) detected. Review and resolve via the operator console.`,
    )
  }

  return actions
}
