/**
 * QE-06 — Unit tests for testLlmConnection() and testEmbeddingConnection().
 *
 * These helpers are pure HTTP callers — no DB, no auth.
 * We mock global fetch to avoid real network calls.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { testLlmConnection, testEmbeddingConnection } from "../../src/api/v1/settings.js"

// ── helpers ───────────────────────────────────────────────────────────────────

function mockFetch(ok: boolean, body: unknown, status = ok ? 200 : 401): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }))
}

// ── testLlmConnection ─────────────────────────────────────────────────────────

describe("testLlmConnection", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  describe("openai provider", () => {
    it("returns success=true when the API responds OK", async () => {
      mockFetch(true, { choices: [{ message: { content: "OK" } }] })
      const result = await testLlmConnection("openai", "gpt-4o", "sk-test")
      expect(result.success).toBe(true)
      expect(result.errorMessage).toBe("")
      expect(result.responseText).toBe("OK")
    })

    it("returns success=false with errorMessage on 401", async () => {
      mockFetch(false, { error: { message: "Invalid API key" } }, 401)
      const result = await testLlmConnection("openai", "gpt-4o", "sk-bad")
      expect(result.success).toBe(false)
      expect(result.errorMessage).toMatch(/^HTTP 401/)
    })

    it("returns success=true on 400 billing error (credit balance too low)", async () => {
      // Key is valid but account has no credits — should soft-pass so save succeeds
      mockFetch(false, { error: { message: "You exceeded your current quota" } }, 400)
      const result = await testLlmConnection("openai", "gpt-4o", "sk-test")
      expect(result.success).toBe(true)
    })

    it("returns success=true on 429 rate limit (key is valid)", async () => {
      mockFetch(false, { error: { message: "Rate limit exceeded" } }, 429)
      const result = await testLlmConnection("openai", "gpt-4o", "sk-test")
      expect(result.success).toBe(true)
    })
  })

  describe("anthropic provider", () => {
    it("returns success=true on 200 from Anthropic messages API", async () => {
      mockFetch(true, { content: [{ text: "OK" }] })
      const result = await testLlmConnection("anthropic", "claude-3-5-haiku-20241022", "sk-ant-test")
      expect(result.success).toBe(true)
      expect(result.responseText).toBe("OK")
    })

    it("returns success=false on 401", async () => {
      mockFetch(false, { error: { type: "authentication_error" } }, 401)
      const result = await testLlmConnection("anthropic", "claude-3-5-haiku-20241022", "bad-key")
      expect(result.success).toBe(false)
      expect(result.errorMessage).toMatch(/^HTTP 401/)
    })

    it("returns success=true on 400 credit balance error (key is valid)", async () => {
      // Anthropic returns 400 when credit balance is too low — key itself is valid
      mockFetch(false, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, 400)
      const result = await testLlmConnection("anthropic", "claude-3-5-haiku-20241022", "sk-ant-test")
      expect(result.success).toBe(true)
    })
  })

  describe("google provider", () => {
    it("returns success=true on 200 from generateContent", async () => {
      mockFetch(true, { candidates: [{ content: { parts: [{ text: "OK" }] } }] })
      const result = await testLlmConnection("google", "gemini-1.5-flash", "AIza-test")
      expect(result.success).toBe(true)
      expect(result.responseText).toBe("OK")
    })

    it("returns success=false on 403", async () => {
      mockFetch(false, { error: { status: "PERMISSION_DENIED" } }, 403)
      const result = await testLlmConnection("google", "gemini-1.5-flash", "bad-key")
      expect(result.success).toBe(false)
      expect(result.errorMessage).toMatch(/^HTTP 403/)
    })

    it("returns success=false on 400 API_KEY_INVALID", async () => {
      mockFetch(false, { error: { status: "INVALID_ARGUMENT", message: "API_KEY_INVALID" } }, 400)
      const result = await testLlmConnection("google", "gemini-1.5-flash", "bad-key")
      expect(result.success).toBe(false)
    })

    it("returns success=true on 400 quota/billing error (key is valid)", async () => {
      mockFetch(false, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, 400)
      const result = await testLlmConnection("google", "gemini-1.5-flash", "AIza-test")
      expect(result.success).toBe(true)
    })
  })

  describe("self-hosted provider", () => {
    it("returns success=true when the self-hosted endpoint responds OK", async () => {
      mockFetch(true, { choices: [{ message: { content: "OK" } }] })
      const result = await testLlmConnection("self-hosted", "llama3", "", "http://localhost:11434/v1")
      expect(result.success).toBe(true)
    })

    it("returns success=false when self-hosted returns non-OK status", async () => {
      mockFetch(false, { error: "model not found" }, 404)
      const result = await testLlmConnection("self-hosted", "nonexistent", "", "http://localhost:11434/v1")
      expect(result.success).toBe(false)
      expect(result.errorMessage).toMatch(/^HTTP 404/)
    })
  })

  it("propagates network errors (the PUT handler catches them)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    await expect(testLlmConnection("openai", "gpt-4o", "sk-test")).rejects.toThrow("ECONNREFUSED")
  })
})

// ── testEmbeddingConnection ───────────────────────────────────────────────────

describe("testEmbeddingConnection", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("returns success=true when OpenAI embedding API responds OK", async () => {
    mockFetch(true, { data: [{ embedding: [0.1, 0.2], index: 0 }], usage: { total_tokens: 3 } })
    const result = await testEmbeddingConnection({
      provider: "openai",
      apiKey: "sk-test",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: undefined,
    })
    expect(result.success).toBe(true)
    expect(result.errorMessage).toBe("")
  })

  it("returns success=false with errorMessage on 401 from embedding API", async () => {
    mockFetch(false, { error: { message: "Invalid API key" } }, 401)
    const result = await testEmbeddingConnection({
      provider: "openai",
      apiKey: "sk-bad",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: undefined,
    })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/^HTTP 401/)
  })

  it("returns success=true with modelNotFound=true when OpenAI embedding model returns 404", async () => {
    // 404 = model not enabled in project (key is valid) — soft pass, save proceeds with warning
    mockFetch(false, { error: { message: "Model not found" } }, 404)
    const result = await testEmbeddingConnection({
      provider: "openai",
      apiKey: "sk-test",
      embeddingModel: "text-embedding-999",
      embeddingDimensions: 768,
      baseUrl: undefined,
    })
    expect(result.success).toBe(true)
    expect(result.modelNotFound).toBe(true)
  })

  it("soft-passes for anthropic when embeddingApiKey is empty (not yet entered)", async () => {
    // No embeddingApiKey provided — user hasn't entered it yet. Skip validation.
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await testEmbeddingConnection({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: undefined,
    })
    expect(result.success).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("validates embeddingApiKey against OpenAI for anthropic when provided and valid", async () => {
    mockFetch(true, { data: [{ embedding: [0.1, 0.2], index: 0 }], usage: { total_tokens: 3 } })
    const result = await testEmbeddingConnection({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: undefined,
      embeddingApiKey: "sk-openai-valid",
    })
    expect(result.success).toBe(true)
    expect(result.errorMessage).toBe("")
  })

  it("returns success=false for anthropic when embeddingApiKey is provided but returns 401", async () => {
    mockFetch(false, { error: { message: "Invalid API key" } }, 401)
    const result = await testEmbeddingConnection({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: undefined,
      embeddingApiKey: "sk-openai-bad",
    })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/^HTTP 401/)
  })

  it("routes self-hosted provider to Ollama /api/embed endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ embeddings: [[0.1, 0.2]] }),
      text: () => Promise.resolve(""),
    })
    vi.stubGlobal("fetch", fetchMock)

    await testEmbeddingConnection({
      provider: "self-hosted",
      apiKey: "",
      embeddingModel: "nomic-embed-text",
      embeddingDimensions: 768,
      baseUrl: "http://localhost:11434",
    })

    const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
    expect(calledUrl).toContain("/api/embed")
  })

  it("uses custom baseUrl for OpenAI-compatible embedding providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ embedding: [0.1], index: 0 }] }),
      text: () => Promise.resolve(""),
    })
    vi.stubGlobal("fetch", fetchMock)

    await testEmbeddingConnection({
      provider: "openai",
      apiKey: "sk-test",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 768,
      baseUrl: "https://custom.endpoint.example.com",
    })

    const calledUrl = (fetchMock.mock.calls[0] as [string])[0]
    expect(calledUrl).toContain("custom.endpoint.example.com")
    expect(calledUrl).toContain("/v1/embeddings")
  })
})
