# OSS-001 — NestFleet Public Repo Readiness Plan

**Created:** 2026-05-11
**Updated:** 2026-05-11 (AUDIT-002 incorporated)
**Owner:** Alexey Kopachev
**Goal:** Make `nestfleet/nestfleet` repo public, publish GitHub App to Marketplace, and establish the free community edition as the primary discovery channel for the managed SaaS offering.

---

## Business Context

Model: AGPL-3.0 free self-hosted (GitHub) → ops complexity → upgrade to managed SaaS at nestfleet.dev.
The GitHub repo is the top-of-funnel. The landing page at nestfleet.dev must lead with the free version, not the SaaS pricing. The GitHub App listing on Marketplace is a secondary discovery channel.

---

## AUDIT-002 Decisions Log

AUDIT-002 (independent re-audit, 27 findings) was conducted in worktree `xenodochial-mcclintock-f90462`. Each finding is marked **INCORPORATE**, **DEFER**, or **PARTIAL** with rationale. Owner decisions OD-1 through OD-4 are confirmed.

### Critical Findings (C1–C7)

| ID | Finding | Decision | Rationale |
|----|---------|----------|-----------|
| C1 | `ENCRYPTION_KEY` name mismatch — code reads `ENCRYPTION_KEY`, docs say `SECRET_ENCRYPTION_KEY`; plaintext fallback when unset | **INCORPORATE** (Phase 0a) | Plaintext credential storage is a blocker |
| C2 | `.env.example` missing keygen comment for `SECRET_ENCRYPTION_KEY` | **INCORPORATE** (Phase 0a) | Blocks clean first-run |
| C3 | `npm audit` — unfixed vulnerabilities in root and console packages | **INCORPORATE** (Phase 0a) | Must be clean before going public |
| C4 | SEC-A1 fail-open — `if (secret) { verify }` means unset secret lets all traffic through | **INCORPORATE** (Phase 0a) | AUDIT-001 fix was incorrect; re-fix required |
| C5 | Email webhook (`POST /webhooks/email/inbound/:productId`) — no HMAC, no auth | **INCORPORATE** (Phase 0a) | Unauthenticated inbound injection |
| C6 | Fleet routes (`saasRouter`, `saasAccountRouter`, `ownerRouter`) mounted unconditionally — only `PROVISIONING_ENABLED` checked, not operator key gate | **INCORPORATE** (Phase 0a) | Contradicts FEAT-018 spec; routes exposed in community builds |
| C7 | PII / prod secrets in committed files — personal email (5×), local paths (3×), prod IP (ops-troubleshooting.md) | **INCORPORATE** (Phase 0a) | Must be scrubbed before flip |

### Owner Decisions (OD-1 to OD-4)

| ID | Decision | Action |
|----|----------|--------|
| OD-1 | Move `docs/business/beta-evaluation-scenarios.md` (personal email, local paths) to private ops repo | Phase 0a |
| OD-2 | Delete `docs/archive/competitor-revenue-research.md` from public tree | Phase 0a |
| OD-3 | Move `docs/ops-troubleshooting.md` (prod VPS IP, SSH commands) to private ops repo | Phase 0a |
| OD-4 | JWT auth uses localStorage — add doc warning now; migrate to httpOnly cookies in v0.2.0 | Phase 0b (doc) + 0.2.0 backlog |

### High Findings (H1–H10)

| ID | Finding | Decision | Rationale |
|----|---------|----------|-----------|
| H1 | `tmp_test_triage.ts` (repo root) — scratch script with hardcoded productId, first thing a cloner sees | **INCORPORATE** (Phase 0b) | Immediate credibility damage |
| H2 | Default postgres password `nestfleet` in `docker-compose.yml` — should be `:?required` like prod compose | **INCORPORATE** (Phase 0b) | Security baseline for self-hosters |
| H3 | Backend `src/` SPDX headers — only ~7% coverage (AUDIT-001 only fixed console/src/) | **INCORPORATE** (Phase 0b) | AGPL enforcement requires headers on the actual AGPL core |
| H4 | `src/fleet/workers/ssh-exec.ts` missing SPDX (commercial module) | **INCORPORATE** (Phase 0b) | Included in scripted pass |
| H5 | SEC-ST1: Stripe checkout `success_url`/`cancel_url` not origin-validated | **INCORPORATE** (Phase 4) | Pre-first-external-PR security item |
| H6 | SEC-ST2: No startup guard for `sk_test_` in production | **INCORPORATE** (Phase 4) | Pre-first-external-PR security item |
| H7 | JWT localStorage — known XSS risk; doc warning needed now | **INCORPORATE** (Phase 0b, doc-fix) | OD-4: document, migrate in 0.2.0 |
| H8 | `scripts/ingest-docugardener.ts` — DG-specific name on public CLI surface | **INCORPORATE** (Phase 0b) | Rename to `scripts/ingest-docs.ts` |
| H9 | `scripts/seed-admin.ts` default password `nestfleet-admin-2025` hardcoded | **INCORPORATE** (Phase 0b) | Env-ify; also appears in E2E specs |
| H10 | `LICENSES.md` — lists 11 backend deps, zero console deps | **INCORPORATE** (Phase 0b) | Regenerate fully |

