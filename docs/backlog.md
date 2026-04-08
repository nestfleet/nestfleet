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
| FEAT-001 | SaaS Fleet Provisioning (umbrella) | XL | High | ⚡ Phase B — smoke-test-11 pending Hetzner limit increase approval (requested 2026-04-07) | `feat/FEAT-001-saas-fleet-provisioning` | [spec](specs/FEAT-001-saas-fleet-provisioning.md) |
| NF-OPS-03 | One-Time Infra Setup (Cloudflare, Hetzner firewall, SSH key, DNS) | XS | P0 | ✅ Done | `feat/NF-OPS-03-infra-setup` | active-backlog §18 |
| NF-OPS-04 | docker-compose.prod.yml Verification (health, backup service, smoke test) | XS | P0 | ✅ Done | `feat/NF-OPS-04-compose-verify` | active-backlog §18 |
| NF-OPS-05 | Stripe Webhook Extension + DB Tables (signup_intents, provisionings, saas/signup) | M | P0 | ✅ Done | `feat/NF-OPS-05-stripe-webhook` | active-backlog §18 |
| NF-OPS-02 | Provisioning Module (src/provisioning/, cloud-init, health poll, welcome email) | L | P0 | ✅ Done | `feat/NF-OPS-02-provisioning-module` | active-backlog §18 |
| NF-OPS-07 | Automated Postgres Backups (backup.sh, Object Storage, cron via cloud-init) | S | P0 | ✅ Done | `feat/NF-OPS-07-pg-backups` | active-backlog §18 |
| NF-OPS-08 | Provisioning Test Suite (unit + integration + E2E staging runbook) | M | P0 | ✅ Done | `feat/NF-OPS-08-provisioning-tests` | active-backlog §18 |
| NF-OPS-06 | Deprovisioning on Churn (30-day grace, nightly pg-boss, Hetzner + CF cleanup) | S | P1 | ✅ Done | `feat/NF-OPS-06-deprovision` | active-backlog §18 |
| NF-OPS-01 | Owner Admin Console (fleet health, revenue KPIs, telemetry pipeline + console UI) | XL | P2 | ✅ Done | `feat/NF-OPS-01-owner-console` | active-backlog §16 |
| OWN-NC | Owner-initiated new customer provisioning (slug check, Stripe checkout URL gen, /owner/new-customer page, /signup/success page) | M | P1 | ✅ Done (2026-04-07) | `main` | — |

### Launch Setup (ORGA-01)

