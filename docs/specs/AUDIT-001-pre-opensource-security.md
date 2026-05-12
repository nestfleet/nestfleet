# AUDIT-001 — Pre-Open-Source Security & Compliance Audit

**Date:** 2026-04-12
**Branch:** `main`
**Target license:** AGPL-3.0-or-later
**Audited by:** Claude Code (SA role)
**Status:** Action required — see prioritized fix list

---

## Executive Summary

NestFleet is structurally sound: parameterized SQL throughout, proper JWT enforcement, RBAC/tenant isolation, webhook signature verification, and security headers are all in good shape. However, **8 blockers** must be resolved before the repo goes public, split across secrets management, two unauthenticated internal endpoints, a frontend license header gap, and rate-limiter memory leaks.

---

## PART 1 — SECRETS & SENSITIVE DATA

### [BLOCKER] `.env` contains real production secrets

The local `.env` is gitignored (correct), but git history must be verified to have never contained it, and all secrets below must be rotated before the repo goes public — any past commit is permanent once the repo is public.

```bash
git log --all --oneline -- .env    # must return nothing
git log --all --oneline -- "*.env"
```

Secrets found in local `.env` that must be rotated:

| Secret | Env var | Action |
|--------|---------|--------|
| GitHub App RSA private key | `GITHUB_APP_PRIVATE_KEY` | Revoke at github.com → App settings |
| GitHub webhook secret | `GITHUB_WEBHOOK_SECRET` | Rotate |
| GitHub PAT (appears twice) | `GITHUB_DEPLOY_TOKEN` + `GITHUB_TOKEN` | Revoke both at github.com |
| Stripe test key | `STRIPE_SECRET_KEY` (sk_test_…) | Archive at Stripe dashboard — note: comment says *"borrowed from DG sandbox"*, which is a problem regardless of test/live status |
| Hetzner API token | `HETZNER_API_TOKEN` | Revoke at console.hetzner.cloud |
| Cloudflare API token | `CLOUDFLARE_API_TOKEN` | Revoke at Cloudflare dashboard |
| Google API key (appears 3×) | `EMBEDDING_API_KEY`, `BUNDLED_LLM_API_KEY`, `BUNDLED_EMBEDDING_API_KEY` | Revoke at Google Cloud Console |
| JWT signing secret | `JWT_SECRET` | Rotate (value contains `-dev-` hint; must be changed for any real deploy) |
| License HMAC secret | `LICENSE_SECRET` | Rotate |
| AES-256-GCM encryption key | `SECRET_ENCRYPTION_KEY` + `ENCRYPTION_KEY` | Rotate |
| PostgreSQL password | `POSTGRES_PASSWORD` | Rotate |

**`.env.example`** correctly uses placeholder values — no action needed there.

---

## PART 2 — AUTHENTICATION & AUTHORIZATION

### CRITICAL — 2 unauthenticated internal endpoints on the public router

Both routes are mounted under `/api/v1/` with zero authentication:

| Route | File | Risk |
|-------|------|------|
| `POST /api/v1/internal/send-reminders` | `src/api/v1/cases.ts:799` | Any internet user can spam support leads with fake stale-case reminders |
| `POST /api/v1/internal/run-escalations` | `src/api/v1/notifications.ts` | Any internet user can trigger escalation logic across all products |

These are designed to be called by cron jobs but are fully exposed. Fix before going public:

**Option A — add a shared internal secret header:**
```typescript
const internalSecret = c.req.header("X-Internal-Secret")
if (internalSecret !== config.INTERNAL_CRON_SECRET) return c.json({ error: "UNAUTHORIZED" }, 401)
```

**Option B — move off the public router (recommended):** mount on a separate Hono router at a path outside the public API prefix, and invoke directly from the server rather than over HTTP.

### MEDIUM — CORS `CONSOLE_ORIGIN` not validated as a strict origin

`src/api/index.ts:153–162` — if `CONSOLE_ORIGIN` is set to a URL with a path instead of a bare origin, CORS may fail silently. Add validation at startup:

```typescript
const u = new URL(config.CONSOLE_ORIGIN)
if (u.pathname !== "/" || u.search || u.hash) {
  throw new Error("CONSOLE_ORIGIN must be a bare origin (no path, query, or hash)")
}
```

