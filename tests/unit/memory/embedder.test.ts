// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Unit tests: memory/ingestion/embedder
 *
 * INST01-T04  EMBEDDING_PROVIDER=google routes to the OpenAI-compatible path
 *             (Google Generative Language API exposes an OpenAI-compat endpoint)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Config mock — google provider ─────────────────────────────────────────────
vi.mock("../../../src/shared/config.js", () => ({
  config: {
    EMBEDDING_PROVIDER:   "google",
    EMBEDDING_API_KEY:    "sk-google-test",
    EMBEDDING_MODEL:      "gemini-embedding-001",
    EMBEDDING_DIMENSIONS: 768,
    EMBEDDING_BASE_URL:   "https://generativelanguage.googleapis.com/v1beta/openai",
  },
}))

vi.mock("../../../src/shared/crypto.js", () => ({
  decryptSecret: (v: unknown) => v,
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// No productId → resolveEmbeddingConfig falls straight to env vars (no DB call needed)
vi.mock("../../../src/infra/db/repositories/products.js", () => ({
  findProductById: vi.fn().mockResolvedValue(null),
}))

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function makeOpenAIResponse(vectors: number[][]): Response {
  const body = JSON.stringify({
    data: vectors.map((embedding, index) => ({ embedding, index })),
    usage: { total_tokens: vectors.length * 10 },
  })
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("embedBatch — EMBEDDING_PROVIDER=google (INST-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("INST01-T04: google provider routes to OpenAI-compat endpoint, not ollama", async () => {
    const dummyVector = Array.from({ length: 768 }, (_, i) => i * 0.001)
    mockFetch.mockResolvedValue(makeOpenAIResponse([dummyVector]))

    const { embedBatch } = await import("../../../src/memory/ingestion/embedder.js")
    const results = await embedBatch(["hello world"])

    // Must have called fetch exactly once (OpenAI-compat path, not Ollama per-item loop)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // URL must point to the Google OpenAI-compat base URL
    const [url] = mockFetch.mock.calls[0] as [string, ...unknown[]]
    expect(url).toContain("generativelanguage.googleapis.com")
    expect(url).toContain("/v1/embeddings")

    // Result shape must be correct
    expect(results).toHaveLength(1)
    expect(results[0]!.embedding).toEqual(dummyVector)
  })
})
