# Path to Production — NestFleet + Acme

> **Living document.** Updated as each phase is completed.
> Covers both products in a single unified roadmap — shared infrastructure is done once.
> Last updated: 2026-03-23

---

## Deployment Model

```
Customer's VPC / server
┌─────────────────────────────────────┐
│  NestFleet (or Acme)        │
│  ─ Docker container(s)              │
│  ─ PostgreSQL + pgvector            │
│  ─ All case/support data stays here │
└──────────────┬──────────────────────┘
               │ HTTPS (metadata only)
               │ license check + update manifest
               │ version, OU count — NO PII, NO content
               ▼
┌─────────────────────────────────────┐
│  PlatformCloud (your cloud)         │
│  ─ License validation (JWT)         │
│  ─ Update manifests                 │
│  ─ Compliance template bundles      │
│  ─ Quality benchmarks               │
└─────────────────────────────────────┘

Distribution:
  GitHub releases → Docker images (GHCR)
  Customer pulls image → self-hosts → gets license key from landing page
  Updates: PlatformCloud serves update manifest → product notifies operator
```

NestFleet is never SaaS. Customer data never reaches you. You are a software vendor.

---

## Community Tier — Compliance Scope

GDPR cares about data processing, not money flow. Minimum required for Community-only launch:

| Task | Required for Community | Notes |
|------|------------------------|-------|
| Internal DPIA for PlatformCloud metadata | **Yes** | Receives license ID, version, OU counts — company-identifiable |
| Privacy notice on website | **Yes** | Sign-up collects email |
| AI disclosure in product | **Yes** | AI Act transparency — Aug 2, 2026 deadline |
| Minimal DPA template for customers | **Yes (template only)** | Customer signs; you provide the template |
| BSL + Terms of Service | **Yes** | Legal wrapper for distribution |
| Full DPIA template pack (customer-facing) | Defer → Starter | Only when paying customers run DPIA-triggering workloads |
| BSI IT-Grundschutz audit | Defer → Scale | Enterprise procurement gate |
| DPO appointment | Assess at 20+ staff | Document "below threshold" decision now |
| Compliance bundle in product (CG-08–13) | Defer → Growth | Gate behind feature flag |
| Stripe / billing | Defer → Starter | No money flow in Community |

---

## Phases

### PHASE 0 — Legal & Identity
**Shared. Blocks: landing pages, distribution.**

- [ ] Confirm legal entity (sole trader / GmbH / UG)
- [ ] Draft BSL license text (parameterised — reuse for both products)
- [ ] Draft Terms of Service (for landing pages)
- [ ] Draft Privacy Notice (covers sign-up email + PlatformCloud metadata)
- [ ] Write internal DPIA for PlatformCloud cloud-connection metadata (~3 pages)
- [ ] Prepare minimal DPA template (customer fills and signs)
- [ ] Document "DPO assessment — below threshold" decision

---

### PHASE 1 — Domains & DNS
**Shared. Blocks: email, landing pages, TLS.**

