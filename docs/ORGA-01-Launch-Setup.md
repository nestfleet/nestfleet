# ORGA-01 — NestFleet Complete Launch Setup Guide

Domain · Email · GitHub Org · GitHub App · Prod Infra · Deploy Pipeline

> **Status tracking:** Each step maps to checklist items at the bottom.
> **Reference:** Adapted from DG ORGA-01. Key differences: Google Workspace for email (same as DG), no GitHub Marketplace listing, GitHub App is installed by customers on their repos (not NestFleet itself), provisioning is automated via pg-boss saga.

---

## Current State (as of 2026-04-06)

| Item | Status |
|------|--------|
| `nestfleet.dev` domain registered + Cloudflare zone | ✅ Done |
| `nestfleet.io` cybersquatter protection | — Deferred |
| Hetzner project `nestfleet`, firewall 10804246, SSH key `nestfleet-ops` | ✅ Done |
| Google Workspace Starter — MX, SPF, DKIM, DMARC, mailboxes | ✅ Done |
| Transactional email — Google SMTP, `noreply@nestfleet.dev`, app password | ✅ Done |
| `nestfleet` GitHub org + private repo `nestfleet/nestfleet` | ✅ Done — private until v0.1.0 |
| GitHub deploy token (read-only, scoped to repo) | ✅ Done — stored in `.env` |
| GitHub App `NestFleet` (App ID 3297524, under nestfleet org) | ✅ Done |
| Personal PAT removed, App ID + private key + webhook secret in `.env` | ✅ Done |
| Hetzner main VPS `nestfleet-main` CX23 | 🔄 Being provisioned |
| `nestfleet.dev` A record → main VPS IP | ❌ Pending VPS IP |
| Initial code push to private repo | ❌ Pending (do before VPS deploy) |
| First deploy on VPS | ❌ Pending |
| GitHub Actions deploy workflow | ❌ Pending |

---

## Step 1 — Domain: Already Done ✅

`nestfleet.dev` is registered and managed in Cloudflare (Zone ID `e6a2baeeedcc3cdaaa65115c051382d3`).
DNS is handled by Cloudflare — no action needed.

---

## Step 2 — Block Cybersquatters: Register `nestfleet.io` — Skipped

Not needed for launch. Deferred indefinitely.

---

## Step 3 — Email: Google Workspace ✅ Done

Google Workspace Starter is configured for `nestfleet.dev`. MX records, SPF, DKIM, DMARC, and
mailboxes are all live. Same setup as DocuGardener.

**Mailboxes configured:**
- `info@nestfleet.dev` — general enquiries
- `ops@nestfleet.dev` — infra alerts, provisioning ops
- `alerts@nestfleet.dev` — monitoring / uptime
- `support@nestfleet.dev` — customer support
- `billing@nestfleet.dev` — Stripe receipts, billing disputes
- `noreply@nestfleet.dev` — outbound only (reject inbound)

No further action on Steps 3/4 unless Google Admin routing rules need adjustment.

---

## Step 4 — Transactional Email: Switch to Google Workspace SMTP

Resend is not needed. `sender.ts` resolves transport in priority order: `SMTP_HOST` → Postmark → Resend → skip.
Google Workspace is already configured with SPF/DKIM/DMARC — use it directly.

1. Google Admin → **Users** → `info@nestfleet.dev` → enable **2-Step Verification**
2. **Security** → **App passwords** → generate → name it `nestfleet-prod-smtp` → copy the password
3. In Gmail for `info@nestfleet.dev`: **Settings** → **Accounts** → **Send mail as** → add `noreply@nestfleet.dev` as an alias (or create a dedicated `noreply@` Google Workspace account and use its credentials)
4. Update `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@nestfleet.dev
SMTP_PASS=<google-app-password>
SMTP_FROM=NestFleet <noreply@nestfleet.dev>
# Remove — no longer needed:
# RESEND_API_KEY=re_DZE4cs4T_...
```

5. Restart API container: `docker compose up -d --no-deps api`
6. Test: trigger a magic-link login → confirm email arrives from `noreply@nestfleet.dev`

---

## Step 5 — Create GitHub Organisation

1. github.com → avatar (top-right) → **Your organizations** → **New organization**
2. Plan: **Free**
3. Organization name: `nestfleet` → URL: `github.com/nestfleet`
4. Contact email: `info@nestfleet.dev`
5. Skip inviting members → **Complete setup**
6. In org settings → **Profile**:
   - Display name: `NestFleet`
   - Website: `https://nestfleet.dev`
   - Description: `AI-native product operations platform — self-hosted & SaaS`
   - Email: `info@nestfleet.dev`

