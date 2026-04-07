/**
 * Post-ingestion knowledge conflict detector.
 * ADR-020: conflict detection is a background pass after ingestion completes.
 * Spec: product-memory-specification.md section 8.
 *
 * Strategy:
 *  1. Candidate selection — find chunk pairs in the same product with high cosine
 *     similarity (>= SIMILARITY_THRESHOLD) that are from DIFFERENT source URIs.
 *     Same-URI chunks are expected to be consistent (same document).
 *  2. LLM classification — ask the configured LLM whether the two chunks
 *     actually contradict each other. Returns a boolean + short summary.
 *  3. Persistence — write a knowledge_conflict row and set conflict_flag = true
 *     on both chunks if a conflict is confirmed.
 *
 * The detector is intentionally conservative: only T1/T2 chunks are compared
 * (T3/T4 are too noisy for meaningful conflict detection).
 */

import postgres from "postgres"
import { getDb } from "../../infra/db/client.js"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"
import crypto from "node:crypto"

/** Cosine similarity threshold above which two chunks are considered candidate conflicts. */
const SIMILARITY_THRESHOLD = 0.88

/** Max candidate pairs to check per product per run (cost control). */
const MAX_PAIRS_PER_RUN = 50

// ── Public API ──────────────────────────────────────────────────────────────

export interface ConflictDetectionResult {
  pairsChecked: number
  conflictsFound: number
  conflictIds: string[]
}

/**
 * Run conflict detection for a product.
 * Compares high-similarity T1/T2 chunk pairs from different source URIs.
 * Should be called after a batch ingestion completes.
 */
