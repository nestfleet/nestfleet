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
| FEAT-001 | SaaS Fleet Provisioning (umbrella) | XL | High | ✅ Done (2026-04-11) | `main` | 5 active customer VPSes provisioned. Hetzner limit approved. All sub-tasks done. [spec](specs/FEAT-001-saas-fleet-provisioning.md) |
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
| ORGA-01-S9 | Stripe live keys + webhook endpoint + live price IDs | XS | P0 | ⏸ Postponed (FREE track focus) | [spec §9](ORGA-01-Launch-Setup.md#step-9) |

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
| NF-PIVOT-11 | User & Developer Guide (docs site, in-app tooltip links) | XL | P2 | ✅ Done | `main` | 21 pages: quickstart, user-guide (cases, auto-reply, change-requests, KB, notifications, roles, settings), self-hosting (docker, env, github-app, backup, upgrading), developer (api-reference, architecture, contributing, testing). In-app doc links in setup, knowledge, analytics pages. |
| FEAT-014 | Notification Preferences — per-event email vs console-only control | M | P2 | ✅ Done (2026-04-10) | `main` | [spec](specs/FEAT-014-notification-preferences.md) |
| FEAT-015 | Correct Triage — operator inline override for case type and severity | M | P2 | ✅ Done (2026-04-10) | `main` | [spec](specs/FEAT-015-correct-triage.md) |
| FEAT-016 | SaaS Signup Form + 14-day Trial — self-service signup path, Stripe redirect, trial_period_days | S | P1 | ✅ Done (2026-04-10) | `main` | — |

### UX Improvements

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| UX-01 | Text search in Cases, Queue, Approvals, PR Drafts, and Notifications | S | P2 | ✅ Done (2026-04-07) | Client-side keyword filter input on list pages — filters visible rows by case title / subject / email. |
| UX-02 | Hide "Add Product" button when product limit reached (community tier = 1) | XS | P2 | ✅ Done | Button visible even when limit is hit; confusing for single-product tier users. |
| UX-03 | Billing Plan card: show "Manage Subscription" + contact administrator link for all tiers when BILLING_ENABLED=false — was showing Stripe upgrade cards (non-functional on customer VPSes) | XS | P1 | ✅ Done (2026-04-08) | `main` | — |
| UX-04 | ReissueLicenseDialog: exclude current tier from dropdown — reissue is a tier change, not a renewal; default to first available option | XS | P1 | ✅ Done (2026-04-08) | `main` | — |
| UX-05 | Owner Console — Deprovision confirm dialog too wide; confirmation text overflows the modal frame | XS | P3 | ✅ Done (2026-04-08) | Deprovision confirm dialog: max-w-xs (was max-w-sm), break-all on slug. main. |
| UX-06 | Change Queue: add "Escalate to Lead" action inline (currently only available from Case details) | XS | P2 | ✅ Done | "Escalate" button added to ApprovalRow (shown for canApprove users when cr.case_id exists); opens confirm modal; calls escalateCaseApi on the case. |
| UX-07 | Case list: show subject/title instead of case ID in header when navigating from a filtered list | XS | P2 | ✅ Done (2026-04-09) | Added caseRow?.title fallback before Case ${caseId} in detail page header |
| UX-08 | Preserve active filter state when navigating back from case detail to case list | XS | P2 | ✅ Done (2026-04-09) | statusFilter and severityFilter lazy-initialized from sessionStorage; setters write through on change |
| UX-09 | "Mark Resolved" action should accept an optional resolution note inline | XS | P2 | ✅ Done | LineageTimeline "Mark Resolved" now opens a modal with optional note textarea (defaults to "Resolved by operator" if left blank). |
| UX-10 | Knowledge Base onboarding nudge — wizard "next steps" screen after product creation + amber empty-state nudge when KB empty and cases exist | S | P1 | ✅ Done (2026-04-10) | Wizard step 5 shown after setup completes with 3 CTAs: "Add Knowledge Sources" (primary), "Set Up a Channel", "Go to Queue". KB page amber nudge when cases exist but sources = 0. Both verified in community simulation. |
| UX-11 | Plan & Billing: owner/platform instance notice — on nestfleet.dev the owner's account incorrectly shows Stripe upgrade cards | XS | P2 | ✅ Done (2026-04-10) | Detected via /owner/me (OWNER_USER_IDS check) not JWT role — `user.roles.includes("owner")` was always false. Fixed: SWR call to /api/v1/owner/me; isOwner=true replaces upgrade cards with "Platform operator instance" notice. |

### Customer Subscription Lifecycle (FEAT-017)

> **Blocking first paying customer.** Customer VPS has no billing. All subscription management runs on nestfleet.dev. Customer authenticates via magic link (email on file), reaches Stripe Customer Portal. Plan changes trigger license reissue on customer VPS via FEAT-012 reissue worker.

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FEAT-017 | Customer Subscription Lifecycle (umbrella) | M | P1 | ✅ Done (2026-04-11) | [spec](specs/FEAT-017-customer-subscription-lifecycle.md) |
| FEAT-017-A | Store `stripe_customer_id` + `stripe_subscription_id` on `signup_intents` at checkout; copy to `provisionings` row when worker creates it. Migration `0052_signup_intents_stripe_ids.sql`. | XS | P0 | ✅ Done (2026-04-11) | Migrations added. `updateSignupIntentStripeIds()` repo fn. Worker copies to `provisionings` on creation. |
| FEAT-017-B | Magic link auth: `POST /api/v1/saas/account/magic-link` (rate-limited 3/email/15min, always 200); magic link email; `/account/verify?token=…` console page (validates JWT, stores session in sessionStorage, redirects to /account). | S | P0 | ✅ Done (2026-04-11) | Stateless JWT. Session stored in sessionStorage (not httpOnly cookie — architecture constraint). 13 unit tests NF-UNIT-ACC-01..12. |
| FEAT-017-C | Customer account page (`/account`): shows plan, status, trial end, instance URL. "Manage →" button calls `POST /api/v1/saas/account/billing-portal` → Stripe Customer Portal session → redirect. Auth via sessionStorage Bearer token. | S | P0 | ✅ Done (2026-04-11) | `console/src/app/account/page.tsx`. Middleware bypass added. |
| FEAT-017-D | Extend webhook handlers: (a) `subscription.updated` for `saas_subscription` → update plan + trigger license reissue. (b) `subscription.deleted` for trial cancels: no 30-day grace, set `deprovision_after=trial_end`. (c) `customer.updated` → sync email to `provisionings.customer_email`. | S | P1 | ✅ Done (2026-04-11) | `handleFleetSubscriptionUpdated`, `handleFleetCustomerUpdated`, trial cancel logic in `handleFleetSubscriptionDeleted`. |
| FEAT-017-E | Welcome email update: add "Manage your subscription at nestfleet.dev/account" link after login URL. | XS | P0 | ✅ Done (2026-04-11) | `src/fleet/provisioning/provision.ts` `sendWelcomeEmail()` updated. |
| FEAT-017-F | Ops runbook: Stripe Customer Portal configuration checklist (allow upgrades, allow cancel, set cancellation policy). Non-code task — must be done in Stripe Dashboard before first paying customer. | XS | P0 | Not Started | See spec §7 C4. Owner action required in Stripe Dashboard. |
| FEAT-017-G | Short reactivation window: add `reactivation_deadline` column to `provisionings` (7 days from cancellation). If customer re-subscribes before deadline, reset status to `active`. Account page shows countdown. After deadline, normal deprovisioning proceeds. | S | P2 | ✅ Done (2026-04-11) | Migration `0053_provisioning_reactivation.sql`. Reactivation check in `handleFleetCheckoutCompleted`. Account page shows countdown. 2 integration tests NF-INT-609..610. |

### Billing-Integrated License Reissue (FEAT-013)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FEAT-013 | Stripe-Integrated License Reissue — owner console plan change syncs to Stripe | M | P1 | Not Started | **Raised from postponed — required for billing consistency (see FEAT-017 §7 C6).** Scope: owner changes tier in fleet console → `stripe.subscriptions.update()` called automatically so Stripe charges/credits the delta. Distinct from FEAT-017-D (Stripe change → VPS license update). Two paths: (1) existing subscription → `subscriptions.update()` + prorate; (2) no subscription → send customer a Stripe Payment Link, reissue JWT only after payment confirmed. Add "Bill via Stripe" toggle to ReissueLicenseDialog. Until FEAT-013 is live, owner-initiated reissue must show a warning: "Stripe subscription will NOT be updated — billing amount unchanged." |

### Pre-Launch Waitlist Mode (FEAT-019)

> **Implemented (2026-04-10).** Temporary patch active while legal entity is not yet registered and Stripe live keys are not active. All upgrade CTAs across the product show a pre-registration form instead of Stripe checkout. Flip `WAITLIST_MODE = false` in `console/src/lib/flags.ts` + redeploy to go live.

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FEAT-019 | Pre-Launch Waitlist Mode — replace paid plan CTAs with interest capture form | S | P1 | ✅ Done (2026-04-10) | Migration `0051_waitlist.sql` · `POST /api/v1/waitlist` (rate-limited, no auth) · `WaitlistButton` component (button+modal) · `WaitlistSignupForm` inline on `/signup?plan=xxx` · surfaces updated: PricingSection, TierGate, Settings Plan, OuUsageBanner, Sidebar, SignupForm. Toggle: `WAITLIST_MODE` in `console/src/lib/flags.ts`. |
| FEAT-019-OFF | Disable waitlist mode when ready to go live | XS | P1 | Not Started | Prerequisites: legal entity registered, ORGA-01-S9 (Stripe live keys), FEAT-017 live, FEAT-018 deployed. Steps: set `WAITLIST_MODE = false` in `console/src/lib/flags.ts`, redeploy, verify all Stripe CTAs restore correctly. |

### Open-Core Fleet Separation (FEAT-018)

> **Required before public repo flip.** Fleet management code (Hetzner provisioning, Cloudflare DNS, license reissue workers, SaaS Stripe webhooks, owner console API) moves to `src/fleet/` with a distinct commercial license. A cryptographic `NESTFLEET_OPERATOR_KEY` (Ed25519 JWT signed by NestFleet) gates activation — without it, `PROVISIONING_ENABLED=true` has no effect. Community code remains AGPL-3.0 and is unaffected.

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| FEAT-018 | Open-Core Fleet Separation (umbrella) | M | P2 | ✅ Done (2026-04-11) | [spec](specs/FEAT-018-open-core-fleet-separation.md) |
| FEAT-018-A | Generate Ed25519 keypair; embed public key in `src/fleet/operator-key.ts`; create `scripts/generate-operator-keypair.ts`; add `NESTFLEET_OPERATOR_KEY` to `docker-compose.prod.yml` env block | XS | P2 | ✅ Done (2026-04-11) | `src/fleet/operator-key.ts` + `scripts/generate-operator-keypair.ts`. Prod compose updated. Private key stored securely by owner, never committed. |
| FEAT-018-B | Create `src/fleet/` directory; move 7 `src/provisioning/` files to `src/fleet/provisioning/`; add `LICENSE-FLEET.md` headers; update internal imports within moved files | S | P2 | ✅ Done (2026-04-11) | All provisioning files moved. SPDX headers added. Imports updated throughout. |
| FEAT-018-C | Move `src/api/v1/owner.ts` → `src/fleet/api/owner.ts`; move `src/api/v1/saas.ts` → `src/fleet/api/saas.ts`; update `src/api/index.ts` import paths | XS | P2 | ✅ Done (2026-04-11) | Mount points unchanged. `src/fleet/api/saas-account.ts` also added (FEAT-017-B). |
| FEAT-018-D | Extract fleet Stripe webhook paths from `src/billing/webhook.ts` → `src/fleet/billing/webhook-fleet.ts`; community webhook delegates to fleet handler for `saas_signup` / `saas_subscription` event types | XS | P2 | ✅ Done (2026-04-11) | `src/fleet/billing/webhook-fleet.ts`. Community billing path stays in `src/billing/webhook.ts`. |
| FEAT-018-E | Move 4 fleet workers to `src/fleet/workers/` (`provisioning-worker`, `deprovision-scheduler`, `fleet-health-worker`, `license-reissue-worker`); update `src/index.ts` worker registration | XS | P2 | ✅ Done (2026-04-11) | All 4 workers moved. `src/index.ts` updated. Workers gated by `isFleetOperatorAuthorized()`. |
| FEAT-018-F | Startup gate in `src/index.ts`: call `verifyOperatorKey(config.NESTFLEET_OPERATOR_KEY)` when `PROVISIONING_ENABLED=true` (skip in `NODE_ENV=test`); only mount fleet routes and start fleet workers if key valid; log clear error if key missing or invalid | S | P2 | ✅ Done (2026-04-11) | Gate in `src/index.ts`. Missing key logs `NESTFLEET_OPERATOR_KEY not set — fleet workers disabled` warn and continues. Community routes unaffected. |
| FEAT-018-G | Create `LICENSE-FLEET.md` at repo root; add SPDX headers to all `src/fleet/**/*.ts`; update `README.md` with open-core section | XS | P2 | ✅ Done (2026-04-11) | `LICENSE-FLEET.md` created. SPDX `LicenseRef-NestFleet-Commercial` headers on all fleet files. README updated. |
| FEAT-018-H | Run full test suite (unit + integration + type check) after all moves; fix any broken imports | XS | P2 | ✅ Done (2026-04-11) | All suites pass: 0 unit failures, 0 new integration failures, 0 type errors. |

### SaaS Provisioning: Fleet Update Management (OPS-FLEET-02)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| OPS-FLEET-02 | Fleet Update Management — controlled push of new images to customer VPS fleet, per-instance rollback, Owner Console UI + CLI script | L | P1 | ⏸ Postponed (FREE track focus) | No Watchtower. Update API on customer VPS (`/system/update`, `/system/version`) authenticated by LICENSE_SECRET. pg-boss `fleet_update_instance` job with 5-parallel concurrency. SHA-based rollback via `previous_image_sha`. Owner Console: per-row Update/Rollback buttons + Update All. CLI fallback script for emergencies. See [spec](specs/OPS-FLEET-02-fleet-update-management.md). |

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
| LP-06 | Landing page: dual-audience hero — self-host (AGPL) + managed SaaS CTAs for post-public GitHub traffic | S | P1 | ✅ Done (2026-05-27) | Badge updated to "Free to self-host · Managed cloud in early access". Hero CTAs restructured: "Self-host free →" (GitHub Quick Start) + "Managed cloud →" (/signup). "Now in early access" stat replaced with "AGPL / Open source, always". "Star on GitHub" link added to trust badges row. Docs link added to landing nav and footer. |

### Security & Compliance (AUDIT-001 — Pre-Open-Source)

> Source: `docs/specs/AUDIT-001-pre-opensource-security.md`
> **Blockers** must be resolved before making the repo public.
> **High** items before accepting first external PR.

#### Owner actions (no code change — must be done manually)

| ID | Action | Priority | Status |
|----|--------|----------|--------|
| SEC-S1 | Verify `.env` was never committed — **already confirmed clean** (`git log --all -- .env` = empty) | Blocker | ✅ Done |
| SEC-S2 | Rotate production secrets (GitHub App key, GitHub PATs, Hetzner token, Cloudflare token, Google API keys, JWT_SECRET, LICENSE_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD) before first live customer. **Not a public-repo blocker** — `.env` was never committed and no real values appear in any committed file (verified). Reclassified as pre-first-customer hygiene. | Pre-first-customer | Not Started |
| OPS-SEC-01 | Set `INTERNAL_CRON_SECRET` on main VPS — add to `/opt/nestfleet/.env` (`openssl rand -hex 32`) and as a GitHub Actions secret so provisioned customer VPSes also get it. Until set, `POST /internal/send-reminders` and `/internal/run-escalations` are open to any caller on the internal docker network (fail-closed to 401 externally). | P1 | ⏳ TODO |
| SEC-S3 | ~~URGENT~~ — `STRIPE_SECRET_KEY` is owner's own shared test key (also used in Acme sandbox). Not a third-party credential. Swap for a live key when legal entity is registered (covered by ORGA-01-S9). SEC-ST2 startup guard prevents accidental prod use of test key. | Non-issue | ✅ Resolved |

#### Code items — Blockers (must fix before public repo)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| SEC-A1 | Secure 2 unauthenticated internal endpoints — add `X-Internal-Secret` header check to `POST /api/v1/internal/send-reminders` (`src/api/v1/cases.ts:799`) and `POST /api/v1/internal/run-escalations` (`src/api/v1/notifications.ts:130`). Add `INTERNAL_CRON_SECRET` to config + `.env.example`. | S | Blocker | ✅ Done (2026-04-12) — commit b12c37a | 7 unit tests (NF-UNIT-INT-01..07). |
| SEC-RL1 | Fix memory leak in 5 in-memory rate limiters — add expired-entry cleanup loop at top of each `checkRateLimit()`: `contact-form.ts`, `chat.ts`, `src/fleet/api/saas.ts`, `src/fleet/api/saas-account.ts` (missed by audit), `waitlist.ts` | XS | Blocker | ✅ Done (2026-04-12) — commit b12c37a | 8 unit tests (NF-UNIT-RL-01..03). |
| SEC-RL2 | Add IP-based rate limiting to `POST /api/v1/auth/login` — 5 attempts / 5 min / IP, checked before password verification (`src/api/v1/auth.ts:29`) | XS | Blocker | ✅ Done (2026-04-12) — commit b12c37a | 6 unit tests (NF-UNIT-ARL-01..06). |
| SEC-LC1 | Add SPDX headers to all 134 `console/src/` files — `// SPDX-License-Identifier: AGPL-3.0-or-later` + copyright line. Backend `src/` is already 100% covered. | XS | Blocker | ✅ Done (2026-04-12) — commit b12c37a | All 134 files updated. |
| SEC-LC2 | Create `LICENSES.md` at repo root — attribution for key dependencies (postgres/Unlicense, pg-boss/MIT, hono/MIT, ai-sdk/Apache-2.0, etc.). Note: axe-core not present in codebase. | XS | Blocker | ✅ Done (2026-04-12) — commit b12c37a | |

#### Code items — High priority (before first external PR)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| SEC-ST1 | Validate `success_url` / `cancel_url` origin against `CONSOLE_ORIGIN` in `POST /api/v1/billing/checkout` (`src/api/v1/billing.ts:96–102`) — reject if origin doesn't match | XS | High | ✅ Done (2026-04-12) — commit 09309b3 | Already implemented; backlog was stale. |
| SEC-ST2 | Add Stripe test vs. live key startup guard in `src/billing/stripe.ts` — throw on startup if `NODE_ENV=production` and key is `sk_test_` | XS | High | ✅ Done (2026-04-12) — commit 09309b3 | Already implemented; backlog was stale. |
| SEC-ST3 | Add plan tier validation to `POST /api/v1/billing/downgrade` — reject if requested plan ≥ current plan (`src/api/v1/billing.ts:137`) | XS | High | ✅ Done (2026-05-12) | Uses `PLAN_ORDER` from `plans.ts`; no Stripe call on invalid request. 5 unit tests (NF-UNIT-BD-01..05). |
| SEC-JQ1 | Add per-user job dispatch rate limiting in `src/agents/dispatcher.ts` — e.g. 10 jobs/min/user/action | S | High | ✅ Done (2026-05-12) | 10 jobs/min/user/actionType. In-memory Map with inline expiry cleanup. Optional `userId` on `DispatchOptions`. 5 unit tests (NF-UNIT-DRL-01..05). |
| SEC-CLA | Add DCO sign-off requirement to `CONTRIBUTING.md` — one-liner per commit (`Signed-off-by:`), enforced via CI check | XS | High | ✅ Done (2026-04-12); CI job removed 2026-05 | `CONTRIBUTING.md §DCO` added. CI `dco` job removed 2026-05-27: `github/dco@v1` action repo doesn't exist publicly (404). DCO guidance remains in CONTRIBUTING.md; solo project — no external contributors yet. |

#### Backlog — post-launch polish

| ID | Title | Priority | Notes |
|----|-------|----------|-------|
| SEC-CORS1 | Validate `CONSOLE_ORIGIN` is a bare origin (no path/query/hash) at startup | Low | `src/api/index.ts:153` |
| SEC-RL3 | Add rate limiting to `POST /api/v1/auth/register` — 5 req/IP/60s | Low | Lower priority; registration is first-run only |
| SEC-AI2 | Count first-attempt token spend (from failed `AI_NoObjectGeneratedError` retries) against monthly budget | Low | `src/agents/run-agent.ts:188` — first call tokens currently lost |
| SEC-AI3 | Separate `knowledge_capture` sub-quota (Growth-tier) from main monthly pool | Low | `src/agents/dispatcher.ts` |
| SEC-JQ2 | Per-product pg-boss concurrency cap — prevent one product consuming all triage slots | Low | `src/agents/dispatcher.ts` |
| SEC-JQ3 | Manual dead-letter retry endpoint — `POST /api/v1/cases/:caseId/retry-agent-job` | Low | `src/infra/queue/boss.ts` |
| SEC-LC3 | Add `author` + `repository` fields to `console/package.json` | Low | Standard npm metadata |

> **Note:** AUDIT-001 finding AI-1 ("no soft-cap or circuit breaker") is **incorrect** — `src/agents/budget.ts` + `src/agents/dispatcher.ts` already implement both soft warnings and hard stops per action type (AE-13/ADR-028). Finding removed from blockers.

---

### Ops / Maintenance

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| OPS-M-01 | Stripe webhook 404 on billing-disabled instances | XS | P0 | ✅ Done (2026-06-02) | `src/api/webhooks/stripe.ts`: return `200 {received:true}` instead of `404` when `BILLING_ENABLED=false`. Prevents Stripe retrying and sending failure emails. Also set `BILLING_ENABLED=false` on main VPS (was incorrectly `true`). CI audit gate updated to `--omit=dev` (vitest critical CVE is dev-only; vitest 4.x migration deferred → tracked as OPS-M-03). |
| OPS-M-02 | Dependency CVE sweep — Hono 4 moderate CVEs + vitest critical | S | P1 | ✅ Done (2026-06-09) | Hono `4.7.5 → 4.12.25` (4 moderate CVEs: IP restriction bypass, app.mount() path decode, JWT scheme, cookie injection). Vitest `3.x → 4.1.8` (critical CVE GHSA-5xrq-8626-4rwp). Fixed 5 test files for vitest 4.x mock hoisting changes: use `vi.hoisted()` for vars referenced in `vi.mock()` factories; replace arrow functions with regular functions in mock constructors (vitest 4.x uses `Reflect.construct`). Remaining: `@ai-sdk/provider-utils` low (via `ollama-ai-provider`, no upstream fix available — monitored). |
| OPS-M-03 | ollama-ai-provider CVE — @ai-sdk/provider-utils uncontrolled resource consumption | XS | P2 | ⏳ Monitoring | Low severity. No fix available upstream. `ollama-ai-provider` pins an old `@ai-sdk/provider-utils ≤3.0.97`. CI audit gate excludes dev deps (`--omit=dev`) — this is a runtime dep so will surface when fixed upstream. Check for fix when upgrading AI SDK. |
| OPS-M-04 | CI actions on deprecated Node 20 runtime (GitHub force-migrates to Node 24 on 2026-06-16) | XS | P1 | ✅ Done (2026-06-14) | Bumped SHA-pinned actions to Node 24 majors: `actions/checkout` v4→v6.0.3 (`df4cb1c`), `dorny/paths-filter` v3→v4.0.1 (`fbd0ab8`, now SHA-pinned), `docker/setup-buildx-action` v3→v4.1.0 (`d7f5e7f`). Others already Node 24 (`setup-node@v6.4.0`, `build-push@v6`, `cache@v5`, `upload-artifact@v7`, `login-action@v3`). Verified via PR CI: `changes`+`secrets` jobs exercise checkout v6 + paths-filter v4. `setup-buildx-action` v4 runs only on main-push `publish` job — exercised on next code deploy (low-risk official-action bump). |
| OPS-M-05 | esbuild CVEs — RCE via NPM_CONFIG_REGISTRY (high) + arbitrary file read on Windows dev server (low) | XS | P1 | ✅ Done (2026-06-14) | Dependabot alerts #52/#53. esbuild `<0.28.1` → pinned `^0.28.1` via root `overrides`. Dev-only transitive (via `tsx@4.21` and `vite@8`←`vitest`); never in the runtime image. Verified locally: full unit suite (1509 tests) + `tsc --noEmit` green on esbuild 0.28.1 — esbuild is the vitest/tsx transform engine, so a green suite exercises it directly. |
| OPS-M-06 | Stripe SDK v21 → v22 (Dependabot PR #47) | S | P3 (deferred — paid features on hold) | ⏸️ Deferred / analysis done (2026-06-14) | **Do not action until paid/billing comes off hold.** Full prep below so the fix needs no re-investigation. See detailed analysis in **OPS-M-06 notes** under the backlog table. |

---

#### OPS-M-06 notes — Stripe v21 → v22 upgrade prep (analysis 2026-06-14)

> Context captured from a deep analysis so the fix can be executed without re-investigation once paid/billing is reactivated. Dependabot PR is **#47** (`stripe 21.0.1 → 22.2.0`); currently held, CI failing.

**Root cause of CI failure (entire failure — nothing else):**
Stripe SDK v22.2.0 advanced its pinned `apiVersion` literal type `2026-03-25.dahlia` → `2026-05-27.dahlia`. The code hardcodes the old string in **4 sites**, producing 4× `TS2322`:
- `src/billing/stripe.ts:19`
- `src/fleet/api/owner.ts:369`
- `src/fleet/api/saas-account.ts:244`
- `src/fleet/api/saas.ts:106`

**Stripe API surface in use (small, stable):** `checkout.sessions`, `billingPortal.sessions`, `subscriptions.{list,retrieve,update}`, `webhooks.constructEvent`.

**Risk assessment — three layers, all low:**
1. *SDK v22 breaking changes* (tsc-detectable): only the apiVersion type affected us — proof that the rest don't apply. Verified non-applicable: Stripe-now-true-ES6-class (we already use `new Stripe()`), removed callbacks / plain-key-as-arg (we pass `(key,{apiVersion})`), RequestParams-first/RequestOptions-second ordering, removed `StripeResource` internals, removed per-request host override, `Stripe.StripeContext`→`StripeContextType` (all unused).
2. *API-version behavior* `2026-03-25.dahlia` → `2026-05-27.dahlia` (GA `.dahlia` channel, not preview): all changes in that window are non-breaking/additive for our 6 methods. The breaking changes (e.g. `billed_until` default removal) are in the `.preview` channel, which we do not pin.
3. *Tests*: 9 files mock `stripe` by replacing the default export with a constructor mock (`default: vi.fn(function(){…})`), so they are version-agnostic; none assert the apiVersion string. **No test changes needed.**

**Recommended fix (XS–S, high confidence):**
- *Minimal:* set the 4 strings to `2026-05-27.dahlia`.
- *Better (kills the recurring break):* the 3 `fleet/api/*` files each do their own `new Stripe(...)` instead of using the existing `getStripeClient()` singleton in `src/billing/stripe.ts`. Route all instantiation through the singleton and define the apiVersion **once** as a named const. Future Stripe bumps then touch a single line. Bonus: the singleton enforces the **SEC-ST2** test-key-in-prod guard that the 3 ad-hoc instances currently bypass — fixing a latent inconsistency.
- *Verify:* `npm run lint` + `npm test` (full suite covers all Stripe call sites via mocks). No prod-only behavior to smoke-test since the API-version delta is additive.

---

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
| DOCS-01 | README overhaul — hero screenshot, 3-command quickstart at top, minimal required env vars table, common issues section, link to full self-hosting guide | S | P1 | ✅ Done | Added "How It Works" 5-step flow, richer troubleshooting (disk, OU limit, console blank), external webhook channel link. |
| DOCS-02 | `docs/self-hosting.md` — full setup guide: compose, first admin, GitHub App, email provider, channels, production checklist | M | P2 | ✅ Done | Added external webhook channel link, §8 Disk Maintenance (docker image prune + rationale from QE-08). |
| DOCS-03 | `docs/channels/` — one setup guide per channel type: email (SMTP/Postmark/Resend), Telegram bot, GitHub webhook, contact form widget, external webhook | S | P2 | ✅ Done | Created docs/channels/external-webhook.md — full guide: enable, request schema, curl example, thread grouping, idempotency, smoke canary, security, troubleshooting. |
| DOCS-04 | Architecture diagrams in README — Mermaid signal-to-resolution pipeline + deployment architecture | XS | P1 | ✅ Done (2026-05-27) | Two Mermaid flowcharts added after "How It Works" prose: (1) signal-to-resolution (channels → ingress → triage → known-issue match → 4 outcome branches), (2) deployment (Browser → Caddy → Console/API → Postgres + external LLM). All node labels quoted for `\n` support; separate arrow lines to avoid Mermaid keyword conflicts. |
| DOCS-05 | Comprehensive user guide — 9 markdown files in `docs/guide/` + web section at `/docs/[slug]` in console | L | P1 | ✅ Done (2026-05-27) | 9 guides: concepts.md, getting-started.md, cases.md, change-requests.md, knowledge-base.md, team-and-roles.md, notifications.md, analytics.md, settings.md. Web rendering via `console/src/app/docs/[slug]/page.tsx` (Next.js dynamic route, `generateStaticParams`). Content served from `console/src/content/guide/index.ts`. `react-markdown` + `remark-gfm` for rendering. DocsSidebar "Guides" group. Middleware bypass for `/docs/*`. All 9 slugs statically generated. Docs link in LandingNav + footer. |

### Beta Testing

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| BETA-NF-01 | NestFleet self-hosted beta eval — inject NF-as-product scenarios on main VPS | M | P1 | ✅ Done (2026-04-09) | 12 NF scenarios injected via external webhook on main VPS. All 12 cases processed through triage pipeline. Bugs found: BEF-26..31 (see QE track + Bug Fixes below). |

### Bug Fixes (BETA-NF-01 Findings)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| BEF-26 | Notification status inconsistency — operator notifications stay "Queued" despite being visible in console inbox | S | P1 | ✅ Done (2026-04-09) | All 12 notifications visible in console (console IS the inbox), but 10 showed "Queued" instead of "Sent". Two root causes: (1) `high` priority used `scheduledFor = now+15min`, skipping the immediate delivery block — operator notifications never reached the `if (scheduledFor <= now)` path; (2) when transport (email/Slack) not configured, status stayed "pending" even though the notification was already in the console inbox. Fix: (1) operator-facing audience (`audienceType !== "end_user"`) always gets `scheduledFor = now`, bypassing quiet hours and batch windows — console inbox is not a scheduled channel; (2) when transport not configured for operator audience, immediately mark status `"sent"` (console delivery counts). End-user notifications unchanged — for them, transport IS the delivery. |
| BEF-27 | Settings LLM — embedding model does not reset when switching providers | XS | P1 | ✅ Done (2026-04-09) | Switching from Google to Anthropic left `gemini-embedding-001` in the embedding field. Two-part fix: (1) backend `PUT /settings`: removed `&& !merged.embeddingModel` guard — now always resets embedding to provider default when provider changes and no explicit embeddingModel sent; (2) console: added client-side `EMBEDDING_DEFAULTS` map, reset `embeddingModel` state in the provider-change `useEffect` so the field updates immediately before Save. |
| BEF-28 | Settings LLM — no warning when switching providers replaces the stored API key | XS | P2 | ✅ Done (2026-04-09) | After saving with a new provider, switching back showed an empty API key field with no explanation. Fix: amber warning banner above Save button when `provider !== savedProvider` explains that switching will replace the stored key and the old provider's key must be re-entered if switching back. Also: "— no key for this provider" label simplified to "— enter API key" for clarity. |
| BEF-29 | Settings LLM — Google embedding validation calls wrong API URL and wrong API version | S | P1 | ✅ Done (2026-04-09) | `testEmbeddingConnection` used the OpenAI-compatible `/v1/embeddings` endpoint for all providers including Google. Google requires `generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={apiKey}` with a different request body shape. Fix: added Google-specific branch in `testEmbeddingConnection` with the correct URL, auth scheme, and request body (`content.parts[].text` instead of `input[]`). Added Anthropic + Self-hosted warning callouts in console embedding advanced section. Added `ollama pull nomic-embed-text` reminder for self-hosted. |
| BEF-30 | Settings LLM — 404 on embedding model blocks save even when LLM key is valid | XS | P1 | ✅ Done (2026-04-09) | Google `text-embedding-004` returned 404 for projects where the model is not enabled — hard-blocked the save even though the LLM key was valid and the LLM test passed. Fix: 404 from either Google or OpenAI-compat embedding endpoint is treated as `modelNotFound: true` — save proceeds with a backend warning log. Only auth failures (401/403) and network errors are hard blocks. `EmbeddingTestResult` extended with optional `modelNotFound` flag. |
| BEF-31 | Integration tests broken by QE-06 LLM validation (fake keys now trigger real HTTP calls) | XS | P1 | ✅ Done (2026-04-09) | `settings-api.test.ts` (NF-INT-103) and `provisioning/new-org-happy-path.test.ts` (NF-INT-524) started returning 422 after QE-06 added real HTTP validation — tests used fake keys like `sk-ant-xyz5678`. Fix: added `vi.stubGlobal("fetch", ...)` at module level in both test files so LLM/embedding validation calls return mocked success. NF-INT-515 also fixed: `beforeEach` deleted all test users, leaving DB empty → `isRegistrationOpen()` returned true (first-run mode) despite `REGISTRATION_ENABLED=false`. Fix: register a seed user inside the test before setting the env var. |
| BEF-32 | Lead role dead-end: awaiting-lead UI only shows "Route to Eng" — Resolve action missing despite being valid in state machine | XS | P1 | ✅ Done (2026-04-09) | `awaiting-lead → resolved` is a valid transition in case-state-machine.ts but the console did not surface it. Fixed: `primaryAction()` in queue/page.tsx now returns "resolve" for awaiting-lead cases. |
| BEF-33 | in-resolution cases: agent abstains from auto-reply but no "Send Reply" action surfaced for Lead to respond manually | S | P1 | ✅ Done (2026-04-09) | Fixed: EmailReplyPanel shown for in-resolution + awaiting-lead email cases even without draft. Backend send-draft-reply now accepts in-resolution status. Webhook cases show amber "reply via original channel" notice. isEmailCase corrected to check source_type="email" explicitly. |
| BEF-34 | Triage misclassification — "webhook" keyword in support questions triggers Change flow | S | P2 | ✅ Done (2026-04-10) | Observed in FREE community simulation (2026-04-10): Zapier integration question ("do you have a webhook I can use?") triaged as Bug/Change instead of general question. Root cause: triage prompt pattern-matches on "webhook" as a change indicator regardless of sentence context. Fix: tighten the Change classification signal — require intent markers (e.g. "please add", "we need", "feature request") not just nouns. No KB context was loaded, which amplifies misclassification risk on fresh instances. |
| BEF-35 | Triage misclassification — production crash with stack trace classified as Request | S | P2 | ✅ Done (2026-04-10) | Observed in FREE community simulation (2026-04-10): "Getting a 500 error... TypeError: Cannot read properties of undefined" classified as Request/Steward instead of Bug. Stack trace and "production blocker" language should be strong Bug signals. Fix: add stack trace detection (TypeError/Error: pattern) and "production blocker" phrase as hard Bug overrides in the triage prompt. |

### QE — Quality Engineering

> Root cause: all bugs found in BETA-NF-01 lived in the gap between unit tests (which mock pg-boss and the LLM) and real pipeline execution. This track closes that gap systematically.
> Implementation order: QE-01 → QE-02 → QE-03 → QE-04 + QE-05 in parallel → QE-06.

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| QE-01 | Agent Resilience Hardening + AGENT_REGISTRY | M | P0 | ✅ Done (2026-04-09) | `src/agents/evidence.ts`: shared `buildEvidencePack()` — embed → retrieve → try/catch (non-fatal) → soft-abstain on `no_results`/`insufficient_tier` → hard-throw `PolicyViolationError` on `audience_violation`/`stale_evidence`/`knowledge_conflict`. Replaced scattered try/catch in `auto-reply`, `known-issue-match`, `outage-routing`. `src/agents/registry.ts`: `AGENT_REGISTRY` merges 4 parallel maps (tool-sets, TOKEN_BUDGETS, TIMEOUTS_MS, llm-provider tiers). 30 new unit tests (evidence.test.ts + agent-resilience.test.ts). All passing. |
| QE-02 | Worker Idempotency Hardening | S | P0 | ✅ Done (2026-04-09) | State pre-check added to `FrontlineWorker` (status ≠ `enriching` → abstain), `StewardWorker` (status ≠ `triaged` → abstain), `OutageRoutingWorker` (terminal states → abstain). `boss.ts`: `registerDeadLetterHandler()` — shared DLQ consumer logging dead-lettered jobs at error level; DLQ queue created before all worker queues in `AbstractAgentWorker.register()`. `src/index.ts` calls `registerDeadLetterHandler()` at startup. 12 new unit tests (worker-idempotency.test.ts). All passing. |
| QE-03 | Pipeline Integration Tests | L | P0 | ✅ Done (2026-04-09) | `tests/integration/pipeline/pipeline.test.ts`: 6 tests with real pg-boss + Testcontainers Postgres, LLM stubbed at `runAgent()`. Tests: `pipeline-triage-only`, `pipeline-change-request`, `pipeline-retry-idempotent`, `pipeline-empty-knowledge-base`, `pipeline-worker-idempotency-frontline`, `pipeline-worker-idempotency-steward`. All passing in < 30s. |
| QE-04 | Post-Deploy Pipeline Smoke Test | S | P1 | ✅ Done (2026-04-09) | `scripts/smoke-pipeline.ts`: POST synthetic signal via external webhook → poll cases every 2s (60s timeout) → assert `triaged` + `triage_output` populated → exit 0/1. `smoke-pipeline` CI job added to `.github/workflows/ci.yml` after `deploy`. Needs GitHub secrets: `SMOKE_PRODUCT_ID`, `SMOKE_WEBHOOK_SECRET`, `SMOKE_API_TOKEN`. |
| QE-05 | Dead-Letter Case Recovery | M | P1 | ✅ Done (2026-04-09) | Migration `0049_add-processing-failed-status.sql`: adds `processing-failed` to `cases_status_check` constraint + `processing_error JSONB` column. State machine: `processing-failed` → `enriching \| resolved \| closed`. DLQ handler: `_markCaseProcessingFailed()` sets status + writes error payload (jobName, jobId, error). `POST /cases/:caseId/retry`: transitions `processing-failed → enriching`, clears `processing_error`, dispatches fresh triage job. Console: red row highlight + inline Retry button on cases list; `processing_error` detail panel + "Retry Processing" button on case detail. Smoke tested: retry moved case to `awaiting-lead` ✅. |
| QE-06 | LLM Configuration Validation at Save | S | P2 | ✅ Done (2026-04-09) | `PUT /settings`: validates LLM connection + embedding connection before DB write when `apiKey` is non-empty — 422 on auth/model failure, save skipped. Embedding 404 (model not in project) is a soft pass (`modelNotFound: true`) — saves with backend warning log. `testLlmConnection()` + `testEmbeddingConnection()` extracted as exported helpers. Google embedding uses correct `generativelanguage.googleapis.com/v1beta` endpoint with `embedContent` body shape. Console: `detail` field from 422 surfaced in toast via `apiFetch` error construction. 14 unit tests. Smoke tested: Google key validated successfully ✅. |
| QE-07 | Auto-resolve smoke canary cases at webhook ingestion | XS | P1 | ✅ Done (2026-04-10, revised) | `isSmokeCanary()` moved to BEFORE `createCase()` — no case created, no UI pollution. Signal still written for traceability. Returns `canary:true, caseId:""`. Previously resolved a case (polluted case list with spinner/no-events). Tests updated: NF-UNIT-EXT-12/13 now assert createCase + transitionCase NOT called; NF-UNIT-EXT-14 added for empty caseId. |
| QE-08 | Add `docker image prune -a --force` to deploy CI step before pulling new images | XS | P1 | ✅ Done (2026-04-09) | Added `docker image prune -a --force` before `docker compose pull` in `.github/workflows/ci.yml` deploy step. Also documented in `docs/self-hosting.md` §8 Disk Maintenance. |

### CI Hardening & Open-Source Launch (2026-05-27)

| ID | Title | Size | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| CI-FIX-01 | Fix 3 CI failures (runs 179–181): remove broken `github/dco` job, add `pull-requests: read` to `changes` job for Dependabot, regenerate lock file (`testcontainers@12.0.1` sync) | XS | P0 | ✅ Done (2026-05-27) | `github/dco@v1` action repo returns 404 — removed. `dorny/paths-filter` needs `pull-requests: read` when triggered by Dependabot — added to `changes` job permissions. `testcontainers` version mismatch in lock file — regenerated with `npm install --package-lock-only`. |
| CI-FIX-02 | Drop arm64 from GHCR image builds — remove QEMU setup step, change platforms to `linux/amd64` only | XS | P1 | ✅ Done (2026-05-27) | QEMU-emulated arm64 builds added ~15–30 min per push. Mac users build locally with `docker compose up -d --build` (native arm64). GHCR images ship amd64 only. Both `build-push-action` steps updated. |
| OSS-LAUNCH-01 | Make `nestfleet/nestfleet` GitHub repo public | XS | P0 | ✅ Done (2026-05-27) | Repo flipped to public. Pre-checks: no secrets in git history (SEC-S1 verified), AUDIT-001 all blockers resolved, FEAT-018 open-core separation complete. Classic branch protection added to `main` (require PR review, require status checks: api, console, secrets). |
| OSS-LAUNCH-02 | Add `NESTFLEET_DOMAIN` + `CONSOLE_ORIGIN` commented block to `.env.example` | XS | P2 | ✅ Done (2026-05-27) | Self-hosters with custom domains need these; were missing from `.env.example`. Production section added with generation instructions and explanation. |

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
> **2026-04-09 (session 2)** ✅ BETA-NF-01 run complete — all 12 NestFleet self-eval cases worked through (4 in-change, 6 in-resolution, 2 pre-resolved). Bugs found and fixed: BEF-32 (awaiting-lead missing Resolve button), BEF-33 (no Send Reply for in-resolution webhook cases — amber notice added, backend accepts in-resolution status), UX-07 (case ID shown instead of title), UX-08 (filter reset on back navigation). Smart retry routing fixed (pr_draft_prep dispatched correctly on retry). Triage token budget raised 6k→10k. DLQ updateQueue on startup. Smoke pipeline cleanup fixed (POST /resolve). embeddingApiKey separate field for Anthropic. OpenAI max_completion_tokens fix. Disk-full incident: pruned 7GB of old Docker images. New backlog items: BEF-34 pending, UX-09 (Resolve note inline), FEAT-014 (notification preferences), QE-07/08, role×state matrix analysis needed before operator playbook.
> **2026-05-27** ✅ CI hardening (CI-FIX-01/02) — removed broken `github/dco` action, fixed Dependabot `pull-requests:read` permissions, regenerated lock file, dropped arm64 QEMU builds. OSS launch (OSS-LAUNCH-01/02) — repo made public, branch protection enabled, `NESTFLEET_DOMAIN` added to `.env.example`. LP-06 — dual-audience hero (self-host + managed SaaS CTAs, AGPL stat, GitHub star link). DOCS-04 — two Mermaid architecture diagrams in README. DOCS-05 — 9-file user guide (`docs/guide/`) + web section at `/docs/[slug]` with `react-markdown` rendering. SEC-CLA updated: DCO CI job removed (action repo doesn't exist), CONTRIBUTING.md guidance kept.
> **2026-04-10** ✅ FEAT-014 (Notification Preferences) routing fixed — (app)/p/[slug]/settings/notifications/page.tsx re-export, back button, email prefs link moved inside Email card. UX-10 (KB nudge) — wizard step 5 "Product ready" success screen + amber KB empty-state nudge when cases exist. UX-11 (owner billing notice) fixed properly — owner detected via /owner/me (OWNER_USER_IDS), not JWT role; upgrade cards replaced with "Platform operator instance" notice. Roles matrix: pipeline badge for cases:create + change_requests:create. RBAC enforcement: requirePermission() middleware (reads role_permission_overrides first, falls back to DEFAULT_ROLE_PERMISSIONS); change_lead (15 perms) + product_lead (14 perms) added to DEFAULT_ROLE_PERMISSIONS; approvals + pr-drafts complete endpoints migrated from requireRole() to requirePermission(); 10 new unit tests (NF-UNIT-100–109). QE-07 revised: isSmokeCanary() moved before createCase() — smoke signals no longer create cases, eliminating UI pollution (spinner + no-events on resolved canary cases). All CI runs green.
> **2026-04-09 (session 3)** ✅ QE-07/08 + DOCS-01/02/03 + UX-06/09 shipped. QE-07: smoke canary auto-resolve in external webhook ingress (`isSmokeCanary()`, `canary:true` response, 9 new tests). QE-08: `docker image prune -a --force` in CI deploy step. DOCS-01/02/03: README overhaul, `docs/self-hosting.md` disk maintenance + channel links, `docs/channels/external-webhook.md` full guide. UX-06: Escalate to Lead button inline in Change Queue approval row. UX-09: Mark Resolved opens modal with optional note textarea; empty-state lineage also shows Resolve button for resolvable statuses. Smoke pipeline updated to detect `canary:true` and exit 0 immediately. Webhook route fixed to forward `canary:true` in HTTP response. All 3 CI runs converged green.
> **2026-04-09** ✅ QE track complete (QE-01..06) — Agent Resilience Hardening + AGENT_REGISTRY (QE-01); Worker Idempotency + DLQ handler (QE-02); Pipeline Integration Tests with Testcontainers (QE-03); Post-Deploy Smoke Test script + CI job (QE-04); Dead-Letter Case Recovery with `processing-failed` status + Retry endpoint + console UI (QE-05); LLM Config Validation at Save with real HTTP test before DB write (QE-06). Bug fixes: BEF-27 (embedding model resets on provider change — backend guard + frontend useEffect); BEF-28 (amber warning banner when switching providers replaces stored key); BEF-29 (Google embedding uses correct `generativelanguage.googleapis.com/v1beta` endpoint with `embedContent` body); BEF-30 (embedding 404 is soft-fail → `modelNotFound: true`, save proceeds with warning log); BEF-31 (integration tests broken by real LLM HTTP calls — `vi.stubGlobal("fetch")` added to 2 test files; NF-INT-515 seed-user-before-disable fix). Migration 0049 renamed from 0020 (collision). BEF-26 (operator notifications "Queued" bug) also resolved: operator-facing audience always gets `scheduledFor=now`; transport-not-configured → status `"sent"` immediately.
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
