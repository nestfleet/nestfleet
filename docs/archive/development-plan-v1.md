# NestFleet v1 Development Plan

## 1. Purpose

This document is the executable development plan for NestFleet v1. It translates the specification artifacts into a sequenced implementation roadmap for a solo developer, starting from an empty TypeScript project.

## 2. Starting Conditions

### 2.1 What Exists

- **15 specification documents** in `docs/` covering vision, architecture, domain model, lifecycles, policies, notifications, compliance, monetization, backlogs, and spikes.
- **PlatformCloud** (`../PlatformCloud/`) — shared cloud service with OpenAPI contracts for license validation, updates, telemetry, eval/compliance. Scaffolded, currently being tested with DocuGardener. NestFleet will consume the same contracts.
- **DocuGardener** (`../DocuGardener/`) — the first pilot product. Production-ready with extensive markdown docs that serve as the RAG corpus for product memory testing.

### 2.2 What Does Not Exist

- No domain model tables yet (Phase 2 / AE-01).
- No queue setup (SPIKE-02).
- No operator console (Phase 4).
- No license module (SPIKE-08 / AE-06).
- No email or Telegram adapters.

> **Updated 2026-03-17:** Phase 0 complete. Project scaffold, DB, OTel, test infrastructure, and health endpoint all implemented and verified.

### 2.3 Key Architectural Constraints

| Constraint | Source |
| --- | --- |
| TypeScript modular monolith | ADR-002 |
| PostgreSQL as SoR + pgvector for hybrid retrieval | ADR-003, ADR-006 |
| Queue + state-machine orchestration | ADR-004 |
| Agents are task executors, not state owners | ADR-004 |
| OIDC-compatible identity | ADR-009 |
| App-level RBAC in v1 | ADR-010 |
| OpenTelemetry from day one | ADR-011 |
| S3-compatible object storage | ADR-012 |
| Client-installed, cloud-connected | ADR-015 |
| BSL license, no free production tier | ADR-016 |
| Customer-provided LLM | ADR-017 |

### 2.4 PlatformCloud Integration

