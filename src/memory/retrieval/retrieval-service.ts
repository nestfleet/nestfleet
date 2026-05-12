// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Retrieval service — hybrid search, reranking, abstain logic.
 * Spec: product-memory-specification.md section 6.
 * ADR-018: tier governs policy gating.
 * ADR-021: freshness and version are mandatory retrieval signals.
 *
 * Pipeline:
 *  1. Hybrid search — vector similarity + BM25 full-text, combined via RRF
 *  2. Tier + freshness filtering — apply policy gates before reranking
 *  3. Reranking — weighted score: similarity * tier_weight * freshness_score
 *  4. Evidence pack assembly — top-N chunks + abstain evaluation
 */

import { getDb } from "../../infra/db/client.js"
import { logger } from "../../shared/logger.js"
import { isStaleForAutoReply, hasStalenessWarning } from "../ingestion/freshness.js"
import type {
  RetrievalRequest,
  EvidencePack,
  EvidenceChunk,
  AbstainReason,
  ActionType,
  SourceTier,
} from "../types.js"

// ── Scoring weights ──────────────────────────────────────────────────────────

/** Tier weight multipliers for reranking — T1 chunks are preferred 2:1 over T4. */
const TIER_WEIGHTS: Record<SourceTier, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.65,
  4: 0.45,
}

/** Relative weight of vector vs. BM25 scores in RRF fusion. */
const VECTOR_WEIGHT = 0.7
const TEXT_WEIGHT = 0.3

/** RRF k constant (controls ranking smoothing). */
const RRF_K = 60

/** Default retrieval parameters. */
const DEFAULT_TOP_K = 20   // candidates before reranking
const DEFAULT_TOP_N = 5    // final evidence pack size

// ── Policy gates per action type ────────────────────────────────────────────

