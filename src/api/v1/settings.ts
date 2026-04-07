/**
 * Settings API — SLICE-11.
 *
 * Product-level configuration for LLM provider, lead assignments,
 * agent behavior (tone), and notification policy (quiet hours).
 *
 * Routes:
 *   GET  /api/v1/products/:productId/settings            — read current settings
 *   PUT  /api/v1/products/:productId/settings            — update settings
 *   POST /api/v1/products/:productId/settings/test-llm   — test LLM connection
 *
 * Auth: requireAuth — operator or admin role.
 */

import { Hono } from "hono"
import { z } from "zod"
import { randomBytes } from "node:crypto"
import { logger } from "../../shared/logger.js"
import { requireAuth, requireRole } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findProductById, updateProduct } from "../../infra/db/repositories/products.js"
import { getDb } from "../../infra/db/client.js"
import { config } from "../../shared/config.js"
import { encryptSecret, decryptSecret } from "../../shared/crypto.js"

export const settingsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Friendly error messages ──────────────────────────────────────────────────

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

// ── Schemas ──────────────────────────────────────────────────────────────────

const LLM_PROVIDERS = ["openai", "anthropic", "google", "azure-openai", "self-hosted"] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

const LlmConfigSchema = z.object({
  provider: z.enum(LLM_PROVIDERS).optional(),
  model: z.string().optional(),
  /** API key — stored; returned masked (last 4 chars only). */
  apiKey: z.string().optional(),
  /** Base URL for self-hosted / Ollama endpoints (e.g. http://localhost:11434/v1) */
  baseUrl: z.string().url().optional(),
  /** Embedding model — auto-defaulted per provider if not set */
  embeddingModel: z.string().optional(),
  /** Embedding dimensions — auto-defaulted per model */
  embeddingDimensions: z.number().int().min(64).max(3072).optional(),
})

/** Sensible defaults per provider — avoids manual input for embeddings */
const EMBEDDING_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
  openai:        { model: "text-embedding-3-small", dimensions: 768 },
  anthropic:     { model: "text-embedding-3-small", dimensions: 768 }, // Anthropic has no native embeddings — uses OpenAI
  google:        { model: "text-embedding-004",     dimensions: 768 },
  "azure-openai": { model: "text-embedding-3-small", dimensions: 768 },
  "self-hosted":  { model: "nomic-embed-text",       dimensions: 768 },
}

const LeadAssignmentsSchema = z.object({
  support_lead: z.string().email().optional(),
  change_lead: z.string().email().optional(),
  product_lead: z.string().email().optional(),
  knowledge_lead: z.string().email().optional(),
}).strict()

const AgentConfigSchema = z.object({
  tone: z.enum(["formal", "friendly", "technical"]).optional(),
}).strict()

const NotificationPolicySchema = z.object({
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), // "20:00"
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),   // "08:00"
  weekendSuppression: z.boolean().optional(),
  slackWebhookUrl: z.string().url().optional(),  // per-product Slack Incoming Webhook URL (env SLACK_WEBHOOK_URL is fallback)
}).strict()

// SLICE-13: CI integration config schema
const CiConfigSchema = z.object({
  enabled: z.boolean().optional(),
  github_webhook_secret: z.string().optional(),
  auto_complete_on_ci_pass: z.boolean().optional(),
  track_deployments: z.boolean().optional(),
  // DEFERRED-23: outbound GitHub config (PAT + repo) — stored in support_policy, not ci_config
  github_pat: z.string().optional(),   // stored encrypted as support_policy.github_token_enc
  github_repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, "Must be owner/repo format").optional(),
}).strict()