### Passing checks

| Check | Status |
|-------|--------|
| SQL injection (parameterized queries throughout) | ✅ PASS |
| JWT algorithm locked to HS256 (no `alg:none`) | ✅ PASS |
| JWT secret loaded from env, min 32 chars enforced | ✅ PASS |
| RBAC (`requireAuth` → `requireRole` → `requirePermission`) | ✅ PASS |
| Tenant isolation (queries filter by `product_id` from JWT) | ✅ PASS |
| Security headers (HSTS, CSP, X-Frame-Options, nosniff) | ✅ PASS |
| Stripe webhook: `constructEvent` signature verified | ✅ PASS |
| GitHub webhook: `X-Hub-Signature-256` verified | ✅ PASS |
| No hardcoded secrets in source code | ✅ PASS |

---

## PART 3 — RATE LIMITING

### CRITICAL — Memory leak in all in-memory rate limiters

**Affects:** `src/api/webhooks/contact-form.ts`, `src/api/webhooks/chat.ts`, `src/fleet/api/saas.ts`, `src/api/v1/waitlist.ts`

These Maps never delete expired entries — they only skip counting them. Under sustained load with many unique IPs, memory will grow without bound. Only `telemetry.ts` implements correct cleanup. Apply the same pattern everywhere:

```typescript
// At the top of every checkRateLimit() call:
const now = Date.now()
for (const [key, entry] of rateLimitMap) {
  if (now > entry.resetAt) rateLimitMap.delete(key)
}
```

### HIGH — No rate limiting on `/api/v1/auth/login`

`src/api/v1/auth.ts:29–70` — unlimited brute-force attempts possible against operator credentials. Self-hosted instances exposing the console to the internet are directly at risk. Add IP-based limiting (e.g., 5 attempts / 5 min) before credential checks.

### MEDIUM — No rate limiting on `/api/v1/auth/register`

Same file — lower priority since registration is first-run only, but worth capping at 5 req/IP/60s.

### Rate limiting coverage snapshot

| Endpoint | Status |
|----------|--------|
| `POST /webhooks/contact-form/submit/:productId` | ✅ 10 req/(productId+IP)/60s — memory leak |
| `POST /webhooks/chat/message/:productId` | ✅ 30 msg/session + 60 msg/IP / 60s — memory leak |
| `POST /api/v1/saas/signup` | ✅ 5 req/IP/60s — memory leak |
| `POST /api/v1/telemetry/ping` | ✅ 10 req/IP/60s — correct cleanup |
| `POST /api/v1/auth/login` | ❌ No rate limiting |
| `POST /api/v1/auth/register` | ❌ No rate limiting |
| `POST /api/v1/internal/send-reminders` | ❌ No rate limiting, no auth |
| `POST /api/v1/internal/run-escalations` | ❌ No rate limiting, no auth |

---

## PART 4 — AI API METERING

### CRITICAL — No soft-cap alerts or circuit breaker for custom API keys

`src/agents/dispatcher.ts` — monthly token budgets (`TOKEN_BUDGETS`) exist but there is no:
- Warning emitted when an org reaches 75% / 90% of monthly budget
- Hard stop that gracefully fails new jobs once the limit is hit
- Visibility in the console UI showing current AI spend

For self-hosted users providing their own Anthropic/OpenAI key, a misconfigured workflow can silently exhaust their entire monthly quota with no feedback until the provider bills them. At minimum, add a log warning at 80% and a graceful refusal at 100%.

### HIGH — Retry logic can silently spend up to 2.67× the budgeted tokens

`src/agents/run-agent.ts:188–197` — on `AI_NoObjectGeneratedError`, `maxOutputTokens` is doubled (up to 8,000). This is not logged at WARN level and not counted against the monthly budget tracker. Add a `logger.warn` on retry and ensure the retry token count is included in spend tracking.

### MEDIUM — `knowledge_capture` has no separate quota

Growth-tier gated but shares the same monthly token pool as cheaper actions. Consider a sub-quota or per-action-type spend tracking.

### Token budget config (for reference)

