# NestFleet

**AI-native product operations platform.** NestFleet acts as a supervised virtual team for your SaaS products — handling support intake, triage, AI-assisted replies, change management, and knowledge maintenance in one governed system.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml/badge.svg)](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml)

---

## Quick Start

**Prerequisites:** Docker and Docker Compose (v2) installed and running.

**1. Clone the repo**

```bash
git clone https://github.com/nestfleet/nestfleet.git
cd nestfleet
```

**2. Create your `.env` file**

```bash
cp .env.example .env
```

Then open `.env` and fill in the six required variables (see table below). Everything else can stay at its default for a local install.

**3. Start NestFleet**

```bash
docker compose up -d
```

This starts PostgreSQL, the API (runs DB migrations automatically), the console, and a Caddy reverse proxy. First startup takes 1–2 minutes while images are pulled.

**4. Verify it's running**

```bash
curl http://localhost/health
# → {"status":"ok","db":"ok","queue":"started",...}
```

**5. Create your admin account**

Open `http://localhost/register` in your browser. The first account registered automatically receives admin privileges. After that, registration locks — additional users must be invited by an admin.

**6. Add your first product**

Log in, click **"New Product"**, and follow the setup wizard. Once a product exists you can connect channels (email, Telegram, GitHub, webhook) from the **Channels** tab.

---

### Required Environment Variables

Open `.env` and set these six values before running `docker compose up`:

| Variable | What it does | How to generate |
|---|---|---|
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL container | `openssl rand -hex 16` |
| `JWT_SECRET` | Signs auth tokens — min 32 characters | `openssl rand -hex 32` |
| `SECRET_ENCRYPTION_KEY` | AES-256 key for secrets stored in the DB | `openssl rand -hex 32` |
| `LLM_PROVIDER` | Your LLM provider: `anthropic` \| `openai` \| `google` \| `ollama` | — |
| `LLM_API_KEY` | API key for the LLM provider above | From your provider dashboard |
| `EMBEDDING_API_KEY` | API key for the embedding provider (see note) | From your provider dashboard |

> **Embeddings use a separate provider.** Product memory (RAG) requires an embedding model. The default is `EMBEDDING_PROVIDER=openai` — set `EMBEDDING_API_KEY` to an OpenAI key even if you use Anthropic or Google for chat. To use Google embeddings instead, set `EMBEDDING_PROVIDER=google` and point `EMBEDDING_API_KEY` to your Gemini API key. Ollama is also supported for fully local installs.

**For production with a custom domain**, also set:

| Variable | What it does |
|---|---|
| `NESTFLEET_DOMAIN` | Your public domain — Caddy provisions a Let's Encrypt TLS cert automatically |
| `CONSOLE_ORIGIN` | Public URL of the console, e.g. `https://nestfleet.example.com` |

See the full [Self-Hosting Guide](docs/self-hosting.md) for all configuration options.

---

## How It Works

A support message arrives (email, Telegram, contact form, GitHub, or custom webhook). NestFleet:

1. **Ingests** the signal — deduplicates, thread-groups, creates a Case
2. **Triages** the Case with your LLM — classifies severity, matches known issues, routes to the right persona
3. **Drafts a reply** grounded in your product knowledge base (RAG) — sends automatically or holds for operator approval
4. **Escalates** to a human when the confidence is low, the issue is complex, or your policy requires it
5. **Drafts a PR** if the Case requires a code change — an operator approves, NestFleet pushes to GitHub

Operators see everything in the console and can intervene at any step. The AI handles the volume; humans handle the judgment calls.

---

## Features

- **Unified case inbox** — email, Telegram, contact form, GitHub, and custom webhooks converge into Cases
- **AI triage and auto-reply** with configurable human approval gates
- **Product memory (RAG)** — grounded in your docs, KB, and past resolutions
- **Change Requests** with GitHub PR drafting and CI tracking
- **Known-issue matching** and outage routing
- **Role-based access control** (operator, lead, viewer) with optional GitHub OAuth
- **Bring your own LLM** — Anthropic, OpenAI, Google, or Ollama; configurable per task tier
- **Operator console** (Next.js) — case queue, lineage view, change queue, settings

---

## Documentation