// DEFERRED-05: Chat widget config schema
const ChatConfigSchema = z.object({
  enabled:        z.boolean().optional(),
  welcomeMessage: z.string().max(300).optional(),
  color:          z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color (e.g. #6366f1)").optional(),
}).strict()

// CG-03: Retention policy schema
const RetentionPolicySchema = z.object({
  retentionDays: z.number().int().min(30).max(3650).optional(), // 30 days – 10 years; default 365
  autoCloseDays: z.number().int().min(1).max(365).optional(),   // days after resolved → auto-close; default 7
}).strict()

const UpdateSettingsBodySchema = z.object({
  llm: LlmConfigSchema.optional(),
  leads: LeadAssignmentsSchema.optional(),
  agent: AgentConfigSchema.optional(),
  notifications: NotificationPolicySchema.optional(),
  ci: CiConfigSchema.optional(),
  retention: RetentionPolicySchema.optional(),
  chat: ChatConfigSchema.optional(),
}).strict()

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskApiKey(key: string | undefined): string | null {
  if (!key || key.length < 8) return null
  return `****${key.slice(-4)}`
}

function buildSettingsResponse(product: {
  llm_config: Record<string, unknown>
  agent_config: Record<string, unknown>
  lead_assignments: Record<string, unknown>
  support_policy: Record<string, unknown>
  ci_config: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}) {
  const llm    = product.llm_config    ?? {}
  const agent  = product.agent_config  ?? {}
  const leads  = product.lead_assignments ?? {}
  const policy = product.support_policy ?? {}
  const ci     = product.ci_config     ?? {}

  const llmApiKey          = decryptSecret(llm.apiKey as string | undefined)
  const slackWebhook       = decryptSecret(policy.slackWebhookUrl as string | undefined)
  const ciSecret           = decryptSecret(ci.github_webhook_secret as string | undefined)
  const githubPat          = decryptSecret(policy.github_token_enc as string | undefined)
  const contactFormPubKey  = decryptSecret(policy.contactFormPublicKey as string | undefined)
  const chatPubKey         = decryptSecret(policy.chatPublicKey as string | undefined)

  return {
    llm: {
      provider: llm.provider ?? null,
      model: llm.model ?? null,
      baseUrl: llm.baseUrl ?? null,
      apiKeyLast4: maskApiKey(llmApiKey ?? undefined),
      configured: !!(llm.provider && (llmApiKey || llm.provider === "self-hosted")),
      embeddingModel: llm.embeddingModel ?? EMBEDDING_DEFAULTS[llm.provider as string]?.model ?? null,
      embeddingDimensions: llm.embeddingDimensions ?? EMBEDDING_DEFAULTS[llm.provider as string]?.dimensions ?? 768,
    },
    leads: {
      support_lead: leads.support_lead ?? null,
      change_lead: leads.change_lead ?? null,
      product_lead: leads.product_lead ?? null,
      knowledge_lead: leads.knowledge_lead ?? null,
    },
    agent: {
      tone: agent.tone ?? "formal",
    },
    notifications: {
      quietHoursStart: policy.quietHoursStart ?? "20:00",
      quietHoursEnd: policy.quietHoursEnd ?? "08:00",
      weekendSuppression: policy.weekendSuppression ?? true,
      slackWebhookConfigured: !!(slackWebhook || config.SLACK_WEBHOOK_URL || config.SLACK_BOT_TOKEN),
      slackWebhookLast4: maskApiKey(slackWebhook ?? undefined),
      telegramConfigured: !!(config.TELEGRAM_BOT_TOKEN),
    },
    // SLICE-13 + DEFERRED-23: CI integration
    ci: {
      enabled: ci.enabled !== false,
      webhookConfigured: !!(ciSecret),
      autoCompleteOnCiPass: ci.auto_complete_on_ci_pass === true,
      trackDeployments: ci.track_deployments === true,
      // DEFERRED-23: outbound GitHub — never expose raw token; repo is safe to return
      githubPatConfigured: !!(githubPat),
      githubRepo: (policy.github_repo as string | undefined) ?? null,
    },
    // CG-03: Retention policy — stored in support_policy alongside notification policy
    retention: {
      retentionDays: typeof policy.retentionDays === "number" ? policy.retentionDays : 365,
      autoCloseDays: typeof policy.autoCloseDays === "number" ? policy.autoCloseDays : 7,
    },
    // DEFERRED-13: Contact form public API key
    contactForm: {
      publicKey:     contactFormPubKey ?? null,
      configured:    !!contactFormPubKey,
    },
    // DEFERRED-05: Chat widget config
    chat: {
      enabled:        policy.chatEnabled !== false,
      welcomeMessage: typeof policy.chatWelcomeMessage === "string" ? policy.chatWelcomeMessage : "Hi! How can we help?",
      color:          typeof policy.chatColor === "string" ? policy.chatColor : "#6366f1",
      publicKey:      chatPubKey ?? null,
      configured:     !!chatPubKey,
    },
  }
}

// ── GET /api/v1/products/:productId/settings ─────────────────────────────────

settingsRouter.get("/products/:productId/settings", requireAuth(), requireRole("operator"), async (c) => {
  const productId = c.req.param("productId")

  try {
    const product = await findProductById(productId)
    if (!product) {
      return c.json({ error: "Product not found" }, 404)
    }

    return c.json({ ok: true, data: buildSettingsResponse(product) })
  } catch (err) {
    logger.error({ err, productId }, "Failed to read settings")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── PUT /api/v1/products/:productId/settings ─────────────────────────────────

settingsRouter.put("/products/:productId/settings", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")
  const actor = c.get("user")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = UpdateSettingsBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid settings", details: parsed.error.issues }, 400)
  }

  try {
    const product = await findProductById(productId)
    if (!product) {
      return c.json({ error: "Product not found" }, 404)
    }

    const updates: Record<string, unknown> = {}

    // ── LLM config ────────────────────────────────────────────────────────
    if (parsed.data.llm) {
      const existing = (product.llm_config ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.llm.provider !== undefined) merged.provider = parsed.data.llm.provider
      if (parsed.data.llm.model !== undefined)    merged.model = parsed.data.llm.model
      if (parsed.data.llm.baseUrl !== undefined)             merged.baseUrl = parsed.data.llm.baseUrl
      if (parsed.data.llm.embeddingModel !== undefined)     merged.embeddingModel = parsed.data.llm.embeddingModel
      if (parsed.data.llm.embeddingDimensions !== undefined) merged.embeddingDimensions = parsed.data.llm.embeddingDimensions
      // Auto-set embedding defaults when provider changes and embedding not explicitly set
      if (parsed.data.llm.provider && !parsed.data.llm.embeddingModel && !merged.embeddingModel) {
        const defaults = EMBEDDING_DEFAULTS[parsed.data.llm.provider]
        if (defaults) {
          merged.embeddingModel = defaults.model
          merged.embeddingDimensions = defaults.dimensions
        }
      }
      if (parsed.data.llm.apiKey !== undefined) {
        merged.apiKey = encryptSecret(parsed.data.llm.apiKey)
        merged.apiKeyLast4 = parsed.data.llm.apiKey.slice(-4)   // plain last4 for quick display
      }
      updates.llm_config = merged
    }

    // ── Lead assignments ──────────────────────────────────────────────────
    if (parsed.data.leads) {
      const existing = (product.lead_assignments ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.leads.support_lead !== undefined)   merged.support_lead = parsed.data.leads.support_lead
      if (parsed.data.leads.change_lead !== undefined)    merged.change_lead = parsed.data.leads.change_lead
      if (parsed.data.leads.product_lead !== undefined)   merged.product_lead = parsed.data.leads.product_lead
      if (parsed.data.leads.knowledge_lead !== undefined) merged.knowledge_lead = parsed.data.leads.knowledge_lead
      updates.lead_assignments = merged
    }

    // ── Agent config ──────────────────────────────────────────────────────
    if (parsed.data.agent) {
      const existing = (product.agent_config ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.agent.tone !== undefined) merged.tone = parsed.data.agent.tone
      updates.agent_config = merged
    }

    // ── Notification policy (stored in support_policy) ────────────────────
    if (parsed.data.notifications) {
      const existing = (product.support_policy ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.notifications.quietHoursStart !== undefined) merged.quietHoursStart = parsed.data.notifications.quietHoursStart
      if (parsed.data.notifications.quietHoursEnd !== undefined)   merged.quietHoursEnd = parsed.data.notifications.quietHoursEnd
      if (parsed.data.notifications.weekendSuppression !== undefined) merged.weekendSuppression = parsed.data.notifications.weekendSuppression
      if (parsed.data.notifications.slackWebhookUrl !== undefined)  merged.slackWebhookUrl = encryptSecret(parsed.data.notifications.slackWebhookUrl)
      updates.support_policy = merged
    }

    // ── CI config (SLICE-13) ──────────────────────────────────────────────
    if (parsed.data.ci) {
      const existing = (product.ci_config ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.ci.enabled !== undefined)                merged.enabled = parsed.data.ci.enabled
      if (parsed.data.ci.github_webhook_secret !== undefined)  merged.github_webhook_secret = encryptSecret(parsed.data.ci.github_webhook_secret)
      if (parsed.data.ci.auto_complete_on_ci_pass !== undefined) merged.auto_complete_on_ci_pass = parsed.data.ci.auto_complete_on_ci_pass
      if (parsed.data.ci.track_deployments !== undefined)      merged.track_deployments = parsed.data.ci.track_deployments
      updates.ci_config = merged

      // DEFERRED-23: outbound GitHub config stored in support_policy (not ci_config)
      if (parsed.data.ci.github_pat !== undefined || parsed.data.ci.github_repo !== undefined) {
        const existingPolicy = (updates.support_policy ?? product.support_policy ?? {}) as Record<string, unknown>
        const mergedPolicy = { ...existingPolicy }
        if (parsed.data.ci.github_pat !== undefined)  mergedPolicy.github_token_enc = encryptSecret(parsed.data.ci.github_pat)
        if (parsed.data.ci.github_repo !== undefined) mergedPolicy.github_repo = parsed.data.ci.github_repo
        updates.support_policy = mergedPolicy
      }
    }

    // ── Chat widget config (DEFERRED-05) — stored inside support_policy ──
    if (parsed.data.chat) {
      const existing = (updates.support_policy ?? product.support_policy ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.chat.enabled !== undefined)        merged.chatEnabled = parsed.data.chat.enabled
      if (parsed.data.chat.welcomeMessage !== undefined) merged.chatWelcomeMessage = parsed.data.chat.welcomeMessage
      if (parsed.data.chat.color !== undefined)          merged.chatColor = parsed.data.chat.color
      updates.support_policy = merged
    }

    // ── Retention policy (CG-03) — stored inside support_policy ──────────
    if (parsed.data.retention) {
      const existing = (updates.support_policy ?? product.support_policy ?? {}) as Record<string, unknown>
      const merged = { ...existing }
      if (parsed.data.retention.retentionDays !== undefined) merged.retentionDays = parsed.data.retention.retentionDays
      if (parsed.data.retention.autoCloseDays !== undefined) merged.autoCloseDays = parsed.data.retention.autoCloseDays
      updates.support_policy = merged
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ ok: true, data: buildSettingsResponse(product) })
    }

    const updated = await updateProduct(productId, updates)
    if (!updated) {
      return c.json({ error: "Failed to update settings" }, 500)
    }

    logger.info({ productId, actor: actor.email, sections: Object.keys(updates) }, "Settings updated")
    return c.json({ ok: true, data: buildSettingsResponse(updated) })
  } catch (err) {
    logger.error({ err, productId }, "Failed to update settings")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── POST /api/v1/products/:productId/settings/generate-chat-key ──────────────
// DEFERRED-05: Generate (or regenerate) the chat widget public API key.
// Stored encrypted in support_policy.chatPublicKey.

settingsRouter.post("/products/:productId/settings/generate-chat-key", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")

  const product = await findProductById(productId)
  if (!product) return c.json({ error: "Product not found" }, 404)

  const publicKey = `ch_pub_${randomBytes(32).toString("hex")}`
  const existing  = (product.support_policy ?? {}) as Record<string, unknown>

  await updateProduct(productId, {
    support_policy: { ...existing, chatPublicKey: encryptSecret(publicKey) },
  })

  logger.info({ productId }, "Chat widget public key generated")
  return c.json({ ok: true, publicKey })
})

// ── POST /api/v1/products/:productId/settings/test-llm ──────────────────────

const TestLlmBodySchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().min(1),
  apiKey: z.string().optional().default(""),
  baseUrl: z.string().url().optional(),
}).strict()

