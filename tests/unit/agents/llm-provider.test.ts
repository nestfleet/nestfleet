/**
 * Unit tests: getLlmProvider(), getLlmProviderForProduct(), PROVIDER_CAPABILITIES — AE-01 / SLICE-11.
 *
 * NF-UNIT-320: openai provider — createOpenAI called with apiKey
 * NF-UNIT-321: openai with baseUrl — uses .chat() instead of factory()
 * NF-UNIT-322: anthropic provider — createAnthropic called
 * NF-UNIT-323: google provider — createGoogleGenerativeAI called (native SDK, not OpenAI compat)
 * NF-UNIT-324: google provider — respects LLM_BASE_URL when set (for Vertex AI / custom proxies)
 * NF-UNIT-325: ollama/self-hosted provider — createOllama called
 * NF-UNIT-326: unsupported provider — throws Error
 * NF-UNIT-327: getLlmProviderForProduct loads from DB when product has llm_config
 * NF-UNIT-328: getLlmProviderForProduct falls back to env when product not found
 * NF-UNIT-329: getLlmProviderForProduct falls back to env when llm_config missing provider/model
 * NF-UNIT-330: getLlmProviderForProduct extracts tone from agent_config
 * NF-UNIT-331: getLlmProviderForProduct defaults tone to "formal"
 * NF-UNIT-332: getLlmProviderForProduct catches DB errors and falls back to env
 *
 * NF-UNIT-333: PROVIDER_CAPABILITIES — openai supportsTools: true
 * NF-UNIT-334: PROVIDER_CAPABILITIES — anthropic supportsTools: true
 * NF-UNIT-335: PROVIDER_CAPABILITIES — google supportsTools: true
 * NF-UNIT-336: PROVIDER_CAPABILITIES — azure-openai supportsTools: true
 * NF-UNIT-337: PROVIDER_CAPABILITIES — ollama supportsTools: false
 * NF-UNIT-338: PROVIDER_CAPABILITIES — self-hosted supportsTools: false
 * NF-UNIT-339: getProviderCapabilities — unknown provider defaults to supportsTools: true
 *
 * NF-UNIT-360: getLlmProviderForProduct — DB google product returns supportsTools: true
 * NF-UNIT-361: getLlmProviderForProduct — DB ollama product returns supportsTools: false
 * NF-UNIT-362: getLlmProviderForProduct — DB self-hosted product returns supportsTools: false
 * NF-UNIT-363: getLlmProviderForProduct — env fallback returns supportsTools based on env provider
 *
 * No real DB or LLM connections — all external modules are mocked.
 */

import { vi } from "vitest"

// ── Hoisted mock references ───────────────────────────────────────────────────

const {
  mockOpenAIChat,
  mockOpenAIFactory,
  mockCreateOpenAI,
  mockAnthropicFactory,
  mockCreateAnthropic,
  mockGoogleFactory,
  mockCreateGoogle,
  mockOllamaFactory,
  mockCreateOllama,
} = vi.hoisted(() => {
  const mockOpenAIChat    = vi.fn().mockReturnValue("openai-chat-model-instance")
  const mockOpenAIFactory = Object.assign(
    vi.fn().mockReturnValue("openai-default-model-instance"),
    { chat: mockOpenAIChat },
  )
  const mockCreateOpenAI     = vi.fn().mockReturnValue(mockOpenAIFactory)
  const mockAnthropicFactory = vi.fn().mockReturnValue("anthropic-model-instance")
  const mockCreateAnthropic  = vi.fn().mockReturnValue(mockAnthropicFactory)
  const mockGoogleFactory    = vi.fn().mockReturnValue("google-model-instance")
  const mockCreateGoogle     = vi.fn().mockReturnValue(mockGoogleFactory)
  const mockOllamaFactory    = vi.fn().mockReturnValue("ollama-model-instance")
  const mockCreateOllama     = vi.fn().mockReturnValue(mockOllamaFactory)
  return {
    mockOpenAIChat,
    mockOpenAIFactory,
    mockCreateOpenAI,
    mockAnthropicFactory,
    mockCreateAnthropic,
    mockGoogleFactory,
    mockCreateGoogle,
    mockOllamaFactory,
    mockCreateOllama,
  }
})

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}))

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}))

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mockCreateGoogle,
}))

vi.mock("ollama-ai-provider", () => ({
  createOllama: mockCreateOllama,
}))

