# NestFleet

**AI-native product operations platform.** NestFleet acts as a supervised virtual team for your SaaS products — handling support intake, triage, AI-assisted replies, change management, and knowledge maintenance in one governed system.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml/badge.svg)](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml)

---

## Quick Start

```bash
git clone https://github.com/nestfleet/nestfleet.git && cd nestfleet
cp .env.example .env   # fill in the five required vars below
docker compose up -d
```

Console opens at `http://localhost`. On first visit, register your admin account — the first registered user receives admin privileges automatically.

### Required Environment Variables

| Variable | Description | Generate |
|---|---|---|
| `JWT_SECRET` | Auth token signing key (min 32 chars) | `openssl rand -hex 32` |
| `SECRET_ENCRYPTION_KEY` | AES-256 key for secrets at rest | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL container | `openssl rand -hex 16` |
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `ollama` \| `google` | — |
| `LLM_API_KEY` | API key for your chosen LLM provider | — |

For production with a custom domain, also set:

| Variable | Description |
|---|---|
| `NESTFLEET_DOMAIN` | Your public domain — Caddy provisions TLS automatically |
| `CONSOLE_ORIGIN` | Public URL of the console, e.g. `https://nestfleet.example.com` (defaults to `http://localhost`) |

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

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a service, the AGPL requires you to make the modified source available to users of that service.
