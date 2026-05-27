# Self-Hosting Guide

This guide covers deploying NestFleet on your own server, from initial setup to production hardening.

## 1. Prerequisites

- **Docker 24+** with Docker Compose v2
- A **Linux VPS** (2 vCPU / 4 GB RAM minimum) or any machine that can run Docker
- An **LLM API key** from Anthropic, OpenAI, or Google (or a local Ollama instance)
- For production: a **domain name** with a DNS A record pointing to your server, and **ports 80/443 open** in your firewall

## 2. Clone and Configure

```bash
git clone https://github.com/nestfleet/nestfleet.git
cd nestfleet
cp .env.example .env
```

Edit `.env` and fill in the required variables:

```bash
# Generate secrets
openssl rand -hex 32   # use output for JWT_SECRET
openssl rand -hex 32   # use output for ENCRYPTION_KEY
openssl rand -hex 16   # use output for POSTGRES_PASSWORD
```

```env
JWT_SECRET=<paste-generated-value>
ENCRYPTION_KEY=<paste-generated-value>
POSTGRES_PASSWORD=<paste-generated-value>
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
```

For production, also set:

```env
NESTFLEET_DOMAIN=nestfleet.yourcompany.com
```

## 3. Start the Stack

```bash
docker compose up -d
```

This starts four containers:

| Container | Role | Internal Port |
|---|---|---|
| `postgres` | PostgreSQL 16 database | 5432 |
| `api` | NestFleet API (Hono) | 3001 |
| `console` | Operator Console (Next.js) | 3000 |
| `caddy` | Reverse proxy + automatic TLS | 80, 443 |

The API automatically runs database migrations on startup. Wait for the healthcheck to pass:

```bash
docker compose ps   # all services should show "healthy"
```

## 4. First Admin Registration

1. Open your domain (or `http://localhost` for local setups)
2. Click **Sign up** and create your admin account
3. The first registered user automatically receives admin privileges

> **Tip:** After creating your admin account, set `REGISTRATION_ENABLED=false` in `.env` and restart to prevent unauthorized signups: `docker compose restart api`

## 5. Create Your First Product

After registering, you are taken directly to the **setup wizard**. The wizard walks you through naming your product, choosing an LLM provider, and connecting your first channel. Complete it to create your first product.

If you skipped the wizard or need to add a second product, go to **Settings → Products → New Product**.

## 6. Configure Channels

Channels connect external communication sources to NestFleet. Configure at least one to start receiving signals.

- [Email (SMTP / Postmark / Resend)](channels/email-smtp.md)
- [Telegram Bot](channels/telegram.md)
- [GitHub App / Webhooks](channels/github.md)
- [Contact Form Widget](channels/contact-form.md)
- [External Webhook](channels/external-webhook.md) — integrate any custom channel (Slack bots, Discord, Zapier, etc.)

## 7. Production Checklist

### HTTPS via Caddy

Caddy handles TLS automatically. Ensure:
- `NESTFLEET_DOMAIN` is set to your public domain in `.env`
- DNS A record points to your server's IP
- Ports 80 and 443 are open and not blocked by a firewall
- Caddy will provision a Let's Encrypt certificate on first request

### SMTP for Notifications

NestFleet sends operator notifications (approval requests, escalations, stale alerts) via email. Configure one of:

```env
# Option A: Generic SMTP
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-password
SMTP_FROM=support@yourdomain.com

# Option B: Postmark
POSTMARK_API_KEY=your-server-token
SMTP_FROM=support@yourdomain.com

# Option C: Resend
RESEND_API_KEY=re_your_key
SMTP_FROM=support@yourdomain.com
```

### Backup Strategy

The bundled PostgreSQL stores all data in a Docker volume (`pgdata`). Back it up regularly:

```bash
# Dump the database
docker compose exec postgres pg_dump -U nestfleet nestfleet > backup-$(date +%F).sql

# Restore from backup
cat backup-2026-04-08.sql | docker compose exec -T postgres psql -U nestfleet nestfleet
```

For automated off-site backups, configure the S3-compatible backup in `.env`:

```env
BACKUP_S3_ENDPOINT=https://nbg1.your-objectstorage.com
BACKUP_S3_ACCESS_KEY=your-key
BACKUP_S3_SECRET_KEY=your-secret
BACKUP_S3_BUCKET=nestfleet-backups
```

### Embedding Provider

For product memory (RAG), configure an embedding provider:

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
```

## 8. Disk Maintenance

Docker images accumulate with each deploy. On a VPS with limited storage, old images can fill the disk and cause container restarts. Clean up before or after upgrades:

```bash
# Remove all images not used by a running container (~5–7 GB reclaimed on a busy instance)
docker image prune -a --force

# Check current disk usage
df -h /
docker system df
```

> **Note:** NestFleet's CI automatically runs `docker image prune -a --force` before pulling new images on each deploy, so this is mainly relevant for manual upgrades or rollbacks.

## 9. Upgrading

Pull the latest images and recreate containers:

```bash
docker compose pull
docker compose up -d
```

The API applies any new database migrations automatically on startup. Check logs after upgrading:

```bash
docker compose logs api --tail 50
```

## 10. Community Plan Limits

Self-hosted NestFleet runs in **community mode** by default:
- All features are enabled
- **200 Outcome Units (OU) per month** cap (configurable via `COMMUNITY_OU_LIMIT` in `.env`)
- Unlimited products and users
- Set `COMMUNITY_OU_LIMIT=0` for unlimited usage (air-gapped or internal deployments)

If you need higher limits with managed infrastructure and priority support, consider [NestFleet Managed SaaS](https://nestfleet.dev).
