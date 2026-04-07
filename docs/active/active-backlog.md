# NestFleet — Active Backlog

> **v1 delivery complete as of 2026-03-20. Post-v1 work active.**
> This file tracks only open, deferred, and pending items.
> All completed work (SPIKE-01–09, AE-01–13, SLICE-01–26, VAL/CG/BIL completed items, WAVE-6/7) is in [`v1-delivery-archive.md`](./v1-delivery-archive.md).
> Last updated: 2026-03-29 (PlatformCloud Phase 9 security hardening ✅ + Phase 10 multi-product billing consolidation ✅ + NF-SEC-02 Phase B/C ✅)

---

## Delivery Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Project Bootstrap | ✅ COMPLETE 2026-03-17 | |
| Phase 1: Spike Phase (SPIKE-01–09) | ✅ COMPLETE | |
| Phase 2: Agentic Engine (AE-01–13) | ✅ COMPLETE 2026-03-18 | |
| Phase 3: Feature Slices (SLICE-01–26) | ✅ COMPLETE | SLICE-24/25/26 ✅ 2026-03-19 |
| Phase 4: Integration + Polish | ✅ COMPLETE 2026-03-20 | SEC-04–08 ✅, VAL-01/03–06 ✅, CG-01–13 ✅, WAVE-6 W6-01–05 ✅, WAVE-7 W7-01–08 ✅ |
| **v1.5 — fast-follow** | ✅ COMPLETE 2026-03-20 | DEFERRED-19 ✅ (CR inline edit), DEFERRED-12 ✅ (Slack notifications). Remaining: DEFERRED-01/05/13–18 deferred to v2+ |
| **Billing & Monetisation (PlatformCloud)** | ✅ COMPLETE 2026-03-20 | Stripe suite, OU chain (BIL-01→06), PC-ARCH-01/02, PC-BIL-08/09/10/12, W6-06 — all done. See archive §14. |
| **Security Hardening (License/Auth)** | ✅ COMPLETE 2026-03-22 | SEC-C1/C2 (NestFleet), SEC-H2/H3 (PlatformCloud) — all critical/high findings fixed. SEC-M4 (HMAC verification) ✅ 2026-03-22. |
| **Post-v1 UX + Security** | ✅ COMPLETE 2026-03-22 | Settings → Product section ✅, SEC-M4 ✅, CHAT-UX-01 (a)+(b)+(c) ✅, login redirect ✅, DEFERRED-21 ✅, INFRA-01/02/03 ✅. Console WAVE 1–5 ✅. E2E regression suite ✅ (75 tests). |
| **Bug fixes + E2E gap coverage** | ✅ COMPLETE 2026-03-23 | DEFERRED-24 ✅ (EmailReplyPanel send bug fixed + collapsible UX). E2E gap audit: `nestfleet-gap-coverage.spec.ts` (20 tests, G1–G7). 3 existing specs hardened. Total E2E suite: **100 tests**. |
| **PlatformCloud Phase 9 — Security Hardening** | ✅ COMPLETE 2026-03-29 | Wave 1 (config): PC-SEC-20 `.gitignore` ✅, PC-SEC-26 `.dockerignore` ✅, PC-SEC-46 coverage/ deleted ✅, PC-SEC-47 compose version key removed ✅. Wave 2 (Docker): PC-SEC-24 non-root user ✅, PC-SEC-25 .map strip ✅, PC-SEC-44 loopback bind ✅. Wave 3 (middleware): PC-SEC-27 CORS ✅, PC-SEC-28 security headers ✅, PC-SEC-40 _resetKey guard ✅, PC-SEC-42 min secret length ✅, PC-SEC-35 prod enc key guard ✅. Wave 4A (rate limiting): PC-SEC-32 TRUSTED_PROXY IP extraction ✅, PC-SEC-33 eviction + max-size ✅, PC-SEC-31 all public routes rate-limited ✅. Wave 4B (error/logging): PC-SEC-36 decrypt failure logging ✅, PC-SEC-37 webhook 64KB body limit ✅, PC-SEC-38 sanitized error responses ✅. Wave 4C: PC-SEC-34 server-side nonce tracking ✅, PC-SEC-48 instance_tokens table removed ✅, PC-SEC-29 cookie Secure flag ✅, PC-SEC-43 Stripe IDs encrypted ✅. Wave 4D: PC-SEC-30 backup script ✅. Wave 5: PC-SEC-22 standard JWT claims (iat/exp/nbf/jti) ✅, PC-SEC-41 console HTTPS guard ✅. Deferred: PC-SEC-39 (HMAC canonical JSON — both sides identical, theoretical only). Manual/dev: PC-SEC-21/23 secret rotation. **NestFleet NF-SEC-01..04 ✅** (incl. NF-SEC-02 all phases A/B/C ✅ 2026-03-29). |
| **PlatformCloud Phase 10 — Multi-product billing consolidation** | ✅ COMPLETE 2026-03-29 | BIL-PA-01..12: product-aware billing engine (plans.ts rewrite, GPT3-arg getPriceId, docugardener price table) ✅. BIL-SR-01..08: public self-registration /trial endpoint (UUID org_id, product-prefix keys, email dedup) ✅. BIL-DN-01..06: downgrade scheduling via cancel_at_period_end + pending_changes webhook resolution ✅. DG-BIL-01: DocuGardener client_installed proxy routes (checkout + portal → PlatformCloud) ✅. NF-LIC-01..04: NestFleet billing proxy fixes (product field, POST /license/downgrade) + downgrade CTA in Settings ✅. BIL-EM-01..04: PlatformCloud billing email sequences (trial welcome, downgrade scheduled, upgrade confirmation, cancellation) ✅. 4 new test files (billing-product-aware, billing-selfregistration, billing-downgrade, billing-emails), 1 new NestFleet test file, 4 new DocuGardener tests. |
| **Settings LLM isolation + autofill fix** | ✅ COMPLETE 2026-03-23 | setup.ts API key encryption fix ✅. `key={productId}` on all settings sections ✅. `key={slug}` on ProductProvider ✅. Chrome autofill locked-field UX ✅. SLICE-11/12 tests ✅. E2E T-20..T-24 (5 tests). |
| **Chat pipeline + lineage graph fixes** | ✅ COMPLETE 2026-03-24 | pg-boss singleton race fix ✅. Chat triage dispatch fix ✅. Awaiting-lead SSE ack ✅. Lineage KIM timing correction ✅. `auto_reply → resolved` edge + satellite removal ✅. |
| **DG-08: sales_inquiry routing + pending handoff queue** | ✅ COMPLETE 2026-03-25 | `sales_inquiry` case type ✅. Enterprise severity floor ✅. `forward-to-team` endpoint ✅. Queue Pending Handoff section ✅. Cases pending handoff pill ✅. 50 new tests. |
| **SS-03: infra-debt side-car CR + full routing** | ✅ COMPLETE 2026-03-24 | `shouldCreateSidecarCr()` predicate ✅. `cr_track` field (migration 0039) ✅. Sidecar CR auto-created in `draft` with `cr_track: "infra_debt"` ✅. `change_prep` dispatched immediately (draft → analysis → approval-pending, Change Lead notified) ✅. Case resolves independently — decoupled lifecycles validated in SS-03 re-eval ✅. Approvals queue orange **Infra Debt** badge ✅. 42 new tests (NF-UNIT-STWD-21..35, NF-INT-70..76). Flow spec updated (§7.2 Path B, §11.7). |
| **Capability Manifest Push + LPP Adoption** | ✅ COMPLETE 2026-03-27 | NF-MAN-01/02 ✅. NF-LPP-01–06 ✅. See §11. |
| **AGPL SaaS-First Pivot (NF-PIVOT)** | ✅ COMPLETE | NF-PIVOT-01–11 all done. NF-PIVOT-11: 20-page docs site built (DocsLayout + DocsSidebar, 4 groups, served at /docs). |
| **NF-OSS-01 — OSS Release Audit** | ✅ COMPLETE | Fast-track done. All 13 follow-up FIX items resolved: P0 (FIX-01–03 ✅), P1 (FIX-04–10 ✅), P2 (FIX-11–13 ✅). See §13. |
| **Landing page OSS refactor** | ✅ COMPLETE 2026-04-01 | GitHub link in nav + footer ✅. Pricing in nav ✅. Stale "cloud connection" copy fixed ✅. Open Source & Self-hosting FAQ group added (4 Q&As) ✅. |
| **NF-BETA-01 — Beta Testing Scenarios** | ✅ COMPLETE 2026-04-01 | All automated tests written and passing: register unit (17 tests), security.txt unit (4 tests), signup E2E (8 tests SU-01..08), billing-return E2E (4 tests BR-01..04). §14.4 landing page = manual smoke only. See §14. |
| **NF-PROV-01 — New Org Provisioning Tests** | ✅ COMPLETE 2026-04-01 | Full provisioning suite: 22 integration tests across 4 files (NF-INT-517..538). Happy path, idempotency, cross-org isolation, billing init. provisionOrg() helper reusable. See §15. |
| **Beta Eval Group A — Run Complete** | ✅ COMPLETE 2026-04-02 | 7 PASS / 9 PARTIAL / 3 SKIP. Bugs logged as BEF-01..11 in §17. Manual runbook: `docs/business/beta-eval-manual-runbook.md`. |
| **Beta Eval Group B — Manual Steps** | ✅ COMPLETE 2026-04-05 | All SS + DG cases worked through. New findings: BEF-12..21, INFRA-04. Blocked: SS-09 (BEF-10), DG-09 (BEF-01/02), XP-01 (BEF-11). SSE checks (DG-07, SS-07) deferred to BEF-21. See manual runbook. |
| **BEF-01..11 — Beta Eval Bug Fixes** | ✅ COMPLETE 2026-04-02 | BEF-06 + BEF-10 deferred. See §17. |
| **NF-OPS-01 — Owner Admin Console** | ✅ COMPLETE 2026-04-05 | Revenue KPIs (Phase 1), opt-in telemetry pipeline (Phase 2), fleet health worker (Phase 3), owner console UI. 42 tests: NF-UNIT-REV/OWN/TEL/FHW + NF-INT-REV/MUT/TEL. See §16. |
| **Open / Deferred** | 🟡 MONITORING | Post-v1 integrations only; VAL-02/CG-04-B/Compare-roles UI moved to deferred |

**Completed 2026-03-29 (NF-SEC-02 Phase B/C):**
- **NF-SEC-02 Phase B — exp/iat as primary expiry source** ✅ — `validator.ts`: `payload.expiresAt = decoded.exp ?? decoded.expiresAt`; `payload.issuedAt = decoded.iat ?? decoded.issuedAt`. New JWTs from PlatformCloud (post PC-SEC-22) use standard claims; legacy JWTs without `exp`/`iat` fall back to custom fields transparently.
- **NF-SEC-02 Phase C — jwt.verify() enforces exp** ✅ — `ignoreExpiration: true` removed. `TokenExpiredError` caught separately: signature is known valid → `jwt.decode()` extracts payload, `jwtExpired=true` flag feeds the expiry check → `valid=true, expired=true` (graceful degradation preserved). Bad signatures still → `valid=false`. 6 new tests NF-UNIT-SEC-08..13 in `tests/unit/license/validator-expiry-phase-bc.test.ts`. Suite: **1088 passing**.

**Completed 2026-03-27:**
- **NF-MAN-01 — Capability manifest serializer** ✅ — `src/license/manifest.ts`: `buildManifest()` iterates `FEATURE_CATALOG`; features with `comingSoon=true` excluded; `featureFlag` present → `gate:"flag"`; `featureFlag` absent → `gate:"tier"` with `min_tier`. `seenKeys` set prevents duplicate manifest entries. Fixed `sso_group_mapping.featureFlag` in FEATURE_CATALOG (was `"sso_saml"` — shared key with SSO SAML, causing dedup; corrected to `"sso_group_mapping"`). 16 unit tests NF-UNIT-460–475.
- **NF-MAN-02 — Manifest push on startup** ✅ — `CloudConnection.pushCapabilities()`: PATCH to `PLATFORM_CLOUD_URL/api/v1/admin/products/nestfleet/capabilities`, Bearer `PLATFORM_CLOUD_TOKEN`. SHA-256 hash debounce via `_lastPushedManifestHash` prevents re-pushing unchanged manifests. Called from `startBackgroundSync()` after first successful `refreshFromCloud()`. `resetManifestHash()` exported for testing. 7 unit tests NF-UNIT-480–486.
- **NF-LPP-01 — Lease-based scheduling** ✅ — `refreshFromCloud()` parses `lease.ttl_seconds` + `lease.jitter_seconds` from 200 response; `scheduleNextValidation()` uses `setTimeout` chain with random jitter. Falls back to 6h if no lease returned. Previous `setInterval`-based `startCloudRefreshInterval()` retained as backward-compat shim.
- **NF-LPP-02 — config_version + 304 support** ✅ — Validation request body now sends `cached_config_version` (module-level `_configVersion`) and `product_version: "0.1.0"`. On 304 response: state unchanged, lease timer reset. On 200: `_configVersion` updated from response.
- **NF-LPP-03 — Cloud status banner + middleware** ✅ — `getLicenseCloudStatus()` / `getLicenseGraceUntil()` / `getLicenseReadOnlyUntil()` / `getLicenseRevokeReason()` / `getLicenseSupportContact()` exported from `validator.ts`. `requireLicenseActive()` Hono middleware in `src/auth/license-middleware.ts`: `grace` → pass + `X-License-Status` header; `read_only`/`revoked` → 403. `/license/status` endpoint extended with `cloudStatus`, `cloudGraceUntil`, `cloudReadOnlyUntil`, `revokeReason`, `supportContact`. `LicenseStatusBanner` component in `AppLayout` shows amber/red banners per state. 6 unit tests NF-UNIT-510–515.
- **NF-LPP-04 — Pending changes (delta display)** ✅ — `getPendingChanges()` exported. `PendingChangesNotice` renders each `PendingChange` item from `pending_changes[]` as a discrete row (type label + `effective_at` + optional message). Sources from delta array, NOT `features[]` — avoids DocuGardener's bug of showing the full plan feature list. Shown in Settings → License for admin users only.
- **NF-LPP-05 — SSO feature taxonomy fix** ✅ — `sso_saml` and `sso_group_mapping` are now separate manifest entries with independent `featureFlag` keys, matching PlatformCloud's separate capability catalog entries for these two SSO variants.
- **NF-LPP-06 — Offline fallback + autonomous degradation** ✅ — `_handleOfflineFailure()`: sets `_offlineWarning=true` immediately; if `_lastSuccessfulValidationAt` is ≥ 24h ago, autonomously enters `_cloudStatus="read_only"` (C-05). Yellow `LicenseStatusBanner` (distinct from Stripe grace amber) shown when `offlineWarning=true`. On next successful validation: warning cleared, status restored. 16 unit tests NF-UNIT-490–506.
- **Console types** ✅ — `LicenseCloudStatus` type + `PendingChange` interface added to `console/src/lib/types.ts`. `LicenseStatus` interface extended with 8 new LPP fields.

