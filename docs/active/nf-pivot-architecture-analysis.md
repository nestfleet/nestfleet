# NF-PIVOT Architecture Analysis
> **Date:** 2026-04-01 | **Reviewed:** 2026-04-01  
> **Status:** Decision settled — single-tenant per instance, Phases 1–5 agreed  
> **Context:** NestFleet pivots to AGPL open-source + SaaS-first. PlatformCloud frozen. This document captures the full analysis leading to the final phased plan.

---

## Part 1 — PC Decoupling Deep Dive

### 1.1 What DG Actually Did (The Reference Model)

DG's decoupling was **structurally simpler** than what NF faces.

**DG's PC coupling was shallow and secondary:**
- DG was already running in `deployment_mode="saas"` with direct Stripe from the beginning (I-01/I-02 done in Phase 5, 2026-03-11)
- The `client-installed` path was bolted on via HYB-01..20 as a secondary distribution model
- The SDK (`platformcloud_sdk`) was only mounted via docker-compose volume in client-installed mode — never a core import
- The billing proxy (`DG-BIL-01`) was a thin proxy added in Phase 10 — easily deleted
- DG-PLAT-01 (SDK migration of `LicenseClient`) had just been completed (2026-03-29) before the pivot (2026-03-30) — essentially wasted work, but shallow

**What DG actually changed in Phase 12:**
- `src/api/billing.py` → stripped to profile stub + `pending_changes: []` (PC sync removed)
- `DG-SAAS-05` → free tier limits hardcoded locally (no PC)
- Cancelled DG-PLAT-02/03/04 (capability token gates)
- Verified `saas` mode worked end-to-end
- Stripe webhook (`src/stripe/webhooks.py`) was already handling events directly — no change needed

---

### 1.2 NF's Coupling Depth (Much Deeper)

NF's PC coupling is **architectural**, not just a proxy layer. Full inventory:

| Layer | Coupling | Severity |
|---|---|---|
| `src/index.ts:36-42` | `process.exit(1)` on license failure in prod | Hard blocker for self-hosting |
| `src/index.ts:84-88` | `CloudConnection.startBackgroundSync()` always called | Crashes without PC |
| `src/license/cloud-connection.ts:20-21` | `import { PlanLockLoop, HeartbeatSender } from "platformcloud-client"` | Hard npm dependency |
| `src/license/validator.ts:394-572` | `refreshFromCloud()` — full LPP protocol (~180 lines) | Hardwired to PC `/api/v1/license/validate` |
| `src/api/v1/license.ts:109-260` | 4 billing proxy routes (checkout, portal, upgrade, downgrade) | All billing goes through PC |
| `src/billing/ou-tracker.ts:69` | `getLicenseState()?.payload?.maxOutcomeUnitsMonthly` | OU limit sourced from PC response |
| `src/license/manifest.ts` | `pushCapabilities()` — pushes manifest to PC | Useless without PC |
| `package.json:40` | `"platformcloud-client": "file:../PlatformCloud/..."` | Local file reference to PC project |
| `src/shared/config.ts:26-33` | `PLATFORM_CLOUD_URL`, `PLATFORM_CLOUD_TOKEN`, `NESTFLEET_LICENSE_KEY` | 3 PC-specific env vars |

**NF has zero existing Stripe integration.** DG had it; NF never did.

---

### 1.3 What's In the Backlog (NF-PIVOT-01..10)

All 10 items defined in `docs/active/active-backlog.md §12`. Status at time of analysis: all `🔲 NOT STARTED`.