### Medium Findings (M1–M10) — selection

| ID | Finding | Decision | Rationale |
|----|---------|----------|-----------|
| M6 | `LICENSE-FLEET.md` missing warranty disclaimer | **INCORPORATE** (Phase 0d) | 5-min doc fix |
| M7 | "Outcome Unit" not defined in docs | **INCORPORATE** (Phase 0d) | Blocks understanding of limits |
| M8 | `console.warn` calls in fleet module instead of structured logger | **INCORPORATE** (Phase 0d) | Observability consistency |
| M1 | `package.json:15` hardcoded Colima socket path — operator PII | **INCORPORATE** (Phase 0b) | Scrub before public |
| M2 | `vitest.integration.config.ts:21` hardcoded Colima path as fallback | **INCORPORATE** (Phase 0b) | Scrub before public |
| M3 | EMBEDDING_PROVIDER enum bug: `z.enum(["openai","ollama"])` rejects "google" at startup | **INCORPORATE** (Phase 0c) | Install blocker for Google users |
| M4 | `.env.example` OTEL endpoint always populated — implies tracing required | **INCORPORATE** (Phase 0c) | Comment it out with guidance |
| M5 | `LICENSE_FILE_PATH=./license.jwt` — implies license file required in community mode | **INCORPORATE** (Phase 0c) | Add comment: leave unset in community mode |
| M9 | README inaccuracies (embedding note, setup wizard ref, pull time, key command) | **INCORPORATE** (Phase 0c) | Installation UX |
| M10 | SEC-ST3: Downgrade endpoint lacks idempotency / tier validation | **DEFER → 0.2.0** | Low risk; billing disabled |

### Deferred Findings (post-flip 0.2.0 backlog)

SEC-JQ1 (per-user job dispatch rate limit), SEC-CORS1 (CONSOLE_ORIGIN validation), SEC-RL3 (register rate limit), SEC-AI2 (retry token tracking), SEC-JQ2 (per-product concurrency), SEC-JQ3 (dead-letter retry endpoint), OPS-FLEET-02, CLA (DCO is sufficient for v1.0).

---

## Phase 0a — Critical Fixes (pre-flip blocker, ~2.5 hrs)

> All C1–C7 findings. Zero of these may be open when the repo goes public.

| ID | Action | File(s) | Size |
|----|--------|---------|------|
| C1 | Rename env var: code to read `SECRET_ENCRYPTION_KEY` (or alias both); add startup throw when unset in production; add null-plaintext guard in `encryptSecret()` | `src/shared/crypto.ts`, `src/shared/config.ts` | S |
| C2 | Add `openssl rand -base64 32` keygen comment to `SECRET_ENCRYPTION_KEY` in `.env.example` | `.env.example` | XS |
| C3 | Run `npm audit fix` in root and `console/`; pin any unfixable deps with `overrides`; commit updated lockfiles | `package-lock.json`, `console/package-lock.json` | S |
| C4 | Fix SEC-A1 fail-open: change guard to `if (!secret \|\| header !== secret) return 401`; add startup `throw` when `NODE_ENV=production` and `INTERNAL_CRON_SECRET` is unset | `src/api/v1/cases.ts:801`, `src/api/v1/notifications.ts:133` | XS |
| C5 | Add shared-secret HMAC to email inbound webhook: require `X-Webhook-Secret` header; add `EMAIL_WEBHOOK_SECRET` to `.env.example` | `src/api/webhooks/email.ts` | S |
| C6 | Gate fleet routes behind `isFleetOperatorAuthorized()` check (per FEAT-018 spec) — return 404 when operator key not present, regardless of `PROVISIONING_ENABLED` | `src/api/index.ts:230–233` | S |
| C7-OD1 | Move `docs/business/beta-evaluation-scenarios.md` to private ops repo; add to `.gitignore` pattern | `docs/business/` | XS |
| C7-OD2 | Delete `docs/archive/competitor-revenue-research.md` | `docs/archive/` | XS |
| C7-OD3 | Move `docs/ops-troubleshooting.md` to private ops repo; add to `.gitignore` pattern | `docs/` | XS |