### 5b — Create public repo under the org

1. In `nestfleet` org → **New repository**
2. Name: `nestfleet`
3. Visibility: **Public**
4. Description: `AI-native product operations platform — open source (AGPL-3.0)`
5. Do NOT initialise with README/gitignore — you'll push the existing local repo
6. Push the local repo:

```bash
cd "/Users/Alexey_Kopachev/Alex/AI Projects/NestFleet"
git remote add origin https://github.com/nestfleet/nestfleet.git
git push -u origin main
```

7. Add repo topics in GitHub UI: `ai`, `typescript`, `support-operations`, `product-ops`, `self-hosted`, `agpl`
8. Homepage: `https://nestfleet.dev`

### 5c — Set branch protection on `main`

Settings → **Branches** → **Add branch protection rule**:
- Pattern: `main`
- Require pull request before merging ✓
- Required status checks: `CI / API — type-check, test, audit`
- Dismiss stale pull request approvals ✓
- Allow force pushes: ✗

---

## Step 6 — Create GitHub App for PR Drafting (under nestfleet org)

NestFleet's AI drafts pull requests on customers' repositories. For this, customers install a
**GitHub App** that grants NestFleet `Contents: write` + `Pull requests: write` access to their repos.
Currently the codebase has `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` config vars wired but no App
has been registered — only a personal PAT is in use.

> **Note:** This is NOT a GitHub Marketplace listing. NestFleet is not a GitHub-native app sold via Marketplace.
> The App is installed by customers during onboarding (Settings → GitHub Integration).

### 6a — Create the GitHub App

1. github.com → `nestfleet` org → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Fill in:
   - **App name:** `NestFleet`
   - **Homepage URL:** `https://nestfleet.dev`
   - **Webhook URL:** `https://nestfleet.dev/api/v1/webhooks/github/events/{productId}`
     *(Note: productId is product-specific — for the webhook to work, customers configure this URL per-product in their repo settings)*
   - **Webhook secret:** generate with `openssl rand -hex 32` — copy it
3. **Permissions** (Repository):
   - Contents: **Read & write** (to create files and PRs)
   - Pull requests: **Read & write** (to open PRs)
   - Metadata: **Read-only** (required by GitHub)
4. **Permissions** (Repository — for webhook events):
   - Checks: **Read-only** (to receive `check_suite` events)
   - Deployments: **Read-only** (to receive `deployment_status` events)
5. **Subscribe to events:**
   - `pull_request`
   - `check_suite`
   - `deployment_status`
   - `issues`
6. **Where can this GitHub App be installed?** → **Any account**
7. Click **Create GitHub App**

### 6b — Generate private key

1. In the newly created App → scroll to **Private keys** → **Generate a private key**
2. Download the `.pem` file
3. Convert to single-line format for `.env`:

```bash
cat nestfleet.YYYY-MM-DD.private-key.pem | tr '\n' '\\n'
```

4. Add to `.env`:

```env
GITHUB_APP_ID=<numeric app id shown on app settings page>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET=<value generated in step 6a>
```

5. Remove the personal PAT from `.env` once the App is working (or keep as fallback):

```env
# GITHUB_TOKEN=  # remove or comment out — replaced by App auth
```

### 6c — Create an install link for customers

After the App is created, the install URL is:
```
https://github.com/apps/nestfleet/installations/new
```

This is what goes in the console Settings → GitHub Integration onboarding step.

---

## Step 7 — GitHub Marketplace

**Not applicable.** NestFleet is a standalone SaaS / self-hosted platform — not a GitHub Marketplace app.
GitHub Marketplace is for GitHub-native bots and CI tools distributed via GitHub billing. Skip.

---

## Step 8 — Prod Infra: Main NestFleet VPS (Phase B)

> **Prerequisites:** Steps 1–6 complete. Hetzner project + firewall already exist (from NF-OPS-03).

### 8a — Provision main NestFleet VPS

1. Hetzner Console → `nestfleet` project → **Servers** → **Create server**
2. Location: **Nuremberg** (EU, GDPR-friendly)
3. Image: **Ubuntu 22.04**
4. Type: **CX21** (2 vCPU, 4 GB RAM, 40 GB SSD) — €5.92/mo
5. Attach firewall: `nestfleet-customer` (firewall 10804246) — allows TCP 22/80/443
6. SSH key: `nestfleet-ops` (already registered in project from NF-OPS-03)
7. Name: `nestfleet-main`
8. Note the assigned public IP address

