# NestFleet

**AI-native product operations platform.** NestFleet acts as a supervised virtual team for your SaaS products -- handling support intake, triage, AI-assisted replies, change management, and knowledge maintenance in one governed system.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![CI](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml/badge.svg)](https://github.com/nestfleet/nestfleet/actions/workflows/ci.yml)

## Quick Start

```bash
git clone https://github.com/nestfleet/nestfleet.git && cd nestfleet
cp .env.example .env   # fill in the required vars below
docker compose up -d
```

Console opens at `http://localhost:80`. On first visit, register your admin account.

### Required Environment Variables

| Variable | Description | Generate |
|---|---|---|
| `JWT_SECRET` | Auth token signing key (min 32 chars) | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 key for secrets at rest (64 hex chars) | `openssl rand -hex 32` |
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `ollama` \| `google` | -- |
| `LLM_API_KEY` | API key for your chosen LLM provider | -- |
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL container | `openssl rand -hex 16` |

For production, also set `NESTFLEET_DOMAIN` to your public domain (Caddy provisions TLS automatically).

## Features

- **Unified case inbox** -- email, Telegram, contact form, and webhooks converge into Cases
- **AI triage and auto-reply** with configurable human approval gates
- **Product memory (RAG)** grounded in your docs and past resolutions
- **Change Requests** with GitHub PR drafting and CI tracking
- **Known-issue matching** and outage routing
- **Role-based access control** with optional SSO
- **Bring your own LLM** -- Anthropic, OpenAI, Google, or Ollama
- **Operator console** (Next.js) for full visibility and control

## Documentation

- [Self-Hosting Guide](docs/self-hosting.md) -- full setup, production checklist, and upgrades
- **Channel Setup Guides:**
  - [Email (SMTP / Postmark / Resend)](docs/channels/email-smtp.md)
  - [Telegram Bot](docs/channels/telegram.md)
  - [GitHub App](docs/channels/github.md)
  - [Contact Form Widget](docs/channels/contact-form.md)

## Community vs Managed SaaS

| | Community (self-hosted) | Managed SaaS |
|---|---|---|
| **Cost** | Free (AGPL) | Subscription at [nestfleet.dev](https://nestfleet.dev) |
| **Features** | All features enabled | All features enabled |
| **Outcome Units** | 200 OU/month (configurable) | Per plan |
| **Infrastructure** | You manage | We manage |
| **Updates** | `docker compose pull && up -d` | Automatic |
| **Support** | Community / GitHub Issues | Priority support |

## Troubleshooting

**DB migrations did not run / API unhealthy**
The API runs migrations on startup. If the healthcheck fails, check logs: `docker compose logs api`. Common cause: PostgreSQL was not ready. Restart: `docker compose restart api`.

**Landing page redirects to /login**
Set `NEXT_PUBLIC_SHOW_LANDING=true` in your console environment if you want the public landing page. Without it, the console redirects unauthenticated users to the login screen (expected for self-hosted).

**GitHub webhook returns 401**
Verify that `GITHUB_WEBHOOK_SECRET` in your `.env` matches the secret configured in your GitHub App/repo webhook settings exactly. Regenerate both if unsure.

## Development

```bash
npm install              # install deps
npm run dev              # API with auto-reload (port 3001)
cd console && npm run dev  # Console (port 3000)
npm test                 # unit tests
npm run test:integration # integration tests (Docker required)
npm run lint             # TypeScript type check
```

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a service, the AGPL requires you to make the modified source available to users of that service.