| ID | Item | Priority | Issue |
|---|---|---|---|
| NF-PIVOT-01 | Remove `process.exit(1)` | P0 | Well-defined ✅ |
| NF-PIVOT-02 | Make CloudConnection optional | P0 | **Understated — see Gap #1** |
| NF-PIVOT-03 | Hardcode free tier limits | P0 | **Superseded — community = unlimited** |
| NF-PIVOT-04 | Wire Stripe directly | P0 | **Missing DB migration — Gap #3** |
| NF-PIVOT-05 | AGPL + GitHub publish | P0 | Blocked ORGA-01 ✅ |
| NF-PIVOT-06 | docker-compose.prod.yml | P0 | Well-defined ✅ |
| NF-PIVOT-07 | Legal templates BSL → AGPL | P1 | Well-defined ✅ |
| NF-PIVOT-08 | Landing page + signup | P1 | No detailed spec — Gap #4 |
| NF-PIVOT-09 | Production readiness | P1 | Well-defined ✅ |
| NF-PIVOT-10 | Remove PC coupling (cleanup) | P2 | Ordering dependency — Gap #1 |

---

### 1.4 Gaps & Concerns

#### Gap #1 — NF-PIVOT-02 scope was understated (critical)

The spec said "gate all CloudConnection calls on `!!NESTFLEET_LICENSE_KEY`." But `cloud-connection.ts` starts with:
```typescript
import { PlanLockLoop, HeartbeatSender } from "platformcloud-client"
```
The SDK import happens at module load time. Even if you never instantiate `CloudConnection`, this import runs — and it references a local file path (`file:../PlatformCloud/...`). This is a land mine for the AGPL repo (NF-PIVOT-05).

**Resolved:** NF-PIVOT-02 expanded to include rewriting `cloud-connection.ts` using plain `fetch()` — removing the SDK dependency entirely. NF-PIVOT-10 becomes residual cleanup only.

#### Gap #2 — `isFeatureEnabled()` behavior

Currently: no license = everything enabled (dev mode). The original NF-PIVOT-03 proposed `COMMUNITY_LIMITS` to restrict community users.

**Resolved:** Community = unlimited. AGPL self-hosters get full freedom — limits are trivial to remove having the source code. `isFeatureEnabled()` continues returning `true` with no license. NF-PIVOT-03 simplifies to: confirm no-PC → all features enabled, no `COMMUNITY_LIMITS` constant needed.

#### Gap #3 — NF-PIVOT-04 missing DB migration spec

NF-PIVOT-04 creates Stripe Checkout sessions and handles webhooks that "update plan in DB" — but NF has no `workspace_billing` table or any Stripe ID storage.

**Resolved:** New `workspace_billing` singleton table (migration `0040`) — one row per deployment. See Phase 3 detail below.

#### Gap #4 — NF-PIVOT-08 has no detailed spec

DG's DG-SAAS-06 was a well-detailed spec with component breakdown. NF-PIVOT-08 is 7 bullet points. A full spec is needed before starting this work. Deferred to Phase 4/5.

#### Gap #5 — `refreshFromCloud()` fate

`validator.ts:394-572` is ~180 lines of LPP protocol. After decoupling these become dead code. Decision: **remove `refreshFromCloud()` and all LPP state from `validator.ts` in Phase 1** (Option A — cleaner, fewer half-alive paths). Keep only `validateLicense()`, `isFeatureEnabled()`, `getLicenseTier()`.

#### Gap #6 — OU tracker limit source

`getOuUsage()` reads `getLicenseState()?.payload?.maxOutcomeUnitsMonthly`. With no license and community = unlimited, `limit = 0` already means unlimited in the existing enforcement logic (`if (limit === 0) return "ok"`). No change needed.

---

### 1.5 Decisions Made

