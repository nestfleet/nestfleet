# NestFleet SaaS — Fleet Provisioning Architecture

> **Status:** Phase A complete 2026-04-06 — Code + infra setup done. NF-OPS-03 ✅ (Hetzner firewall/token/SSH, Cloudflare token/zone, all .env vars set). NF-OPS-04 ✅ (compose reviewed, Gemini vars added, verify-compose.sh written). NF-OPS-07 ✅ (backup.sh S3 upload, cloud-init Gemini+S3 injection). Pending Phase B: spin up main NestFleet VPS + E2E smoke test (provision demo.nestfleet.dev, verify TLS + health + backups, deprovision).
> **Related backlog:** `docs/backlog.md` (FEAT-001, NF-OPS-02..08)
> **Related:** `docs/business/saas-model-rationale.md`

### Implementation summary (2026-04-05)

| File | Description |
|------|-------------|
| `migrations/0041_signup_intents.sql` | `signup_intents` table |
| `migrations/0042_provisionings.sql` | `provisionings` saga state table |
| `migrations/0043_hetzner_server_id_integer.sql` | Type fix: bigint → integer |
| `src/shared/config.ts` | Provisioning env vars (all optional, gated by `PROVISIONING_ENABLED`) |
| `src/infra/db/repositories/provisionings.ts` | Repository: signup_intents + provisionings |
| `src/provisioning/slug.ts` | Slug validation + reserved list |
| `src/provisioning/hetzner-client.ts` | Hetzner Cloud API client |
| `src/provisioning/cloudflare-client.ts` | Cloudflare DNS API client |
| `src/provisioning/cloud-init.ts` | cloud-init YAML generator (embeds docker-compose, Caddyfile, backup.sh) |
| `src/provisioning/health-poller.ts` | VPS health poll (60s delay, 30×15s attempts) |
| `src/provisioning/provision.ts` | 7-step saga with per-step idempotency and compensation |
| `src/provisioning/deprovision.ts` | Best-effort VPS + DNS cleanup; 30-day grace start |
| `src/workers/provisioning-worker.ts` | pg-boss worker: `provision_vps` queue |
| `src/workers/deprovision-scheduler.ts` | pg-boss cron: nightly 03:00 UTC + emergency deprovision |
| `src/api/v1/saas.ts` | `POST /api/v1/saas/signup`, `GET /api/v1/saas/status/:intentId` |
| `src/api/v1/owner.ts` | Fleet management: GET /fleet, GET/POST /fleet/:slug/\* |
| `src/billing/webhook.ts` | Extended: `saas_signup` + `saas_subscription` Stripe event branches |
| `tests/unit/provisioning/slug.test.ts` | 12 unit tests (NF-UNIT-SLUG-01..12) |
| `tests/unit/provisioning/secrets.test.ts` | 5 unit tests (NF-UNIT-SEC-PROV-01..05) |
| `tests/unit/provisioning/cloud-init.test.ts` | 10 unit tests (NF-UNIT-CLINIT-01..10) |
| `tests/integration/provisioning-saga.test.ts` | 13 integration tests (NF-INT-PROV-01..13) |

---

## 1. Approach

One NestFleet instance per paying customer (silo model) for data isolation and GDPR compliance.
Provisioning logic lives inside the **main NestFleet codebase** (`src/provisioning/`) — no separate
application, no management VPS. The Stripe webhook handler on the main instance triggers the
provisioning module directly.

```
Main NestFleet instance (nestfleet.dev)
  ├── src/api/webhooks/stripe.ts      ← extended: saas_signup routing
  ├── src/provisioning/               ← new module (~200 lines)
  │     ├── provision.ts              ← create VPS + DNS + health poll
  │     ├── deprovision.ts            ← delete VPS + DNS on churn
  │     ├── slug.ts                   ← validation + reservation
  │     └── cloud-init.ts             ← generates user_data payload
  ├── provisionings table (Postgres)  ← one row per customer, all lifecycle state
  └── /owner/* console section        ← fleet status (NF-OPS-01 §16)
```

Each customer runs their own fully isolated instance:

