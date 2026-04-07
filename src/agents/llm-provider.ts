/**
 * LLM provider factory — AE-01 + SLICE-11.
 * ADR-022: Vercel AI SDK, provider selected at runtime from config.
 * ADR-017: customer-provided LLM; NestFleet does not proxy model calls.
 *
 * Two modes:
 *   1. getLlmProvider(config)  — env-based (legacy, used as fallback)
 *   2. getLlmProviderForProduct(productId) — reads product.llm_config from DB first,
 *      falls back to env vars if not configured. Also returns the tone setting.
 *
 * Provider capability registry:
 *   PROVIDER_CAPABILITIES maps each provider to its feature flags.
 *   The key flag is `supportsTools`: when false, runAgent() automatically
 *   overrides two-phase agents to single-phase (no tool calls), preventing
 *   cryptic 400 errors from models that don't support function calling.
 */

import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOllama } from "ollama-ai-provider"
import type { LanguageModel } from "ai"
import type { Config } from "../shared/config.js"
import { config as envConfig } from "../shared/config.js"
import { findProductById } from "../infra/db/repositories/products.js"
import { decryptSecret } from "../shared/crypto.js"
import { logger } from "../shared/logger.js"
import type { ActionType } from "./types.js"

// ── Provider capability registry ──────────────────────────────────────────────
//
// Maps provider name → capability flags used by runAgent() to choose the
// right execution strategy without trial-and-error against the LLM API.
//
// supportsTools: whether the provider reliably supports function/tool calling.
//   - false: runAgent() overrides two-phase agents to single-phase, skipping
//     the generateText tool-call step. Agents still produce structured output
//     (via prompt-embedded schema), just without RAG lookups.
//   - "self-hosted" and "ollama" default to false because tool support is
//     model-dependent (llama3.1+ supports it, older models don't). Operators
//     who run a known-capable model can override this per-product via the
//     Console once we expose a manual override — see DEFERRED-26.

export interface ProviderCapabilities {
  /** Whether this provider reliably supports function/tool calling. */
  supportsTools: boolean
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  openai:         { supportsTools: true },
  "azure-openai": { supportsTools: true },
  anthropic:      { supportsTools: true },
  google:         { supportsTools: true },
  ollama:         { supportsTools: false },
  "self-hosted":  { supportsTools: false },
}

/**
 * Return capabilities for a provider, defaulting to supportsTools: true for
 * unknown providers so new officially-supported providers work out of the box.
 */
export function getProviderCapabilities(provider: string): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider] ?? { supportsTools: true }
}

export interface ProductLlmContext {
  model: LanguageModel
  tone: "formal" | "friendly" | "technical"
  /** Source: "db" if loaded from product settings, "env" if from env vars */
  source: "db" | "env"
  /**
   * Multiplier applied to maxOutputTokens for every agent call.
   * Google/Gemini models produce more verbose structured output → 1.5×.
   * All other providers → 1.0× (no change).
   * Used by runAgent() for both the initial call and the retry budget.
   */
  outputBudgetMultiplier: number
  /**
   * Whether the configured provider reliably supports function/tool calling.
   * Derived from PROVIDER_CAPABILITIES[provider].supportsTools.
   * When false, runAgent() overrides two-phase agents to single-phase so
   * tool-calling is skipped rather than producing a 400 from the API.
   */
  supportsTools: boolean
}

// ── Per-provider output budget multipliers ────────────────────────────────────
//
// Google/Gemini produces more chain-of-thought before emitting JSON, consuming
// more output tokens than Anthropic/OpenAI for equivalent schemas. 1.5× gives
// enough headroom without bloating budgets for efficient providers.

const OUTPUT_BUDGET_MULTIPLIERS: Partial<Record<string, number>> = {
  google: 1.5,
}

function providerMultiplier(provider: string): number {
  return OUTPUT_BUDGET_MULTIPLIERS[provider] ?? 1.0
}

// ── Action-type → model tier ──────────────────────────────────────────────────
//
// fast    → single-phase, tight SLO (15–90s), classification tasks
//           Uses LLM_MODEL_FAST (default: claude-3-5-haiku-20241022)
// standard → medium complexity, customer-facing text generation
//           Uses LLM_MODEL (default: claude-sonnet-4-6)
// complex → two-phase, document generation, longest token budgets
//           Uses LLM_MODEL_COMPLEX (default: claude-sonnet-4-6)

const ACTION_TIERS: Record<ActionType, "fast" | "standard" | "complex"> = {
  triage:            "fast",
  known_issue_match: "fast",
  outage_routing:    "fast",
  auto_reply:        "standard",
  knowledge_capture: "standard",
  change_prep:       "complex",
  pr_draft_prep:     "complex",
}