| Action | Input budget | Output budget | Phase |
|--------|-------------|--------------|-------|
| `triage` | 10k | 1.5k | Single |
| `auto_reply` | 8k | 3k | Single |
| `known_issue_match` | 5k | 600 | Two-phase |
| `change_prep` | 10k | 2k | Two-phase |
| `pr_draft_prep` | 12k | 3k | Two-phase |
| `outage_routing` | 6k | 800 | Two-phase |
| `knowledge_capture` | 8k | 1.5k | Single (Growth-tier) |

---

## PART 5 — STRIPE PAYMENTS

### HIGH — Checkout redirect URLs not validated for origin

`src/api/v1/billing.ts:96–102` — `success_url` and `cancel_url` from the request body are passed directly to Stripe without origin validation. An authenticated admin could redirect post-payment users to any domain. Fix:

```typescript
const successOrigin = new URL(body.success_url).origin
const consoleOrigin = new URL(config.CONSOLE_ORIGIN!).origin
if (successOrigin !== consoleOrigin) {
  return c.json({ error: "INVALID_REDIRECT" }, 400)
}
```

### HIGH — Downgrade endpoint lacks idempotency / tier validation

`src/api/v1/billing.ts:137–178` — no check that the requested plan is actually lower than the current one. An admin can spam downgrades, generating unnecessary Stripe API calls.

### MEDIUM — No test vs. live key environment guard

`src/billing/stripe.ts:10–17` — a developer could accidentally deploy with `sk_test_` to production. Add a startup guard:

```typescript
if (config.NODE_ENV === "production" && !config.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
  throw new Error("STRIPE_SECRET_KEY must be a live key (sk_live_) in production")
}
```

### Passing checks

| Check | Status |
|-------|--------|
| Webhook signature verified via `constructEvent` | ✅ PASS |
| All Stripe keys loaded from env | ✅ PASS |
| Subscription status always checked server-side | ✅ PASS |
| No TODO/FIXME markers in payment flows | ✅ PASS |

---

## PART 6 — JOB QUEUE (pg-boss)

### HIGH — No per-user dispatch rate limit

`src/agents/dispatcher.ts` — any authenticated admin can enqueue hundreds of jobs in seconds. Monthly token budget is the only backstop and can be exhausted in minutes. Add per-user per-action rate limiting at the dispatch layer (e.g., 10 jobs/min/user/action).

### MEDIUM — Dead-lettered jobs cannot be manually retried

`src/infra/queue/boss.ts:80–145` — dead-lettered jobs permanently mark the case as `processing-failed` with no retry path. A transient LLM timeout permanently fails that case. Add `POST /api/v1/cases/:caseId/retry-agent-job`.

### MEDIUM — Job concurrency is global, not per-product

A single product with a runaway loop can consume all 10 triage slots. Add per-product concurrency caps (e.g., max 3 concurrent jobs per product).

### Passing checks

| Check | Status |
|-------|--------|
| Job payloads validated before processing | ✅ PASS |
| Failure handlers defined for all job types | ✅ PASS |
| Dead-letter handler logs and marks case | ✅ PASS |

---

## PART 7 — LICENSE & COMPLIANCE

### CRITICAL — 134 frontend files missing AGPL-3.0 license headers

`console/src/` — the backend (`src/`) has 100% SPDX header coverage. The frontend has ~2% (~3 of 134 files). This affects legal enforceability for the open-source release.

Fix (run from repo root):
```bash
find console/src -name "*.ts" -o -name "*.tsx" | while read f; do
  grep -q "SPDX" "$f" || sed -i '' "1s|^|// SPDX-License-Identifier: AGPL-3.0-or-later\n// Copyright (C) 2024-2026 NestFleet contributors\n\n|" "$f"
done
```

### HIGH — No CLA mechanism

`CONTRIBUTING.md` asks contributors to agree to AGPL-3.0 but there is no copyright assignment or Contributor License Agreement. Without a CLA you cannot offer a proprietary SaaS/enterprise tier or relicense in future versions. Since the codebase currently has a single author (verified via `git log`), this does not block v1.0 launch — but add a DCO or CLA requirement before accepting any external PRs.

### HIGH — No `LICENSES.md` / `NOTICE` file

`axe-core` in the frontend is MPL-2.0 (file-level copyleft, compatible with AGPL-3.0 but requires attribution). Create `LICENSES.md` at the repo root:

```markdown
# License Notices

NestFleet is released under AGPL-3.0-or-later. See [LICENSE](LICENSE).

## Notable dependency licenses

### axe-core (console frontend)
License: Mozilla Public License 2.0 (MPL-2.0)
https://github.com/dequelabs/axe-core

### postgres (backend)
License: Unlicense (public domain)
https://github.com/porsager/postgres

All other dependencies use MIT, Apache-2.0, or BSD-compatible licenses.
```

### MEDIUM — `console/package.json` missing `author` and `repository` fields

Add:
```json
{
  "author": "NestFleet contributors",
  "repository": {
    "type": "git",
    "url": "https://github.com/nestfleet/nestfleet.git",
    "directory": "console"
  }
}
```

### Passing checks

| Check | Status |
|-------|--------|
| Root `LICENSE` file is valid AGPL-3.0 | ✅ PASS |
| `package.json` (backend + frontend) declares `AGPL-3.0-or-later` | ✅ PASS |
| Backend `src/` SPDX headers — 100% coverage | ✅ PASS |
| README has clear license section with open-core split | ✅ PASS |
| No GPL-2.0 or proprietary dependency licenses found | ✅ PASS |
| No vendored / copied third-party code in source | ✅ PASS |
| All third-party service ToS checked — no conflicts | ✅ PASS |
| Single author verified (`git log`) — no CLA disputes for v1.0 | ✅ PASS |
| Fleet Module commercial separation properly licensed | ✅ PASS |

---

## Prioritized Fix List

### Blockers — must fix before making the repo public

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| S-1 | Verify `.env` was never committed to git history | `git log --all -- .env` | 5 min |
| S-2 | Rotate all secrets listed in Part 1 | External dashboards | 30 min |
| S-3 | Clarify / remove the "borrowed from DG sandbox" Stripe key | `.env` | 5 min |
| A-1 | Add auth or internal secret to 2 internal endpoints | `src/api/v1/cases.ts:799`, `src/api/v1/notifications.ts` | 1 hr |
| RL-1 | Fix memory leak in all in-memory rate limiters | `contact-form.ts`, `chat.ts`, `saas.ts`, `waitlist.ts` | 30 min |
| RL-2 | Add rate limiting to `/api/v1/auth/login` | `src/api/v1/auth.ts` | 30 min |
| LC-1 | Add SPDX headers to 134 `console/src/` files | `console/src/**` | 30 min |
| LC-2 | Create `LICENSES.md` at repo root | repo root | 30 min |

### High priority — fix before accepting first external PR

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| AI-1 | Add budget soft-cap warning + hard stop for AI calls | `src/agents/dispatcher.ts` | 4–6 hr |
| ST-1 | Validate checkout redirect URLs against `CONSOLE_ORIGIN` | `src/api/v1/billing.ts:96–102` | 1 hr |
| ST-2 | Add Stripe test vs. live key startup guard | `src/billing/stripe.ts` | 30 min |
| ST-3 | Add downgrade idempotency / tier validation | `src/api/v1/billing.ts:137–178` | 1 hr |
| JQ-1 | Add per-user job dispatch rate limiting | `src/agents/dispatcher.ts` | 2 hr |
| CLA | Add DCO sign-off requirement to `CONTRIBUTING.md` | `CONTRIBUTING.md` | 1 hr |

### Backlog — post-launch polish

| # | Issue |
|---|-------|
| CORS-1 | Validate `CONSOLE_ORIGIN` as bare origin at startup |
| RL-3 | Add rate limiting to `/api/v1/auth/register` |
| AI-2 | Count retry token spend against monthly budget |
| AI-3 | Separate `knowledge_capture` quota |
| JQ-2 | Per-product pg-boss concurrency cap |
| JQ-3 | Manual dead-letter retry endpoint (`POST /cases/:id/retry-agent-job`) |
| RES-1 | Pagination on memory sources endpoint (`src/api/v1/product-memory.ts:35–50`) |
| LC-3 | Add `author` + `repository` to `console/package.json` |

---

## Open Questions (owner to confirm)

1. **S-1** — Run `git log --all --oneline -- .env` and confirm output is empty.
2. **S-3** — The Stripe key comment says *"borrowed from DG sandbox"*. Is that a personal account or a third party? That key should be archived immediately either way.