export async function detectConflicts(productId: string): Promise<ConflictDetectionResult> {
  const db = getDb()

  logger.info({ productId }, "Starting conflict detection")

  // Find high-similarity chunk pairs (cross-document, T1+T2 only)
  // We use pgvector's <=> operator (cosine distance) — 1 - distance = similarity
  type CandidatePair = {
    chunk_id_a: string
    chunk_id_b: string
    content_a: string
    content_b: string
    source_uri_a: string
    source_uri_b: string
    similarity: number
  }
  const candidatePairs = (await db`
    SELECT
      a.chunk_id   AS chunk_id_a,
      b.chunk_id   AS chunk_id_b,
      a.content    AS content_a,
      b.content    AS content_b,
      a.source_uri AS source_uri_a,
      b.source_uri AS source_uri_b,
      1 - (a.embedding <=> b.embedding) AS similarity
    FROM memory_chunks a
    JOIN memory_chunks b
      ON a.product_id = b.product_id
     AND a.chunk_id < b.chunk_id              -- avoid duplicate pairs
     AND a.source_uri <> b.source_uri         -- cross-document only
     AND a.tier IN (1, 2)
     AND b.tier IN (1, 2)
    WHERE a.product_id = ${productId}
      AND a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND (1 - (a.embedding <=> b.embedding)) >= ${SIMILARITY_THRESHOLD}
      -- Skip pairs already recorded
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_conflicts kc
        WHERE kc.product_id = ${productId}
          AND (
            (kc.chunk_id_a = a.chunk_id AND kc.chunk_id_b = b.chunk_id) OR
            (kc.chunk_id_a = b.chunk_id AND kc.chunk_id_b = a.chunk_id)
          )
          AND kc.status IN ('open', 'dismissed')
      )
    ORDER BY similarity DESC
    LIMIT ${MAX_PAIRS_PER_RUN}
  `) as CandidatePair[]

  logger.debug({ productId, candidateCount: candidatePairs.length }, "Candidate conflict pairs found")

  const conflictIds: string[] = []

  for (const pair of candidatePairs) {
    try {
      const result = await classifyConflict(pair.content_a, pair.content_b)
      if (!result.isConflict) continue

      const conflictId = `kc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`

      await db.begin(async (tx) => {
        const sql = tx as unknown as postgres.Sql
        // Insert conflict record
        await sql`
          INSERT INTO knowledge_conflicts
            (conflict_id, product_id, chunk_id_a, chunk_id_b, conflict_summary, detected_at, status)
          VALUES
            (${conflictId}, ${productId}, ${pair.chunk_id_a}, ${pair.chunk_id_b},
             ${result.summary}, NOW(), 'open')
          ON CONFLICT DO NOTHING
        `

        // Flag both chunks
        await sql`
          UPDATE memory_chunks
          SET conflict_flag = true
          WHERE chunk_id IN (${pair.chunk_id_a}, ${pair.chunk_id_b})
        `
      })

      conflictIds.push(conflictId)
      logger.warn(
        { conflictId, chunkIdA: pair.chunk_id_a, chunkIdB: pair.chunk_id_b, summary: result.summary },
        "Knowledge conflict detected",
      )
    } catch (err) {
      logger.error({ err, chunkIdA: pair.chunk_id_a, chunkIdB: pair.chunk_id_b }, "Conflict classification failed")
    }
  }

  logger.info(
    { productId, pairsChecked: candidatePairs.length, conflictsFound: conflictIds.length },
    "Conflict detection complete",
  )

  return {
    pairsChecked: candidatePairs.length,
    conflictsFound: conflictIds.length,
    conflictIds,
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface ClassificationResult {
  isConflict: boolean
  summary: string
}

async function classifyConflict(contentA: string, contentB: string): Promise<ClassificationResult> {
  const provider = config.LLM_PROVIDER

  if (provider === "anthropic") {
    return classifyWithAnthropic(contentA, contentB)
  } else if (provider === "openai") {
    return classifyWithOpenAI(contentA, contentB)
  } else if (provider === "ollama") {
    return classifyWithOllama(contentA, contentB)
  }

  throw new Error(`Unsupported LLM provider for conflict detection: ${provider}`)
}

const SYSTEM_PROMPT = `You are a knowledge conflict detector for a product documentation system.
Your task is to determine if two documentation chunks directly contradict each other.

Rules:
- CONFLICT: chunks state opposite facts, incompatible configurations, or mutually exclusive behaviors
- NOT a conflict: one chunk is more detailed, or they cover different aspects of the same topic
- NOT a conflict: one is older and the other is a valid update (unless both claim to be current)
- Be conservative: only flag clear, unambiguous contradictions

Respond ONLY with valid JSON: {"conflict": true|false, "summary": "one-sentence explanation"}`

function buildUserPrompt(contentA: string, contentB: string): string {
  return `Chunk A:\n${contentA.slice(0, 1000)}\n\n---\n\nChunk B:\n${contentB.slice(0, 1000)}\n\nDo these chunks contradict each other?`
}

async function classifyWithAnthropic(contentA: string, contentB: string): Promise<ClassificationResult> {
  const apiKey = config.LLM_API_KEY
  if (!apiKey) throw new Error("LLM_API_KEY required for Anthropic conflict detection")

  const baseUrl = config.LLM_BASE_URL ?? "https://api.anthropic.com"

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(contentA, contentB) }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>
  }

  const text = data.content.find((c) => c.type === "text")?.text ?? ""
  return parseClassificationResponse(text)
}

async function classifyWithOpenAI(contentA: string, contentB: string): Promise<ClassificationResult> {
  const apiKey = config.LLM_API_KEY
  if (!apiKey) throw new Error("LLM_API_KEY required for OpenAI conflict detection")

  const baseUrl = config.LLM_BASE_URL ?? "https://api.openai.com"

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(contentA, contentB) },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  const text = data.choices[0]?.message?.content ?? ""
  return parseClassificationResponse(text)
}

async function classifyWithOllama(contentA: string, contentB: string): Promise<ClassificationResult> {
  const baseUrl = config.LLM_BASE_URL ?? "http://localhost:11434"

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(contentA, contentB) },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ollama API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as { message: { content: string } }
  return parseClassificationResponse(data.message.content)
}

function parseClassificationResponse(raw: string): ClassificationResult {
  try {
    const parsed = JSON.parse(raw) as { conflict?: boolean; summary?: string }
    return {
      isConflict: parsed.conflict === true,
      summary: parsed.summary ?? "No summary provided",
    }
  } catch {
    logger.warn({ raw }, "Failed to parse conflict classification response")
    return { isConflict: false, summary: "" }
  }
}