- [Self-Hosting Guide](docs/self-hosting.md) — full setup, production checklist, upgrades
- **Channel Setup Guides:**
  - [Email (SMTP / Postmark / Resend)](docs/channels/email-smtp.md)
  - [Telegram Bot](docs/channels/telegram.md)
  - [GitHub App](docs/channels/github.md)
  - [Contact Form Widget](docs/channels/contact-form.md)
  - [External Webhook](docs/channels/external-webhook.md)

---

## Community vs Managed SaaS

| | Community (self-hosted) | Managed SaaS |
|---|---|---|
| **Cost** | Free (AGPL) | Subscription at [nestfleet.dev](https://nestfleet.dev) |
| **Features** | All features | All features |
| **Outcome Units** | 200 OU/month (configurable) | Per plan |
| **Infrastructure** | You manage | We manage |
| **Updates** | `docker compose pull && up -d` | Automatic |
| **Support** | Community / GitHub Issues | Priority support |

---

## Troubleshooting

**API healthcheck failing / migrations did not run**
The API applies migrations on startup. If it stays unhealthy: `docker compose logs api`. The most common cause is PostgreSQL not being ready — restart the API after the DB is healthy: `docker compose restart api`.

**Console shows blank page or fails to load**
Check the console container: `docker compose logs console`. If `NEXT_PUBLIC_API_URL` is not set to your public API URL, the console cannot reach the API from the browser.

**Landing page redirects to /login**
Expected for self-hosted installs. Set `NEXT_PUBLIC_SHOW_LANDING=true` in your console environment if you want the public landing page enabled.

**GitHub webhook returns 401**
`GITHUB_WEBHOOK_SECRET` in `.env` must match the secret in your GitHub App or repo webhook settings exactly. Regenerate both if unsure.

**Emails not sending**
Confirm at least one of `SMTP_HOST`, `POSTMARK_API_KEY`, or `RESEND_API_KEY` is set. `SMTP_FROM` is required for all providers. Check logs: `docker compose logs api | grep smtp`.

**Disk filling up on VPS**
Old Docker images accumulate with each deploy. Free space with: `docker image prune -a --force`. NestFleet's CI does this automatically before each deploy.

**Case count not incrementing / OU limit reached**
Community mode caps at 200 Outcome Units/month. Check current usage in the console under Settings → Usage. To raise the cap: set `COMMUNITY_OU_LIMIT=500` (or `0` for unlimited) in `.env` and restart.

---

## Security Notes

**JWT token storage:** The operator console stores session JWTs in `localStorage`. This is a deliberate trade-off for a self-hosted, operator-facing tool where HttpOnly cookies introduce cross-subdomain and reverse-proxy complexity. Mitigations in place:

- Short-lived tokens (default: 8 h expiry)
- Strict CSP headers (`script-src 'self'`) on the API to reduce XSS surface
- `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` on all responses
- CORS restricted to `CONSOLE_ORIGIN` in production

If your threat model requires HttpOnly cookies, this is a known gap. A cookie-based auth option is tracked in the backlog.

---

## Glossary

**Outcome Unit (OU):** The primary billing and rate-limiting unit in NestFleet. One OU is consumed when NestFleet autonomously closes or escalates a support case using AI. Cases manually resolved or left open do not consume an OU. Community tier installs default to 200 OUs/month (`COMMUNITY_OU_LIMIT`); set to `0` for unlimited.

---

## Development

```bash
npm install                   # install API deps
npm run dev                   # API with auto-reload (port 3001)
cd console && npm install     # install console deps
cd console && npm run dev     # Console (port 3000)

npm test                      # unit tests
npm run test:integration      # integration tests (requires Docker / Colima)
npm run lint                  # TypeScript type check
```

---

## License

NestFleet uses an **open-core** model:

| Component | License |
|-----------|---------|
| Core (`src/` except `src/fleet/`) | [AGPL-3.0-or-later](LICENSE) |
| Fleet Module (`src/fleet/`) | [Commercial](LICENSE-FLEET.md) |

The core product operations features are free and open source under AGPL-3.0. If you run a modified version as a service, the AGPL requires you to make the modified source available to users of that service.

The Fleet Module implements managed-hosting infrastructure (VPS provisioning, fleet management, license reissue). It requires a `NESTFLEET_OPERATOR_KEY` JWT issued by NestFleet. See [LICENSE-FLEET.md](LICENSE-FLEET.md) for details, or contact licensing@nestfleet.dev.
