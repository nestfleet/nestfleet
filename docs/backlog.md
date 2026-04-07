# NestFleet — Agent Backlog

> **Canonical backlog for agent consumption.**
> Completed v1 work: `docs/active/active-backlog.md` (historical archive)
> Specs: `docs/specs/FEAT-XXX-<slug>.md`

---

---

## Not Started

### SaaS Fleet Provisioning (FEAT-001 sub-tasks — ordered by dependency)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-001 | SaaS Fleet Provisioning (umbrella) | XL | High | ⚡ Phase B — awaiting main VPS spin-up | `feat/FEAT-001-saas-fleet-provisioning` | [spec](specs/FEAT-001-saas-fleet-provisioning.md) |
| NF-OPS-03 | One-Time Infra Setup (Cloudflare, Hetzner firewall, SSH key, DNS) | XS | P0 | ✅ Done | `feat/NF-OPS-03-infra-setup` | active-backlog §18 |
| NF-OPS-04 | docker-compose.prod.yml Verification (health, backup service, smoke test) | XS | P0 | ✅ Done | `feat/NF-OPS-04-compose-verify` | active-backlog §18 |
| NF-OPS-05 | Stripe Webhook Extension + DB Tables (signup_intents, provisionings, saas/signup) | M | P0 | ✅ Done | `feat/NF-OPS-05-stripe-webhook` | active-backlog §18 |
| NF-OPS-02 | Provisioning Module (src/provisioning/, cloud-init, health poll, welcome email) | L | P0 | ✅ Done | `feat/NF-OPS-02-provisioning-module` | active-backlog §18 |
| NF-OPS-07 | Automated Postgres Backups (backup.sh, Object Storage, cron via cloud-init) | S | P0 | ✅ Done | `feat/NF-OPS-07-pg-backups` | active-backlog §18 |
| NF-OPS-08 | Provisioning Test Suite (unit + integration + E2E staging runbook) | M | P0 | ✅ Done | `feat/NF-OPS-08-provisioning-tests` | active-backlog §18 |
| NF-OPS-06 | Deprovisioning on Churn (30-day grace, nightly pg-boss, Hetzner + CF cleanup) | S | P1 | ✅ Done | `feat/NF-OPS-06-deprovision` | active-backlog §18 |
| NF-OPS-01 | Owner Admin Console (fleet health, revenue KPIs, telemetry pipeline + console UI) | XL | P2 | ✅ Done | `feat/NF-OPS-01-owner-console` | active-backlog §16 |

### Launch Setup (ORGA-01)