settingsRouter.post("/products/:productId/settings/test-llm", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = TestLlmBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  const { provider, model, baseUrl } = parsed.data
  const startMs = Date.now()

  // Fall back to saved API key if none provided in the request
  let apiKey = parsed.data.apiKey
  if (!apiKey) {
    const product = await findProductById(productId)
    // The stored key is encrypted — decrypt before use
    const encryptedKey = (product?.llm_config as Record<string, unknown> | null)?.apiKey as string | undefined
    apiKey = decryptSecret(encryptedKey) ?? ""
  }

  try {
    // Build a minimal test prompt based on provider
    let success = false
    let responseText = ""
    let errorMessage = ""

    if (provider === "self-hosted") {
      // OpenAI-compatible API (Ollama, vLLM, LiteLLM, etc.)
      const endpoint = `${(baseUrl ?? "http://localhost:11434/v1").replace(/\/+$/, "")}/chat/completions`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Say OK" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] }
        responseText = data.choices?.[0]?.message?.content ?? ""
        success = true
      } else {
        errorMessage = `HTTP ${res.status}: ${await res.text().catch(() => "")}`
      }
    } else if (provider === "openai" || provider === "azure-openai") {
      const res = await fetch(
        provider === "azure-openai"
          ? `https://${model}.openai.azure.com/openai/deployments/${model}/chat/completions?api-version=2024-02-01`
          : "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Say OK" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      )
      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] }
        responseText = data.choices?.[0]?.message?.content ?? ""
        success = true
      } else {
        errorMessage = `HTTP ${res.status}: ${await res.text().catch(() => "")}`
      }
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "Say OK" }],
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = await res.json() as { content?: { text?: string }[] }
        responseText = data.content?.[0]?.text ?? ""
        success = true
      } else {
        errorMessage = `HTTP ${res.status}: ${await res.text().catch(() => "")}`
      }
    } else if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Say OK" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      )
      if (res.ok) {
        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
        success = true
      } else {
        errorMessage = `HTTP ${res.status}: ${await res.text().catch(() => "")}`
      }
    }

    const latencyMs = Date.now() - startMs

    logger.info(
      { productId, provider, model, success, latencyMs },
      success ? "LLM connection test passed" : "LLM connection test failed",
    )

    return c.json({
      ok: true,
      data: {
        success,
        provider,
        model,
        latencyMs,
        responsePreview: responseText.slice(0, 50),
        ...(errorMessage ? { error: errorMessage.slice(0, 200) } : {}),
      },
    })
  } catch (err) {
    const latencyMs = Date.now() - startMs
    logger.error({ err, productId, provider, model }, "LLM connection test error")
    return c.json({
      ok: true,
      data: {
        success: false,
        provider,
        model,
        latencyMs,
        error: String(err).slice(0, 200),
      },
    })
  }
})