- [ ] `nestfleet.dev` — register / confirm ownership
- [ ] `acme.io` — register / confirm ownership
- [ ] `platformcloud.io` (or subdomain) — for PlatformCloud API
- [ ] DNS: A records pointing to hosting
- [ ] DNS: MX records (Google Workspace)
- [ ] DNS: SPF, DKIM, DMARC for each domain
- [ ] TLS certs (Let's Encrypt / Cloudflare)

---

### PHASE 2 — Google Workspace
**Shared. Blocks: transactional email.**

- [ ] Primary workspace on primary domain
- [ ] Verify all domains in Workspace
- [ ] Email aliases — NestFleet: `hello@`, `support@`, `legal@`, `noreply@`, `updates@`
- [ ] Email aliases — Acme: `hello@`, `support@`, `noreply@`
- [ ] Email aliases — PlatformCloud: `admin@` (internal only)
- [ ] Group aliases (support@ → founders inbox)
- [ ] SMTP relay configured for transactional email (or Postmark / Resend)

---

### PHASE 3 — GitHub Setup
**Shared + per-product. Blocks: CI/CD, releases, distribution.**

- [ ] GitHub Organisation: `nestfleet-io`
- [ ] GitHub Organisation: `acme-io`
- [ ] Repos:
  - [ ] `nestfleet-io/nestfleet` — source (BSL, public)
  - [ ] `nestfleet-io/nestfleet-docs` — documentation site
  - [ ] `acme-io/acme` — source (BSL, public)
  - [ ] `acme-io/acme-docs`
  - [ ] `(private) platformcloud` — proprietary, never public
- [ ] GitHub App: **NestFleet**
  - Permissions: repo read, issues write, pull_requests write, webhooks
  - Callback URL: `https://app.nestfleet.dev/oauth/github/callback`
  - Webhook URL: `https://app.nestfleet.dev/webhooks/github`
- [ ] GitHub App: **Acme** (same scope for its use case)
- [ ] GitHub Actions: CI/CD pipelines (test → build → push Docker image to GHCR)
- [ ] GitHub Releases: tag-based, attaches docker-compose + checksums

---

### PHASE 4 — PlatformCloud Deployment
**Shared. Blocks: sign-up flow, license delivery.**

- [ ] VPS: Hetzner CX22 (Helsinki, EU — ~€4/mo, GDPR-safe)
- [ ] PostgreSQL: managed EU instance (Supabase EU or Neon EU — free tier for Community)
- [ ] Deploy PlatformCloud container
- [ ] Seed product registry (nestfleet + acme, Community tier features)
- [ ] License key generation live: `POST /api/v1/licenses/generate`
- [ ] Smoke test: NestFleet hits `/validate` with Community license → 200 (LPP: response includes `lease`, `status: "active"`, NestFleet schedules next refresh via TTL)
- [ ] Smoke test: NestFleet pushes capability manifest → `PATCH /api/v1/admin/products/nestfleet/capabilities` returns 200 (set `PLATFORM_CLOUD_TOKEN`)
- [ ] Set `LICENSE_REFRESH_HMAC_SECRET` + `JWT_SECRET` in prod env
- [ ] Update manifest endpoint live (returns latest version + GHCR image ref)

---

### PHASE 5 — Transactional Email
**Shared. Blocks: sign-up confirmation, license key delivery.**

- [ ] Postmark or Resend account (EU data residency)
- [ ] Verify sending domains (SPF/DKIM for `noreply@`)
- [ ] Email templates:
  - [ ] Welcome + license key delivery
  - [ ] License expiry warning
  - [ ] Security advisory
- [ ] Test full flow: sign-up → email → license key received

---

### PHASE 6 — Landing Pages
**Per-product. Blocks: launch.**

**NestFleet (`nestfleet.dev`):**
- [ ] Hero: "Your Sovereign AI Product Operations Team"
- [ ] Feature overview (cases → triage → PR draft)
- [ ] Self-hosting CTA: "Deploy in 5 minutes"
- [ ] Sign-up form → email → license key delivered
- [ ] Pricing table (Community free; Starter/Growth/Scale coming)
- [ ] Privacy Notice + Terms of Service links
- [ ] Community tier "Powered by NestFleet" branding note

**Acme (`acme.io`):**
- [ ] Hero: "AI-Powered Documentation Quality Engine"
- [ ] Feature overview
- [ ] Sign-up + license key flow (same PlatformCloud backend)
- [ ] Privacy Notice + ToS

**Both:**
- [ ] Cookie consent banner (only if using analytics — avoid if possible)

---

### PHASE 7 — Docker Distribution
**Per-product. Blocks: first external user.**

**NestFleet:**
- [ ] `docker-compose.yml` for single-node (postgres + app)
- [ ] README: "Get running in 5 minutes" (copy-paste install)
- [ ] `.env.example` with all required vars documented
- [ ] Health check endpoint verified
- [ ] First release tagged: `v1.0.0-community`
- [ ] GHCR image pushed: `ghcr.io/nestfleet-io/nestfleet:1.0.0`
- [ ] GitHub Release with: changelog, docker-compose.yml, SHA256 checksums, BSL text

**Acme:**
- [ ] Same checklist as above for Acme

---

### PHASE 8 — Community Launch
**Per-product. Blocks: first users.**

- [ ] GitHub repos public
- [ ] README polished (screenshots, quickstart, demo GIF)
- [ ] Docs site live (Mintlify / Docusaurus / GitHub Pages)
- [ ] Product Hunt submission scheduled
- [ ] HN "Show HN" draft ready
- [ ] X / LinkedIn posts prepared
- [ ] First case study: "We used NestFleet on our own support ops" / "We used Acme on our own docs"

---

### PHASE 9 — Billing (deferred — Starter tier)
**Shared. Unblocks: paid tiers.**

- [ ] Stripe account (Irish entity for EU VAT, or local equivalent)
- [ ] PlatformCloud Stripe integration (already coded — PC-BIL-02/03/04)
- [ ] Pricing page with Stripe checkout
- [ ] License upgrade flow (Community → Starter → Growth)
- [ ] VAT handling (OSS registration if EU sales > €10k threshold)
- [ ] Bridge scaffold: create `bridge_events` table (no consumers/producers yet — infrastructure only)

---

### PHASE 10 — NestFleet ↔ Acme Bridge (deferred — Growth tier)
**Requires both products in production with paying customers.**

**Spec:** `docs/specs/nestfleet-acme-integration.md`

Bridge is **opt-in**, activates only when a customer runs both products on the same PlatformCloud tenant.

- [ ] Growth tier (weeks 1–3): Integration Point 1 — Doc Gap Signal (NF → DG triage detects gap → creates DocUpdateTask)
- [ ] Growth tier (weeks 4–6): Integration Point 3 — Knowledge Refresh (DG publishes doc → auto-triggers RAG re-index in NestFleet memory)
- [ ] Scale tier (weeks 7–8): Integration Point 4 — Deflection attribution + ROI dashboard
- [ ] Scale tier (weeks 9–10): Integration Point 5 — Shared lineage (external ref nodes in both UIs)
- [ ] Scale tier (weeks 11–12): Integration Point 6 — Unified cross-product notifications + preferences UI
- [ ] Integration Point 2 (Doc Update Proposal NF badge) bundled with Point 3

**Decision (2026-03-23):** Bridge deferred from Community release. Community users run one product only; Acme not yet implemented. The manual upload slide-over (WAVE-5) covers the only standalone-useful flow (re-ingesting updated docs) without requiring the bridge.

---

## Critical Path

```
PHASE 0 (legal) ───────────────────────────────→ PHASE 6 (ToS/Privacy required)
PHASE 1 (domains) → PHASE 2 (Workspace) ──────→ PHASE 5 (email)
PHASE 3 (GitHub) ──────────────────────────────→ PHASE 7 (releases)
PHASE 4 (PlatformCloud) → PHASE 5 (email) ────→ PHASE 6 (sign-up flow)
All above ─────────────────────────────────────→ PHASE 8 (launch)
PHASE 8 ───────────────────────────────────────→ PHASE 9 (when ready)
```

**Minimum to get first Community user self-hosting:**
Phase 1 → Phase 3 → Phase 4 → Phase 6 (minimal) → Phase 7 → README

Roughly **1 week of focused work** — mostly configuration, not code. Both products are feature-complete. PlatformCloud billing is already coded.

---

## Progress Log

| Date | Phase | What was completed |
|------|-------|--------------------|
| — | — | — |
