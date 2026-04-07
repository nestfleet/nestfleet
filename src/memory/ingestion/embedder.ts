/**
 * Embedding API client — SLICE-11 update.
 * ADR-017: customer-configured LLM/embedding provider.
 *
 * Supports OpenAI-compatible (default) and Ollama for embeddings.
 * Reads embedding config from product.llm_config first, falls back to env vars.
 */

import { config as envConfig } from "../../shared/config.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { logger } from "../../shared/logger.js"

const BATCH_SIZE = 100

export interface EmbedResult {
  embedding: number[]
  tokenCount: number
}

/** Resolved embedding configuration. */
interface EmbeddingConfig {
  provider: "openai" | "ollama"
  apiKey: string | undefined
  model: string
  dimensions: number
  baseUrl: string | undefined
}

/**
 * Resolve embedding config: product DB → env vars fallback.
 */
async function resolveEmbeddingConfig(productId?: string): Promise<EmbeddingConfig> {
  if (productId) {
    try {
      const product = await findProductById(productId)
      const llm = product?.llm_config as Record<string, unknown> | null
      if (llm?.provider && llm?.embeddingModel) {
        // Map provider to embedding provider type
        const provider = llm.provider as string
        const embProvider: "openai" | "ollama" =
          (provider === "self-hosted" || provider === "ollama") ? "ollama" : "openai"

        return {
          provider: embProvider,
          apiKey: (llm.apiKey as string | undefined) ?? envConfig.EMBEDDING_API_KEY,
          model: llm.embeddingModel as string,
          dimensions: (llm.embeddingDimensions as number | undefined) ?? envConfig.EMBEDDING_DIMENSIONS,
          baseUrl: (llm.baseUrl as string | undefined) ?? envConfig.EMBEDDING_BASE_URL,
        }
      }
    } catch (err) {
      logger.warn({ err, productId }, "Failed to load product embedding config — falling back to env")
    }
  }

  // Fallback to env vars
  return {
    provider: envConfig.EMBEDDING_PROVIDER,
    apiKey: envConfig.EMBEDDING_API_KEY,
    model: envConfig.EMBEDDING_MODEL,
    dimensions: envConfig.EMBEDDING_DIMENSIONS,
    baseUrl: envConfig.EMBEDDING_BASE_URL,
  }
}

/**
 * Embed a single text. Returns the embedding vector and token count.
 */
export async function embedText(text: string, productId?: string): Promise<EmbedResult> {
  const results = await embedBatch([text], productId)
  const first = results[0]
  if (!first) throw new Error("Embedder returned empty result for single text")
  return first
}

/**
 * Embed a batch of texts. Automatically chunks into provider batch limits.
 * Returns results in the same order as inputs.
 */
export async function embedBatch(texts: string[], productId?: string): Promise<EmbedResult[]> {
  if (texts.length === 0) return []

  const cfg = await resolveEmbeddingConfig(productId)
  const results: EmbedResult[] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    if (cfg.provider === "openai") {
      results.push(...await embedOpenAI(batch, cfg))
    } else if (cfg.provider === "ollama") {
      results.push(...await embedOllama(batch, cfg))
    } else {
      throw new Error(`Unsupported embedding provider: ${cfg.provider}`)
    }
  }

  return results
}

async function embedOpenAI(texts: string[], cfg: EmbeddingConfig): Promise<EmbedResult[]> {
  if (!cfg.apiKey) throw new Error("Embedding API key is required for OpenAI embeddings")

  const baseUrl = cfg.baseUrl ?? "https://api.openai.com"
  const url = `${baseUrl}/v1/embeddings`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: texts,
      dimensions: cfg.dimensions,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI embedding API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>
    usage?: { prompt_tokens?: number; total_tokens?: number }
  }

  const sorted = data.data.sort((a, b) => a.index - b.index)
  const totalTokens = data.usage?.total_tokens ?? 0
  const tokensPerItem = totalTokens > 0 ? Math.round(totalTokens / texts.length) : 0

  logger.debug({ count: texts.length, totalTokens, model: cfg.model }, "Embedded batch via OpenAI")

  return sorted.map((item) => ({
    embedding: item.embedding,
    tokenCount: tokensPerItem,
  }))
}

async function embedOllama(texts: string[], cfg: EmbeddingConfig): Promise<EmbedResult[]> {
  const baseUrl = cfg.baseUrl ?? "http://localhost:11434"
  const results: EmbedResult[] = []

  for (const text of texts) {
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, input: text }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Ollama embedding API error ${res.status}: ${body}`)
    }

    const data = (await res.json()) as { embeddings: number[][] }
    const embedding = data.embeddings[0]
    if (!embedding) throw new Error("Ollama returned empty embedding")

    results.push({ embedding, tokenCount: 0 })
  }

  return results
}