### 8b — Point `nestfleet.dev` DNS to main VPS

Cloudflare → `nestfleet.dev` → **DNS** → **Records** → add:

| Type | Name | Value | Proxy | Purpose |
|------|------|-------|-------|---------|
| A | `@` | `<hetzner-ip>` | Proxied ✓ | Main landing / owner console |
| A | `www` | `<hetzner-ip>` | Proxied ✓ | www redirect |
| A | `api` | `<hetzner-ip>` | Proxied ✓ | API endpoint (if subdomain needed) |

Set SSL/TLS mode → **Full (strict)**: Cloudflare → `nestfleet.dev` → **SSL/TLS** → **Overview**.

### 8c — SSH in and install Docker

```bash
ssh -i ~/.ssh/nestfleet-ops root@<hetzner-ip>

# Update
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### 8d — Clone repo and configure environment

```bash
git clone https://github.com/nestfleet/nestfleet.git /opt/nestfleet
cd /opt/nestfleet

# Copy and fill in production values
cp .env.example .env
nano .env   # fill in all required values (see NF-OPS-03 .env checklist)
```

Minimum production `.env` values on the main VPS:
```env
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>

# LLM (main instance uses Google Gemini)
LLM_PROVIDER=google
LLM_API_KEY=<google-api-key>
LLM_MODEL=gemini-2.5-flash-lite

# Email
RESEND_API_KEY=<resend-key>
EMAIL_FROM=NestFleet <noreply@nestfleet.dev>
SMTP_FROM=noreply@nestfleet.dev
OPS_ALERT_EMAIL=ops@nestfleet.dev

# GitHub App (Step 6)
GITHUB_APP_ID=<app-id>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=<webhook-secret>

# Stripe (live keys for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Provisioning
HETZNER_API_TOKEN=<token>
HETZNER_FIREWALL_ID=10804246
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ZONE_ID=e6a2baeeedcc3cdaaa65115c051382d3
CUSTOMER_BASE_DOMAIN=nestfleet.dev
OPS_SSH_PUBLIC_KEY=<nestfleet-ops pub key>
BUNDLED_LLM_API_KEY=<google-api-key>
BUNDLED_EMBEDDING_API_KEY=<google-api-key>

# Owner console
OWNER_USER_IDS=<your-user-id-after-first-login>
PROVISIONING_ENABLED=true
```

### 8e — Verify Caddyfile for production domains

`docker-compose.prod.yml` already includes Caddy. The `Caddyfile.prod` should route:

```caddyfile
nestfleet.dev, www.nestfleet.dev {
    reverse_proxy console:3002
}