**Gate:** `git log --all --oneline -- .env` returns nothing. All C-items resolved. 0 audit vulnerabilities.

---

## Phase 0b — High Fixes (~1.5 hrs)

| ID | Action | File(s) | Size |
|----|--------|---------|------|
| H1 | Delete `tmp_test_triage.ts` from repo root; add `tmp_*.ts` to `.gitignore` | repo root | XS |
| H2 | Change `docker-compose.yml` `POSTGRES_PASSWORD` default from `nestfleet` to `:?POSTGRES_PASSWORD` (required); update `DATABASE_URL` likewise; update `.env.example` with placeholder and keygen note | `docker-compose.yml`, `.env.example` | XS |
| H3+H4 | Add SPDX headers to all `src/**/*.ts` files missing them (scripted prepend, ~151 files); include `src/fleet/` files | `src/**/*.ts` | S |
| H7-OD4 | Add JWT localStorage security note to `docs/self-hosting/security.md` (or README auth section): "v0.1.x uses localStorage; v0.2.0 migrates to httpOnly cookies" | docs | XS |
| H8 | Rename `scripts/ingest-docugardener.ts` → `scripts/ingest-docs.ts`; update any references | `scripts/` | XS |
| H9 | Env-ify seed admin password: read from `SEED_ADMIN_PASSWORD` env var with fallback only in test/dev mode; update E2E specs to use env var | `scripts/seed-admin.ts`, `tests/e2e/**` | S |
| H10 | Regenerate `LICENSES.md` — audit both `node_modules` trees (root + console); list all Apache-2.0, MPL-2.0, BSD deps with attribution | `LICENSES.md` | S |
| M1 | Remove hardcoded Colima socket path from `package.json:15`; use `DOCKER_HOST` env var only | `package.json` | XS |
| M2 | Remove hardcoded Colima path from `vitest.integration.config.ts:21` | `vitest.integration.config.ts` | XS |

---

## Phase 0c — Installation UX Fixes (~1 hr)

> Fixes that block a clean first-run experience for a new self-hoster.

| ID | Action | File(s) |
|----|--------|---------|
| INST-01 | Fix `EMBEDDING_PROVIDER` enum: add `"google"` to `z.enum(["openai","ollama","google"])` in `src/shared/config.ts:61` | `src/shared/config.ts` |
| INST-02 | Comment out `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env.example` (with note: "leave unset to disable tracing") | `.env.example` |
| INST-03 | Add comment to `LICENSE_FILE_PATH` in `.env.example`: "leave unset in community mode — all features enabled, no limits" | `.env.example` |
| INST-04 | Update `DATABASE_URL` comment in `.env.example` to note `?sslmode=require` for production | `.env.example` |
| INST-05 | Add brief embedding provider note to README (OpenAI required for embeddings; Ollama for LLM is fine) | `README.md` |
| INST-06 | Fix README key-command inconsistencies (setup wizard reference, image pull time estimate, keygen commands) | `README.md` |
| INST-07 | Mark optional env vars explicitly in `.env.example` with `# Optional:` prefix where not already done | `.env.example` |

---

## Phase 0d — Medium Easy Fixes (~30 min)

| ID | Action | File(s) |
|----|--------|---------|
| M6 | Add "AS IS, WITHOUT WARRANTY" disclaimer to `LICENSE-FLEET.md` | `LICENSE-FLEET.md` |
| M7 | Add "Outcome Unit" definition to README glossary or docs/concepts | `README.md` or `docs/` |
| M8 | Replace `console.warn` calls in `src/fleet/` with structured logger calls | `src/fleet/**` |

---

## Phase 1 — CI Optimisation (~1 hr)

> Two overlapping publish workflows, no path filters, E2E runs against production on every push. Risk of burning GitHub Actions minutes for trivial changes (same issue that hit DocuGardener).