// ── POST /api/v1/products/:productId/settings/test-slack ─────────────────────
// Sends a test message to Slack using the per-product webhook URL (or env fallback).

settingsRouter.post("/products/:productId/settings/test-slack", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")

  const product = await findProductById(productId)
  if (!product) return c.json({ error: "Product not found" }, 404)

  const policy = (product.support_policy ?? {}) as Record<string, unknown>
  const webhookUrl = decryptSecret(policy.slackWebhookUrl as string | undefined) ?? config.SLACK_WEBHOOK_URL

  if (!webhookUrl && !config.SLACK_BOT_TOKEN) {
    return c.json({ ok: false, error: "Slack is not configured. Add a Webhook URL and save first." }, 400)
  }

  try {
    const { sendSlack } = await import("../../notifications/slack-transport.js")
    const sent = await sendSlack(
      {
        subject: "NestFleet — Test notification",
        text: "✅ Your Slack integration is working. This is a test message from NestFleet.",
      },
      webhookUrl ? { webhookUrl } : undefined,
    )
    if (!sent) return c.json({ ok: false, error: "Slack delivery failed. Check the webhook URL and try again." }, 400)
    return c.json({ ok: true })
  } catch (err) {
    logger.error({ err, productId }, "test-slack failed")
    return c.json({ ok: false, error: "Internal error sending test message" }, 500)
  }
})