```
acme.nestfleet.dev  (Hetzner CX21, €5.92/mo)
  ├── Caddy   :80/:443  (TLS termination, ACME HTTP-01)
  ├── API     :3001      (NestFleet backend — internal network only)
  ├── Console :3002      (NestFleet frontend — internal network only)
  ├── pg-boss workers ×5
  └── PostgreSQL 16 + pgvector   :5432  (internal network only)
```

---

## 2. DNS and TLS

### 2.1 Domain strategy

| Record | Type | Value | When |
|--------|------|-------|------|
| `nestfleet.dev` | A | main VPS IP | Already set |
| `{slug}.nestfleet.dev` | A | customer VPS IP | Created per customer at provision time |
| `*.nestfleet.dev` | A | main VPS IP (catch-all) | Phase 2 — not required for Phase 1 |

Phase 1 uses **individual A records per customer VPS**, created via Cloudflare API.
The wildcard is deferred to Phase 2 (Traefik hub). In Phase 1, individual A records take
precedence over any wildcard anyway — no conflict.

### 2.2 Cloudflare settings per customer A record

```json
{
  "type": "A",
  "name": "{slug}.nestfleet.dev",
  "content": "{hetzner_ip}",
  "proxied": false,
  "ttl": 60
}
```

**`proxied: false` is mandatory in Phase 1.** Caddy requires a direct TCP connection to the
VPS on port 80 to complete the Let's Encrypt HTTP-01 ACME challenge. Cloudflare's orange-cloud
proxy intercepts port 80 before Caddy can respond to the challenge — ACME fails silently.

TTL 60s: Cloudflare minimum for non-proxied records. DNS is live within ~60s of record creation.

### 2.3 TLS

Caddy handles TLS automatically via Let's Encrypt HTTP-01 challenge with zero configuration.
The `Caddyfile.prod` already uses `{$NESTFLEET_DOMAIN}` which triggers Caddy's auto-ACME on
first HTTPS request.

**Let's Encrypt rate limits:** 50 certificates per registered domain (`nestfleet.dev`) per week.
This allows 50 new customer VPSes per week — sufficient for Phase 1.

**Renewal:** Caddy renews automatically at ~30 days before expiry. Cert data persists in the
`caddy_data` Docker volume — survives container restarts.

---

## 3. Signup flow (customer journey)

```
nestfleet.dev/signup
  Step 1: email, password, company name, desired subdomain, plan selection
                │
  POST /api/v1/saas/signup  (new endpoint on main instance)
    ├── Validate slug (format, reserved names, uniqueness)
    ├── Create signup_intents row  { email, slug, plan, status: 'pending_payment' }
    ├── Create Stripe checkout session with metadata:
    │     { event_type: 'saas_signup', intent_id, slug, email, plan }
    └── Return { checkoutUrl }
                │
  → Browser redirects to Stripe checkout
                │
  Customer enters card → Stripe fires checkout.session.completed
                │
  POST /webhooks/stripe  (existing, extended — see §5)
    ├── metadata.event_type === 'saas_signup' branch
    ├── Enqueue pg-boss job: provision_vps { intent_id, slug, email, plan }
    └── Return 200 to Stripe immediately
                │
  pg-boss ProvisioningWorker runs (async)
    └── Full provisioning sequence (see §4)
                │
  Customer receives welcome email with login URL
  → https://{slug}.nestfleet.dev
```

**Why pg-boss for provisioning:** VPS boot takes 3–8 minutes. The Stripe webhook must
return 200 within a few seconds or Stripe marks it failed and retries. The provisioning
job is enqueued synchronously (fast) and executed asynchronously.

**Free trial handling:** Stripe `checkout.session.completed` fires immediately when the
customer starts a trial (card captured, no charge yet). Provisioning fires on this event —
the customer gets their VPS during the trial, not after payment.

### 3.1 Slug validation rules

```typescript
// Format: lowercase alphanumeric + hyphens, 3–40 chars, no leading/trailing hyphen
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

const RESERVED_SLUGS = new Set([
  'www', 'api', 'app', 'mail', 'hub', 'static', 'cdn', 'status', 'ops',
  'admin', 'support', 'help', 'billing', 'console', 'dashboard', 'docs',
  'blog', 'about', 'contact', 'login', 'signup', 'register', 'nestfleet',
  'health', 'owner', 'internal', 'system', 'root', 'ns', 'mx',
])
```

