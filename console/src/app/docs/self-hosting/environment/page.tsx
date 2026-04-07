import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Environment Variables — NestFleet Docs",
  description: "Full reference for all NestFleet environment variables, grouped by category.",
}

type VarRow = {
  name: string
  required: "Required" | "Optional"
  description: string
  example: string
}

function EnvTable({ rows }: { rows: VarRow[] }) {
  return (
    <table className="w-full text-sm border-collapse mb-6">
      <thead>
        <tr>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[220px]">Variable</th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[90px]">Required</th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Example</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="px-3 py-2 border border-gray-200 align-top">
              <code className="bg-gray-100 px-1 rounded text-xs">{row.name}</code>
            </td>
            <td className="px-3 py-2 border border-gray-200 align-top">
              <span className={row.required === "Required"
                ? "text-xs font-semibold text-red-600"
                : "text-xs font-medium text-gray-400"}>
                {row.required}
              </span>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top leading-relaxed">{row.description}</td>
            <td className="px-3 py-2 border border-gray-200 align-top">
              <code className="bg-gray-100 px-1 rounded text-xs break-all">{row.example}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function EnvironmentPage() {
  return (
    <DocsLayout
      prev={{ label: "GitHub App Setup", href: "/docs/self-hosting/github-app" }}
      next={{ label: "Docker Compose", href: "/docs/self-hosting/docker" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Environment Variables
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        All configuration is provided via environment variables. Copy{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">.env.example</code> to{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">.env</code> and fill in the values
        described below. Variables marked <span className="text-xs font-semibold text-red-600">Required</span> must
        be set or the API will refuse to start.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          Generate cryptographic secrets with:{" "}
          <code className="bg-indigo-100 px-1 rounded text-xs">openssl rand -hex 32</code>{" "}
          (produces 64 hex chars — suitable for <code className="bg-indigo-100 px-1 rounded text-xs">JWT_SECRET</code> and{" "}
          <code className="bg-indigo-100 px-1 rounded text-xs">ENCRYPTION_KEY</code>).
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Core</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        These variables are required for the API to start in any environment.
      </p>
      <EnvTable rows={[
        {
          name: "JWT_SECRET",
          required: "Required",
          description: "HMAC secret used to sign and verify JWT access tokens. Must be at least 32 characters. Rotate with care — existing sessions will be invalidated.",
          example: "a3f8c2d1e9b047...(64 hex chars)",
        },
        {
          name: "ENCRYPTION_KEY",
          required: "Optional",
          description: "64 lowercase hex characters (32 bytes). Used for AES-256-GCM encryption of secrets at rest (LLM API keys, webhook secrets). Strongly recommended for production.",
          example: "4a7d1ed414474e4033ac29ccb8653d9...",
        },
        {
          name: "DATABASE_URL",
          required: "Optional",
          description: "PostgreSQL connection URL. Defaults to the local dev database. Must be set in production.",
          example: "postgresql://nestfleet:s3cr3t@localhost:5432/nestfleet",
        },
        {
          name: "PORT",
          required: "Optional",
          description: "Port the Hono API server listens on. Defaults to 3000.",
          example: "3000",
        },
        {
          name: "NODE_ENV",
          required: "Optional",
          description: "Runtime environment. One of: development, test, production. Controls logging verbosity and error exposure.",
          example: "production",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">LLM</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet uses your own LLM API key. The provider and model can also be overridden
        per-product from the Settings UI — these env vars act as the system-wide default.
      </p>
      <EnvTable rows={[
        {
          name: "LLM_PROVIDER",
          required: "Optional",
          description: "Default LLM provider. One of: openai, anthropic, ollama, google. Defaults to anthropic.",
          example: "anthropic",
        },
        {
          name: "LLM_API_KEY",
          required: "Optional",
          description: "API key for the selected LLM provider. Not required when using Ollama (local).",
          example: "sk-ant-api03-...",
        },
        {
          name: "LLM_MODEL",
          required: "Optional",
          description: "Default model name. Used for standard-complexity tasks (auto-reply, knowledge capture). Defaults to claude-sonnet-4-6.",
          example: "claude-sonnet-4-6",
        },
        {
          name: "LLM_MODEL_FAST",
          required: "Optional",
          description: "Model for fast, low-cost tasks: triage, known-issue matching, outage routing. Defaults to LLM_MODEL when not set.",
          example: "claude-haiku-3-5",
        },
        {
          name: "LLM_MODEL_COMPLEX",
          required: "Optional",
          description: "Model for complex tasks: change preparation, PR draft generation. Defaults to LLM_MODEL when not set.",
          example: "claude-opus-4-5",
        },
        {
          name: "LLM_BASE_URL",
          required: "Optional",
          description: "Custom base URL for the LLM API. Useful for Ollama or compatible proxies.",
          example: "http://localhost:11434",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Embeddings</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The embedding model powers vector search for known-issue matching and knowledge base retrieval.
        The embedding provider can differ from the chat LLM provider.
      </p>
      <EnvTable rows={[
        {
          name: "EMBEDDING_PROVIDER",
          required: "Optional",
          description: "Provider for text embeddings. One of: openai, ollama. Defaults to openai.",
          example: "openai",
        },
        {
          name: "EMBEDDING_API_KEY",
          required: "Optional",
          description: "API key for the embedding provider. Defaults to LLM_API_KEY when not set and provider is openai.",
          example: "sk-...",
        },
        {
          name: "EMBEDDING_MODEL",
          required: "Optional",
          description: "Embedding model name. Defaults to text-embedding-3-small.",
          example: "text-embedding-3-small",
        },
        {
          name: "EMBEDDING_DIMENSIONS",
          required: "Optional",
          description: "Vector dimensions. Must match the model output. Range: 64–3072. Defaults to 768.",
          example: "768",
        },
        {
          name: "EMBEDDING_BASE_URL",
          required: "Optional",
          description: "Custom base URL for the embedding API. Required when using Ollama for embeddings.",
          example: "http://localhost:11434",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Features</h2>
      <EnvTable rows={[
        {
          name: "REGISTRATION_ENABLED",
          required: "Optional",
          description: "When true, POST /api/v1/auth/register is open to the public. Disable after creating the first admin on self-hosted installs. Defaults to false.",
          example: "false",
        },
        {
          name: "BILLING_ENABLED",
          required: "Optional",
          description: "Enables the Stripe billing module. Set to true only after configuring Stripe keys. Defaults to false.",
          example: "false",
        },
        {
          name: "BCRYPT_ROUNDS",
          required: "Optional",
          description: "bcrypt work factor for password hashing. Range: 10–14. Higher is slower but more secure. Defaults to 12.",
          example: "12",
        },
        {
          name: "TELEMETRY_ENABLED",
          required: "Optional",
          description: "Opt-in anonymous usage telemetry sent to NestFleet. Defaults to false.",
          example: "false",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">GitHub</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Required to receive GitHub webhooks and create pull requests as part of change requests.
        See the <a href="/docs/self-hosting/github-app" className="text-indigo-600 hover:underline">GitHub App Setup</a> guide
        for how to obtain these values.
      </p>
      <EnvTable rows={[
        {
          name: "GITHUB_APP_ID",
          required: "Optional",
          description: "Numeric App ID from GitHub App settings. Required for GitHub integration.",
          example: "12345678",
        },
        {
          name: "GITHUB_APP_PRIVATE_KEY",
          required: "Optional",
          description: "PEM-encoded private key for the GitHub App. Newlines must be escaped as \\n in the env var.",
          example: "-----BEGIN RSA PRIVATE KEY-----\\nMIIE...",
        },
        {
          name: "GITHUB_WEBHOOK_SECRET",
          required: "Optional",
          description: "Secret used to verify HMAC signatures on incoming GitHub webhook payloads.",
          example: "whsec_abc123...",
        },
        {
          name: "GITHUB_TOKEN",
          required: "Optional",
          description: "Personal access token for GitHub API calls (fallback when GitHub App auth is not configured).",
          example: "ghp_...",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Email</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Set exactly one email backend. Use either <code className="bg-gray-100 px-1 rounded text-xs">SMTP_HOST</code> for
        generic SMTP, <code className="bg-gray-100 px-1 rounded text-xs">POSTMARK_API_KEY</code> for Postmark,
        or <code className="bg-gray-100 px-1 rounded text-xs">RESEND_API_KEY</code> for Resend.
      </p>
      <EnvTable rows={[
        {
          name: "SMTP_HOST",
          required: "Optional",
          description: "SMTP server hostname. When set, SMTP is used as the email backend.",
          example: "smtp.mailgun.org",
        },
        {
          name: "SMTP_PORT",
          required: "Optional",
          description: "SMTP server port. Typically 587 (STARTTLS) or 465 (SSL).",
          example: "587",
        },
        {
          name: "SMTP_USER",
          required: "Optional",
          description: "SMTP authentication username.",
          example: "postmaster@mg.example.com",
        },
        {
          name: "SMTP_PASS",
          required: "Optional",
          description: "SMTP authentication password.",
          example: "s3cr3tpassword",
        },
        {
          name: "SMTP_FROM",
          required: "Optional",
          description: "From address used for outbound email. Must be a valid email address.",
          example: "noreply@example.com",
        },
        {
          name: "POSTMARK_API_KEY",
          required: "Optional",
          description: "Postmark server API token. Mutually exclusive with SMTP_HOST and RESEND_API_KEY.",
          example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        },
        {
          name: "RESEND_API_KEY",
          required: "Optional",
          description: "Resend API key. Mutually exclusive with SMTP_HOST and POSTMARK_API_KEY.",
          example: "re_123abc...",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Messaging</h2>
      <EnvTable rows={[
        {
          name: "TELEGRAM_BOT_TOKEN",
          required: "Optional",
          description: "Telegram bot token from @BotFather. Required to receive Telegram messages and send alert notifications.",
          example: "7123456789:AAF...",
        },
        {
          name: "SLACK_BOT_TOKEN",
          required: "Optional",
          description: "Slack bot OAuth token (xoxb-...). Required for Slack integration.",
          example: "xoxb-1234-56789-abcdef",
        },
        {
          name: "SLACK_WEBHOOK_URL",
          required: "Optional",
          description: "Slack Incoming Webhook URL for posting alert notifications to a channel.",
          example: "https://hooks.slack.com/services/T.../B.../...",
        },
        {
          name: "SLACK_DEFAULT_CHANNEL",
          required: "Optional",
          description: "Default Slack channel ID for sending alerts when no product-level channel is configured.",
          example: "C01234ABCDE",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Production</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        These variables are only relevant for production deployments (Docker Compose or bare metal).
      </p>
      <EnvTable rows={[
        {
          name: "NESTFLEET_DOMAIN",
          required: "Optional",
          description: "The public domain name of your NestFleet instance. Used by Caddy for TLS certificate provisioning and by the API to construct absolute URLs.",
          example: "nestfleet.example.com",
        },
        {
          name: "POSTGRES_PASSWORD",
          required: "Optional",
          description: "Password for the PostgreSQL superuser in the Docker Compose stack. Must match the password in DATABASE_URL.",
          example: "s3cur3-db-password",
        },
        {
          name: "CONSOLE_ORIGIN",
          required: "Optional",
          description: "Full URL of the Next.js console. Used by the API to set CORS allowed origins. Example: https://nestfleet.example.com.",
          example: "https://nestfleet.example.com",
        },
        {
          name: "NESTFLEET_LICENSE_KEY",
          required: "Optional",
          description: "License key for Scale-tier features (format: nf_lic_ followed by 32 hex chars). Not required for Community tier.",
          example: "nf_lic_a1b2c3d4e5f6...",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Observability</h2>
      <EnvTable rows={[
        {
          name: "SENTRY_DSN",
          required: "Optional",
          description: "Sentry DSN for error monitoring. When set, uncaught exceptions are reported to Sentry. Get your DSN at sentry.io → Project Settings → Client Keys.",
          example: "https://examplePublicKey@o0.ingest.sentry.io/0",
        },
        {
          name: "LOG_LEVEL",
          required: "Optional",
          description: "Minimum log level. One of: trace, debug, info, warn, error. Case-insensitive. Defaults to info.",
          example: "info",
        },
        {
          name: "OTEL_EXPORTER_OTLP_ENDPOINT",
          required: "Optional",
          description: "OpenTelemetry OTLP endpoint for traces and metrics (e.g. Grafana Cloud, Honeycomb).",
          example: "https://otlp.example.com:4318",
        },
        {
          name: "OTEL_SERVICE_NAME",
          required: "Optional",
          description: "Service name reported in OpenTelemetry traces. Defaults to nestfleet.",
          example: "nestfleet",
        },
      ]} />

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Stripe (Billing)</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Only required when <code className="bg-gray-100 px-1 rounded text-xs">BILLING_ENABLED=true</code>.
        Self-hosted Community tier installations do not need these.
      </p>
      <EnvTable rows={[
        {
          name: "STRIPE_SECRET_KEY",
          required: "Optional",
          description: "Stripe secret key for the server-side API.",
          example: "sk_live_...",
        },
        {
          name: "STRIPE_WEBHOOK_SECRET",
          required: "Optional",
          description: "Stripe webhook signing secret for verifying webhook payloads.",
          example: "whsec_...",
        },
        {
          name: "STRIPE_PRICE_STARTER_MONTHLY",
          required: "Optional",
          description: "Stripe Price ID for the Starter plan (monthly billing).",
          example: "price_1Abc...",
        },
        {
          name: "STRIPE_PRICE_STARTER_ANNUAL",
          required: "Optional",
          description: "Stripe Price ID for the Starter plan (annual billing).",
          example: "price_1Def...",
        },
        {
          name: "STRIPE_PRICE_GROWTH_MONTHLY",
          required: "Optional",
          description: "Stripe Price ID for the Growth plan (monthly billing).",
          example: "price_1Ghi...",
        },
        {
          name: "STRIPE_PRICE_GROWTH_ANNUAL",
          required: "Optional",
          description: "Stripe Price ID for the Growth plan (annual billing).",
          example: "price_1Jkl...",
        },
      ]} />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          Never commit <code className="bg-amber-100 px-1 rounded text-xs">.env</code> to version control.
          The repository includes <code className="bg-amber-100 px-1 rounded text-xs">.env</code> in{" "}
          <code className="bg-amber-100 px-1 rounded text-xs">.gitignore</code>. If you accidentally commit secrets,
          rotate them immediately — git history is public.
        </p>
      </div>
    </DocsLayout>
  )
}