// ── POST /api/v1/products/:productId/settings/generate-contact-form-key ───────
// DEFERRED-13: Generate (or regenerate) a contact form public API key for the product.
// Stored encrypted in support_policy.contactFormPublicKey.
// Regenerating invalidates the old key immediately.

settingsRouter.post("/products/:productId/settings/generate-contact-form-key", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")

  const product = await findProductById(productId)
  if (!product) return c.json({ error: "Product not found" }, 404)

  const publicKey = `cf_pub_${randomBytes(32).toString("hex")}`
  const existing  = (product.support_policy ?? {}) as Record<string, unknown>

  await updateProduct(productId, {
    support_policy: { ...existing, contactFormPublicKey: encryptSecret(publicKey) },
  })

  logger.info({ productId }, "Contact form public key generated")
  return c.json({ ok: true, publicKey })
})

// ── POST /api/v1/products/:productId/settings/list-models ────────────────────
// Fetch available models from the provider. Returns model IDs the user can pick.

const ListModelsBodySchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  apiKey: z.string().optional().default(""),
  baseUrl: z.string().url().optional(),
}).strict()

settingsRouter.post("/products/:productId/settings/list-models", requireAuth(), requireRole("admin"), async (c) => {
  const productId = c.req.param("productId")

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = ListModelsBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.issues }, 400)
  }

  const { provider, baseUrl } = parsed.data

  // Fall back to saved API key if none provided in the request
  let apiKey = parsed.data.apiKey
  if (!apiKey) {
    const product = await findProductById(productId)
    // The stored key is encrypted — decrypt before use
    const encryptedKey = (product?.llm_config as Record<string, unknown> | null)?.apiKey as string | undefined
    apiKey = decryptSecret(encryptedKey) ?? ""
  }

  try {
    let models: string[] = []

    // ── Key validation: all cloud providers require a key ─────────────────
    if (provider !== "self-hosted" && !apiKey) {
      return c.json({ ok: false, error: "No API key configured for this provider. Enter a key and try again." }, 400)
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        return c.json({ ok: false, error: friendlyApiError("OpenAI", res.status) }, 400)
      }
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"))
        .sort()

    } else if (provider === "anthropic") {
      // Validate key with a minimal /messages call (Anthropic /models may not exist on all tiers)
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
      if (!testRes.ok) {
        const status = testRes.status
        // 401 = bad key, 403 = no access, 529 = overloaded — anything else is unexpected
        if (status === 401 || status === 403) {
          return c.json({ ok: false, error: friendlyApiError("Anthropic", status) }, 400)
        }
      }
      // Key valid — try /models, fall back to curated list
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const data = await res.json() as { data?: { id: string }[] }
          models = (data.data ?? []).map((m) => m.id).sort()
        }
      } catch { /* fall through to curated */ }
      if (models.length === 0) {
        models = [
          "claude-sonnet-4-6",
          "claude-opus-4-6",
          "claude-haiku-4-5-20251001",
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
      if (!res.ok) {
        return c.json({ ok: false, error: friendlyApiError("Google", res.status) }, 400)
      }
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((n) => n.includes("gemini"))
        .sort()

    } else if (provider === "azure-openai") {
      // Azure requires a deployment-specific endpoint — validate key with a models call
      if (!baseUrl) {
        return c.json({ ok: false, error: "Azure OpenAI requires an endpoint URL. Enter your Azure resource URL." }, 400)
      }
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/openai/models?api-version=2024-02-01`, {
        headers: { "api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        return c.json({ ok: false, error: friendlyApiError("Azure OpenAI", res.status) }, 400)
      }
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? []).map((m) => m.id).sort()
      if (models.length === 0) {
        models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
      }

    } else if (provider === "self-hosted") {
      const base = (baseUrl ?? "http://localhost:11434").replace(/\/+$/, "")

      // 1. Get candidate model names from Ollama /api/tags or OpenAI-compat /v1/models
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
        return c.json({ ok: false, error: "Service is reachable but no models are downloaded. Pull a model first (e.g. `ollama pull llama3`)." }, 400)
      }

      // 2. Probe each candidate with a 1-token request — only list models that respond
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
            signal: AbortSignal.timeout(30_000), // models may need to load into memory
          })

          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return modelName
        }),
      )

      models = probeResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value)
        .sort()

      const failedCount = probeResults.filter((r) => r.status === "rejected").length
      if (models.length === 0) {
        return c.json({
          ok: false,
          error: `${candidates.length} model(s) found but none responded. They may need more memory or may be corrupted. Try \`ollama run <model>\` to diagnose.`,
        }, 400)
      }

      if (failedCount > 0) {
        logger.info(
          { productId, verified: models.length, failed: failedCount, candidates: candidates.length },
          "Self-hosted model probe: some models failed",
        )
      }
    }

    logger.info({ productId, provider, modelCount: models.length }, "Models listed")
    return c.json({ ok: true, data: { provider, models } })

  } catch (err) {
    logger.error({ err, productId, provider }, "Failed to list models")
    return c.json({ ok: false, error: String(err).slice(0, 200) }, 500)
  }
})

