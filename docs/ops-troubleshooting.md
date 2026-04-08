# NestFleet — Ops Troubleshooting Cheat Sheet

> Main VPS: `178.104.141.130` · SSH: `ssh root@178.104.141.130`  
> Owner Console: `https://nestfleet.dev/owner`  
> Health endpoint: `https://nestfleet.dev/health`

---

## 1. Quick Diagnostics

```bash
# Overall health (DB + pg-boss)
curl -s https://nestfleet.dev/health | jq

# Container status
ssh root@178.104.141.130 "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Tail all logs (last 100 lines)
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs --tail=100"

# Tail a specific service
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs -f api"
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs -f console"
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs -f caddy"
```

---

## 2. Main VPS — Services & Stack

| Container | Role | Port |
|-----------|------|------|
| `nestfleet-api-1` | Hono API + pg-boss workers | 3001 (internal) |
| `nestfleet-console-1` | Next.js Owner Console | 3000 (internal) |
| `nestfleet-caddy-1` | Reverse proxy + TLS | 80/443 (public) |
| `nestfleet-postgres-1` | PostgreSQL + pgvector | 5432 (internal) |
| `nestfleet-jaeger` | Tracing (optional) | 16686 (internal) |

Files on disk:
```
/opt/nestfleet/
  docker-compose.prod.yml   ← main compose file
  .env                      ← all secrets (PROVISIONING_ENABLED, HETZNER_*, CF_*, STRIPE_*, etc.)
  docker/Caddyfile.prod     ← Caddy routing config
```

---

## 3. Restart Services

```bash
cd /opt/nestfleet

# Restart single service (zero-downtime for stateless ones)
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart console
docker compose -f docker-compose.prod.yml restart caddy

# Full restart (all services)
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Restart only API + Console (DB stays up)
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate api console
```

---

## 4. Deployment Pipeline (CI/CD)

Push to `main` triggers this sequence in GitHub Actions:

```
api job       → tsc --noEmit, npm test, npm run build, npm audit
console job   → tsc, npm audit
secrets job   → gitleaks scan
    ↓ all pass
deploy job    → SSH to 178.104.141.130:
                  git fetch + reset --hard origin/main
                  docker compose build api console
                  docker compose up -d --no-deps api console
              → smoke test: GET /health, POST /auth/login, GET /auth/me
    ↓
e2e job       → Playwright post-deploy.spec.ts against nestfleet.dev
```

**If deploy job fails:**
```bash
# Check what CI ran
gh run list --branch main --limit 5
gh run view <run-id> --log-failed

# Re-run failed jobs only
gh run rerun <run-id> --failed
```

**If deploy succeeded but app is broken:**
```bash
# Check if new code is actually running
ssh root@178.104.141.130 "docker inspect nestfleet-api-1 --format '{{.Config.Labels}}'"
ssh root@178.104.141.130 "git -C /opt/nestfleet log --oneline -3"
```

**Manual deploy (emergency bypass of CI):**
```bash
ssh root@178.104.141.130 "
  cd /opt/nestfleet &&
  git fetch origin main &&
  git reset --hard origin/main &&
  docker compose -f docker-compose.prod.yml build api console &&
  docker compose -f docker-compose.prod.yml up -d --no-deps api console
"
```

---

## 5. Common Failure Scenarios — Main VPS

### API won't start / keeps restarting
```bash
docker compose -f docker-compose.prod.yml logs api | tail -50
# Look for: missing env var, DB connection refused, migration failure
```
- Missing required env var → check `/opt/nestfleet/.env`, then `docker compose up -d api`
- DB not ready → check `docker compose logs postgres`, ensure `pg_isready` passes
- Migration failure → look for SQL error in logs; fix migration, restart api

### Caddy not serving TLS / 502
```bash
docker compose -f docker-compose.prod.yml logs caddy | tail -30
```
- 502 → API or Console container is down; restart them first
- TLS cert failure → Caddy auto-renews Let's Encrypt; check DNS A record points to `178.104.141.130`
- Config error → `docker exec nestfleet-caddy-1 caddy validate --config /etc/caddy/Caddyfile`

### pg-boss queue not processing jobs
```bash
# Health endpoint shows queue status
curl -s https://nestfleet.dev/health | jq .queue
# Expected: "started"

# If "stopped" or missing → restart API (pg-boss reconnects on startup)
docker compose -f docker-compose.prod.yml restart api
```

### DB connection pool exhausted (503 on all endpoints)
```bash
docker compose -f docker-config.prod.yml logs api | grep "pool\|connection\|exhausted"
# Fix: restart api to reset pool; investigate concurrent job spikes
```

### Email not sending
- Check SMTP env vars in `.env` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
- Test: `curl -s https://nestfleet.dev/health` — email failures are non-fatal, check logs
- Logs: `docker compose logs api | grep "email\|smtp\|SMTP"`

---

## 6. Provisioning — Customer VPS Flow

### Where to look when provisioning fails

**Owner Console** → Fleet page shows `status` column: `provisioning` / `failed` / `active`

**API logs** (most detail):
```bash
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs api | grep -i 'ProvisioningSaga\|<slug>'"
```

**Failure modes and fixes:**

