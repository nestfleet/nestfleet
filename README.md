# NestFleet

**AI-native product operations platform.** NestFleet acts as a supervised virtual team for one or more products — handling support intake, triage, change management, AI-assisted replies, and knowledge maintenance in a single governed system.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml/badge.svg)](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml)

---

<!-- TODO: add console screenshots once the first Hetzner deployment is live -->

## What it does

- Ingests signals from email, Telegram, chat widget, and webhooks into unified **Cases**
- AI-driven triage, known-issue matching, and outage routing
- AI auto-reply with configurable human approval gates
- Change Requests with GitHub PR drafting and CI tracking
- Product memory (RAG) grounded in your documentation and past resolutions
- Role-based access control with optional SSO/SAML
- Operator console (Next.js) for full visibility and control

## Architecture

- **Self-hosted** — your data never leaves your infrastructure
- **Bring your own LLM** — configure Anthropic, OpenAI, Ollama, or Google
- **AGPL open source** — audit, fork, or self-host freely
- **Managed SaaS** available at [nestfleet.dev](https://nestfleet.dev) for teams that don't want to run it themselves

---

## Quick start (self-hosted)

### Fast path — 3 commands

```bash
git clone https://github.com/nestfleet/nestfleet.git && cd nestfleet
cp .env.example .env  # Edit: set JWT_SECRET, ENCRYPTION_KEY, LLM_API_KEY
docker compose up -d
```

This runs the full stack locally. Console at http://localhost:3000.

---

### Prerequisites

- Docker + Docker Compose v2
- An LLM API key (Anthropic, OpenAI, etc.)

### 1. Clone and configure

```bash
git clone https://github.com/nestfleet/nestfleet.git
cd nestfleet
cp .env.example .env
```

Edit `.env` — minimum required:

```env
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
```

### 2. Start (development)

```bash
# Start PostgreSQL
docker compose up -d postgres

# Install dependencies
npm install

# Run API in dev mode (auto-reload)
npm run dev
```

The API starts on `http://localhost:3001`.

```bash
# In a second terminal — start the console
cd console && npm install && npm run dev
```

The console starts on `http://localhost:3000`.

### 3. Create the first admin user

On a fresh install, registration is disabled by default. To create the initial admin:

1. Set `REGISTRATION_ENABLED=true` in `.env`
2. Start the stack and open the console at `http://localhost:3000`
3. Click **Sign up** and create your admin account
4. Set `REGISTRATION_ENABLED=false` in `.env` and restart to lock registration

### 4. GitHub App setup (optional — required for PR drafting)

NestFleet uses a GitHub App to draft pull requests on your behalf.

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set Homepage URL to your NestFleet domain
3. Set Webhook URL to `https://<your-domain>/api/v1/github/webhook`
4. Permissions: **Repository → Contents** (Read & write), **Pull requests** (Read & write)
5. After creation, copy **App ID** and generate a **Private key** (`.pem` file)
6. Set in `.env`:
   ```env
   GITHUB_APP_ID=<your-app-id>
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   ```

### 5. Production deployment

```bash
# Set required production vars in .env (JWT_SECRET, ENCRYPTION_KEY, LLM_API_KEY,
# NESTFLEET_DOMAIN, POSTGRES_PASSWORD), then:
docker compose up -d
```

Caddy automatically provisions a Let's Encrypt TLS certificate for `NESTFLEET_DOMAIN`. Ensure ports 80 and 443 are reachable from the internet.

---

## Environment variables

### Required for self-hosted

| Variable | Description |
|---|---|
| `JWT_SECRET` | Min 32 chars. Generate: `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 64 hex chars. Generate: `openssl rand -hex 32` |
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `ollama` \| `google` |
| `LLM_API_KEY` | Your LLM provider API key |

### Required for production (public domain + TLS)

| Variable | Description |
|---|---|
| `NESTFLEET_DOMAIN` | Your public domain — Caddy uses this for Let's Encrypt TLS |
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL container |

### Optional

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | bundled container | Override to point at an external Postgres instance |
| `LLM_MODEL` | `claude-sonnet-4-6` | LLM model name |
| `CONSOLE_ORIGIN` | (any) | Allowed CORS origin |
| `SMTP_HOST` / `POSTMARK_API_KEY` / `RESEND_API_KEY` | — | Email delivery — set one |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` | — | GitHub integration for PR drafts |
| `SLACK_BOT_TOKEN` | — | Slack channel integration |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot integration |
| `REGISTRATION_ENABLED` | `false` | Set `true` to allow public signup (first admin setup, then disable) |
| `BILLING_ENABLED` | `false` | Set `true` only when Stripe keys are configured |
| `SENTRY_DSN` | — | Optional Sentry DSN for error monitoring |

See `.env.example` for the full list.

---

## Development

```bash
# Unit tests
npm test

# Integration tests (requires Colima or Docker)
npm run test:integration

# TypeScript check
npm run lint

# Build
npm run build
```

### Project layout

```
src/
  api/          Hono HTTP routes
  auth/         JWT auth + RBAC middleware
  billing/      Stripe billing, subscription plans, and webhook handling
  infra/        Database client, migrations runner, pg-boss workers
  license/      License validation (file-based + cloud-issued JWT)
  shared/       Config, logger, telemetry, errors
  workers/      pg-boss job handlers (triage, auto-reply, change-prep, ...)
migrations/     SQL migration files (applied on startup)
console/        Next.js operator console
tests/
  unit/         Vitest unit tests
  integration/  Testcontainers integration tests
  e2e/          Playwright end-to-end tests
```

---

## License

NestFleet is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If you run a modified version as a service, the AGPL requires you to make the modified source available to users of that service.

Running NestFleet yourself? If you outgrow the self-hosted setup, [NestFleet managed SaaS](https://nestfleet.dev) removes the ops burden.
