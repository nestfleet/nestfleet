# Settings & Configuration

This page is the reference for every operator-facing setting NestFleet exposes. Most can be edited in the console under **Settings**; all have an environment-variable equivalent that takes precedence and is the recommended approach for production.

## Product settings

Open **Settings → Product**.

| Field | What it does |
|-------|--------------|
| **Name** | Display name across the console and outbound emails |
| **Slug** | URL-safe identifier, used in webhook paths and exports |
| **Support policy** | Free-text snippet fed to the auto-reply agent's system prompt — set your tone here |
| **Default reply language** | Auto-reply target language; `auto` matches the incoming signal |
| **Business hours** | Used by escalation timing and stale-case detection |
| **GitHub repo** | `owner/name` — enables CR → PR drafting |

The support policy is the highest-leverage field: a few well-worded sentences ("We never apologise for outages without committing to a fix date") visibly change auto-reply behaviour.

## LLM configuration

Open **Settings → LLM**.

```bash
# Provider — one of: anthropic | openai | google | ollama
LLM_PROVIDER=anthropic

# Three tiers; pick models from the chosen provider's catalog
LLM_MODEL=claude-sonnet-4-7-20260201
LLM_MODEL_FAST=claude-haiku-4-7-20260201
LLM_MODEL_COMPLEX=claude-opus-4-7-20260201

# Provider keys (set only the one matching LLM_PROVIDER)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
GOOGLE_GENERATIVE_AI_API_KEY=xxxxxxxxxxxxx
OLLAMA_BASE_URL=http://ollama:11434
```

**Tier meanings:**

- `LLM_MODEL` — default for all general work (auto-reply drafting, KB proposals)
- `LLM_MODEL_FAST` — cheap, high-throughput; used for triage classification
- `LLM_MODEL_COMPLEX` — strongest available; used for PR drafting and deep reasoning

You can mix tiers across providers (e.g. Anthropic for standard, OpenAI for fast) by setting per-tier provider overrides under **Settings → LLM → Advanced**.

> **Tip:** if you switch providers, do it during low traffic — in-flight jobs use the old config until they retry.

## Embedding configuration

Open **Settings → Embedding**.

```bash
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

Changing the embedding model triggers a background re-embed of all KB entries. Both vector sets are retained until the new one is complete; then NestFleet swaps atomically. Progress is visible under **Knowledge Base → Sources → Re-embed status**.

Common choices:

| Model | Dims | Notes |
|-------|------|-------|
| `text-embedding-3-small` | 1536 | Default, cheap, strong baseline |
| `text-embedding-3-large` | 3072 | Higher quality, ~5x cost |
| `nomic-embed-text` (Ollama) | 768 | Self-hosted, no provider call |

## Registration lock

```bash
REGISTRATION_ENABLED=false   # recommended for production
```

When `false`, the public sign-up page returns 404. New users can only join via invite (see [Team & Roles](./team-and-roles.md)). When `true`, anyone with the URL can register — fine for local dev, dangerous for an exposed instance.

## Community OU limit

```bash
COMMUNITY_OU_LIMIT=200   # default
# COMMUNITY_OU_LIMIT=0   # unlimited, recommended for self-hosters
```

This sets the calendar-month cap on Outcome Units. The Community tier defaults to 200; set `0` to remove the cap entirely. Counters reset on UTC midnight on the first of the month.

> **Note:** removing the cap does not change the AGPL-3.0 licence terms — it just lifts the in-app rate limit.

## Backup configuration

Open **Settings → Backup**. NestFleet supports any S3-compatible object store (AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.).

```bash
BACKUP_ENABLED=true
BACKUP_S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
BACKUP_S3_BUCKET=nestfleet-backups
BACKUP_S3_REGION=eu-central-1
BACKUP_S3_ACCESS_KEY=AKIA...
BACKUP_S3_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
BACKUP_SCHEDULE="0 3 * * *"   # cron, daily 03:00
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=base64-32-byte-key
```

Backups include the Postgres dump plus uploaded KB source files. Encryption is AES-256-GCM with a key you control — losing it means losing the ability to restore.

Restore is a one-shot CLI inside the container:

```bash
docker compose exec api node scripts/restore.js \
  --backup s3://nestfleet-backups/2026-05-27T03-00-00.dump.enc
```

> **Warning:** restore is destructive. It drops and recreates the database. Always test on a staging instance first.

## SMTP / notification settings

See [Notifications](./notifications.md) for the full SMTP, Postmark, Resend, and Slack configuration. Settings live under **Settings → Notifications** and the env vars are documented there.

## Retention and data deletion

Open **Settings → Retention**. Three independent retention windows:

| Data | Default | Env var |
|------|---------|---------|
| Closed cases (full detail) | 365 days | `RETENTION_CASES_DAYS` |
| Lineage events on closed cases | 90 days | `RETENTION_LINEAGE_DAYS` |
| Raw signal bodies (after case closes) | 30 days | `RETENTION_SIGNALS_DAYS` |

After the window, data is hard-deleted on a daily sweep job (`retention.sweep`). Aggregated analytics survive — only row-level detail is removed.

For GDPR / right-to-be-forgotten requests, **Settings → Privacy → Erase by identity** accepts an email or reporter ID and deletes all matching Signals, Cases, and Conversations across all retention windows, with an audit record of the action.

> **Tip:** if you need indefinite retention for compliance, set the env vars to `0`. The console will surface a banner reminding you of the storage growth implication.

## See also

- [Getting Started](./getting-started.md) — first-run wizard maps to these settings
- [Team & Roles](./team-and-roles.md) — registration lock and OAuth
- [Notifications](./notifications.md) — SMTP / Slack configuration in depth
- [Knowledge Base](./knowledge-base.md) — embedding choice trade-offs