/** Minimum tier required in evidence pack for each action type. */
const MIN_TIER_FOR_ACTION: Record<ActionType, SourceTier> = {
  auto_reply:        1,  // must have T1 source
  triage:            2,  // T2 sufficient
  known_issue_match: 2,
  change_prep:       2,
  pr_draft_prep:     2,
  outage_routing:    1,  // outage routing requires authoritative T1 source
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute a retrieval request and return an evidence pack.
 * The pack includes an `abstain` flag and reason when policy gates are not met.
 */
export async function retrieve(request: RetrievalRequest): Promise<EvidencePack> {
  const topK = request.topK ?? DEFAULT_TOP_K
  const topN = request.topN ?? DEFAULT_TOP_N

  logger.debug(
    { productId: request.productId, actionType: request.actionType, topK, topN },
    "Retrieval request received",
  )

  // Stage 1: Hybrid search — get candidates from both vector and BM25
  const candidates = await hybridSearch(request, topK)

  if (candidates.length === 0) {
    return buildAbstainPack("no_results")
  }

  // Stage 2: Rerank by composite score
  const reranked = rerankCandidates(candidates)

  // Stage 3: Apply version filter if specified
  const versionFiltered = applyVersionFilter(reranked, request.productVersion)

  // Stage 4: Assemble evidence pack with abstain evaluation
  const pack = assembleEvidencePack(versionFiltered, topN, request)

  logger.debug(
    {
      productId: request.productId,
      chunksReturned: pack.chunks.length,
      abstain: pack.abstain,
      abstainReason: pack.abstainReason,
    },
    "Evidence pack assembled",
  )

  return pack
}

// ── Internal ─────────────────────────────────────────────────────────────────

/** @internal Exported for unit testing only. */
export interface RawCandidate {
  chunkId: string
  sourceType: string
  sourceUri: string
  sectionPath: string
  contentType: string
  content: string
  tier: SourceTier
  freshnessScore: number
  conflictFlag: boolean
  productVersion: string
  audience: string
  vectorScore: number   // cosine similarity 0-1
  textScore: number     // normalized BM25 score 0-1
}

async function hybridSearch(request: RetrievalRequest, topK: number): Promise<RawCandidate[]> {
  const db = getDb()

  const minTier = request.minTier ?? 4  // allow all tiers unless restricted
  const contentTypes = request.contentTypes && request.contentTypes.length > 0
    ? request.contentTypes
    : null

  type VectorRow = {
    chunk_id: string; source_type: string; source_uri: string; section_path: string
    content_type: string; content: string; tier: number; freshness_score: number
    conflict_flag: boolean; product_version: string; audience: string; vector_rank: number
  }
  type TextRow = VectorRow & { text_rank: number }

  // Internal callers can see both public and internal chunks;
  // public callers see only public chunks.
  const allowedAudiences = request.audience === "internal"
    ? ["public", "internal"]
    : ["public"]

  // Vector search (cosine similarity via pgvector)
  const vectorResults = (await db`
    SELECT
      chunk_id, source_type, source_uri, section_path, content_type, content,
      tier, freshness_score, conflict_flag, product_version, audience,
      ROW_NUMBER() OVER (ORDER BY embedding <=> ${JSON.stringify(request.queryEmbedding)}::vector) AS vector_rank
    FROM memory_chunks
    WHERE product_id = ${request.productId}
      AND tier <= ${minTier === 4 ? 4 : minTier}
      AND audience = ANY(${allowedAudiences})
      ${contentTypes ? db`AND content_type = ANY(${contentTypes})` : db``}
    ORDER BY embedding <=> ${JSON.stringify(request.queryEmbedding)}::vector
    LIMIT ${topK}
  `) as VectorRow[]

  // Full-text search (BM25 via ts_rank)
  const textResults = (await db`
    SELECT
      chunk_id, source_type, source_uri, section_path, content_type, content,
      tier, freshness_score, conflict_flag, product_version, audience,
      ROW_NUMBER() OVER (ORDER BY ts_rank(fts_vector, plainto_tsquery('english', ${request.queryText})) DESC) AS text_rank
    FROM memory_chunks
    WHERE product_id = ${request.productId}
      AND tier <= ${minTier === 4 ? 4 : minTier}
      AND audience = ANY(${allowedAudiences})
      ${contentTypes ? db`AND content_type = ANY(${contentTypes})` : db``}
      AND fts_vector @@ plainto_tsquery('english', ${request.queryText})
    ORDER BY ts_rank(fts_vector, plainto_tsquery('english', ${request.queryText})) DESC
    LIMIT ${topK}
  `) as TextRow[]

  // RRF fusion: merge vector and text ranks
  const vectorMap = new Map<string, { row: typeof vectorResults[0]; rank: number }>()
  for (const row of vectorResults) {
    vectorMap.set(row.chunk_id, { row, rank: row.vector_rank })
  }

  const textMap = new Map<string, { rank: number }>()
  for (const row of textResults) {
    textMap.set(row.chunk_id, { rank: row.text_rank })
  }

  const allChunkIds = new Set([...vectorMap.keys(), ...textMap.keys()])
  const candidates: RawCandidate[] = []

  for (const chunkId of allChunkIds) {
    const vEntry = vectorMap.get(chunkId)
    const tEntry = textMap.get(chunkId)

    const rrfVector = vEntry ? VECTOR_WEIGHT / (RRF_K + vEntry.rank) : 0
    const rrfText = tEntry ? TEXT_WEIGHT / (RRF_K + tEntry.rank) : 0
    const fusedScore = rrfVector + rrfText

    // Use metadata from whichever search found the chunk
    const meta = vEntry?.row ?? textResults.find((r) => r.chunk_id === chunkId)!

    candidates.push({
      chunkId: meta.chunk_id,
      sourceType: meta.source_type,
      sourceUri: meta.source_uri,
      sectionPath: meta.section_path,
      contentType: meta.content_type,
      content: meta.content,
      tier: meta.tier as SourceTier,
      freshnessScore: meta.freshness_score,
      conflictFlag: meta.conflict_flag,
      productVersion: meta.product_version,
      audience: meta.audience,
      vectorScore: fusedScore,
      textScore: fusedScore,
    })
  }

  return candidates
}

/** @internal Exported for unit testing only. */
export function rerankCandidates(candidates: RawCandidate[]): RawCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      // Composite score: fused similarity * tier_weight * freshness_score
      vectorScore: c.vectorScore * (TIER_WEIGHTS[c.tier] ?? 0.45) * Math.max(c.freshnessScore, 0.1),
    }))
    .sort((a, b) => b.vectorScore - a.vectorScore)
}

