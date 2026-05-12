// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
import { z } from "zod"

// Docker Compose passes unset optional vars as empty strings — treat "" as undefined.
const optionalUrl = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().url().optional()
)

// z.coerce.boolean() uses Boolean() which treats "false" as true (non-empty string).
// Docker Compose passes ${VAR:-false} as the string "false", so we must handle it explicitly.
// Only the string "true" or boolean true maps to true — everything else is false.
const boolEnv = z.preprocess(
  (v) => v === "true" || v === true,
  z.boolean()
)

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection URL")
    .default("postgresql://nestfleet:nestfleet@localhost:5434/nestfleet"),

  // Logging — case-insensitive to tolerate shell vars like LOG_LEVEL=INFO
  LOG_LEVEL: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(["trace", "debug", "info", "warn", "error"]))
    .default("info"),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  OTEL_SERVICE_NAME: z.string().default("nestfleet"),

  NESTFLEET_LICENSE_KEY: z
    .string()
    .regex(/^nf_lic_[0-9a-f]{32}$/, "Invalid NestFleet license key format")
    .optional(),

  // LLM (customer-provided)
  LLM_PROVIDER: z.enum(["openai", "anthropic", "ollama", "google"]).default("anthropic"),
  LLM_API_KEY: z.string().optional(),
  // Default model — used when LLM_MODEL_FAST / LLM_MODEL_COMPLEX are not set.
  // Also used as the single model when the product DB config overrides provider.
  LLM_MODEL: z.string().default("claude-sonnet-4-6"),
  // Per-tier model overrides. When set, agents are routed by complexity:
  //   fast    → triage, known_issue_match, outage_routing
  //   standard (LLM_MODEL) → auto_reply, knowledge_capture
  //   complex → change_prep, pr_draft_prep
  LLM_MODEL_FAST: z.string().optional(),
  LLM_MODEL_COMPLEX: z.string().optional(),
  LLM_BASE_URL: optionalUrl,

  // Embeddings — may differ from the chat model (e.g. openai for embeddings, anthropic for chat)
  EMBEDDING_PROVIDER: z.enum(["openai", "ollama", "google"]).default("openai"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(3072).default(768),
  EMBEDDING_BASE_URL: optionalUrl,

  // GitHub
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),

  // Email — generic SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  // Postmark (alternative to SMTP_HOST — set one or the other)
  POSTMARK_API_KEY: z.string().optional(),
  // Resend (alternative to SMTP_HOST / POSTMARK_API_KEY — set one)
  RESEND_API_KEY: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Slack
  SLACK_WEBHOOK_URL:      optionalUrl,
  SLACK_BOT_TOKEN:        z.string().optional(),
  SLACK_DEFAULT_CHANNEL:  z.string().optional(),

  // Chat widget (DEFERRED-05)
  CHAT_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // License (SPIKE-08)
  // SEC-C1: No default — a hardcoded fallback lets anyone who reads the source
  // forge valid Scale-tier JWTs on deployments where the operator forgot to set this.
  // In production, LICENSE_SECRET must be set to a random value (≥32 chars).
  // In dev mode (no LICENSE_FILE_PATH set) the value is never read, so it can remain unset.
  LICENSE_FILE_PATH: z.string().optional(),
  LICENSE_SECRET: z.string().min(32, "LICENSE_SECRET must be at least 32 characters").optional(),
  NESTFLEET_CLOUD_URL: optionalUrl.default("https://cloud.nestfleet.dev"),
  // SEC-M4: HMAC secret for verifying signed cloud validate responses.
  // When unset, HMAC verification is skipped (backward-compatible).
  CLOUD_REFRESH_HMAC_SECRET: z.string().min(32, "CLOUD_REFRESH_HMAC_SECRET must be at least 32 characters").optional(),

  // Secret encryption (AES-256-GCM) — 64 hex chars = 32 bytes
  // Generate with: openssl rand -hex 32
  SECRET_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "SECRET_ENCRYPTION_KEY must be 64 lowercase hex chars").optional(),
  // Deprecated alias — use SECRET_ENCRYPTION_KEY instead. Will be removed in v0.2.0.
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "ENCRYPTION_KEY must be 64 lowercase hex chars").optional(),

  // Auth (SPIKE-07)
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  // Operator console (SLICE-08)
  CONSOLE_ORIGIN: optionalUrl,

  // Telemetry (opt-in)
  TELEMETRY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Self-report: stable identifier for this instance (auto-generated UUID if unset)
  INSTANCE_ID: z.string().optional(),
  // Opt-in telemetry ping to NESTFLEET_CLOUD_URL on startup
  TELEMETRY_OPT_IN: boolEnv.default(false),

  // NF-PIVOT: Billing module gate.
  // Set to true only after NF Stripe account is configured.
  BILLING_ENABLED: boolEnv.default(false),

  // Stripe — only required when BILLING_ENABLED=true
  STRIPE_SECRET_KEY:            z.string().optional(),
  STRIPE_WEBHOOK_SECRET:        z.string().optional(),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_ANNUAL:  z.string().optional(),
  STRIPE_PRICE_GROWTH_MONTHLY:  z.string().optional(),
  STRIPE_PRICE_GROWTH_ANNUAL:   z.string().optional(),

  // Public registration — enable for SaaS deployments.
  // Disabled by default; auto-enabled on first run (0 users in DB) for self-hosters.
  // When true: POST /api/v1/auth/register is open to the public.
  REGISTRATION_ENABLED: boolEnv.default(false),

  // Community tier monthly OU cap — applied when no license JWT is present.
  // Set to 0 for unlimited (e.g. local dev, air-gapped installs).
  // Self-hosters can override; SaaS instances always have a license JWT so this is ignored.
  COMMUNITY_OU_LIMIT: z.coerce.number().int().min(0).default(200),

  // Error monitoring (Sentry). When set, uncaught exceptions are sent to Sentry.
  // Get your DSN at sentry.io → Project Settings → Client Keys.
  SENTRY_DSN: optionalUrl,

  // ── SaaS Fleet Provisioning (FEAT-001) ────────────────────────────────────
  // Only required on the main NestFleet instance (nestfleet.dev).
  // Set PROVISIONING_ENABLED=true only after infra setup (NF-OPS-03).
  PROVISIONING_ENABLED: boolEnv.default(false),
  // Hetzner Cloud API token (read-write scope)
  HETZNER_API_TOKEN: z.string().optional(),
  // Pre-created Hetzner firewall ID (see NF-OPS-03 runbook)
  HETZNER_FIREWALL_ID: z.coerce.number().int().positive().optional(),
  // Cloudflare API token (DNS:Edit permission on the zone)
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  // Cloudflare Zone ID for the base domain (find in Cloudflare dashboard → Overview)
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  // Base domain for customer subdomains, e.g. nestfleet.dev → acme.nestfleet.dev
  CUSTOMER_BASE_DOMAIN: z.string().default("nestfleet.dev"),
  // Ops email for provisioning failure alerts
  OPS_ALERT_EMAIL: z.string().email().optional(),
  // SSH public key injected into all customer VPSes for break-glass access
  OPS_SSH_PUBLIC_KEY:    z.string().optional(),
  // FEAT-012: SSH key pair for license reissue operations.
  // Public key (injected into customer VPS authorized_keys); include IP restriction prefix.
  FLEET_SSH_PUBLIC_KEY:      z.string().optional(),
  // Private key — use FLEET_SSH_PRIVATE_KEY_B64 (base64-encoded PEM) to avoid multiline .env issues.
  // If both are set, FLEET_SSH_PRIVATE_KEY takes precedence.
  FLEET_SSH_PRIVATE_KEY:     z.string().optional(),
  FLEET_SSH_PRIVATE_KEY_B64: z.string().optional(),
  FLEET_SSH_USER:            z.string().default("root"),
  // Bundled LLM API keys — written into each customer VPS .env at provision time
  // (customers on managed SaaS don't need their own keys)
  BUNDLED_LLM_API_KEY: z.string().optional(),
  BUNDLED_EMBEDDING_API_KEY: z.string().optional(),
  // GHCR read-only PAT for pulling nestfleet-api/nestfleet-console images on customer VPSes.
  // Leave unset if GHCR packages are public.
  GHCR_TOKEN: z.string().optional(),
  // Owner console auth — comma-separated user IDs granted /owner/* access
  OWNER_USER_IDS: z.string().optional(),

  // Internal cron endpoints secret (SEC-A1).
  // When set, POST /internal/send-reminders and /internal/run-escalations require
  // the X-Internal-Secret header to match this value.
  // Leave unset in dev/test to keep the endpoints open; always set in production.
  INTERNAL_CRON_SECRET: z.string().min(32).optional(),

  // Email inbound webhook secret (SEC-C5).
  // All POST /webhooks/email/inbound/* requests must supply X-Webhook-Secret matching this value.
  // Generate with: openssl rand -hex 32
  EMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),

  // Backup — Hetzner Object Storage (S3-compatible). Optional — local-only if unset.
  BACKUP_S3_ENDPOINT:   optionalUrl,
  BACKUP_S3_ACCESS_KEY: z.string().optional(),
  BACKUP_S3_SECRET_KEY: z.string().optional(),
  BACKUP_S3_BUCKET:     z.string().default("nestfleet-backups"),
})

