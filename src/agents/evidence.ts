/**
 * buildEvidencePack() — shared RAG retrieval helper. QE-01.
 *
 * Centralises the try/catch + soft-abstain pattern that was previously
 * copy-pasted across auto-reply, known-issue-match, outage-routing,
 * triage, and change-prep agent implementations.
 *
 * Abstain semantics:
 *   - Embedding or retrieval throws      → EMPTY_EVIDENCE_PACK (non-fatal, warn)
 *   - abstainReason === "insufficient_tier" → return pack (soft, caller continues)
 *   - abstainReason === "no_results"        → return pack (soft, caller continues)
 *   - any other abstain reason              → throw PolicyViolationError (hard stop)
 */

import { retrieve } from "../memory/retrieval/retrieval-service.js"
import { embedText } from "../memory/ingestion/embedder.js"
import { PolicyViolationError } from "./types.js"
import { logger } from "../shared/logger.js"
import type { EvidencePack, ContentType, ActionType as MemoryActionType, RetrievalRequest } from "../memory/types.js"

// Re-export so callers can use the type without a separate memory import
export type { EvidencePack }

/** Action types recognised by the retrieval service (subset of agent ActionType). */
const MEMORY_ACTION_TYPES = new Set<string>([
  "auto_reply",
  "triage",
  "known_issue_match",
  "change_prep",
  "pr_draft_prep",
  "outage_routing",
])

function isMemoryActionType(s: string): s is MemoryActionType {
  return MEMORY_ACTION_TYPES.has(s)
}

export interface EvidencePackInput {
  productId: string
  queryText: string
  actionType: string
  audience?: string
  contentTypes?: string[]
  topK?: number
  topN?: number
  productVersion?: string
}

/** The empty evidence pack returned when retrieval is unavailable (non-fatal). */
const EMPTY_EVIDENCE_PACK: EvidencePack = {
  chunks: [],
  tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 },
  minFreshness: 0,
  avgFreshness: 0,
  hasConflicts: false,
  abstain: false,
  abstainReason: null,
}

/**
 * Build an evidence pack for an agent call.
 *
 * Embeds `queryText` (first 512 chars) and calls `retrieve()`. Errors in either
 * step are non-fatal and return EMPTY_EVIDENCE_PACK. Hard abstain reasons (anything
 * other than "insufficient_tier" or "no_results") throw PolicyViolationError.
 *
 * @throws PolicyViolationError for hard abstain reasons
 */
export async function buildEvidencePack(input: EvidencePackInput): Promise<EvidencePack> {
  const {
    productId,
    queryText,
    actionType,
    audience = "internal",
    contentTypes,
    topK,
    topN,
    productVersion,
  } = input

  // Step 1: embed — non-fatal
  let queryEmbedding: number[]
  try {
    const { embedding } = await embedText(queryText.slice(0, 512), productId)
    queryEmbedding = embedding
  } catch (err) {
    logger.warn(
      { err, productId, actionType },
      "buildEvidencePack: embedding failed — proceeding without RAG context",
    )
    return EMPTY_EVIDENCE_PACK
  }

  // Step 2: retrieve — non-fatal
  // Build RetrievalRequest imperatively to satisfy exactOptionalPropertyTypes:
  // optional fields are set only when present, never assigned undefined.
  const audienceNorm = audience === "public" ? "public" as const : "internal" as const
  const request: RetrievalRequest = {
    productId,
    queryText,
    queryEmbedding,
    audience: audienceNorm,
  }
  // actionType in RetrievalRequest is a narrower union (no knowledge_capture)
  if (isMemoryActionType(actionType)) {
    request.actionType = actionType
  }
  if (contentTypes && contentTypes.length > 0) {
    request.contentTypes = contentTypes as ContentType[]
  }
  if (topK !== undefined) request.topK = topK
  if (topN !== undefined) request.topN = topN
  if (productVersion) request.productVersion = productVersion

  let evidencePack: EvidencePack
  try {
    evidencePack = await retrieve(request)
  } catch (err) {
    logger.warn(
      { err, productId, actionType },
      "buildEvidencePack: retrieval failed — proceeding without RAG context",
    )
    return EMPTY_EVIDENCE_PACK
  }

  // Step 3: abstain evaluation
  if (!evidencePack.abstain) {
    return evidencePack
  }

  const abstainReason = evidencePack.abstainReason

  // Soft abstains: caller proceeds on signal text / tools only
  if (abstainReason === "insufficient_tier" || abstainReason === "no_results") {
    if (abstainReason === "no_results") {
      logger.info(
        { productId, actionType },
        "buildEvidencePack: no memory chunks found — proceeding with signal text only",
      )
    }
    return evidencePack
  }

  // Hard abstain — audience violation, stale evidence, knowledge conflict, etc.
  logger.warn(
    { productId, actionType, abstainReason },
    "buildEvidencePack: hard abstain",
  )
  throw new PolicyViolationError(
    `${actionType} abstained: ${abstainReason}`,
    `abstain:${abstainReason}`,
  )
}