vi.mock("../../../src/infra/db/repositories/products.js", () => ({
  findProductById: vi.fn(),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    LLM_PROVIDER: "openai",
    LLM_MODEL:    "gpt-4",
    LLM_API_KEY:  "test-key",
    LLM_BASE_URL: undefined,
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest"
import {
  getLlmProvider,
  getLlmProviderForProduct,
  PROVIDER_CAPABILITIES,
  getProviderCapabilities,
} from "../../../src/agents/llm-provider.js"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOllama } from "ollama-ai-provider"
import { findProductById } from "../../../src/infra/db/repositories/products.js"
import { logger } from "../../../src/shared/logger.js"
import { config } from "../../../src/shared/config.js"
import type { ProductRow } from "../../../src/infra/db/repositories/products.js"

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockCreateOpenAIFn    = vi.mocked(createOpenAI)
const mockCreateAnthropicFn = vi.mocked(createAnthropic)
const mockCreateGoogleFn    = vi.mocked(createGoogleGenerativeAI)
const mockCreateOllamaFn    = vi.mocked(createOllama)
const mockFindProductById   = vi.mocked(findProductById)
const mockLoggerWarn        = vi.mocked(logger.warn)

// ── Product row factory ───────────────────────────────────────────────────────

function makeProductRow(overrides: {
  llm_config?: Record<string, unknown>
  agent_config?: Record<string, unknown>
}): ProductRow {
  return {
    product_id:       "prod_test",
    slug:             "test-product",
    name:             "Test Product",
    stage:            "production",
    support_policy:   {},
    enabled_channels: [],
    lead_assignments: {},
    llm_config:       overrides.llm_config ?? {},
    agent_config:     overrides.agent_config ?? {},
    ci_config:        {},
    created_at:       new Date("2026-01-01"),
    updated_at:       new Date("2026-01-01"),
  }
}

function resetMocks() {
  vi.clearAllMocks()
  mockOpenAIChat.mockReturnValue("openai-chat-model-instance")
  mockOpenAIFactory.mockReturnValue("openai-default-model-instance")
  mockCreateOpenAIFn.mockReturnValue(mockOpenAIFactory as any)
  mockAnthropicFactory.mockReturnValue("anthropic-model-instance")
  mockCreateAnthropicFn.mockReturnValue(mockAnthropicFactory as any)
  mockGoogleFactory.mockReturnValue("google-model-instance")
  mockCreateGoogleFn.mockReturnValue(mockGoogleFactory as any)
  mockOllamaFactory.mockReturnValue("ollama-model-instance")
  mockCreateOllamaFn.mockReturnValue(mockOllamaFactory as any)
}

// ── getLlmProvider() — env-based provider selection ───────────────────────────

describe("getLlmProvider() — env-based provider selection", () => {
  beforeEach(resetMocks)

  // NF-UNIT-320 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-320: openai provider — createOpenAI called with apiKey", () => {
    getLlmProvider({ ...config, LLM_PROVIDER: "openai", LLM_API_KEY: "sk-test", LLM_BASE_URL: undefined })

    expect(mockCreateOpenAIFn).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-test" }),
    )
  })

  it("NF-UNIT-320 (variant): openai without baseUrl calls factory(modelName) not .chat()", () => {
    getLlmProvider({ ...config, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o", LLM_BASE_URL: undefined })

    expect(mockOpenAIFactory).toHaveBeenCalledWith("gpt-4o")
    expect(mockOpenAIChat).not.toHaveBeenCalled()
  })

  // NF-UNIT-321 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-321: openai with baseUrl — uses .chat(modelName) instead of factory(modelName)", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "openai",
      LLM_MODEL:    "my-custom-model",
      LLM_BASE_URL: "https://my-proxy.example.com/v1",
    })

    expect(mockOpenAIChat).toHaveBeenCalledWith("my-custom-model")
    expect(mockOpenAIFactory).not.toHaveBeenCalled()
  })

  it("NF-UNIT-321 (azure-openai): azure-openai with baseUrl also uses .chat()", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "azure-openai",
      LLM_MODEL:    "gpt-4",
      LLM_BASE_URL: "https://my-azure.openai.azure.com/",
    })

    expect(mockOpenAIChat).toHaveBeenCalledWith("gpt-4")
  })

  // NF-UNIT-322 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-322: anthropic provider — createAnthropic called with apiKey", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "anthropic",
      LLM_MODEL:    "claude-3-5-sonnet-20241022",
      LLM_API_KEY:  "ant-key",
      LLM_BASE_URL: undefined,
    })

    expect(mockCreateAnthropicFn).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "ant-key" }),
    )
    expect(mockAnthropicFactory).toHaveBeenCalledWith("claude-3-5-sonnet-20241022")
  })

  // NF-UNIT-323 — Google now uses native @ai-sdk/google (not OpenAI compat) ───

  it("NF-UNIT-323: google provider — uses createGoogleGenerativeAI (native SDK, NOT createOpenAI)", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "google",
      LLM_MODEL:    "gemini-2.0-flash",
      LLM_API_KEY:  "ggl-key",
      LLM_BASE_URL: undefined,
    })

    expect(mockCreateGoogleFn).toHaveBeenCalled()
    expect(mockCreateOpenAIFn).not.toHaveBeenCalled()
    expect(mockGoogleFactory).toHaveBeenCalledWith("gemini-2.0-flash")
  })

  it("NF-UNIT-323 (apiKey): google provider passes apiKey to createGoogleGenerativeAI", () => {
    getLlmProvider({ ...config, LLM_PROVIDER: "google", LLM_MODEL: "gemini-2.0-flash", LLM_API_KEY: "ggl-key" })

    expect(mockCreateGoogleFn).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "ggl-key" }),
    )
  })

  // NF-UNIT-324 — native Google SDK respects LLM_BASE_URL (Vertex AI / custom proxy) ─

  it("NF-UNIT-324: google provider — passes LLM_BASE_URL to createGoogleGenerativeAI when set", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "google",
      LLM_MODEL:    "gemini-2.0-flash",
      LLM_BASE_URL: "https://my-vertex-proxy.example.com",
    })

    expect(mockCreateGoogleFn).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://my-vertex-proxy.example.com" }),
    )
  })

  it("NF-UNIT-324 (no baseUrl): google provider does NOT include baseURL when LLM_BASE_URL is unset", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "google",
      LLM_MODEL:    "gemini-2.0-flash",
      LLM_BASE_URL: undefined,
    })

    const callArg = mockCreateGoogleFn.mock.calls[0][0] as Record<string, unknown> | undefined
    expect(callArg?.baseURL).toBeUndefined()
  })

  // NF-UNIT-325 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-325: ollama provider — createOllama called", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "ollama",
      LLM_MODEL:    "llama3.2",
      LLM_BASE_URL: "http://localhost:11434",
    })

    expect(mockCreateOllamaFn).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:11434" }),
    )
    expect(mockOllamaFactory).toHaveBeenCalledWith("llama3.2")
  })

  it("NF-UNIT-325 (self-hosted alias): self-hosted provider also uses createOllama", () => {
    getLlmProvider({
      ...config,
      LLM_PROVIDER: "self-hosted",
      LLM_MODEL:    "mistral-7b",
      LLM_BASE_URL: "http://my-server:11434",
    })

    expect(mockCreateOllamaFn).toHaveBeenCalled()
    expect(mockOllamaFactory).toHaveBeenCalledWith("mistral-7b")
  })

  // NF-UNIT-326 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-326: unsupported provider throws Error with provider name", () => {
    expect(() =>
      getLlmProvider({ ...config, LLM_PROVIDER: "foobar" as any, LLM_MODEL: "some-model" }),
    ).toThrow("Unsupported LLM provider: foobar")
  })

  it("NF-UNIT-326 (variant): error message identifies the unsupported provider", () => {
    expect(() =>
      getLlmProvider({ ...config, LLM_PROVIDER: "cohere" as any }),
    ).toThrow(/Unsupported LLM provider/)
  })
})