# API is served at nestfleet.dev/api/* — already wired in Caddyfile.prod
# Customer VPS subdomains (*.nestfleet.dev) are provisioned dynamically — not on this VPS
```

> Verify `Caddyfile.prod` handles `nestfleet.dev/api/*` → `api:3001` and `/*` → `console:3002`.

### 8f — First deploy

```bash
cd /opt/nestfleet
docker compose -f docker-compose.prod.yml up -d

# Watch logs
docker compose -f docker-compose.prod.yml logs -f

# Smoke test
curl https://nestfleet.dev/api/v1/health
# Expected: {"ok": true, ...}
```

### 8g — Add GitHub Actions deploy workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy — main VPS
    runs-on: ubuntu-latest
    needs: [api]   # depends on CI job passing
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: root
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/nestfleet
            git pull origin main
            docker compose -f docker-compose.prod.yml up -d --build --no-deps api console

      - name: Smoke test
        run: |
          sleep 20
          curl --fail https://nestfleet.dev/api/v1/health
```

Add secrets to the `nestfleet` GitHub org (github.com/organizations/nestfleet/settings/secrets/actions):

| Secret | Value |
|--------|-------|
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/nestfleet-ops` (private key) |
| `HETZNER_HOST` | `<main-vps-ip>` |

---

## Step 9 — Stripe: Switch to Live Keys

> Do this immediately before first real customer, not necessarily before Phase B smoke test.

1. Stripe Dashboard → toggle from **Test mode** to **Live mode**
2. **Developers** → **API keys** → copy `sk_live_...`
3. **Developers** → **Webhooks** → **Add endpoint**:
   - URL: `https://nestfleet.dev/api/v1/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the signing secret (`whsec_...`)
5. Create live price IDs matching your plan:
   - Starter Monthly → copy `price_live_...`
6. Update `.env` on main VPS:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_live_...
```

7. Restart api container: `docker compose -f docker-compose.prod.yml up -d --no-deps api`
8. Do a full checkout test with a real card → confirm provisioning saga fires

---

## Master Checklist

### Step 1 — Domain
- [x] `nestfleet.dev` registered at Cloudflare + DNS managed by Cloudflare

### Step 2 — Cybersquatter Protection
- [~] `nestfleet.io` — skipped, deferred indefinitely

### Step 3 — Email (Google Workspace)
- [x] Google Workspace Starter plan set up for `nestfleet.dev`
- [x] MX records added in Cloudflare DNS
- [x] SPF record added in Cloudflare DNS
- [x] DKIM authenticated in Google Admin + DNS record added
- [x] DMARC record added
- [x] Mailboxes created: `info@`, `ops@`, `alerts@`, `support@`, `billing@`, `noreply@`
- [x] Catch-all routing configured in Google Admin

### Step 4 — Transactional Email (Google Workspace SMTP)
- [x] 2-Step Verification enabled on `info@nestfleet.dev`
- [x] Google app password generated for `nestfleet-prod-smtp`
- [x] `noreply@nestfleet.dev` configured as alias on `info@` account
- [x] `.env` updated: `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=info@nestfleet.dev`, `SMTP_FROM=noreply@nestfleet.dev`
- [x] `RESEND_API_KEY` removed from `.env`
- [x] Confirmed email arrives in inbox from `noreply@nestfleet.dev`

### Step 5 — GitHub Org + Repo
- [x] `nestfleet` GitHub org created at github.com/nestfleet
- [x] Org profile filled: display name `NestFleet`, website `https://nestfleet.dev`, description, email
- [x] `nestfleet/nestfleet` repo created — **private** until v0.1.0 launch
- [x] Fine-grained deploy token created (read-only, Contents + Metadata, expires 2027-04-07)
- [ ] Local repo pushed to `github.com/nestfleet/nestfleet` — deferred to Phase B
- [ ] Repo topics + homepage set — deferred to public flip
- [ ] Branch protection on `main` — deferred to after first push

### Step 6 — GitHub App
- [x] GitHub App `NestFleet` created under `nestfleet` org (App ID: 3297524)
- [x] Permissions set: Contents R/W, Pull requests R/W, Metadata R-only, Checks R-only, Deployments R-only
- [x] Webhook events subscribed: `pull_request`, `check_suite`, `deployment_status`
- [x] Private key generated + stored at `AI Projects/docs/nestfleet.2026-04-06.private-key.pem`
- [x] `.env` updated: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- [x] Personal PAT (`GITHUB_TOKEN`) removed from `.env`
- [ ] Webhook URL updated to production URL once main VPS is live (Phase B)
- [ ] Install URL added to console Settings → GitHub Integration page

### Step 8 — Prod Infra (Phase B)
- [ ] Hetzner CX21 VPS `nestfleet-main` provisioned (Ubuntu 22.04)
- [ ] Firewall 10804246 attached
- [ ] `nestfleet-ops` SSH key attached
- [ ] Docker + Docker Compose v2 installed
- [ ] `nestfleet.dev` A record → main VPS IP (proxied via Cloudflare)
- [ ] `www.nestfleet.dev` A record → main VPS IP
- [ ] Cloudflare SSL/TLS set to Full (strict)
- [ ] Repo cloned to `/opt/nestfleet`
- [ ] `.env` filled with all production values
- [ ] `Caddyfile.prod` verified for `nestfleet.dev` routing
- [ ] First deploy successful — `curl https://nestfleet.dev/api/v1/health` returns 200
- [ ] GitHub Actions deploy workflow (`.github/workflows/deploy.yml`) created
- [ ] `HETZNER_SSH_KEY` + `HETZNER_HOST` secrets added to `nestfleet` GitHub org

### Step 9 — Stripe Live
- [ ] Stripe live API key (`sk_live_...`) obtained
- [ ] Stripe webhook endpoint registered: `https://nestfleet.dev/api/v1/billing/webhook`
- [ ] Live price IDs created and set in `.env`
- [ ] Full checkout → provisioning saga smoke test passed with real card