| Question | Decision |
|---|---|
| Billing entity architecture | Single-tenant per instance (see Part 2 + Part 3) |
| NF-PIVOT-02 scope | Make CloudConnection optional + remove SDK → plain `fetch` |
| Community limits | No limits — community = full freedom (AGPL) |
| Phase execution order | Plan Phases 2–5 in parallel; **execute strictly 1 → 2+3 → 4 → 5** (see §4) |
| Stripe account | **Separate Stripe account for NF** — not shared with DG (see review concern #1) |
| `refreshFromCloud()` | Remove entirely in Phase 1 (Option A) |

---

## Part 2 — Single-Tenant Per Instance vs Multi-Tenant SaaS

### 2.1 Single-Tenant Per Instance

Each paying customer gets their own dedicated Hetzner deployment. "SaaS" means we operate it for them, not that they share infrastructure.

**Pros:**

| # | Pro | Weight |
|---|---|---|
| 1 | **Zero code changes for multi-tenancy** — NF ships as-is. Multi-tenancy epic disappears entirely. | ★★★★★ |
| 2 | **Complete data isolation** — no cross-tenant leakage risk, no missed `WHERE tenant_id` security incidents | ★★★★★ |
| 3 | **Architecturally identical to self-hosted** — AGPL community version and managed SaaS are the same binary. Same `docker-compose.prod.yml`, same ops playbook. | ★★★★ |
| 4 | **Enterprise-friendly by default** — B2B customers often specifically want "my data is on my server." Selling point, not limitation. | ★★★★ |
| 5 | **Independent blast radius** — one customer's heavy LLM load or outage doesn't affect others. | ★★★ |
| 6 | **Billing stays simple** — `workspace_billing` singleton (Phase 3) is all that's needed. No per-tenant billing complexity. | ★★★ |
| 7 | **Hetzner unit economics work** — CAX11 (2 vCPU, 4GB RAM) = €3.79/mo. At $49/mo STARTER tier, margin is excellent even for a dedicated instance. | ★★★ |

**Cons:**

| # | Con | Weight | Mitigation |
|---|---|---|---|
| 1 | **Provisioning automation required** — new signup = spin up VPS/container + DNS + DB + deploy. Not instant. | ★★★★ | Start manual/semi-manual for first 20 customers. Build automation script (~1-2 days) when needed. |
| 2 | **Fleet maintenance** — 50 customers = 50 instances to patch, update, monitor. Scales linearly. | ★★★ | Acceptable until ~50-100 customers. Kamal/Ansible/Helm fan-out handles updates. |
| 3 | **No viable free cloud tier** — can't provision a dedicated VPS for every free signup. | ★★★ | Free tier = self-hosted AGPL. Managed SaaS starts at STARTER paid. Natural funnel. |
| 4 | **Slower onboarding** — provisioning takes 2-5 min, not instant. | ★★ | Acceptable for B2B. "Your instance is being prepared" is standard. |

---

### 2.2 Multi-Tenant SaaS

All customers share one deployment, isolated by `tenant_id`.

**Pros:**

| # | Pro | Weight |
|---|---|---|
| 1 | **Instant signup** — workspace created immediately | ★★★ |
| 2 | **Free tier viable** — pack 100 free users on one €15/mo VPS | ★★★ |
| 3 | **Single deployment to maintain** | ★★★ |

**Cons:**

| # | Con | Weight | Note |
|---|---|---|---|
| 1 | **~1 week migration work** — `tenant_id` FK on ~15 tables, all repository queries, auth middleware | ★★★★★ | None of NF's 15+ core tables have `tenant_id` |
| 2 | **Cross-tenant leakage risk** — one missed `WHERE tenant_id` is a GDPR incident in a B2B support tool | ★★★★ | Serious risk for a tool handling customer conversations |
| 3 | **Noisy neighbor** — one tenant's LLM/webhook spikes affect others | ★★★ | |
| 4 | **GDPR complexity** — per-tenant data deletion, DPA per customer, audit isolation | ★★★ | |

---

### 2.3 Context That Favours Single-Tenant for NF

- **Customer profile**: 5–50 operators per company, processing sensitive support conversations and change requests — exactly the customers who prefer data isolation.
- **AGPL funnel**: Technical teams self-host. Non-technical/smaller teams pay for managed. Both are fine with a dedicated instance.
- **Volume**: B2B tool — customer count is manageable at single-tenant scale for a long time.
- **DG comparison**: DG is multi-tenant because it plugs passively into GitHub PRs (low per-user resource usage). NF runs AI agents, webhooks, chat, cron workers — per-instance isolation is operationally cleaner.
- **Multi-tenancy can be added later** with a concrete trigger (see Key Decisions Summary).

**Verdict: single-tenant per instance.**

---

## Part 3 — Operational Reality at Scale

### 3.1 Spin-up Reliability

A full automated provisioning run requires:

1. Hetzner API → create VPS or allocate container slot on shared server
2. DNS API → create `customer.nestfleet.dev` A record
3. PostgreSQL → create database + run migrations
4. Secret generation → JWT secret, encryption key, etc.
5. Stripe API → create Customer record
6. Deploy NestFleet stack → `docker compose up`
7. Caddy → auto-provision Let's Encrypt cert
8. Health check → wait for `/health` to respond
9. Register `/health` endpoint in BetterStack monitor for this customer
10. Send "your instance is ready" email

Each step can fail independently. Idempotency, retry logic, rollback on failure all need to be built. This is a **1-2 day engineering task** to make reliable — not blocking launch, done when customer volume demands it.

Speed: ~2-5 minutes end-to-end. Acceptable for B2B.

---

### 3.2 Fleet Management Options

| Option | What | Complexity | Best for |
|---|---|---|---|
| **Kamal** | SSH-based deploy tool (37signals). Fan out `kamal deploy` to N servers. Docker-native. | Low | Separate-VPS model. One command updates all instances. |
| **Coolify / Dokku** | Self-hosted PaaS on shared server. Each customer = one "app." Web UI for management. | Low–Medium | Shared-server model. Heroku-like, battle-tested. |
| **k3s + Helm** | Kubernetes cluster. Each customer = Helm release in own namespace. `helm upgrade --all` for fleet updates. NestFleet already has `helm/` directory. | Medium–High | Right choice at 50+ customers. Overkill for <30. |

---

### 3.3 Architecture Options

**Architecture A — Separate VPS per customer**
```
customer1.nestfleet.dev → Hetzner CAX11 (€3.79/mo)  [NF + Postgres]
customer2.nestfleet.dev → Hetzner CAX11 (€3.79/mo)  [NF + Postgres]
```
- Complete isolation, easy suspend/delete
- Most expensive per customer, most management overhead

**Architecture B — Shared server, Docker Compose stacks (recommended for launch)**
```
One Hetzner AX41 bare metal (€58/mo, 8 vCPU, 64GB)
├── Caddy (reverse proxy, TLS — same as DG, consistent ops playbook)
├── Shared PostgreSQL (one cluster, per-customer database)
├── customer1_api  + customer1_console  (Docker network: customer1)
├── customer2_api  + customer2_console  (Docker network: customer2)
└── ...up to ~50 customers comfortably
```
- Per-customer Docker networks give process isolation
- Separate database per customer — still DB-level isolated
- **Reverse proxy: Caddy** (not Traefik) — same tooling as DG means one ops mental model across both products
- **⚠️ SPOF risk**: if the AX41 goes down, all customers on it go down simultaneously. Snapshot restore = 20-30 min outage for entire customer base. Mitigations required from day one:
  - Hetzner automatic backups enabled (daily snapshots retained 7 days)
  - BetterStack free tier: one uptime monitor per customer instance + one for the host itself
  - Defined SLA communicated to customers at signup: **99.5% monthly uptime** (≈3.6h downtime/month). Honest for single-server shared infra.
  - Caddy + per-customer health checks: if a specific stack is down, it doesn't affect others on the same host
- **⚠️ Secret security**: customer LLM API keys stored as Docker secrets (not plain `.env` files). Each customer's secrets are in an isolated Docker secret scoped to their stack's network. If the server is compromised, secret files are not readable as plaintext. See Phase 5.3.

**Architecture C — k3s cluster (right choice at 30+ customers — begin prep, not migration)**
```
3× Hetzner CX52 (8 vCPU, 32GB, €31/mo each = €93/mo total)
├── Hetzner Load Balancer (€6/mo)
├── Hetzner Managed PostgreSQL (one cluster, per-customer database)
└── Per customer: Helm release in own namespace, resource limits enforced
```
- Helm chart already in NestFleet repo
- Fleet update: `helm list --all | xargs helm upgrade`
- HA: pods reschedule across nodes on failure
- Noisy neighbour solved via namespace resource limits
- **Migration note**: moving from Arch B to Arch C requires migrating live PostgreSQL databases and reconfiguring DNS for all active customers. This is non-trivial under load. The migration path must be planned before you reach 50 customers, not at 50 when you're under pressure. **Begin Arch C preparation in parallel at ~30 customers**: set up the k3s cluster and validate the Helm chart against `docker-compose.prod.yml` data layout while Arch B is still the live environment. Cut over customer-by-customer.

---

### 3.4 Per-Instance Resource Estimate

NestFleet per instance (idle B2B tool, customer provides own LLM keys):

| Component | RAM | vCPU (avg) |
|---|---|---|
| Node.js API + workers | ~256MB | 0.1–0.3 |
| Next.js console | ~128MB | 0.05 |
| PostgreSQL | ~256MB | 0.05–0.1 |
| **Total** | **~640MB** | **~0.2–0.5** |

Mostly I/O bound — DB queries and outbound API calls. No heavy compute on NestFleet's side.

---

### 3.5 Cost at 100 Orgs

#### Architecture B — Shared server(s):

| Scale | Compute | Managed PostgreSQL | Load Balancer | Total |
|---|---|---|---|---|
| 25 orgs | 1× AX41 €58/mo | €45/mo | €6/mo | **~€109/mo** |
| 50 orgs | 1× AX61 (12 vCPU, 128GB) ~€100/mo | €45/mo | €6/mo | **~€151/mo** |
| 100 orgs | 2× AX61 ~€200/mo | Hetzner DB Pro €95/mo | €6/mo | **~€300/mo** |

#### Architecture C — k3s:

| Scale | Nodes | PostgreSQL | LB | Total |
|---|---|---|---|---|
| 100 orgs | 3× CX52 €93/mo | €95/mo | €6/mo | **~€194/mo** |

#### Revenue vs cost at 100 paying orgs:

| Scenario | Revenue | Infra cost | Gross margin |
|---|---|---|---|
| 100× STARTER ($49/mo) | $4,900/mo | ~€200–300/mo (~$220–330) | **93–95%** |
| 50× GROWTH + 50× STARTER | $9,950/mo | same | **96–97%** |

---

### 3.6 Recommended Progression

| Stage | Customer count | Architecture | Management | Key action |
|---|---|---|---|---|
| **Launch** | 1–20 | Arch B: one shared AX41 | Manual provisioning (SSH + script) | BetterStack monitors live from customer #1 |
| **Growth** | 20–30 | Arch B: same server | Coolify or provisioning script | Build full provisioning automation |
| **Prepare C** | ~30 | Arch B live + Arch C in parallel | Begin k3s cluster + Helm validation | Validate Helm against existing data layout before load |
| **Migrate** | 30–50 | Cut over customer-by-customer to Arch C | Helm + k3s | Per-customer DB migration + DNS cutover |
| **Scale** | 50–100+ | Arch C fully live | Helm fleet management | Full automation via Hetzner API |

**Key change from earlier draft:** Arch C prep starts at **~30 customers**, not 50. At 50 you're already under operational pressure. Migrate calmly at 30.

---

## Part 4 — Final Phased Plan

> **Execution order is strictly sequential: Phase 1 must be complete before Phase 2/3 begin.**  
> Phases 2–5 can be *planned and specced* in parallel during Phase 1, but code execution does not start until Phase 1 is merged and the test suite is green. Integrating Stripe against code that still has `process.exit(1)` on license failure creates confusing failure modes.

---

### Phase 1 — PC Decoupling Core (~1 day)

| Step | What | Key files |
|---|---|---|
| 1.1 | Remove `process.exit(1)` on license failure | `src/index.ts` |
| 1.2 | Rewrite `CloudConnection` — remove `platformcloud-client` import, replace `PlanLockLoop`/`HeartbeatSender` with plain `fetch`, gate on `NESTFLEET_LICENSE_KEY` | `src/license/cloud-connection.ts` |
| 1.3 | Remove `refreshFromCloud()` and all LPP state from validator | `src/license/validator.ts` |
| 1.4 | Confirm no-license = all features enabled, OU limit = 0 (unlimited) | `src/license/validator.ts`, `src/billing/ou-tracker.ts` |
| 1.5 | Mark `PLATFORM_CLOUD_URL`, `PLATFORM_CLOUD_TOKEN` fully optional, remove defaults | `src/shared/config.ts` |
| 1.6 | Update tests — remove any expecting `process.exit(1)` on bad license | `tests/unit/license/` |

**Gate:** full test suite green before Phase 2/3 start.

---

### Phase 2 — docker-compose + AGPL Publish Prep (~0.5 day)

*Starts after Phase 1 is merged.*

| Step | What |
|---|---|
| 2.1 | `docker-compose.prod.yml` — NF API + Next.js console + PostgreSQL + pg-boss + **Caddy** (not Traefik — consistent with DG ops). No PC containers. Stripe env vars only. |
| 2.2 | `LICENSE` file (AGPL-3.0 full text), AGPL headers in key source files |
| 2.3 | Audit codebase for PC-specific secrets or refs that shouldn't be public |
| 2.4 | `README.md` + `CONTRIBUTING.md` |
| 2.5 | Update legal templates BSL → AGPL |
| 2.6 | Blocked: actual GitHub push waits on ORGA-01 |

---

### Phase 3 — Direct Stripe Billing (single-tenant) (~2.5–3 days)

*Starts after Phase 1 is merged. Can run in parallel with Phase 2.*

> **Note on timeline:** DG's Stripe was built incrementally over multiple phases with an existing foundation. NF starts from zero — checkout + portal + webhooks + DB migration + console UI + tests realistically takes **2.5–3 days**, not 1.5. Plan accordingly.

> **NF uses its own Stripe account** (separate from DG). Reasons: mixed Customer objects create billing archaeology, webhook routing to two endpoints is a silent failure risk, and MRR reporting is polluted. Creating a new Stripe account takes 10 minutes and prevents permanent confusion. NF's sandbox price IDs, webhook signing secrets, and Stripe Dashboard are fully independent from DG.

| Step | What | Notes |
|---|---|---|
| 3.1 | Migration `0040_workspace_billing.sql` | Singleton table: `id`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `plan_interval`, `cancel_at`, `trial_ends_at`, `updated_at` |
| 3.2 | `src/billing/stripe.ts` | Stripe client singleton. Price ID map: `STARTER_MONTHLY`, `STARTER_ANNUAL`, `GROWTH_MONTHLY`, `GROWTH_ANNUAL`. |
| 3.3 | `src/billing/plans.ts` | COMMUNITY (free, unlimited), STARTER ($49/mo), GROWTH ($149/mo), SCALE (contact) |
| 3.4 | `src/billing/webhook.ts` | Handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → write to `workspace_billing`. Mirror DG's `stripe/sync.py` pattern. |
| 3.5 | `src/api/v1/billing.ts` (new) | `POST /api/v1/billing/checkout`, `/portal`, `/downgrade`, `GET /api/v1/billing/status` → direct Stripe calls. Remove PC proxy routes from `license.ts`. |
| 3.6 | Console billing UI | `console/src/app/settings/page.tsx` billing section reads from `GET /api/v1/billing/status`. Upgrade CTAs, portal link, cancel_at banner. |
| 3.7 | `POST /webhooks/stripe` route | Mounted at Hono app root. Stripe signature verification (same pattern as DG). |
| 3.8 | Config additions | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUAL` |
| 3.9 | Tests | Webhook handler unit tests (mirror DG's 13 billing-checkout tests), plan sync integration tests |

---

### Phase 4 — PC Coupling Full Cleanup (~0.5 day)

*Starts after Phase 3 is merged and Stripe is verified working.*

| Step | What |
|---|---|
| 4.1 | Delete `src/license/manifest.ts`, `src/license/hmac-response.ts` |
| 4.2 | Delete `src/license/cloud-connection.ts` (fully replaced in Phase 1) |
| 4.3 | Remove `platformcloud-client` from `package.json` |
| 4.4 | Remove `PLATFORM_CLOUD_URL`, `PLATFORM_CLOUD_TOKEN`, `NESTFLEET_LICENSE_KEY` from `config.ts` |
| 4.5 | Remove PC-targeted tests; confirm full suite still green |
| 4.6 | Verify: `grep -r "PLATFORM_CLOUD" src/` → 0 results; `grep -r "LICENSE_FILE_PATH" src/` → 0 results |

---

### Phase 5 — Hetzner SaaS Provisioning (infrastructure track)

*Lives outside the NestFleet codebase. Done when first paying customer is onboarded.*

| Step | What |
|---|---|
| 5.1 | Provisioning script: Hetzner API → create container slot on AX41 → generate secrets → run `docker compose up` → configure Caddy virtual host → create DNS A record → health check wait → register BetterStack monitor |
| 5.2 | **Instances control-plane table** (not a spreadsheet — breaks at customer #10): lightweight Postgres table or SQLite DB with columns: `id`, `customer_email`, `subdomain`, `hetzner_server_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status` (`provisioning \| active \| suspended \| deprovisioned`), `provisioned_at`, `notes`. This table drives automated deprovisioning on Stripe `customer.subscription.deleted` events — even if that deprovisioning remains manual at first. |
| 5.3 | **Secret management**: customer-specific env vars (LLM API keys, JWT secrets, encryption keys) stored as Docker secrets scoped to each customer's stack network — not as plain `.env` files on the shared filesystem. A compromised host exposes container memory, not the secret files. Document the secret rotation procedure. |
| 5.4 | **Monitoring from day one**: BetterStack free tier — one uptime monitor per customer instance polling `/health` every 60s. One monitor for the host itself. Alert to `ops@nestfleet.dev`. Centralized log aggregation: Loki container on the shared server, each customer stack ships logs via Docker's loki log driver. Single Grafana dashboard across all instances. |
| 5.5 | Define and publish SLA: **99.5% monthly uptime** for Arch B (≈3.6h downtime/month). Customers on shared server share the host's availability window. Document this at signup. Arch C (k3s, HA) enables a higher SLA tier if needed later. |
| 5.6 | NF-PIVOT-08: Landing page with "Request managed instance" CTA — detailed spec to be written separately before starting |
| 5.7 | NF-PIVOT-09: Production readiness checklist (Privacy Policy, Terms, DPA, support email, Stripe tax, `security.txt`) |

---

## Key Decisions Summary

| Decision | Outcome |
|---|---|
| PC decoupling approach | Remove entirely — not stub. Clean break. |
| Community limits | No limits. AGPL = full freedom. |
| `refreshFromCloud()` | Remove in Phase 1 (Option A — no half-alive code). |
| Billing entity | `workspace_billing` singleton table (one row per deployment). |
| SaaS architecture | **Single-tenant per instance.** No multi-tenancy code needed. |
| Stripe account | **Separate Stripe account for NF.** Not shared with DG — avoids mixed Customer objects, webhook routing risk, and polluted MRR reporting. |
| Reverse proxy | **Caddy** throughout (Arch B and docker-compose.prod.yml) — consistent with DG, single ops mental model. |
| Infrastructure launch path | Arch B (shared server) launch → Arch C (k3s) **prep starts at ~30 customers**, cutover at 30–50. |
| Secret storage | Docker secrets per customer stack — not plain `.env` files on shared filesystem. |
| Customer registry | Instances control-plane table (not spreadsheet) from day one, including `stripe_subscription_id` for automated lifecycle management. |
| Monitoring | BetterStack per-instance monitor + Loki log aggregation from customer #1, not customer #20. |
| SLA | 99.5% monthly uptime on Arch B. Documented at customer signup. |
| Phase execution order | Plan all phases in parallel. **Execute strictly: 1 → 2+3 (parallel) → 4 → 5.** |
| Phase 3 timeline | **2.5–3 days** (not 1.5 — NF starts from zero Stripe code). |
| Multi-tenancy | Deferred. **Concrete re-evaluation trigger:** >50 managed customers AND provisioning time >30 min/customer AND onboarding churn data shows friction. All three conditions required before revisiting. |