| ID | Title | Size | Priority | Status | Spec |
|----|-------|------|----------|--------|------|
| ORGA-01 | Complete Launch Setup (domain, email, GitHub org/app, prod infra, Stripe live) | XL | P0 | ⚡ Phase B in progress | [spec](ORGA-01-Launch-Setup.md) |
| ORGA-01-S2 | `nestfleet.io` cybersquatter registration + redirect rule | XS | P1 | Deferred | [spec §2](ORGA-01-Launch-Setup.md#step-2) |
| ORGA-01-S3 | Email: Google Workspace Starter — MX, SPF, DKIM, DMARC, mailboxes | XS | P0 | ✅ Done | [spec §3](ORGA-01-Launch-Setup.md#step-3) |
| ORGA-01-S4 | Transactional email: Google Workspace SMTP, `noreply@nestfleet.dev`, remove Resend | XS | P0 | ✅ Done | [spec §4](ORGA-01-Launch-Setup.md#step-4) |
| ORGA-01-S5 | GitHub org `nestfleet` + private repo (public flip deferred to v0.1.0) + deploy token | XS | P0 | ✅ Done | [spec §5](ORGA-01-Launch-Setup.md#step-5) |
| ORGA-01-S6 | GitHub App `NestFleet` (App ID 3297524, under org, PAT removed) | S | P0 | ✅ Done | [spec §6](ORGA-01-Launch-Setup.md#step-6) |
| ORGA-01-S8 | Prod infra: main Hetzner CX23 VPS, DNS A records, first deploy, deploy workflow | M | P0 | 🔄 In Progress (Phase B) | [spec §8](ORGA-01-Launch-Setup.md#step-8) |
| ORGA-01-S9 | Stripe live keys + webhook endpoint + live price IDs | XS | P0 | Not Started (before first real customer) | [spec §9](ORGA-01-Launch-Setup.md#step-9) |

### Infrastructure

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| INFRA-01 | Operator Real-Time Stream (SSE endpoint, operator-registry) — **BLOCKER for Telegram/Discord** | M | P0 | ✅ Done | `feat/INFRA-01-sse-stream` | active-backlog §INFRA |
| INFRA-04 | GitHub PR merge → auto-complete CR + resolve case (match `github_pr_number` on `pull_request.closed+merged` webhook event) | S | P1 | ✅ Done | `feat/INFRA-04-pr-merge-cr-close` | — |
| INFRA-02 | DB Connection Pool Headroom (pool max 20–25, 503 on exhaustion) | S | P2 | ✅ Done | `feat/INFRA-02-pool-headroom` | active-backlog §INFRA |
| INFRA-03 | Contact Form Rate Limiter Cross-Product Isolation (re-key to productId:ip) | S | P2 | ✅ Done | `feat/INFRA-03-rate-limit-isolation` | active-backlog §INFRA |

### Bug Fixes (Beta Eval Findings)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| BEF-14 | PR draft agent produces runbooks instead of code fixes | M | P2 | ✅ Done | `fix/BEF-14-pr-draft-agent` | active-backlog §17 |
| BEF-16 | No correction email / follow-up on already-sent auto-reply cases | S | P2 | ✅ Done | `fix/BEF-16-followup-email` | active-backlog §17 |
| BEF-17 | No Reopen action on Resolved cases | S | P2 | ✅ Done | `fix/BEF-17-reopen-action` | active-backlog §17 |
| BEF-20 | Cross-product lineage link missing — same identity across products not connected in Lineage graph | S | P2 | ✅ Done | `fix/BEF-20-cross-product-lineage` | — |
| BEF-21 | Chat widget test harness — persistent per-product HTML test page for SSE + widget validation without manual setup | S | P2 | ✅ Done | `fix/BEF-21-widget-test-harness` | — |
| BEF-22 | Integration test suite fixes — 5 root causes across 4 test files (see Done notes) | S | P3 | ✅ Done | `fix/BEF-22-int-test-suite-fixes` | — |

### Feature Specs

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-002 | Onboarding & Channels Hub Refactor | L | Medium | ✅ Done | `feat/FEAT-002-onboarding-channels-hub-refactor` | [spec](specs/FEAT-002-onboarding-channels-hub-refactor.md) |
| FEAT-003 | Channel Richness Gap & Architecture | S | Low | ✅ Done | `feat/FEAT-003-channel-richness-gap` | [spec](specs/FEAT-003-channel-richness-gap.md) |
| NF-PIVOT-11 | User & Developer Guide (docs site, in-app tooltip links) | XL | P2 | Not Started | `feat/NF-PIVOT-11-user-guide` | active-backlog §NF-PIVOT |

### UX Improvements

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| UX-01 | Text search in Cases, Queue, Approvals, PR Drafts, and Notifications | S | P2 | Not Started | Client-side keyword filter input on list pages — filters visible rows by case title / subject / email. No backend changes needed for MVP; backend `?q=` param upgrade later. |
| UX-02 | Hide "Add Product" button when product limit reached (community tier = 1) | XS | P2 | ✅ Done | Button visible even when limit is hit; confusing for single-product tier users. |

### SaaS Provisioning: Docker Registry (OPS-IMAGE-01)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| OPS-IMAGE-01 | Publish Docker images to GHCR and update cloud-init to use `image:` refs | S | P0 | Not Started | Smoke test revealed: cloud-init embeds docker-compose.prod.yml which has `build: context: .` directives — but customer VPSes have no source code. VPS spins up but containers fail to start. Fix: build API + console images in CI (GitHub Actions), push to `ghcr.io/nestfleet/api:latest` + `ghcr.io/nestfleet/console:latest`, and update docker-compose.prod.yml to use `image:` instead of `build:`. Also fix server type: cx21→cx23 (cx21 deprecated). |

### Landing Page & Legal

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| LP-01 | `/terms` and `/privacy` pages — create real content (or placeholder with correct structure) | S | P1 | ✅ Done | GDPR-structured placeholder pages with amber draft banner, mutual links, and E2E tests. |
| LP-02 | Landing page audit + copy/routing polish | S | P2 | ✅ Done | Footer now has Terms + Privacy links; middleware bypass for /terms, /privacy, /signup. |

### Beta Testing

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| BETA-NF-01 | NestFleet self-hosted beta eval — inject NF-as-product scenarios on main VPS | M | P1 | Not Started | Adapt inject-signals.ts for NestFleet (nestfleet/nestfleet repo) as the product under test. Run DG-style scenario groups (support cases, change requests, PR drafts) end-to-end on live VPS. Manual runbook. |

---

## Deferred

| ID | Title | Size | Notes |
|----|-------|------|-------|
| BEF-06 | No KB evidence retrieved for DG-06 setup crash | S | Requires manual KB embed quality review |
| BEF-10 | SS-09 OU limit enforcement — schema mismatch + missing scenario | M | Schema investigation needed before implementation |
| DEFERRED-01 | Telegram Channel Adapter (full, first-party) | L | Legal constraint: servers not EU-hosted; pick up when resolved |
| NF-PLAT-01-DB | DB Persistence for Plan-Lock Loop (`writePlan` callback) | S | Pending PlatformCloud deploy; activate when PC is live |
| SLICE-23 | Compare-Roles UI (permission studio diff view) | M | Deferred post-v1; low ROI until RBAC matures |
| CHAT-UX-01 | AI Confidence Threshold for Auto-Close | S | Decision pending on threshold value and after-hours logic |

---

## Done

> All v1 through Phase 10 items, BEF-01..05/07..09/11, NF-OSS-01, NF-PIVOT-01..10, NF-PROV-01, PlatformCloud Phase 9–10 — see `docs/active/active-backlog.md` for full history.
> **Beta Eval Group A** ✅ 2026-04-02 — 7 PASS / 9 PARTIAL / 3 SKIP
> **Beta Eval Group B** ✅ 2026-04-05 — All SS + DG cases worked through. New findings: BEF-12..21, INFRA-04. Blocked: SS-09 (BEF-10), DG-09 (BEF-01/02), XP-01 (BEF-11). SSE checks (DG-07, SS-07) deferred to BEF-21.
> **BEF-12, 13, 15, 18, 19** ✅ 2026-04-05 — BEF-15 already fixed by BEF-04. BEF-12/13/18/19 implemented: inject dedup, badge labels, CR panel auto-close.
> **FEAT-001 code complete** ✅ 2026-04-05 — All 15 new source files implemented (saga pattern, Hetzner + Cloudflare clients, cloud-init, health poller, deprovision scheduler, owner API, saas signup API, Stripe webhook extension). 27 unit + 13 integration tests (NF-UNIT-SLUG/SEC-PROV/CLINIT, NF-INT-PROV-01..13) all pass. Pending: NF-OPS-03 infra setup, NF-OPS-04 compose verify, NF-OPS-07 backups, real-world VPS spin-up smoke test.
> **FEAT-003** ✅ 2026-04-05 — Channel threading (email inReplyTo dedup, channel_thread_id index), external webhook ingress (source_type "external", Bearer auth, JSONB identity lookup), outbound callback (fireOutboundCallback, 5s AbortController timeout). Migrations 0044–0046. 26 new tests (NF-UNIT-THR/EXT/CHN + NF-INT-THR/EXT) all pass.
> **FEAT-002** ✅ 2026-04-05 — Channels Hub (ChannelsHub, ChannelCard, ChannelSetupPanel, ChannelPickerStep components), static channel catalog (7 active + 5 coming soon), GET /channels/status endpoint, Settings → Channels section with legacy redirects (ci/chat/contact-form → channels), AddProductWizard expanded to 4 steps (channel picker step 3), Sidebar completeness badge for unconfigured channels.
> **BEF-22** ✅ 2026-04-05 — Integration test suite: fixed 5 root causes: (1) `cases/resolve` endpoint used `requireRole("operator")` instead of `requireRole("support_lead")` per PO RBAC decision 2026-03-19 — updated source + 3 conflicting tests; (2) `"enterprise"` missing from `LicenseTier` union — added + mapped to `"scale"` in `licenseToProductTier`; (3) memory-ingest mock emitted 1536-dim vectors but DB schema is `vector(768)` after migration 0005; (4) `GET /products` admin bypass returned all products ignoring JWT `productIds` — removed bypass, always filter by JWT; (5) `products-api` NF-INT-509 read response body twice (Fetch one-read limit). 43/43 integration files passing.

---

## Size Reference

| Size | Scope | Orchestration |
|------|-------|--------------|
| XS | Single file or config change | Orchestrator direct |
| S | 1–3 files, no new route | Orchestrator direct |
| M | 1 new endpoint + types | + 1 subagent |
| L | Cross-domain (API + DB + tests) | + backend-dev, test-engineer |
| XL | New subsystem or domain | Agent Teams — user enables manually |