Slug is checked against the `provisionings` table (all statuses — a deprovisioned slug
is not re-issued in Phase 1 to avoid confusing DNS caching).

---

## 4. Provisioning sequence (step by step)

```
ProvisioningWorker.execute({ intent_id, slug, email, plan })

  0. Idempotency guard
     SELECT * FROM provisionings WHERE intent_id = $1
     If status IN ('active', 'provisioning') → skip (Stripe retry duplicate)
     If status = 'failed' → allow re-attempt (manual retry from owner console)

  1. Mark status = 'provisioning' in provisionings table

  2. Generate per-customer secrets (crypto.randomBytes):
     postgres_password  = 32 hex chars
     jwt_secret         = 64 hex chars
     encryption_key     = 64 hex chars

  3. Build cloud-init payload (see §4.1)

  4. POST api.hetzner.cloud/v1/servers
       server_type: cx21
       image:       ubuntu-22.04
       location:    nbg1  (Nuremberg — EU, GDPR)
       name:        nestfleet-{slug}
       user_data:   <cloud-init YAML>
       firewalls:   [{ id: HETZNER_FIREWALL_ID }]  ← pre-created, see §4.2
     → store hetzner_server_id, hetzner_server_ip in provisionings

  5. POST api.cloudflare.com/zones/{CLOUDFLARE_ZONE_ID}/dns_records
       { type: "A", name: "{slug}.nestfleet.dev", content: "{ip}", proxied: false, ttl: 60 }
     → store cloudflare_record_id in provisionings

  6. Wait 60s (DNS TTL minimum before polling makes sense)

  7. Poll GET https://{slug}.nestfleet.dev/health
       Retry strategy: 15s intervals, max 30 attempts (7.5 min total)
       Success: { status: 'ok', db: 'ok' }
       Caddy ACME on first request adds ~30-60s on top of DNS wait

  8. On health 200:
     a. Update provisionings: status = 'active', provisioned_at = now()
     b. Send welcome email to customer:
          Subject: "Your NestFleet instance is ready"
          Body: login URL, first-login instructions, docs link
     c. Log success

  9. On poll timeout (30 attempts exhausted):
     a. Update provisionings: status = 'failed', error_message = 'health_timeout'
     b. Send ops alert to OPS_ALERT_EMAIL
     c. Do NOT delete VPS (ops may want to SSH in and debug)
     d. Do NOT send welcome email to customer
     → Ops investigates, can SSH to VPS, fix, and manually trigger re-check

 10. On Hetzner/Cloudflare API error:
     a. Rollback: if VPS was created, attempt DELETE api.hetzner.cloud/v1/servers/{id}
     b. Update provisionings: status = 'failed', error_message = <error>
     c. Send ops alert
```

### 4.1 cloud-init payload

Uses Hetzner `user_data` with cloud-init `write_files` directive. No `git clone`, no `sed`.
The provisioning service generates the complete `.env` in memory and injects it directly.

```yaml
#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-plugin
  - curl

write_files:
  - path: /opt/nestfleet/.env
    permissions: '0600'
    content: |
      NODE_ENV=production
      PORT=3001
      NESTFLEET_DOMAIN={slug}.nestfleet.dev
      DATABASE_URL=postgres://nestfleet:{postgres_password}@postgres:5432/nestfleet
      POSTGRES_PASSWORD={postgres_password}
      JWT_SECRET={jwt_secret}
      ENCRYPTION_KEY={encryption_key}
      REGISTRATION_ENABLED=true
      BILLING_ENABLED=false
      LLM_PROVIDER=anthropic
      LLM_API_KEY={bundled_llm_api_key}
      LLM_MODEL=claude-sonnet-4-6
      EMBEDDING_PROVIDER=openai
      EMBEDDING_API_KEY={bundled_embedding_api_key}
      EMBEDDING_MODEL=text-embedding-3-small
      CONSOLE_ORIGIN=https://{slug}.nestfleet.dev
      LOG_LEVEL=info

  - path: /opt/nestfleet/docker-compose.prod.yml
    content: |
      {docker_compose_content}  ← embedded verbatim from repo

  - path: /opt/nestfleet/docker/Caddyfile.prod
    content: |
      {caddyfile_content}  ← embedded verbatim from repo

  - path: /opt/nestfleet/scripts/backup.sh
    permissions: '0755'
    content: |
      {backup_sh_content}  ← embedded verbatim from scripts/backup.sh

ssh_authorized_keys:
  - {OPS_SSH_PUBLIC_KEY}  ← NestFleet ops key for emergency access

runcmd:
  - cd /opt/nestfleet
  - docker compose -f docker-compose.prod.yml pull
  - docker compose -f docker-compose.prod.yml up -d
  - echo "0 2 * * * root docker compose -f /opt/nestfleet/docker-compose.prod.yml run --rm backup" >> /etc/cron.d/nestfleet-backup
```