| ID | Action | File | Size |
|----|--------|------|------|
| CI-01 | Delete `docker-publish.yml` — superseded by the `publish` job inside `ci.yml`; both cause double-publish on every main push | `.github/workflows/docker-publish.yml` | XS |
| CI-02 | Add path filters to `api` job — trigger only when `src/**`, `package*.json`, `Dockerfile`, or `tsconfig*.json` change | `.github/workflows/ci.yml` | XS |
| CI-03 | Add path filters to `console` job — trigger only when `console/**` changes | `.github/workflows/ci.yml` | XS |
| CI-04 | Add DCO sign-off check job — runs on `pull_request` only, rejects PRs missing `Signed-off-by:` line. Use `github/dco` action | `.github/workflows/ci.yml` | XS |
| CI-05 | Guard `smoke-pipeline` and `e2e` jobs against fork PRs — add `github.repository == 'nestfleet/nestfleet'` check so forked-repo pushes cannot trigger production deploys | `.github/workflows/ci.yml` | XS |
| CI-06 | Add `concurrency` group to ci.yml — cancel in-progress runs on the same branch when a new push arrives | `.github/workflows/ci.yml` | XS |
| CI-07 | Scope gitleaks: `--log-opts="HEAD~1..HEAD"` on PR runs; keep `--all` only on push to main | `.github/workflows/ci.yml` | XS |

**Expected outcome:** CI minutes roughly halved for doc-only and console-only changes. No double Docker publish. External PRs cannot trigger production jobs.

---

## Phase 2 — Landing Page Rework (~2 hrs)

> The landing page at nestfleet.dev currently leads with Starter/Growth/Scale paid tiers. For an OSS launch the primary message must be "free, self-hosted" with SaaS as a secondary teaser.

| ID | Action | File |
|----|--------|------|
| LP-OSS-01 | Remove `PricingSection` from `page.tsx` — replace with a minimal two-column block: "Community (Free)" self-hosted card + "Managed SaaS" coming-soon card with waitlist CTA | `console/src/app/page.tsx`, `console/src/components/PricingSection.tsx` |
| LP-OSS-02 | Change primary hero CTA from "Get managed hosting" to "Self-host free on GitHub" → links to repo | `console/src/app/page.tsx` |
| LP-OSS-03 | Update nav "Pricing" link → rename to "Plans" or remove; footer still links to `/terms` and `/privacy` | `console/src/app/page.tsx` |
| LP-OSS-04 | Remove `WAITLIST_MODE` guard from pricing area — since PricingSection is gone, the flag only needs to guard `/signup` page CTAs | `console/src/lib/flags.ts`, `console/src/app/signup/SignupForm.tsx` |

---

## Phase 2b — Manual Installation Test (owner-run)

> Owner acts as a new user and walks through the README self-hosting steps end-to-end on a clean machine (or clean Docker environment). Goal: arrive at a running NestFleet instance with the first admin account created.

**Prerequisites:** Phase 0a + 0b + 0c + 0d must be complete (installation UX fixes in).

**Checklist:**
- [ ] Clone repo from GitHub (public URL)
- [ ] Copy `.env.example` → `.env`; fill in only the required vars following README
- [ ] `docker compose up -d` — all containers start without error
- [ ] Database migrations run automatically on first start
- [ ] Navigate to `http://localhost:3001` — landing page loads
- [ ] Complete first-run setup wizard (admin account creation)
- [ ] Log in with created credentials
- [ ] Create a product and verify triage queue loads
- [ ] Raise issues found → fix → re-test

---

## Phase 3 — Legal Pages (Marketplace blocker, ~2–3 hrs)

> Current `/terms` and `/privacy` pages have an amber "DRAFT" banner. GitHub Marketplace review explicitly rejects placeholder pages.

| ID | Action | File |
|----|--------|------|
| LEGAL-01 | Write real Terms of Service — cover: service description, AGPL-3.0 community vs commercial SaaS, user obligations, data handling, liability limitation, governing law | `console/src/app/terms/page.tsx` |
| LEGAL-02 | Write real Privacy Policy — GDPR-structured: data collected, purpose, retention, third parties (Hetzner, Google SMTP, Stripe), user rights, contact | `console/src/app/privacy/page.tsx` |
| LEGAL-03 | Remove amber "DRAFT" banners from both pages | both pages |

---

## Phase 4 — Security Code Items (before first external PR, ~1 hr)

