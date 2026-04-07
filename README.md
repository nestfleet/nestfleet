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

### Prerequisites

- Docker + Docker Compose v2
- A PostgreSQL 16 instance (or use the bundled one)
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

The console starts on `http://localhost:3002`.

### 3. Create the first admin user

On a fresh install, registration is disabled by default. To create the initial admin:

1. Set `REGISTRATION_ENABLED=true` in `.env`
2. Start the stack and open the console at `http://localhost:3002`
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
# Set required production vars in .env, then:
NESTFLEET_DOMAIN=yourcompany.nestfleet.io \
POSTGRES_PASSWORD=<strong-password> \
docker compose -f docker-compose.prod.yml up -d
```

Caddy automatically provisions a Let's Encrypt TLS certificate for `NESTFLEET_DOMAIN`. Ensure ports 80 and 443 are reachable.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Min 32 chars. `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | 64 hex chars. `openssl rand -hex 32` |
| `DATABASE_URL` | Yes | PostgreSQL URL. Default points to bundled container. |
| `LLM_PROVIDER` | Yes | `anthropic` \| `openai` \| `ollama` \| `google` |
| `LLM_API_KEY` | Yes | Your LLM provider API key |
| `LLM_MODEL` | No | Default: `claude-sonnet-4-6` |
| `NESTFLEET_DOMAIN` | Prod | Your public domain (used by Caddy for TLS) |
| `POSTGRES_PASSWORD` | Prod | Password for bundled PostgreSQL container |
| `CONSOLE_ORIGIN` | No | Allowed origin for CORS (default: any) |
| `SMTP_HOST` / `POSTMARK_API_KEY` / `RESEND_API_KEY` | No | Email delivery — set one |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` | No | GitHub integration for PR drafts |
| `SLACK_BOT_TOKEN` | No | Slack channel integration |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot integration |
| `REGISTRATION_ENABLED` | No | `false` — set `true` to allow public signup (first admin setup, then disable) |
| `BILLING_ENABLED` | No | `false` — set `true` only when Stripe keys are configured |
| `SENTRY_DSN` | No | Optional Sentry DSN for error monitoring |

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

Managed hosting is available at [nestfleet.dev](https://nestfleet.dev) for teams that don't want to run it themselves.