| Status | Likely cause | Fix |
|--------|-------------|-----|
| `failed` (Hetzner step) | API token invalid / quota exceeded | Check Hetzner console; hit retry in Owner Console |
| `failed` (DNS step) | Cloudflare token/zone wrong | VPS was deleted automatically; check CF token; retry |
| `failed` (health timeout) | VPS booted but cloud-init failed | SSH to VPS IP, check below; use Owner Console retry |
| Stuck at `provisioning` | pg-boss worker crashed | Restart API; pg-boss retries the job |

**Retry a failed provisioning:**
Owner Console → Fleet → row → **Retry** button (re-runs saga from last completed step)

### SSH into a customer VPS to investigate
```bash
ssh root@<VPS_IP>   # IP visible in Owner Console fleet table

# cloud-init log (boot provisioning script output)
cat /var/log/cloud-init-output.log

# Check if Docker is running
docker ps

# Check NestFleet services
docker compose -f /opt/nestfleet/docker-compose.prod.yml ps
docker compose -f /opt/nestfleet/docker-compose.prod.yml logs --tail=50 api

# Check license file was written
cat /opt/nestfleet/license.jwt   # should be a JWT string

# Restart everything on customer VPS
cd /opt/nestfleet && docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Cloud-init didn't complete (VPS boots, app never starts)
```bash
# On customer VPS:
cat /var/log/cloud-init-output.log | grep -i "error\|failed\|exception"

# Docker CE may not be installed yet — check:
which docker || echo "Docker not installed"

# If Docker missing, cloud-init likely failed mid-run. Check network / apt errors.
# Manual fix:
curl -fsSL https://get.docker.com | sh
cd /opt/nestfleet && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

### Customer VPS: wrong plan tier shown (Community instead of paid)
```bash
# On customer VPS:
cat /opt/nestfleet/license.jwt          # must exist
cat /opt/nestfleet/.env | grep LICENSE  # LICENSE_FILE_PATH and LICENSE_SECRET must be set

# If license.jwt is missing (provisioned before the fix):
# Generate a new token via: npx tsx scripts/issue-license.ts --slug <slug> --plan starter
# Then copy to customer VPS:
scp license.jwt root@<VPS_IP>:/opt/nestfleet/license.jwt
ssh root@<VPS_IP> "chmod 600 /opt/nestfleet/license.jwt && docker compose -f /opt/nestfleet/docker-compose.prod.yml restart api"
```

---

## 7. Deprovisioning

**Owner Console** → Fleet → Deprovision button → confirmation dialog → **immediate delete** (no grace period from console).

What it does:
1. Calls Hetzner DELETE `/servers/<id>` — VPS is gone
2. Calls Cloudflare DELETE DNS record — subdomain stops resolving
3. Sets `status = 'deprovisioned'` in DB

**Stale records** (server already gone): Hetzner 404 is caught and logged as non-fatal. Cloudflare delete still runs. DB still gets marked `deprovisioned`. Safe to click.

**If Cloudflare record lingers** after deprovision:
```bash
# Check Cloudflare dashboard, or:
curl -s "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=<slug>.nestfleet.dev" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[].id'
# Then delete manually via CF dashboard
```

---

## 8. Database — Direct Access

```bash
ssh root@178.104.141.130
docker exec -it nestfleet-postgres-1 psql -U nestfleet -d nestfleet

# Useful queries:
# Check provisioning status
SELECT org_slug, status, hetzner_server_id, cloudflare_record_id, provisioned_at
FROM provisionings ORDER BY created_at DESC LIMIT 10;

# Check a user's product_ids (if stuck at resolve-product)
SELECT user_id, email, product_ids FROM operator_users WHERE email = 'user@example.com';

# Fix product_ids manually if setup wizard auth bug hit an old VPS:
UPDATE operator_users SET product_ids = ARRAY['<product_id>'] WHERE email = 'user@example.com';

# Check pg-boss jobs
SELECT name, state, createdon, startedon, completedon
FROM pgboss.job ORDER BY createdon DESC LIMIT 20;
```

---

## 9. Stripe Webhooks

Webhook endpoint: `POST https://nestfleet.dev/stripe/webhook`

```bash
# Check recent webhook events in logs
ssh root@178.104.141.130 "docker compose -f /opt/nestfleet/docker-compose.prod.yml logs api | grep -i 'stripe\|webhook\|checkout\|payment'"

# If webhook signature fails: verify STRIPE_WEBHOOK_SECRET in .env matches the
# endpoint secret shown in Stripe Dashboard → Developers → Webhooks

# Replay a failed event: Stripe Dashboard → Developers → Webhooks → select event → Resend
```

---

## 10. Logs Reference

| What you're debugging | Where to look |
|----------------------|---------------|
| API errors / crashes | `docker compose logs api` |
| TLS / routing | `docker compose logs caddy` |
| DB startup / health | `docker compose logs postgres` |
| CI build failures | GitHub Actions → CI run → failed step |
| Provisioning saga | API logs filtered by slug |
| Customer VPS boot | `cat /var/log/cloud-init-output.log` on VPS |
| Customer VPS app | `docker compose logs api` on VPS |
| Stripe events | Stripe Dashboard → Developers → Events |
| Ops alerts | `OPS_ALERT_EMAIL` inbox |