> Only SEC-ST1 and SEC-ST2 are in scope for v1.0. ST3 and JQ1 deferred to 0.2.0.

| ID | Title | File | Status |
|----|-------|------|--------|
| SEC-ST1 | Validate `success_url`/`cancel_url` origin against `CONSOLE_ORIGIN` in checkout | `src/api/v1/billing.ts:96` | Not Started |
| SEC-ST2 | Stripe test-vs-live key startup guard — throw if `NODE_ENV=production` and key is `sk_test_` | `src/billing/stripe.ts` | Not Started |

---

## Phase 5 — Community Health Files (~1 hr)

> NestFleet already has: issue templates (bug + feature), PR template. Missing: dependabot, CODE_OF_CONDUCT, CHANGELOG, DCO in CONTRIBUTING.

| ID | File | Content |
|----|------|---------|
| OSS-01 | `.github/dependabot.yml` | npm (root, weekly), npm (console/, weekly), github-actions (weekly) |
| OSS-02 | `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 — standard adoption, contact `info@nestfleet.dev` |
| OSS-03 | `CHANGELOG.md` | v0.1.0 entry — feature summary of all shipped work |
| OSS-04 | `CONTRIBUTING.md` update | Add DCO sign-off section: one-liner `Signed-off-by: Name <email>` per commit, reference the `dco` CI check |

---

## Phase 6 — GitHub Repo Settings (owner manual, ~1 hr)

| Step | Action |
|------|--------|
| 6-1 | Set repo **description**: "AI-native product operations platform — support triage, change management & GitHub PR drafting. Self-hosted (AGPL-3.0) or managed SaaS." |
| 6-2 | Set **website**: `https://nestfleet.dev` |
| 6-3 | Add **topics**: `typescript`, `ai`, `support-automation`, `product-operations`, `self-hosted`, `agpl`, `hono`, `nextjs`, `pg-boss`, `open-source` |
| 6-4 | **Branch protection** on `main`: require PR (1 review), require status checks (api, console, secrets, dco), dismiss stale reviews, no force push |
| 6-5 | **Enable GitHub Security Advisories** — repo Settings → Security → Advisories |
| 6-6 | Update `SECURITY.md` — add GitHub advisory reporting link alongside the email |
| 6-7 | **Enable GitHub Discussions** — good for community Q&A separate from bug reports |
| 6-8 | Flip visibility: **private → public** |

---

## Phase 7 — GitHub Marketplace Listing (~2 hrs, owner UI)

> List the NestFleet GitHub App (App ID 3297524) on Marketplace as a free discovery channel. Architecture note: the GitHub App handles PR drafting auth; the per-product repository webhook (`/webhooks/github/events/:productId`) is completely separate and unaffected by Marketplace listing.

| Step | Action | Note |
|------|--------|------|
| 7-1 | **Update App settings** (github.com/apps/nestfleet → Edit) | Homepage: `https://nestfleet.dev` · Setup URL: `https://nestfleet.dev/docs/self-hosting/github-app` · "Where installed" = Any account |
| 7-2 | **Create Marketplace listing** at github.com/apps/nestfleet → "Create Marketplace listing" | See listing fields below |
| 7-3 | **Upload 3 screenshots** (minimum required by GitHub review) | Triage queue view, Case detail + lineage timeline, Channels Hub / KB setup |
| 7-4 | **Submit for review** | GitHub reviews in 3–5 business days |
| 7-5 | **Test install flow** while review is pending | Click "Install" on draft listing → verify redirect to setup URL |

### Marketplace Listing Fields

| Field | Value |
|-------|-------|
| Name | `NestFleet` |
| Primary category | `Project management` |
| Secondary category | `Code review` |
| Short description | `AI product ops — support triage, change management & PR drafting. Self-hosted (AGPL-3.0) or managed SaaS.` |
| Homepage URL | `https://nestfleet.dev` |
| Support URL | `https://nestfleet.dev/docs` |
| Privacy Policy URL | `https://nestfleet.dev/privacy` |
| Terms of Service URL | `https://nestfleet.dev/terms` |
| Pricing | **Free** (single plan, $0) |

