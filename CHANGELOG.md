# Changelog

All notable changes to NestFleet are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.1.0] — 2026-04-05

First public release. Covers the full v1 product surface shipped during private beta.

### Core Platform

- **Cases** — unified inbox for email, chat widget, Telegram, and external webhooks
- **AI triage** — automatic severity classification, known-issue matching, outage detection
- **AI auto-reply** — configurable human-approval gates; reply with evidence from product memory
- **Change Requests** — structured workflow: draft → review → PR → merge → resolve
- **GitHub integration** — PR drafting via GitHub App; CI status mirroring (check_suite, deployment_status); webhook signature validation
- **Product memory** — RAG pipeline grounded in your docs and past resolutions (pgvector, 768-dim embeddings)
- **Role-based access control** — Owner / Admin / Support Lead / Operator roles; optional SSO/SAML
- **Multi-product** — one installation, multiple isolated product workspaces
- **Operator console** — Next.js UI for full visibility and control

### SaaS / Provisioning (FEAT-001)

- Stripe checkout → SaaS signup intent → pg-boss provisioning saga
- Hetzner CX21 VPS provisioned per customer via cloud-init (docker-compose + Caddy + auto TLS)
- Cloudflare DNS A record wired automatically (`{slug}.nestfleet.dev`)
- Health poll until VPS is live; welcome email on activation
- Bundled Google Gemini LLM + embeddings injected at provisioning time
- Deprovisioning on subscription cancellation (30-day grace → nightly pg-boss cleanup)
- Automated pg_dump backups (local + optional Hetzner Object Storage via S3-compatible API)
- Owner admin console: fleet health, revenue KPIs (MRR/ARR/churn), telemetry pipeline

### Channels (FEAT-002 / FEAT-003)

- Channels Hub UI with status cards for all 7 active channels + 5 coming-soon
- Email channel with `inReplyTo` thread deduplication
- Chat widget with SSE-based real-time delivery; per-product test harness
- External webhook ingress (`source_type: external`) with Bearer auth and JSONB identity lookup
- Outbound callback firing with 5-second AbortController timeout

### Infrastructure

- SSE operator real-time stream (`/api/v1/sse/:productId`) with operator registry
- DB connection pool headroom (max 25, 503 on exhaustion)
- Contact form rate limiter isolated per `productId:ip`
- GitHub PR merge → auto-complete CR + resolve case

### Bug Fixes (Beta Eval)

- PR draft agent: produces real code fixes instead of runbooks (BEF-14)
- Follow-up email on already-replied cases (BEF-16)
- Reopen action on Resolved cases (BEF-17)
- Cross-product lineage linking (BEF-20)
- `cases/resolve` RBAC: requires `support_lead` not `operator` (BEF-22)
- Integration test suite stability: 43/43 files passing (BEF-22)

### Tests

- 1 227 tests passing (unit + integration)
- Testcontainers-based integration suite with real PostgreSQL; no DB mocks
- E2E staging runbook for provisioning smoke test

---

[Unreleased]: https://github.com/nestfleet/nestfleet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nestfleet/nestfleet/releases/tag/v0.1.0