NestFleet consumes PlatformCloud via OpenAPI contracts. Key endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/license/validate` | Validate license key at startup |
| `POST /api/v1/license/generate-offline` | Generate signed offline license (admin) |
| `GET /api/v1/updates/manifest` | Check for available updates |
| `POST /api/v1/telemetry/aggregate` | Submit aggregate usage metrics (opt-in) |
| `GET /api/v1/eval/benchmarks` | Pull quality benchmarks |
| `GET /api/v1/compliance/templates` | Pull compliance template bundles |

**Note:** PlatformCloud contracts updated to `nestfleet` (license-v1.yaml and updates-v1.yaml) ✅ — done 2026-03-17.

---

## 3. Development Phases

The plan follows the three-phase approach from the delivery backlog, adapted for solo execution:

```
Phase 0: Project Bootstrap          (3-4 days)    ✅ COMPLETE — 2026-03-17
Phase 1: Spike Phase                (20-30 days)  🔄 IN PROGRESS — SPIKE-01 ✅, SPIKE-07 ✅
Phase 2: Agentic Engine (AE)        (20-30 days)  🔄 IN PROGRESS — AE-01–AE-07, AE-10 ✅
Phase 3: Feature Slices             (25-35 days)  🔄 IN PROGRESS — SLICE-01 ✅, SLICE-05 🔄
Phase 4: Integration + Polish       (10-15 days)  ⏳ pending
```

Total estimated working time: **~90-120 working days** for a solo developer. Not a calendar prediction — a scope indicator.

---

## 4. Phase 0: Project Bootstrap

**Status: ✅ COMPLETE — 2026-03-17**

**Goal:** Runnable empty project with all infrastructure decisions locked.

### P0-01: Repository Scaffolding ✅

- TypeScript 5.8, strict mode, NodeNext module resolution
- Directory structure: `src/shared`, `src/infra/db`, `src/api`, `src/domain`, `src/engine`, `src/policy`, `src/memory`, `src/notification`, `src/license`
- `.env.example` with all env vars documented and Zod-validated at startup
- Stack: Hono + @hono/node-server, Zod, postgres.js, pino, OpenTelemetry

### P0-02: Database Foundation ✅

- Hand-written SQL migrations with custom idempotent runner (`src/infra/db/migrate.ts`)
- Migration tracking table: `nestfleet_migrations`
- `migrations/0001_init.sql`: enables `vector` (pgvector) and `uuid-ossp` extensions
- `docker/docker-compose.yml`: PostgreSQL 16 + pgvector on port **5433** (avoids conflict with other local services)
- `name: nestfleet` in compose file prevents project name collision with DocuGardener
- postgres.js client with lazy-init singleton + test injection point (`setDb()`)
- `pingDb()` utility used by health endpoint

### P0-03: Observability Skeleton ✅

- OpenTelemetry SDK with auto-instrumentations; noop when `OTEL_EXPORTER_OTLP_ENDPOINT` not set
- pino structured logger with dev pretty-printing and field redaction (tokens, keys, PII)
- `GET /health` → `{ status, service, version, db, timestamp }` — 503 when DB unreachable
- Docker Compose includes Jaeger (`jaegertracing/all-in-one:latest`) on port 16686 (UI) / 4318 (OTLP)
- Global error handler in Hono maps `AppError` subclasses to correct HTTP codes

### P0-04: Test Infrastructure ✅

- `vitest.config.ts` — unit tests, no DB, mocked dependencies
- `vitest.integration.config.ts` — integration tests, testcontainers v11 (zero vulnerabilities), 60s timeout
- `tests/integration/helpers/db.ts` — spins `pgvector/pgvector:pg16` container, runs migrations, injects DB, tears down
- Colima Docker socket configured via `DOCKER_HOST` + `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` (baked into `test:integration` script)

**Results:**
- Unit tests: **20 passing** (config schema, error hierarchy)
- Integration tests: **4 passing** (health endpoint, migrations table, pgvector extension, uuid-ossp extension)
- `npm run dev` starts on :3000, logs structured JSON, migrations auto-apply on boot

---

## 5. Phase 1: Spike Phase

Spikes are sequenced by dependency. Each spike produces a decisive answer and prototype code that feeds into enablers.

### Sprint S1 (Days 1-10): Foundation Spikes

#### SPIKE-01: Product Memory Quality (3-5 days)

**What:** Prove pgvector + FTS hybrid retrieval works for DocuGardener sources.

Tasks:
1. Ingest DocuGardener markdown docs with chunking + metadata tags (product, source_type, freshness, trust_level)
2. Implement hybrid retrieval: vector similarity + FTS + metadata filter + basic reranking
3. Build 20-30 evaluation prompts (user requests, bug lookups, known-issue queries)
4. Measure citation accuracy and source-tier dominance
5. Document findings

**Decision gate:** If pgvector quality is insufficient → evaluate Weaviate (DocuGardener already uses it).

#### SPIKE-02: Queue + State-Machine Orchestration (3-5 days)

**What:** Prove the control backbone works with durable state, approvals, and restart recovery.

Tasks:
1. Implement case state machine (`new → enriching → triaged → awaiting-lead → in-resolution → resolved`)
2. Implement change request state machine (`draft → analysis → approval-pending → approved → implementation-prep → pr-drafted → completed`)
3. Wire one end-to-end flow: signal → case → triage → awaiting-lead → approval → GitHub issue sync
4. Test restart recovery (kill mid-flow, restart, verify resume)
5. Evaluate BullMQ vs Graphile Worker vs pg-boss. Recommend.

**Decision gate:** Queue technology choice locks here.

### Sprint S2 (Days 8-17): Validation + GitHub Spikes

#### SPIKE-03: Deterministic Validation Envelope (2-4 days)

**What:** Prove proposer → validator → allow/abstain pipeline catches bad replies.

Tasks:
1. Define typed proposal schema for user-request reply
2. Implement schema validation + secondary LLM validator
3. Run 20-30 test cases through the pipeline
4. Measure allow rate, abstain rate, false-allow rate

**Depends on:** SPIKE-01 (evaluation dataset, evidence packs)

#### SPIKE-04: GitHub Change Path (2-4 days)

**What:** Prove reliable branch creation, PR drafting, and issue-PR linkage.

Tasks:
1. Set up test DocuGardener fork/sandbox
2. Implement: change request → branch → PR draft with diff summary
3. Test webhook ingestion for issue/PR state mirroring
4. Document rate limit constraints

### Sprint S3 (Days 15-25): Remaining Spikes

#### SPIKE-05: Notification Noise + Escalation (1-2 days)

**What:** Simulate mixed case traffic, validate notification rules don't overwhelm.

#### SPIKE-06: Configurable Role Composition (1-2 days)

**What:** Model 3 role templates + 2 product team configs. Test enable/disable without breaking flows.

#### SPIKE-07: Identity + Approval Model (1-2 days) ✅ COMPLETE — 2026-03-17

**What:** Prototype OIDC login, lead-role mapping, approval capture, audit event generation.

#### SPIKE-08: License + Cloud Connection (1-2 days)

**What:** JWT license validator + cloud-connection client against PlatformCloud stubs.

**Depends on:** PlatformCloud contracts finalized for `nestfleet` product enum.

**Phase 1 Exit Criteria:**
- Product memory retrieval quality is proven sufficient
- Queue technology is chosen and tested
- Validation envelope works with acceptable abstain rate
- GitHub PR draft flow is technically viable
- All 8 spike findings documented in `docs/spike-findings/`

---

## 6. Phase 2: Enablers + First Slices

Enablers build the minimum skeleton. Slices deliver vertical user-visible behavior.

### Sprint S4 (Days 25-35): Architecture Enablers

#### AE-01: Domain Model + Database Schema

- All 16 MVP aggregates as TypeScript types + PostgreSQL tables
- Product, Identity, Signal, Conversation, Case, Problem, Change Request, Approval, PR Draft, Knowledge Asset, Notification, Escalation Policy, Audit Event, Validation Record, Role Template, Active Team Member
- State machine transition functions with audit event emission
- Migration scripts

#### AE-02: Flow Engine Skeleton

- Queue infrastructure (per SPIKE-02 decision)
- Task dispatcher with correlation IDs
- Worker registration pattern
- Retry + dead-letter handling
- Wait-state resume mechanism

#### AE-03: Policy Engine Skeleton

- Action tier classification (T0-T5)
- Policy check interface: `(action, context) → allow | require_approval | deny`
- Feature gate integration point (for license module)
- Audit event on every policy decision

#### AE-04: Notification Skeleton

- Notification creation, dedup, scheduling
- Email delivery adapter (SMTP)
- Priority-based quiet hours logic
- Ack tracking stub

#### AE-05: LLM Adapter

- Configurable model endpoint (OpenAI, Anthropic, Ollama)
- Typed prompt/response contract
- Token counting and truncation
- Retry with backoff
- No model call content logging (customer data stays local)

#### AE-06: License Module + Cloud Connection

- License file validator (JWT signature check at startup)
- Feature gate service
- Usage tracker (AI actions/month, local only)
- Cloud-connection client stub (PlatformCloud endpoints)
- Offline resilience (no kill switch)

### Sprint S5-S6 (Days 35-55): First Feature Slices

#### SLICE-01: Email Intake + Signal Normalization

**Vertical:** Email arrives → Signal created → Conversation linked → Case opened → Operator sees it in queue

Components:
- Email connector (IMAP polling or webhook receiver)
- Signal normalization pipeline
- Product routing
- Deduplication pre-check
- Case creation with audit event
- Basic API endpoint to list cases (operator queue)

#### SLICE-02: Case Enrichment + Triage

**Vertical:** Case is enriched with identity, context, known-issue check → Frontline produces typed summary → Steward classifies and routes

Components:
- Frontline agent worker: summarize, classify, identity hint
- Steward agent worker: severity proposal, known-issue match, route decision
- Evidence pack assembly from product memory
- Validation record for classification
- Case state transitions: `new → enriching → triaged`

#### SLICE-03: Approval Queue + Lead Routing

**Vertical:** Case needs human judgment → Approval request created → Lead gets notified → Lead approves/rejects → Case proceeds

Components:
- Approval creation with rationale and evidence
- Lead routing by case type and policy
- Notification emission for approval requests
- Approval decision capture with audit
- Case state: `triaged → awaiting-lead → (approved route)`

---

## 7. Phase 3: Remaining Slices

### Sprint S7-S8 (Days 55-75): Resolution + Change Path

#### SLICE-04: Grounded User-Request Resolution

**Vertical:** Low-risk user request → Evidence pack retrieved → Reply drafted → Validation passes → Auto-send or draft for lead

Components:
- Frontline drafts reply with evidence refs
- Validation envelope: schema check + secondary validator
- Auto-send threshold check (confidence ≥ 0.85, approved sources, validator pass)
- Draft-only fallback for failed validation
- User-facing notification with AI disclosure

#### SLICE-05: Change Management + GitHub Issue Sync

**Vertical:** Bug/outage case → Problem record → Change request → GitHub issue created and linked → Approval package

Components:
- Problem creation and case linking
- Change request draft with evidence
- GitHub issue creation and bidirectional sync
- Webhook event processing for issue state changes
- Change state: `draft → analysis → approval-pending`

#### SLICE-06: PR Draft Preparation

**Vertical:** Approved change → Implementation context assembled → PR draft created → Change Lead notified

Components:
- Repository context assembly (file structure, relevant code sections)
- Implementation outline generation
- Branch creation + PR draft via GitHub API
- Validation record for PR draft
- Change state: `approved → implementation-prep → pr-drafted → completed`

### Sprint S9 (Days 75-85): Operational Completeness

#### SLICE-07: Notification Control Plane (Full)

- All notification classes operational
- Quiet hours, dedup, escalation, retry
- Digest summaries at 09:00 and 17:00
- Escalation chain: operator → lead → secondary channel
- Notification metrics

#### SLICE-08: Knowledge Capture

- Resolution → knowledge asset candidate
- Docs update suggestion linked to case
- Knowledge Lead notification
- Known-issue registry update

#### SLICE-09: Audit + Compliance Controls

- Immutable audit events for all state transitions
- Retention controls per deployment
- DSAR-ready search and export
- AI disclosure in outbound messages
- Configurable retention windows

---

## 8. Phase 4: Integration + Polish

### Sprint S10 (Days 85-95): Operator Console + Final Integration

#### CONSOLE-01: Operator Console MVP

- React-based minimal operator console
- Views: Inbox/Queue, Case Detail, Approval Queue, Change Request, Notification Center, PR Draft Handoff
- Auth via OIDC (Keycloak as reference)
- Role-based view filtering

#### INT-01: End-to-End Integration Testing

- Full flow test: email → case → triage → resolution
- Full flow test: email → case → change → approval → PR draft
- Notification flow verification
- License validation + feature gate verification
- Restart recovery across all flows

#### INT-02: DocuGardener Pilot Setup

- Ingest full DocuGardener docs corpus
- Configure product, roles, channels, policies
- Dry-run with simulated support traffic
- Evaluate quality metrics against success criteria from `mvp-scope.md` section 9

---

## 9. Compliance Tasks (Parallel Track)

These run alongside feature work per the delivery backlog:

| ID | Task | Blocker for |
| --- | --- | --- |
| CG-01 | Privacy notice templates for AI support | Customer onboarding |
| CG-02 | AI disclosure templates per channel | SLICE-04 (auto-reply) |
| CG-03 | Retention + deletion controls | SLICE-09 |
| CG-04 | DSAR-ready search + export | SLICE-09 |
| CG-08 | Transfer map for cloud-connection metadata | Customer onboarding |
| CG-09 | Customer DPIA template pack | Customer onboarding |
| CG-12 | BSL license terms + use-policy | Before first customer |
| CG-13 | Cloud-connection data-flow docs | Before first customer |

---

## 10. Dependency Graph (Simplified)

```
Phase 0: Bootstrap
    │
    ├── SPIKE-01 (Memory) ──────┐
    ├── SPIKE-02 (Orchestration)├── SPIKE-03 (Validation) ── depends on SPIKE-01
    │                           │
    │                           ├── SPIKE-04 (GitHub)
    │                           ├── SPIKE-05 (Notifications)
    │                           ├── SPIKE-06 (Roles)
    │                           ├── SPIKE-07 (Identity)
    │                           └── SPIKE-08 (License) ── depends on PlatformCloud
    │
    ├── AE-01 (Domain/DB) ── depends on SPIKE-01, SPIKE-02
    ├── AE-02 (Flow Engine) ── depends on SPIKE-02
    ├── AE-03 (Policy) ── depends on SPIKE-03
    ├── AE-04 (Notification) ── depends on SPIKE-05
    ├── AE-05 (LLM Adapter)
    ├── AE-06 (License) ── depends on SPIKE-08
    │
    ├── SLICE-01 (Intake) ── depends on AE-01, AE-02
    ├── SLICE-02 (Triage) ── depends on SLICE-01, AE-05, Memory
    ├── SLICE-03 (Approval) ── depends on SLICE-02, AE-03, AE-04
    ├── SLICE-04 (Resolution) ── depends on SLICE-02, AE-03, Validation
    ├── SLICE-05 (Change+GitHub) ── depends on SLICE-03, SPIKE-04
    ├── SLICE-06 (PR Draft) ── depends on SLICE-05
    ├── SLICE-07 (Notifications Full) ── depends on AE-04, all slices
    ├── SLICE-08 (Knowledge) ── depends on SLICE-04
    ├── SLICE-09 (Audit) ── depends on AE-01
    │
    └── CONSOLE-01 + INT-01 + INT-02 ── depends on all slices