// ── GET /api/v1/products/:productId/channels/status ───────────────────────────

type ChannelStatus = "connected" | "no_events" | "not_configured"

interface ChannelInfo {
  status: ChannelStatus
  lastEventAt: string | null
}

const SOURCE_TYPE_MAP: Record<string, string> = {
  email:        "email",
  github:       "github_webhook",
  chat:         "chat",
  contact_form: "contact_form",
  telegram:     "telegram",
  external:     "external",
}

settingsRouter.get("/products/:productId/channels/status", requireAuth(), requireRole("operator"), async (c) => {
  const productId = c.req.param("productId")

  try {
    const product = await findProductById(productId)
    if (!product) {
      return c.json({ error: "Product not found" }, 404)
    }

    const policy = (product.support_policy ?? {}) as Record<string, unknown>
    const ci     = (product.ci_config     ?? {}) as Record<string, unknown>

    // ── Config checks ────────────────────────────────────────────────────────
    const configured: Record<string, boolean> = {
      email:        true,  // auto-provisioned per product
      github:       !!(ci.repoUrl || ci.githubPat || decryptSecret(ci.repoUrl as string | undefined) || decryptSecret(ci.githubPat as string | undefined)),
      chat:         !!decryptSecret(policy.chatPublicKey as string | undefined),
      contact_form: !!decryptSecret(policy.contactFormPublicKey as string | undefined),
      slack:        !!decryptSecret(policy.slackWebhookUrl as string | undefined),
      telegram:     !!(decryptSecret(ci.telegramBotToken as string | undefined) || config.TELEGRAM_BOT_TOKEN),
      external:     !!decryptSecret(policy.externalWebhookApiKey as string | undefined),
    }

    // ── Single query: MAX(created_at) per source_type in last 7 days ─────────
    const db = getDb()
    const rows = await db<{ source_type: string; last_event_at: Date }[]>`
      SELECT source_type, MAX(created_at) AS last_event_at
      FROM signals
      WHERE product_id = ${productId}
        AND created_at > NOW() - INTERVAL '7 days'
        AND source_type IN ('email', 'github_webhook', 'chat', 'contact_form', 'telegram', 'external')
      GROUP BY source_type
    `

    // Build a lookup map: sourceType -> last event timestamp
    const lastEvent = new Map<string, Date>()
    for (const row of rows) {
      lastEvent.set(row.source_type, row.last_event_at)
    }

    // ── Build response for each channel ─────────────────────────────────────
    const channels: Record<string, ChannelInfo> = {}

    for (const [channel, sourceType] of Object.entries(SOURCE_TYPE_MAP)) {
      const last = lastEvent.get(sourceType)
      if (last) {
        channels[channel] = { status: "connected", lastEventAt: last.toISOString() }
      } else if (configured[channel]) {
        channels[channel] = { status: "no_events", lastEventAt: null }
      } else {
        channels[channel] = { status: "not_configured", lastEventAt: null }
      }
    }

    // Slack has no inbound signals — config check only
    channels["slack"] = configured["slack"]
      ? { status: "no_events", lastEventAt: null }
      : { status: "not_configured", lastEventAt: null }

    return c.json({ ok: true, channels })
  } catch (err) {
    logger.error({ err, productId }, "Failed to fetch channel status")
    return c.json({ error: "Internal server error" }, 500)
  }
})