// ── getLlmProviderForProduct() — DB-based provider selection ──────────────────

describe("getLlmProviderForProduct() — DB-based with env fallback", () => {
  beforeEach(resetMocks)

  // NF-UNIT-327 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-327: loads from DB when product has llm_config with provider and model", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "db-ant-key" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_test", "triage")

    expect(result.source).toBe("db")
    expect(mockCreateAnthropicFn).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "db-ant-key" }),
    )
  })

  it("NF-UNIT-327 (variant): DB model is returned as the model field", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config: { provider: "anthropic", model: "claude-3-5-haiku-20241022", apiKey: "db-key" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_test", "triage")

    expect(result.model).toBeDefined()
    expect(result.source).toBe("db")
  })

  // NF-UNIT-328 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-328: falls back to env when product not found in DB", async () => {
    mockFindProductById.mockResolvedValue(null)

    const result = await getLlmProviderForProduct("prod_missing", "triage")

    expect(result.source).toBe("env")
    // Env config has LLM_PROVIDER: "openai" — verify openai factory was used
    expect(mockCreateOpenAIFn).toHaveBeenCalled()
  })

  it("NF-UNIT-328 (variant): env fallback tone defaults to formal", async () => {
    mockFindProductById.mockResolvedValue(null)

    const result = await getLlmProviderForProduct("prod_missing", "triage")

    expect(result.tone).toBe("formal")
  })

  // NF-UNIT-329 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-329: falls back to env when product exists but llm_config has no provider", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { someOtherKey: "value" } }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.source).toBe("env")
  })

  it("NF-UNIT-329 (no model): falls back to env when llm_config has provider but no model", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "openai" } }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.source).toBe("env")
  })

  it("NF-UNIT-329 (empty config): falls back to env when llm_config is empty object", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: {} }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.source).toBe("env")
  })

  // NF-UNIT-330 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-330: extracts tone from agent_config when set", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config:   { provider: "openai", model: "gpt-4o", apiKey: "sk-db-key" },
        agent_config: { tone: "friendly" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.tone).toBe("friendly")
    expect(result.source).toBe("db")
  })

  it("NF-UNIT-330 (technical tone): extracts technical tone from agent_config", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config:   { provider: "openai", model: "gpt-4o", apiKey: "sk-key" },
        agent_config: { tone: "technical" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.tone).toBe("technical")
  })

  // NF-UNIT-331 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-331: defaults tone to formal when agent_config has no tone field", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config:   { provider: "openai", model: "gpt-4o", apiKey: "sk-key" },
        agent_config: { someOtherSetting: true },
      }),
    )

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.tone).toBe("formal")
  })

  it("NF-UNIT-331 (null agent_config): defaults tone to formal when agent_config is null", async () => {
    const row = makeProductRow({
      llm_config: { provider: "openai", model: "gpt-4o", apiKey: "sk-key" },
    })
    ;(row as any).agent_config = null

    mockFindProductById.mockResolvedValue(row)

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.tone).toBe("formal")
  })

  // NF-UNIT-332 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-332: catches DB errors and falls back to env config", async () => {
    mockFindProductById.mockRejectedValue(new Error("DB connection timeout"))

    const result = await getLlmProviderForProduct("prod_any", "triage")

    expect(result.source).toBe("env")
    expect(result.tone).toBe("formal")
  })

  it("NF-UNIT-332 (variant): DB error is logged as a warning before fallback", async () => {
    mockFindProductById.mockRejectedValue(new Error("ECONNREFUSED"))

    await getLlmProviderForProduct("prod_db_error_log", "triage")

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "prod_db_error_log" }),
      expect.stringContaining("falling back to env"),
    )
  })

  it("NF-UNIT-332 (variant): env model is returned on DB error (no throw)", async () => {
    mockFindProductById.mockRejectedValue(new Error("timeout"))

    await expect(getLlmProviderForProduct("prod_db_error_no_throw", "triage")).resolves.toMatchObject({
      source: "env",
      model:  expect.anything(),
    })
  })
})