```

---

## 11. First Week Execution Plan

### Phase 0 — DONE ✅ (2026-03-17)

All bootstrap tasks complete. See Phase 0 section above for details.

### Phase 0 — DONE ✅ (2026-03-17)
### SPIKE-01 — DONE ✅ (2026-03-17)
### SPIKE-07 — DONE ✅ (2026-03-17)

### Phase 2 Agentic Engine — IN PROGRESS 🔄

**Completed:** AE-01 (LLM factory), AE-02 (base types + runAgent), AE-03 (tool definitions), AE-04 (pg-boss queue + dispatcher), AE-05 (agent_runs audit), AE-06 (triage agent), AE-07 (known_issue_match agent), AE-10 (change_prep agent)

**Partial:** AE-08 (auto_reply — email delivery not wired), AE-11 (pr_draft_prep — no GitHub API calls), AE-13 (LLM budget — usage table exists, enforcement not implemented)

**Pending:** AE-09 (outage_routing), AE-12 (OTel span enrichment + metrics)

### SLICE-01 — DONE ✅ (2026-03-17)
### SLICE-05 — IN PROGRESS 🔄

**Completed in SLICE-05:**
- Approval queue console page with approve/reject modals
- `POST /change-requests/:crId/approve` and `/reject` API endpoints (RBAC-gated)
- `POST /cases/:caseId/send-to-change` — creates CR, dispatches `change_prep`, transitions to `in-change`
- `POST /cases/:caseId/resolve` — transitions to `resolved` with resolution note
- Lead Review Queue console page (`/queue`) — `awaiting-lead` cases with Send to Change / Resolve actions
- Notification nodes in lineage timeline (were present in DB but invisible — bug fixed)

**Remaining in SLICE-05:**
- GitHub issue creation and bidirectional sync (needs SPIKE-04 + `GITHUB_TOKEN`)
- SLICE-06 (PR draft review handoff console page — `/cases/[caseId]/pr-draft`)
- Real email delivery (SMTP not configured — outbound replies log to stdout only)

### Next: Complete remaining SLICE-05 items, then SLICE-06

1. Wire SMTP for outbound email (AE-08 auto_reply delivery)
2. Configure GitHub token + implement issue creation in change_prep (SPIKE-04)
3. Build `/cases/[caseId]/pr-draft` console page for SLICE-06 PR draft handoff
4. Write integration tests for approve/reject/send-to-change/resolve endpoints (see test coverage gaps)

---

## 12. Open Decisions (To Resolve During Spikes)

| Decision | Resolved by | Options |
| --- | --- | --- |
| Queue technology | SPIKE-02 | BullMQ (Redis) vs Graphile Worker vs pg-boss (PostgreSQL) |
| Embedding model for product memory | SPIKE-01 | OpenAI text-embedding-3-small vs local model |
| Object storage provider for v1 | Phase 2 | MinIO vs local filesystem for dev |
| Exact OIDC provider for dev | SPIKE-07 | Keycloak vs simplified dev auth |
| React framework for console | Phase 4 | Vite + React vs Next.js |

---

## 13. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Product memory quality insufficient | Blocks SLICE-02, SLICE-04, SLICE-06 | SPIKE-01 evaluates early. Fallback: Weaviate |
| Orchestration complexity explosion | Blocks all slices | SPIKE-02 tests full lifecycle. Fallback: Temporal |
| GitHub API rate limits | Blocks SLICE-05, SLICE-06 | SPIKE-04 measures real rates. Fallback: issue-only (no PR draft) |
| Validation abstain rate too high | Weakens SLICE-04 | SPIKE-03 measures. Fallback: all replies draft-only |
| PlatformCloud not ready for NestFleet | Blocks AE-06 | SPIKE-08 uses stubs. PlatformCloud rename is a prerequisite |
| Solo developer bottleneck | Extends timeline | Strict phase gating. Ship spikes before features. |

---

## 14. Definition of Done for v1

From `mvp-scope.md` section 9 — NestFleet v1 is done when:

1. Intake and normalize real DocuGardener cases reliably
2. Auto-answer a meaningful subset of routine user requests safely
3. Prepare change work for bug and outage cases with clear approval routing
4. Produce approved PR drafts tied back to cases and change requests
5. Maintain auditability and notification discipline without manual glue work

All of the above running on a client-installed deployment with valid license, cloud connection to PlatformCloud, and zero customer data leaving the customer's infrastructure.