**Completed today (2026-03-20):**
- **SEC-C1** ✅ — `LICENSE_SECRET` hardcoded default removed from `config.ts`; `DEV_SECRET_PLACEHOLDER` guard added to `validateLicense()` — rejects known-bad secret at startup when `LICENSE_FILE_PATH` is configured; exits in production, safe-fails in development
- **SEC-C2** ✅ — `jwt.verify()` in `NestFleet/src/license/validator.ts` now pins `algorithms: ["HS256"]` — closes `alg:none` and asymmetric-key confusion attacks
- **SEC-H2** ✅ — PlatformCloud `/api/v1/license/validate` SQL query now includes `AND org_id = ?`; cross-org key validation is no longer possible
- **SEC-H3** ✅ — `checkAdminAuth()` in `PlatformCloud/src/auth/admin.ts` replaced `Array.includes()` with `crypto.timingSafeEqual()` — closes timing oracle on admin bearer tokens
- **SEC-M4** ✅ — COMPLETED 2026-03-22: cloud refresh HMAC verification (see §5 and 2026-03-22 completed items)
- **DEFERRED-05** ✅ — Chat widget (full implementation): SSE stream (`GET /webhooks/chat/stream/:productId/:sessionId`), ingest endpoints (`POST /webhooks/chat/message/:productId`), in-memory pub/sub session registry, operator reply API (`POST /api/v1/cases/:caseId/chat/reply`), floating bubble JS widget served from `/widget/nestfleet-chat.js`, Settings → Chat Widget section (enable toggle, welcome message, color picker, key generation, embed snippet), live chat reply panel in case detail view
- **DEFERRED-12** ✅ — Slack operator notifications: `service.ts` auto-mirrors all operator-audience events to Slack alongside email; Block Kit rich cards (severity colors); per-product webhook URL stored encrypted in `support_policy`; global env fallback (`SLACK_WEBHOOK_URL`/`SLACK_BOT_TOKEN`); digest flush also respects per-product webhook
- DEFERRED-19 ✅ — CR inline edit before approve → Option C: GitHub-first flow (info banner, 3-step workflow banner, PR-changed amber badge, auto-complete on PR merge via webhook)
- **Pipeline bug fixes** ✅ — `dispatchInTransaction` JSONB double-encoding fixed (`tx.json(jobData)`); wrong embedding model (`text-embedding-004` → `gemini-embedding-001`); LLM endpoint fixed (`.chat()` + `compatibility: "compatible"` for Google OpenAI-compatible); case `resolved→resolved` guard; worker idempotency guard
- **Nav unread badges** ✅ — `useNavBadges` hook + Sidebar badges for Queue / Cases / Approvals / PR Drafts (same localStorage-timestamp pattern as Notifications, 60s SWR polling, markSeen on pathname change)
- **Case lineage graph v2** ✅ — 4 enhancements: (1) START/END chips with success/failure/in-progress rings; (2) satellite node treatment for `notification_sent`/`auto_reply` (dashed border, 55% opacity, dotted edge); (3) sequence order badges (①②③ temporal order on every node); (4) back-in-force: amber `↺` loop-back edges, retry badges, attempt grouping frames; + `useDeferredValue` perf + Main route highlight toggle
- Notifications tab — GroupByPopover + NotifFilterPopover (already in place, confirmed W7-04)
- UX polish: Knowledge pending-review badge, AI Confidence column, bordered filter pills
- UX polish: Analytics superscript tier badges, Cases FilterPopover, Approvals/PR-Drafts header badges
- **Product suite strategy** ✅ — `docs/product-suite-strategy.md` (Option C: suite play, two products + shared PlatformCloud + deep integration bridge); `docs/specs/nestfleet-docugardener-integration.md` (full technical spec: 6 integration points, event schemas, shared data model, rollout plan)
- SEC-05 ✅ — AES-256-GCM webhook secret encryption
- Landing page ZoomOnScroll animation (#8)
- Backlog split — `active-backlog.md` + `v1-delivery-archive.md`
- **Stripe billing integration** ✅ — PC-BIL-02 (checkout), PC-BIL-03 (webhook), PC-BIL-04 (portal), PC-BIL-05 (mid-cycle upgrade), PC-BIL-07 (trial) — all tested end-to-end in Stripe sandbox
- **cancel_at threading** ✅ — PlatformCloud DB → validate endpoint → NestFleet `_cancelAt` → status endpoint → useLicense → orange "Cancellation scheduled" banner with Reactivate CTA
- **Stripe clover API fix** ✅ — portal cancel sets `sub.cancel_at` (unix ts) not `cancel_at_period_end: true`; webhook handler updated to read both
- **Billing portal UX** ✅ — ↻ sync button, source-aware portal_return message, Growth tier shows Scale contact-sales CTA instead of duplicate plan cards
- **PC-ARCH-01** ✅ — `PRODUCT_REGISTRY` built in `PlatformCloud/src/license/validator.ts` (feature matrix + OU limits for both `nestfleet` and `docugardener`)
- **PC-BIL-12** ✅ — `max_outcome_units_monthly` flows through PlatformCloud validation response → NestFleet `maxOutcomeUnitsMonthly` payload field
- **PC-BIL-09** ✅ — License format unification (JWT); `generator.ts` JWT path verified, `.license-dev` is valid HS256 JWT
- **PC-BIL-10** ✅ — Plan name migration; `seed-dev.ts` uses correct new plan names; DocuGardener intentionally keeps FREE/PRO/TEAM
- **BIL-01→06** ✅ — Full OU tracking chain verified complete: payload field, DB table, event emission (case.resolved, cr.completed), soft-block at 100%, warning at 80%, trial→community degradation
- **W6-06** ✅ — OU usage bar in Settings → Plan: `/license/status` returns `ouUsage`, bar renders amber ≥80% / red at 100%; also fixed pre-existing `currentProductCount` → `currentProducts` field mismatch
- **PC-ARCH-02** ✅ — Admin API token scoping: `auth/admin.ts` with 4 scopes wired to all billing routes; `PLATFORM_CLOUD_TOKEN` added to NestFleet config for authenticated billing calls; backwards-compatible with `PLATFORM_ADMIN_SECRET`
- **PC-BIL-08** ✅ — Usage metadata ingestion: telemetry schema extended with `outcome_units`, license_key regex accepts `nf_lic_`; NestFleet `CloudConnection` reports OU usage on background sync cycle (TELEMETRY_ENABLED guard)

**Completed 2026-03-25:**
- **DG-08 gap analysis — `sales_inquiry` type** ✅ — Root cause: `CATEGORY_TO_CASE_TYPE` had no sales entries; fallthrough returned `user_request`. Fix: extended map with `sales`, `sales_inquiry`, `sales inquiry`, `pre-sales`, `presales` → `sales_inquiry`. DB migration `0038` drops the auto-named CHECK constraint and re-adds `cases_type_check` including `sales_inquiry`. `CaseTypeSchema` updated in `repositories/cases.ts`.
- **DG-08 gap analysis — enterprise severity floor** ✅ — LLMs score sales inquiries as `low` (no user pain). Fix: `applyTriageOverrides()` Rule 2 — if category is in `ENTERPRISE_CATEGORY_KEYS` AND labels contain any of `ENTERPRISE_LABEL_KEYS` (`enterprise`, `soc2`, `compliance`, `hipaa`, `gdpr`, `sla`, etc.) AND severity is `low` → raised to `normal`. Audit tag `enterprise_sales_floor`. Documented in `case-and-change-lifecycle.md §11.6`.
- **Feature: `POST .../forward-to-team` endpoint** ✅ — Transitions `awaiting-lead → in-resolution`. Audit event `case.forwarded_to_team` records `{ team, note, forwardedBy }`. Allowed roles: `support_lead`, `product_lead`. Zod body schema: `team` ∈ `{sales, support, legal, billing}`, `note` min 10 chars.
- **Feature: Queue — "Forward to Team" primary action** ✅ — `primaryAction()` returns `"forward"` for `sales_inquiry` / `billing_inquiry` categories. Amber split button in `QueueRow`. Modal with 2×2 team grid, suggestion hint, context note textarea (min 10 chars, char counter). `viaLabel()` updated with `"case.forwarded_to_team"`.
- **Feature: Cases list — Pending Handoff filter pill** ✅ — Amber pill shows when forwarded cases exist. Client-side filter to `in-resolution + case.forwarded_to_team`. Amber active chip with × dismiss. `lastEventLabel` returns "Forwarded to team".
- **Feature: Lead Review queue — Pending Handoff section** ✅ — Second SWR query (`status=in-resolution`), client-side filtered to `case.forwarded_to_team`. Rendered as amber section below `awaiting-lead` cases. `primaryAction()` returns `"resolve"` for forwarded cases. Tab badge counts both groups. `mutateHandoff()` on resolve.
- **Tests** ✅ — 29 unit tests (`triage-overrides.test.ts` NF-UNIT-FLTW-01..29), 9 integration tests (`cases-forward.test.ts` NF-INT-50..58), 12 E2E tests (`forward-to-team.spec.ts` G8.1–G8.6 + G9.1–G9.6).

**Completed 2026-03-24:**
- **pg-boss singleton race condition fix** ✅ — `src/infra/queue/boss.ts`: replaced `_boss`/`_started` double-flag pattern with a Promise-based init lock (`_initPromise`). Six workers registering concurrently at startup each called `getBoss()` simultaneously; each saw `_started=false`, created its own `PgBoss` instance, then overwrote `_boss`. Workers registered `boss.work()` on different orphaned instances; `dispatch()` used yet another. Jobs landed in PostgreSQL but LISTEN/NOTIFY delivery was unreliable across instances → triage jobs silently missed. Fix guarantees exactly one `PgBoss` instance regardless of parallelism.
- **Chat triage auto-dispatch fix** ✅ — `src/ingress/chat-ingress.ts`: chat cases were stuck in `enriching` forever because `startChatSession()` deliberately skipped triage (old design) and the operator-reply path also skipped it. Fix: `dispatch({ actionType: "triage", productId, caseId, jobId, payload })` called immediately after case creation. Full pipeline now runs on every new chat session: frontline → steward → auto-reply, real-time SSE delivery to widget.
- **Chat awaiting-lead SSE acknowledgement** ✅ — `src/workers/auto-reply-worker.ts`: when auto-reply confidence is below threshold and the case enters `awaiting-lead`, the worker now calls `publish(sessionId, { type: "message", role: "agent", text: "Thanks for reaching out!..." })` before returning. Widget users see an immediate acknowledgement instead of silence. Guard: only fires when `sessionId` is present and `forceDraftOnly` is false.
- **Lineage graph — KIM "In Progress" + broken main route** ✅ — Three-part fix:
  1. **Timing correction** (`src/api/v1/lineage.ts`): `assembleLineage()` backdates `known_issue_match` nodes 1ms before the routing node when their timestamp is ≥ routing's. Root cause: `agent_runs.created_at` is written in the worker's `finally` block after `execute()`, which writes `case.routed` — so KIM timestamp was always slightly newer than routing, causing `buildEdges()` to see KIM as a terminal node.
  2. **Semantic successor** (`src/api/v1/lineage.ts`): added `auto_reply: ["resolved"]` to `SEMANTIC_SUCCESSORS` so `auto_reply → resolved` edge is built even when timestamps are close.
  3. **Satellite removal** (`console/src/lib/lineage-graph-utils.ts`): removed `auto_reply` from `SATELLITE_NODE_TYPES`. It is a core pipeline step (routing → auto_reply → resolved), not a side effect. Treating it as a satellite broke critical-path highlighting in Main route mode.

**Completed 2026-03-23:**
- **DEFERRED-24 — EmailReplyPanel send bug fixed** ✅ — Root cause: `sendDraftReplyApi` in `console/src/lib/api.ts` double-encoded the body (`body: JSON.stringify({...})` passed to `apiFetch` which already calls `JSON.stringify`). Server received a JSON string literal, Zod rejected it → 400 → frontend swallowed error as "Network error — please retry". Fix: pass body as plain object. Also: `handleSend` catch now shows `ApiError.message` (e.g. "Case must be in awaiting-lead status") instead of generic "Network error".
- **DEFERRED-24 — EmailReplyPanel collapsible UX** ✅ — Draft Reply section now collapsible/expandable, matching `ChatReplyPanel` pattern: clickable header, rotating chevron, localStorage-persisted state (`nestfleet:email-panel-expanded`, defaults open), collapsed view shows italic draft snippet + "Send Reply →" CTA. `EMAIL_EXPANDED_KEY` constant added alongside `CHAT_EXPANDED_KEY`.
- **E2E gap audit + `nestfleet-gap-coverage.spec.ts`** ✅ — Systematic audit of all 7 existing Playwright specs surfaced 8 gap categories. New spec (20 tests, all green): G1 `EmailReplyPanel`/DEFERRED-24 (5 tests), G2 Settings CI GitHub fields (4 tests), G3 post-login redirect (3 tests), G4 auth token key `nestfleet_token` (2 tests), G5 `send-draft-reply` API contract (2 tests), G6 CI tab states (2 tests), G7 `FilterPopover` cases filter (2 tests).
- **E2E spec hardening** ✅ — `nestfleet-main-flow.spec.ts` + `nestfleet.spec.ts`: `login()` helpers accept both `/cases` and `/p/<slug>/cases` redirect targets (DEFERRED-21-proof). `product-switcher.spec.ts`: `getProducts()` fixed from wrong key `nf_token` → canonical `nestfleet_token`.
- **Settings LLM per-product isolation — root-cause investigation + fix** ✅ — Identified 3-layer bug:
  1. **`setup.ts` API key plaintext storage** — setup wizard stored `llm.apiKey` as plaintext. Fixed: `encryptSecret(llm.apiKey)` now called before writing `llm_config`. Root cause of SkillSeal having `"admin"` in DB.
  2. **Settings section `useState` stale on product switch** — `LlmSection`, `LeadsSection`, etc. initialise their local state once on mount. Switching product without remounting kept the previous product's state. Fixed: `key={productId}` added to all section components in `console/src/app/settings/page.tsx`.
  3. **`ProductProvider` async race window** — `product` state remained at the old product during the async `getProductsApi()` refetch when the slug URL changed. Fixed: `key={slug}` on `<ProductProvider>` in `console/src/app/(app)/p/[slug]/layout.tsx` forces full remount on slug change.
- **Chrome password autofill on API key field** ✅ — Chrome autofilled `input[type="password"]` (no `autoComplete` attribute) with a saved credential (`"admin"`), overwriting any valid key on section remount or product switch. Safari was not affected. Fix: API key input now renders as a **locked read-only display** (masked key + "Change" button) when a saved key exists — no `<input>` rendered, nothing to autofill. "Change" unlocks an `<input autoComplete="new-password">`. A `useEffect([provider])` re-locks automatically when switching back to the saved provider.
- **SLICE-11 — Settings helpers unit tests** ✅ — `tests/unit/api/settings-helpers.test.ts`: NF-UNIT-60..68 (8 tests) covering `maskApiKey()` (valid key, undefined, short key, "admin" edge case, exactly-8-char boundary) and `EMBEDDING_DEFAULTS` (5 providers, google model, self-hosted model, all 768 dimensions).
- **SLICE-12 — Setup API integration tests** ✅ — `tests/integration/setup-api.test.ts`: NF-INT-120..126 (7 tests) covering setup status, product creation, key encryption verification (NF-INT-125: GET settings never exposes raw key, `apiKeyLast4` = `****1234`), idempotency (409 on duplicate), validation (400 for empty name, invalid JSON).
- **E2E `settings-product-isolation.spec.ts`** ✅ — 5 new Playwright tests (T-20..T-24): T-20 each product loads own LLM model, T-21 A→B switch shows Product B data, T-22 A→B→A round-trip restores Product A, T-23 API key hint (****) present/absent per product, T-24 Save request targets correct product endpoint (network interception). Total E2E suite: **100 tests**.

**Completed 2026-03-22:**
- **Settings → Product section** ✅ — `PATCH /api/v1/products/:productId` endpoint; `ProductSection` component in Settings console (name edit, read-only slug + copy, stage radio cards, 8 accent-color swatches with live preview, dirty-state save button, danger-zone archive modal). Backend: `ProductUpdateSchema` extended with `accent_color`, `updateProductApi()` added to `console/src/lib/api.ts`.
- **SEC-M4** ✅ — Cloud refresh HMAC verification: PlatformCloud `/validate` signs response with HMAC-SHA256 when `LICENSE_REFRESH_HMAC_SECRET` set; NestFleet `refreshFromCloud()` verifies signature when `CLOUD_REFRESH_HMAC_SECRET` set; rejects with error log on missing/invalid signature. Pure `signValidateResponse` / `verifyValidateResponse` utility in `src/license/hmac-response.ts` (10 unit tests NF-UNIT-450..459). Backward-compatible: unsigned responses accepted when secret not configured.
- **CHAT-UX-01 (a) — SSE push after auto-reply** ✅ — `sessionId` threaded through frontline-worker → steward-worker → auto-reply-worker payloads; `AutoReplyWorker` calls `publish(sessionId, { type: "message", role: "agent", text, ts })` after `transitionCase` to `resolved` so widget receives auto-reply in real time.
- **CHAT-UX-01 (b) — Block on resolved** ✅ — `ChatSessionClosedError` exported from `chat-ingress.ts`; `appendChatMessage()` throws it when linked case is resolved/closed (query excludes `status IN ('resolved','closed')`); webhook catches it → 409 `{ ok: false, error: "Chat session is closed.", session_closed: true }`. 4 integration tests (NF-INT-220..223).
- **Post-login redirect** ✅ — login page fetches `GET /api/v1/products` after auth and redirects to `/p/<firstSlug>/cases`; middleware adds `/cases` → `/p/${lastSlug}/cases` rule for returning users with `nf_last_product` cookie.
- **DEFERRED-21 verification** ✅ — §A–H manual UI cases all passed. Bugs found and fixed: switcher button visibility (accent color border), GET /products JWT staleness (now queries `operator_users` in DB), Add Product wizard stale-JWT redirect (fresh token returned from POST /products), 402 error messaging in wizard.
- **INFRA-02** ✅ — `src/infra/db/client.ts`: pool `max` 10 → 25, `idle_timeout` 30 → 20.
- **INFRA-03** ✅ — `src/api/webhooks/contact-form.ts`: rate limiter re-keyed `ip` → `productId:ip`; eliminates cross-product interference on shared egress IPs.
- **Migration runner CONCURRENTLY fix** ✅ — `src/infra/db/migrate.ts`: detects `CONCURRENTLY` or `-- no-transaction` in SQL content and runs those migrations outside `sql.begin()` transaction block; fixes startup crash on `0035_audit_events_product_time_idx.sql`.
- **Post-login redirect (DEFERRED-21 follow-up)** ✅ — `console/src/app/login/page.tsx`: after auth, fetches `GET /api/v1/products`, redirects to `/p/<firstSlug>/cases`; `console/src/middleware.ts`: `/cases` → `/p/${lastSlug}/cases` rule using `nf_last_product` cookie.
- **E2E regression — knowledge-memory-sources.spec.ts** ✅ — 26 tests: T-14 (post-login redirect), T-15 (knowledge page 2-tab structure), T-16 (source list/empty state/columns), T-17 (upload slide-over: open/fields/grouped options/cancel/validation), T-18 (help panel expand/collapse), T-19 (search probe controls/button state/action options), T-20 (health panel no-crash/content), T-21 (ingest round-trip: success toast + source appears in list).
- **INFRA-01** ✅ — Operator real-time stream: `src/notifications/operator-registry.ts` (in-memory pub/sub keyed by productId, mirrors session-registry pattern); `src/api/v1/product-events.ts` (`GET /api/v1/products/:productId/events` SSE, Bearer header + `?token=` fallback for EventSource, heartbeat every 30 s); `console/src/lib/useProductEventStream.ts` hook (opens EventSource, shows toasts on `chat_message`/`notification` events, reconnects on error); `ProductEventStream` client component mounted in `(app)/p/[slug]/layout.tsx`. Callers: `AutoReplyWorker` publishes `badge_update` after SSE push; chat webhook publishes `chat_message` on new sessions and follow-ups.

**Open items — prioritised:**

> INFRA-01 is now complete. Telegram/Discord/Live Chats tab blockers are unblocked.

| # | Item | Priority | Blocks | Notes |
|---|------|----------|--------|-------|
| 1 | **CHAT-UX-01 (c) — Live Chats tab in Queue** | ✅ Done | — | `channel` filter on `findCasesByProduct` (EXISTS subquery on conversations); `GET /cases?channel=chat`; Queue page now has Lead Review / Live Chats tabs; Live Chats polls 10s, shows status badge + "Open chat" action. |
| 2 | **CHAT-UX-01 — Widget "Start new chat?" on 409** | ✅ Done | — | `onSessionClosed()` added to widget JS: clears sessionId from localStorage, hides input row, shows "Start a new chat →" button that resets the pre-chat form. |
| 3 | **CHAT-UX-01 — Skip escalation for chat cases** | ✅ Done | — | `CASE_TRANSITIONS["enriching"]` extended to allow `in-resolution`; chat reply handler's first-reply path now calls `transitionCase(caseId, null, "in-resolution")` instead of dispatching triage. |
| 4 | **CHAT-UX-01 — Operator real-time badge** | ✅ Done | — | `useProductEventStream` calls `mutate(["queue-live-chats", productId])` on `chat_message` SSE event → Live Chats tab badge + list refresh immediately without waiting for 10s poll. |
| 5 | **Console WAVE 1 — Lead Review Queue redesign** | ✅ Done | — | 2-line subtitle (`shortId · type · severity`), `py-2.5` header padding, Waiting col, `typeLabel()` helper, Live Chats tab aligned. |
| 6 | **Console WAVE 2 — Detail pages** | ✅ Done | — | Case: AI Triage Summary card (violet), `typeLabel` badge, lineage toggle colors. Approval: decision outcome card (emerald/red), shared `DetailRow`. PR Draft: shared `DetailRow`. |
| 7 | **Console WAVE 3 — Notifications** | ✅ Done | — | Source-type filter pills (All/Cases/CRs/Products) with live counts. Group-by "By entity" (`source_type\|source_ref`). `usePendingNotificationRefs` hook. Amber indicator dots on Cases / Approvals / PR Drafts rows. |
| 8 | **DEFERRED-01 — Telegram connector** | 🟡 Medium | — | Inbound + reply adapter. INFRA-01 unblocked; still needs EU legal sign-off. (see §4.5) |
| 9 | **WAVE 4 — Dashboard / Home** | ✅ Done | — | `GET /api/v1/products/:productId/dashboard`; 4 KPI cards + 15-event activity feed; SWR 30s; PERF-01 `audit_events_product_time_idx` (migration 0035). DEFERRED-10 closed. |
| 10 | **WAVE 5 — Product memory ingestion** | ✅ Done + Tested 2026-03-23 | — | `POST /memory/ingest` API; Knowledge page 2-tab restructure; source list, upload slide-over, health panel, search probe, contextual help panel; 20 integration tests T-W5-01–20. Manual sign-off: 2 real docs ingested, health 94%, search returning results. |
| 11 | **E2E regression — WAVE 5 + DEFERRED-21** | ✅ Done 2026-03-22 | — | `knowledge-memory-sources.spec.ts`: 26 tests T-14–T-21 covering post-login redirect, knowledge 2-tab structure, memory sources tab, upload slide-over, help panel, search probe, health panel, ingest round-trip. |
| 12 | **DEFERRED-22 — Batch memory source upload** | 🟡 Medium | — | CLI: `tsx src/memory/ingestion/pipeline.ts --rootDir ./docs --productId <id>`; Console: folder drag-and-drop. `ingestFromFilesystem()` already implemented in pipeline.ts. Interim: `docs://sad/filename.md` URI convention for manual uploads. |
| 13 | **Post-v1 integration roadmap** | 📋 Tracked | — | DEFERRED-14–18 (Linear, Discord, Jira, Headless Portal, Teams) per §4.2 phasing |
| 14 | **DEFERRED-23 — GitHub outbound config in Settings UI** | ✅ Done 2026-03-23 | — | Bug 1 (split storage), Bug 2 (PAT not wired), Settings UI PAT+repo fields. See §5 below. |
| 15 | **DEFERRED-24 — EmailReplyPanel (awaiting-lead email reply)** | ✅ Done 2026-03-23 | — | Lead edits AI draft and sends to customer via email; case stays `awaiting-lead`. Bug fixed: double-`JSON.stringify` body encoding. UX: collapsible panel matching ChatReplyPanel. See §10 below. |

---

## 1. Validation — Deferred

### VAL-02: Retrieval Quality Checks

**Status:** DEFERRED — needs pilot traffic. No action until production usage data is available.

**Source:** `technical-risks-and-spikes.md` §3.1. `architecture-decisions.md` ADR-006, ADR-007.

---

## 2. Compliance — Deferred

### CG-04-B: DSAR Semantic Search (Embedding-Based)

**Status:** DEFERRED — post-launch optimisation. Implement when high request volume or non-Latin/misspelled DSARs become a support burden.

**Pre-condition:** CG-04 (ILIKE search) in production first.

---

## 3. Billing & Monetisation — ✅ COMPLETE 2026-03-20

> All billing items are complete. Full detail in [`v1-delivery-archive.md §14`](./v1-delivery-archive.md).
>
> Summary: Stripe suite (PC-BIL-02/03/04/05/07) ✅ · OU tracking chain (BIL-01→06) ✅ · PlatformCloud architecture (PC-ARCH-01/02) ✅ · Usage ingestion (PC-BIL-08) ✅ · License format (PC-BIL-09/10/12) ✅ · Console billing UX + OU bar (W6-06) ✅
>
> Remaining low-priority concern: BIL-C08 — document PostgreSQL migration path for PlatformCloud before scaling billing. No code action required now.

---

## 4. Post-v1 Integration Roadmap

> Canonical integration plan for channels, connectors, and API surface. Aligned with PO analysis 2026-03-19.

### 4.1 Strategy

NestFleet embeds into a product team's existing toolchain rather than replacing it. Every integration is either:
- **Inbound signal source** — where users/developers file issues (email ✅, Discord, Jira, Linear). Normalised into the same case pipeline via the channel adapter boundary (ADR-005).
- **Outbound change sync** — NestFleet-authored change requests written back to the product's issue tracker (GitHub ✅; Linear and Jira in v2).
- **Operator notification channel** — alerts to the team (email ✅; Slack later).
- **API surface** — enabling customers to build their own portal UI on top of NestFleet data.

Work management tools (Linear, Jira, Asana) are **bidirectional** signal sources — a bug filed in Linear by a developer carries the same weight as a bug emailed in by a user.

### 4.2 Phased Roadmap

| Phase | Items | Rationale |
|-------|-------|-----------|
| **v1 (done)** | Email, GitHub webhooks + REST | Core loop proven ✅ |
| **v1.5 — fast-follow** | Telegram (DEFERRED-01), multi-inbox email (DEFERRED-02), CR inline edit before approve (DEFERRED-19) | Already committed; Telegram deferred for legal reasons only. |
| **v2.0 — in-product support** | Chat widget ✅ (DEFERRED-05), Contact Forms ✅ (DEFERRED-13), Slack notifications ✅ (DEFERRED-12) | Makes NestFleet competitive for in-product support. |
| **v2.1 — community + API + work mgmt + observability** | Linear bidirectional (DEFERRED-14), Discord inbound (DEFERRED-15), Jira bidirectional (DEFERRED-16), Headless Portal / Public API (DEFERRED-17), **Sentry Observability Bridge (DEFERRED-25)** | Developer-ICP differentiation. Sentry prioritized above Jira — higher ICP fit for beachhead. |
| **Post-v2 / conditional** | MS Teams (DEFERRED-18), Asana, third-party Help Center webhooks | Only if enterprise ICP pivot or specific customer demand. |

### 4.3 Integration Inventory

| ID | Integration | Direction | Type | Phase | ICP Fit | Effort |
|----|-------------|-----------|------|-------|---------|--------|
| — | Email | Bidirectional | Channel adapter | v1 ✅ | High | Done |
| — | GitHub | Bidirectional | Change management | v1 ✅ | High | Done |
| DEFERRED-19 | CR inline edit before approve | ✅ COMPLETE 2026-03-20 | Console UX | v1.5 | **Critical** | Done |
| DEFERRED-01 | Telegram | Inbound signal + reply | Channel adapter | v1.5 | Medium (EU legal risk) | ~12–16h |
| DEFERRED-12 | Slack | ✅ COMPLETE 2026-03-20 | Notification adapter | v2.0 | High | Done |
| DEFERRED-05 | Chat widget | ✅ COMPLETE 2026-03-20 | Channel adapter | v2.0 | High | Done |
| DEFERRED-13 | Contact Forms | ✅ COMPLETE 2026-03-20 | Channel adapter | v2.0 | High | Done |
| DEFERRED-14 | Linear | Bidirectional (signal in + change sync out) | Signal + work mgmt | v2.1 | High | Medium |
| DEFERRED-15 | Discord | Inbound signal | Channel adapter | v2.1 | High (dev tools ICP) | Medium |
| DEFERRED-16 | Jira | Bidirectional | Signal + work mgmt | v2.1 | Medium | Medium |
| DEFERRED-17 | Headless Portal / Public API | Outbound (API) | API maturity | v2.1 | Medium–High | Low (API exists) |
| DEFERRED-18 | MS Teams | Outbound operator alert | Notification adapter | Post-v2 | Low | Medium |
| DEFERRED-20 | Slack inbound signals | Inbound signal ingestion from Slack messages | Channel adapter | v2.0 | High | Medium |
| DEFERRED-25 | Sentry Observability Bridge | Inbound production alert signal | Channel adapter | v2.1 | **High** (beachhead uses Sentry) | Medium (~16h) |
| DEFERRED-21 | Multi-product Console: "Add Product" UI + product switcher | **✅ COMPLETE 2026-03-21** — P0–P7 all shipped: backend, ProductContext, route group, 13 page migrations, sidebar, badge hooks, "Add Product" wizard, accent color (U-06), Cmd+K palette (U-07), MRU+pins (U-08), all unit + E2E tests (T-01..T-13). Post-ship fixes: login redirect to `/p/[slug]/cases`; dropdown clip (`bottom-full`→`top-full`); product-aware `router.push` in Cases/Queue/Approvals/PR Drafts; `ProductProvider` 401→login redirect. Manual UI verification guide in `docs/specs/multi-product-console-architecture.md §21`. | Console UX | v2.0 | **High** | High (~58h) |
| DEFERRED-22 | GitHub issue auto-reply | ✅ COMPLETE 2026-03-21 — `AutoReplyWorker` posts reply as `addIssueComment()` on `cases.github_issue_ref` when `autoSend=true`; `DisclosureChannel` extended with `"github"`; 10 unit tests (NF-UNIT-440..449) | Agent pipeline | v2.0 | High | Done |
| — | Asana | Bidirectional | Work mgmt | Post-v2 | Low | Medium |
| — | Help Center (Plain/Crisp webhook) | Inbound signal | Channel adapter | Post-v2 | Medium | Low |

### 4.4 DEFERRED-25: Sentry Observability Bridge

**Status:** 📋 SPEC REQUIRED — v2.1 backlog
**Source:** SDLC strategy spikes review (2026-03-27), Spike 1 (P0)
**Spec to create:** `docs/specs/observability-bridge-sentry.md`

**Problem:** NestFleet proves the "signal → CR → PR" loop with communication channels (email, chat). Production monitoring is the natural next signal source. When Sentry fires an error-rate or crash alert, the current path is: Sentry → engineer sees email → manually creates GitHub Issue → maybe creates a CR. NestFleet can own that entire path from Sentry webhook onward.

**Why Sentry and not generic OTel/Datadog:**
- Every small B2B SaaS team in the beachhead ICP uses Sentry
- Sentry has well-defined webhook payloads for Issue alerts (level, culprit, stack trace, first seen, event count)
- Generic OTel is an observability pipeline problem, not a case management problem — wrong layer

**Scope:**

| Component | Work |
|-----------|------|
| Webhook endpoint | `POST /webhooks/sentry/:productId` — validates Sentry HMAC signature (`X-Sentry-Hook-Signature`), normalises payload to NestFleet signal schema |
| Channel adapter | `source_type = "sentry_alert"`. Maps: `issue.level` → NestFleet severity (`fatal/error` → `critical`, `warning` → `high`, `info` → `normal`). `issue.title` → case title. Stack trace + culprit → case body. |
| Routing logic | Cases from `source_type=sentry_alert` skip Frontline (customer sentiment triage is irrelevant for production errors) and route directly to Steward with context tagged as `production_incident`. Product Memory query should include recent similar cases. |
| Settings UI | Settings → Integrations → Sentry section: webhook URL (copy), HMAC secret (generate/rotate), optional environment filter (production only). |
| No new pipeline | Case → CR → PR → Approval flow identical to today. No auto-deploy, no rollback, no autonomous production action. |

**Explicit out-of-scope:**
- Betterstack / PagerDuty / Datadog (one integration proves the pattern)
- Any autonomous production action (rollback, auto-deploy)
- Alert volume / de-duplication rules (v2.2 concern)

**Pre-condition for implementation:** Spec reviewed and signed off. Do not implement before spec exists.

**Effort estimate:** ~16h (webhook handler + adapter + settings UI + tests)

---

### 4.4a DEFERRED-26: Approval Risk Summary Card (Approval Friction — Phase 1)

**Status:** 📋 DESIGN — v2.1 backlog
**Source:** SDLC strategy spikes review (2026-03-27), Spike 2 (P1) — Phase 1 of 2

**Problem:** Approval page shows CR details but no AI-generated confidence signal. A Lead must read the full `proposed_scope` and `impact_summary` to decide. For low-risk CRs this is unnecessary overhead.

**Scope (UI only, no new infrastructure):**

| Component | Work |
|-----------|------|
| Risk Summary card on `/approvals/[crId]` | Compact card above the approval actions: AI confidence score (0–100, sourced from triage output), top 3 risk factors (from `impact_summary` structured parse), recommendation (`low risk — safe to approve` / `medium risk — review scope` / `high risk — requires careful review`). |
| Confidence score | Derive from existing `triage_output.confidence` if present; fall back to risk_level mapping (`low→85`, `medium→60`, `high→35`, `critical→15`). |
| No new API | All data is already in the CR and triage output. |

**Explicit out-of-scope (deferred to Phase 2):**
- Slack one-tap approval via interactive messages (requires new Slack app interactivity endpoint, ~2–3 weeks, only justified when ≥1 paying customer validates ≥5 approvals/week friction)

**Pre-condition for Slack phase:** First paying customer explicitly names approval friction as a top-3 pain point.

---

### 4.5 DEFERRED-19: CR Inline Edit Before Approve ✅ COMPLETE 2026-03-20

**Problem:** When the AI produces a fix that is 80% correct, the Lead must either reject-and-wait or approve-and-manually-edit in GitHub. Neither is efficient.

| Component | Status | Implementation |
|-----------|--------|----------------|
| **Console UI** | ✅ | Inline edit panel on `/approvals/[crId]` — "Edit & Approve" toggle button opens collapsible editor. Shows AI original (read-only) + editable monospace textarea. "Approve with edits" submits. |
| **API** | ✅ | `ApproveBodySchema` extended with `editedContent?: string`. Backend updates `proposed_scope` in DB before dispatching PR draft worker. |
| **PR Draft Worker** | ✅ | Worker reads `cr.proposed_scope` from DB (already updated by approve handler before dispatch). No worker code changes needed — the DB update propagates automatically. |
| **Audit trail** | ✅ | `cr.approved` event metadata includes `edited: true/false`, `before_scope`, `after_scope` when Lead made changes. |

**Acceptance criteria:**
- [x] Lead can view AI's proposed change in an editable panel
- [x] Lead can modify and click "Approve with edits"
- [x] Resulting GitHub PR contains Lead's edits (via updated `proposed_scope` in DB)
- [x] Audit log records human edit with before/after diff
- [x] "Approve as-is" and reject flows unchanged

### 4.5 DEFERRED-01: Telegram Channel Adapter (v1.5)

**Problem:** EU/startup customers frequently use Telegram for internal ops. Deferred from v1 for legal reasons, not fit reasons.

| Component | Work |
|-----------|------|
| **Telegram Bot** | Register via BotFather; `TELEGRAM_BOT_TOKEN`. Support webhook mode (prod) and polling (dev). |
| **Channel Adapter** | Implement `ChannelAdapter` interface per ADR-005. Map `Message` → `Signal` with `source_type: "telegram"`. |
| **Inbound router** | `POST /api/v1/webhooks/telegram` — validate `X-Telegram-Bot-Api-Secret-Token`, parse `Update`, route `message` and `callback_query`. |
| **Outbound reply** | `telegram-transport.ts` — `sendTelegram(chatId, text, opts?)` via Bot API `sendMessage`. `reply_to_message_id` for threading. Markdown V2. |
| **Config** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, optional `TELEGRAM_ALLOWED_CHAT_IDS`. |
| **Console UI** | Telegram config wizard in Settings → Notifications: bot username, webhook status, test message button. |
| **Notification delivery** | Extend `notify-agent` to dispatch via `telegram-transport` when case actor has linked Telegram chat ID. |

**EU Legal constraints:**
- Telegram servers not EU-hosted — assess GDPR DPA availability before enabling for EU customers.
- Offer as opt-in per product with explicit DPA acknowledgement in onboarding wizard.
- Do not store Telegram message content beyond what is needed to create a `Signal`.

**Acceptance criteria:**
- [ ] Inbound Telegram message creates Signal and progresses through triage pipeline
- [ ] Agent auto-reply delivered back to originating chat (DM and group)
- [ ] Webhook secret validation rejects unauthenticated requests
- [ ] `TELEGRAM_ALLOWED_CHAT_IDS` allowlist blocks unknown chats when set
- [ ] Console shows bot connection status + test message
- [ ] EU legal notice shown during setup wizard

**Effort:** ~12–16h (3h bot setup + 4h adapter + 2h outbound + 3h console wizard + 2h tests + 2h legal copy)

### 4.6 Architecture Constraints

- All channel adapters must implement the `ChannelAdapter` interface behind ADR-005. No channel-specific logic inside the ingress pipeline.
- All inbound adapters produce a `Signal` with `source_type` set to the adapter name. Signal normalisation is adapter responsibility; downstream agents are source-agnostic.
- All outbound change sync adapters must implement idempotent write (match by `external_ref` before creating).
- Headless Portal API (DEFERRED-17) blocked on SEC-01 fix (product-scoped authorization).
- Linear and Jira adapters share connector infrastructure with GitHub adapter (ADR-008: mirror state, don't outsource).

### 4.7 Open Questions

| ID | Question | Affects |
|----|----------|---------|
| OQ-INT-01 | For Linear + Jira bidirectional sync: when a developer closes an issue externally (not through NestFleet approval), should NestFleet auto-close the linked CR or flag for operator review? | ✅ **Resolved 2026-03-20**: Flag-for-review. Auto-closing bypasses NestFleet's audit trail and change management approval flow. Operator retains decision authority. | DEFERRED-14, DEFERRED-16 |
| OQ-INT-02 | Should Discord support be limited to forum channels (public, structured) or also include DMs to the support bot (private, unstructured)? | Open | DEFERRED-15 |
| OQ-INT-03 | For Headless Portal API: external callers authenticate with same JWT as operators, or separate long-lived API token per product? | ✅ **Resolved 2026-03-20**: Separate per-product long-lived API token (not operator JWT). Individually revocable, narrower scope (read-only), limits blast radius on compromise. | DEFERRED-17 |
| OQ-INT-04 | Contact Forms / Chat widget: JS snippet self-hosted by customer or served from NestFleet CDN? | ✅ **Resolved 2026-03-20**: Instance-served (current implementation). Widget is served from the operator's own NestFleet instance — no third-party CDN trust, works air-gapped, consistent with client-installed deployment model. CORS already handled (`Access-Control-Allow-Origin: *` on widget + webhook endpoints). CDN delivery re-evaluated if/when DEFERRED-09 (SaaS tier) is built. | DEFERRED-13, DEFERRED-05 |

### 4.8 DEFERRED-21 — Multi-Product Console Architecture

**Status:** 🚧 PARTIALLY SHIPPED — P0–P6 complete; P7 (tests), P8 (docs), and UX polish items pending
**Architecture decision:** Option C — Hybrid URL prefix (`/p/[slug]/`) + React Context (`ProductProvider`)
**Full spec:** [`docs/specs/multi-product-console-architecture.md`](./specs/multi-product-console-architecture.md)
**Effort revised:** ~58h total (was 40h — slug DB migration and "Add Product" wizard complexity added)
**Shipped so far:** P0 backend + DB, P1 ProductContext, P2 route group + middleware, P3 13 page migrations, P4 sidebar + switcher, P5 badge hooks, P6 "Add Product" wizard, U-06 accent color, U-07 Cmd+K palette, U-08 MRU + pins (2026-03-21)
**Pending:** *(none — all P0–P7 phases complete)* Mobile viewport/U-09 already shipped; N-04 BroadcastChannel emitter wired. See spec §21 for full detail.

**Problem (for context):** The Console was fundamentally single-product. The active product was hardcoded via `NEXT_PUBLIC_PRODUCT_ID` in `console/.env.local` — a build-time constant baked into every page at module level. Switching products required editing `.env.local` and restarting the dev server (or rebuilding in production). This is not a UI gap — it is an **architectural coupling** that blocks all multi-product features.

#### Solution Summary (see spec for full detail)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture option | **C: URL + Context** | Multi-tab independence, bookmarkable links, no localStorage race condition |
| URL structure | `/p/[slug]/cases`, `/p/[slug]/queue`, etc. | Slug in URL = canonical product truth |
| Product ID source | `useProductId()` from `ProductContext` | Zero env var reads in page code post-migration |
| Default on login | Last-used product (cookie `nf_last_product`) | UX continuity across sessions |
| "Add Product" backend | `POST /api/v1/products` on NestFleet | No synchronous PlatformCloud dependency |
| Multi-tab behaviour | Each tab independent (URL-scoped) | Switching Tab 2 does not affect Tab 1 |
| New DB requirement | `slug VARCHAR(60) UNIQUE NOT NULL` on `products` table | Required for URL-based routing |
| New endpoints needed | `GET /api/v1/products`, `POST /api/v1/products` | Switcher data + product creation |
| Legacy compatibility | `NEXT_PUBLIC_PRODUCT_ID` still works as startup hint | Zero forced migration for existing deployments |

#### Current State Analysis

| Layer | Coupling Point | Count | Risk |
|-------|---------------|-------|------|
| **Environment** | `NEXT_PUBLIC_PRODUCT_ID` in `.env.local` | 1 | Build-time lock — no runtime switching possible |
| **Pages** | Module-level `const PRODUCT_ID = process.env.NEXT_PUBLIC_PRODUCT_ID` | 19 pages | Every page independently reads the env var; no single point of control |
| **Hooks** | `useNotificationBadge` reads env var at hook init | 1 hook | SWR cache keys include product ID — stale cache on switch |
| **API layer** | All `api.ts` functions accept `productId` as first param | ~30 functions | ✅ Already decoupled — ready for multi-product |
| **Components** | Lineage graph, NodeDetailPanel accept `productId` prop | ~5 components | ✅ Prop-driven — ready |
| **Auth** | `AuthUser.productIds: string[]` exists in types but unused | 1 type | Auth model already supports multiple products per user |
| **Layout** | No `ProductContext` or product provider | 0 | ❌ Missing — must be added |
| **Backend API** | All routes scoped as `/api/v1/products/:productId/...` | All routes | ✅ Backend is fully multi-product already |

**Key insight:** The API layer (both Console `api.ts` and backend routes) is already product-parameterised. The coupling is entirely in the Console's page layer and the missing runtime product context.

#### Architecture Options to Evaluate

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **A: URL-based routing** | `/products/:productId/cases`, `/products/:productId/queue` | Bookmarkable, shareable links; browser back/forward works; no state management | Every route changes; existing bookmarks break; Next.js route group refactor |
| **B: React Context + localStorage** | `ProductProvider` in root layout; `useProduct()` hook; persisted in `localStorage` | Minimal route changes; fast switch; simple implementation | Not URL-visible — can't share links to specific product views; stale tab risk |
| **C: Hybrid (URL prefix + Context)** | URL carries product slug (`/p/docugardener/cases`); Context reads from URL; localStorage remembers last selection | Best of both; URLs shareable; context provides reactivity | Most complex; requires route group restructure + context |

#### Spike Success Criteria

1. **Option selected** with documented trade-offs and rationale
2. **Data isolation verified**: switching products must:
   - Clear/invalidate all SWR caches scoped to the previous product
   - Reset notification badge state and unread counts
   - Not leak cases, CRs, signals, or KB data from product A into product B's views
3. **Auth boundary defined**: which products does a user see? Does the license tier gate the number of products? How does `AuthUser.productIds` get populated?
4. **Prototype built**: minimal working product switcher (sidebar dropdown or header selector) + one page (e.g., Cases) reading from new context — verified with two real products (DocuGardener + SkillSeal)
5. **Migration path documented**: how do existing single-product deployments upgrade without breaking?
6. **Performance verified**: product switch should be <200ms perceived (no full page reload)

#### Requirement 1: UX Effectiveness of Product Switching (PO/UX)

The product switcher is the primary navigation axis for multi-product operators. It must be **faster than alt-tabbing between browser tabs** — if it isn't, operators will just open two tabs with hardcoded product IDs and ignore the switcher entirely.

**UX Principles:**

1. **Always-visible product identity.** The active product name + icon/color must be permanently visible in the sidebar or header — never hidden behind a menu. The operator must know which product they're looking at within 0.5s of glancing at any page. Misidentification = wrong triage decision on a live case.
2. **One-click switch, zero confirmation.** Product switching must be a single click (sidebar dropdown or top-bar selector). No confirmation dialogs, no "Are you sure?", no page reload. The operator chose intentionally — don't second-guess them.
3. **Visual context break on switch.** When the product changes, the UI must provide an unambiguous visual signal: product-specific accent color on the sidebar/header border, or a brief transition animation. This prevents the operator from switching and continuing to act on stale mental context from the previous product.
4. **Preserve navigation position across switches.** If the operator is on `/cases` for Product A and switches to Product B, they should land on `/cases` for Product B — not be kicked to the dashboard. Same page, different data. This mirrors how IDE project switching works.
5. **Keyboard shortcut.** Power operators managing 3+ products need `Cmd+K` (or similar) → type product name → Enter. Mouse-only switching is a workflow bottleneck at scale.
6. **Recent/pinned products.** When the product list exceeds 5, show most-recently-used at top. Allow pinning favorites. Don't force operators to scroll through a flat list every time.
7. **Badge aggregation across products.** The switcher dropdown should show per-product unread counts (cases, approvals, PRs) so the operator can spot which product needs attention without switching into each one. This is the "inbox preview" pattern — scan before dive.
8. **Graceful single-product mode.** Community tier (1 product) must not show a switcher at all — no disabled dropdown, no "upgrade to unlock" teaser in the sidebar. The feature simply doesn't exist until the operator has 2+ products. Avoid premature upsell friction in the core navigation.
9. **Mobile/narrow viewport.** On screens < 768px, the product switcher collapses to the product icon only (no name), with a tap-to-expand sheet. Don't sacrifice page content width for the product selector.

**UX Acceptance Criteria (must pass before shipping):**

- [ ] Operator can identify the active product within 0.5s on any page (user test: "Which product are you looking at?")
- [ ] Product switch completes in <200ms perceived (no spinner, no blank state, no layout shift)
- [ ] Navigation position preserved on switch (same route, different product data)
- [ ] Visual context break is noticeable but not disruptive (no jarring full-screen flash)
- [ ] Single-product operators see zero multi-product UI artifacts
- [ ] Unread badge counts visible per product in the switcher dropdown without switching
- [ ] Keyboard-driven switch works end-to-end (shortcut → type → Enter → landed)

#### Requirement 2: Architectural Robustness of the Switching Mechanism

The product switching mechanism is the **foundational infrastructure** for multi-product NestFleet. Every future feature — cross-product analytics, unified inbox, team-scoped product access, SaaS multi-tenancy — depends on this layer being correct, extensible, and impossible to accidentally bypass. A leaky abstraction here compounds into every downstream feature.

**Architectural Principles:**

1. **Single source of truth for active product.** Exactly one mechanism determines the current product ID at runtime. No page should ever read from `process.env`, `localStorage`, URL params, or any other source independently. All roads lead through `useProductId()` (or its server-side equivalent). If a developer can accidentally bypass the context and hardcode a product ID, the abstraction has failed.

2. **Reactive propagation, not imperative refresh.** When the active product changes, all dependent state (SWR caches, badge counts, notification streams, WebSocket subscriptions) must react automatically. The switching mechanism must expose a **product change event** (React context update, or observable) that consumers subscribe to — not a manual "call `invalidateAll()` after switch" pattern. Forgetting to invalidate one cache is a data leak.

3. **Cache isolation by product.** SWR/React Query cache keys must include the product ID as a namespace prefix. On product switch: (a) previous product's cache entries are **retained but inactive** (not destroyed — enables instant back-switch), (b) new product's cache entries are fetched or served from warm cache. This means switching A→B→A should be instant on the second A, not re-fetched.

4. **URL as the canonical product selector (recommended).** The URL should encode the active product (e.g., `/p/:slug/cases`). This satisfies: bookmarkability, link sharing between operators, multi-tab independence (Tab 1 on Product A, Tab 2 on Product B with zero interference), browser back/forward correctness, and SSR/SSG compatibility. A purely client-side context (Option B) fails the multi-tab test — `localStorage` is shared across tabs, creating a "last writer wins" race condition.

5. **Auth-gated product access.** The backend must enforce which products a user can access. The Console must never trust the client-side product list alone. Flow: `GET /api/v1/auth/me` → response includes `productIds: string[]` → Console filters the switcher to only those products. Attempting to navigate to a product not in the user's `productIds` must show a 403 page, not silently fall through.

6. **Graceful degradation for legacy deployments.** Existing single-product deployments using `NEXT_PUBLIC_PRODUCT_ID` must continue working without changes after the upgrade. The migration path: if `NEXT_PUBLIC_PRODUCT_ID` is set and the user has only one product, skip the switcher and use it as the default. When the operator adds a second product, the system transitions to dynamic mode automatically. Zero forced migration steps for existing operators.

7. **Extensibility contract.** The `ProductContext` must expose:
   - `productId: string` — current active product ID
   - `product: Product` — full product object (name, stage, icon, accent color)
   - `products: Product[]` — all accessible products for the switcher
   - `switchProduct(id: string): void` — programmatic switch (for keyboard shortcut, deep links)
   - `onProductChange(callback): unsubscribe` — event subscription for cache invalidation, WebSocket reconnect, analytics tracking

   This contract must be stable enough that adding a feature (e.g., cross-product search) only requires reading from context, not modifying it.

8. **No product ID in component props (except leaf components).** Pages should read `useProductId()` from context and pass to API calls. Components that are product-agnostic (buttons, modals, layout) must never receive `productId` as a prop. Only data-fetching components at the page level should be product-aware. This keeps the component tree clean and prevents prop-drilling that re-couples components to a specific product.

9. **Testability.** The `ProductProvider` must accept an optional `initialProductId` prop for testing. Every E2E test that exercises product-scoped features must be runnable against any product ID without env var changes. Unit tests must be able to wrap components in `<ProductProvider initialProductId="test_prod_123">` without mocking `process.env`.

10. **Observability.** Every product switch must emit a structured event: `{ event: "product.switched", from: productId, to: productId, trigger: "sidebar" | "keyboard" | "url" | "deeplink", timestamp }`. This feeds into analytics (which products get the most operator attention?) and audit (who accessed which product when?).

**Architectural Acceptance Criteria (must pass before shipping):**

- [ ] No file in `console/src/` references `process.env.NEXT_PUBLIC_PRODUCT_ID` (grep returns 0 results post-migration)
- [ ] Two browser tabs can independently show different products without interference
- [ ] Switching Product A → B → A serves Product A data from warm cache (no re-fetch, verified via Network tab)
- [ ] SWR cache for Product A contains zero entries from Product B (verified via React DevTools)
- [ ] Navigating to `/p/nonexistent-slug/cases` shows 403/404, not an empty page or Product A's data
- [ ] `useProductId()` throws a clear error if called outside `ProductProvider` (fail-fast, not silent undefined)
- [ ] Existing deployment with `NEXT_PUBLIC_PRODUCT_ID` set and 1 product works identically to current behaviour (regression test)
- [ ] Product switch event appears in browser console (dev mode) and analytics endpoint (prod mode)
- [ ] Adding a new page requires only `const productId = useProductId()` — no env var reading, no prop drilling from layout
- [ ] Full E2E test suite passes when run against SkillSeal product ID (not just DocuGardener)

#### Scope of Impact

**Files requiring modification (by option B/C):**

| Category | Files | Change |
|----------|-------|--------|
| New: ProductContext | `console/src/lib/product-context.tsx` | `ProductProvider`, `useProduct()`, `useProductId()` |
| Layout | `console/src/app/layout.tsx` | Wrap with `<ProductProvider>` |
| Sidebar | `console/src/components/Sidebar.tsx` | Product switcher dropdown (name, icon, active indicator) |
| All pages (19) | `console/src/app/*/page.tsx` | Replace `process.env.NEXT_PUBLIC_PRODUCT_ID` → `useProductId()` |
| Hooks | `console/src/lib/useNotificationBadge.ts` | Read from context, invalidate on product change |
| Nav badges | `console/src/lib/useNavBadges.ts` | Invalidate SWR on product switch |
| Settings | `console/src/app/settings/page.tsx` | Show active product config; product management section |
| Auth | `console/src/lib/auth.tsx` | Populate `productIds` from backend; guard product access |
| Backend | `src/api/v1/auth.ts` (or equivalent) | Return `productIds` in auth response |
| Chat widget | Widget embed snippet | Product ID already in URL path — no change needed |

#### Tier Gating

| Tier | Max Products | Behaviour |
|------|-------------|-----------|
| Community | 1 | No switcher shown; single-product mode (current behaviour) |
| Starter | 3 | Switcher visible; "Add Product" enabled |
| Growth | 10 | Full multi-product |
| Scale | Unlimited | Full multi-product |

Source: `PlatformCloud/src/license/validator.ts` → `PRODUCT_REGISTRY` already defines `maxProducts` per tier.

#### Open Questions — All Resolved 2026-03-21

| ID | Question | Resolution |
|----|----------|-----------|
| OQ-MP-01 | Should product switching use client-side context only (Option B) or URL-based routing (Option C)? | ✅ **Option C selected.** URL as canonical product selector; context reads from URL. Rationale: multi-tab independence, bookmarkability, no localStorage race condition. |
| OQ-MP-02 | When a user has access to multiple products, what is the default on login — last-used (localStorage) or first in list? | ✅ **Last-used product** (stored in `nf_last_product` cookie). On first login with no prior session, defaults to first product in `GET /api/v1/products` response (ordered by `created_at ASC`). |
| OQ-MP-03 | Should the "Add Product" wizard call the backend to create the product record, or should products be created via PlatformCloud admin API and synced down? | ✅ **NestFleet backend only** (`POST /api/v1/products`). NestFleet validates tier quota via the existing license check. No synchronous PlatformCloud dependency at product creation time. |
| OQ-MP-04 | Multi-tab scenario: if user has Product A open in Tab 1 and switches to Product B in Tab 2, should Tab 1 stay on A or sync to B? | ✅ **Tab 1 stays on Product A.** Each tab holds its own URL state. The `nf_last_product` cookie update is a last-writer-wins hint for the root redirect only — it does not affect already-open tabs. |

#### Effort Estimate (revised post-spike)

| Phase | Task | Hours |
|-------|------|-------|
| P0: DB + Backend | `slug` migration + `GET /api/v1/products` + `POST /api/v1/products` | 11h |
| P1: ProductContext | `product-context.tsx` + all hooks + root redirect | 5h |
| P2: Route Restructure | Next.js `(app)/p/[slug]/` route group + middleware | 5h |
| P3: Page Migration | 13 pages + `compliance` bug fix | 7h |
| P4: Sidebar + Switcher | Dynamic hrefs + `ProductSwitcherDropdown` + `useAllProductsBadges` | 9h |
| P5: Hooks Migration | `useNavBadges` + `useNotificationBadge` | 5h |
| P6: "Add Product" Wizard | Multi-step form + tier gate UI | 7h |
| P7: Tests | Unit + E2E + legacy regression | 8h |
| P8: Docs | `.env.local.example` update + migration notes | 1h |
| **Total** | | **~58h** |

*(Increased from 40h: slug DB migration +8h, "Add Product" wizard scope clarified +7h, offset by spike already complete -8h = net +17h)*

#### Dependencies

- License tier `maxProducts` ✅ already in PlatformCloud `PRODUCT_REGISTRY`
- Backend auth `productIds` ✅ already in JWT claims and `/me` response — no API change needed
- Both DocuGardener and SkillSeal must exist for testing ✅ done
- `slug` column migration must run before any Console deployment that uses new routing

#### Unblocked by this Spike

With architecture resolved, the following are now unblocked:
- ✅ DEFERRED-21 implementation (product switcher + "Add Product" wizard) — can start P0 immediately
- ✅ Cross-product dashboard and analytics aggregation (depends on `ProductProvider` being in place)
- ✅ Multi-product onboarding flow
- ✅ Beta evaluation scenarios XP-01/XP-02 (cross-product identity merge) in production Console

---

## 5. Security Hardening — License / Auth ✅ COMPLETE 2026-03-22

Findings identified in cross-system security audit of PlatformCloud↔NestFleet license communication.

| ID | Severity | System | Finding | Status |
|----|----------|--------|---------|--------|
| SEC-C1 | Critical | NestFleet | `LICENSE_SECRET` had a hardcoded default (`nestfleet-dev-license-secret`) that anyone reading source could use to forge Scale-tier JWTs on misconfigured prod deployments | ✅ Fixed — default removed from `config.ts`; startup guard in `validator.ts` rejects known-bad placeholder when license file is configured |
| SEC-C2 | Critical | NestFleet | `jwt.verify()` did not pin `algorithms`, allowing `alg:none` bypass and RS256/HS256 confusion attacks | ✅ Fixed — `algorithms: ["HS256"]` added to `jwt.verify()` call |
| SEC-H2 | High | PlatformCloud | `/api/v1/license/validate` SQL queried by `license_key + product` only — caller could pass any `org_id` and validate a key belonging to a different organisation | ✅ Fixed — `AND org_id = ?` added to the prepared statement; `req.org_id` passed as third parameter |
| SEC-H3 | High | PlatformCloud | `checkAdminAuth()` used `Array.includes()` to compare Bearer tokens — short-circuits on match, leaking timing information usable for token enumeration | ✅ Fixed — replaced with `crypto.timingSafeEqual()` for all token comparisons |
| SEC-M4 | Medium | NestFleet + PlatformCloud | Cloud refresh response (`/api/v1/license/validate`) trusted as unsigned HTTP JSON — plan/features could be tampered by MITM | ✅ Fixed 2026-03-22 — PlatformCloud signs response with HMAC-SHA256 when `LICENSE_REFRESH_HMAC_SECRET` env var is set; NestFleet verifies with `verifyValidateResponse()` (timingSafeEqual) when `CLOUD_REFRESH_HMAC_SECRET` is set. `src/license/hmac-response.ts` is the shared utility. Backward-compatible: unsigned responses accepted when secret not configured (rolling deployment). |

---

## 6. Compare-Roles UI (SLICE-23) — DEFERRED

**Status:** DEFERRED — test strategy written, implementation not built.

**Scope:** Console-only, within the Permission Studio editor. Diff view: left panel (role A) vs right panel (role B), domain-grouped, with visual indicators for grant/deny deltas.

---

## 7. Definition of Done Rules (Reference)

### 6.1 Spike Done
- Hypothesis confirmed or refuted with evidence. Success criteria evaluated.
- Findings document exists. Prototype code retained (not discarded). Failure implications documented if refuted.

### 6.2 Enabler Done
- Skeleton code compiles and passes basic smoke tests.
- Module boundaries enforced. Migrations run up/down cleanly.
- Consumed by at least one spike output or slice.

### 6.3 Slice Done
- Stated goal met with working end-to-end behavior. All included items implemented and testable.
- Audit events exist for every significant state transition. Validation records for every AI-assisted action.
- Operator console surfaces functional. No known regressions (VAL-06 passes).
- License module validates feature access correctly. Documentation updated.

### 6.4 Compliance Item Done
- Deliverable exists (template, implementation, documentation).
- Implementation is tested, not just documented.
- Reviewed against source requirement in `legal-compliance-eu-germany.md`.
- Blocking dependency satisfied.

### 6.5 v1 Done ✅
- All 9 slices complete ✅. All 6 validation items pass ✅. All 13 compliance items complete ✅.
- Success criteria from `mvp-scope.md` §9 met ✅. Spike exit criteria from `technical-risks-and-spikes.md` §6 met ✅.

---

## 8. Chat Widget UX Redesign — CHAT-UX-01

**Status:** ✅ COMPLETE (2026-03-22) — all items shipped: (a) SSE push ✅, (b) block on resolved ✅, (c) Live Chats tab ✅, skip escalation ✅, real-time badge ✅, widget restart CTA ✅.

**Problem:** Current chat flow is email flow with faster delivery. The case lifecycle (enrich → triage → escalate → reply) adds latency and manual steps that undermine the real-time nature of chat.

**Three use cases to implement:**

| ID | Use Case | Trigger | Expected Flow |
|----|----------|---------|---------------|
| CHAT-UC-01 | AI handles it | User asks factual/how-to question | Frontline agent replies from knowledge base within seconds via SSE → auto-close if confident, escalate to human if not |
| CHAT-UC-02 | Human operator pickup | User reports bug / complex issue | AI acknowledges ("looking into this…") → case appears in **Live Chats** queue tab → operator opens and replies directly, no escalation step |
| CHAT-UC-03 | After-hours / no operator | No operator active | AI attempts KB answer → if unresolved: "We've logged this and will follow up by email" → case stays open, email sent on next operator pickup |

**Changes required:**

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| AI first response via SSE | **Must** | ✅ **DONE 2026-03-22** | `sessionId` threaded through triage → steward → auto_reply payloads; `AutoReplyWorker` calls `publish(sessionId, {...})` after resolving case. Operator chat reply already published SSE (existing). |
| Block messages on resolved/closed cases | **Must** | ✅ **DONE 2026-03-22** | `ChatSessionClosedError` thrown from `appendChatMessage()` when linked case is resolved/closed; webhook returns 409 `{ ok: false, session_closed: true }`. 4 integration tests (NF-INT-220..223). |
| Live Chats tab in Queue | **Should** | ✅ **DONE 2026-03-22** | `channel` param added to `ListCasesQuerySchema` + `findCasesByProduct` (EXISTS subquery on conversations); Queue page has Lead Review / Live Chats tabs; polls 10 s. |
| Skip escalation for chat cases | **Should** | ✅ **DONE 2026-03-22** | `enriching → in-resolution` added to state machine; chat reply handler skips triage dispatch, transitions directly. |
| Operator real-time badge (no email on open) | **Should** | ✅ **DONE 2026-03-22** | `useProductEventStream` revalidates `queue-live-chats` SWR key on `chat_message` event — Live Chats tab refreshes in real time. |
| AI confidence threshold for auto-close | **Could** | 🔲 DEFERRED | If Frontline confidence ≥ threshold and no follow-up in 10 min → auto-close with audit event |

**Decision deferred:** exact confidence threshold, after-hours detection (operating hours config), multi-operator assignment for chat.

---

## §9 — Infrastructure Constraints (INFRA-01 / INFRA-02 / INFRA-03)

> These items emerged from the multi-product parallelism review (2026-03-22).
> INFRA-01 is a **hard blocker** for any new synchronous inbound channel (Telegram, Discord, etc.).

---

### INFRA-01 — Operator real-time stream 🔴 BLOCKER

**Problem:** The existing SSE infrastructure (`src/chat/session-registry.ts`) is keyed by `sessionId` — it serves the *customer widget*, not the operator console. When a new message arrives on any synchronous channel (chat, Telegram, future channels) for Product A, an operator watching the console for Product B has no way to be notified in real time. The console must poll or the operator must manually refresh.

**Required before:** any new synchronous inbound channel ships (Telegram connector, Discord, etc.).

**Design:**

```
src/
  notifications/
    operator-registry.ts   ← new: in-memory map keyed by productId
  api/
    v1/
      products/
        [productId]/
          events.ts         ← new: GET SSE endpoint, subscribes to operator-registry

console/
  src/
    hooks/
      useProductEventStream.ts  ← new: subscribes while product is active in layout
```

**`operator-registry.ts` pattern** (mirrors `session-registry.ts`):

```typescript
// Map<productId, Set<(event: OperatorEvent) => void>>
const listeners = new Map<string, Set<(e: OperatorEvent) => void>>()

export type OperatorEvent =
  | { type: "chat_message";   productId: string; caseId: string; sessionId: string; text: string; ts: string }
  | { type: "notification";   productId: string; kind: string;   subject: string; ts: string }
  | { type: "badge_update";   productId: string; openChats: number; pendingApprovals: number; ts: string }

export function subscribe(productId: string, fn: (e: OperatorEvent) => void): () => void { ... }
export function publish(productId: string, event: OperatorEvent): void { ... }
```

**SSE endpoint** (`GET /api/v1/products/:productId/events`):
- Auth-guarded (Bearer token, same middleware as other product endpoints)
- Returns `text/event-stream`; calls `subscribe(productId, ...)` and streams JSON-encoded events
- On client disconnect: calls returned unsubscribe fn
- Heartbeat every 30 s (`event: ping\ndata: {}\n\n`) to keep connection alive through proxies

**Console hook** (`useProductEventStream`):
- Called in the per-product layout (`console/src/app/(app)/p/[slug]/layout.tsx`)
- Opens `EventSource` to `/api/v1/products/:productId/events`
- Updates badge state via context on `badge_update` event
- Shows toast/notification on `chat_message` and `notification` events

**Callers to add `publish(productId, event)` calls:**
- `AutoReplyWorker` — after SSE push to widget, also push `badge_update` to operator registry
- `ChatIngressHandler` — on new inbound chat message, push `chat_message` to operator registry
- `NotificationService` — optionally forward `notification` kind events to operator registry

---

### INFRA-02 — DB connection pool headroom 🟡

**Problem:** `src/infra/db/client.ts` currently has `max: 10`. With concurrency limits across all queues (triage=10, auto_reply=5, change_prep=3, outage_routing=2 + API request handlers), the pool can be exhausted under full multi-product load. postgres.js hangs waiting for a connection rather than failing fast with a user-visible error.

**Required changes:**

1. **`src/infra/db/client.ts`** — increase `max` to 20–25:
   ```typescript
   const db = postgres(config.DATABASE_URL, {
     max: 25,           // was 10; supports full concurrent worker load + API handlers
     idle_timeout: 20,
     connect_timeout: 10,
     onnotice: () => {},
   })
   ```

2. **Error handling** — postgres.js emits a connection timeout error when the pool is exhausted. Add a global handler in `src/infra/db/client.ts`:
   ```typescript
   // Wrap DB calls that fail with connection-timeout to return 503
   // In API route error boundaries — catch postgres timeout and return:
   return c.json({ ok: false, error: "Service temporarily unavailable. Please try again shortly." }, 503)
   ```

3. **Worker resilience** — workers catch DB errors and mark jobs as failed (pg-boss handles retry). No change needed for workers; the 503 pattern is API-layer only.

**Acceptance criteria:**
- Pool size ≥ 20
- API routes return 503 + user-friendly message on pool exhaustion (not a hang or raw postgres error)
- Log line emitted at `warn` level with `{ event: "db_pool_exhausted" }` for observability

---

### INFRA-03 — Contact form rate limiter cross-product isolation 🟡

**Problem:** `src/api/webhooks/contact-form.ts` uses a `Map<string, RateLimitEntry>` keyed by IP address alone. Two products sharing a CDN or corporate proxy behind the same egress IP will interfere: a burst on Product A can block legitimate traffic to Product B. Additionally, the 429 response body is inconsistent with the chat webhook's 429 format.

**Required changes:**

1. **Re-key the map** from `ip` to `` `${productId}:${ip}` ``:
   ```typescript
   // Before:
   const entry = rateLimitMap.get(ip) ?? { count: 0, resetAt: 0 }
   rateLimitMap.set(ip, entry)
   // After:
   const rlKey = `${productId}:${ip}`
   const entry = rateLimitMap.get(rlKey) ?? { count: 0, resetAt: 0 }
   rateLimitMap.set(rlKey, entry)
   ```

2. **Consistent 429 response** — align with chat webhook:
   ```typescript
   return c.json({ ok: false, error: "Too many requests. Please wait a moment before trying again." }, 429)
   ```

3. **Chat webhook 429** — verify `src/api/webhooks/chat.ts` also returns the same message format (currently returns plain `"Rate limit exceeded"` — update to match).

**Acceptance criteria:**
- Rate limit counters are isolated per `productId:ip`
- Both contact-form and chat webhooks return identical 429 body structure: `{ ok: false, error: "Too many requests. Please wait a moment before trying again." }`
- Existing unit tests for rate limiter updated to use the new key format

---

## 5. DEFERRED-23 — GitHub Outbound Config in Settings UI

**Status:** ✅ COMPLETE 2026-03-23
**Priority:** Medium
**Identified via:** Beta evaluation scenarios review

### Problem

Settings → CI Integration currently covers only the **inbound** half of the GitHub integration:

| Concern | Direction | Config location | In UI? |
|---------|-----------|-----------------|--------|
| GitHub → NestFleet (inbound webhooks) | Inbound | Settings → CI Integration | ✅ Yes |
| NestFleet → GitHub (create PRs, post comments) | Outbound | `.env` `GITHUB_TOKEN` | ❌ No |
| Which repo | Both | `support_policy.github_repo` in DB | ❌ No |

A self-serve operator currently cannot configure outbound GitHub actions from the UI — they must edit the `.env` file on the server and restart. This breaks the self-serve promise for Community users.

### Solution

Add two fields to **Settings → CI Integration**:

| Field | Type | Storage | Notes |
|-------|------|---------|-------|
| **GitHub PAT** | Password input (write-only display) | `support_policy.github_token_enc` — AES-256-GCM, same pattern as webhook secret | Replaces `GITHUB_TOKEN` env var for per-product config. Env var remains as global fallback. |
| **Target repository** | Text input (`owner/repo`) | `support_policy.github_repo` | Already exists in DB — just not exposed in UI. |

### Implementation scope

**Backend:**
- `support_policy` table already has `github_repo` column. Add `github_token_enc` column (migration).
- `PATCH /api/v1/products/:productId/support-policy` — extend to accept `github_token` (plaintext, encrypt before storing) and `github_repo`.
- `github-transport.ts` — resolve token: prefer `support_policy.github_token_enc` (decrypted), fallback to `GITHUB_TOKEN` env var.

**Console:**
- Settings → CI Integration: add "GitHub PAT" masked input + save button (never display value back — show "Configured ✓" badge once set, with "Revoke" link).
- Add "Target repository" text input (`owner/repo` format, validated with regex).
- Show current repo value if already set.

**Validation:**
- PAT: optional field; if provided, validate format (`github_pat_*` or `ghp_*` prefix).
- Repo: `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`.

### Acceptance criteria
- [ ] Operator can enter GitHub PAT in Settings UI — stored encrypted, never returned in GET
- [ ] Operator can set `owner/repo` target repo in Settings UI
- [ ] "Configured ✓" badge shown when PAT is set; "Revoke" clears the encrypted value
- [ ] Outbound GitHub calls (PR creation, issue comment) use per-product PAT when configured, fall back to `GITHUB_TOKEN` env var
- [ ] `github_repo` from Settings takes precedence over legacy `support_policy.github_repo` (same column — no conflict)
- [ ] PAT value never appears in API responses or logs
- [ ] Existing env-var-only setups continue to work unchanged (backward compatible)

**Effort:** ~8–10h (2h migration + 2h transport fallback + 2h API + 3h console UI + 1h tests)

---

## §10 — DEFERRED-24 — EmailReplyPanel (Lead sends edited AI draft)

**Status:** ✅ COMPLETE 2026-03-23
**Priority:** High
**Identified via:** DEFERRED-24 marker in `src/api/v1/cases.ts`

### Problem

When a case reaches `awaiting-lead` status and it originated from an email, the AI generates a `draft_reply` on the case record. The Lead should be able to review the draft, edit it inline, and send it directly to the customer — without leaving the NestFleet console or opening their email client.

### Implementation

| Component | Status | Details |
|-----------|--------|---------|
| **API — `POST /send-draft-reply`** | ✅ | `casesRouter.post(".../send-draft-reply")` in `src/api/v1/cases.ts`. Validates `reply_text` (Zod, 1–10 000 chars). Resolves recipient from `reporter_identity_id` → `identities.email_addresses[0]`; returns 422 if none. Calls `sendEmail()` with AI-disclosure wrapper. Clears `draft_reply` column via `clearDraftReply()`. Emits `case.draft_reply_sent` audit event. Case stays `awaiting-lead` — Lead resolves separately. |
| **Console — `EmailReplyPanel`** | ✅ | Component in `console/src/app/cases/[caseId]/page.tsx`. Shown when `caseRow.status === "awaiting-lead"` and case is an email case (has `draft_reply` or email conversation). Textarea pre-populated with `draft_reply`. Send button disabled when empty. Success state replaces panel with green banner. |
| **Bug fix — double JSON.stringify** | ✅ | `sendDraftReplyApi` in `console/src/lib/api.ts` was calling `body: JSON.stringify({reply_text})`. Since `apiFetch` already serialises the body, this double-encoded it. Server received a JSON string literal, Zod rejected → 400 → frontend showed "Network error". Fixed: `body: { reply_text: replyText }`. |
| **Bug fix — swallowed API errors** | ✅ | `handleSend` catch block now shows `err instanceof ApiError ? err.message : "Network error — please retry"`. Operators now see the real reason (e.g. "Case must be in awaiting-lead status", "No email address found for the case reporter"). |
| **UX — collapsible panel** | ✅ | Matches `ChatReplyPanel` pattern: clickable header row, chevron rotates 180° when expanded, state persisted in `localStorage` under key `nestfleet:email-panel-expanded` (defaults open on first visit). Collapsed view shows italic snippet of draft text + "Send Reply →" CTA that opens and focuses textarea. |

### Acceptance criteria
- [x] Lead can read and edit the AI draft in the panel
- [x] Clicking "Send Reply" emails the customer and shows success state
- [x] Panel is hidden for non-email cases and non-awaiting-lead cases
- [x] Error messages are descriptive (not "Network error" for API rejections)
- [x] Panel is collapsible, state persists across navigation
- [x] E2E tests: G1 group in `nestfleet-gap-coverage.spec.ts` (5 tests covering panel render, textarea edit, send success, send 422 error, absence on non-awaiting-lead cases)

---

## §11 — Capability Manifest Push + License Propagation Protocol (NF-MAN + NF-LPP)

**Status:** ✅ COMPLETE 2026-03-27
**Spec refs:** SAD-04 (LPP), SAD-06 (Capability Manifest)
**Architecture:** `docs/reference/system-architecture.md §5.17`

### NF-MAN-01: Capability Manifest Serializer

**Problem:** PlatformCloud has no machine-readable record of which features NestFleet exposes. Tier gating and feature flag enforcement on the PlatformCloud side requires NestFleet to push a `ProductCapabilityManifest` describing every feature it ships.

| Item | Implementation |
|------|---------------|
| **`buildManifest()`** | `src/license/manifest.ts`. Iterates `FEATURE_CATALOG` (38 features, 8 groups). |
| **Gate type: flag** | Feature has `featureFlag` → `{ gate: "flag", key: featureFlag, label, description, group }` |
| **Gate type: tier** | Feature has no `featureFlag` → `{ gate: "tier", key: feature.id, min_tier: feature.minTier, label, description, group }` |
| **comingSoon exclusion** | `comingSoon: true` features excluded from manifest entirely (not yet available). |
| **Dedup** | `seenKeys: Set<string>` prevents duplicate manifest entries. |
| **Quota dimensions** | `["outcome_units_monthly", "active_products", "lead_slots", "users"]` |
| **SSO taxonomy fix** | `sso_group_mapping.featureFlag` corrected from `"sso_saml"` to `"sso_group_mapping"` in `src/rbac/feature-catalog.ts`. Both SSO features now get independent manifest entries. |

**Tests:** NF-UNIT-460–475 (`tests/unit/license/manifest.test.ts`)

### NF-MAN-02: Manifest Push on Startup

**Problem:** PlatformCloud's capability registry must be kept current. NestFleet pushes the manifest after each successful license validation.

| Item | Implementation |
|------|---------------|
| **`pushCapabilities()`** | `src/license/cloud-connection.ts`. PATCH to `${PLATFORM_CLOUD_URL}/api/v1/admin/products/nestfleet/capabilities`, Bearer `PLATFORM_CLOUD_TOKEN`. |
| **SHA-256 debounce** | `_lastPushedManifestHash` stores the hash of the last pushed manifest. If unchanged, push is skipped. `resetManifestHash()` exported for test reset. |
| **Trigger** | Called from `startBackgroundSync()` after `refreshFromCloud()` resolves. |
| **No-op when unconfigured** | Silent skip if `PLATFORM_CLOUD_TOKEN` is not set. |

**Tests:** NF-UNIT-480–486 (`tests/unit/license/cloud-connection.test.ts`)

### NF-LPP-01: Lease-Based Validation Scheduling

**Problem:** Fixed 6h `setInterval` ignores PlatformCloud's preferred refresh cadence and cannot adapt to server load or emergency revocations.

| Item | Implementation |
|------|---------------|
| **Lease parsing** | `refreshFromCloud()` reads `lease.ttl_seconds` + `lease.jitter_seconds` from 200 response. |
| **`scheduleNextValidation(lease?)`** | `setTimeout` chain: `delay = ttl_seconds * 1000 + Math.random() * jitter_seconds * 1000`. Stores timer ref in `_leaseTimer`. |
| **Fallback** | 6h if no lease returned. |
| **Backward compat** | `startCloudRefreshInterval()` retained as a shim calling `refreshFromCloud()` for existing callers. `CloudConnection.startBackgroundSync()` owns the lifecycle. |

**Tests:** NF-UNIT-490–497 (`tests/unit/license/cloud-sync.test.ts`)

### NF-LPP-02: config_version + 304 Support

**Problem:** Every validation round-trip was a full state re-parse even when nothing changed on the server.

| Item | Implementation |
|------|---------------|
| **Request body** | Sends `{ cached_config_version: _configVersion, product_version: "0.1.0", ... }` |
| **304 handling** | State unchanged; lease timer reset via `scheduleNextValidation(_cachedLease)`. |
| **200 handling** | `_configVersion` updated from `response.config_version`. |

**Tests:** NF-UNIT-498–500 (`tests/unit/license/cloud-sync.test.ts`)

### NF-LPP-03: Cloud Status State Machine + Middleware

**Problem:** NestFleet had no knowledge of cloud-reported license states (grace / read_only / revoked). Write operations could proceed even after license revocation.

| State | Behaviour |
|-------|-----------|
| `active` (or undefined) | Normal operation |
| `grace` | Full operation; amber `LicenseStatusBanner` shown; `requireLicenseActive()` passes with `X-License-Status: grace` header |
| `read_only` | Writes blocked; red `LicenseStatusBanner` shown; `requireLicenseActive()` returns 403 `license_read_only` |
| `revoked` | All operations blocked; red `LicenseStatusBanner` with no-entry icon; `requireLicenseActive()` returns 403 `license_revoked` |

New exports from `src/license/validator.ts`: `getLicenseCloudStatus()`, `getLicenseGraceUntil()`, `getLicenseReadOnlyUntil()`, `getLicenseRevokeReason()`, `getLicenseSupportContact()`.

New middleware: `src/auth/license-middleware.ts` → `requireLicenseActive()`.

**Tests:** NF-UNIT-510–515 (`tests/unit/auth/license-middleware.test.ts`)

### NF-LPP-04: Pending Changes (Delta Display)

**Problem:** DocuGardener had a bug where it rendered the full `features[]` array in the pending-changes notice, showing the complete feature set instead of only the discrete scheduled changes.

| Item | Implementation |
|------|---------------|
| **Source** | `pending_changes[]` — each item is one discrete scheduled change (type, field, from→to, message, effective_at). Never rendered from `features[]`. |
| **Component** | `console/src/components/PendingChangesNotice.tsx`. Renders type badge + `effective_at` (relative time) + optional message per item. |
| **Placement** | Settings → License section (admin users only). |

### NF-LPP-05: SSO Feature Taxonomy

Fixed root cause of potential deduplication collision: `sso_saml` and `sso_group_mapping` are distinct product features belonging to different catalog groups. Both now appear as separate manifest entries with independent `featureFlag` keys.

### NF-LPP-06: Offline Fallback + Autonomous Degradation

**Problem:** No offline-mode handling. A license server outage would leave NestFleet operating on an unknown state indefinitely.

| Timeline | Behaviour |
|----------|-----------|
| Cloud fetch fails (< 24h since last validation) | `offlineWarning = true`; yellow banner; cached `cloudStatus` preserved; full operation continues |
| Cloud unreachable ≥ 24h (`_lastSuccessfulValidationAt` check) | `cloudStatus` autonomously set to `"read_only"` per C-05; write operations blocked |
| Next successful validation | `offlineWarning` cleared; `cloudStatus` restored from fresh response |

New exports: `getLastSuccessfulValidationAt()`, `isOfflineWarning()`.

**Tests:** NF-UNIT-501–506 (`tests/unit/license/cloud-sync.test.ts`)

---

## ⏳ Phase: Security Hardening — NestFleet cross-product items (PlatformCloud Phase 9)

> **Source:** PlatformCloud SA Security Assessment 2026-03-29 (Phase 9)
> **Context:** PlatformCloud Phase 9 is ✅ COMPLETE 2026-03-29. The items below are NestFleet-side follow-ups, all blocked on dev-only secret rotation being coordinated.
> **Tracked in PlatformCloud:** `active-backlog.md` (Phase 9 row)

| ID | Task | Depends on | Priority | Effort | Status |
|---|---|---|---|---|---|
| NF-SEC-01 | Rotate `LICENSE_SECRET` to match PlatformCloud's new `LICENSE_JWT_SECRET` | PC-SEC-21 (manual) | P0 (BLOCKER) | ~15min | ✅ 2026-03-29 — uncommented in `.env` |
| NF-SEC-02 | Adopt standard JWT claims (`exp`/`iat`/`jti`) in license validator | PC-SEC-22 ✅ | P1 | ~2h | ✅ 2026-03-29 — Phase A: `isRawPayload()` validates standard claims; Phase B: `payload.expiresAt = exp ?? expiresAt`, `payload.issuedAt = iat ?? issuedAt`; Phase C: `ignoreExpiration` removed, `TokenExpiredError` → graceful `valid=true/expired=true`; 13 tests NF-UNIT-SEC-01..13 |
| NF-SEC-03 | Verify HMAC canonical JSON matches PlatformCloud's updated form | PC-SEC-39 (deferred) | P1 | ~30min | DEFERRED — both sides use identical `JSON.stringify(rest, sortedKeys)` |
| NF-SEC-04 | Remove `DEV_SECRET_PLACEHOLDER` from `validator.ts:62` after rotation | NF-SEC-01 | P2 | ~5min | ✅ 2026-03-29 — constant and guard removed from `validator.ts` |

### NF-SEC-01 — Rotate LICENSE_SECRET (Coordinated with PlatformCloud)

**Context:** PlatformCloud is rotating `LICENSE_JWT_SECRET` from the guessable `nestfleet-dev-license-secret` to a cryptographically random 32-byte hex value. NestFleet's `LICENSE_SECRET` env var must match exactly — it's the same HMAC-SHA256 signing key used by both sides.

**Current:** `src/shared/config.ts` reads `LICENSE_SECRET` from env. `src/license/validator.ts:154` uses it in `jwt.verify(token, secret, ...)`.

**Fix:**
1. When PlatformCloud rotates `LICENSE_JWT_SECRET`, copy the new value to NestFleet's `LICENSE_SECRET` env var.
2. Re-generate all offline `.license` files for deployed NestFleet instances (they are signed with the old key).
3. If zero-downtime is required: PlatformCloud can temporarily accept both old and new keys (PC-SEC-11 token rotation pattern already exists). Coordinate timing.

**Acceptance criteria:**
- [ ] NestFleet `LICENSE_SECRET` matches PlatformCloud `LICENSE_JWT_SECRET` exactly
- [ ] `validateLicense()` succeeds with a JWT signed by the new key
- [ ] All deployed `.license` files re-generated and distributed to customer instances
- [ ] `DEV_SECRET_PLACEHOLDER` guard in `validator.ts:62` still rejects the old value if accidentally left

---

### NF-SEC-02 — Adopt Standard JWT Claims ✅ COMPLETE 2026-03-29

All three phases complete. See `tests/unit/license/validator-jwt-claims.test.ts` (Phase A, NF-UNIT-SEC-01..07) and `tests/unit/license/validator-expiry-phase-bc.test.ts` (Phase B/C, NF-UNIT-SEC-08..13).

- **Phase A** — `isRawPayload()` validates `exp`/`iat`/`nbf`/`jti` type when present; absent = legacy JWT, still accepted.
- **Phase B** — `payload.expiresAt = decoded.exp ?? decoded.expiresAt`; `payload.issuedAt = decoded.iat ?? decoded.issuedAt`.
- **Phase C** — `ignoreExpiration: true` removed. `TokenExpiredError` → graceful (`valid=true, expired=true`); bad signature still → `valid=false`.

---

### NF-SEC-03 — Verify HMAC Canonical JSON Compatibility

**Context:** PlatformCloud (PC-SEC-39) is fixing the HMAC canonical JSON from `JSON.stringify(payload, sortedKeys)` (non-deterministic) to an explicit sorted-object pattern. NestFleet's `verifyValidateResponse()` in `src/license/hmac-response.ts` must use the same canonical form.

**Current:** Check `src/license/hmac-response.ts` — verify it constructs the canonical string identically to PlatformCloud's updated `hmacCanonical()`.

**Fix:** If NestFleet's HMAC verification builds the canonical string differently, align it:
```typescript
function hmacCanonical(payload: Record<string, unknown>): string {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(payload).sort()) {
        sorted[key] = payload[key]
    }
    return JSON.stringify(sorted)
}
```

**Acceptance criteria:**
- [ ] NestFleet's canonical JSON matches PlatformCloud's exactly
- [ ] HMAC verification passes with PlatformCloud's new signing
- [ ] Integration test: sign on PlatformCloud side, verify on NestFleet side

---

### NF-SEC-04 — Remove DEV_SECRET_PLACEHOLDER Guard (Post-Rotation)

**Context:** `src/license/validator.ts:62` contains `const DEV_SECRET_PLACEHOLDER = "nestfleet-dev-license-secret"` which rejects the known-bad development secret. After PlatformCloud rotates to a strong secret (PC-SEC-21), this guard is no longer needed.

**Fix:** After rotation is confirmed and all instances updated:
1. Remove the `DEV_SECRET_PLACEHOLDER` constant
2. Remove the guard block at `validator.ts:70-86`
3. The minimum-length check (if added in NF-SEC-02 or via startup validation) supersedes this

**Acceptance criteria:**
- [ ] `DEV_SECRET_PLACEHOLDER` constant removed
- [ ] Guard block removed
- [ ] No regression in `validateLicense()` — strong secrets still accepted
- [ ] Tests updated to remove DEV_SECRET_PLACEHOLDER test case

---

### Execution Order (NestFleet Security) — ✅ ALL COMPLETE 2026-03-29

| Item | Status |
|---|---|
| NF-SEC-01 — Rotate `LICENSE_SECRET` | ✅ |
| NF-SEC-02 Phase A — Validate standard claims | ✅ |
| NF-SEC-02 Phase B — Use `exp`/`iat` as primary | ✅ |
| NF-SEC-02 Phase C — Remove `ignoreExpiration` | ✅ |
| NF-SEC-03 — HMAC canonical JSON | DEFERRED (both sides identical) |
| NF-SEC-04 — Remove `DEV_SECRET_PLACEHOLDER` | ✅ |

---

## §12 — Cross-Product License Enforcement Hardening (PLAT-01)

> **Full spec:** `PlatformCloud/docs/specs/PLAT-01-License-Enforcement-Hardening.md`
> **Context:** SA review (2026-03-29) identified that self-hosted deployments with source code access can bypass local license gating in ~30–60 min. A cross-product hardening initiative was designed to close this gap systematically. NF-SEC-01–04 (§11) must complete first — they are Wave 0 prerequisites.

### NestFleet gap vs DocuGardener (current state)

| Gap | DG status | NF status |
|---|---|---|
| Plan-lock correction loop | ✅ `_license_revalidation_loop` writes plan to DB every lease cycle | ✅ `PlanLockLoop` calls `writePlan` after each revalidation — DB writer pending (NF-PLAT-01-DB) |
| Lease-based TTL (LPP-01) | ✅ Respects server `lease.ttl_seconds` | ✅ `getSecondsUntilNextCheck()` uses lease TTL from `_cachedLease`; fallback 6h |
| 304 optimisation (LPP-02) | ✅ `config_version` tracked | ❌ Not implemented (SDK doesn't expose this yet) |
| Code-modification bypass | Moderate risk (DG-LPP-07 closes DB tamper) | Improved — plan-lock loop wired; DB writer needed to fully close |

### NestFleet PLAT-01 work items

| ID | Item | Wave | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| ~~**NF-PLAT-01**~~ | Adopt TypeScript `platformcloud-client` SDK — replaces `src/license/cloud-connection.ts`; gains lease-based TTL + plan-lock loop. Uses `PlanLockLoop` + `HeartbeatSender` composition; `_nfLicenseAdapter` bridges `refreshFromCloud()` to SDK interface. `getSecondsUntilNextCheck()` added to `validator.ts`. | W3 | P1 | ~0.5d | PLAT-SDK-02 complete; NF-SEC-01–04 complete | ✅ **2026-03-29** |
| ~~**NF-PLAT-02**~~ | NF-PLAT-02 plan-lock loop tests (NF-UNIT-510..514) in `tests/unit/license/plan-lock-loop.test.ts` — 5 tests: creation, `writePlan` fires after tick, no-arg safe, `getSecondsUntilNextCheck` fallback + floor. 1093 NF tests passing. | W3 | P1 | ~2h | NF-PLAT-01 | ✅ **2026-03-29** |
| **NF-PLAT-01-DB** | DB persistence: `writePlan` callback is wired but needs a real DB writer (write plan+status to `Tenant`/`License` table). The callback type is correct; production handler not yet implemented. | W3 | P1 | ~2h | NF-PLAT-01 | ⏳ |
| **NF-PLAT-03** | Gate SCALE-only features behind capability tokens: `sso_saml`, `custom_compliance_bundles`, `internal_api_channel` via `requireFeature()` backed by token request | W4 | P2 | ~0.5d | PLAT-PC-01 deployed; NF-PLAT-01 | ⏳ |
| **NF-PLAT-04** | JavaScript obfuscation of `platformcloud-client` bundle in NF Docker image (terser + mangle + identifier hashing) | W5 | P2 | ~0.5d | NF-PLAT-01 | ⏳ |
| **NF-PLAT-05** | Startup integrity check: hash installed SDK vs expected hashes from PC | W5 | P3 | ~2h | PLAT-SDK-02 | ⏳ |

### Execution order

```
Phase 0 (prerequisite — already tracked in §11):
  NF-SEC-01–04                                 ~3h total

Phase 1 — ✅ COMPLETE 2026-03-29:
  NF-PLAT-01  SDK adoption (PlanLockLoop+HeartbeatSender) ~0.5d  ✅
  NF-PLAT-02  Plan-lock unit tests (NF-UNIT-510..514)     ~2h    ✅

Phase 1 remaining:
  NF-PLAT-01-DB  Write plan to DB in writePlan callback   ~2h

Phase 2 (after PLAT-PC-01 deployed):
  NF-PLAT-03  Capability token feature gates    ~0.5d

Phase 3 (hardening):
  NF-PLAT-04  Obfuscation                       ~0.5d
  NF-PLAT-05  Integrity check                   ~2h
```

**Total NestFleet PLAT-01 effort:** ~1.5–2d (after prerequisites) — Wave 3 SDK migration complete; DB persistence and capability gates remaining.

> ⛔ **PLAT-01 work items NF-PLAT-01-DB, NF-PLAT-03, NF-PLAT-04, NF-PLAT-05 are CANCELLED** — PlatformCloud is frozen as of 2026-03-30. The NF-PIVOT decoupling phase below replaces this work entirely.

---

## §12 — Phase: AGPL SaaS-First Pivot (NF-PIVOT)

> **Trigger:** Strategic decision 2026-03-30. PlatformCloud is frozen. NestFleet pivots to AGPL open-source + SaaS-first. The license-key/LPP model is replaced by direct Stripe billing. Ops complexity of self-hosting at scale is the natural upgrade funnel — no feature paywall required.
>
> **Archived specs:** `docs/specs/nestfleet-docugardener-integration.md`, `docs/business/monetization-and-licensing-model.md`, `docs/business/product-suite-strategy.md`, `docs/legal/templates/*/CG-12-bsl-*`, `docs/legal/templates/en/CG-13-cloud-connection-data-flow.md` (all moved to `docs/archive/`).
>
> **Effort:** ~2–3 days of focused work.
> **Launch sequence:** DG ships first (SaaS already functional in `saas` mode). NF follows ~2–3 weeks after DG is live.

| ID | Item | Priority | Effort | Status |
|---|---|---|---|---|
| **NF-PIVOT-01** | Remove hard exit on license failure (`process.exit(1)`) | P0 | XS | ✅ |
| **NF-PIVOT-02** | Make CloudConnection optional — no license key = free tier | P0 | S | ✅ |
| **NF-PIVOT-03** | Hardcode free tier limits locally (no PC) | P0 | S | ✅ |
| **NF-PIVOT-04** | Wire Stripe directly (checkout, portal, webhook) | P0 | M | ✅ |
| **NF-PIVOT-05** | AGPL license + GitHub publish | P0 | M | ✅ |
| **NF-PIVOT-06** | docker-compose.prod.yml (no PC dependency) | P0 | S | ✅ |
| **NF-PIVOT-07** | Update legal templates BSL → AGPL | P1 | S | ✅ |
| **NF-PIVOT-08** | Landing page + SaaS signup flow | P1 | L | ✅ |
| **NF-PIVOT-09** | Production readiness checklist | P1 | S | ✅ |
| **NF-PIVOT-10** | Remove PC coupling (full cleanup) | P2 | M | ✅ |
| **NF-PIVOT-11** | User & Developer Guide | P2 | XL | 🔲 |

---

### NF-PIVOT-01 — Remove Hard Exit on License Failure

**Priority:** P0 | **Effort:** XS

**File:** `src/index.ts` (and potentially `src/license/validator.ts`)

**Current behaviour:** On startup, if license validation fails (invalid JWT, expired, unreachable PC), NestFleet calls `process.exit(1)`. This is a hard blocker for AGPL self-hosters who have no license key.

**Required change:**
```typescript
// BEFORE (src/index.ts — exact location TBD by grepping):
if (!licenseValid) {
  logger.error("License validation failed. Exiting.")
  process.exit(1)
}

// AFTER:
if (!licenseValid) {
  logger.warn("No valid license. Running in free tier (community limits apply).")
  // continue startup with free tier limits
}
```

**Acceptance criteria:**
- [ ] NestFleet starts and serves traffic with no `LICENSE_FILE_PATH` set
- [ ] NestFleet starts with an expired license without exiting
- [ ] Log line clearly states "community limits apply" when no valid license
- [ ] Existing tests updated (any test that expected `process.exit(1)` on invalid license must be updated)

---

### NF-PIVOT-02 — Make CloudConnection Optional

**Priority:** P0 | **Effort:** S

**Files:** `src/license/cloud-connection.ts`, `src/index.ts`, startup bootstrap code

**Current behaviour:** `CloudConnection.startBackgroundSync()` is always called at startup. It calls PlatformCloud for license validation. Without `PLATFORM_CLOUD_URL` + `PLATFORM_CLOUD_TOKEN`, this throws on every cycle.

**Required change:**
- Gate all `CloudConnection` calls on `!!process.env.NESTFLEET_LICENSE_KEY` (or the equivalent config field)
- When no license key configured: skip `startBackgroundSync()` entirely
- When license key configured but PC unreachable: log warning, apply free tier (don't crash)
- `requireLicenseActive()` middleware must pass through when `cloudStatus` is `undefined` (no PC configured)
- `LicenseStatusBanner` in console must only show when cloud status is non-null

**Acceptance criteria:**
- [ ] `PLATFORM_CLOUD_URL` and `PLATFORM_CLOUD_TOKEN` not required for startup
- [ ] No error logs about PC connectivity when PC is not configured
- [ ] `requireLicenseActive()` middleware allows all requests when PC not configured
- [ ] Cloud connection banner hidden in console when PC not configured

---

### NF-PIVOT-03 — Hardcode Free Tier Limits Locally

**Priority:** P0 | **Effort:** S

**Files:** `src/license/validator.ts`, `src/rbac/feature-catalog.ts`, OU quota enforcement

**Current behaviour:** Free tier limits (`maxOutcomeUnitsMonthly`, `maxProducts`, feature gates) come from PlatformCloud validate response. Without PC, these are `undefined` or `0`.

**Required change — define `COMMUNITY_LIMITS` in `src/license/validator.ts`:**

```typescript
export const COMMUNITY_LIMITS = {
  maxOutcomeUnitsMonthly: 100,   // 100 cases resolved/month
  maxProducts: 1,                 // 1 product (team grows → upgrades)
  leadSlots: 3,                   // 3 operators
  features: [
    "email_ingress", "github_webhooks", "chat_widget",
    "contact_forms", "slack_notifications", "knowledge_memory",
    "change_requests", "pr_drafts", "audit_log"
  ]
  // Excluded from community: sso_saml, sso_group_mapping, custom_compliance_bundles,
  // multi_product (> 1), internal_api_channel, advanced_analytics
}
```

**Logic:** When PC not configured OR license invalid → fall back to `COMMUNITY_LIMITS`. When PC configured and validates → use PC-provided limits (existing behavior).

**Acceptance criteria:**
- [ ] Self-hosted NestFleet without a license key enforces `COMMUNITY_LIMITS`
- [ ] OU quota bar in Settings shows correct free tier limit
- [ ] Feature gates return correct results for community features without PC
- [ ] `QUOTA_OVERRIDE=unlimited` env var bypasses limits for dev/testing

---

### NF-PIVOT-04 — Wire Stripe Directly

**Priority:** P0 | **Effort:** M | **Decision:** Option B (direct Stripe, not stub)

Replace all PlatformCloud billing proxies with direct Stripe calls from NestFleet.

**Files to create/modify:**
- `src/billing/stripe.ts` — Stripe client singleton + helper functions
- `src/billing/plans.ts` — plan definitions + price IDs
- `src/api/v1/billing.ts` — new API routes
- `console/src/app/settings/billing/page.tsx` — billing settings UI
- `src/billing/webhook.ts` — Stripe webhook handler

**Stripe integration plan:**

| Endpoint | Function | Notes |
|----------|----------|-------|
| `POST /api/v1/billing/checkout` | Create Stripe Checkout session | Plans: STARTER → GROWTH. Operator auth required. |
| `POST /api/v1/billing/portal` | Create Stripe Customer Portal session | Returns redirect URL. |
| `POST /api/v1/billing/downgrade` | Schedule downgrade at period end | `cancel_at_period_end` on Stripe subscription |
| `POST /webhooks/stripe` | Stripe webhook handler | `customer.subscription.updated` → update plan in DB; `customer.subscription.deleted` → downgrade to community |

**Plan structure (NestFleet-specific, no PC dependency):**

| Plan | Monthly | Annual | OU limit | Products | Users |
|------|---------|--------|----------|----------|-------|
| COMMUNITY | Free | Free | 100 | 1 | 3 |
| STARTER | $49/mo | $490/yr | 1,000 | 3 | 10 |
| GROWTH | $149/mo | $1,490/yr | Unlimited | 10 | Unlimited |
| SCALE | Contact sales | — | Unlimited | Unlimited | Unlimited |

**Env vars required:**
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUALLY`
- `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUALLY`

**Remove:** All `PLATFORM_CLOUD_URL`, `PLATFORM_CLOUD_TOKEN`, `NESTFLEET_LICENSE_KEY` env vars from billing paths.

**Acceptance criteria:**
- [ ] Operator can click "Upgrade to Starter" in Settings → Billing and reach Stripe Checkout
- [ ] Stripe webhook updates plan in DB on `customer.subscription.updated`
- [ ] `cancel_at_period_end` shown in Settings UI with "Reactivate" CTA
- [ ] Community plan operators see billing UI with upgrade CTAs (no broken state)

---

### NF-PIVOT-05 — AGPL License + GitHub Publish

**Priority:** P0 | **Effort:** M

**Blocked by:** ORGA-01 (domain + GitHub org registration), NF-PIVOT-01/02 (must run clean without PC)

**Tasks:**
- [ ] Create `LICENSE` file (AGPL-3.0 full text)
- [ ] Add AGPL header template to key source files
- [ ] Audit codebase for hardcoded secrets or PlatformCloud-specific references that shouldn't be public
- [ ] Remove `docs/legal/templates/*/CG-12-bsl-*` from repo history (already moved to archive; confirm not in git)
- [ ] Write `README.md`: what NestFleet is, quick-start (Docker + 1 GitHub App), contributing guide
- [ ] Write `CONTRIBUTING.md`
- [ ] Create public GitHub repo under chosen org
- [ ] Tag v1.0.0 once NF-PIVOT-01..04 are complete

**Acceptance criteria:**
- [ ] Public repo is live
- [ ] `docker compose up` produces a working NestFleet instance in < 10 minutes
- [ ] No PlatformCloud or BSL references in the public codebase
- [ ] README clearly explains AGPL terms and managed SaaS offering

---

### NF-PIVOT-06 — docker-compose.prod.yml

**Priority:** P0 | **Effort:** S

**Current state:** NestFleet has a dev `docker-compose.yml` but no production-ready compose. The existing compose requires `PLATFORM_CLOUD_URL` and license setup.

**Required:**
- `docker-compose.prod.yml` with:
  - NestFleet API (production build)
  - Console (Next.js static export or SSR)
  - PostgreSQL with volume mounts + init script
  - pg-boss worker process
  - Redis (if needed)
  - Caddy (TLS reverse proxy)
  - Health check endpoints
- Environment variable documentation in `docker-compose.prod.yml` comments
- No PlatformCloud containers or dependencies
- Stripe env vars only (no `PLATFORM_CLOUD_*`)

**Acceptance criteria:**
- [ ] `docker compose -f docker-compose.prod.yml up` starts all services
- [ ] HTTPS served via Caddy with auto Let's Encrypt
- [ ] Database migrations run automatically on startup
- [ ] Health check passes at `/health`

---

### NF-PIVOT-07 — Update Legal Templates BSL → AGPL

**Priority:** P1 | **Effort:** S

The archived `CG-12-bsl-license-terms.md` templates are now obsolete. New AGPL equivalents are needed.

**Tasks:**
- [ ] Create `docs/legal/templates/en/CG-12-agpl-license-notice.md` — AGPL-3.0 attribution notice template for operators embedding NestFleet
- [ ] Create `docs/legal/templates/de/CG-12-agpl-lizenzbedingungen.md` — German AGPL notice
- [ ] Update `docs/legal/legal-compliance-eu-germany.md` to reference AGPL instead of BSL
- [ ] Remove BSL references from `docs/legal/templates/en/CG-09-dpia-template.md` and `CG-11-acceptable-use-policy.md` if present
- [ ] Note: `CG-13-cloud-connection-data-flow.md` is archived — if data flow documentation is needed, create a new `CG-13-stripe-data-flow.md` reflecting direct Stripe billing

---

### NF-PIVOT-08 — Landing Page + SaaS Signup Flow

**Priority:** P1 | **Effort:** L | **Status:** ✅ COMPLETE (2026-04-01)

**Delivered:**
- [x] Hero CTA changed from "Open console →" to "Get started free →" pointing to `/signup`
- [x] Bottom CTA section updated to match
- [x] Footer: "BSL licensed" → "AGPL-3.0 open source"
- [x] `PricingSection.tsx`: BSL → AGPL copy, all CTAs point to `/signup` (plan-aware)
- [x] `console/src/app/signup/page.tsx` — full registration form (name, email, password, confirm)
- [x] `POST /api/v1/auth/register` — gated by `REGISTRATION_ENABLED` config flag (default: false)
- [x] `registerApi()` in `console/src/lib/api.ts`
- [x] Error handling: 404 = registration disabled, 409 = email taken
- [x] On success: auto-login + redirect to `/setup`

**Future enhancements (in NF-PIVOT-11 / UX backlog):**
- [ ] Magic-link / email verification flow
- [ ] Onboarding wizard improvements post-signup
- [ ] `(i)` icon tooltips linking to User Guide sections

---

### NF-PIVOT-09 — Production Readiness Checklist

**Priority:** P1 | **Effort:** S | **Status:** ✅ COMPLETE (code deliverables, 2026-04-01)

Code-deliverable items done:
- [x] Privacy Policy template — `docs/legal/templates/en/privacy-policy.md` (GDPR-compliant, EU/Hetzner)
- [x] Terms of Service template — `docs/legal/templates/en/terms-of-service.md` (AGPL-aware, Berlin governing law TBC)
- [x] `/.well-known/security.txt` endpoint (RFC 9116) — in `src/api/index.ts`
- [x] `REGISTRATION_ENABLED` config flag — `src/shared/config.ts`
- [x] `SENTRY_DSN` config var — `src/shared/config.ts` (wire up SDK when ready)
- [x] `scripts/backup.sh` — pg_dump with rotation, cron-ready

Operational items (deploy-time, not code):
- [ ] Review and publish Privacy Policy + ToS (requires legal counsel sign-off)
- [ ] DPA template available at `legal@nestfleet.dev`
- [ ] Support email configured (`hello@nestfleet.dev`)
- [ ] Stripe tax configuration reviewed in Stripe Dashboard
- [ ] Status page live (BetterStack / Instatus)
- [ ] Wire Sentry SDK: install `@sentry/node`, initialise with `config.SENTRY_DSN` in `src/index.ts`
- [ ] Cron job for `scripts/backup.sh` on production host
- [ ] Fill in TBC fields in legal templates (legal entity name, Berlin court confirmation)

---

### NF-PIVOT-10 — Remove PC Coupling (Full Cleanup)

**Priority:** P2 | **Effort:** M | **Blocked by:** NF-PIVOT-04 ✅ (Stripe live)

After NestFleet is live on direct Stripe, do a final cleanup pass to remove all PC coupling from the codebase.

**Files to audit (from coupling analysis — 24 files):**
- `src/license/cloud-connection.ts` — remove or reduce to optional/stub
- `src/license/manifest.ts` — capability manifest push (only useful if PC is running; remove or no-op)
- `src/index.ts` — remove `startBackgroundSync()` call when PC not configured (NF-PIVOT-02 may already handle this)
- All `PLATFORM_CLOUD_*` env var references
- All `LICENSE_FILE_PATH` references (if license files are no longer used)
- Remove `src/license/hmac-response.ts` (only used for PC HMAC verification)
- Remove PC-specific test files or update mocks

**Acceptance criteria:**
- [ ] `grep -r "PLATFORM_CLOUD" src/` returns 0 results
- [ ] `grep -r "LICENSE_FILE_PATH" src/` returns 0 results (or is truly optional)
- [ ] All PC-related tests removed or replaced with Stripe billing tests
- [ ] No `platformcloud-client` package in `package.json`

---

### NF-PIVOT-11 — User & Developer Guide

**Priority:** P2 | **Effort:** XL | **Status:** 🔲 NOT STARTED

A comprehensive documentation site (or structured Markdown set) covering both end-user workflows and self-hosting/developer operations. To be linked from the app via `(i)` icon tooltips at key UI steps.

**Scope:**

#### User Guide (end-user / workspace admin)
- [ ] Getting started: signup → setup wizard → connect GitHub App
- [ ] Cases: what they are, triage states, badge meanings (severity, confidence, effort)
- [ ] Agent actions: what auto-reply does, when it triggers, how to approve/reject
- [ ] Change management: PR linking, change request lifecycle
- [ ] Routing rules: how cases are routed to queues/agents
- [ ] Knowledge base: creating articles, linking to cases
- [ ] Settings: workspace config, LLM provider setup, notification channels
- [ ] Billing: plans, trial, upgrade, cancellation

#### Developer / Self-Hosting Guide
- [ ] Prerequisites (Docker, PostgreSQL, GitHub App)
- [ ] `docker-compose.prod.yml` quickstart
- [ ] Environment variable reference (all `src/shared/config.ts` vars)
- [ ] GitHub App setup: permissions, webhook events, secret
- [ ] LLM provider configuration (OpenAI, Anthropic, Google)
- [ ] Database migrations: how to run, rollback
- [ ] Backup & restore (`scripts/backup.sh`)
- [ ] Upgrade procedure (versioned releases)
- [ ] Security hardening checklist
- [ ] Observability: logging, `SENTRY_DSN`, metrics

#### In-app `(i)` tooltip links (future UX task)
- [ ] Audit key UI steps that would benefit from contextual doc links
- [ ] Add `(i)` icon component with `href` prop pointing to guide sections
- [ ] Priority locations: setup wizard steps, badge explanations, LLM config, billing section

**Notes:**
- Publish as MDX in `docs/guide/` or as a Docusaurus/Nextra site
- Link from `README.md` and from the app's Help menu
- Each section maps to a URL anchor so `(i)` icons can deep-link

---

### NF-PIVOT Execution Order

```
✅ Week 1 (unblock self-hosting):
  NF-PIVOT-01  Remove process.exit(1)                    ✅ DONE
  NF-PIVOT-02  Make CloudConnection optional              ✅ DONE
  NF-PIVOT-03  Hardcode community limits                  ✅ DONE
  NF-PIVOT-06  docker-compose.prod.yml                    ✅ DONE

✅ Week 2 (billing + publish):
  NF-PIVOT-04  Wire Stripe directly                       ✅ DONE
  NF-PIVOT-05  AGPL license + GitHub publish              ✅ DONE
  NF-PIVOT-07  Legal templates BSL → AGPL                 ✅ DONE

✅ Week 3 (growth + cleanup):
  NF-PIVOT-08  Landing page + signup flow                 ✅ DONE
  NF-PIVOT-09  Production readiness (code items)          ✅ DONE
  NF-PIVOT-10  Remove PC coupling (cleanup)               ✅ DONE

🔲 Ongoing:
  NF-PIVOT-11  User & Developer Guide                     🔲 TODO (~3–5d)
```

**NF-PIVOT code work:** ✅ COMPLETE. Remaining items are operational (legal sign-off, Stripe tax, status page, Sentry wiring) and the User & Developer Guide (NF-PIVOT-11).

---

## §13 — NF-OSS-01: OSS Release Audit (DevOps / Security / License)

**Priority:** P0 (must complete before GitHub public release) | **Effort:** M | **Status:** 🟡 IN PROGRESS

### NF-OSS-01 Fast-track — Completed 2026-04-01

- [x] `npm audit --audit-level=high` — 0 vulnerabilities (API + console)
- [x] `license-checker --production` — all MIT/Apache/ISC, no violations
- [x] `package.json` license field set to `AGPL-3.0-or-later` in both packages
- [x] `gitleaks` secrets sweep — 19 findings → 0 after fixes
- [x] `.gitignore` patched: `.claude/`, `.license-dev`, `console/.next/`, `backups/`, `.env.*`
- [x] `.env.example` Slack URL placeholder sanitised
- [x] `.gitleaks.toml` allowlist for test fixtures
- [x] `LICENSE` — AGPL-3.0 full text
- [x] `SECURITY.md` — vulnerability disclosure policy
- [x] `README.md` — CI badge, new env vars, stale `LICENSE_FILE_PATH` removed
- [x] `.github/workflows/ci.yml` — API (tsc + test + audit), console (tsc + audit), gitleaks

### NF-OSS-01 Follow-up — Required Actions

**🔴 P0 — Must fix before GitHub push:** ✅ ALL DONE
- [x] **FIX-01** Add `.dockerignore` to root and `console/`
- [x] **FIX-02** Revert `private: false` → `private: true` in both `package.json`
- [x] **FIX-03** Fix `BCRYPT_ROUNDS` inconsistency — `users.ts` now reads `config.BCRYPT_ROUNDS`

**🟡 P1 — Before first external visitor:** ✅ ALL DONE
- [x] **FIX-04** README: add first-admin creation steps (`REGISTRATION_ENABLED=true` → signup → disable)
- [x] **FIX-05** README: add GitHub App setup section
- [x] **FIX-06** README: fix stale project layout descriptions (`billing/`, `license/`)
- [x] **FIX-07** CI: add `npm run build` step to API job
- [x] **FIX-08** CI: pin all action versions to SHA digests (checkout, setup-node, gitleaks)
- [x] **FIX-09** `CONTRIBUTING.md` — already existed and was complete; verified no 404
- [x] **FIX-10** `.gitignore`: added `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.tsbuildinfo`, `tmp_*/`

**🔵 P2 — Before wider promotion:** ✅ ALL DONE
- [x] **FIX-11** Pin Docker base images to SHA digest (`node:22-slim` and `node:22-alpine`)
- [x] **FIX-12** README: added `<!-- TODO: screenshots -->` placeholder after Hetzner deploy
- [x] **FIX-13** CI: added comment explaining integration tests run locally, not in CI

> Gate: nothing in the public repo should contain secrets, proprietary deps, license-incompatible packages, or known high/critical CVEs. This mirrors the PC-SEC-20/26 hardening done for PlatformCloud.

### 13.1 — License Compliance

All dependencies must be compatible with AGPL-3.0. Incompatible licenses: proprietary, BUSL, CC-NC, SSPL, or any copyleft license that conflicts with AGPL distribution.

**API (`package.json`) — runtime deps to audit:**
| Package | Current license | Compatible? |
|---|---|---|
| `@ai-sdk/*`, `ai` | Apache-2.0 | ✅ |
| `@hono/node-server`, `hono` | MIT | ✅ |
| `@opentelemetry/*` | Apache-2.0 | ✅ |
| `bcryptjs` | MIT | ✅ |
| `js-yaml` | MIT | ✅ |
| `jsonwebtoken` | MIT | ✅ |
| `nodemailer` | MIT | ✅ |
| `ollama-ai-provider` | MIT | ✅ (verify on publish) |
| `pg-boss` | MIT | ✅ |
| `pino`, `pino-pretty` | MIT | ✅ |
| `postgres` | MIT | ✅ |
| `stripe` | MIT | ✅ |
| `ulid` | MIT | ✅ |
| `zod` | MIT | ✅ |

**Console (`console/package.json`) — runtime deps:**
| Package | Current license | Compatible? |
|---|---|---|
| `@xyflow/react` | MIT | ✅ |
| `dagre`, `@types/dagre` | MIT | ✅ |
| `date-fns` | MIT | ✅ |
| `framer-motion` | MIT | ✅ |
| `next` | MIT | ✅ |
| `react`, `react-dom` | MIT | ✅ |
| `swr` | MIT | ✅ |

**Tasks:**
- [ ] Run `npx license-checker --production --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;0BSD;Unlicense;Python-2.0"` in both `./` and `./console`
- [ ] Fix or replace any non-compliant package
- [ ] Add `LICENSES-THIRD-PARTY.md` listing all runtime deps + their licenses
- [ ] Confirm `ollama-ai-provider` license on npm registry before publish

### 13.2 — Security Vulnerability Scan

- [ ] `npm audit --audit-level=high` in both `./` and `./console` — zero high/critical CVEs
- [ ] Run `npx snyk test` or equivalent for deeper transitive dep analysis
- [ ] Review `npm audit` output for moderate CVEs — document accepted risks
- [ ] Ensure `package-lock.json` / `pnpm-lock.yaml` is committed (locked deps = reproducible builds)
- [ ] Check for `postinstall` scripts in deps that could execute arbitrary code

### 13.3 — Secrets & Sensitive Data Sweep

Before pushing to public GitHub:
- [ ] Run `git log --all --full-history -- "*.env*"` — ensure no `.env` files were ever committed
- [ ] Run `trufflesecurity/trufflehog` or `gitleaks` on the full repo history
- [ ] Confirm `.gitignore` covers: `.env`, `*.pgdump`, `backups/`, `coverage/`, `*.key`, `*.pem`
- [ ] Review `docker-compose.prod.yml` — no hardcoded secrets, all values via env vars
- [ ] Audit all `console/src/lib/api.ts` for accidental key logging

### 13.4 — Docker / Build Artefact Hardening

- [ ] Confirm Dockerfile base image uses pinned digest (`FROM node:22-alpine@sha256:...`)
- [ ] Confirm non-root user in all Dockerfiles (already done for PC, verify NF)
- [ ] Confirm `.dockerignore` excludes `node_modules`, `.env`, `coverage/`, `*.test.ts`
- [ ] Remove any `console.log` or debug output that leaks config values at startup

### 13.5 — GitHub Repo Setup Checklist

- [ ] `README.md` — installation, env var reference, quick-start
- [ ] `CONTRIBUTING.md` — PR process, test requirements, coding standards
- [ ] `SECURITY.md` — links to `/.well-known/security.txt`, disclosure timeline
- [ ] `LICENSE` file — AGPL-3.0 full text
- [ ] Branch protection on `main`: require PR + CI pass before merge
- [ ] GitHub Actions CI: `npm test`, `npx tsc --noEmit`, `npm audit --audit-level=high`
- [ ] Dependabot enabled for npm security updates
- [ ] Issue templates: Bug report, Feature request, Security vulnerability (private)

### 13.6 — Acceptance Criteria

- [ ] `npm audit` returns 0 high/critical in both packages
- [ ] `license-checker` returns only allowed licenses
- [ ] `trufflehog`/`gitleaks` returns 0 findings
- [ ] `npx tsc --noEmit` returns 0 errors (or only pre-existing LineageTimeline.tsx warnings)
- [ ] GitHub repo is public with README, LICENSE, SECURITY.md, CI green

---

## §14 — NF-BETA-01: Beta Testing Scenarios

**Priority:** P1 | **Effort:** L | **Status:** ✅ COMPLETE 2026-04-01

> Validate all NF-PIVOT-changed and newly added functionality through structured beta test scenarios. Extends the existing 975-test suite with coverage for the signup/billing/AGPL-specific flows.

### 14.1 — Signup Flow (NF-PIVOT-08)

**New endpoint:** `POST /api/v1/auth/register`

Scenarios to test:
- [ ] **Happy path**: `REGISTRATION_ENABLED=true` → valid email/password → 201, JWT returned, user created with `roles: ["admin"]`
- [ ] **Registration disabled** (default): `REGISTRATION_ENABLED=false` → 404 `REGISTRATION_DISABLED`
- [ ] **Duplicate email**: second register with same email → 409 `EMAIL_ALREADY_EXISTS`
- [ ] **Weak password**: < 8 chars → 400 validation error
- [ ] **Missing required fields**: no email or no password → 400
- [ ] **SQL injection / XSS in displayName**: sanitised, no DB error
- [ ] **Email normalisation**: `USER@COMPANY.COM` == `user@company.com` (case-insensitive dedup)

**Console signup page** (`/signup`):
- [ ] Form renders with plan context (`?plan=starter` shows trial messaging)
- [ ] Password mismatch shows inline error, does not submit
- [ ] On success: redirects to `/setup`
- [ ] On 404 from API: shows "registration disabled" message
- [ ] On 409: shows "email already exists" message
- [ ] Links to `/terms` and `/privacy` render

### 14.2 — Billing UI (Task 19 / NF-PIVOT-04)

**Endpoint:** `GET /api/v1/billing/status`

Scenarios to test:
- [ ] **`BILLING_ENABLED=false`**: Settings → Plan tab shows community tier state, no infinite SWR retry
- [ ] **`BILLING_ENABLED=true`, community tier**: upgrade CTAs visible for Starter + Growth
- [ ] **Trial active**: countdown banner shows days remaining, correct date math
- [ ] **Paid plan, cancellation pending**: cancellation banner shows `cancelAt` date
- [ ] **`?stripe_return=success`**: toast "Subscription activated!", SWR revalidates, URL cleaned
- [ ] **`?stripe_return=cancel`**: toast "Checkout cancelled.", URL cleaned
- [ ] **Checkout flow**: clicking upgrade calls `billingCheckoutApi` with correct `planId` + `interval`, redirects to Stripe URL
- [ ] **Portal flow**: clicking "Manage subscription" calls `billingPortalApi`, redirects to Stripe portal
- [ ] **Monthly/annual toggle**: interval state persists within session, prices update

### 14.3 — Public Registration Security (NF-PIVOT-09)

- [ ] `REGISTRATION_ENABLED=false` (default): POST /auth/register → 404 (not 401, not 500)
- [ ] First registered user gets `roles: ["admin"]` — no escalation path for subsequent users
- [ ] JWT from register is valid for subsequent authenticated requests
- [ ] `/.well-known/security.txt`: returns 200, correct `Content-Type: text/plain`, contains `Contact: mailto:security@nestfleet.dev`
- [ ] `Expires` field in security.txt is in the future (within 365 days)

### 14.4 — Landing Page + Pricing (NF-PIVOT-08)

Manual smoke test checklist:
- [ ] Hero CTA "Get started free →" → `/signup`
- [ ] Pricing section: Community / Starter / Growth CTAs each link to correct signup URLs
- [ ] "AGPL-3.0 open source" copy visible, no BSL references remain
- [ ] "Deploy from source →" links to GitHub repo
- [ ] `/terms` and `/privacy` pages load (even if placeholder)

### 14.5 — New Test Files to Write

| Test file | Scope | Test count (target) |
|---|---|---|
| `tests/unit/auth/register.test.ts` | register endpoint unit tests | ~12 |
| `tests/integration/auth/register.integration.test.ts` | full DB round-trip: register → login | ~6 |
| `tests/unit/api/security-txt.test.ts` | `/.well-known/security.txt` response | ~4 |
| `console/e2e/signup.spec.ts` | E2E signup flow (happy path + error states) | ~8 |
| `console/e2e/billing-return.spec.ts` | `?stripe_return=success|cancel` handling | ~4 |

**Total new tests:** ~34 | **New suite total (projected):** ~1,009

---

## §15 — NF-PROV-01: New Org Provisioning Test Suite

**Priority:** P1 | **Effort:** M | **Status:** ✅ COMPLETE 2026-04-01

> When a new organisation signs up to the NestFleet managed service, the system must automatically provision a clean, functional workspace. This suite validates the end-to-end provisioning contract so regressions are caught before they reach a paying customer's onboarding.

### 15.1 — What "New Org Provisioning" Covers

The provisioning sequence for a new sign-up:

```
POST /auth/register
  → User created (roles: ["admin"])
  → JWT issued

POST /api/v1/setup  (setup wizard)
  → Product created (slug, display name, GitHub App install ID)
  → Default routing rules seeded
  → Default agent configuration seeded
  → First product set as active in session

GET /api/v1/products/:productId
  → Product visible with correct defaults

GET /api/v1/billing/status  (if BILLING_ENABLED)
  → Community tier active, trial start date set
```

### 15.2 — Test Scenarios

**Happy path — full provisioning chain:**
- [ ] Register → receive JWT
- [ ] Use JWT to complete setup wizard (POST /api/v1/setup with minimal valid body)
- [ ] Verify product created with correct slug and owner
- [ ] Verify default routing rules exist (at least 1 rule seeded)
- [ ] Verify default agent config exists
- [ ] Verify `GET /api/v1/products` returns the new product
- [ ] Verify user can immediately create a case in the new product

**Idempotency:**
- [ ] Calling setup wizard twice for the same product returns 409 or is idempotent (no duplicate data)

**Partial failure recovery:**
- [ ] If product creation succeeds but routing seed fails → is DB left in a consistent state? (test with mocked routing seed error)
- [ ] On retry, provisioning completes successfully

**Isolation between orgs:**
- [ ] Two separate signups produce fully isolated products — no data leaks between them
- [ ] User from Org A cannot access Org B's product via direct product ID in URL

**Billing init (when BILLING_ENABLED=true):**
- [ ] After provisioning, `GET /api/v1/billing/status` returns `plan: "community"`, `trialEndsAt` set to `now + TRIAL_DAYS`
- [ ] No Stripe objects created until user upgrades

### 15.3 — Test Infrastructure

- [ ] Use Testcontainers (PostgreSQL) for isolation — same infra as existing integration tests
- [ ] Add `provisionOrg(db)` helper to `tests/helpers/provision.ts` that runs the full chain in one call — reusable by other integration tests
- [ ] Seed fixtures: minimal valid setup wizard payload, valid JWT
- [ ] Teardown: each test should clean up its org data (use a unique email prefix per test)

### 15.4 — New Test Files

| Test file | Scope | Test count (target) |
|---|---|---|
| `tests/integration/provisioning/new-org-happy-path.test.ts` | Full register → setup → product visible | ~8 |
| `tests/integration/provisioning/provisioning-idempotency.test.ts` | Duplicate setup, retry | ~4 |
| `tests/integration/provisioning/org-isolation.test.ts` | Cross-org data access prevention | ~6 |
| `tests/integration/provisioning/billing-init.test.ts` | Community tier init on provision | ~4 |
| `tests/helpers/provision.ts` | Shared `provisionOrg()` helper | — |

**Total new tests:** ~22

---

## §17 — BEF-01..11: Beta Eval Findings — Bug Fixes & Missing Features

**Priority:** P1 (BEF-01,02,09,11) / P2 (BEF-03..08,10) | **Status:** ✅ COMPLETE 2026-04-02 (except BEF-06, BEF-10 deferred)
**Found:** 2026-04-02 Group A automated run · **Reference:** `docs/business/beta-eval-manual-runbook.md`

> 11 findings from running all 20 Group A beta evaluation scenarios against live DB + agent pipeline.
> Split into **must-fix** (break core evaluation flows) and **should-fix** (calibration / quality improvements).

---

### BEF-01 · `ai_resolved` flag not stored on auto-resolved cases

**Priority:** P1 | **Effort:** S | **Scenarios affected:** DG-09, SS-04

When the agent auto-resolves a case, no `ai_resolved` field is set anywhere — not on the `cases` row, not in `triage_output`. The `knowledge-capture` job (DG-09) depends on detecting `ai_resolved = true`. Without it, DG-09 can never run.

**Fix:** In `AutoReplyWorker` (or wherever `status → resolved` transition fires for AI-driven resolutions), set `triage_output.aiResolved = true` before persisting. Alternatively add an `ai_resolved boolean` column to `cases`.

---

### BEF-02 · `knowledge-capture` pg-boss job never dispatched

**Priority:** P1 | **Effort:** M | **Scenarios affected:** DG-09

The `knowledge-capture` job is referenced in the run-plan and spec but has zero rows in `pgboss.job` for any `knowledge-capture` name. The job dispatcher either doesn't exist or is never called.

**Fix:** After a case transitions to `resolved` with `ai_resolved = true`, dispatch a `knowledge-capture` job with `{ caseId, productId }`. Wire the handler to extract Q&A pairs from `triage_output` and write to `knowledge_assets` table with `status: "pending-review"`.

---

### BEF-03 · Gate1 confidence threshold is `> 0.80` (strict) — boundary cases always fail

**Priority:** P2 | **Effort:** XS | **Scenarios affected:** DG-03

`draft_metadata.validationFailReason = "gate1_confidence_below_threshold(0.80)"` with `confidenceScore = 0.80`. The gate is implemented as `score > threshold` (strict), so exactly 0.80 fails. This causes high-quality replies to be unnecessarily held.

**Fix:** Change gate1 check from `score > GATE1_THRESHOLD` to `score >= GATE1_THRESHOLD` in the auto-reply validation logic. Or lower the threshold to 0.75 if 0.80 is genuinely too generous.

---

### BEF-04 · Billing/forbidden-phrase gate not firing for refund-related content

**Priority:** P2 | **Effort:** S | **Scenarios affected:** DG-05

DG-05 (billing dispute / upgrade pricing) auto-resolved with confidence 0.9 without triggering the forbidden-phrase gate. Expected: `awaiting-lead` because billing/refund content should require Lead review before any reply is sent.

**Fix:** Review the forbidden-phrase regex patterns. Ensure the gate is applied to the *proposed reply content* before auto-send, not just to the incoming signal. Test with: "refund", "credit", "we cannot refund", "charges are non-refundable", "billing error".

---

### BEF-05 · Severity over-classification: crash/stack-trace context inflates to `high`

**Priority:** P2 | **Effort:** S | **Scenarios affected:** DG-06

DG-06 (setup wizard pagination crash) was classified `high` instead of expected `normal`. The triage prompt interprets a crash stack trace as high-severity, but this crash affects only the setup flow (not production data or all users).

**Fix:** Add a triage prompt refinement: "A crash during initial setup or configuration does not imply production data loss or service unavailability. If the crash is isolated to onboarding/setup and no production functionality is impaired, classify as `normal` unless user explicitly states all users are affected."

---

### BEF-06 · No KB evidence retrieved for setup crash / DG-06 scenario

**Priority:** P2 | **Effort:** S | **Scenarios affected:** DG-06

DG-06 (GitHub App pagination crash for large organizations) returned `evidence_refs = []`. The KB article for setup-wizard troubleshooting was not retrieved. This left the AI with no context to draft a useful workaround reply.

**Fix:** Check embedding quality for the setup-wizard KB chunk (`mc_beta_dg_setup_wizard` or equivalent). Re-run `seed-knowledge.ts` and verify the chunk appears in the knowledge sources. May also need query tuning — the triage output labels (`setup wizard`, `pagination`, `large organization`) should match the KB chunk's content.

---

### BEF-07 · Severity under-classification for high-impact infrastructure events

**Priority:** P2 | **Effort:** M | **Scenarios affected:** SS-02, SS-03, SS-06, SS-07

Multiple infrastructure/regression scenarios were classified one level lower than expected:
- SS-02: webhook regression → `high` (expected `critical`)
- SS-03: ZK timeout → `normal` (expected `high`)
- SS-06: batch API 500 → `high` (expected `critical`)
- SS-07: mobile ZK proof failure → `normal` (expected `high`)

**Pattern:** The triage prompt defines `critical` as "service down, data loss, security breach, blocking all users." Infrastructure failures affecting a subset of users (not all) land as `high`. This is technically correct per the prompt but doesn't reflect real SLA expectations for B2B customers.

**Fix options:**
1. Add a `critical` trigger for: any monitoring alert with failure rate > threshold (SS-06, SS-08 patterns)
2. Add `critical` trigger for: breaking changes in versioned APIs (SS-02 pattern)
3. Accept current behavior and update scenario expectations (cheapest — adjust the run-plan)

---

### BEF-08 · Sensitivity/empathy gate not firing for career-impact cases

**Priority:** P2 | **Effort:** S | **Scenarios affected:** SS-05

SS-05 (meta-skill synthesis error affecting a user's career prospects) auto-resolved with `confidence = 0.9` without triggering the empathy/sensitivity gate. Expected: `awaiting-lead` so a human can verify the tone before sending.

**Fix:** Define a sensitivity gate trigger list: ["career", "employment", "job", "dismissed", "fired", "reputation", "legal action", "discrimination"]. If signal body or triage labels contain these terms, force `awaiting-lead` regardless of confidence score.

---

### BEF-09 · `outage-routing` pg-boss job never dispatched

**Priority:** P1 | **Effort:** M | **Scenarios affected:** SS-06, SS-08

Both outage scenarios (batch API 500, blockchain anchor failure) show 0 `outage-routing` jobs in `pgboss.job`. The job is referenced in the run-plan and specs but is never dispatched, meaning outage escalation to engineering/on-call is entirely manual.

**Fix:** In the triage pipeline, after severity is assigned: if `severity = 'critical'` AND `type IN ('bug_report', 'outage_report')` OR case body matches outage keywords ("500", "down", "failure rate", "anchor failure"), dispatch an `outage-routing` job with `{ caseId, productId, severity }`. The handler should: create an urgent CR, notify on-call channel (Slack webhook), flag case with `outage_routing: true` in metadata.

---

### BEF-10 · SS-09 (OU limit enforcement) not in inject-signals.ts + schema mismatch

**Priority:** P2 | **Effort:** M | **Scenarios affected:** SS-09

SS-09 is absent from inject-signals.ts available scenarios. The run-plan setup SQL uses `product_llm_usage (product_id, period_start, ou_used, ou_limit)` but the actual table has columns `(product_id, action_type, model_id, month_year, input_tokens, output_tokens, call_count)`. No OU limit concept is in the current schema.

**Fix:**
1. Determine how OU limit enforcement is/should be implemented (is it based on token counts? case count? outcome_unit_usage events?)
2. Add `ou_limit` to the relevant table or derive limit from license tier
3. Add SS-09 signal scenario to inject-signals.ts with proper setup/teardown
4. Implement the enforcement: when limit reached, signal still accepted but triage job not dispatched + notification created

---

### BEF-11 · Bridge event endpoint not implemented

**Priority:** P1 | **Effort:** L | **Scenarios affected:** XP-01

`POST /api/v1/bridge/event` returns 404. The cross-product bridge event system (doc-drift detection, NestFleet ↔ DocuGardener signal routing) is spec'd in the scenarios but has no implementation.

**Fix:** Implement `POST /api/v1/bridge/event`:
- Auth: admin token
- Body: `{ event: string, sourceProduct: string, targetProduct: string, payload: object }`
- Handler: parse event type, look up target product by slug, create a signal + case with `source_type: 'bridge_event'`, dispatch triage job
- Route must be mounted in `src/api/index.ts`

---

### §17 — Priority Summary

| ID | Title | Priority | Effort | Status |
|----|-------|----------|--------|--------|
| BEF-01 | `ai_resolved` flag not stored | P1 | S | ✅ 2026-04-02 |
| BEF-02 | `knowledge-capture` job never dispatched | P1 | M | ✅ 2026-04-02 |
| BEF-03 | Gate1 strict `>` boundary — use `>=` | P2 | XS | ✅ 2026-04-02 |
| BEF-04 | Billing/forbidden-phrase gate not firing | P2 | S | ✅ 2026-04-02 |
| BEF-05 | Crash context inflates severity | P2 | S | ✅ 2026-04-02 |
| BEF-06 | No KB evidence for DG-06 setup crash | P2 | S | ⏳ (KB embed quality — manual review needed) |
| BEF-07 | Severity under-classification (infra events) | P2 | M | ✅ 2026-04-02 |
| BEF-08 | Sensitivity gate missing career-impact triggers | P2 | S | ✅ 2026-04-02 |
| BEF-09 | `outage-routing` job never dispatched | P1 | M | ✅ 2026-04-02 |
| BEF-10 | SS-09 missing + OU limit schema mismatch | P2 | M | ⏳ (schema investigation needed) |
| BEF-11 | Bridge event endpoint not implemented | P1 | L | ✅ 2026-04-02 |
| BEF-12 | inject-signals.ts creates duplicate cases on re-run | P2 | XS | 🔲 |
| BEF-13 | "Auto-replied" badge misleading on awaiting-lead cases | P2 | XS | 🔲 |
| BEF-14 | PR draft agent produces runbooks/specs instead of code fixes | P2 | M | 🔲 |
| BEF-15 | Gate4 misses "credit" in reply text — case auto-resolves | P1 | S | 🔲 |
| BEF-16 | No correction email / manual reply on already-sent auto-reply cases | P2 | S | 🔲 |
| BEF-17 | No Reopen action on Resolved cases | P2 | S | 🔲 |
| BEF-18 | PR status badge "PR drafted" misleading — implies ready-to-merge | P2 | XS | 🔲 |

---

### BEF-12 · inject-signals.ts duplicate cases on re-run

**Priority:** P2 | **Effort:** XS | **Found:** DG-02 Group B run

inject-signals.ts generates a fresh timestamp-based `source_ref` on every run, bypassing the
signal dedup constraint (`UNIQUE(source_type, source_ref)`). Re-running the script creates a
second case for every scenario, polluting the queue with stale cases from previous sessions.

**Fix:** Key `source_ref` to the scenario ID, not the current timestamp:
```typescript
source_ref: `beta-eval:${scenario.id}`  // stable across runs
```
The unique constraint on `(source_type, source_ref)` then prevents duplicates automatically —
second run is silently deduped, no stale cases created.

---

### BEF-13 · "Auto-replied" badge misleading on awaiting-lead cases

**Priority:** P2 | **Effort:** XS | **Found:** DG-02 Group B run

Cases in `awaiting-lead` status with a saved draft reply show an "Auto-replied" badge in the
case list. This is misleading — the reply was drafted but NOT sent. A lead seeing "Auto-replied"
may think the customer already received a response and skip reviewing the draft.

**Fix:** Badge logic should distinguish:
- `autoSend: true` → resolved case → **"Auto-replied"** (correct)
- `autoSend: false` + draft saved → awaiting-lead case → **"Reply drafted"** or **"Draft ready"**

The `draft_reply` column being non-null on an awaiting-lead case is the signal to use the
alternate badge label.

---

### BEF-14 · PR draft agent produces runbooks/specs instead of code fixes

**Priority:** P2 | **Effort:** M | **Found:** DG-04 + DG-06 Group B run

Two confirmed instances of inconsistent PR draft output format:

- **DG-04** (inconsistent drift scores — reproducible bug): agent produced an operational
  runbook (`dg reindex --branch main --force`) — wrong format entirely for a `bug` case type.
- **DG-06** (setup wizard stack overflow — reproducible bug): agent produced a well-structured
  PR description with correct file target and test criteria, but no actual code diff/sketch.
  Better than DG-04 but still short of an implementable output.

**Pattern:** agent correctly identifies root cause and target file but stops at description
level. It does not produce a code sketch or diff outline.

**Expected output for `bug` case type:** a PR with (1) problem summary, (2) root cause, (3)
specific code change sketch or diff outline showing the proposed fix, (4) test criteria.
The developer implements from the sketch — NestFleet is not expected to write production code.

**Fix:** PR draft agent prompt must require a `## Proposed Change` section for `bug` case type
containing a code-level outline (pseudocode or diff sketch). Runbook/CLI-only output should
be rejected by the prompt as insufficient for bug cases.

---

### BEF-18 · PR status badge "PR drafted" misleading — implies ready-to-merge

**Priority:** P2 | **Effort:** XS | **Found:** DG-06 Group B run

The console shows `pr_drafted` status on cases where a GitHub PR description was created.
This badge implies the PR is ready for review/merge, when in practice the PR contains only
a description — a developer still needs to write and push the actual implementation.

**Fix:** Rename badge/status label from `"PR drafted"` to `"Implementation pending"` or
`"PR spec created"`. This sets the correct expectation: engineering work is queued, not done.
The label should only change to `"PR ready"` or similar once the linked GitHub PR has
actual commits (detectable via GitHub webhook on `pull_request.synchronize` event).

---

### BEF-15 · Gate4 misses "credit" in reply text — case auto-resolves

**Priority:** P1 | **Effort:** S | **Found:** DG-05 Group B run

DG-05 (billing inquiry — Solo→Team upgrade, missing pro-rata credit) was auto-resolved. The
auto-reply text contained "pro-rata credit". "credit" is in `FORBIDDEN_PHRASES` (added BEF-04).
Gate4 should have blocked `autoSend` and routed to `awaiting-lead`.

**Likely causes to investigate:**
1. Substring match is case-sensitive — "Credit" (capitalised in reply) not matching "credit"
2. Gate4 scanning `signalText` but not `replyText` in this code path (partial BEF-04 fix)
3. The BEF-04 fix was not active when DG-05 was processed (timing issue)

**Fix:** Ensure Gate4 `.toLowerCase()` normalises both `replyText` and `signalText` before
phrase scan. Add regression test: reply containing "pro-rata credit" must produce `autoSend: false`.

---

### BEF-16 · No correction email / manual reply on already-sent auto-reply cases

**Priority:** P2 | **Effort:** S | **Found:** DG-05 Group B run

When an auto-reply is sent and the case is resolved, there is no in-console mechanism for
an operator to send a correction or follow-up email to the customer. The reply composer is
only active on open cases. Workaround today: send correction from external email client.

**Fix:** Add a "Send follow-up" action to Resolved cases in the case detail view. This should:
- Open a compose modal (pre-populated with customer email from signal)
- Send via the same Resend/SMTP transport as auto-replies
- Log a `case.follow_up_sent` audit event on the case timeline

---

### BEF-17 · No Reopen action on Resolved cases

**Priority:** P2 | **Effort:** S | **Found:** DG-05 Group B run

Resolved cases have no Reopen action in the case actions menu. To send a correction or
manual reply via the reply composer, an operator must be able to reopen the case to
`awaiting-lead` or `in-resolution`.

**Fix:** Add "Reopen" to the case actions dropdown on Resolved cases. Transition:
`resolved → awaiting-lead`. Audit event: `case.reopened` with operator + reason note.
Badge/status reverts; case reappears in Lead Queue.

Note: BEF-16 (follow-up email) and BEF-17 (reopen) are related but independent — BEF-16
is the preferred path for simple corrections; BEF-17 is needed when the case requires
substantive re-handling.

---

## §16 — NF-OPS-01: Owner Admin Console (Fleet Health + Revenue KPIs)

**Priority:** P2 | **Effort:** XL | **Status:** ✅ COMPLETE 2026-04-05

> A private operator dashboard (accessible only to the NestFleet team) that aggregates health metrics, usage telemetry, and revenue KPIs from all deployed NestFleet instances. Analogous to the DG owner console, but architecturally more complex because NestFleet is deployed as independent self-hosted instances (VPS/Docker) rather than a centralised multi-tenant service.

### 16.1 — Architecture Challenge

Unlike DocuGardener (single SaaS, centralised DB), NestFleet instances are:
- Independent VPS deployments (each customer has their own DB + runtime)
- Communicating only via opt-in telemetry + Stripe webhooks

**Data aggregation strategies available:**

| Strategy | Data available | Complexity | Privacy impact |
|---|---|---|---|
| **Stripe webhooks** | Revenue, plan, churn, trial conversions | Low | None (already collected) |
| **Opt-in telemetry ping** (already in privacy policy §2.4) | OU usage counts, case counts, agent action types | Medium | Opt-in, no PII |
| **Managed SaaS only** (SaaS tier deployments phone home, self-hosted don't) | Health, version, uptime | Medium | SaaS customers only |
| **Synthetic health checks** (operator polls each instance's `/health` endpoint) | Uptime, version, latency | High (requires known instance IPs) | None |

**Recommended approach:** Stripe for revenue + opt-in telemetry ping for usage + version tracking.

### 16.2 — Phase 1: Revenue + Stripe Dashboard (MVP)

All revenue data is already in Stripe — the MVP is a read-only view over Stripe's API/webhooks.

**Data points (Stripe only):**
- MRR / ARR (from active subscriptions)
- Trial starts, trial conversions, churned accounts
- Plan distribution (Community / Starter / Growth / Scale)
- Revenue by period (monthly, quarterly)
- Failed payments / dunning events

**Implementation:**
- [x] `GET /api/v1/owner/revenue` — reads Stripe subscription list, aggregates MRR/ARR
- [x] `GET /api/v1/owner/cohorts` — trial cohorts + conversion rates (grouped by `trial_start` month)
- [x] Owner console frontend page: `/owner/dashboard` (protected, owner role only)
- [x] Revenue KPI cards: MRR, ARR, active paid accounts, trials, churn rate (last 30d)
- [x] Subscription timeline chart (new / churned per week — pure SVG, no Recharts)

**Auth:** Separate `owner` role (not `admin`) — only set on the NestFleet team's own accounts, never provisioned to customers.

### 16.3 — Phase 2: Usage Telemetry Aggregation

Leverages the opt-in telemetry already described in the Privacy Policy (§2.4).

**Telemetry ping design:**
```
POST /api/v1/telemetry/ping   (called by each instance on schedule, e.g. hourly)
{
  "instance_id": "uuid-stable-per-deployment",   // stable UUID, stored in .env
  "version": "1.2.3",
  "cases_processed_24h": 42,
  "ou_consumed_24h": 1200,
  "agent_actions_24h": { "auto_reply": 30, "escalate": 8, "resolve": 4 },
  "active_users_24h": 5
}
```

- [x] `POST /api/v1/telemetry/ping` endpoint — unauthenticated but rate-limited (10 req/60s per IP)
- [x] `telemetry_pings` table: `instance_id`, `version`, `reported_at`, `payload jsonb` (migration 0047)
- [x] `INSTANCE_ID` + `TELEMETRY_OPT_IN` config vars; startup ping fires when opt-in enabled
- [x] `GET /api/v1/owner/telemetry` — aggregates last-24h: active instances, version distribution, instance list
- [x] `TelemetryPanel.tsx` in owner console: active instances KPI, version bars, instance table

### 16.4 — Phase 3: Instance Fleet View (SaaS-managed only)

For the NestFleet managed SaaS tier (where NestFleet controls the infrastructure):
- [x] `fleet-health-worker.ts` — pg-boss cron `*/10 * * * *`, polls `/health` on each active provisioning
- [x] `checkInstanceHealth()` pure helper: ok/degraded/unreachable → writes `last_health_status` to DB
- [x] Alerting: if unreachable > 2h → email to `OPS_ALERT_EMAIL`; uses `Promise.allSettled` for isolation
- [x] Owner console fleet list + detail pages with `FleetStatusBadge` (animated for pending/provisioning)

### 16.5 — Owner Console UI

**Page:** `/owner/dashboard` (separate from customer-facing `/settings`)

Sections:
1. **Revenue** — MRR/ARR cards, plan breakdown pie, subscription timeline chart
2. **Usage** — Total OUs consumed today, case volume, agent action breakdown
3. **Fleet** (Phase 3) — instance list with health status
4. **Cohorts** — Trial starts (this month), conversions, churned accounts

**Tech:**
- Protected by `owner` role check on every route
- SWR with 60s refresh for live data
- Revenue chart: Recharts or a similar MIT-licensed charting lib

### 16.6 — Delivery Phases

| Phase | Scope | Effort | Blocked by |
|---|---|---|---|
| Phase 1 (MVP) | Stripe revenue dashboard | M | Stripe live, owner role |
| Phase 2 | Opt-in telemetry aggregation | M | telemetry ping endpoint |
| Phase 3 | Fleet view (managed SaaS) | L | managed deployment infra |

**Total effort:** ~2–3 weeks across all phases. Phase 1 MVP can ship in ~3 days.

### 16.7 — Acceptance Criteria (Phase 1)

- [x] `/owner/dashboard` returns 403 for non-owner roles (NF-UNIT-OWN-02, NF-INT-REV-06)
- [x] MRR/ARR calculation unit-tested against known fixtures (NF-UNIT-REV-01..08)
- [x] Trial conversion rate visible in `/owner/cohorts` (NF-UNIT-OWN-05)
- [x] Revenue data refreshes automatically (SWR 60s, no manual reload required)
- [x] No customer PII exposed — aggregated counts only; telemetry opt-in gated by `TELEMETRY_OPT_IN`
- [x] All mutation endpoints integration-tested: reset/deprovision/retry (NF-INT-MUT-01..09)

---

## §18 — NF-OPS-02..07: SaaS Fleet Provisioning Automation

> **Context:** One VPS per paying customer. Provisioning logic lives inside `src/provisioning/`
> on the main NestFleet instance — no separate management app or VPS needed.
> Triggered by Stripe `checkout.session.completed`. Full architecture and all constraints
> in `docs/specs/saas-fleet-provisioning.md`.
>
> **Build sequence:** NF-OPS-03 → NF-OPS-04 → NF-OPS-07 → NF-OPS-05 → NF-OPS-02 → NF-OPS-06
> **Must complete NF-OPS-02..05 + NF-OPS-07 before first paying customer.**

| ID | Item | Priority | Effort | Status |
|----|------|----------|--------|--------|
| **NF-OPS-02** | Provisioning module `src/provisioning/` — Hetzner + Cloudflare + health poll + welcome email | P0 | L | ✅ |
| **NF-OPS-03** | One-time infra setup: Hetzner Firewall + Cloudflare API token + zone ID | P0 | XS | ✅ 2026-04-06 |
| **NF-OPS-04** | `docker-compose.prod.yml` verified for automated provisioning (backup service, timing) | P0 | XS | ✅ 2026-04-06 |
| **NF-OPS-05** | Stripe webhook extended: `saas_signup` routing + `signup_intents` + `provisionings` tables | P0 | M | ✅ |
| **NF-OPS-06** | Deprovisioning — 30-day export window, nightly pg-boss job, Hetzner + DNS cleanup | P1 | S | ✅ |
| **NF-OPS-07** | Nightly Postgres backup to Hetzner Object Storage — injected via cloud-init cron | P0 | S | ✅ 2026-04-06 |
| **NF-OPS-08** | Provisioning test suite — unit + integration (mocked APIs) + E2E staging runbook | P0 | M | ✅ |

---

### NF-OPS-02 — Provisioning Module

**Priority:** P0 | **Effort:** L | **Blocked by:** NF-OPS-03, NF-OPS-04, NF-OPS-05

Lives at `src/provisioning/` inside the main NestFleet codebase. Called by the pg-boss
`ProvisioningWorker` which is enqueued by the Stripe webhook handler.

**Files to create:**
- `src/provisioning/provision.ts` — main provisioning sequence (steps 0–10, spec §4)
- `src/provisioning/deprovision.ts` — churn cleanup (spec §7)
- `src/provisioning/slug.ts` — slug validation + reservation check
- `src/provisioning/cloud-init.ts` — generates `user_data` YAML (write_files approach, no git clone)
- `src/workers/provisioning-worker.ts` — pg-boss worker wrapping `provision.ts`
- `src/workers/deprovisioning-worker.ts` — pg-boss scheduled job (nightly, 03:00 UTC)

**New config vars required** (`src/shared/config.ts` + `.env.example`):
```
PROVISIONING_ENABLED    HETZNER_API_TOKEN    CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID      HETZNER_FIREWALL_ID  CUSTOMER_BASE_DOMAIN
OPS_ALERT_EMAIL         OPS_SSH_PUBLIC_KEY   BUNDLED_LLM_API_KEY
BUNDLED_EMBEDDING_API_KEY
```

**cloud-init approach:** `write_files` directive injects `.env`, `docker-compose.prod.yml`,
`Caddyfile.prod`, and `backup.sh` directly — no `git clone`, no `sed`. All secrets
generated in-process (`crypto.randomBytes`) and written once. See spec §4.1.

**Hetzner VPS spec:** CX21 (2 vCPU, 4 GB, ~€5.92/mo), `ubuntu-22.04`, region `nbg1` (EU/GDPR).

**Health poll:** 30 attempts × 15s = 7.5 min max. Accounts for docker build time (~5–8 min
with `build:` in compose). Initial 60s wait before first poll (DNS TTL propagation).

**Acceptance criteria:**
- [ ] End-to-end: fake Stripe `saas_signup` event → VPS in Hetzner → `{slug}.nestfleet.dev` health 200
- [ ] `provisionings.status = 'active'` and welcome email sent on success
- [ ] Health timeout → `status = 'failed'`, ops alert email sent, no welcome email
- [ ] Hetzner API error → VPS cleanup attempted, `status = 'failed'`, ops alert
- [ ] Duplicate Stripe event (same `intent_id`) → idempotency guard, no duplicate VPS
- [ ] Generated `.env` on customer VPS contains unique secrets per customer (not shared)
- [ ] `BILLING_ENABLED=false` on customer VPS (billing is main instance only)
- [ ] `REGISTRATION_ENABLED=true` on customer VPS (customer self-registers admin account)
- [ ] Hetzner Firewall applied: only ports 22, 80, 443 inbound; 5432/3001/3002 not exposed
- [ ] Manual VPS power-reset: owner console calls `POST api.hetzner.cloud/v1/servers/{id}/actions/reset` → VPS reboots, services restart via `restart: unless-stopped`

---

### NF-OPS-03 — One-Time Infra Setup

**Priority:** P0 | **Effort:** XS | **Status:** ✅ COMPLETE 2026-04-06

- [x] Hetzner project `nestfleet` created; all resources isolated to this project
- [x] Hetzner Firewall `nestfleet-customer` created (ID: 10804246) — TCP 22/80/443 inbound, all outbound
- [x] Hetzner API token created (read+write), set in `.env` as `HETZNER_API_TOKEN`
- [x] SSH ed25519 key pair generated (`~/.ssh/nestfleet-ops`); private key in 1Password; public key set in `.env` as `OPS_SSH_PUBLIC_KEY`
- [x] Cloudflare API token created (`Zone:DNS:Edit` scoped to `nestfleet.dev`), set in `.env` as `CLOUDFLARE_API_TOKEN`
- [x] Cloudflare Zone ID noted, set in `.env` as `CLOUDFLARE_ZONE_ID`
- [x] All bundled LLM/embedding keys set (Google/Gemini — same key for both)
- [ ] Hetzner Object Storage bucket `nestfleet-backups` — deferred; local-only backups sufficient for Phase B smoke test

---

### NF-OPS-04 — docker-compose.prod.yml Verification

**Priority:** P0 | **Effort:** XS | **Status:** ✅ COMPLETE 2026-04-06

- [x] `docker-compose.prod.yml` reviewed — all 4 services correct (postgres, api, console, caddy)
- [x] Added `LLM_BASE_URL`, `EMBEDDING_BASE_URL`, `EMBEDDING_DIMENSIONS` to api service env block
- [x] Fixed `NESTFLEET_CLOUD_URL` default from `.nestfleet.io` → `.nestfleet.dev`
- [x] `docker/Caddyfile.prod` reviewed — routes `/api/*` + `/webhooks/*` + `/health` to api:3001, everything else to console:3002, security headers, TLS via Let's Encrypt HTTP-01
- [x] `scripts/verify-compose.sh` written — local smoke test: generates fresh secrets, starts postgres+api, polls `/health` up to 90s, always tears down on exit
- [ ] Real-VPS smoke test (`docker compose up` → HTTPS serving) — pending Phase B main instance spin-up

---

### NF-OPS-05 — Stripe Webhook Extension + DB Tables

**Priority:** P0 | **Effort:** M | **Depends on:** existing Stripe integration (NF-PIVOT-04)

**New DB tables:**
- `signup_intents` — tracks pre-payment intent; holds slug/email/plan pending Stripe checkout
- `provisionings` — lifecycle state per customer VPS (full schema in spec §6)

**New API endpoint:** `POST /api/v1/saas/signup`
```typescript
// Validates slug, creates signup_intent, creates Stripe checkout session,
// returns { checkoutUrl }. Called from the signup page before payment.
// Stripe session metadata: { event_type: 'saas_signup', intent_id, slug, email, plan }
```

**Stripe webhook extension** (`src/billing/webhook.ts`):
```typescript
case "checkout.session.completed": {
  const metadata = obj["metadata"] as Record<string, string>
  if (metadata?.event_type === "saas_signup") {
    // enqueue pg-boss job with singletonKey: intent_id (idempotency)
    await boss.send("provision_vps", { intentId, slug, email, plan },
      { singletonKey: metadata.intent_id })
  } else {
    // existing license billing path — unchanged
    await upsertWorkspaceBilling(...)
  }
}

case "customer.subscription.deleted": {
  const metadata = obj["metadata"] as Record<string, string>
  if (metadata?.event_type === "saas_subscription") {
    await startDeprovisioning(metadata.slug)  // sets deprovision_after = now()+30d
  } else {
    await upsertWorkspaceBilling(...)  // existing path
  }
}
```

**Signup page update** (`console/src/app/signup/page.tsx`): current page calls
`registerApi` (creates user on current instance). For SaaS, it must instead call
`POST /api/v1/saas/signup` → redirect to Stripe checkout. The existing self-hosted
signup flow and the SaaS signup are different paths.

**Acceptance criteria:**
- [ ] `POST /api/v1/saas/signup` with valid slug + email + plan → returns Stripe checkout URL
- [ ] Invalid slug format → 400
- [ ] Reserved slug (`www`, `admin`, etc.) → 400
- [ ] Duplicate slug (existing in `provisionings`) → 409
- [ ] Stripe `checkout.session.completed` with `event_type: saas_signup` → pg-boss job enqueued
- [ ] Stripe `customer.subscription.deleted` with `event_type: saas_subscription` → `deprovision_after` set
- [ ] Stripe retry (same `intent_id` sent twice) → second job not enqueued (`singletonKey`)
- [ ] Existing license billing events unaffected

---

### NF-OPS-06 — Deprovisioning on Churn

**Priority:** P1 | **Effort:** S | **Depends on:** NF-OPS-02 (provisionings table)

**Trigger:** `customer.subscription.deleted` → sets `deprovision_after = now() + 30 days`

**Nightly scheduled job** (pg-boss cron, 03:00 UTC on main instance):
```typescript
boss.schedule('nightly_deprovision_check', '0 3 * * *', {})
// Worker: find provisionings WHERE status='deprovisioning' AND deprovision_after < now()
// For each: DELETE Hetzner server → DELETE Cloudflare A record → mark deprovisioned
```

**Acceptance criteria:**
- [ ] Subscription cancelled → `deprovision_after = now()+30d`, customer email sent within 1 min
- [ ] Nightly job runs at 03:00 UTC — confirmed via pg-boss job log
- [ ] VPS not deleted until after `deprovision_after` — verified in test with short window
- [ ] Hetzner server deleted via API (not just powered off)
- [ ] Cloudflare A record deleted via API
- [ ] `provisionings.status = 'deprovisioned'` set after successful cleanup
- [ ] Owner can set `deprovision_after = now()` for immediate cleanup (fraud case)
- [ ] S3 backups retained for 90 days after deprovision (S3 lifecycle rule, separate from 30-day active retention)

---

### NF-OPS-07 — Automated Postgres Backups

**Priority:** P0 | **Effort:** S | **Status:** ✅ COMPLETE 2026-04-06

- [x] `scripts/backup.sh` enhanced with optional S3 upload — guarded by `BACKUP_S3_ENDPOINT`; local-only mode fully backward-compatible
- [x] `src/shared/config.ts` — added `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_BUCKET`
- [x] `src/provisioning/cloud-init.ts` — injects `BACKUP_S3_*` + `CUSTOMER_SLUG` into customer VPS `.env`; also switched LLM/embedding stack from Anthropic/OpenAI → Google/Gemini to match main instance
- [x] `src/provisioning/provision.ts` — passes S3 config from main instance `config` to cloud-init generator
- [x] Backup cron injected via cloud-init `runcmd` at 02:00 UTC daily
- [ ] Hetzner Object Storage bucket creation — deferred until Phase B (bucket costs €7.72/mo flat; not needed for smoke test)

**Cron injected via cloud-init runcmd:**
```bash
echo "0 2 * * * root docker compose -f /opt/nestfleet/docker-compose.prod.yml run --rm backup" \
  >> /etc/cron.d/nestfleet-backup
```

**docker-compose.prod.yml backup service:**
```yaml
backup:
  image: postgres:16-alpine
  entrypoint: /scripts/backup.sh
  environment:
    - PGPASSWORD=${POSTGRES_PASSWORD}
    - S3_ENDPOINT=${BACKUP_S3_ENDPOINT}
    - S3_BUCKET=nestfleet-backups
    - CUSTOMER_SLUG=${NESTFLEET_DOMAIN}
  volumes:
    - ./scripts/backup.sh:/scripts/backup.sh:ro
  networks:
    - internal
  restart: "no"
  profiles: [backup]
```

Additional `.env` vars injected at provisioning time:
```
BACKUP_S3_ENDPOINT=https://nbg1.your-objectstorage.com
BACKUP_S3_ACCESS_KEY={hetzner_object_storage_key}
BACKUP_S3_SECRET_KEY={hetzner_object_storage_secret}
```

**Acceptance criteria:**
- [ ] Backup script runs on provisioned VPS at 02:00 UTC (cron active after cloud-init)
- [ ] `s3://nestfleet-backups/{slug}/{yyyy-mm-dd}.sql.gz` present within 10 min of cron trigger
- [ ] `gunzip < backup.sql.gz | psql` restores to a clean DB (restore procedure tested manually)
- [ ] S3 lifecycle rule: files older than 30 days auto-deleted
- [ ] Backup job failure (exit ≠ 0) triggers alert — cron sends email to `MAILTO=ops@nestfleet.dev`
- [ ] Backup service is NOT in the default compose profile — only runs via `docker compose run --rm backup`

---

### NF-OPS-08 — Provisioning Test Suite

**Priority:** P0 | **Effort:** M | **Depends on:** NF-OPS-02, NF-OPS-05, NF-OPS-06

Three layers: unit (pure logic), integration (real Postgres + mocked cloud APIs), E2E staging (real Hetzner, manual/gated).

#### Layer 1 — Unit tests (`tests/unit/provisioning/`)

**Slug validation** (`slug.test.ts`):
- [ ] PV-01: Valid slug passes — `acme-corp`, `startup42`, `my-company`
- [ ] PV-02: Invalid format → rejected — uppercase, spaces, special chars, leading/trailing hyphens
- [ ] PV-03: Too short (< 3 chars) and too long (> 40 chars) → rejected
- [ ] PV-04: Reserved slug rejected — `www`, `admin`, `api`, `status`, `nestfleet`, all 20 reserved names
- [ ] PV-05: Slug at exact boundaries (3 chars, 40 chars) → accepted

**cloud-init payload generation** (`cloud-init.test.ts`):
- [ ] PV-06: Generated YAML contains `write_files` with `.env`, `docker-compose.prod.yml`, `Caddyfile.prod`, `backup.sh`
- [ ] PV-07: Generated `.env` contains all required vars — `NESTFLEET_DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `BILLING_ENABLED`, `REGISTRATION_ENABLED`, `LLM_API_KEY`, `CONSOLE_ORIGIN`
- [ ] PV-08: `BILLING_ENABLED=false` in generated `.env`
- [ ] PV-09: `REGISTRATION_ENABLED=true` in generated `.env`
- [ ] PV-10: `CONSOLE_ORIGIN` matches `https://{slug}.nestfleet.dev`
- [ ] PV-11: Org name with special characters (`O'Brien & Co`, `Müller GmbH`) does not break YAML generation
- [ ] PV-12: Two calls with same slug generate **different** `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` (secrets not reused)
- [ ] PV-13: SSH public key appears in `ssh_authorized_keys`
- [ ] PV-14: Backup cron line present in `runcmd`

**Secret generation**:
- [ ] PV-15: `postgres_password` is 32 hex chars
- [ ] PV-16: `jwt_secret` is 64 hex chars
- [ ] PV-17: `encryption_key` is 64 hex chars

#### Layer 2 — Integration tests (`tests/integration/provisioning/`)

Uses Vitest + Testcontainers (real Postgres). Hetzner and Cloudflare APIs mocked via `msw`.

**Signup intent + Stripe routing** (`stripe-routing.test.ts`):
- [ ] PI-01: `POST /api/v1/saas/signup` valid body → `signup_intents` row created, Stripe checkout URL returned
- [ ] PI-02: `POST /api/v1/saas/signup` invalid slug format → 400, no DB row
- [ ] PI-03: `POST /api/v1/saas/signup` reserved slug → 400
- [ ] PI-04: `POST /api/v1/saas/signup` duplicate slug (existing `provisionings` row) → 409
- [ ] PI-05: Stripe `checkout.session.completed` with `event_type: saas_signup` → pg-boss job enqueued, `provisionings` row status = `pending`
- [ ] PI-06: Same Stripe event sent twice (same `intent_id`) → pg-boss `singletonKey` prevents duplicate job
- [ ] PI-07: Stripe `checkout.session.completed` without `event_type: saas_signup` → existing `upsertWorkspaceBilling` path called, no provisioning job enqueued
- [ ] PI-08: Stripe `customer.subscription.deleted` with `event_type: saas_subscription` → `deprovision_after = now()+30d`, status = `deprovisioning`
- [ ] PI-09: Stripe `customer.subscription.deleted` without metadata → existing billing path, no deprovisioning

**Provisioning worker** (`provision-worker.test.ts`):
- [ ] PI-10: Happy path — mocked Hetzner returns server `{ id: 123, ip: '1.2.3.4' }`, mocked Cloudflare returns record ID, mocked health poll returns 200 → `status = 'active'`, `provisioned_at` set, welcome email sent
- [ ] PI-11: `hetzner_server_id` and `cloudflare_record_id` written to `provisionings` row after API calls
- [ ] PI-12: Hetzner API returns 500 → `status = 'failed'`, `error_message` set, ops alert email sent, welcome email NOT sent
- [ ] PI-13: Cloudflare API returns error after VPS created → Hetzner DELETE called (cleanup), `status = 'failed'`, ops alert sent
- [ ] PI-14: Health poll returns 200 on attempt 15 of 30 → `status = 'active'`, welcome email sent
- [ ] PI-15: Health poll times out (30 attempts all fail) → `status = 'failed'`, ops alert sent, Hetzner server NOT deleted (left for ops investigation)
- [ ] PI-16: Worker called twice for same `intent_id` with status `active` → second call exits early (idempotency), no duplicate VPS

**Deprovisioning scheduler** (`deprovision-worker.test.ts`):
- [ ] PI-17: Row with `status = 'deprovisioning'` and `deprovision_after` in the past → Hetzner DELETE called, Cloudflare DELETE called, `status = 'deprovisioned'`, `deprovisioned_at` set
- [ ] PI-18: Row with `status = 'deprovisioning'` and `deprovision_after` in the future → NOT processed (window still open)
- [ ] PI-19: Row with `status = 'active'` → NOT processed by deprovisioning job
- [ ] PI-20: Hetzner DELETE fails during deprovision → `status` stays `deprovisioning`, `error_message` updated, will retry on next nightly run
- [ ] PI-21: Two rows both past `deprovision_after` → both deprovisioned in same nightly run

**Owner console fleet API** (`fleet-api.test.ts`):
- [ ] PI-22: `GET /api/v1/owner/fleet` with owner role → returns list of all `provisionings` rows with status, slug, ip, plan
- [ ] PI-23: `GET /api/v1/owner/fleet` with non-owner role → 403
- [ ] PI-24: `POST /api/v1/owner/fleet/{slug}/deprovision` → sets `deprovision_after = now()`, next nightly run cleans up
- [ ] PI-25: `POST /api/v1/owner/fleet/{slug}/reset` → calls `POST api.hetzner.cloud/v1/servers/{id}/actions/reset` (mocked), returns 200

#### Layer 3 — E2E staging (manual runbook, optional CI)

Runs against real Hetzner + real Cloudflare on a `staging.nestfleet.dev` base domain.
Gated: not part of every CI run. Triggered manually before first paying customer or on
provisioning module changes.

**Runbook: `docs/testing/provisioning-e2e-runbook.md`** (created as part of this item)

- [ ] PE-01: Full provision flow — fire test Stripe event → real VPS boots in Hetzner → `acme-test.staging.nestfleet.dev` health 200 → welcome email received
- [ ] PE-02: Verify customer VPS `.env`: confirm `BILLING_ENABLED=false`, `REGISTRATION_ENABLED=true`, unique secrets
- [ ] PE-03: Verify Hetzner firewall: port scan confirms 80/443/22 open, 3001/3002/5432 closed
- [ ] PE-04: Caddy ACME: `https://acme-test.staging.nestfleet.dev` returns valid Let's Encrypt cert (not self-signed)
- [ ] PE-05: First login: navigate to instance URL, register admin account, complete setup wizard, create test case — full user flow works
- [ ] PE-06: Backup: SSH to VPS, run `docker compose run --rm backup`, confirm `.sql.gz` appears in Hetzner Object Storage
- [ ] PE-07: Power reset: owner console sends reset → VPS reboots → services restart → health 200 within 3 min
- [ ] PE-08: Deprovision: set `deprovision_after = now()`, run nightly job manually → VPS deleted in Hetzner, A record removed from Cloudflare, DNS no longer resolves
- [ ] PE-09: Teardown: confirm no orphaned VPSes or DNS records remain in staging after all tests

**Staging setup requirements:**
- Separate Hetzner project (`nestfleet-staging`) — keeps staging VPSes separate from production
- Separate Cloudflare subdomain (`*.staging.nestfleet.dev`) — staging certs don't consume production LE rate limit
- `PROVISIONING_ENABLED=true` on staging main instance only
- Test VPS auto-deleted by PE-08 teardown — no orphan cost