**Full description:**
```
NestFleet is an AI-native product operations platform that acts as a supervised virtual team for your SaaS products.

Install this GitHub App to connect NestFleet to your repositories. Once connected, NestFleet can:
- Draft pull requests directly on your repo when a change request is approved
- Track PR merge status and automatically resolve linked change requests
- Monitor CI check results and deployment status

**NestFleet is free and self-hosted (AGPL-3.0).** Clone the repo, run three commands, and have a working instance in minutes.

→ Self-hosting guide: https://nestfleet.dev/docs/self-hosting/docker
→ GitHub repository: https://github.com/nestfleet/nestfleet

Managed SaaS hosting available at nestfleet.dev for teams who prefer zero infrastructure.
```

---

## Phase 8 — Pre-First-Customer (not blocking public flip)

| ID | Item | Dependency |
|----|------|-----------|
| SEC-S2 | Rotate all prod secrets (GitHub App key, PATs, Hetzner, Cloudflare, JWT_SECRET, LICENSE_SECRET, SECRET_ENCRYPTION_KEY, POSTGRES_PASSWORD) | Before first paying customer |
| ORGA-01-S9 | Stripe live keys + webhook endpoint registered | Legal entity registered |
| FEAT-019-OFF | Flip `WAITLIST_MODE = false` in `console/src/lib/flags.ts`, redeploy, verify Stripe CTAs restore | After ORGA-01-S9 + legal entity |
| FEAT-017-F | Configure Stripe Customer Portal (allow upgrades/cancel, cancellation policy) | Before first paying customer |
| FEAT-013 | Stripe-integrated license reissue | Before scaling to multiple customers |

---

## Execution Order & Gates

```
Phase 0a (Critical fixes)       — GATE: all C1–C7 resolved, 0 audit vulns
Phase 0b (High fixes)           — sequential after 0a
Phase 0c (Installation UX)      — parallel with 0b
Phase 0d (Medium easy)          — parallel with 0b+0c
Phase 1  (CI optimisation)      — parallel with 0b+0c+0d
Phase 2  (Landing page)         — parallel with 1
Phase 2b (Manual install test)  — GATE: 0a+0b+0c complete; owner-run
Phase 3  (Legal pages)          — GATE: must complete before Phase 7
Phase 4  (Security code)        — GATE: before accepting external PRs
Phase 5  (Community files)      — parallel with Phase 4
Phase 6  (GitHub settings)      — GATE: must complete before 6-8 (flip)
  → 6-8: flip repo public
Phase 7  (Marketplace listing)  — submit after flip; 3–5 day review
Phase 8  (Pre-first-customer)   — ongoing, not blocking flip
```

### Estimated Effort

| Phase | Effort | Who |
|-------|--------|-----|
| 0a — Critical fixes | 2.5 hrs | Claude Code |
| 0b — High fixes | 1.5 hrs | Claude Code |
| 0c — Installation UX | 1 hr | Claude Code |
| 0d — Medium easy | 30 min | Claude Code |
| 1 — CI optimisation | 1 hr | Claude Code |
| 2 — Landing page | 2 hrs | Claude Code |
| 2b — Manual install test | 1–2 hrs | Owner |
| 3 — Legal pages | 2–3 hrs | Claude Code + owner review |
| 4 — Security code | 1 hr | Claude Code |
| 5 — Community files | 1 hr | Claude Code |
| 6 — GitHub settings | 1 hr | Owner (GitHub UI) |
| 7 — Marketplace | 2 hrs | Owner (GitHub UI) + Claude Code for copy |
| **Total to flip** | **~16 hrs** | |

---

## Post-Flip v0.2.0 Backlog

| ID | Item |
|----|------|
| H7-cookie | Migrate JWT auth from localStorage to httpOnly cookies (OD-4) |
| SEC-ST3 | Downgrade endpoint idempotency / tier validation |
| SEC-JQ1 | Per-user job dispatch rate limit (10 jobs/min/user/action) |
| SEC-CORS1 | Validate `CONSOLE_ORIGIN` is a bare origin at startup |
| SEC-RL3 | Rate limit `POST /api/v1/auth/register` |
| SEC-AI2 | Count retry token spend against monthly budget |
| SEC-JQ2 | Per-product pg-boss concurrency cap |
| SEC-JQ3 | Manual dead-letter retry endpoint (`POST /cases/:id/retry-agent-job`) |
| SEC-LC3 | Add `author` + `repository` to `console/package.json` |
| OPS-FLEET-02 | Fleet Update Management (controlled push to customer VPS fleet) |
| CLA | DCO is sufficient for v1.0; evaluate formal CLA before first non-owner external PR |