// ── outputBudgetMultiplier ─────────────────────────────────────────────────────

describe("outputBudgetMultiplier — provider-aware verbosity headroom", () => {
  beforeEach(resetMocks)

  it("NF-UNIT-344: DB path — google product returns outputBudgetMultiplier 1.5", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config: { provider: "google", model: "gemini-2.5-flash", apiKey: "ggl-key" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_google_db", "triage")

    expect(result.source).toBe("db")
    expect(result.outputBudgetMultiplier).toBe(1.5)
  })

  it("NF-UNIT-345: DB path — anthropic product returns outputBudgetMultiplier 1.0", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({
        llm_config: { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "ant-key" },
      }),
    )

    const result = await getLlmProviderForProduct("prod_anthropic_db", "triage")

    expect(result.outputBudgetMultiplier).toBe(1.0)
  })

  it("NF-UNIT-345 (openai): DB path — openai product returns outputBudgetMultiplier 1.0", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "openai", model: "gpt-4o", apiKey: "sk-key" } }),
    )

    const result = await getLlmProviderForProduct("prod_openai_db", "triage")

    expect(result.outputBudgetMultiplier).toBe(1.0)
  })

  it("NF-UNIT-346: multiplier differs between google and anthropic DB configs", async () => {
    mockFindProductById
      .mockResolvedValueOnce(
        makeProductRow({ llm_config: { provider: "google", model: "gemini-2.5-flash", apiKey: "ggl" } }),
      )
      .mockResolvedValueOnce(
        makeProductRow({ llm_config: { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "ant" } }),
      )

    const google    = await getLlmProviderForProduct("prod_a", "triage")
    const anthropic = await getLlmProviderForProduct("prod_b", "triage")

    expect(google.outputBudgetMultiplier).toBeGreaterThan(anthropic.outputBudgetMultiplier)
    expect(google.outputBudgetMultiplier).toBe(1.5)
    expect(anthropic.outputBudgetMultiplier).toBe(1.0)
  })
})