export type Config = z.infer<typeof ConfigSchema>

function parseConfig(): Config {
  // Strip empty strings so docker-compose ${VAR:-} passthroughs are treated
  // as absent rather than as invalid values by Zod's .optional() validators.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== ""),
  )
  const result = ConfigSchema.safeParse(env)
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(", ")}`)
      .join("\n")
    throw new Error(`Invalid configuration:\n${messages}`)
  }

  const data = result.data
  if (data.NODE_ENV === "production") {
    if (!data.SECRET_ENCRYPTION_KEY && !data.ENCRYPTION_KEY) {
      throw new Error(
        "SECRET_ENCRYPTION_KEY must be set in production (SEC-C2). Generate: openssl rand -hex 32"
      )
    }
    if (!data.INTERNAL_CRON_SECRET) {
      throw new Error(
        "INTERNAL_CRON_SECRET must be set in production (SEC-A1). Generate: openssl rand -hex 32"
      )
    }
    // EMAIL_WEBHOOK_SECRET is optional at startup — the endpoint itself fails
    // closed (401) when the secret is unset, so startup enforcement is not needed.
    // Operators should set it whenever email inbound is configured.
  }

  return data
}

// Singleton — parsed once at startup
export const config: Config = parseConfig()

/**
 * Returns the fleet SSH private key as a PEM string.
 * Prefers FLEET_SSH_PRIVATE_KEY (raw PEM); falls back to decoding FLEET_SSH_PRIVATE_KEY_B64.
 * Returns undefined if neither is set.
 */
export function getFleetSshPrivateKey(): string | undefined {
  if (config.FLEET_SSH_PRIVATE_KEY) return config.FLEET_SSH_PRIVATE_KEY
  if (config.FLEET_SSH_PRIVATE_KEY_B64) {
    return Buffer.from(config.FLEET_SSH_PRIVATE_KEY_B64, "base64").toString("utf8")
  }
  return undefined
}