function resolveEnvModel(actionType: ActionType): string {
  const tier = ACTION_TIERS[actionType]
  if (tier === "fast"    && envConfig.LLM_MODEL_FAST)    return envConfig.LLM_MODEL_FAST
  if (tier === "complex" && envConfig.LLM_MODEL_COMPLEX) return envConfig.LLM_MODEL_COMPLEX
  return envConfig.LLM_MODEL
}

/**
 * Build a LanguageModel from explicit params (provider, model, apiKey, baseUrl).
 */
function buildModel(
  provider: string,
  modelName: string,
  apiKey: string | undefined,
  baseUrl: string | undefined,
): LanguageModel {
  switch (provider) {
    case "openai":
    case "azure-openai": {
      const opts: Parameters<typeof createOpenAI>[0] = {}
      if (apiKey) opts.apiKey = apiKey
      if (baseUrl) opts.baseURL = baseUrl
      const p = createOpenAI(opts)
      return baseUrl ? p.chat(modelName) : p(modelName)
    }

    case "anthropic": {
      const opts: Parameters<typeof createAnthropic>[0] = {}
      if (apiKey) opts.apiKey = apiKey
      if (baseUrl) opts.baseURL = baseUrl
      return createAnthropic(opts)(modelName)
    }

    case "google": {
      // Native Gemini SDK — translates tool schemas and structured output to
      // Gemini's API format internally, eliminating all OpenAI-compat shim quirks.
      // LLM_BASE_URL is respected for custom endpoints (e.g. Vertex AI proxy).
      const opts: Parameters<typeof createGoogleGenerativeAI>[0] = {
        apiKey: apiKey ?? "",
      }
      if (baseUrl) opts.baseURL = baseUrl
      return createGoogleGenerativeAI(opts)(modelName)
    }

    case "self-hosted":
    case "ollama": {
      const opts: Parameters<typeof createOllama>[0] = {}
      if (baseUrl) opts.baseURL = baseUrl
      return createOllama(opts)(modelName) as unknown as LanguageModel
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

/**
 * Return the LanguageModel for a specific product and action type.
 * Reads product.llm_config from DB. Falls back to env vars if not configured.
 * When using env vars, the model is selected by action-type tier:
 *   fast    → LLM_MODEL_FAST  (triage, known_issue_match, outage_routing)
 *   standard → LLM_MODEL      (auto_reply, knowledge_capture)
 *   complex → LLM_MODEL_COMPLEX (change_prep, pr_draft_prep)
 * Also returns the tone setting from agent_config.
 */
export async function getLlmProviderForProduct(
  productId: string,
  actionType: ActionType,
): Promise<ProductLlmContext> {
  try {
    const product = await findProductById(productId)

    if (product) {
      const llm = product.llm_config as Record<string, unknown> | null
      const agentCfg = product.agent_config as Record<string, unknown> | null

      const provider = llm?.provider as string | undefined
      const modelName = llm?.model as string | undefined
      const rawApiKey = llm?.apiKey as string | undefined
      // decryptSecret handles: enc:... → decrypts; plaintext → pass-through; null/undefined → unchanged
      const apiKey = decryptSecret(rawApiKey) ?? undefined
      const baseUrl = llm?.baseUrl as string | undefined
      const tone = (agentCfg?.tone as string | undefined) ?? "formal"

      if (provider && modelName) {
        const capabilities = getProviderCapabilities(provider)
        logger.debug(
          { productId, provider, model: modelName, actionType, source: "db", supportsTools: capabilities.supportsTools },
          "LLM provider from product settings",
        )
        return {
          model: buildModel(provider, modelName, apiKey, baseUrl),
          tone: tone as "formal" | "friendly" | "technical",
          source: "db",
          outputBudgetMultiplier: providerMultiplier(provider),
          supportsTools: capabilities.supportsTools,
        }
      }
    }
  } catch (err) {
    logger.warn({ err, productId }, "Failed to load product LLM config — falling back to env")
  }

  // Fallback to env vars — select model by action-type tier
  const tieredModel = resolveEnvModel(actionType)
  const envProvider = envConfig.LLM_PROVIDER
  const envCapabilities = getProviderCapabilities(envProvider)
  logger.debug(
    { productId, actionType, model: tieredModel, tier: ACTION_TIERS[actionType], source: "env", supportsTools: envCapabilities.supportsTools },
    "LLM provider from env (tiered)",
  )
  return {
    model: buildModel(envProvider, tieredModel, envConfig.LLM_API_KEY, envConfig.LLM_BASE_URL),
    tone: "formal",
    source: "env",
    outputBudgetMultiplier: providerMultiplier(envProvider),
    supportsTools: envCapabilities.supportsTools,
  }
}

/**
 * Return the LanguageModel instance for the configured provider (env-based).
 * Called once per agent invocation (lightweight — no connection opened here).
 */
export function getLlmProvider(config: Config): LanguageModel {
  return buildModel(
    config.LLM_PROVIDER,
    config.LLM_MODEL,
    config.LLM_API_KEY,
    config.LLM_BASE_URL,
  )
}