**Why `write_files` over `git clone`:**
- No external dependency at boot (GitHub outage cannot break provisioning)
- No deploy keys needed on customer VPSes
- No `sed` fragility with special characters in secrets
- The provisioning service embeds the exact file content it was built with

**`REGISTRATION_ENABLED=true`**: allows the customer to create their first admin account.
After `POST /api/v1/setup/complete` is called, the app requires operator role for new user
invites — `REGISTRATION_ENABLED` only governs the public `/api/v1/auth/register` endpoint.
This is acceptable: `{slug}.nestfleet.dev` is not secret, but `setup/complete` returns 409 on
repeat — a stranger registering a user account on a fully-set-up instance cannot create a product.
For additional hardening, the owner console can call a `POST /api/v1/provisioning/lock` endpoint
on the customer VPS after setup is confirmed (Phase 2 hardening, not required for Phase 1).

**`BILLING_ENABLED=false` on customer VPSes**: Customer VPSes are not billing endpoints.
All billing (Stripe) runs exclusively on the main NestFleet instance.

### 4.2 Hetzner Firewall (pre-created once)

Create one Hetzner Cloud Firewall named `nestfleet-customer` before first provisioning.
All customer VPSes attach to this firewall at creation time.

```
Inbound rules:
  TCP  80    → 0.0.0.0/0    (Caddy HTTP + ACME challenge)
  TCP  443   → 0.0.0.0/0    (Caddy HTTPS)
  TCP  22    → 0.0.0.0/0    (SSH — emergency ops access)

Outbound rules:
  ALL  any   → 0.0.0.0/0    (allow all outbound: Let's Encrypt, LLM APIs, email)
```

PostgreSQL port 5432, backend port 3001, and console port 3002 are **not exposed** externally.
Docker's internal network prevents them from being reachable outside the VPS regardless.

### 4.3 Timing expectations

| Scenario | Estimated time |
|----------|---------------|
| With `docker pull` (pre-built images in registry) | 3–5 min |
| With `docker build` from source (current compose) | 7–10 min |
| Health poll timeout | 7.5 min (30 × 15s) |

**For Phase 1: keep `build:` in docker-compose.prod.yml and set health poll to 30 attempts.**
When provisioning volume justifies it (Phase 1b, ~20+ customers), publish images to GHCR
and switch compose to `image:` pull — reduces provisioning to 3–4 minutes reliably.

---

## 5. Stripe webhook extension

The existing `src/billing/webhook.ts` handles license billing for self-hosted instances.
For SaaS provisioning, `checkout.session.completed` is extended to branch on metadata:

```typescript
case "checkout.session.completed": {
  const metadata = obj["metadata"] as Record<string, string> | undefined

  if (metadata?.["event_type"] === "saas_signup") {
    // SaaS path: enqueue provisioning job
    const intentId = metadata["intent_id"]
    const slug     = metadata["slug"]
    const email    = metadata["email"]
    const plan     = metadata["plan"]
    await boss.send("provision_vps", { intentId, slug, email, plan }, {
      singletonKey: intentId,  // idempotency: Stripe retries → same job, not a second
    })
    logger.info({ intentId, slug }, "SaaS signup: provisioning job enqueued")
  } else {
    // Existing path: license billing upsert
    await upsertWorkspaceBilling(...)
  }
  break
}
```

`customer.subscription.deleted` for SaaS subscriptions:

```typescript
case "customer.subscription.deleted": {
  const metadata = obj["metadata"] as Record<string, string> | undefined

  if (metadata?.["event_type"] === "saas_subscription") {
    // SaaS churn: start 30-day data export window
    await startDeprovisioning(metadata["slug"])
  } else {
    // Existing path: revert to community tier
    await upsertWorkspaceBilling(...)
  }
  break
}
```

---

## 6. provisionings table

```sql
CREATE TABLE provisionings (
  id                     text PRIMARY KEY DEFAULT ('prov_' || gen_random_uuid()::text),
  intent_id              text UNIQUE NOT NULL,       -- signup_intents.id
  org_slug               text UNIQUE NOT NULL,
  customer_email         text NOT NULL,
  plan                   text NOT NULL,              -- starter | growth | scale
  stripe_customer_id     text,
  stripe_subscription_id text,
  hetzner_server_id      bigint,
  hetzner_server_ip      text,
  cloudflare_record_id   text,
  status                 text NOT NULL DEFAULT 'pending',
  --   pending          → payment captured, not yet processed
  --   provisioning     → VPS creation in progress
  --   active           → VPS up, welcome email sent
  --   failed           → provisioning error, ops alerted
  --   deprovisioning   → subscription cancelled, 30-day window active
  --   deprovisioned    → VPS + DNS deleted, S3 archived
  provisioned_at         timestamptz,
  deprovision_after      timestamptz,               -- set on cancellation: now() + 30d
  deprovisioned_at       timestamptz,
  last_health_check_at   timestamptz,               -- last time /health was polled
  last_health_status     text,                      -- 'ok' | 'degraded' | 'unreachable'
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE signup_intents (
  id           text PRIMARY KEY DEFAULT ('si_' || gen_random_uuid()::text),
  email        text NOT NULL,
  org_slug     text NOT NULL,
  plan         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending_payment',
  --   pending_payment → checkout session created, waiting for Stripe
  --   completed       → checkout.session.completed received
  --   abandoned       → never paid (cleanup after 7 days)
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

---

## 7. Deprovisioning on churn

Triggered by `customer.subscription.deleted` Stripe event:

```
1. UPDATE provisionings SET
     status = 'deprovisioning',
     deprovision_after = now() + interval '30 days'
   WHERE org_slug = $slug

2. Send "data export window" email to customer:
   "Your NestFleet instance will remain accessible for 30 days.
    Export your data at https://{slug}.nestfleet.dev/settings/export"

3. Nightly pg-boss scheduled job (03:00 UTC on main instance):
   SELECT * FROM provisionings
   WHERE status = 'deprovisioning' AND deprovision_after < now()

   For each row:
     a. DELETE api.hetzner.cloud/v1/servers/{hetzner_server_id}
     b. DELETE api.cloudflare.com/zones/{zone}/dns_records/{cloudflare_record_id}
     c. UPDATE provisionings SET status = 'deprovisioned', deprovisioned_at = now()
     d. Log: provisioning deprovisioned for {org_slug}
     (S3 backups: retained 90 days by lifecycle rule, then auto-deleted)
```

The 30-day window satisfies GDPR Article 20 (data portability). Non-negotiable.

**Immediate deprovision (fraud/abuse):** Owner console can set `deprovision_after = now()`.
The nightly job picks it up within 24h. For urgent cases, ops can run `deprovisionNow(slug)`
directly from a Node.js REPL on the main instance.

---

## 8. New config variables required

Added to `src/shared/config.ts` and `.env.example`:

```
# SaaS provisioning — only needed on the main NestFleet instance
PROVISIONING_ENABLED=false              # feature gate; set true on main instance only
HETZNER_API_TOKEN=                      # Hetzner Cloud API token (read-write)
CLOUDFLARE_API_TOKEN=                   # Cloudflare API token (DNS edit permission)
CLOUDFLARE_ZONE_ID=                     # Zone ID for nestfleet.dev in Cloudflare
HETZNER_FIREWALL_ID=                    # pre-created firewall ID (see §4.2)
CUSTOMER_BASE_DOMAIN=nestfleet.dev       # base domain for customer subdomains
OPS_ALERT_EMAIL=ops@nestfleet.dev        # receives provisioning failure alerts
OPS_SSH_PUBLIC_KEY=                     # public key injected into all customer VPSes