// ── PROVIDER_CAPABILITIES registry ────────────────────────────────────────────
//
// NF-UNIT-333 .. NF-UNIT-339: static capability map and getProviderCapabilities().

describe("PROVIDER_CAPABILITIES registry", () => {
  // NF-UNIT-333 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-333: openai supportsTools: true", () => {
    expect(PROVIDER_CAPABILITIES["openai"].supportsTools).toBe(true)
  })

  // NF-UNIT-334 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-334: anthropic supportsTools: true", () => {
    expect(PROVIDER_CAPABILITIES["anthropic"].supportsTools).toBe(true)
  })

  // NF-UNIT-335 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-335: google supportsTools: true", () => {
    expect(PROVIDER_CAPABILITIES["google"].supportsTools).toBe(true)
  })

  // NF-UNIT-336 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-336: azure-openai supportsTools: true", () => {
    expect(PROVIDER_CAPABILITIES["azure-openai"].supportsTools).toBe(true)
  })

  // NF-UNIT-337 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-337: ollama supportsTools: false (model-dependent, safe default)", () => {
    expect(PROVIDER_CAPABILITIES["ollama"].supportsTools).toBe(false)
  })

  // NF-UNIT-338 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-338: self-hosted supportsTools: false (model-dependent, safe default)", () => {
    expect(PROVIDER_CAPABILITIES["self-hosted"].supportsTools).toBe(false)
  })

  // NF-UNIT-339 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-339: getProviderCapabilities — unknown provider defaults to supportsTools: true", () => {
    expect(getProviderCapabilities("some-future-provider").supportsTools).toBe(true)
    expect(getProviderCapabilities("").supportsTools).toBe(true)
  })

  it("NF-UNIT-339 (variant): getProviderCapabilities returns same as PROVIDER_CAPABILITIES for known providers", () => {
    for (const [provider, caps] of Object.entries(PROVIDER_CAPABILITIES)) {
      expect(getProviderCapabilities(provider)).toEqual(caps)
    }
  })
})

// ── supportsTools in ProductLlmContext ────────────────────────────────────────
//
// NF-UNIT-360 .. NF-UNIT-363

describe("ProductLlmContext.supportsTools — derived from provider capabilities", () => {
  beforeEach(resetMocks)

  // NF-UNIT-360 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-360: DB google product returns supportsTools: true", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "google", model: "gemini-2.0-flash", apiKey: "g-key" } }),
    )

    const result = await getLlmProviderForProduct("prod_g", "triage")

    expect(result.supportsTools).toBe(true)
  })

  // NF-UNIT-361 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-361: DB ollama product returns supportsTools: false", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "ollama", model: "llama3.2", apiKey: "" } }),
    )

    const result = await getLlmProviderForProduct("prod_ollama", "triage")

    expect(result.supportsTools).toBe(false)
  })

  // NF-UNIT-362 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-362: DB self-hosted product returns supportsTools: false", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "self-hosted", model: "mistral-7b", apiKey: "" } }),
    )

    const result = await getLlmProviderForProduct("prod_sh", "pr_draft_prep")

    expect(result.supportsTools).toBe(false)
  })

  // NF-UNIT-363 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-363: env fallback returns supportsTools based on env provider (openai → true)", async () => {
    mockFindProductById.mockResolvedValue(null)
    // Env mock config has LLM_PROVIDER: "openai"

    const result = await getLlmProviderForProduct("prod_env", "triage")

    expect(result.source).toBe("env")
    expect(result.supportsTools).toBe(true)
  })

  it("NF-UNIT-363 (anthropic): DB anthropic product returns supportsTools: true", async () => {
    mockFindProductById.mockResolvedValue(
      makeProductRow({ llm_config: { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "a-key" } }),
    )

    const result = await getLlmProviderForProduct("prod_ant", "triage")

    expect(result.supportsTools).toBe(true)
  })
})