| ID | Title | Size | Priority | Status | Spec |
|----|-------|------|----------|--------|------|
| ORGA-01 | Complete Launch Setup (domain, email, GitHub org/app, prod infra, Stripe live) | XL | P0 | ⚡ Phase B in progress | [spec](ORGA-01-Launch-Setup.md) |
| ORGA-01-S2 | `nestfleet.io` cybersquatter registration + redirect rule | XS | P1 | Deferred | [spec §2](ORGA-01-Launch-Setup.md#step-2) |
| ORGA-01-S3 | Email: Google Workspace Starter — MX, SPF, DKIM, DMARC, mailboxes | XS | P0 | ✅ Done | [spec §3](ORGA-01-Launch-Setup.md#step-3) |
| ORGA-01-S4 | Transactional email: Google Workspace SMTP, `noreply@nestfleet.dev`, remove Resend | XS | P0 | ✅ Done | [spec §4](ORGA-01-Launch-Setup.md#step-4) |
| ORGA-01-S5 | GitHub org `nestfleet` + private repo (public flip deferred to v0.1.0) + deploy token | XS | P0 | ✅ Done | [spec §5](ORGA-01-Launch-Setup.md#step-5) |
| ORGA-01-S6 | GitHub App `NestFleet` (App ID 3297524, under org, PAT removed) | S | P0 | ✅ Done | [spec §6](ORGA-01-Launch-Setup.md#step-6) |
| ORGA-01-S8 | Prod infra: main Hetzner CX23 VPS, DNS A records, first deploy, deploy workflow | M | P0 | ✅ Done — main VPS live at nestfleet.dev, CI/CD running, GHCR images public | [spec §8](ORGA-01-Launch-Setup.md#step-8) |
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
| BEF-23 | `z.coerce.boolean()` docker-compose env parsing bug — BILLING_ENABLED, REGISTRATION_ENABLED, PROVISIONING_ENABLED, TELEMETRY_OPT_IN all evaluated to `true` when set to string `"false"` | XS | P0 | ✅ Done (2026-04-08) | `main` | — |
| BEF-24 | FLEET_SSH_PRIVATE_KEY / FLEET_SSH_PRIVATE_KEY_B64 / FLEET_SSH_USER missing from docker-compose.prod.yml api env block — reissue worker had no SSH key despite it being in .env | XS | P0 | ✅ Done (2026-04-08) | `main` | — |
| BEF-25 | /api/v1/license/status requires admin auth — reissue worker poller always got 401, timed out. Added public GET /api/v1/license/tier (tier only, no sensitive data) and updated worker to poll it | XS | P0 | ✅ Done (2026-04-08) | `main` | — |

### Feature Specs

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-002 | Onboarding & Channels Hub Refactor | L | Medium | ✅ Done | `feat/FEAT-002-onboarding-channels-hub-refactor` | [spec](specs/FEAT-002-onboarding-channels-hub-refactor.md) |
| FEAT-003 | Channel Richness Gap & Architecture | S | Low | ✅ Done | `feat/FEAT-003-channel-richness-gap` | [spec](specs/FEAT-003-channel-richness-gap.md) |
| FEAT-012 | Owner Fleet — Reissue License | L | P1 | ✅ Done (2026-04-08) | `main` | [spec](specs/FEAT-012-reissue-license.md) |
| NF-PIVOT-11 | User & Developer Guide (docs site, in-app tooltip links) | XL | P2 | Not Started | `feat/NF-PIVOT-11-user-guide` | active-backlog §NF-PIVOT |

### UX Improvements

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| UX-01 | Text search in Cases, Queue, Approvals, PR Drafts, and Notifications | S | P2 | ✅ Done (2026-04-07) | Client-side keyword filter input on list pages — filters visible rows by case title / subject / email. |
| UX-02 | Hide "Add Product" button when product limit reached (community tier = 1) | XS | P2 | ✅ Done | Button visible even when limit is hit; confusing for single-product tier users. |
| UX-03 | Billing Plan card: show "Manage Subscription" + contact administrator link for all tiers when BILLING_ENABLED=false — was showing Stripe upgrade cards (non-functional on customer VPSes) | XS | P1 | ✅ Done (2026-04-08) | `main` | — |
| UX-04 | ReissueLicenseDialog: exclude current tier from dropdown — reissue is a tier change, not a renewal; default to first available option | XS | P1 | ✅ Done (2026-04-08) | `main` | — |
| UX-05 | Owner Console — Deprovision confirm dialog too wide; confirmation text overflows the modal frame | XS | P3 | ✅ Done (2026-04-08) | Deprovision confirm dialog: max-w-xs (was max-w-sm), break-all on slug. main. |

### Billing-Integrated License Reissue (FEAT-013)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FEAT-013 | Stripe-Integrated License Reissue — sync tier changes with Stripe subscriptions | M | P1 | Not Started | Owner-initiated reissue currently updates JWT + DB only — no Stripe event. Need to call `stripe.subscriptions.update()` with the new price ID so Stripe reflects the upgrade/downgrade in money (proration charged or credited automatically on the stored payment method — no card details needed from owner). Two paths: (1) existing subscription → `subscriptions.update()` + prorate; (2) no subscription yet → send customer a Stripe Payment Link, reissue JWT only after payment confirmed via webhook. Downgrade: same `subscriptions.update()` call, Stripe credits the balance to the next invoice. Add "Bill via Stripe" toggle to ReissueLicenseDialog — when enabled, fires Stripe update before JWT deploy. |

### SaaS Provisioning: Fleet Update Management (OPS-FLEET-02)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| OPS-FLEET-02 | Fleet Update Management — controlled push of new images to customer VPS fleet, per-instance rollback, Owner Console UI + CLI script | L | P1 | Not Started | No Watchtower. Update API on customer VPS (`/system/update`, `/system/version`) authenticated by LICENSE_SECRET. pg-boss `fleet_update_instance` job with 5-parallel concurrency. SHA-based rollback via `previous_image_sha`. Owner Console: per-row Update/Rollback buttons + Update All. CLI fallback script for emergencies. See [spec](specs/OPS-FLEET-02-fleet-update-management.md). |

### SaaS Provisioning: Docker Registry (OPS-IMAGE-01)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| OPS-IMAGE-01 | Publish Docker images to GHCR and update cloud-init to use `image:` refs | S | P0 | ✅ Done (2026-04-07) | Images published to ghcr.io/nestfleet/nestfleet-api:latest + nestfleet-console:latest via docker-publish.yml on CI. Both packages public — no auth needed on customer VPSes. docker-compose.customer.yml uses `image:` refs. Also fixed cloud-init: Docker CE from official repo (not docker.io), chpasswd expire:false, 50-attempt health poll. |
| OPS-IMAGE-02 | Restructure CI: add publish job (build + push to GHCR in CI, not on VPS); deploy job pulls pre-built images. NEXT_PUBLIC_PRODUCT_ID baked via GitHub secret for main VPS console image. | S | P0 | ✅ Done (2026-04-08) | `main` | — |
| OPS-OPS-01 | Docker housekeeping cron on main VPS — daily at 3am UTC, prunes dangling images, build cache >24h, unused images >7d. Prevents disk exhaustion (hit 100% disk during FEAT-012 testing). | XS | P1 | ✅ Done (2026-04-08) | manual (main VPS crontab) | — |

### Landing Page & Legal

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| LP-01 | `/terms` and `/privacy` pages — create real content (or placeholder with correct structure) | S | P1 | ✅ Done | GDPR-structured placeholder pages with amber draft banner, mutual links, and E2E tests. |
| LP-02 | Landing page audit + copy/routing polish | S | P2 | ✅ Done | Footer now has Terms + Privacy links; middleware bypass for /terms, /privacy, /signup. |
| LP-03 | Landing page: embed console screenshots + lineage GIF; replace placeholder hero visuals | S | P1 | ✅ Done then rolled back (2026-04-08) | Screenshots section added then removed — redundant with HowItWorksSection and ComplianceSection. PNGs kept in public/screenshots/ for docs use. |
| LP-04 | Landing page: Pricing section — Free (community, self-hosted) vs Starter / Growth / Scale with feature comparison table | S | P1 | ✅ Done (2026-04-08) | Pricing section: Free (community, self-hosted) vs Starter/Growth/Scale. CTAs: "Self-host free on GitHub" + "Get managed hosting → /signup". main. |
| LP-05 | Landing page: SEO basics — title, meta description, OG image, Twitter card, structured data | XS | P2 | ✅ Done (2026-04-08) | OG/Twitter meta tags added to landing page. main. |

### Self-Host Foundation (FREE track)

> Goal: a developer can clone the repo, run 3 commands, and have a working NestFleet instance.
> **Isolation rule:** all changes in this track must be guarded so they cannot activate on SaaS customer VPSes (those have explicit env vars in cloud-init that override any default behavior).

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FREE-01 | Create `docker-compose.yml` for self-hosters — api + console + postgres + caddy; separate from `docker-compose.prod.yml` (SaaS operator) and `docker-compose.customer.yml` (VPS template). No HETZNER/CLOUDFLARE/FLEET vars. | S | P0 | ✅ Done (2026-04-08) | `docker-compose.yml` for self-hosters created (api + console + postgres + caddy). Separate from prod and customer compose files. main. |
| FREE-02 | Fix README quickstart — Step 5 points to `.prod.yml`; replace with `docker-compose.yml`; verify end-to-end on clean machine; add "3-command" fast path at the top | S | P0 | ✅ Done (2026-04-08) | README quickstart updated to use `docker-compose.yml`; 3-command fast path at top. main. |
| FREE-03 | First-run auto-registration — if DB has 0 users AND `REGISTRATION_ENABLED` is unset/empty, auto-enable for first admin creation then auto-lock. Banner shown until first user exists. **Pending user decision.** | S | P1 | ✅ Done (2026-04-08) | Auto-registration: `GET /auth/first-run` endpoint; auto-opens when 0 users in DB and REGISTRATION_ENABLED unset. Auto-locks after first admin created. main. |
| FREE-04 | Community product limit decision — today `productLimit=null` = unlimited. Decide: keep unlimited or cap at N (e.g. 3) to create natural upgrade pressure. If capped: enforce in DB layer + show in Settings → Plan. **Pending user decision.** | XS | P1 | ✅ Done (2026-04-08) | Community OU cap: 200 OUs/month via `COMMUNITY_OU_LIMIT` env var (default 200). Enforced in signal ingress — "blocked" status at 100%. main. |

### Free → Paid Bridge (BRIDGE track)

> Goal: a community user who hits limits or wants more capacity knows exactly what to do and where to go (nestfleet.dev).
> **Isolation rule:** bridge UX shows only when `tier === "community"` (no valid license JWT). SaaS customers (`tier` = starter/growth/scale with `BILLING_ENABLED=false`) continue to see "contact administrator". Paid+billing users see Stripe upgrade cards.

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| BRIDGE-01 | Settings → Plan: community self-hosted branch — show tier limits, feature comparison, and CTA "Upgrade to managed SaaS at nestfleet.dev" when `tier=community && billingDisabled`. Currently shows "contact your NestFleet administrator" for all `billingDisabled` cases — wrong for self-hosters. | S | P1 | ✅ Done (2026-04-08) | Three-branch Settings → Plan: community shows "Upgrade to managed SaaS at nestfleet.dev →"; licensed+billingDisabled shows "contact administrator". main. |
| BRIDGE-02 | TierGate upgrade prompt: replace generic "View plans →" with context-aware link — community self-hosters go to `nestfleet.dev/pricing` (or LP-04 anchor), SaaS customers go to `settings?section=plan`. | XS | P1 | ✅ Done (2026-04-08) | TierGate community path links to `https://nestfleet.dev` (external, new tab); licensed path links to internal settings. main. |
| BRIDGE-03 | OU usage nudge: when OU usage ≥ 80% of limit AND limit > 0 (i.e. has a paid license), show amber banner in the console header. For community (limit=0), no nudge — OUs are unlimited in community mode. | XS | P2 | ✅ Done (2026-04-08) | `OuUsageBanner.tsx` — amber banner at ≥80%, red non-dismissible at 100%, admin-only, session-dismissible, refreshes every 5 min. Added to AppLayout. main. |

### Docs (DOCS track)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| DOCS-01 | README overhaul — hero screenshot, 3-command quickstart at top, minimal required env vars table, common issues section, link to full self-hosting guide | S | P1 | Not Started | Current README buries quickstart; no visuals; env vars table is mixed required/optional. |
| DOCS-02 | `docs/self-hosting.md` — full setup guide: compose, first admin, GitHub App, email provider, channels, production checklist | M | P2 | Not Started | NF-PIVOT-11 umbrella; start with this as the core doc. |
| DOCS-03 | `docs/channels/` — one setup guide per channel type: email (SMTP/Postmark/Resend), Telegram bot, GitHub webhook, contact form widget, external webhook | S | P2 | Not Started | Currently undocumented. Channel setup is a major friction point for self-hosters. |

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
> **2026-04-08** ✅ FEAT-012 (Owner License Reissue) complete — SSH JWT deploy, /license/tier public endpoint, reissue worker polls tier change, Owner Console Fleet UI (tier badge, expiry column, reissue dialog, history panel, bulk renew). Bug fixes: BEF-23 (z.coerce.boolean() false→true), BEF-24 (FLEET_SSH_PRIVATE_KEY* missing from compose), BEF-25 (/license/status auth-gated). UX: UX-03 (Manage Subscription card for all tiers), UX-04 (current tier excluded from reissue dropdown). Ops: CI publish job (GHCR), docker housekeeping cron on main VPS. FEAT-013 added to backlog (Stripe-integrated reissue).
> **2026-04-08 (session 2)** ✅ FREE track complete — FREE-01/02 (self-host docker-compose + README), FREE-03 (first-run auto-registration), FREE-04 (community OU cap 200/month, enforced at signal ingress). BRIDGE track complete — BRIDGE-01/02/03 (Settings Plan community branch, TierGate nestfleet.dev links, OU usage amber/red banner). LP-04/05 (pricing section, OG meta). UX-05 (deprovision dialog width). LP-03 added then rolled back (screenshots redundant). Settings Plan cosmetic fix: "3 / ∞" for null product limit. nodemailer bumped to 8.0.5 (Dependabot #14, CRLF injection CVE).
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