# Bundled LLM keys — injected into customer VPS .env at provisioning time
# These are NestFleet's own keys; customers on managed SaaS don't need their own
BUNDLED_LLM_API_KEY=                    # Anthropic API key
BUNDLED_EMBEDDING_API_KEY=              # OpenAI API key (embeddings)
```

**Security note on `BUNDLED_LLM_API_KEY`:** This key is written to every customer VPS.
If a customer VPS is compromised, the key is exposed. Mitigation for Phase 1: monitor
Anthropic usage dashboard for anomalous spend. Phase 2 mitigation: use Anthropic Workspaces
to issue per-customer virtual keys with spend limits.

---

## 9. Main VPS sizing

The main instance only handles:
- Stripe webhook → enqueue pg-boss job (milliseconds)
- pg-boss ProvisioningWorker: API calls to Hetzner + Cloudflare + health polling
- Nightly deprovisioning check
- Owner console (SWR polling, low traffic)

**Hetzner CX21 (2 vCPU, 4 GB RAM, ~€5.92/mo) is sufficient up to 500+ customers.**
CPU and RAM usage on the main instance does not scale with customer count.

---

## 10. Phases roadmap (unchanged)

| Phase | Scale | Architecture | Key change |
|-------|-------|-------------|------------|
| **1** | 0–50 customers | Individual A records + Caddy per-VPS ACME | Phase 1 as described in this doc |
| **2** | 50–500 customers | Traefik hub, wildcard DNS, private network | No public IPs on customer VPSes; one wildcard cert |
| **3** | 500+ customers | K8s namespace-per-tenant | Namespace isolation, cert-manager wildcard |

Do not build Phase 2 until the operational pain of Phase 1 is actually felt (~40–50 active customers).

---

## 11. Fleet management operations

All operations go through the owner console (`/owner/fleet`) or direct API calls. No manual SSH required for routine operations.

| Operation | Mechanism | When |
|-----------|-----------|------|
| View all instances + status | `GET /api/v1/owner/fleet` → reads `provisionings` | Owner console fleet page |
| Health monitoring | Nightly pg-boss job polls `/health` per active instance, writes to `last_health_status` | Automated |
| Power reset (stuck VPS) | `POST /api/v1/owner/fleet/{slug}/reset` → `POST api.hetzner.cloud/v1/servers/{id}/actions/reset` | Manual, on demand |
| Emergency deprovision | `POST /api/v1/owner/fleet/{slug}/deprovision` → sets `deprovision_after = now()` | Manual, fraud/abuse |
| SSH access | Ops key injected at provision time via cloud-init `ssh_authorized_keys` | Break-glass only |

Power reset relies on Docker's `restart: unless-stopped` — all services come back automatically after reboot.

---

## 12. Testing

Three layers. Full test scenarios in `active-backlog.md §18 NF-OPS-08`.

| Layer | Scope | Tools | When |
|-------|-------|-------|------|
| **Unit** | Slug validation, cloud-init generation, secret uniqueness | Vitest, no I/O | Every CI run |
| **Integration** | Stripe routing, provisioning worker, deprovisioning scheduler, fleet API | Vitest + Testcontainers + msw (mock Hetzner/Cloudflare) | Every CI run |
| **E2E staging** | Real VPS boot, real DNS, real TLS, full user flow, backup, reset, deprovision | Manual runbook against `staging.nestfleet.dev` | Before first paying customer; on provisioning changes |

E2E staging uses a separate Hetzner project and `*.staging.nestfleet.dev` subdomain to keep test certs and VPSes isolated from production.

---

## 13. What is NOT in Phase 1

- Custom customer domains (`support.acme-corp.com`) — deferred to Phase 2
- GHCR image publishing / `docker pull` provisioning — deferred to Phase 1b (~20 customers)
- Per-customer virtual LLM API keys (Anthropic Workspaces) — deferred to Phase 2
- Owner console fleet view (VPS health dashboard) — ✅ shipped in NF-OPS-01 (fleet-health-worker, /owner/fleet pages)
- Automatic VPS resize on plan upgrade — not needed until Growth → Scale tier distinction matters
