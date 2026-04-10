/**
 * Setup API — SLICE-12.
 *
 * First-run configuration endpoints — no auth required.
 * Used by the Setup Wizard to detect and complete initial product setup.
 *
 * Routes:
 *   GET  /api/v1/setup/status      — { needsSetup: boolean } — checks if any products exist
 *   POST /api/v1/setup/complete     — creates first product with provided config
 *   POST /api/v1/setup/test-llm     — test LLM connection without a product (wizard step 2)
 *   POST /api/v1/setup/list-models  — list models without a product (wizard step 2)
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { listProducts, createProduct } from "../../infra/db/repositories/products.js"
import { findOperatorUserById, updateOperatorUser } from "../../infra/db/repositories/operator-users.js"
import { encryptSecret } from "../../shared/crypto.js"
import { verifyJwt } from "../../auth/jwt.js"

export const setupRouter = new Hono()

const LLM_PROVIDERS = ["openai", "anthropic", "google", "azure-openai", "self-hosted"] as const
type LlmProvider = (typeof LLM_PROVIDERS)[number]

// ── Helpers ──────────────────────────────────────────────────────────────────

function friendlyApiError(providerName: string, status: number): string {
  switch (status) {
    case 401: return `Invalid API key. Check that your ${providerName} key is correct and active.`
    case 403: return `Access denied. Your ${providerName} key may lack permissions or your account may be restricted.`
    case 402: return `Payment required. Your ${providerName} account may need a billing update.`
    case 404: return `${providerName} endpoint not found. Check your configuration.`
    case 429: return `Rate limited by ${providerName}. Wait a moment and try again.`
    case 500: case 502: case 503:
      return `${providerName} is experiencing issues (HTTP ${status}). Try again in a few minutes.`
    default:
      return `${providerName} returned an unexpected error (HTTP ${status}).`
  }
}

const EMBEDDING_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
  openai:          { model: "text-embedding-3-small", dimensions: 768 },
  anthropic:       { model: "text-embedding-3-small", dimensions: 768 },
  google:          { model: "text-embedding-004",     dimensions: 768 },
  "azure-openai":  { model: "text-embedding-3-small", dimensions: 768 },
  "self-hosted":   { model: "nomic-embed-text",       dimensions: 768 },
}

// ── GET /api/v1/setup/status ─────────────────────────────────────────────────

setupRouter.get("/setup/status", async (c) => {
  try {
    const products = await listProducts()
    return c.json({ ok: true, data: { needsSetup: products.length === 0 } })
  } catch (err) {
    logger.error({ err }, "Failed to check setup status")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/setup/complete ──────────────────────────────────────────────

const SetupCompleteBodySchema = z.object({
  productName: z.string().min(1).max(100),
  llm: z.object({
    provider: z.enum(LLM_PROVIDERS),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }).optional(),
  leads: z.object({
    support_lead: z.string().email().optional(),
    change_lead: z.string().email().optional(),
    product_lead: z.string().email().optional(),
  }).optional(),
  github: z.object({
    repoUrl: z.string().optional(),
    patToken: z.string().optional(),
  }).optional(),
}).strict()

setupRouter.post("/setup/complete", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = SetupCompleteBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid setup data", details: parsed.error.issues }, 400)
  }

  try {
    // Guard: if a product already exists, don't allow re-setup
    const existing = await listProducts()
    if (existing.length > 0) {
      return c.json({ error: "Setup already complete. A product already exists." }, 409)
    }

    const { productName, llm, leads, github } = parsed.data

    // Build llm_config
    const llmConfig: Record<string, unknown> = {}
    if (llm) {
      llmConfig.provider = llm.provider
      llmConfig.model = llm.model
      if (llm.apiKey) {
        llmConfig.apiKey = encryptSecret(llm.apiKey)
        llmConfig.apiKeyLast4 = llm.apiKey.slice(-4)
      }
      if (llm.baseUrl) llmConfig.baseUrl = llm.baseUrl
      // Auto-set embedding defaults
      const embDefaults = EMBEDDING_DEFAULTS[llm.provider]
      if (embDefaults) {
        llmConfig.embeddingModel = embDefaults.model
        llmConfig.embeddingDimensions = embDefaults.dimensions
      }
    }

    // Build lead_assignments
    const leadAssignments: Record<string, unknown> = {}
    if (leads) {
      if (leads.support_lead) leadAssignments.support_lead = leads.support_lead
      if (leads.change_lead)  leadAssignments.change_lead  = leads.change_lead
      if (leads.product_lead) leadAssignments.product_lead = leads.product_lead
    }

    // Build agent_config (GitHub integration stored here for now)
    const agentConfig: Record<string, unknown> = { tone: "formal" }
    if (github?.repoUrl) agentConfig.githubRepoUrl = github.repoUrl
    if (github?.patToken) agentConfig.githubPatToken = github.patToken

    const product = await createProduct({
      name: productName,
      stage: "pre-launch",
      llm_config: llmConfig,
      lead_assignments: leadAssignments,
      agent_config: agentConfig,
      support_policy: {},
      enabled_channels: [],
    })

    logger.info({ productId: product.product_id, productName }, "First-run setup complete — product created")

    // If the caller is authenticated, link the new product to their account so
    // their JWT (on next login) includes the product ID.
    try {
      const authHeader = c.req.header("Authorization")
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
      if (token) {
        const payload = verifyJwt(token)
        const user = await findOperatorUserById(payload.sub)
        if (user) {
          const updated = [...new Set([...(user.product_ids ?? []), product.product_id])]
          await updateOperatorUser(payload.sub, { product_ids: updated })
          logger.info({ userId: payload.sub, productId: product.product_id }, "Product linked to user after setup")
        }
      }
    } catch (err) {
      // Non-fatal — user can still be linked manually or via products API
      logger.warn({ err }, "Could not link product to user after setup (non-fatal)")
    }

    return c.json({
      ok: true,
      data: {
        productId:   product.product_id,
        productSlug: product.slug,
        productName: product.name,
      },
    })
  } catch (err) {
    logger.error({ err }, "Failed to complete setup")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/setup/list-models ────────────────────────────────────────────
// Mirrors the per-product list-models endpoint but works without an existing product.

const ListModelsBodySchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  apiKey: z.string().optional().default(""),
  baseUrl: z.string().url().optional(),
}).strict()

setupRouter.post("/setup/list-models", async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = ListModelsBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  const { provider, baseUrl } = parsed.data
  const apiKey = parsed.data.apiKey ?? ""

  try {
    let models: string[] = []

    if (provider !== "self-hosted" && !apiKey) {
      return c.json({ ok: false, error: "No API key provided for this provider." }, 400)
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return c.json({ ok: false, error: friendlyApiError("OpenAI", res.status) }, 400)
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"))
        .sort()

    } else if (provider === "anthropic") {
      const testRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: "claude-3-5-haiku-20241022", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!testRes.ok && (testRes.status === 401 || testRes.status === 403)) {
        return c.json({ ok: false, error: friendlyApiError("Anthropic", testRes.status) }, 400)
      }
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] }
          models = (data.data ?? []).map((m) => m.id).sort()
        }
      } catch { /* fall through */ }
      if (models.length === 0) {
        models = [
          "claude-sonnet-4-20250514",
          "claude-haiku-4-20250514",
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
        ]
      }

    } else if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(10_000) },
      )
      if (!res.ok) return c.json({ ok: false, error: friendlyApiError("Google", res.status) }, 400)
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((n) => n.includes("gemini"))
        .sort()

    } else if (provider === "azure-openai") {
      if (!baseUrl) return c.json({ ok: false, error: "Azure OpenAI requires an endpoint URL." }, 400)
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/openai/models?api-version=2024-02-01`, {
        headers: { "api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return c.json({ ok: false, error: friendlyApiError("Azure OpenAI", res.status) }, 400)
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? []).map((m) => m.id).sort()
      if (models.length === 0) models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]

    } else if (provider === "self-hosted") {
      const base = (baseUrl ?? "http://localhost:11434").replace(/\/+$/, "")
      let candidates: string[] = []
      let isOllama = false

      try {
        const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5_000) })
        if (tagsRes.ok) {
          isOllama = true
          const tagsData = await tagsRes.json() as { models?: { name?: string; model?: string }[] }
          candidates = (tagsData.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean)
        }
      } catch { /* not Ollama */ }

      if (candidates.length === 0) {
        const endpoint = `${base}${base.includes("/v1") ? "" : "/v1"}/models`
        const headers: Record<string, string> = {}
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`
        try {
          const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(5_000) })
          if (res.ok) {
            const data = await res.json() as { models?: { name?: string; model?: string }[]; data?: { id: string }[] }
            if (data.data) candidates = data.data.map((m) => m.id)
            else if (data.models) candidates = data.models.map((m) => m.name ?? m.model ?? "").filter(Boolean)
          } else {
            return c.json({ ok: false, error: `Could not reach the endpoint at ${base}. Is the service running?` }, 400)
          }
        } catch {
          return c.json({ ok: false, error: `Could not connect to ${base}. Check that the service is running and the URL is correct.` }, 400)
        }
      }

      if (candidates.length === 0) {
        return c.json({ ok: false, error: "Service is reachable but no models are downloaded." }, 400)
      }

      const probeResults = await Promise.allSettled(
        candidates.map(async (modelName) => {
          const probeUrl = isOllama
            ? `${base}/api/generate`
            : `${base}${base.includes("/v1") ? "" : "/v1"}/chat/completions`
          const probeBody = isOllama
            ? JSON.stringify({ model: modelName, prompt: "hi", stream: false, options: { num_predict: 1 } })
            : JSON.stringify({ model: modelName, messages: [{ role: "user", content: "hi" }], max_tokens: 1 })
          const headers: Record<string, string> = { "Content-Type": "application/json" }
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`
          const res = await fetch(probeUrl, {
            method: "POST",
            headers,
            body: probeBody,
            signal: AbortSignal.timeout(30_000),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return modelName
        }),
      )

      models = probeResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value)
        .sort()

      if (models.length === 0) {
        return c.json({ ok: false, error: "Models found but none responded. Try `ollama run <model>` to diagnose." }, 400)
      }
    }

    logger.info({ provider, modelCount: models.length }, "Setup: models listed")
    return c.json({ ok: true, data: { provider, models } })

  } catch (err) {
    logger.error({ err, provider }, "Setup: failed to list models")
    return c.json({ ok: false, error: String(err).slice(0, 200) }, 500)
  }
})