/** @internal Exported for unit testing only. */
export function applyVersionFilter(candidates: RawCandidate[], productVersion?: string): RawCandidate[] {
  if (!productVersion) return candidates

  // Keep chunks that match the requested version OR are version-agnostic ('*')
  return candidates.filter((c) => c.productVersion === "*" || c.productVersion === productVersion)
}

function assembleEvidencePack(
  candidates: RawCandidate[],
  topN: number,
  request: RetrievalRequest,
): EvidencePack {
  const top = candidates.slice(0, topN)

  if (top.length === 0) {
    return buildAbstainPack("no_results")
  }

  const chunks: EvidenceChunk[] = top.map((c) => ({
    chunkId: c.chunkId,
    sourceType: c.sourceType as any,
    sourceUri: c.sourceUri,
    sectionPath: c.sectionPath,
    contentType: c.contentType as any,
    content: c.content,
    tier: c.tier,
    freshnessScore: c.freshnessScore,
    conflictFlag: c.conflictFlag,
    audience: c.audience as any,
    score: c.vectorScore,
  }))

  // Compute pack metadata
  const tierSummary: Record<SourceTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const c of chunks) tierSummary[c.tier]++

  const freshnessScores = chunks.map((c) => c.freshnessScore)
  const minFreshness = Math.min(...freshnessScores)
  const avgFreshness = freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length
  const hasConflicts = chunks.some((c) => c.conflictFlag)

  // Evaluate abstain conditions
  const abstainReason = evaluateAbstain(chunks, request)

  return {
    chunks,
    tierSummary,
    minFreshness,
    avgFreshness,
    hasConflicts,
    abstain: abstainReason !== null,
    abstainReason,
  }
}

/** @internal Exported for unit testing only. */
export function evaluateAbstain(chunks: EvidenceChunk[], request: RetrievalRequest): AbstainReason | null {
  const { actionType, audience } = request

  // Audience violation — requested public but only internal chunks available
  const hasPublicChunk = chunks.some((c) => c.audience !== "internal")
  if (audience === "public" && !hasPublicChunk) {
    return "audience_violation"
  }

  // Knowledge conflict — conflicts in evidence pack
  if (chunks.some((c) => c.conflictFlag)) {
    return "knowledge_conflict"
  }

  // Tier gate — action requires a minimum tier in the pack
  if (actionType) {
    const requiredTier = MIN_TIER_FOR_ACTION[actionType]
    const hasRequiredTier = chunks.some((c) => c.tier <= requiredTier)
    if (!hasRequiredTier) {
      return "insufficient_tier"
    }
  }

  // Stale evidence — the best (highest-ranked) T1/T2 chunk is stale for auto_reply / outage_routing.
  // Using "best T1/T2 chunk" rather than "all T1/T2 chunks" to catch cases where stale T1 is
  // diluted by fresh T3/T4 chunks in the pack (SPIKE-01 finding).
  if (actionType === "auto_reply" || actionType === "outage_routing") {
    const bestT1T2 = chunks.find((c) => c.tier <= 2)  // already sorted by score desc
    if (bestT1T2 && isStaleForAutoReply(bestT1T2.freshnessScore, bestT1T2.tier)) {
      return "stale_evidence"
    }
  }

  return null
}

function buildAbstainPack(reason: AbstainReason): EvidencePack {
  return {
    chunks: [],
    tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain: true,
    abstainReason: reason,
  }
}
