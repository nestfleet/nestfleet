# NestFleet v1 Delivery Archive

> **Read-only archive.** All items in this file are fully completed as of 2026-03-20.
> Open, deferred, and pending items are tracked in [`active-backlog.md`](./active-backlog.md).

---

## 1. Purpose

This document converts the NestFleet architecture, risk analysis, compliance requirements, and MVP scope into a single executable backlog for v1 delivery. It covers feasibility spikes, architecture enablers, feature slices, validation work, and compliance tasks.

Every item traces to a source document. Nothing is here for process decoration.

v1 ends at approved PR draft. Telegram is deferred to fast-follow. Governed role improvement is deferred to post-v1.

### Source Documents

| Document | Role in this backlog |
| --- | --- |
| `docs/technical-risks-and-spikes.md` | Spike definitions, risk ranking, timeboxes |
| `docs/system-architecture.md` | Subsystem map, reference stack, runtime flows |
| `docs/architecture-decisions.md` | ADR-001 through ADR-016 |
| `docs/autonomy-and-approval-policy.md` | Action tiers, thresholds, forbidden actions, day-one policy set |
| `docs/case-and-change-lifecycle.md` | Case and change request state machines, SLA baselines, required artifacts |
| `docs/notification-model.md` | Notification classes, priorities, quiet hours, escalation, dedup, phased delivery |
| `docs/mvp-scope.md` | Delivery slices, product memory sources, operator surfaces, success criteria |
| `docs/legal-compliance-eu-germany.md` | GDPR, AI Act, security baseline, transfer map, DPIA, compliance backlog |
| `docs/domain-model.md` | 16 MVP aggregates, relationships, persona-to-flow mapping, lead routing |
| `docs/market-landscape.md` | Differentiators to protect during delivery |
| `docs/monetization-and-licensing-model.md` | Deployment model, licensing, cloud-connection channel, tier structure |

---

## 2. Delivery Strategy

### 2.0 Delivery Status

| Phase | Status | Completed |
| --- | --- | --- |
| Phase 0: Project Bootstrap | ✅ COMPLETE | 2026-03-17 |
| Phase 1: Spike Phase | ✅ COMPLETE | SPIKE-01 ✅ 2026-03-17, SPIKE-04 ✅ 2026-03-17, SPIKE-07 ✅ 2026-03-17, SPIKE-02 ✅ (via SLICE-14/15), SPIKE-03 ✅ (via SLICE-14), SPIKE-05 ✅ (via SLICE-07/08/09), SPIKE-06 ✅ (via SLICE-19/19a), SPIKE-08 ✅ (via SLICE-19b), SPIKE-09 ✅ 2026-03-19 |
| Phase 2: Agentic Engine (AE) | ✅ COMPLETE | AE-01 through AE-13 all complete 2026-03-18 |
| Phase 3: Feature Slices | ✅ COMPLETE | SLICE-01 through SLICE-26 ✅ all complete. SPIKE-09 ✅. SLICE-24 (Knowledge Capture) ✅ 2026-03-19, SLICE-25 (Telegram Transport) ✅ 2026-03-19, SLICE-26 (Slack Notification Delivery) ✅ 2026-03-19. **Next**: VAL-02 (retrieval quality, needs pilot traffic) |
| Phase 4: Integration + Polish | ✅ COMPLETE | Security hardening: SEC-04–08 ✅ (SEC-08: AES-256-GCM secrets encryption at rest, 2026-03-20). Validation: VAL-01 ✅, VAL-03 ✅, VAL-04 ✅, VAL-05 ✅, VAL-06 ✅ 2026-03-19. Compliance code: CG-01 through CG-07 ✅. Legal templates: CG-08 through CG-13 ✅ DRAFT (EN + DE for CG-10/11/12). Security remediation: 4 HIGH + 3 MEDIUM findings fixed. Test suite: ~569 unit + ~284 integration + 49 E2E = ~902 tests (adds SLICE-22/23: +33 unit, +27 integration, +11 E2E; SLICE-25/26: +13 unit). **Console WAVE-6** (Plan & Billing UX): W6-01–W6-05 ✅ 2026-03-20. **Console WAVE-7** (UX Polish & Filter Unification): W7-01–W7-08 ✅ 2026-03-20 (settings build fix, landing zoom animation, Knowledge/Analytics/Cases/Approvals/PR Drafts/Notifications UX polish + filter popovers). W6-06 ✅ 2026-03-20 (OU usage bar). **Console WAVE-4** (Operator Home Dashboard): ✅ 2026-03-22 — `GET /api/v1/products/:productId/dashboard`, KPI cards + activity feed, DEFERRED-10 closed. **PERF-01**: `audit_events_product_time_idx` ✅ 2026-03-22 (migration 0035). **Console WAVE-5** (Product Memory Ingestion UI): ✅ 2026-03-22 — `POST /memory/ingest`, Knowledge page 2-tab restructure, source list, upload slide-over, health panel, search probe, contextual help panel, 20 integration tests T-W5-01–T-W5-20. |
| **Billing & Monetisation (PlatformCloud)** | ✅ COMPLETE 2026-03-20 | Stripe suite: PC-BIL-02 (checkout) ✅, PC-BIL-03 (webhook) ✅, PC-BIL-04 (portal) ✅, PC-BIL-05 (mid-cycle upgrade) ✅, PC-BIL-07 (trial) ✅ — all tested in Stripe sandbox. cancel_at threading ✅. Stripe clover API fix ✅. PC-ARCH-01 ✅, PC-ARCH-02 ✅, PC-BIL-08 ✅, PC-BIL-09 ✅, PC-BIL-10 ✅, PC-BIL-12 ✅. NestFleet OU chain: BIL-01→06 ✅. DEFERRED-19 (CR inline edit) ✅. |

### 2.1 Phasing

Delivery proceeds in three phases:

1. **Spike phase**: answer make-or-break feasibility questions before committing to feature work. Total timebox: 16-25 days across 8 spikes.
2. **Enabler phase**: build the minimum architecture skeleton needed to start the first feature slice. Runs in parallel with late spikes where dependencies allow.
3. **Slice phase**: deliver thin vertical slices in order. Each slice produces working end-to-end behavior, not horizontal platform layers.

### 2.2 Principles

- De-risk first, polish later.
- Spikes produce decisive answers, not polished UI.
- Enablers must unlock an immediate slice. If an enabler does not unblock something in the next two weeks, defer it.
- Feature slices are vertical: each delivers user-visible behavior from intake to outcome.
- Compliance is backlog, not afterthought. Compliance tasks are sequenced alongside feature work, not batched at the end.
- v1 channel is email only. Telegram is a fast-follow after v1 stability is proven.

### 2.3 Pilot Product

First live product: **DocuGardener**. It has production-ready markdown docs (Product Specification, Software Architecture Spec, Troubleshooting guide at 683 lines, Deployment guide, FAQ, 14 feature specs, README), a Python+FastAPI backend, Next.js frontend, PostgreSQL, Redis, Weaviate, and 626+ unit tests. All docs are RAG-ready markdown.

### 2.4 Cross-Cutting Constraints

- TypeScript modular monolith (ADR-002).
- PostgreSQL as SoR (ADR-003).
- Queue + state-machine orchestration; agents as task executors, not state owners (ADR-004).
- pgvector + FTS for hybrid retrieval (ADR-006).
- Product memory is evidence infrastructure (ADR-007).
- GitHub webhooks + REST APIs; mirror state, don't outsource (ADR-008).
- OIDC-compatible identity (ADR-009).
- App-level RBAC in v1 (ADR-010).
- OpenTelemetry from day one (ADR-011).
- S3-compatible object storage (ADR-012).
- Configurable team composition is core runtime (ADR-013).
- Client-installed on customer infrastructure, cloud-connected for updates and value delivery (ADR-015). Customer configures their own LLM provider; NestFleet does not proxy model calls.
- License module + cloud-connection module as architectural components (ADR-016).

---

## 2.5 Phase 0: Project Bootstrap — ✅ COMPLETE (2026-03-17)

All bootstrap tasks delivered and verified. Highlights:

| Task | Outcome |
| --- | --- |
| TypeScript project scaffold | Hono, Zod, postgres.js, pino, OTel — strict mode, NodeNext |
| PostgreSQL 16 + pgvector | Running via Docker Compose on port 5433. `name: nestfleet` prevents project collision. |
| Migration runner | Custom idempotent runner. `0001_init.sql` enables `vector` and `uuid-ossp`. |
| OpenTelemetry | SDK with auto-instrumentation. Noop when no endpoint configured. Jaeger on port 16686. |
| Structured logger | pino with field redaction (tokens, secrets, keys, PII). |
| Health endpoint | `GET /health` returns `{ status, service, version, db, timestamp }`. 503 when DB down. |
| Error hierarchy | `AppError` base + 7 typed subclasses mapped to HTTP codes. |
| Config validation | Zod schema. Startup fails fast with clear error on bad env. |
| Unit tests | **20 passing** (config schema, error hierarchy). |
| Integration tests | **4 passing** (health, migrations table, pgvector ext, uuid-ossp ext) via testcontainers v11. |
| PlatformCloud contracts | `aegis` → `nestfleet` updated in license-v1.yaml and updates-v1.yaml. |

---

## 3. Spike Backlog

### SPIKE-01: Product Memory Quality — ✅ COMPLETE (2026-03-17)

**Spec**: `docs/product-memory-specification.md` (full governing spec)

**Hypothesis**: The full NestFleet product memory pipeline — structure-aware chunking, T1–T4 source tier model, pgvector + FTS hybrid retrieval with freshness scoring, tier-weighted reranking, conflict detection, and documentation health assessment — can reliably serve as the evidence infrastructure for safe AI persona actions across any product, not only DocuGardener.

**Why it matters**: This is the highest-risk spike because a failure here simultaneously breaks Frontline auto-reply, Steward triage, and Change context preparation. The source tier model and policy gates are also the primary mechanism preventing hallucination-grounded actions from reaching users. A system that routes to humans when evidence is poor is safe. A system that answers confidently from poor documentation is not. Source: `technical-risks-and-spikes.md` section 3.1, ADR-018, ADR-019, ADR-020, ADR-021.

**Concrete tasks**:

**Group A — Ingestion pipeline**

1. Implement the chunk metadata schema from `product-memory-specification.md` section 5 as a PostgreSQL migration. Include `embedding vector(1536)`, all metadata fields, and a GIN index for FTS.
2. Implement structure-aware chunking per `product-memory-specification.md` section 6:
   - Prose: heading-boundary split, 512-token max, 50-token overlap, section path prefix injection
   - Code: fenced block extraction, never split mid-block
   - Structured: OpenAPI/JSON/YAML → natural-language summary conversion
3. Implement tier assignment at ingestion per the source-type-to-tier mapping in section 3.2.
4. Implement freshness score computation (linear decay per section 7.1) stored at ingestion time.
5. Implement audience tagging (`public` / `internal`) at ingestion.
6. Ingest DocuGardener full corpus: Product Spec, Architecture Spec, Troubleshooting guide (683 lines), Deployment guide, FAQ, 14 feature specs, README, changelog, GitHub issues sample (filtered T3), PR descriptions sample.
7. Implement conflict detection: post-ingestion step, top-10 semantic neighbours, LLM conflict-check pass, `conflict_flag` set on both chunks, `KnowledgeConflict` record created.

**Group B — Retrieval**

8. Implement hybrid retrieval: vector similarity + FTS + mandatory metadata filters (`product_id`, `audience`) + optional filters (`tier_min`, `product_version`, `content_type`).
9. Implement scoring: `(0.7 × vector_score + 0.3 × fts_score) × freshness_score`.
10. Implement tier-weighted reranking: T1 promotion, FAQ boost for question-like queries, conflict demotion, low-freshness demotion. Output: top-5 evidence pack.
11. Implement abstain signal computation: check `insufficient_tier`, `stale_evidence`, `knowledge_conflict`, `capability_disabled`, `audience_violation` conditions.

**Group C — Documentation health assessment**

12. Implement Documentation Health Report computation per `product-memory-specification.md` section 11: all 8 dimensions, GOOD/WARN/FAIL thresholds, capability gate evaluation.
13. Run health report against DocuGardener corpus — expected: T1/FAQ GOOD, architecture GOOD, technical spec WARN or FAIL.
14. Run health report against a deliberately sparse corpus (README only) — expected: T1 FAIL, auto-reply DISABLED, PR draft DISABLED.

**Group D — Evaluation**

15. Build evaluation dataset: 30+ prompts across 6 categories:
    - user requests (T1-grounded, expected: auto-allow)
    - bug lookups (T3-grounded, expected: known-issue match only)
    - implementation context queries (T2-grounded, expected: Change persona context)
    - version-sensitive queries (expected: version filter active)
    - queries with no relevant documentation (expected: abstain `insufficient_tier`)
    - queries hitting a deliberately injected knowledge conflict (expected: abstain `knowledge_conflict`)
16. Run retrieval against evaluation dataset. Measure: T1/T2 source dominance rate, policy gate accuracy (no false-allows), abstain trigger accuracy, conflict detection rate, freshness exclusion correctness, hallucination pressure delta (with vs. without evidence pack).

**Expected deliverables**:
- Working ingestion + retrieval prototype with full metadata pipeline
- Evidence pack schema implementation
- Conflict detection implementation with test pairs
- Documentation Health Report implementation with two corpora comparison
- Scored evaluation dataset (30+ prompts with ground-truth answers)
- Written findings document in `docs/spike-findings/SPIKE-01-findings.md`

**Success criteria**:
- T1/T2 sources dominate retrieval results in ≥ 80% of queries when they exist in the corpus
- Policy gate blocks auto-reply on 100% of queries where evidence pack has no T1 source (zero false-allows)
- Abstain triggers correctly for stale evidence, conflict, and insufficient tier — validated on synthetic test cases
- Conflict detection flags contradictory T1 pairs with < 20% false-positive rate on 20-pair test set
- Documentation Health Report distinguishes DocuGardener (rich) from sparse corpus on all 8 dimensions
- Capability gates match health report state on both corpora
- Hallucination pressure drops materially (measurable delta on at least 10 evaluation prompts)

**Failure implications**:
- If T1/T3 tier separation is insufficient → reconsider tier boosting weight in reranking, add explicit source-type hard-boost
- If conflict detection FP rate > 20% → simplify to structural contradiction detection (same entity, opposite values), defer semantic conflict to post-v1
- If freshness decay is too aggressive → widen staleness windows per tier and re-evaluate
- If pgvector quality is insufficient for code-heavy or structured-doc corpora → evaluate Weaviate (DocuGardener already uses it)

**Timebox**: 5-7 days (extended from original 3-5 due to expanded scope).

**Source docs**: `product-memory-specification.md` (full), `technical-risks-and-spikes.md` 3.1, `architecture-decisions.md` ADR-006, ADR-007, ADR-018, ADR-019, ADR-020, ADR-021, `system-architecture.md` 5.8 and 5.9, `mvp-scope.md` section 6.

**Epic refs**: EPIC-03 (Product Memory & Retrieval), EPIC-04 (Deterministic Validation & Policy Engine — abstain rules).

---

### SPIKE-02: Queue + State-Machine Orchestration — ✅ CLOSED (delivered via SLICE-14, SLICE-15)

**Hypothesis**: A queue + explicit state-machine model backed by PostgreSQL as SoR can handle the full case-to-change-to-PR-draft lifecycle including wait states, approvals, quiet hours, retries, and restart recovery without excessive complexity.

**Why it matters**: This is the control backbone of the product. If orchestration cannot handle durable wait states and approval loops cleanly, every flow in NestFleet breaks. Source: `technical-risks-and-spikes.md` section 3.2.

**Concrete tasks**:

1. Implement the case state machine from `case-and-change-lifecycle.md` section 5.1: `new → enriching → triaged → awaiting-lead → in-resolution → resolved`.
2. Implement the change request state machine: `draft → analysis → approval-pending → approved → implementation-prep → pr-drafted → completed`.
3. Wire one end-to-end flow: email signal → case creation → enrichment → triage → awaiting-lead → approval → GitHub issue sync.
4. Implement durable wait states in PostgreSQL. Test restart recovery: kill the process mid-flow, restart, verify the flow resumes from the correct state.
5. Implement notification event emission at each state transition. Verify audit event correlation across the full flow.
6. Evaluate OSS queue options: Redis-backed (BullMQ or similar) vs. PostgreSQL-backed (Graphile Worker or similar). Make a recommendation per ADR-005.

**Expected deliverable**: Working end-to-end traced flow demo. Queue technology recommendation with rationale.

**Success criteria**:
- Workflow survives process restarts and resumes from the correct wait state.
- Audit events are correlated across the full flow via correlation IDs.
- Notification events fire at expected state transitions.
- Wait states (awaiting-user, awaiting-lead) resume correctly after external input.

**Failure implications**: If the chosen orchestration model becomes unmanageable, evaluate Temporal or similar workflow engines before proceeding. This would change ADR-004 and ADR-005 significantly.

**Timebox**: 3-5 days.

**Source docs**: `technical-risks-and-spikes.md` 3.2, `architecture-decisions.md` ADR-003, ADR-004, ADR-005, `case-and-change-lifecycle.md` sections 5 and 6, `system-architecture.md` 5.3 and 5.6.

**Epic refs**: EPIC-02 (Case Management & Control Plane), EPIC-01 (Intake & Signal Normalization).

---

### SPIKE-03: Deterministic Validation Envelope — ✅ CLOSED (delivered via SLICE-14 state machine guards)

**Hypothesis**: A proposer → validator → allow/abstain pipeline can catch unsupported claims in low-risk user-request replies frequently enough to be useful, without an abstain rate so high that automation becomes pointless.

**Why it matters**: This is the trust boundary of the system. Without working validation, NestFleet cannot auto-reply safely and the auto-reply threshold (confidence ≥ 0.85, approved sources only, validator pass) defined in `autonomy-and-approval-policy.md` section 8.1 is unenforceable. Source: `technical-risks-and-spikes.md` section 3.6.

**Concrete tasks**:

1. Define the typed proposal schema for a user-request reply: conversation summary, evidence refs, proposed reply text, confidence score, source tier list.
2. Implement schema validation: reject proposals missing required fields or referencing unapproved source tiers.
3. Implement a secondary validator that checks: no unsupported root-cause claims, no compensation promises, no contradictions with authoritative sources, evidence refs actually support the proposed reply.
4. Run 20-30 test cases from the SPIKE-01 evaluation dataset through the full proposer → validator → allow/abstain pipeline.
5. Measure: allow rate, abstain rate, false-allow rate (validator passed but answer was wrong), false-abstain rate (validator blocked a correct answer).

**Expected deliverable**: Working validation pipeline with scored test results. Recommended thresholds for production.

**Success criteria**:
- Unsupported claims are caught in the majority of cases where they occur.
- Abstain rate stays below 40% for the evaluation set (otherwise the feature is not useful enough).
- False-allow rate is low enough that operator trust is maintained.

**Failure implications**: If the validation envelope cannot distinguish supported from unsupported claims reliably, auto-reply must stay in draft-only mode requiring human review for all replies. This does not kill the product but significantly reduces the automation value of SLICE-04.

**Timebox**: 2-4 days.

**Source docs**: `technical-risks-and-spikes.md` 3.6, `autonomy-and-approval-policy.md` sections 6, 7, and 8.1, `domain-model.md` 4.14 (Validation Record).

**Epic refs**: EPIC-04 (Deterministic Validation & Policy Engine), EPIC-07 (Grounded User-Request Resolution).

---

### SPIKE-04: GitHub Change Path — ✅ COMPLETE (2026-03-17)

**Hypothesis**: NestFleet can reliably create a branch, prepare a PR draft package, and maintain stable issue-PR linkage for a DocuGardener repository using GitHub webhooks + REST APIs, with repo policy checks and reviewable output.

**Why it matters**: The change path is the differentiating edge that makes NestFleet more than a support-only system. If GitHub integration is too brittle, SLICE-05 and SLICE-06 cannot ship. Source: `technical-risks-and-spikes.md` section 3.4, `market-landscape.md` differentiator: GitHub-first change management.

**Concrete tasks**:

1. Set up a test DocuGardener fork or sandbox repository.
2. Implement: bug case → change request → approval (simulated) → branch creation → PR draft with diff summary.
3. Test GitHub issue creation and bidirectional linking with the change request record in PostgreSQL.
4. Test repo policy checks: branch protection, required reviewers, status checks.
5. Verify that generated PR draft output is reviewable: clear diff summary, linked issue, implementation context, validation summary.
6. Test webhook event ingestion for issue and PR state changes. Verify NestFleet mirrors state correctly per ADR-008.

**Expected deliverable**: Working PR draft flow against a real GitHub repository. Documented integration constraints and rate-limit considerations.

**Success criteria**:
- Issue and PR linkage is stable across the full flow.
- Repo policy checks (branch protection, required reviewers) are detected and respected.
- Generated output is reviewable and traceable to the originating case and change request.
- Webhook-driven state mirroring works without polling.

**Failure implications**: If GitHub integration is too brittle for reliable PR drafting, evaluate reducing v1 scope to issue sync only (no PR draft). This would weaken the product's primary differentiator.

**Timebox**: 2-4 days.

**Source docs**: `technical-risks-and-spikes.md` 3.4, `architecture-decisions.md` ADR-008, `case-and-change-lifecycle.md` section 6, `system-architecture.md` 5.12 and 8.2.

**Epic refs**: EPIC-08 (Change Management & GitHub Integration).

**Implementation summary (2026-03-17)**:
- `src/infra/github/client.ts` — thin GitHub REST client (native fetch, no Octokit): `createIssue`, `createPullRequest`, `addIssueComment`, `getRepoInfo`, `getIssue`, `getPullRequest`
- `src/infra/github/webhook-validator.ts` — HMAC-SHA256 signature validation for `X-Hub-Signature-256`
- `src/workers/change-prep-worker.ts` — creates GitHub issue after `change_prep` agent run; stores `github_issue_number` + `github_issue_url` on CR
- `src/workers/pr-draft-prep-worker.ts` — creates GitHub PR draft after `pr_draft_prep` agent run; stores `github_pr_number` + `github_pr_url` on CR
- `src/api/webhooks/github.ts` — webhook receiver with state mirroring: `pull_request.closed` (merged=true) → CR `completed` + case `resolved` + audit event; `issues.closed` → informational log
- `src/infra/db/repositories/change-requests.ts` — added `findChangeRequestByGithubIssueNumber()` and `findChangeRequestByGithubPrNumber()` lookup functions
- GitHub configuration via `product.support_policy.github_repo` (owner/repo); `GITHUB_TOKEN` in env
- **Deferred**: branch creation (agent suggests branch name; creation via git CLI is out of scope for v1 — engineers create the branch manually using the suggested name), repo policy checks (branch protection detection)

---

### SPIKE-05: Notification Noise and Escalation — ✅ CLOSED (delivered via SLICE-07, SLICE-08, SLICE-09)

**Hypothesis**: The notification model defined in `notification-model.md` produces acceptable operator load under realistic mixed traffic, with critical events breaking through reliably, normal traffic compressing into manageable volume, and deduplication working.

**Why it matters**: Operators will abandon the system quickly if notification quality is poor. Notification discipline is a differentiator per `market-landscape.md`. Source: `technical-risks-and-spikes.md` section 3.3.

**Concrete tasks**:

1. Generate a synthetic week of mixed case traffic: 5 critical, 15 high, 50 normal, 30 low cases across DocuGardener.
2. Implement the event-to-notification mapping from `notification-model.md` section 10.
3. Implement priority rules, quiet-hours suppression (20:00-08:00 + weekends), and critical bypass.
4. Implement deduplication by product_id + source_type + source_ref + kind + priority.
5. Implement basic escalation: critical → 10min ack deadline → repeat every 30min; high → 60min ack.
6. Run the synthetic traffic through the model. Measure: total notifications per day, critical breakthrough reliability, dedup suppression count, digest compression ratio.

**Expected deliverable**: Simulation results with notification volume analysis. Recommended tuning for production defaults.

**Success criteria**:
- Critical events break through 100% of the time, including during quiet hours.
- Normal and low traffic compresses into ≤2 digest windows per day.
- Duplicate suppression reduces total notification volume by ≥30% compared to naive delivery.
- Total daily operator notification count is manageable (target: ≤25 actionable notifications per day for the simulated load).

**Failure implications**: If notification noise is unacceptable, revisit priority model and digest windows before building SLICE-07. Notification is phased (Phase 1-3) specifically to allow incremental tuning.

**Timebox**: 1-2 days.

**Source docs**: `technical-risks-and-spikes.md` 3.3, `notification-model.md` sections 8-12, `domain-model.md` 4.11 and 4.12.

**Epic refs**: EPIC-06 (Notification Control Plane).

---

### SPIKE-06: Configurable Role Composition — ✅ CLOSED (delivered via SLICE-19, SLICE-19a)

**Hypothesis**: Three shipped role templates (Frontline, Steward, Change) with two per-product team configurations can be enabled and disabled without breaking flows, and policies and notifications follow role configuration correctly.

**Why it matters**: Configurable team composition is central to the product story (ADR-013). If roles cannot be toggled without breaking flows, the product cannot onboard different products with different team shapes. Source: `technical-risks-and-spikes.md` section 3.5.

**Concrete tasks**:

1. Define three role templates: Frontline, Steward, Change. Each with: responsibilities, allowed issue classes, allowed channels, tool scope, retrieval profile, notification profile, approval boundary per `domain-model.md` 4.15.
2. Define two product-scoped team configurations: (a) DocuGardener with all three roles enabled, (b) a hypothetical minimal config with only Frontline and Steward (Change disabled).
3. Test flow behavior when Change is disabled: cases that would normally enter `in-change` should route to `awaiting-lead` instead.
4. Test that notification policies and lead routing respect the active role configuration.
5. Verify no custom role-authoring system is needed for the pilot.

**Expected deliverable**: Working role template and team member configuration with two product configs. Documented flow behavior for each configuration.

**Success criteria**:
- Flows adjust cleanly to active roles without errors.
- Policies and notifications follow role configuration.
- Disabling a role does not break the state machine; it redirects to the appropriate fallback.

**Failure implications**: If role configuration is too rigid, evaluate whether v1 ships with a fixed three-role model and defers configurability. If too open-ended, add constraints before it becomes ungovernable.

**Timebox**: 1-2 days.

**Source docs**: `technical-risks-and-spikes.md` 3.5, `architecture-decisions.md` ADR-013, `system-architecture.md` 4.4 and 9, `domain-model.md` 4.15 and 4.16.

**Epic refs**: EPIC-09 (Configurable Role Templates & Team Composition).

---

### SPIKE-07: Identity and Approval Model — ✅ COMPLETE (2026-03-17)

**Hypothesis**: An OIDC-compatible identity boundary with app-level RBAC can support login, lead-role mapping, approval request, approval action, and audit event generation, with one user holding multiple lead roles and approval history queryable.

**Why it matters**: NestFleet is a governed operations product, not a casual bot. Identity and RBAC must work before any approval-gated flow can ship. Source: `technical-risks-and-spikes.md` section 3.7.

**Concrete tasks**:

1. Set up a minimal OIDC-compatible identity provider (Keycloak reference per ADR-009, or equivalent).
2. Implement login flow and session management.
3. Implement lead-role mapping: one user → multiple roles (Support Lead + Change Lead + Product Lead).
4. Implement approval request creation with typed schema per `domain-model.md` 4.8.
5. Implement approval action (approve/reject with rationale) and audit event emission.
6. Query approval history by user, role, target entity, and time range.

**Expected deliverable**: Working identity + approval prototype. Documented OIDC integration pattern for the monolith.

**Success criteria**:
- One user can hold multiple lead roles simultaneously.
- Approval history is queryable and unambiguous.
- Audit events trace every approval action to the authenticated identity and role.

**Failure implications**: If OIDC integration is too complex for v1 timebox, evaluate a simpler JWT-based auth with manual role assignment as a stepping stone, with OIDC migration planned for production hardening.

**Timebox**: 1-2 days.

**Source docs**: `technical-risks-and-spikes.md` 3.7, `architecture-decisions.md` ADR-009 and ADR-010, `domain-model.md` 4.2, 4.8, and 4.13.

**Epic refs**: EPIC-12 (Identity & Access Control), EPIC-05 (Approval & Lead Routing).

---

### SPIKE-08: License and Cloud-Connection Channel — ✅ CLOSED (delivered via SLICE-19b)

**Hypothesis**: The license module and cloud-connection update channel can operate without introducing operational friction or customer-facing complexity.

**Why it matters**: The client-installed deployment model depends on a license module for feature gating and a cloud-connection channel for delivering updates, evaluation benchmarks, compliance templates, role improvements, and security patches. If these components introduce startup delays, confusing error states, or blocking failures, customer onboarding and retention suffer. Source: `technical-risks-and-spikes.md` section 3.8, `monetization-and-licensing-model.md`.

**Concrete tasks**:

1. Implement a JWT license validator that reads a signed license file at startup and exposes tier, feature flags, and expiry to the application.
2. Implement a cloud-connection client that fetches a mock update manifest from a stub NestFleet Cloud endpoint.
3. Test startup behavior with a valid license: instant startup, correct feature gates applied.
4. Test startup behavior with an expired license: product starts, update channel is disabled, operator console displays expiry banner, all local features continue to operate.
5. Test startup behavior with a missing license: product refuses to start in production mode, provides clear error message with remediation steps.
6. Test offline resilience: cloud-connection failure does not block product operation. Product continues running with last-known configuration.
7. Test feature gating: tier-restricted features are correctly enabled or disabled based on the license file contents.

**Expected deliverable**: Working license validator and cloud-connection client prototype. Documented startup behavior matrix for valid, expired, missing, and offline scenarios.

**Success criteria**:
- Startup with a valid license completes with no added latency from license validation.
- Expired license results in graceful degradation: product runs, updates stop, operator is informed.
- Missing license blocks production startup with a clear, actionable error.
- Cloud-connection failure does not block or degrade any local product functionality.
- Feature gating correctly reflects the tier encoded in the license file.

**Failure implications**: If license validation introduces perceptible startup delay or confusing error states, simplify to a static license file check with no cloud validation at startup. If cloud-connection resilience is poor, implement a fully offline-first model where the cloud connection is a background sync, never a blocking dependency.

**Timebox**: 1-2 days.

**Source docs**: `monetization-and-licensing-model.md` sections 5 and 10, `architecture-decisions.md` ADR-016, `technical-risks-and-spikes.md` 3.8.

**Epic refs**: EPIC-13 (License & Cloud Connection).

---

### SPIKE-09: Analytics and Operator Dashboard

**Hypothesis**: A single analytics dashboard drawing from existing PostgreSQL tables (cases, change_requests, audit_events, notifications, agent_runs) can provide operators with the essential KPIs to understand system health, agent performance, and support quality — without a separate analytics database or data pipeline.

**Why it matters**: Operators and product leads need a feedback loop to evaluate whether NestFleet is actually reducing support load, improving change quality, and routing correctly. Without observable KPIs, there is no way to tune thresholds, justify the product, or satisfy customer reporting requirements. The market differentiator (`market-landscape.md`) includes demonstrable reduction in support-to-resolution time — that needs a dashboard.

**Concrete tasks**:

1. Identify the full set of meaningful KPIs from existing data (see candidate list below).
2. Evaluate whether PostgreSQL window functions + CTEs are sufficient for all KPI queries, or whether materialized views / background aggregation are needed for performance.
3. Prototype queries for the top 10 KPIs against the DocuGardener pilot dataset.
4. Design the dashboard layout: decide on time-window controls (7d / 30d / 90d), per-product scoping, and drill-down depth.
5. Assess whether KPIs should be served via dedicated API endpoints or a generic query layer.
6. Define refresh strategy: live queries vs. cached/pre-aggregated (pg cron or pg_boss periodic job).

**Candidate KPIs** (placeholder — to be refined during spike):

*Volume & throughput*
- Cases opened / resolved / in-flight per period
- Change requests created / approved / rejected / completed per period
- Mean time to triage (signal received → case created)
- Mean time to resolution (case created → resolved)
- Mean time to approval (CR created → approved/rejected)
- Mean time to PR draft (CR approved → pr-drafted)

*Agent performance*
- Agent run count by action type, outcome (success / failed / abstained)
- Mean agent duration by action type
- Token consumption by action type (input / output / cost estimate)
- Abstain rate by action type and reason
- Confidence score distribution by action type

*Quality signals*
- Approval rate (approved vs. rejected change requests)
- Risk level distribution of change requests (low / medium / high / critical)
- PR draft acceptance rate (pr-drafted → completed vs. abandoned)
- Re-triage rate (cases that generated a new signal after resolution)

*Notification health*
- Notification send success rate by channel
- Notification acknowledgement rate
- Escalation trigger count

*System health*
- DLQ depth (jobs that failed and were not retried)
- GitHub API error rate (issue/PR creation failures)

**Expected deliverable**: Spike report with confirmed query patterns, performance characterisation against 10k+ rows, dashboard wireframe, and a recommended implementation path (dedicated endpoints vs. generic query layer, live vs. cached).

**Success criteria**:
- All top-10 KPIs return in < 200ms against the pilot dataset.
- Dashboard layout covers volume, agent performance, and quality signals in a single view.
- Drill-down to individual cases/CRs is possible from summary metrics.
- No separate analytics database required for v1.

**Failure implications**: If query performance is unacceptable at scale, fall back to a background aggregation job (pg_boss cron) that pre-computes daily/hourly summary rows into a `nestfleet_analytics_snapshots` table. This is acceptable for v1 but adds schema + migration work.

**Timebox**: 2-3 days.

**Source docs**: `domain-model.md` aggregates 4.1-4.16, `case-and-change-lifecycle.md` SLA baselines, `system-architecture.md` 5.5 (audit trail), `mvp-scope.md` success criteria.

**Epic refs**: EPIC-14 (Operator Analytics — new).

---

## 4. Architecture Enablers

These enablers are the minimum skeleton needed to begin SLICE-01 after the spike phase. Each enabler must unlock something in the next two weeks or it is deferred.

### AE-01: Control-Plane Skeleton

**What**: TypeScript modular monolith project scaffold with internal module boundaries for the core subsystems defined in `system-architecture.md` section 5.

**Why now**: Every spike produces prototype code. Without a shared project structure, spike outputs cannot compose into slice work. Required before SLICE-01.

**Includes**:
- Project init: TypeScript, Node.js runtime, package structure.
- Module boundaries for: Channel Connectors, Ingress Pipeline, Case Control Plane, Policy Engine, Agent Flow Engine, Approval Service, Notification Service, Change Service, Audit.
- Shared types for domain aggregates from `domain-model.md` sections 4.1-4.16.
- OpenTelemetry instrumentation skeleton per ADR-011.
- Environment config pattern (dev/staging/production separation per `legal-compliance-eu-germany.md` section 8.1).

**Does not include**: UI, full implementations, deployment automation.

**Unlocks**: SLICE-01, SLICE-02, and integration of all spike outputs.

**Epic refs**: EPIC-02 (Case Management & Control Plane).

---

### AE-02: PostgreSQL Domain Model Skeleton

**What**: Database schema for the 16 MVP aggregates defined in `domain-model.md`, with pgvector extension enabled and FTS indexes for product memory.

**Why now**: Spikes 01 and 02 both need PostgreSQL. Without a shared schema, spike outputs will diverge. Required before SLICE-01.

**Includes**:
- Tables for: Product, Identity, Signal, Conversation, Case, Problem, Change Request, Approval, PR Draft, Knowledge Asset, Notification, Escalation Policy, Audit Event, Validation Record, Role Template, Active Team Member.
- pgvector extension and embedding column on product memory content table.
- FTS indexes on product memory content.
- Case state machine and change request state machine as enum types.
- Foreign key relationships per `domain-model.md` section 5.
- Migration framework (up/down scripts).

**Does not include**: Role Profile Version and Role Improvement Candidate tables (deferred per ADR-014). Seed data beyond test fixtures.

**Unlocks**: SPIKE-01 output integration, SPIKE-02 output integration, SLICE-01, SLICE-02, SLICE-03.

**Epic refs**: EPIC-02, EPIC-03.

---

### AE-03: Product Memory Ingestion Skeleton

**What**: Minimal ingestion pipeline that can load DocuGardener markdown sources into the product memory store with chunking, metadata tagging, and embedding generation.

**Why now**: SPIKE-01 will produce ingestion prototype code. This enabler promotes it to a reusable pipeline for SLICE-03. Required before SLICE-03.

**Includes**:
- Markdown file loader with chunking strategy.
- Metadata tagging: product_id, source_type (docs/faq/issue/pr/release_notes/known_issue/case_history), freshness timestamp, trust level.
- Embedding generation via configurable model endpoint.
- Storage into PostgreSQL with pgvector + FTS indexes.
- Source registration: record which sources are approved for a product.

**Does not include**: GitHub issue/PR ingestion (that is SLICE-03 scope), automated refresh scheduling, UI for source management.

**Unlocks**: SLICE-03, SLICE-04.

**Epic refs**: EPIC-03 (Product Memory & Retrieval).

---

### AE-04: Email Channel Connector Skeleton

**What**: Minimal inbound email connector that receives email, normalizes it into Signal records, and pushes into the ingress pipeline.

**Why now**: v1 channel is email. Without an email connector, no intake flow works. Required before SLICE-01.

**Includes**:
- Email reception (IMAP polling or webhook from email provider).
- Signal normalization: extract sender identity hints, subject, body, thread references.
- Push normalized signal into the ingress pipeline.
- Idempotent signal creation (dedup by message-id).

**Does not include**: Telegram connector (deferred), outbound email sending (SLICE-04 scope), rich attachment processing.

**Unlocks**: SLICE-01.

**Epic refs**: EPIC-01 (Intake & Signal Normalization).

---

### AE-05: Queue and Worker Skeleton

**What**: Job queue infrastructure based on SPIKE-02 recommendation (Redis-backed or PG-backed), with the adapter boundary required by ADR-005.

**Why now**: Every flow in the system dispatches work through the queue. Required before SLICE-01.

**Includes**:
- Queue adapter interface: enqueue, dequeue, retry, dead-letter.
- One concrete implementation based on SPIKE-02 outcome.
- Worker registration pattern for agent tasks.
- Correlation ID propagation into queue payloads.
- Restart recovery: jobs survive process restart.

**Does not include**: Advanced scheduling (quiet hours defer is SLICE-07 scope), multi-queue partitioning, scaling configuration.

**Unlocks**: SLICE-01, SLICE-02, all subsequent slices.

**Epic refs**: EPIC-02 (Case Management & Control Plane).

---

### AE-06: License Module and Cloud Connection Skeleton

**What**: License validation, feature gating, usage tracking, and cloud-connection client infrastructure based on SPIKE-08 findings.

**Why now**: The client-installed deployment model requires feature gating and usage tracking from the first production installation. Without the license module, tier-based feature enforcement cannot work. Without the cloud-connection client, update delivery, evaluation benchmarks, and compliance templates cannot reach the customer installation. Required before any tier-gated feature ships and before customer onboarding.

**Includes**:
- License file validator: read signed JWT at startup, expose tier, feature flags, expiry, and customer ID to the application.
- Feature gate service: check tier before enabling gated features. Centralized gate check, not scattered through business logic.
- Usage tracker: count AI actions per month, active products, and other metered values. Local storage only, no phone-home. Usage data is available for the cloud-connection metadata payload.
- Cloud-connection client stub: connect to NestFleet Cloud for update manifests, evaluation benchmarks, compliance template feeds, role template updates, and security advisories. Transmits only license ID, version, aggregate usage counts, error type codes, and feature flags in use. Transmits zero customer data.
- Offline resilience: cloud-connection failure never blocks local product operation.

**Does not include**: Full update application logic (that is a post-v1 operational concern), billing integration, license provisioning UI, NestFleet Cloud server implementation.

**Unlocks**: Tier-based feature enforcement across all slices, update delivery channel, trial mode for customer evaluation, usage-based metering for future billing.

**Epic refs**: EPIC-13 (License & Cloud Connection).

---

## 4b. Phase 2: Agentic Engine Stories

These stories build the core agentic engine described in `docs/phase2-agentic-engine-design.md`. All depend on Phase 0 (complete) and SPIKE-01 (complete). See design doc for dependency graph and AE-01–AE-13 story breakdown.

**Design document:** `docs/phase2-agentic-engine-design.md`
**Status:** 🔄 IN PROGRESS (2026-03-17)

| Story | Status | Notes |
| --- | --- | --- |
| AE-01: LLM Provider Factory | ✅ COMPLETE | Vercel AI SDK, `getLlmProvider()` factory in `src/agents/llm-provider.ts` |
| AE-02: Agent Base Types + runAgent() | ✅ COMPLETE | `AgentFn`, `AgentResult`, `runAgent()`, sanitizer in `src/agents/` |
| AE-03: Tool Definitions | ✅ COMPLETE | All read-only tools in `src/agents/tools/`, `TOOL_SETS_BY_ACTION_TYPE` |
| AE-04: pg-boss Queue + Dispatcher | ✅ COMPLETE | `AgentDispatcher`, `AbstractAgentWorker`, per-action queues |
| AE-05: agent_runs + writeAgentRun() | ✅ COMPLETE | Migration `0006_agent_runs.sql`, `writeAgentRun()` in `src/agents/audit.ts`. **Bug fixed 2026-03-17: `::uuid` cast on ULID-prefixed TEXT columns caused silent write failures** |
| AE-06: triage agent | ✅ COMPLETE | `src/agents/workers/triage.ts`, `enriching → triaged` transition |
| AE-07: known_issue_match agent | ✅ COMPLETE | `src/agents/workers/known-issue-match.ts`, graceful capability_disabled path |
| AE-08: auto_reply agent | ✅ COMPLETE | Agent + worker + validation envelope + customer reply email via SMTP/Postmark/Resend (2026-03-18) |
| AE-09: outage_routing agent | ✅ COMPLETE | `src/agents/impl/outage-routing.ts` — full implementation, 172 lines, runAgent() wired (2026-03-18) |
| AE-10: change_prep agent | ✅ COMPLETE | `src/agents/workers/change-prep.ts`, `draft → analysis` transition |
| AE-11: pr_draft_prep agent | ✅ COMPLETE | Agent + worker + GitHub PR draft creation wired via SPIKE-04 (2026-03-18) |
| AE-12: OTel span enrichment + metrics | ✅ COMPLETE | `src/agents/metrics.ts` instruments + `recordAgentRun()` called in worker base class `finally` block; span attributes set on every job (2026-03-18) |
| AE-13: Per-product LLM budget | ✅ COMPLETE | `checkBudget()` in `src/agents/budget.ts`; wired in `dispatcher.ts` — hard limit throws `TokenBudgetError` (429), soft limit logs warning (2026-03-18) |

---

### AE-01 (Phase 2): LLM Provider Factory

**Size:** S | **Parallel:** Start immediately

**What**: Install Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider`). Implement `getLlmProvider(config: Config): LanguageModelV1` in `src/agents/llm-provider.ts`. Factory maps `LLM_PROVIDER` config value to the correct adapter. Smoke test: `generateText()` against configured Gemini endpoint.

**Why now**: All subsequent agent stories depend on this factory. Zero agent code imports a provider SDK directly — only the factory.

**Unlocks**: AE-02.

**ADR refs**: ADR-022 (Vercel AI SDK), ADR-017 (customer-provided LLM).

---

### AE-02 (Phase 2): Agent Base Types and runAgent() Wrapper

**Size:** S | **Parallel:** After AE-01

**What**: Define `AgentFn<TInput, TOutput>`, `AgentResult<TOutput>`, `TokenUsage`, and `AgentError` hierarchy (`StructuredOutputError`, `TokenBudgetError`, `LlmTimeoutError`, `PolicyViolationError`) in `src/agents/types.ts`. Implement `sanitizeUserContent(text): string` in `src/agents/sanitize.ts` (strips XML/HTML tags). Implement `runAgent()` wrapper that calls the AI SDK, catches typed errors, and returns `AgentResult`.

**Why now**: All agent implementations and the worker pattern depend on these shared types and the wrapper.

**Unlocks**: AE-03, AE-04, AE-05.

**ADR refs**: ADR-023 (agent as pure function), ADR-027 (prompt injection defense).

---

### AE-03 (Phase 2): Tool Definitions and TOOL_SETS_BY_ACTION_TYPE

**Size:** M | **Parallel:** After AE-02

**What**: Implement all read-only tool definitions in `src/agents/tools/` using AI SDK `tool()` with Zod input schemas. Tools: `lookupFaq`, `lookupKnownIssue`, `lookupSeverityPolicy`, `searchSimilarCases`, `lookupSpec`, `lookupArchitecture`, `lookupChangelog`, `lookupChangeRequest`, `lookupGithubContext`, `lookupRunbook`, `lookupTeamRouting`. Define `TOOL_SETS_BY_ACTION_TYPE` compile-time constant in `src/agents/tool-sets.ts`. Every tool enforces `WHERE product_id = $authoritative_id`.

**Why now**: Agent implementations (AE-06+) need tool sets. Static definition enables compile-time dispatch validation.

**Unlocks**: AE-06, AE-07 (parallel with AE-04).

**ADR refs**: ADR-024 (static tool sets), ADR-004 (agents are not state owners).

---

### AE-04 (Phase 2): pg-boss Queue, Dispatcher, Worker Pattern

**Size:** M | **Parallel:** After AE-02

**What**: Install `pg-boss`. Implement `AgentDispatcher` (enqueues jobs; validates action type against `TOOL_SETS_BY_ACTION_TYPE`; enforces per-product concurrency limits). Implement worker registration pattern with `AbstractAgentWorker` base. Configure queues per action type (concurrency, retry limit, retry delay per design doc table). Dead-letter → operator notification + `nestfleet_agent_dlq` log. Singleton key deduplication: `{actionType}:{caseId}`.

**Why now**: All agent invocations go through the queue. Required before first agent implementation.

**Unlocks**: AE-06, AE-07 (parallel with AE-03).

**ADR refs**: ADR-025 (pg-boss), ADR-004.

---

### AE-05 (Phase 2): agent_runs Migration and writeAgentRun()

**Size:** S | **Parallel:** After AE-02

**What**: Migration `0006_agent_runs.sql` creates the `agent_runs` table (schema in design doc section 3). Implement `writeAgentRun(run: AgentRunRecord): Promise<void>` in `src/agents/audit.ts`. Function writes immutable record atomically; updates `product_llm_usage` rolling counters in same transaction. `output_snapshot` stored as JSONB.

**Why now**: Workers must write audit records. Required before first agent goes into production.

**Unlocks**: AE-06, AE-07.

**ADR refs**: ADR-026 (audit trail schema), ADR-028 (token budget enforcement).

---

### AE-06 (Phase 2): `triage` Agent

**Size:** M | **Parallel:** After AE-03, AE-04, AE-05

**What**: First full agent implementation. Workflow: retrieve (T2 min, severity policy source types) → abstain check → `generateObject({ schema: TriageOutputSchema })` → post-validate (severity:critical requires confidence ≥ 0.75) → `writeAgentRun()` → transition case `enriching → triaged`. Token budget: 6K in / 800 out. Persona: Steward.

**Critical safeguard**: `severity: "critical"` with `confidenceScore < 0.75` → worker rejects, routes to Support Lead.

**Unlocks**: AE-08, AE-10.

**ADR refs**: ADR-023, ADR-024, ADR-027, ADR-029 (not applicable to triage — outage only).

---

### AE-07 (Phase 2): `known_issue_match` Agent

**Size:** M | **Parallel:** With AE-06

**What**: Workflow: retrieve (known_issues, github_issue_filtered sources) → if abstain (capability_disabled): proceed without match, no LLM call → `generateObject({ schema: KnownIssueMatchOutputSchema })` → if confidence ≥ 0.80: write match to case_enrichments. Token budget: 5K in / 600 out. Persona: Steward.

**Note**: DocuGardener corpus triggers `capability_disabled` abstain here (no `known_issues` source) — this is expected and handled gracefully.

**Unlocks**: AE-08 (parallel with AE-06).

**ADR refs**: ADR-023, ADR-024.

---

### AE-08 (Phase 2): `auto_reply` Agent

**Size:** M | **Parallel:** After AE-06

**What**: Workflow: retrieve (public audience, T1 min) → abstain check → `generateObject({ schema: AutoReplyOutputSchema })` → post-validate (confidence ≥ 0.85, forbidden phrase check: legal/compensation/root-cause) → write draft_reply → notify Support Lead. Token budget: 8K in / 1K out. Persona: Frontline.

**Failure modes**: abstain → route to Support Lead (no LLM call). confidence < 0.85 → draft created, auto-send blocked. Forbidden phrase → draft rejected.

**Unlocks**: (no direct dependency — feeds SLICE-04).

**ADR refs**: ADR-023, ADR-024, ADR-027.

---

### AE-09 (Phase 2): `outage_routing` Agent

**Size:** M | **Parallel:** With AE-08

**What**: Workflow: retrieve (T1 min, runbook + team routing sources) → abstain check → `generateObject({ schema: OutageRoutingOutputSchema })` → write routing decision → dispatch critical notifications. Token budget: 6K in / 800 out. P95 target: 12s. Persona: Steward.

**Critical fallback (ADR-029)**: On LLM failure OR abstain → immediately escalate to all leads via critical notification. Quiet-hours bypass mandatory.

**Unlocks**: (no direct dependency — feeds SLICE-04 outage path).

**ADR refs**: ADR-023, ADR-024, ADR-029.

---

### AE-10 (Phase 2): `change_prep` Agent

**Size:** L | **Parallel:** After AE-06 (requires change domain model)

**What**: Workflow: retrieve (technical_spec, architecture_overview, api_docs) → if abstain: route to Change Lead → `generateObject({ schema: ChangePrepOutputSchema })` → write change_analysis → transition change `draft → analysis`. Token budget: 10K in / 2K out. Persona: Change.

**Output includes**: `affectedComponents[]`, `affectedDocSections[]`, `implementationConsiderations`, `testingNotes`, `missingContextAreas[]` (non-blocking gaps).

**Unlocks**: AE-11.

**ADR refs**: ADR-023, ADR-024.

---

### AE-11 (Phase 2): `pr_draft_prep` Agent

**Size:** L | **Parallel:** After AE-10 + SPIKE-04 (GitHub)

**What**: Pre-condition hard gate: change request must be in `approved` state. Workflow: retrieve (change request context, GitHub context, spec) → `generateObject({ schema: PrDraftPrepOutputSchema })` → post-validate (regex strip credential patterns from `prBody`) → write PR draft → GitHub PR creation API call. Token budget: 12K in / 3K out. Persona: Change.

**Note**: GitHub PR creation retried independently; agent run = `success` even if GitHub call fails.

**Unlocks**: SLICE-06.

**ADR refs**: ADR-023, ADR-024, ADR-027.

---

### AE-12 (Phase 2): Agent Observability — Metrics and Span Enrichment

**Size:** S | **Parallel:** With AE-06 through AE-11

**What**: Implement OTel span enrichment for all agent jobs: `agent.run.{action_type}` parent span with child spans `agent.retrieval`, `agent.policy_check`, `agent.llm_call`, `agent.output_validation`, `agent.write`. Span attributes per design doc section 8. Implement metrics: `nestfleet.agent.run.count`, `nestfleet.agent.run.duration_ms`, `nestfleet.agent.tokens.input/output`, `nestfleet.agent.abstain.count`, `nestfleet.agent.dlq.count`.

**Unlocks**: Operational dashboards, SLO alerting.

**ADR refs**: ADR-011 (OTel).

---

### AE-13 (Phase 2): Per-Product LLM Budget Enforcement

**Size:** S | **Parallel:** With AE-06 through AE-11

**What**: Migration `0007_llm_budget.sql` creates `product_llm_usage` table (rolling monthly totals per product, action type, model). Implement `checkTokenBudget(productId, actionType): Promise<BudgetStatus>` called at dispatch time. Soft limit → `budget_hold` product status + operator notification. Hard limit → job rejected. Pre-call input token estimate (rough: `length/4`) → `TokenBudgetError` if over limit.

**Unlocks**: Per-product cost isolation, usage metering for future billing.

**ADR refs**: ADR-028 (token budget enforcement).

---

## 5. Feature Slice Backlog

### SLICE-01: Intake and Signal Normalization — ✅ COMPLETE (2026-03-17)

**Goal**: A real email to DocuGardener support creates a Signal, links or creates a Conversation, and creates a Case visible in a minimal operator queue.

**Included items**:
- Email connector receives inbound email and creates a Signal record (AE-04).
- Ingress pipeline validates signal schema, extracts identity hints, routes to DocuGardener product.
- Deduplication pre-check by message-id and thread reference.
- Case creation: `new → enriching` transition with Frontline persona scheduling.
- Frontline agent worker: summarize signal, propose case type and severity hint.
- Minimal operator queue view: list of cases with status, type, severity, timestamp.
- Audit event on signal creation and case creation.
- Basic notification: new case alert to operator (email delivery).

**Excluded items**: Telegram connector, outbound replies, product memory retrieval, approval workflow, GitHub integration, quiet hours, escalation.

**Entry criteria**: AE-01 through AE-05 complete. SPIKE-02 recommendation adopted.

**Exit criteria**:
- Real email creates a case visible in operator queue.
- Case has correct product routing, type proposal, severity hint, and conversation link.
- Audit events exist for signal and case creation.
- Operator receives new-case notification.

**Epic refs**: EPIC-01, EPIC-02, EPIC-11 (Operator Console, minimal).

---

### SLICE-02: Case Creation and Operator Queue — ✅ COMPLETE (2026-03-18)

**Implementation summary (2026-03-18)**:
- `GET /products/:productId/cases` — `?status=` and `?severity=` filters already present; confirmed working
- `GET /products/:productId/cases/:caseId/conversation` — returns all signals linked to the case as a chronological message thread
- `POST /products/:productId/cases/:caseId/draft-clarification` — transitions `enriching → awaiting-user`, stubs clarification question, emits `case.clarification_drafted` audit event
- `POST /products/:productId/cases/:caseId/triage-manual` — transitions `enriching → triaged` with type, severity, and summary artifacts stored in `triage_output`, emits `case.triaged` audit event
- `POST /products/:productId/cases/:caseId/signal-received` — transitions `awaiting-user → enriching`, emits `case.signal_received` audit event (wired to inbound signal ingress)
- `POST /internal/send-reminders` — queries stale `awaiting-user` cases older than `threshold_hours` (default 24h), emits `stale_case_alert` notifications to `support_lead`
- `findSignalsByCaseId()` added to signals repository — returns all signals for a case ordered by `received_at ASC`
- Console: conversation thread panel added to case detail page (`/cases/[caseId]`) — shows when >1 message, collapsible, inbound/outbound styling
- Console: `getCaseConversationApi()` + `ConversationMessage` interface added to `api.ts`
- Console: Status and Severity filter dropdowns already present in `cases/page.tsx`

**Goal**: Operator can view case detail, see conversation history, and the case progresses through enrichment and triage states with Frontline and Steward persona work.

**Included items**:
- Case detail view: conversation thread, evidence pack, case metadata, status history.
- Frontline: clarification question generation when information is missing. Outbound email for clarification.
- `enriching → awaiting-user` transition when clarification is sent.
- `awaiting-user → enriching` transition when user replies.
- Steward agent worker: classify case type, confirm severity, run duplicate/known-issue check (basic, without full product memory — text matching only).
- `enriching → triaged` transition with required artifacts per `case-and-change-lifecycle.md` section 9.1.
- Policy engine: basic action tier checks (T0 read-only tasks are automatic).
- Operator queue filters: by status, severity, type.
- Reminder notifications: `awaiting-user` reminders at 24h and 72h per `case-and-change-lifecycle.md` section 8.2.

**Excluded items**: Product memory retrieval, auto-reply, change workflow, approval workflow, GitHub integration, quiet hours, digest.

**Entry criteria**: SLICE-01 complete.

**Exit criteria**:
- Case progresses through `new → enriching → awaiting-user → enriching → triaged`.
- Operator can view full case detail with conversation history.
- Clarification emails are sent and inbound replies are linked.
- Duplicate/known-issue check runs at triage.
- Reminders fire for stale `awaiting-user` cases.

**Epic refs**: EPIC-01, EPIC-02, EPIC-04 (basic policy), EPIC-11.

---

### SLICE-03: Product Memory Ingestion and Retrieval — ✅ COMPLETE (2026-03-18)

**Goal**: DocuGardener's trusted sources are ingested into product memory, and agent workers can request evidence packs with citations for their tasks.

**Included items**:
- Ingest DocuGardener sources via AE-03: markdown docs, FAQ, README, feature specs, troubleshooting guide.
- Ingest GitHub issues and PR metadata for DocuGardener via GitHub REST API.
- Source registration: mark which sources are approved per product.
- Hybrid retrieval service: pgvector similarity + PostgreSQL FTS + metadata filtering + basic reranking.
- Evidence pack assembly: memory pack with source IDs, freshness, trust level, citation text.
- Task-specific retrieval profiles: Frontline retrieval (docs, FAQ, known issues), Steward retrieval (issues, case history), Change retrieval (code context, PR metadata).
- Integration with Steward: known-issue check now uses product memory instead of basic text matching.
- Source freshness tracking and stale-source warnings.

**Excluded items**: Automated refresh scheduling, ingestion UI, release notes ingestion (manual process for v1), approved case history ingestion (no resolved cases yet).

**Entry criteria**: SPIKE-01 findings adopted. AE-03 complete. SLICE-02 complete (so cases exist to test against).

**Exit criteria**:
- DocuGardener sources are ingested and retrievable.
- Evidence packs include citations with source IDs and trust levels.
- Known-issue matching uses product memory and outperforms basic text matching.
- Retrieval quality meets SPIKE-01 success criteria on the evaluation dataset.

**Epic refs**: EPIC-03 (Product Memory & Retrieval).

---

### SLICE-04: Low-Risk User-Request Response — ✅ COMPLETE (2026-03-18)

**Goal**: NestFleet can draft and (when thresholds are met) auto-send grounded replies to routine DocuGardener user requests.

**Included items**:
- Frontline agent worker: generate reply proposal grounded in product memory evidence pack.
- Typed proposal schema: conversation summary, evidence refs, proposed reply, confidence score, source tier list.
- Deterministic validation envelope from SPIKE-03: schema validation → policy check → secondary validator → allow/abstain.
- Auto-reply threshold enforcement per `autonomy-and-approval-policy.md` section 8.1: case type = `user_request`, severity = `normal` or `low`, confidence ≥ 0.85, approved sources only, validator pass, no forbidden content.
- Draft-only mode: when thresholds are not met, draft the reply and route to Support Lead.
- `triaged → in-resolution → resolved` path for successful auto-replies.
- Validation record creation for every reply attempt.
- AI disclosure in outbound email per `legal-compliance-eu-germany.md` section 5.4 (transparency requirement by Aug 2, 2026).
- Knowledge capture check at resolution: flag cases that should become known-issue entries.
- Outbound email delivery for approved replies.

**Excluded items**: Approval queue UI (SLICE-05), change workflow, PR draft, quiet hours on outbound, digest delivery.

**Entry criteria**: SPIKE-03 findings adopted. SLICE-03 complete (product memory available).

**Exit criteria**:
- Routine user requests receive grounded auto-replies when all thresholds pass.
- Sub-threshold replies are drafted and visible to operator for review.
- Every reply attempt has a validation record.
- AI disclosure is present in outbound emails.
- Resolved cases trigger knowledge capture check.

**Epic refs**: EPIC-07 (Grounded User-Request Resolution), EPIC-04 (Deterministic Validation & Policy Engine).

---

### SLICE-05: Change Request and Approval Flow — ✅ COMPLETE (2026-03-18)

**Implementation summary (2026-03-18)**:
- Change request state machine fully wired: `draft → analysis → approval-pending → approved`
- `POST /api/v1/products/:productId/change-requests/:crId/approve` — approval with rationale, transitions to `approved`, emits audit event, notifies Change Lead
- `POST /api/v1/products/:productId/change-requests/:crId/reject` — rejection with rationale, transitions to `rejected`, emits audit event
- `GET /api/v1/products/:productId/change-requests/pending-approval` — filtered list for approval queue
- `POST /api/v1/cases/:caseId/send-to-change` — case-to-change routing (triaged → in-change)
- `POST /api/v1/cases/:caseId/resolve` — case resolution
- `requireRole()` admin superuser bypass — admin role passes any role check
- Console approval queue page: list of pending CRs with approve/reject modal, rationale capture
- Integration tests: NF-INT-30 through NF-INT-47

**Goal**: Cases requiring product changes progress through the change request lifecycle with human approval, ending at approved change request ready for PR drafting.

**Included items**:
- Steward: determine case requires change, create change request draft with required artifacts per `case-and-change-lifecycle.md` section 9.2.
- `triaged → in-change` transition.
- Change request state machine: `draft → analysis → approval-pending → approved`.
- Change agent worker: prepare engineering context, link GitHub issue, produce approval package per `autonomy-and-approval-policy.md` section 10.
- GitHub issue creation and bidirectional sync per SPIKE-04 output.
- Approval service: create approval request, route to Change Lead (or Product Lead per `autonomy-and-approval-policy.md` section 9).
- Approval queue UI: list pending approvals with rationale, evidence, risk level, expected impact.
- Approval action: approve/reject with rationale capture.
- Audit events for change request creation, approval request, and approval decision.
- Notification: approval request sent to mapped lead, approval decision notification.

**Excluded items**: PR draft creation (SLICE-06), branch creation, automated change draft threshold (manual routing only in this slice), rejection workflow refinement.

**Entry criteria**: SPIKE-04 findings adopted. SPIKE-07 findings adopted (identity + approval model). SLICE-02 complete.

**Exit criteria**:
- Cases route to change workflow when Steward determines change is needed.
- Change requests progress through `draft → analysis → approval-pending → approved`.
- GitHub issues are created and linked bidirectionally.
- Leads can approve/reject with rationale in the approval queue.
- Audit trail covers the full change request lifecycle.

**Epic refs**: EPIC-05 (Approval & Lead Routing), EPIC-08 (Change Management & GitHub Integration), EPIC-02.

---

### SLICE-06: PR Draft Preparation — ✅ COMPLETE (2026-03-17)

**Goal**: Approved change requests produce reviewable PR drafts in the target GitHub repository, completing the v1 edge.

**Implementation summary (2026-03-17)**:
- `PrDraftPrepWorker`: runs `pr_draft_prep` agent, creates GitHub PR draft (when GITHUB_TOKEN + github_repo configured), transitions CR `implementation-prep → pr-drafted`, resolves originating case, emits audit events
- `GET /api/v1/products/:productId/change-requests/pr-drafted` — lists both `implementation-prep` and `pr-drafted` CRs for the console
- `POST /api/v1/products/:productId/change-requests/:crId/complete` — operator Accept & Complete action; transitions CR to `completed`, case to `resolved`
- Console PR Drafts list page (`/pr-drafts`) — table with risk, title, status badge, GitHub PR link, age; animated "Preparing" state for `implementation-prep`
- Console PR Draft detail page (`/pr-drafts/[crId]`) — structured implementation notes, Accept & Complete confirm modal with audit trail
- Sidebar PR Drafts nav item activated (was `comingSoon`)
- Branch name: suggested by agent; engineers create branch manually from the suggested name (branch creation via git API deferred)
- Repository policy checks deferred (detected from SPIKE-04 findings)

**Included items**:
- `approved → implementation-prep → pr-drafted` transitions.
- Change agent worker: assemble implementation context from product memory, case evidence, and repository state.
- Repository policy check: branch protection, required reviewers, status checks per SPIKE-04 output.
- Branch creation in target repository.
- PR draft generation: diff, implementation notes, linked issue, validation summary, test/verification notes.
- `in-change → pr-drafting → resolved` case transition.
- PR draft review handoff view in operator console.
- Validation record for PR draft: approved change request, repo target, implementation context, validation summary, no secrets/credentials per `autonomy-and-approval-policy.md` section 8.3.
- Webhook ingestion for PR state changes. State mirroring per ADR-008.
- Change request → `completed` when PR draft is accepted.
- Notification: `pr_ready` alert to Change Lead and engineering reviewer.

**Excluded items**: Merge, deploy, post-deployment verification (all forbidden in v1). Automated change draft threshold. Multi-repo support.

**Entry criteria**: SLICE-05 complete. SPIKE-04 output integrated.

**Exit criteria**:
- Approved change requests produce PR drafts in the target GitHub repository.
- PR draft includes: clear diff summary, linked issue, implementation context, validation summary.
- Repository policy checks are respected.
- Operator can review PR draft in the console and see full traceability from case → change request → approval → PR draft.
- v1 edge is reached: approved PR draft exists.

**Epic refs**: EPIC-08 (Change Management & GitHub Integration), EPIC-02, EPIC-11.

---

### SLICE-07: Notification Control Plane (Phase 1: Basic Delivery) — ✅ COMPLETE (2026-03-18)

**Implementation summary (2026-03-18)**:
- `src/notifications/service.ts` — `NotificationService` with priority scheduling, quiet hours, dedup (23505 suppression), immediate delivery for critical/high, digest scheduling for normal/low
- `src/notifications/email-transport.ts` — SMTP / Postmark / Resend transports (priority order); best-effort, never throws
- `src/workers/digest-cron.ts` — pg-boss cron `"0 9,14 * * *"`, flushes all active products via `NotificationService.flushDigest()`
- `GET /api/v1/products/:productId/notifications` — protected list endpoint with status/kind/priority filters
- Console `/notifications` page — table with priority + status badges, filter dropdowns, 30s auto-refresh

**Goal**: Notifications are created, delivered, and tracked as first-class domain objects with priority-based routing.

**Included items**:
- Notification creation as typed domain objects per `domain-model.md` 4.11.
- Event-to-notification mapping per `notification-model.md` section 10.
- Priority model: critical, high, normal, low per `notification-model.md` section 8.
- Email delivery for internal notifications (operator and lead notifications).
- Delivery tracking: sent, failed, retry with backoff.
- At-least-once delivery with idempotent deduplication keys per `notification-model.md` section 14.
- Notification center in operator console: list of notifications with status.
- Audit event for every notification delivery attempt.

**Excluded items**: Quiet hours, deduplication, digest, acknowledgement tracking, escalation chains (Phase 2 and 3).

**Entry criteria**: SLICE-01 complete (notifications are already emitted in basic form). SPIKE-05 findings available.

**Exit criteria**:
- Notifications are created as domain objects with correct priority and audience.
- Email delivery works with retry and backoff.
- Operator can see notification history in the console.
- Delivery attempts are auditable.

**Epic refs**: EPIC-06 (Notification Control Plane).

---

### SLICE-08: Notification Control Plane (Phase 2: Quiet Hours, Dedup, Digest) — ✅ COMPLETE (2026-03-18)

**Implementation summary (2026-03-18)**:
- Quiet hours enforcement: default 20:00–08:00 UTC + weekends; per-product configurable via `product.support_policy.quiet_hours`
- Critical bypass: critical priority always schedules immediately regardless of quiet hours
- Deduplication: DB unique index on `(product_id, kind, source_type, source_ref, priority)` WHERE status NOT IN ('suppressed','failed'); 23505 collision → suppressed
- Priority upgrade: `suppressLowerPriorityPending()` cancels pending lower-priority notifications when a higher-priority one arrives for the same source/kind (prevents notification accumulation as situations escalate)
- Digest assembly: `flushDigest()` groups pending notifications by audienceType, sends one digest email per audience group per flush cycle; cron fires at 09:00 and 14:00 UTC daily
- Policy-driven: quiet hours config read from product support_policy at emit time; defaults to 20:00–08:00 + weekends when not set

**Goal**: Notification noise is managed through quiet hours suppression, deduplication, and digest windows.

**Included items**:
- Quiet hours policy: default 20:00-08:00 local time + weekends per `notification-model.md` section 9.
- Critical bypass: critical notifications ignore quiet hours.
- Deduplication by product_id + source_type + source_ref + kind + priority per `notification-model.md` section 11.
- Suppression: do not resend identical reminders within active retry window.
- Digest assembly: collapse low-priority notifications into digest windows at 09:00 and 17:00 per `notification-model.md` section 9.
- Replace older pending notification with newer higher-priority notification for same source.
- Policy-driven quiet hours: configurable per product, not hard-coded.

**Excluded items**: Acknowledgement tracking, escalation chains, secondary channel retry (Phase 3).

**Entry criteria**: SLICE-07 complete. SPIKE-05 tuning recommendations applied.

**Exit criteria**:
- Normal and low notifications are suppressed during quiet hours.
- Critical notifications break through quiet hours.
- Duplicate notifications are suppressed.
- Low-priority notifications are delivered in digest form.
- Operator daily notification volume matches SPIKE-05 targets.

**Epic refs**: EPIC-06.

---

### CONSOLE-UX-01: Operator Console UI Redesign — ✅ COMPLETE (2026-03-18)

**Goal**: Improve operator console density, data correctness, and actionability across all three main list views.

**Implementation summary (2026-03-18)**:

*Cases page (`console/src/app/cases/page.tsx`)*:
- Removed expandable rows; moved Case ID, Type, Persona into 2-line compact title cell
- `lastEventLabel(action)` maps audit event action strings to readable labels (e.g. `cr.completed` → "CR Completed", `case.reply_drafted` → "Auto-replied")
- `freshnessLevel(eventAt, createdAt)` returns "hot" (<2h) / "warm" (<24h) for amber dot + row tinting
- 4-column table: Case, Status, Severity, Last Event — compact `py-2` rows
- Sort by `last_event_at` (from audit events) falling back to `created_at`

*Approvals page (`console/src/app/approvals/page.tsx`)*:
- Removed expandable rows and chevron column
- 5-column table: Change Request (title+subtitle), Risk, Impact, Waiting, Actions
- Subtitle: CR short ID · case link · affected surfaces chips (max 3 + overflow count)
- Impact column: truncated `impact_summary` (90 chars), hidden on `<md`
- Waiting column: `formatDistanceToNow` without "ago" framing, hidden on `<sm`
- Actions: Approve + Reject + Detail buttons

*PR Drafts page (`console/src/app/pr-drafts/page.tsx`)*:
- Risk badge moved into subtitle (was its own column)
- GitHub PR link always visible — `#123 ↗` or `—` — never hidden at breakpoints
- CR short ID + case link in subtitle
- Compact `py-2` rows matching Cases/Approvals pattern

*Bug fixes*:
- `last_event_action` / `last_event_at`: replaced broken LATERAL JOIN with CTE + ROW_NUMBER() window function in `findCasesByProduct` — fixes all cases showing stale/identical timestamps
- `resolveGithubPrUrl()` in LineageTimeline now reads from `response.changeRequests[].githubPrUrl` (canonical CR record) with fallback to `node.metadata.githubPrUrl` — fixes "View PR" button for all cases with GitHub configured; button hidden (not disabled) when no URL available
- Server compile: TypeScript changes require `npm run build` + restart — documented in team runbook

**Epic refs**: EPIC-11 (Operator Console).

---

### SLICE-09: Notification Control Plane (Phase 3: Ack, Escalation, Retry) — ✅ COMPLETE (2026-03-18)

**Implementation summary (2026-03-18)**:
- Migration `0020_notification_escalation.sql` — adds `escalation_level INTEGER NOT NULL DEFAULT 0` + partial index for escalation runner
- `escalation_level` added to `NotificationRowSchema` and `NotificationUpdateSchema` in notifications repository
- `findOverdueForEscalation()` — queries ack-required, unacked, past-deadline notifications for the escalation runner
- `getNotificationMetrics()` — returns send success rate, mean ack latency, escalation rate, dedup suppression count (all from existing notifications table, last 7 days)
- `src/notifications/escalation-runner.ts` — `runEscalations()` with per-priority policy: critical (3 levels, 30min), high (2 levels, 60min), normal (1 level, 4h), low (no escalation). On exhaustion: marks `failed`, emits critical internal alert
- `POST /products/:productId/notifications/:notificationId/ack` — sets `status=acked`, `acked_at`, `acked_by`, emits `notification.acknowledged` audit event
- `GET /products/:productId/notifications/metrics` — health KPI endpoint
- `POST /internal/run-escalations` — no-auth cron endpoint wrapping `runEscalations()`
- Console: `acked_at`, `acked_by`, `escalation_level` added to `Notification` interface in types.ts; `acked` added to status union
- Console: `ackNotificationApi()` added to `api.ts`
- Console: `NotificationCardRow` — amber "Acknowledge" button for `ack_required=true, acked_at=null`; shows "Acked X ago" when acked; red "Escalated ×N" badge when `escalation_level > 0`

**Goal**: Full notification lifecycle with acknowledgement tracking, escalation chains, and retry semantics.

**Included items**:
- Acknowledgement tracking: ack required flag, ack deadline, ack status per `notification-model.md` section 8.
- Escalation logic per `notification-model.md` section 12:
  - Critical: operator → Support Lead + Product Lead → secondary channel retry. Ack deadline 10min, repeat every 30min.
  - High: primary lead → reminder → optional secondary channel. Ack deadline 60min.
  - Normal: primary lead → one reminder → digest fallback. Ack deadline 4 business hours.
  - Low: no escalation, digest only.
- Escalation policy records per `domain-model.md` 4.12.
- Failed delivery alert: final delivery failure emits internal alert.
- Notification metrics collection: send success rate, ack latency, escalation rate, dedup count per `notification-model.md` section 15.

**Excluded items**: Voice/SMS/phone escalation (out of scope per `notification-model.md` section 16), custom notification builders, complex incident paging rotations.

**Entry criteria**: SLICE-08 complete.

**Exit criteria**:
- Acknowledgement deadlines are enforced per priority level.
- Unacknowledged critical notifications escalate within 10 minutes.
- Escalation chains follow the configured lead routing.
- Notification metrics are collected and queryable.

**Epic refs**: EPIC-06.

---

### SLICE-10: AI-Resolved Badge — ✅ COMPLETE (2026-03-18)

**Goal**: Operators can see at a glance which cases were resolved entirely by AI agents, enabling trust calibration and ROI visibility.

**Included items**:
- Compute `ai_resolved` boolean per case by querying audit_events: all `actor_type` values for the case's entity_ref are `agent` or `system` (zero `lead` or `operator` actions after initial signal creation).
- Add `ai_resolved` as a computed field in `findCasesByProduct` response (CTE or LATERAL query against audit_events).
- Console: show a sparkle/icon chip next to the Status badge in the cases list when `ai_resolved = true`.
- Console: tooltip on hover: "Resolved automatically. N agent actions, 0 human interventions. Click to review lineage."
- Console: clicking the badge navigates to `/cases/:caseId` lineage view.

**Excluded items**: Analytics dashboard for AI resolution rate (deferred to SPIKE-09 analytics spike), notification about AI resolution to end-user.

**Entry criteria**: SLICE-02 complete (cases list with Last Event column exists).

**Exit criteria**:
- Cases resolved without any human actor show the AI-resolved badge in the list.
- Cases with at least one human intervention do NOT show the badge.
- Badge is visible, subtle, and non-distracting.
- `ai_resolved` field is present in the cases list API response.

**Epic refs**: EPIC-11 (US-87), EPIC-02.

---

### SLICE-11: Settings Pane — ✅ COMPLETE (2026-03-18)

**Goal**: Operators can manage LLM provider, lead assignments, agent tone, and notification policies from the console without env vars or seed scripts.

**Included items**:
- `GET /api/v1/products/:productId/settings` — returns current product settings (LLM provider, model, masked API key, lead assignments, agent tone, quiet hours config).
- `PUT /api/v1/products/:productId/settings` — updates product settings. API key encrypted at rest. Requires `admin` or `operator` role.
- `POST /api/v1/products/:productId/settings/test-llm` — connection test endpoint: sends a minimal prompt to the configured LLM provider and returns success/failure/latency.
- Console: `/settings` page with tabs: LLM Provider, Lead Assignments, Agent Behavior, Notification Policy.
- LLM tab: provider dropdown, model dropdown (filtered by provider), API key input (masked after save, only last 4 chars visible), "Test Connection" button.
- Lead Assignments tab: email inputs for Support Lead, Change Lead, Product Lead, Knowledge Lead.
- Agent Behavior tab: tone selector (formal/friendly/technical).
- Notification Policy tab: quiet hours start/end, weekend suppression toggle.
- Migration: add `llm_config JSONB`, `agent_config JSONB` columns to `products` table (or `product_settings` table).

**Excluded items**: Response template editing (templates are hardcoded in v1 agent prompts), persona authoring UI, product memory source management UI.

**Entry criteria**: SLICE-02 complete, EPIC-12 implemented (auth required for settings access).

**Exit criteria**:
- Operator can configure LLM provider + API key and verify connection from the console.
- Lead assignments are editable and immediately reflected in notification routing.
- Agent tone setting persists and is read by agent workers on next run.
- API key is never returned in plaintext after initial save.

**Epic refs**: EPIC-14 (US-88), EPIC-11.

---

### SLICE-12: First-Run Configuration Wizard — ✅ COMPLETE (2026-03-18)

**Goal**: New NestFleet installations can be configured end-to-end through a guided wizard without any CLI, env var, or SQL seed script interaction.

**Included items**:
- Wizard detection: on console load, if no `operator_users` exist → redirect to `/setup` wizard instead of `/login`.
- Step 1 — Welcome: create admin account (email + password). Validates email format, password strength.
- Step 2 — Connect LLM: select provider, enter API key, run connection test (reuses `/settings/test-llm`). Must pass before proceeding.
- Step 3 — Create Product: name, support email address, GitHub repo URL (optional).
- Step 4 — Assign Leads: map email addresses to Support Lead, Change Lead, Product Lead. At least one lead required.
- Step 5 — Connect GitHub (optional): GitHub PAT entry, validate repo access via GitHub REST API. Skip if no repo URL provided.
- Step 6 — Done: redirect to `/cases` with empty-state welcome message.
- Wizard state persisted in `localStorage` so refreshing doesn't lose progress.
- Wizard can be re-entered from `/settings` → "Re-run setup wizard" link if initial setup was incomplete.

**Excluded items**: OIDC provider configuration (v1 uses JWT-based auth), product memory source ingestion (manual script in v1), Telegram channel setup.

**Entry criteria**: SLICE-11 complete (settings infrastructure exists to store configuration).

**Exit criteria**:
- Fresh NestFleet installation presents wizard on first access.
- Wizard completes end-to-end in under 10 minutes.
- All configuration is persisted and functional after wizard completion.
- Returning to the console after wizard shows the normal login page.

**Epic refs**: EPIC-14 (US-89), EPIC-12.

---

### SLICE-13: CI Verification & Post-Merge Feedback Loop (v1.1) — ✅ COMPLETE (2026-03-18)

**Goal**: Change requests track merge and CI status via GitHub webhooks, automatically completing on green CI or alerting the Change Lead on red CI — closing the gap between "PR drafted" and "change actually works."

**Included items**:
- GitHub webhook endpoint: `POST /api/v1/webhooks/github` — receives `pull_request` and `check_suite` events, validates webhook signature (HMAC-SHA256).
- `pull_request.merged` handler: match PR to change request by `github_pr_number`, transition CR from `pr-drafted` → `pr-merged`, emit audit event.
- `check_suite.completed` handler:
  - `conclusion=success`: transition CR from `pr-merged` → `ci-passed`. If `auto_complete_on_ci_pass=true` in product settings → auto-advance to `completed` and resolve case.
  - `conclusion=failure`: transition CR to `ci-failed`, emit high-priority notification to Change Lead, create audit event with failure details.
- CI Build Event record (domain model 4.20): store every CI event for audit trail.
- Migration: add `pr-merged`, `ci-pending`, `ci-passed`, `ci-failed` to `change_requests.status` enum; create `ci_build_events` table.
- Product settings: `ci_tracking` config (`{ enabled, branch_filter, auto_complete_on_ci_pass }`), editable from Settings pane (SLICE-11).
- Console: CR detail page shows CI status step in the lineage timeline (green check / red X / spinner).
- Console: Cases list — cases auto-completed via CI show both AI-resolved badge + "CI Verified" indicator.

**Excluded items**: `deployment_status` webhook tracking (v1.2), deploy health-check verification (v1.2), auto-case-creation on deploy failure (v1.2), full CI-as-channel monitoring (v2).

**Entry criteria**: SLICE-06 complete (PR draft infrastructure), SLICE-11 complete (settings for CI config).

**Exit criteria**:
- Merged PR auto-transitions CR to `pr-merged`.
- Successful CI auto-transitions CR to `ci-passed` (and optionally to `completed`).
- Failed CI transitions CR to `ci-failed` with notification to Change Lead.
- Only PRs matching `branch_filter` are tracked.
- CI events are recorded in `ci_build_events` for audit.
- Webhook signature validation prevents spoofed events.

**Epic refs**: EPIC-15, EPIC-08.

---

### SLICE-14: Agentic Engine Hardening (SA Review Fixes) — ✅ COMPLETE (2026-03-18)

**Goal**: Address four data-integrity and correctness issues identified in the SA architecture review (`docs/sa-review-agentic-architecture.md`) — bundled because they all touch the worker/control-plane layer and are interconnected.

**Source**: SA Review concerns #1, #3, #5, #7.

**Sub-task A — State Machine Transition Guard (SA #1, HIGH)**

Introduce `CaseStateMachine.transition(caseId, expectedFrom, to)`:
- Define an `ALLOWED_TRANSITIONS` map derived from `case-and-change-lifecycle.md` §5.1 allowed exits.
- Read current state from DB, validate `from → to` pair against the map.
- Throw `InvalidStateTransitionError` if the transition is illegal.
- Replace all raw `updateCase(caseId, { status })` calls in workers and API routes with `CaseStateMachine.transition()`.
- Equivalent guard for `ChangeRequestStateMachine` covering the CR state model (§6.1).
- Unit tests: every allowed transition passes, every illegal transition throws.

Files: new `src/domain/case-state-machine.ts`, new `src/domain/cr-state-machine.ts`, edits to `steward-worker.ts`, `frontline-worker.ts`, `signal-ingress.ts`, `cases.ts`, `approvals.ts`, `pr-drafts.ts`.

**Sub-task B — Severity Enum Normalization (SA #5, MEDIUM)**

- Change `src/agents/impl/triage.ts` schema from `z.enum(["critical", "high", "medium", "low"])` to `z.enum(["critical", "high", "normal", "low"])`.
- Update the triage system prompt to use `normal` instead of `medium`.
- Add a defensive mapping in the steward worker: if agent output contains `medium`, map to `normal` before DB write.
- Verify: all DB queries for `severity = 'normal'` match triage-classified cases.

Files: `src/agents/impl/triage.ts`, `src/workers/steward-worker.ts`.

**Sub-task C — Outage Notification Routing Fix (SA #3, MEDIUM)**

- In `steward-worker.ts` step 9: change notification condition from `caseSeverity === "critical"` to `(caseType === "outage_report" && (caseSeverity === "critical" || caseSeverity === "high"))`.
- For critical + high outage reports: notify ALL leads (`support_lead`, `product_lead`, `change_lead`), not just `support_lead`.
- For normal/low outage reports: notify `support_lead` only.
- In the outage routing catch block (line 177-180): also emit an immediate critical notification to all leads when `caseType === "outage_report"` regardless of severity, since the routing agent failure itself is an escalation trigger per ADR-029.

Files: `src/workers/steward-worker.ts`.

**Sub-task D — Signal Text Storage (SA #7, LOW)**

- Migration: add `signal_text TEXT` column to `cases` table.
- In `signal-ingress.ts`: store the normalized signal body text on the case at creation time.
- In `steward-worker.ts`: replace the fragile `signalText` reconstruction chain (lines 108-113) with `caseRow.signal_text`.
- Workers that need original signal text read it from `cases.signal_text` instead of reconstructing from downstream artifacts.

Files: new migration `0021_case_signal_text.sql`, `src/ingress/signal-ingress.ts`, `src/workers/steward-worker.ts`, `src/infra/db/repositories/cases.ts`.

**Entry criteria**: Phase 2 (Agentic Engine) complete.

**Exit criteria**:
- All `updateCase()` calls go through `CaseStateMachine.transition()` — direct status writes are eliminated.
- Illegal transitions throw `InvalidStateTransitionError` (unit tests prove it).
- Triage agent outputs `normal` (not `medium`); DB queries for severity are consistent.
- Outage reports classified as `high` trigger all-leads notification.
- `cases.signal_text` is populated at ingestion and used by workers.

**Effort**: ~1.5 days.

**Epic refs**: EPIC-02 (Case Management), EPIC-10 (Governance).

---

### SLICE-15: Transactional State + Dispatch (SA Review #2) — ✅ COMPLETE (2026-03-18)

**Goal**: Eliminate silent stuck states by making case state transitions and job dispatch atomic — when one succeeds, the other must also succeed or both roll back.

**Source**: SA Review concern #2 (HIGH).

**Included items**:
- Extend `dispatcher.ts` to accept an optional PG transaction handle. Use pg-boss's transaction-aware `send()` method (pg-boss v7+ supports passing an existing connection to `boss.send()`).
- Create a `withTransaction()` helper in the DB layer that provides a shared PG connection to both `updateCase()` and `dispatch()`.
- Refactor all worker sites where `updateCase + dispatch` are sequential:
  - `steward-worker.ts:225-245` (updateCase → dispatch auto_reply)
  - `steward-worker.ts:209-216` (createChangeRequest → dispatch change_prep)
  - `frontline-worker.ts:163` (updateCase → dispatch)
  - `approvals.ts:107` (updateCase → dispatch pr_draft_prep)
- Remove try/catch "non-fatal" wrappers around dispatch calls — if dispatch fails inside the transaction, the state update rolls back too, which is the correct behavior.
- Add integration tests: verify that a simulated dispatch failure causes the state update to roll back.

**Excluded items**: Transactional guarantees for audit event creation (audit events are append-only and non-fatal — eventual consistency is acceptable).

**Entry criteria**: SLICE-14 complete (state machine guard exists — transaction wrapper builds on top).

**Exit criteria**:
- State update + dispatch are wrapped in a single PG transaction at every worker site.
- Simulated dispatch failure rolls back the case state update (integration test proves it).
- No "non-fatal dispatch failed" log entries can produce stuck cases.
- pg-boss `send()` uses the shared transaction connection.

**Effort**: ~1 day.

**Epic refs**: EPIC-02, EPIC-10.

---

### SLICE-16: Two-Phase LLM Optimization — ✅ COMPLETE (2026-03-18)

**Goal**: Fix token budget accuracy, reduce latency, and eliminate evidence duplication in the two-phase LLM pipeline — while preserving the deterministic quality benefit of Phase 2 structured extraction.

**Source**: SA Review concern #4 (MEDIUM).

**Sub-task A — Token Budget Fix + Evidence Deduplication**

- Define per-phase token budgets in `TOKEN_BUDGETS` config: separate `phase1MaxInput`, `phase1MaxOutput`, `phase2MaxInput`, `phase2MaxOutput` per action type instead of a single `maxInputTokens`/`maxOutputTokens`.
- Add a Phase 2 budget pre-check that estimates `synthesisPrompt` token count before calling `generateObject()`.
- Deduplicate tool results: when `phase1.text` already summarizes tool results (the model typically does), omit the raw `toolResultContext` injection from `synthesisPrompt`. Only inject `toolResultContext` when `phase1.text` is empty or very short (< 100 chars).
- Add per-phase token usage tracking in `AgentResult`: `phase1InputTokens`, `phase1OutputTokens`, `phase2InputTokens`, `phase2OutputTokens`.

Files: `src/agents/run-agent.ts`, `src/agents/config.ts` (token budgets).

**Sub-task B — Single-Phase Fast Path for Simple Agents**

- For action types where structured output is simple (triage: 5 fields, auto_reply: 3 fields): evaluate `generateObject()` with `mode: 'json'` and inline tools in a single call.
- Add a `phasingStrategy` config per action type: `"two-phase"` (default, for change_prep, pr_draft_prep, outage_routing, known_issue_match) or `"single-phase"` (for triage, auto_reply).
- When `phasingStrategy === "single-phase"`: call `generateObject()` directly with tools, skipping Phase 1 `generateText()`. This halves latency and token cost for simple agents.
- Measure: compare output quality on 10+ triage test cases between single-phase and two-phase. If quality degrades measurably, keep two-phase for triage.

Files: `src/agents/run-agent.ts`, `src/agents/config.ts`.

**Entry criteria**: SLICE-14 and SLICE-15 complete (correctness fixes first).

**Exit criteria**:
- Phase 2 token budget pre-check catches overruns before the LLM call.
- Tool results are not duplicated in Phase 2 prompt.
- Per-phase token usage is tracked and logged.
- Simple agents (triage, auto_reply) run single-phase when configured.
- Complex agents (change_prep, pr_draft_prep) retain two-phase.
- No quality regression on 10+ triage test cases.

**Effort**: 2-3 days.

**Epic refs**: EPIC-10 (Governance), EPIC-02.

---

### SLICE-17: Outage Routing Queue Separation (Phase 4) — ✅ COMPLETE (2026-03-18)

**Goal**: Move outage routing from inline execution inside the steward worker to a dedicated dispatched job, respecting the designed queue separation and enabling independent SLO measurement.

**Source**: SA Review concern #6 (MEDIUM).

**Included items**:
- Create `OutageRoutingWorker` as a dedicated worker registered on the `outage_routing` queue.
- In `steward-worker.ts`: for `outage_report` cases, dispatch an `outage_routing` job via `dispatch()` instead of calling `runOutageRoutingAgent()` inline.
- The steward transitions case to `awaiting-lead` immediately; the outage routing worker handles routing logic, immediate actions, and escalation notification asynchronously.
- The `outage_routing` queue's `concurrency: 5, retryDelaySeconds: 3` settings are now actually used.
- Add OTel span for outage routing as an independent measurement (not a child of steward span), enabling P95 SLO tracking.

**Excluded items**: SLO alerting infrastructure (deferred to analytics spike).

**Entry criteria**: SLICE-14 and SLICE-15 complete.

**Exit criteria**:
- Outage routing runs as a separate dispatched job, not inline.
- Queue retry semantics apply to outage routing failures.
- OTel span is independently measurable for SLO.
- Steward worker no longer directly calls `runOutageRoutingAgent()`.

**Effort**: ~1 day.

**Phase**: Phase 4 (Integration + Polish).

**Epic refs**: EPIC-02, EPIC-10.

---

### SLICE-18: Interactive Graph Lineage View — ✅ COMPLETE (2026-03-19)

**Goal**: Provide operators with a modern, interactive DAG-based visualization of case lineage using React Flow, complementing the existing vertical timeline with a graph view that makes branching paths and dependencies visually clear.

**Included items**:
- Backend: `buildEdges()` function in `lineage.ts` — semantic edge inference from node types with sequential fallback.
- `LineageEdge` type: `{ id, source, target, label?, edgeType }` with 4 edge types (default, success, failure, branch).
- Frontend: 6 new components in `console/src/components/lineage-graph/` — `LineageGraph`, `LineageGraphNode`, `NodeDetailPanel`, `lineage-icons`, barrel export.
- `lineage-graph-utils.ts` — React Flow data transforms + Dagre LR layout.
- Toggle UI on case detail page — timeline ↔ graph with localStorage persistence.
- Clickable nodes open right-side detail panel with metadata, agent run info, and action buttons (approve/reject/escalate/view CR/view PR).
- MiniMap + Controls for navigation.
- Dark theme matching existing console aesthetic.

**Exit criteria**: ✅ Graph renders left-to-right DAG. ✅ Clicking node opens detail panel. ✅ Toggle preserves existing timeline. ✅ Zero console errors.

---

### SLICE-19: RBAC Management & License Control — ✅ COMPLETE (2026-03-19)

**Goal**: Operators can manage users and roles from the console, view license status, and the system enforces feature gating based on license tier.

**Included items**:
- User Management API: Full CRUD — 6 admin-only endpoints (`GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`, `GET /users/me`).
- User Management UI: Settings → Users tab with role assignment (admin-only).
- License Status API: `GET /api/v1/license/status` with tier, limits, features, expiration.
- License Refresh API: `POST /api/v1/license/refresh` manual trigger endpoint.
- License UI: Settings → License & Support tab with tier badge, usage, expiration countdown.
- Role constants: `src/shared/roles.ts` with validated role enum.
- Feature gating middleware: `requireFeature()` checking license tier.
- Product limit enforcement in `createProduct()`.
- Test user seed script: 7 users, one per role (`scripts/seed-test-users.ts`).
- Integration tests for user management API.

**Exit criteria**: ✅ User CRUD works end-to-end. ✅ License status displays correctly. ✅ Feature gating blocks unlicensed features. ✅ Product limit enforcement active.

**Epic refs**: EPIC-12 (Auth), EPIC-13 (Licensing).

---

### SLICE-19a: RBAC Matrix Enforcement — ✅ COMPLETE (2026-03-19)

**Goal**: Enforce the full RBAC permission matrix across all backend endpoints and console UI, ensuring every role sees only what it should.

**Included items**:
- Backend: `requireRole()` guards on all 12+ endpoints per the RBAC matrix.
- Frontend: Sidebar navigation filtering per role via `console/src/lib/permissions.ts`.
- Frontend: Action button hiding (Approve/Reject, Accept & Complete) based on role.
- Settings tabs (Users, License) restricted to admin-only.
- `console/src/lib/permissions.ts` — centralized permission helper for all role-based UI decisions.
- Integration tests: 79 tests (NF-RBAC-01 through NF-RBAC-79) in `tests/integration/rbac.test.ts`.

**Exit criteria**: ✅ All endpoints enforce role checks. ✅ UI hides unauthorized actions. ✅ 79 RBAC integration tests pass.

**Epic refs**: EPIC-12 (Auth).

---

### SLICE-19b: PlatformCloud License Bridge — ✅ COMPLETE (2026-03-19)

**Goal**: NestFleet validates licenses against PlatformCloud's cloud endpoint, enabling remote license management and tier mapping.

**Included items**:
- `refreshFromCloud()` in `validator.ts` — calls PlatformCloud's validate endpoint to refresh local license state.
- `CloudConnection.startBackgroundSync()` now includes license refresh on each sync cycle.
- `POST /api/v1/license/refresh` — manual trigger for operators to force a license refresh.
- Offline-first: graceful fallback when PlatformCloud is unreachable (local license remains valid).
- Plan mapping: PlatformCloud plans (FREE/PRO/TEAM) mapped to NestFleet tiers (community/professional/enterprise).
- Live tested: PlatformCloud on port 4000 validates `nf_lic_ff00...ff06` → TEAM/enterprise tier.

**Exit criteria**: ✅ License refreshes from cloud on sync. ✅ Manual refresh works. ✅ Offline fallback does not break operations. ✅ Plan mapping correct.

**Epic refs**: EPIC-13 (Licensing).

---

### SPIKE-09: Analytics & Cost Analysis Dashboard — ✅ COMPLETE (2026-03-19)

**Goal**: Design and prototype an analytics dashboard showing operational KPIs and AI cost analysis, similar to DocuGardener's cost dashboard but expanded for NestFleet's multi-agent architecture.

**Outcome**: KPI model defined across 5 domains (cost, automation, agent performance, cases, memory). Data sources identified: `agent_runs`, `product_llm_usage`, `audit_events`, `cases`, `notifications`, `memory_chunks`. No new migration needed — existing tables cover all metrics. Model pricing table covers 9 LLM models.

**Epic refs**: EPIC-10 (Observability).

---

### SLICE-20: Analytics & Cost Analysis Dashboard — ✅ COMPLETE (2026-03-19)

**Goal**: Implement the analytics dashboard designed in SPIKE-09.

**Delivered**:
- 5 API endpoints: `GET /analytics/overview`, `/cost`, `/agents`, `/cases`, `/memory` — all RBAC-gated (`requireRole("operator")`)
- Dashboard page (`console/src/app/analytics/page.tsx`) with 5 tabs: Overview, Cost & Tokens, Agent Performance, Cases, Memory Health
- Overview tab: stat cards (total cases, AI resolved, automation rate, token usage, estimated cost USD)
- Cost tab: monthly totals, per-agent-per-model breakdown with estimated cost, avg tokens per call
- Agents tab: per-agent success/error/abstain rates, avg duration, recent errors list
- Cases tab: by status/type/severity distribution, 30-day daily volume chart (created vs resolved), avg resolution time
- Memory tab: chunk stats, tier distribution, embedding coverage %, conflict count, source type breakdown
- Model pricing: 9 LLM models (Gemini, GPT-4o, Claude Sonnet/Haiku) with per-1M-token rates
- Sidebar nav entry with bar-chart icon, visible to admin + operator
- 16 integration tests (NF-INT-300–315): overview counts, token totals, cost breakdown, agent performance, case distributions, memory stats, RBAC guards

**Files**: `src/api/v1/analytics.ts`, `console/src/app/analytics/page.tsx`, `console/src/lib/api.ts` (5 API functions + 5 type interfaces), `console/src/lib/permissions.ts` (analytics nav entry), `console/src/components/Sidebar.tsx` (nav item), `tests/integration/analytics-api.test.ts`

**Epic refs**: EPIC-10 (Observability), EPIC-14 (Operator Analytics).

---

### SLICE-21: Lineage Graph View Enhancements ✅ COMPLETE (2026-03-19)

**Goal**: Extend the interactive React Flow graph view (SLICE-18) with richer node types, clickable navigation, and deeper agent run details.

**Delivered**:
- Edge label styling + timing (computed from node `occurredAt` deltas, color-coded per edge type with background chips).
- Filtering controls: actor filter (all/agent/human/system) + node group filter (all/agent_events/human_decisions/notifications/ci_deploy) with active-filter badge and node count display.
- Inline context snippets in the node detail panel — prefetched via SWR on node selection (zero latency on open): notifications for `notification_sent` nodes, CR summary for nodes with `view_cr` action, PR draft summary for `pr_drafted`/`approved` nodes. Each snippet includes status/risk badges and an "Open full page ↗" link that navigates same-tab (`router.push`) for internal pages; GitHub links open `_blank`. Replaces disruptive same-tab redirects that lost lineage context.
- Expanded agent run panel: model chip, 2×2 grid with input tokens, output tokens, duration, outcome (color-coded); copy run ID button with 2s feedback; absolute timestamp alongside relative.
- Performance optimization for large graphs (30+ nodes): compact card mode with reduced dimensions, disabled animation, disabled node dragging, tighter dagre layout spacing.

**Files**: `console/src/lib/lineage-graph-utils.ts`, `console/src/components/lineage-graph/LineageGraph.tsx`, `console/src/components/lineage-graph/LineageGraphNode.tsx`, `console/src/components/lineage-graph/NodeDetailPanel.tsx`.

**Entry criteria**: SLICE-18 complete (base graph view exists).

**Phase**: Post-v1 enhancement.

**Epic refs**: EPIC-10 (Observability).

---

### SLICE-22: Dynamic RBAC — Permission Audit View (Growth tier) — ✅ COMPLETE (2026-03-19)

**Goal**: Expose the full atomic permission model in a read-only console pane so Growth-tier operators and compliance officers can inspect and document exactly what each role can do — without any ability to edit.

**Why now**: Pre-condition for SLICE-23. Establishes the permission vocabulary in the DB and the API contract before the editor UI lands. Also delivers immediate compliance value: Growth customers can export a role manifest for SOC 2 / ISO 27001 access-control documentation.

**Atomic permission set** (code-defined, immutable):

| Domain | Permissions |
|---|---|
| Cases | `cases:read` `cases:create` `cases:transition` `cases:delete` `cases:export` |
| Signals | `signals:read` `signals:dismiss` |
| Change Requests | `change_requests:read` `change_requests:create` `change_requests:approve` `change_requests:reject` `change_requests:complete` |
| PR Drafts | `pr_drafts:read` `pr_drafts:push` |
| Approvals | `approvals:read` `approvals:act` |
| Analytics | `analytics:read` |
| Settings | `settings:read` `settings:write` |
| Compliance | `compliance:read` `compliance:dsar_search` `compliance:dsar_export` `compliance:retention_run` |
| Memory | `memory:read` `memory:write` `memory:delete` |
| Audit | `audit:read` |
| Products | `products:read` `products:create` `products:update` |

**Default role → permission seed** (shipped with every tier, locked for Starter/Growth):
- `admin` = all permissions
- `operator` = cases (no delete), signals, change_requests (no approve/reject/complete), pr_drafts, approvals, analytics, settings:read, compliance:read, memory:read, audit:read, products:read
- `support_lead` = cases (read + transition), signals:read, change_requests:read, approvals, analytics:read, settings:read, compliance:read, memory:read, products:read
- `knowledge_lead` = cases:read, signals:read, change_requests (all), pr_drafts, analytics:read, memory (read + write), products:read

**Tasks**:
1. DB schema — `permissions(permission_id, domain, action, label, description, destructive bool, requires_permission_id FK)`, `role_permissions(role_id, permission_id, is_default bool)` seeded via migration.
2. `GET /api/v1/products/:productId/roles` — returns role list with resolved permission arrays; `requireRole("operator")`.
3. `GET /api/v1/products/:productId/roles/:roleId/permissions` — returns full permission matrix for one role.
4. Console: **Settings → Roles tab** — read-only permission audit pane (Growth tier rendered, Scale tier locked with "Upgrade" callout). Shows role list + expandable permission groups per domain.
5. Feature gate: if `product.tier < "growth"` → 403 on audit endpoints.

**Effort**: ~5 days.

**Entry criteria**: SLICE-19a (RBAC middleware) complete.

**Phase**: Post-v1, Growth feature.

**Epic refs**: EPIC-09 (Team & Roles).

#### Test Strategy — SLICE-22

**Approach: TDD for backend, test-after for UI.**

**Why TDD here specifically**: The permission seed is the most security-sensitive code in this slice. If the migration accidentally grants `cases:delete` to `operator`, or drops `compliance:dsar_search` from `admin`, that's an invisible security regression until a real user hits it. TDD forces every expected permission to be stated explicitly before the migration is written — the test suite IS the spec. The domain model is fully defined before a single line of implementation exists, which is the ideal TDD precondition.

**Red-Green-Refactor sequence**:
1. Write unit tests for the full permission seed (NF-UNIT-90–99) → all RED
2. Write migration + seed → all GREEN
3. Write integration tests for API contracts (NF-INT-400–408) → all RED
4. Implement repository + route handlers → all GREEN
5. Build console read-only UI → write Playwright e2e last (test-after)

**Unit tests** — `tests/unit/rbac/permission-seed.test.ts` (TDD, write first):

| ID | Test | What it verifies |
|---|---|---|
| NF-UNIT-90 | admin role has all 27 permissions | No permission missing from root role |
| NF-UNIT-91 | operator role has exactly the declared permission set | Prevents accidental over/under-grant |
| NF-UNIT-92 | support_lead role has exactly the declared permission set | Same |
| NF-UNIT-93 | knowledge_lead role has exactly the declared permission set | Same |
| NF-UNIT-94 | only admin has `cases:delete` | Destructive permission not leaked to other roles |
| NF-UNIT-95 | only admin has `compliance:dsar_search` | PII-sensitive permission scoped correctly |
| NF-UNIT-96 | only admin has `compliance:retention_run` | Destructive sweep not leaked |
| NF-UNIT-97 | no permission appears twice in any default role | Seed integrity |
| NF-UNIT-98 | all 27 permission IDs are unique strings matching `domain:action` format | Naming convention enforced |
| NF-UNIT-99 | every permission has non-empty label and description | Documentation completeness |

**Integration tests** — `tests/integration/rbac-audit-api.test.ts` (TDD, write first):

| ID | Test | Expected |
|---|---|---|
| NF-INT-400 | `GET /roles` returns 4 default roles with permission counts | 200, array length 4 |
| NF-INT-401 | `GET /roles/:roleId/permissions` for admin returns all 27 | 200, permissions.length === 27 |
| NF-INT-402 | `GET /roles/:roleId/permissions` for operator returns correct set | 200, no `cases:delete`, no `compliance:dsar_search` |
| NF-INT-403 | `GET /roles/:roleId/permissions` for support_lead returns correct set | 200, has `cases:transition`, no `cases:create` |
| NF-INT-404 | `GET /roles/:roleId/permissions` for knowledge_lead returns correct set | 200, has `change_requests:approve`, no `settings:write` |
| NF-INT-405 | `GET /roles` returns 401 without auth | 401 |
| NF-INT-406 | `GET /roles` returns 403 for end-user token | 403 |
| NF-INT-407 | `GET /roles` returns 200 for Growth-tier product | 200 (read permitted) |
| NF-INT-408 | `GET /roles` returns 403 for Community/Starter-tier product | 403 (tier gate) |

**E2E** — `console/e2e/nestfleet.spec.ts` section 12 (test-after, build UI first):
- Settings → Roles tab visible for admin
- All 4 default roles listed with permission count badges
- Expanding a domain section shows individual permission rows
- All checkboxes disabled (read-only mode)
- Growth tier: full pane visible; Scale tier: upgrade callout renders

---

### SLICE-23: Dynamic RBAC — Permission Studio (Scale tier) — ✅ COMPLETE (2026-03-19)

**Goal**: Full role configuration editor ("Permission Studio") that lets Scale-tier admins compose, edit, and audit roles from atomic permission blocks — the Lego model. Includes custom role creation, user-level overrides, GDPR role delegation, and SSO group mapping.

**Why now**: Enterprise sales blocker. "We need a DPO role with DSAR access but not full admin" and "We need an `auditor` role for our external security review" are recurring objections. Without this, Scale prospects evaluate competitors.

---

#### UI Design: Permission Studio

Inspired by analysis of Stripe, Clerk, GitHub, and Retool RBAC editors. NestFleet's design takes the best of each and adds three novel elements: **diff-from-default highlighting**, **permission risk tagging**, and **impact preview before save**.

**Layout — three-panel split**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚙  Roles & Permissions                         MyApp ▾  [Scale tier]  │
├──────────────────┬──────────────────────────────┬────────────────────────┤
│  ROLES           │  PERMISSIONS                 │  MEMBERS               │
│  (220px fixed)   │  (flex, min 400px)           │  (260px fixed)         │
├──────────────────┼──────────────────────────────┼────────────────────────┤
│                  │                              │                        │
│  DEFAULT ROLES   │  ← Support Lead              │  Users with this role  │
│  🔒 Admin    ●26 │  2 customizations ⚠          │  ────────────────────  │
│  🔒 Operator ●19 │  [Reset to default] [Save →] │  alex@co.com           │
│  ◎ Support L ●16 │                              │  maria@co.com          │
│  🔒 Know. L  ●14 │  🔍 Filter permissions…      │  + 1 more              │
│                  │                              │                        │
│  CUSTOM ROLES    │  ▼ CASES              4/5 ☑  │  ────────────────────  │
│  ◎ Auditor   ●5  │    ☑ cases:read               │  OVERRIDES             │
│  ◎ DPO       ●4  │    ☐ cases:create             │  No user-level         │
│  + New Role      │    ☑ cases:transition         │  overrides             │
│                  │    ☐ cases:delete  🔴 dest.   │                        │
│  ──────────────  │    ☐ cases:export             │  + Add override        │
│  [Export roles   │                              │                        │
│   as JSON]       │  ▶ SIGNALS            2/2 ☑  │  SSO GROUP MAPPING     │
│                  │  ▶ CHANGE REQUESTS    3/5 ☑  │  ────────────────────  │
│                  │  ▶ PR DRAFTS          0/2 ☐  │  No groups mapped      │
│                  │  ▶ APPROVALS          2/2 ☑  │  + Map SAML group      │
│                  │  ▶ ANALYTICS          1/1 ☑  │                        │
│                  │  ▶ SETTINGS           1/2 ☑  │                        │
│                  │  ▶ COMPLIANCE 🔐      1/4 ☑  │                        │
│                  │  ▶ MEMORY             2/3 ☑  │                        │
│                  │  ▶ AUDIT              1/1 ☑  │                        │
│                  │  ▶ PRODUCTS           1/3 ☑  │                        │
└──────────────────┴──────────────────────────────┴────────────────────────┘
```

**Panel 1 — Role list**:
- Sections: DEFAULT ROLES (🔒 locked icon = shipped defaults, ● = permission count badge) and CUSTOM ROLES (◎ = editable).
- Clicking a role loads its permission matrix into Panel 2 and its member list into Panel 3.
- `+ New Role` opens a create modal: name, key (slug), description, "Clone from" dropdown (copy an existing role as starting point).
- `Export roles as JSON` downloads a manifest for compliance documentation.
- Active role highlighted with left border accent.

**Panel 2 — Permission matrix**:
- Header: role name + change count badge (`2 customizations ⚠` in amber if diverged from default) + `Reset to default` link + `Save` button (disabled until dirty).
- Search bar filters permissions by name or domain across all collapsed groups.
- Domains as collapsible sections — header shows `▼ CASES 4/5 ☑` (granted / total, bulk checkbox):
  - Click domain header checkbox to grant/revoke all in that domain at once.
  - Expand to see individual permissions as checkbox rows.
- Each permission row: checkbox + `domain:action` label + optional tag:
  - 🔴 `destructive` — irreversible data operations (`cases:delete`, `compliance:retention_run`, `memory:delete`)
  - 🔐 `sensitive` — PII-touching operations (`compliance:dsar_search`, `compliance:dsar_export`, `audit:read`)
  - ⚙ `ai-required` — permissions that agent pipelines depend on (disabling them silently breaks automation)
- Rows that diverge from the default role seed are highlighted with a subtle amber left border — instant visual diff.
- Hovering a permission row shows a tooltip: description + "Also in: Admin, Operator" (which other roles share it).
- Dependency warnings inline: checking `compliance:dsar_export` auto-checks `compliance:dsar_search` (with a toast explaining why).
- `Save` triggers an **impact preview modal**: "This change affects 3 users. Support Lead will lose `cases:export`. Continue?" with user list.

**Panel 3 — Members & SSO**:
- Members list: avatars + email for users currently assigned this role.
- `+ Add override` — user-level permission grant/deny that overrides the role (e.g., give one operator `compliance:dsar_search` without promoting to admin).
- SSO Group Mapping section (visible on Scale): `+ Map SAML group` opens a modal to bind an SSO group name to this role (users in that AD/Okta group get the role on login).

**Additional UX touches**:
- Keyboard navigation: Tab/Shift-Tab between permissions, Space to toggle checkbox, `Cmd+S` to save.
- Undo/redo stack within the editing session (before save).
- Role audit trail inline at the bottom of Panel 2: "Last changed by alex@co.com, 2h ago — 2 permissions modified."
- `Compare roles` button opens a side-by-side diff view of any two roles (useful for reviewing "Auditor vs. Operator").
- Read-only mode for Growth tier: Panel 2 renders with all checkboxes disabled and a `🔒 Upgrade to Scale to edit` banner — no separate route needed.

---

**Tasks**:
1. DB — `custom_roles(role_id, product_id, name, key, description, cloned_from?, created_by, created_at)`, `role_permission_overrides(role_id, permission_id, granted bool, updated_by, updated_at)`, `user_permission_overrides(product_id, user_ref, permission_id, granted bool)`, `sso_group_role_mappings(product_id, group_name, role_id)`.
2. Migration seeds default role→permission matrix for all four default roles.
3. API — CRUD for custom roles + permission update endpoints:
   - `POST /roles` — create custom role (Scale only)
   - `PUT /roles/:roleId/permissions` — update permission set (Scale only); validates dependencies; returns impact preview
   - `DELETE /roles/:roleId` — delete custom role; rejects if users assigned
   - `PUT /roles/:roleId/users/:userRef/overrides` — user-level grant/deny
   - `POST /roles/:roleId/sso-mappings` — bind SSO group
4. Permission dependency graph — code-defined map: `compliance:dsar_export` requires `compliance:dsar_search`; `cases:delete` requires `cases:read`; etc.
5. Console — Permission Studio three-panel layout (Panel 1 role list + Panel 2 matrix + Panel 3 members/SSO).
6. Feature gate — `requireTier("scale")` guard on all write endpoints; Growth reads permitted; Starter/Community blocked.
7. Impact preview modal — "N users affected" with list before save confirms.
8. Audit trail — every `role_permission_overrides` write logged to `audit_events` (`entity_type: "role"`, `action: "role.permissions_updated"`).
9. Export — `GET /roles/export.json` returns full role manifest for compliance documentation.

**Effort**: ~3 weeks.

**Entry criteria**: SLICE-22 complete (permission DB schema and seed in place).

**Phase**: Post-v1, Scale feature.

**Epic refs**: EPIC-09 (Team & Roles).

#### Test Strategy — SLICE-23

**Approach: Hybrid TDD — pure-function and API contract tests written first (TDD); React UI tests written after (test-after Playwright).**

**Decision rationale**:

| Layer | Approach | Why |
|---|---|---|
| Permission dependency resolver | **TDD** | Pure function, fully specified before implementation. Tests ARE the spec. |
| Permission diff / dirty detection | **TDD** | Pure function, no side effects, all cases enumerable. |
| Feature gate logic | **TDD** | Three-state enum (community/growth/scale), trivially testable before implementation. |
| Impact preview query | **TDD** | SQL query with known seed data — write the assertion first, then the query. |
| API contract (all endpoints) | **TDD** | Full contract defined in backlog; write failing tests, then implement handlers. |
| DB migrations | **Test-after** | Infrastructure — verify it worked, don't test before it exists. |
| React Permission Studio UI | **Test-after (Playwright)** | Visual, interactive, keyboard-navigable 3-panel editor. Component API changes during development. TDD here creates fragile tests against imaginary selectors. Build first, then assert behavior via e2e. |

**Why NOT full TDD for the UI**: The three-panel layout, collapse/expand behavior, and keyboard shortcuts will evolve during implementation as UX problems surface. Writing Playwright tests against selectors that don't exist yet couples the test to a draft design, not the final behavior. Test-after captures real behavior at the right moment.

**Why TDD wins on backend**: The permission dependency graph is a directed acyclic graph fully specified in the backlog. Every node and edge is known. The unit tests that encode this graph serve as a permanent regression net — a future refactor that accidentally breaks `dsar:export → dsar:search` will be caught instantly.

**Red-Green-Refactor sequence**:
1. Write dependency resolver unit tests (NF-UNIT-100–103) → RED
2. Implement `resolveDependencies()` → GREEN
3. Write diff/dirty unit tests (NF-UNIT-104–108) → RED
4. Implement `getPermissionDiff()` → GREEN
5. Write feature gate unit tests (NF-UNIT-109–111) → RED
6. Implement `requireTier()` → GREEN
7. Write impact preview + validation unit tests (NF-UNIT-112–115) → RED
8. Implement supporting functions → GREEN
9. Write ALL integration tests (NF-INT-420–437) → RED
10. Implement repository layer + route handlers → GREEN
11. Build Permission Studio UI (three panels, interactions)
12. Write Playwright e2e tests against running app → GREEN

**Unit tests** — `tests/unit/rbac/permission-engine.test.ts` (TDD, write first):

| ID | Test | What it verifies |
|---|---|---|
| NF-UNIT-100 | `resolveDependencies({"compliance:dsar_export"})` includes `compliance:dsar_search` | Dependency auto-resolution |
| NF-UNIT-101 | `resolveDependencies({"cases:delete"})` includes `cases:read` | Destructive op requires read |
| NF-UNIT-102 | `resolveDependencies({"memory:delete"})` includes `memory:read` | Same pattern |
| NF-UNIT-103 | `resolveDependencies` is idempotent — calling twice yields same result | No side effects |
| NF-UNIT-104 | `getPermissionDiff(current, default)` returns added permissions correctly | Diff surface |
| NF-UNIT-105 | `getPermissionDiff(current, default)` returns removed permissions correctly | Diff surface |
| NF-UNIT-106 | `getPermissionDiff(same, same)` returns empty added and removed | No false positives |
| NF-UNIT-107 | Toggling any permission marks role as dirty | Dirty detection |
| NF-UNIT-108 | Resetting to default marks role as clean | Dirty reset |
| NF-UNIT-109 | `canEditRoles("scale")` returns true | Scale gate |
| NF-UNIT-110 | `canEditRoles("growth")` returns false | Growth gate |
| NF-UNIT-111 | `canEditRoles("starter")` returns false | Starter gate |
| NF-UNIT-112 | Role key `"dpo-role"` is valid slug | Key validation |
| NF-UNIT-113 | Role key `"DPO Role"` (spaces) is rejected | Key validation |
| NF-UNIT-114 | Cloning admin produces a role with all 27 permissions | Clone integrity |
| NF-UNIT-115 | `computeImpactPreview(roleId, removedPermissions, db)` returns affected user refs | Impact preview |

**Integration tests** — `tests/integration/rbac-studio-api.test.ts` (TDD, write first):

| ID | Test | Expected |
|---|---|---|
| NF-INT-420 | `POST /roles` creates custom role for Scale-tier product | 201, role_id returned |
| NF-INT-421 | `POST /roles` returns 403 for Growth-tier product | 403 |
| NF-INT-422 | `POST /roles` returns 403 for Starter-tier product | 403 |
| NF-INT-423 | `POST /roles` with `clone_from` copies source permissions exactly | 201, permission set matches source |
| NF-INT-424 | `PUT /roles/:roleId/permissions` updates permission set and persists | 200, subsequent GET reflects change |
| NF-INT-425 | `PUT /roles/:roleId/permissions` with `dsar:export` auto-adds `dsar:search` | 200, both permissions in result |
| NF-INT-426 | `PUT /roles/:roleId/permissions` response includes `impactPreview.affectedUsers` | 200, array present |
| NF-INT-427 | `PUT /roles/:roleId/permissions` writes an `audit_event` with actor + before/after diff | audit_events row exists with `action: "role.permissions_updated"` |
| NF-INT-428 | `PUT /roles/:roleId/permissions` returns 403 for Growth-tier product | 403 |
| NF-INT-429 | `DELETE /roles/:roleId` deletes a custom role with no assigned users | 200, subsequent GET returns 404 |
| NF-INT-430 | `DELETE /roles/:roleId` returns 409 if users are assigned to the role | 409, role not deleted |
| NF-INT-431 | `DELETE /roles/:roleId` returns 400 for a default role (admin/operator/leads) | 400, cannot delete defaults |
| NF-INT-432 | `PUT /roles/:roleId/users/:userRef/overrides` grants a user-level permission | 200, override persisted |
| NF-INT-433 | `PUT /roles/:roleId/users/:userRef/overrides` with `granted: false` denies a permission | 200, denial persisted |
| NF-INT-434 | `GET /roles/export.json` returns full manifest with all roles and permissions | 200, JSON with `roles[]` array |
| NF-INT-435 | `GET /roles/export.json` returns 403 for non-admin token | 403 |
| NF-INT-436 | `POST /roles/:roleId/sso-mappings` creates a group→role binding | 201, mapping persisted |
| NF-INT-437 | `POST /roles/:roleId/sso-mappings` returns 403 for Growth-tier product | 403 |

**E2E** — `console/e2e/nestfleet.spec.ts` section 12 (test-after, Playwright):

| Test | What it asserts |
|---|---|
| 12.1 — Permission Studio renders three panels | Left role list, center matrix, right members all visible |
| 12.2 — Clicking a role loads its permission matrix | Panel 2 header shows role name; permissions visible |
| 12.3 — Expanding a domain section reveals permissions | Accordion expand/collapse works |
| 12.4 — Checking a permission shows dirty indicator | Amber "N changes" badge appears in header |
| 12.5 — Save button disabled until role is dirty | Button state correct |
| 12.6 — Save triggers impact preview modal | Modal appears with affected users list |
| 12.7 — Cancel in modal reverts changes | Dirty state cleared; permissions restored |
| 12.8 — Reset to default clears customizations | All amber highlights gone; diff badge disappears |
| 12.9 — Create custom role modal: name + key + clone | Role appears in left panel after creation |
| 12.10 — Keyboard: Space toggles permission, Cmd+S opens save | Keyboard shortcuts functional |
| 12.11 — Growth tier: checkboxes disabled, upgrade callout visible | Read-only mode renders correctly |
| 12.12 — Compare roles opens side-by-side diff | Both role columns render with diff highlights |

---

## 6. Validation and QA Backlog

### VAL-01: Schema and Policy Validation — ✅ COMPLETE (2026-03-19)

**What**: Verify that every T1-T4 action passes through the deterministic validation envelope before execution.

**Tasks**:
1. Audit every state-changing action path and confirm typed proposal schema exists.
2. Test that actions with missing evidence refs are blocked.
3. Test that actions referencing unapproved source tiers are blocked.
4. Test that policy engine returns correct `allow`, `require_approval`, or `deny` for each action tier.
5. Test `abstain` behavior: when validator and proposer disagree, the action escalates to a lead.
6. Regression test: add a test case for every false-allow discovered during operation.

**Source**: `autonomy-and-approval-policy.md` sections 6 and 12. `domain-model.md` 4.14.

**Audit findings (2026-03-19)**:
- All case transitions use `transitionCase()` or `transitionAndDispatch()` — PASS.
- 6 CR transitions were bypassing `transitionChangeRequest()` via raw `updateChangeRequest()` — FIXED (change-prep-worker.ts, pr-draft-prep-worker.ts, approvals.ts, pr-drafts.ts).
- Agent output validation uses `generateObject()` with Zod schemas at the agent layer — PASS.
- All state changes produce audit events — PASS.

**Epic refs**: EPIC-04, EPIC-10.

---

### VAL-02: Retrieval Quality Checks

**What**: Ongoing verification that product memory retrieval meets quality thresholds.

**Tasks**:
1. Maintain the 20-30 prompt evaluation dataset from SPIKE-01. Expand it as new case types appear.
2. Run retrieval quality checks after every ingestion pipeline change.
3. Measure: citation accuracy, source-tier dominance, stale-source rate.
4. Define regression threshold: if citation accuracy drops below SPIKE-01 baseline by >5%, block deployment.
5. Test edge cases: queries with no matching content (should return empty evidence pack, not hallucinated content), queries matching multiple conflicting sources (should flag conflict).

**Source**: `technical-risks-and-spikes.md` 3.1. `architecture-decisions.md` ADR-006, ADR-007.

**Epic refs**: EPIC-03.

---

### VAL-03: Notification Behavior Verification — ✅ COMPLETE (2026-03-19)

**What**: Verify notification model produces acceptable operator experience under realistic load.

**Tasks**:
1. Maintain the synthetic traffic dataset from SPIKE-05. Update it as real traffic patterns emerge.
2. Test quiet hours enforcement: normal notifications deferred, critical breakthrough.
3. Test dedup: identical notifications within retry window are suppressed.
4. Test digest assembly: low-priority notifications appear in digest, not individually.
5. Test escalation timing: critical ack deadline at 10min, high at 60min.
6. Load test: 100 concurrent cases, verify notification delivery latency stays below 5 seconds for critical.
7. Test edge case: notification delivery failure → internal alert → retry.

**Source**: `notification-model.md` sections 8-14. `technical-risks-and-spikes.md` 3.3.

**Audit findings (2026-03-19)**: All notification behaviors verified — quiet hours, dedup, priority-based ack deadlines, escalation policy, AI disclosure scoping. No gaps found.

**Epic refs**: EPIC-06.

---

### VAL-04: Approval Flow Verification — ✅ COMPLETE (2026-03-19)

**What**: Verify that approval routing, decision capture, and audit trail work correctly for all approval-gated actions.

**Tasks**:
1. Test each approval routing rule from `autonomy-and-approval-policy.md` section 9: high-impact communication → Support Lead, product tradeoff → Product Lead, change approval → Change Lead, docs publication → Knowledge Lead.
2. Test one user holding multiple lead roles: approval request routes correctly, no role confusion.
3. Test approval rejection: rejected change requests update case state and emit notification.
4. Test approval timeout: unacknowledged approval requests escalate per notification policy.
5. Verify approval history is queryable by user, role, target entity, and time range.
6. Verify audit events exist for every approval request and decision.

**Source**: `autonomy-and-approval-policy.md` sections 9 and 10. `domain-model.md` 4.8. `technical-risks-and-spikes.md` 3.7.

**Audit findings (2026-03-19)**:
- RBAC guards on approve/reject — PASS (change_lead + product_lead).
- Audit events with actor info — PASS.
- Approved CR dispatches pr_draft_prep — PASS.
- Missing rejection notification to support_lead — FIXED (added NotificationService.emit() in reject handler).
- State machine prevents re-approval of terminal CRs — PASS (after HIGH-2 fix).

**Epic refs**: EPIC-05, EPIC-10.

---

### VAL-05: Auditability Verification — ✅ COMPLETE (2026-03-19)

**What**: Verify that every significant state transition produces an immutable audit event and that audit trails support compliance queries.

**Tasks**:
1. Trace a full case lifecycle (email → case → triage → resolution → close) and verify audit events at every transition.
2. Trace a full change lifecycle (case → change request → approval → PR draft → completed) and verify audit events at every transition.
3. Verify audit events are immutable: no update or delete operations allowed.
4. Test DSAR-ready search: given an identity, export all associated audit events, cases, conversations, notifications.
5. Test retention clock: verify that closed cases start a retention timer and that deletion propagates to audit references and product memory.
6. Verify correlation IDs connect audit events across the full flow.

**Source**: `legal-compliance-eu-germany.md` sections 4.5 and 8. `domain-model.md` 4.13. `system-architecture.md` section 10.

**Audit findings (2026-03-19)**: Full lifecycle audit trail verified — every case and CR state change has corresponding audit_event with before_state/after_state. Agent runs recorded in agent_runs with tokens, duration, outcome. GDPR erasure function (`eraseAgentRunOutput()`) exists. No gaps found.

**Epic refs**: EPIC-10 (Auditability & Compliance Controls).

---

### VAL-06: Regression Risk Management — ✅ COMPLETE (2026-03-19)

**What**: Prevent regression as slices accumulate.

**Tasks**:
1. Maintain an end-to-end test suite covering: email intake → case creation → triage → auto-reply (happy path) and email intake → case → change request → approval → PR draft (change path).
2. Add regression test for every bug found in production or spike evaluation.
3. Run the retrieval quality evaluation dataset as a CI gate.
4. Run the notification simulation as a periodic integration test.
5. Track abstain rate and false-allow rate as operational metrics. Alert if they drift from baseline.

**Source**: `autonomy-and-approval-policy.md` section 13 (rollout gates). `technical-risks-and-spikes.md` section 6 (exit criteria).

**Epic refs**: Cross-cutting.

---

## 7. Compliance and Governance Backlog

Each item is a concrete deliverable pulled from `legal-compliance-eu-germany.md`. These are sequenced by when they become blocking.

### CG-01: AI Disclosure Templates

**What**: Build channel-aware AI disclosure templates for all end-user-facing communication.

**Why now**: AI Act transparency obligation applies from August 2, 2026. Must be in place before any outbound auto-reply ships (SLICE-04).

**Tasks**:
1. Create email disclosure template: clear statement that the message is AI-generated or AI-assisted.
2. Ensure disclosure appears at thread start and in every AI-generated reply.
3. Make disclosure text configurable per product.

**Blocking**: SLICE-04 (outbound replies).

**Source**: `legal-compliance-eu-germany.md` section 5.4.

**Epic refs**: EPIC-10.

---

### CG-02: No Cross-Customer Training Default — ✅ COMPLETE (2026-03-19)

**What**: Implement and enforce the default that customer content is not used for cross-customer model training.

**Why now**: GDPR controller/processor boundary. Must be in place before any customer data is processed.

**Tasks**:
1. Ensure product memory is product-scoped: no cross-product content leakage.
2. Ensure model prompts do not include content from other products/customers.
3. Document the isolation model.

**Blocking**: Any production use.

**Source**: `legal-compliance-eu-germany.md` sections 4.2 and 12.

**Audit findings (2026-03-19)**: All DB queries filter by product_id. Memory retrieval scoped by product_id. Workers read authoritative product_id from DB (ADR-024). Agent prompts contain only current product's data. One minor note: escalation sweep queries across products (system-internal, acceptable). PASS.

**Epic refs**: EPIC-10.

---

### CG-03: Retention and Deletion Controls ✅ COMPLETE (2026-03-19)

**What**: Implement configurable retention windows and deletion propagation.

**Why now**: GDPR Article 17 (right to erasure) and Article 5(1)(e) (storage limitation). Must be in place before production.

**Tasks**:
1. ✅ Implement per-product retention window configuration — `retentionDays` + `autoCloseDays` stored in `support_policy` JSONB; editable via Settings API and Compliance UI.
2. ✅ Implement deletion propagation — `deleteCase()` atomically removes notifications → signals → conversations → change_requests → anonymises audit_events (PII scrubbed, structure preserved) → deletes case; wrapped in `withTransaction()`.
3. ✅ Retention sweep endpoint — `POST /api/v1/products/:productId/retention/run` finds all closed cases past `retentionDays` window and calls `deleteCase()` for each; returns per-case summary.
4. ✅ Manual case deletion — `DELETE /api/v1/products/:productId/cases/:caseId` for GDPR Art. 17 individual erasure requests; admin-only.
5. ✅ Console Compliance UI — `RetentionSection` in `/compliance` page with policy config inputs, Save Policy, Run Sweep button, and expandable per-case results.
6. ✅ Migration — `migrations/0025_retention_index.sql` adds `cases_closed_at_idx` partial index for sweep query performance.

**Delivered files**: `src/api/v1/retention.ts`, `migrations/0025_retention_index.sql`, `console/src/app/compliance/page.tsx` (RetentionSection), `src/api/v1/settings.ts` (retention schema), `console/src/lib/api.ts` (client functions).

**Test coverage** (all passing 2026-03-19):
- Integration: `tests/integration/retention-api.test.ts` — NF-INT-200–207 (DELETE case, propagation, RBAC, retention sweep pass/skip/auth)
- Integration: `tests/integration/settings-api.test.ts` — NF-INT-109–111 (retention section in GET, PUT persistence, min-30 validation)
- E2E: `console/e2e/nestfleet.spec.ts` — tests 9.9, 9.10 (RetentionSection renders, nav)

**Blocking**: Production launch.

**Source**: `legal-compliance-eu-germany.md` sections 4.3 and 4.5.

**Epic refs**: EPIC-10.

---

### CG-04: DSAR-Ready Search and Export ✅ COMPLETE (2026-03-19, updated 2026-03-19)

**What**: Implement data subject access request support: search all records by identity, export in structured format.

**Why now**: GDPR Articles 15-20. Must be operational before handling real personal data.

**Tasks**:
1. ✅ Multi-field identity search — `collectDsarData(query)` matches identities by email (exact), `display_name` (ILIKE `%query%`), or telegram handle (exact, strips leading `@`). Notifications and audit_events are then searched by all emails belonging to matched identities — ensures name/handle searches find all linked notification and audit records.
2. ✅ Structured export — JSON and CSV; CSV uses multi-section `## entity` format. Authenticated download via `fetch` + blob URL (bypasses `<a download>` auth limitation). Export scoped to canonical identity (first matched email, or raw query).
3. ✅ Console DSAR UI — collapsible search history: each search prepends to the list and auto-expands; older entries collapse to a single-line summary (identity, record-count badge, timestamp, ✕ remove); "Clear all" wipes session history.
4. ✅ Result table — 3-column table (Entity / Records / Status) with per-row Found/None badges and Total footer; zero-record rows dimmed.
5. ✅ Admin-only guard — `requireRole("admin")` on both endpoints; Compliance page hard-gates on `isAdmin`; nav item only visible to `admin` role.
6. ✅ Layout — Compliance page wrapped in `AppLayout`; sidebar always visible, consistent with all other tabs.
7. ✅ Input accepts any string ≥ 2 chars (email, name, `@handle`); backend Zod drops `.email()` constraint; frontend surfaces `ApiError.message` for meaningful validation toasts.

**Delivered files**: `src/api/v1/dsar.ts`, `console/src/app/compliance/page.tsx` (DsarSection, DsarResultTable, DsarHistoryEntry), `console/src/lib/api.ts`, `console/src/lib/permissions.ts`, `console/src/components/Sidebar.tsx`.

**Test coverage** (all passing 2026-03-19):
- Integration: `tests/integration/dsar-api.test.ts` — NF-INT-210–219 (email/name/@telegram search, unknown identity, RBAC, short-query 400, JSON export, CSV export, anonymised audit event exclusion, name→notification via resolved email)
- E2E: `console/e2e/nestfleet.spec.ts` — tests 9.1–9.8 (search input, history auto-expand, collapse/re-expand, multi-search count, clear all)

**Not yet implemented**: Rectification (update identity records and propagate) — deferred to post-launch.

**Blocking**: Production launch.

**Source**: `legal-compliance-eu-germany.md` section 4.5.

**Epic refs**: EPIC-10.

---

### CG-04-B: DSAR Semantic Search (Embedding-Based)

**What**: Extend DSAR identity lookup with pgvector embedding search so admins can find data subjects by approximate name, misspelling, or transliteration — not just exact email, display_name ILIKE, or telegram handle (which CG-04 already covers).

**Why**: At low request volume, ILIKE on the identities table is sufficient. At high volume (>10k identities or frequent GDPR requests), a vector similarity search gives sub-millisecond lookup and handles fuzzy/multilingual matches that ILIKE misses.

**Trigger**: Implement when the product handles high request volume or when non-Latin names or misspelled DSARs become a support burden.

**Tasks**:
1. At identity create/update time, generate and store an embedding for the concatenated string `"${display_name} ${email_addresses.join(' ')} ${telegram_handles.join(' ')}"` in a new `identities.dsar_embedding vector(768)` column.
2. In `collectDsarData`, add a pgvector ANN query: `ORDER BY dsar_embedding <-> $embedding LIMIT 10` and present candidate matches to the admin for confirmation before export.
3. Add a `GET /dsar/candidates?query=...` endpoint that returns ranked candidates (identity_id, display_name, emails, similarity score) without executing the full export — lets admin confirm identity before committing to export.
4. Console UI: show candidate list with similarity scores and "Search this identity" confirm button before showing full results.
5. Migration: `ALTER TABLE identities ADD COLUMN dsar_embedding vector(768)`. Add `HNSW` index: `CREATE INDEX identities_dsar_hnsw_idx ON identities USING hnsw (dsar_embedding vector_cosine_ops)`.

**Pre-condition**: CG-04 (ILIKE search) must be in production first — this is an additive upgrade, not a replacement.

**Blocking**: Nothing. Post-launch optimisation.

**Epic refs**: EPIC-10.

---

### CG-05: Typed AI Actions and Validation Records — ✅ COMPLETE (2026-03-19)

**What**: Ensure every AI-assisted action produces a typed, reviewable validation record with evidence and policy inputs.

**Why now**: Required for AI Act transparency, GDPR accountability, and the deterministic validation envelope.

**Tasks**:
1. Confirm validation record schema covers all T1-T4 actions.
2. Confirm every validation record includes: proposal type, policy version, schema version, evidence refs, validator result, decision status.
3. Confirm validation records are immutable and queryable.
4. This is mostly verified by VAL-01, but the compliance task ensures documentation and policy alignment.

**Blocking**: SLICE-04 (auto-reply requires validation record).

**Source**: `legal-compliance-eu-germany.md` section 8.2. `autonomy-and-approval-policy.md` section 6.

**Audit findings (2026-03-19)**: All agents use Zod schemas via `generateObject()`. Every agent run recorded in `agent_runs` with output_schema_version, output_valid, output_snapshot. Invalid outputs trigger error outcome. Audit write is best-effort (documented trade-off). PASS.

**Epic refs**: EPIC-04, EPIC-10.

---

### CG-06: Human Approval for Consequential Actions — ✅ COMPLETE (2026-03-19)

**What**: Verify and document that all consequential actions require human approval.

**Why now**: GDPR Article 22, AI Act governance, and `autonomy-and-approval-policy.md` section 11.

**Tasks**:
1. Audit all T3 and T4 actions. Confirm each is approval-gated.
2. Confirm forbidden actions (T5) are technically blocked, not just policy-documented.
3. Confirm no fully automated decisions with legal or similarly significant effect on natural persons.
4. Document the action tier map with approval requirements.

**Blocking**: Production launch.

**Source**: `legal-compliance-eu-germany.md` sections 5.6 and 11.1. `autonomy-and-approval-policy.md` sections 4 and 11.

**Audit findings (2026-03-19)**: All T3 actions (GitHub issues, PR drafts) are approval-gated or pre-approved by policy. T4 actions (external comms) pass through 4-gate validation. No T3/T4 bypass found. `auto_complete_on_ci_pass` operates on already-approved CRs (T2 boundary). PASS.

**Epic refs**: EPIC-04, EPIC-05, EPIC-10.

---

### CG-07: Security Baseline — ✅ COMPLETE (2026-03-19)

**What**: Implement the minimum security controls required by GDPR Article 32 and commercial viability.

**Why now**: Security is not a later-phase item. These are MVP blockers per `legal-compliance-eu-germany.md` section 8.1.

**Tasks**:
1. Encryption in transit (TLS) and at rest (database and object storage encryption).
2. Tenant and product isolation in all queries.
3. RBAC with least privilege on every operator and lead-facing action.
4. Immutable audit logs (no update/delete on audit_event table).
5. Secret management: no secrets in prompts, environment variables for credentials, rotation support.
6. Prompt and data minimization: send only the evidence pack to external models, not full conversation history.
7. Environment separation: dev, staging, production.
8. Incident response runbook (document, not code).
9. Subprocessor inventory for the cloud-connection channel only (document). Under the client-installed model, the customer manages their own subprocessor relationships.

**Blocking**: Production launch.

**Source**: `legal-compliance-eu-germany.md` sections 8.1, 8.2.

**Audit findings (2026-03-19)**:
- CORS: production requires explicit `CONSOLE_ORIGIN`, fails fast if missing — PASS.
- Security headers: X-Frame-Options DENY, HSTS, nosniff, referrer-policy — PASS.
- CSP header: added `default-src 'self'` with script/style/img/connect directives — FIXED.
- JWT: HS256 hardcoded (no algorithm confusion), secret min 32 chars — PASS.
- Bcrypt: min 10 rounds, default 12 — PASS.
- API key masking: only last 4 chars returned — PASS.
- Webhook signatures: unsigned requests now rejected with 403 — FIXED.
- Secrets in logs: Pino redaction on password, token, api_key, secret, private_key, license_key — PASS.
- RBAC on all endpoints — PASS (79 integration tests).
- Product access enforcement: `requireAuth()` now checks `:productId` against JWT `productIds` claim — FIXED.
- Prompt injection defense: 3-layer (sanitize + wrap + Zod output gate) — PASS.
- Test credentials removed from committed documentation — FIXED.

**Remediation summary**: 4 gaps found and fixed (CSP header, unsigned webhooks, productIds enforcement, test credentials in docs). 99 integration tests pass after fixes.

**Epic refs**: EPIC-10, EPIC-12.

---

### CG-08: Transfer Map for Cloud-Connection Metadata — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Document data flows for the cloud-connection channel only (license ID, version, aggregate usage counts, error type codes). Under the client-installed model, NestFleet is a software vendor, not a data processor for customer operational data. Customer data never reaches NestFleet infrastructure. The customer is responsible for their own subprocessor relationships (LLM provider, GitHub, email provider, hosting provider, object storage).

**Why now**: GDPR Chapter V applies to the cloud-connection metadata flow. A lightweight DPA covering cloud-connection metadata only must be in place before any customer installation connects to NestFleet Cloud.

**Tasks**:
1. Map data flows for the cloud-connection channel: what metadata is sent to NestFleet Cloud, what is received.
2. Document transfer mechanism for NestFleet Cloud (EU-U.S. DPF, SCCs, adequacy decision, or same-region).
3. Document that zero customer operational data (case content, conversations, code, PII) is transmitted.
4. Prepare a lightweight DPA covering cloud-connection metadata only (not a full processor DPA for customer operational data).
5. Provide customer-facing documentation of cloud-connection data flows for customer security reviews.

**Blocking**: Customer onboarding.

**Source**: `legal-compliance-eu-germany.md` section 7. `monetization-and-licensing-model.md` sections 3.2 and 4.

**Epic refs**: EPIC-10.

---

### CG-09: DPIA Template Preparation — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Prepare a customer-facing DPIA template pack. Under the client-installed model, the customer is the data controller and processor for their own operational data. NestFleet provides DPIA templates to support the customer's own compliance obligations.

**Why now**: Most NestFleet deployments will likely require a customer-side DPIA per `legal-compliance-eu-germany.md` section 4.4. Templates should be ready before customer onboarding and are delivered via the cloud-connection compliance feed.

**Tasks**:
1. Draft customer-facing DPIA template covering: processing purposes, data categories, risk assessment, mitigation measures for the customer's own NestFleet installation.
2. Draft a vendor-side DPIA for the cloud-connection metadata processing only (minimal scope).
3. Review with qualified counsel before publication.

**Blocking**: Customer onboarding.

**Source**: `legal-compliance-eu-germany.md` section 4.4.

**Epic refs**: EPIC-10.

---

### CG-10: Privacy Notice Templates — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Create privacy notice templates for AI-assisted support interactions.

**Why now**: GDPR Articles 13-14. Required before handling end-user personal data.

**Tasks**:
1. Draft privacy notice for end users interacting with NestFleet-powered support.
2. Include: identity of controller, purpose, lawful basis, data categories, retention, rights, contact details.
3. Make templates configurable per customer.

**Blocking**: Production launch.

**Source**: `legal-compliance-eu-germany.md` section 11.1.

**Epic refs**: EPIC-10.

---

### CG-11: Product Terms Restricting Prohibited Use Cases — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Create product terms that contractually and technically restrict prohibited and high-risk use cases.

**Why now**: AI Act governance and product positioning. Must be in place before any customer use.

**Tasks**:
1. Draft acceptable use policy prohibiting: HR/employment decisions, credit/insurance scoring, law enforcement, public service eligibility.
2. Implement technical enforcement: block configuration of prohibited use case types.
3. Include use-policy enforcement in the product, not just ToS language.

**Blocking**: Customer onboarding.

**Source**: `legal-compliance-eu-germany.md` sections 5.3 and 10.

**Epic refs**: EPIC-10.

---

### CG-12: BSL License Terms and Product Use-Policy Preparation — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Prepare the Business Source License terms, acceptable use policy, and product use-policy documentation for the client-installed deployment model.

**Why now**: Every production installation requires a valid BSL license. License terms and use-policy must be finalized before any customer onboarding or trial activation.

**Tasks**:
1. Draft BSL license terms: permitted uses, prohibited uses (competing hosted service), source visibility rights, conversion timeline to full open source.
2. Draft product use-policy: acceptable use, prohibited use cases (per CG-11), trial terms (30-day, time-limited, full-feature).
3. Align license terms with the tier structure from `monetization-and-licensing-model.md` section 6.2.
4. Review with qualified counsel before publication.

**Blocking**: Customer onboarding. Trial activation.

**Source**: `monetization-and-licensing-model.md` sections 5 and 6.

**Epic refs**: EPIC-10, EPIC-13.

---

### CG-13: Cloud-Connection Data-Flow Documentation for Customer Security Reviews — ✅ DRAFT COMPLETE (2026-03-19)

**What**: Prepare detailed technical documentation of the cloud-connection data flows, suitable for customer security and compliance review teams.

**Why now**: Enterprise customers will require security review of any outbound connection from their infrastructure before approving NestFleet installation. This documentation must be available at onboarding.

**Tasks**:
1. Document exactly what metadata the cloud-connection sends to NestFleet Cloud (license ID, version, aggregate usage counts, error type codes, feature flags in use).
2. Document exactly what the cloud-connection receives from NestFleet Cloud (updates, benchmarks, compliance templates, role improvements, security patches).
3. Document what the cloud-connection never sends (case content, conversations, code, PII, user identities).
4. Provide network endpoint list and protocol details for customer firewall configuration.
5. Describe the offline resilience model: product continues to run without cloud connection, no kill switch.
6. Provide a network traffic audit tool or documentation for customers to independently verify the data-flow claims.

**Blocking**: Customer onboarding. Enterprise security review.

**Source**: `monetization-and-licensing-model.md` sections 3.2 and 3.3.

**Epic refs**: EPIC-10, EPIC-13.

---

## 8. Sequencing Plan

### Phase 1: Spikes (Weeks 1-4)

| Week | Work | Dependencies |
| --- | --- | --- |
| W1-2 | SPIKE-01 (Product Memory Quality) | None |
| W1-2 | SPIKE-02 (Queue + State-Machine Orchestration) | None |
| W2-3 | SPIKE-03 (Deterministic Validation Envelope) | SPIKE-01 evaluation dataset |
| W2-3 | SPIKE-04 (GitHub Change Path) | None |
| W3 | SPIKE-05 (Notification Noise + Escalation) | None |
| W3-4 | SPIKE-06 (Configurable Role Composition) | SPIKE-02 state machine |
| W3-4 | SPIKE-07 (Identity + Approval Model) | None |
| W3-4 | SPIKE-08 (License + Cloud-Connection Channel) | None |

SPIKE-01 and SPIKE-02 run in parallel during weeks 1-2 as the two highest-risk items. SPIKE-03 depends on the evaluation dataset from SPIKE-01. SPIKE-04 and SPIKE-05 are independent. SPIKE-06 builds on the state machine from SPIKE-02. SPIKE-07 and SPIKE-08 are independent. SPIKE-08 is a low-risk enabler that can run alongside other W3-4 spikes.

### Phase 2: Enablers (Weeks 3-5, overlapping late spikes)

| Week | Work | Dependencies |
| --- | --- | --- |
| W3-4 | AE-01 (Control-Plane Skeleton) | SPIKE-02 recommendation |
| W3-4 | AE-02 (PostgreSQL Domain Model Skeleton) | SPIKE-01 + SPIKE-02 outputs |
| W4-5 | AE-03 (Product Memory Ingestion Skeleton) | SPIKE-01 output, AE-02 |
| W4-5 | AE-04 (Email Channel Connector Skeleton) | AE-01 |
| W4-5 | AE-05 (Queue and Worker Skeleton) | SPIKE-02 recommendation, AE-01 |
| W4-5 | AE-06 (License Module + Cloud Connection Skeleton) | SPIKE-08 output, AE-01 |

Enablers start in week 3 as spike findings stabilize. AE-01 and AE-02 begin as soon as SPIKE-02 produces its queue recommendation. AE-06 begins as soon as SPIKE-08 validates the license and cloud-connection model.

### Phase 3: Feature Slices (Weeks 5-16)

| Week | Work | Dependencies |
| --- | --- | --- |
| W5-6 | SLICE-01 (Intake + Signal Normalization) | AE-01 through AE-05 |
| W6-8 | SLICE-02 (Case Creation + Operator Queue) | SLICE-01 |
| W7-9 | SLICE-03 (Product Memory Ingestion + Retrieval) | SLICE-02, AE-03 |
| W8-10 | SLICE-04 (Low-Risk User-Request Response) + CG-01 (AI Disclosure) | SLICE-03, SPIKE-03 |
| W9-11 | SLICE-05 (Change Request + Approval Flow) | SLICE-02, SPIKE-04, SPIKE-07 |
| W11-13 | SLICE-06 (PR Draft Preparation) | SLICE-05 |
| W8-9 | SLICE-07 (Notification Phase 1: Basic) | SLICE-01 |
| W10-11 | SLICE-08 (Notification Phase 2: Quiet Hours, Dedup, Digest) | SLICE-07, SPIKE-05 |
| W12-13 | SLICE-09 (Notification Phase 3: Ack, Escalation, Retry) | SLICE-08 |
| W13 | **SLICE-14 (Agentic Engine Hardening)** | Phase 2 complete |
| W13-14 | **SLICE-15 (Transactional State + Dispatch)** | SLICE-14 |
| W14-15 | **SLICE-16 (Two-Phase LLM Optimization)** | SLICE-14, SLICE-15 |
| W15 | SLICE-10 (AI-Resolved Badge) | SLICE-02 |
| W15-16 | SLICE-11 (Settings Pane) | SLICE-02, EPIC-12 |
| W16 | SLICE-12 (First-Run Configuration Wizard) | SLICE-11 |
| W16+ | SLICE-13 (CI Verification & Post-Merge Feedback Loop) | SLICE-06, SLICE-11 |
| W17 | **SLICE-18 (Interactive Graph Lineage View)** ✅ | SLICE-02, SLICE-14 |
| W17 | **SLICE-19 (RBAC Management & License Control)** ✅ | SLICE-11, AE-06 |
| W17 | **SLICE-19a (RBAC Matrix Enforcement)** ✅ | SLICE-19 |
| W17 | **SLICE-19b (PlatformCloud License Bridge)** ✅ | SLICE-19, AE-06 |
| W18+ | SPIKE-09 (Analytics & Cost Analysis Dashboard) | All agent slices |
| W19+ | SLICE-20 (Analytics Dashboard Implementation) | SPIKE-09 |
| W19+ | SLICE-21 (Lineage Graph View Enhancements) | SLICE-18 |
| W20+ | SLICE-22 (Dynamic RBAC — Permission Audit, Growth tier) | SLICE-19a |
| W21+ | SLICE-23 (Dynamic RBAC — Permission Studio, Scale tier) | SLICE-22 |

Notification slices (07-09) run in parallel with the main case/change flow slices (04-06) because they share minimal code dependencies. **SA hardening slices (14-16) are sequenced before feature slices (10-13)** — correctness fixes before new features. SLICE-10 can start in parallel with SLICE-16 since they touch different layers. **RBAC + License (19, 19a, 19b) landed alongside SLICE-18 (graph lineage) in week 17.** Analytics (SPIKE-09, SLICE-20) and lineage enhancements (SLICE-21) are post-v1. **Dynamic RBAC (SLICE-22 + SLICE-23) are post-v1 platform features**, gated by tier: SLICE-22 unlocks Growth permission audit; SLICE-23 delivers the Permission Studio editor for Scale.

### Phase 4: Validation, Compliance, and Polish (Weeks 10-16, overlapping late slices)

| Week | Work | Dependencies |
| --- | --- | --- |
| W10-11 | VAL-01 (Schema + Policy Validation) | SLICE-04 |
| W10-12 | VAL-02 (Retrieval Quality Checks) | SLICE-03 |
| W11-12 | VAL-03 (Notification Behavior Verification) | SLICE-08 |
| W12-13 | VAL-04 (Approval Flow Verification) | SLICE-05 |
| W13-14 | VAL-05 (Auditability Verification) | SLICE-06 |
| W14-16 | VAL-06 (Regression Risk Management) | All slices |
| W14-15 | **SLICE-17 (Outage Routing Queue Separation)** | SLICE-14, SLICE-15 |
| W10-12 | CG-02 through CG-05 | SLICE-03 |
| W12-14 | CG-06, CG-07 | SLICE-05 |
| W14-16 | CG-08 through CG-13 | Pre-launch, pre-onboarding |

### Compliance Items Sequenced by Blocking Dependency

| Item | Blocks | Must complete by |
| --- | --- | --- |
| CG-01 (AI Disclosure) | SLICE-04 outbound replies | Before SLICE-04 ships |
| CG-02 (No Cross-Customer Training) | Any production use | Before SLICE-01 handles real data |
| CG-05 (Typed AI Actions) | SLICE-04 auto-reply | Before SLICE-04 ships |
| CG-03 (Retention + Deletion) | Production launch | Before production |
| CG-04 (DSAR Search + Export) | Production launch | Before production |
| CG-06 (Human Approval Audit) | Production launch | Before production |
| CG-07 (Security Baseline) | Production launch | Before production |
| CG-08 (Cloud-Connection Transfer Map) | Customer onboarding | Before first customer |
| CG-09 (DPIA Templates) | Customer onboarding | Before first customer |
| CG-10 (Privacy Notices) | Production launch | Before production |
| CG-11 (Product Terms) | Customer onboarding | Before first customer |
| CG-12 (BSL License Terms + Use-Policy) | Customer onboarding, trial activation | Before first customer |
| CG-13 (Cloud-Connection Data-Flow Docs) | Customer onboarding, enterprise security review | Before first customer |

---

## 9. Definition of Done Rules

### 9.1 Spike Done

A spike is done when:
- The hypothesis is confirmed or refuted with evidence.
- Success criteria are evaluated with measured results.
- A findings document exists with architecture adjustments if any.
- Prototype code is in the spike workspace, not discarded.
- Failure implications are documented if the hypothesis was refuted.

### 9.2 Enabler Done

An enabler is done when:
- The skeleton code compiles and passes basic smoke tests.
- Module boundaries are enforced (no cross-module imports outside defined interfaces).
- Database migrations run up and down cleanly.
- The enabler is consumed by at least one spike output or slice in progress.

### 9.3 Slice Done

A slice is done when:
- The stated goal is met with working end-to-end behavior.
- All included items are implemented and testable.
- Exit criteria are verified.
- Audit events exist for every significant state transition in the slice.
- Validation records exist for every AI-assisted action in the slice.
- The operator console surfaces relevant to the slice are functional.
- No known regressions in previously shipped slices (VAL-06 passes).
- License module validates feature access correctly for the target tier.
- Documentation is updated: if the slice changed env vars, schema, build process, or features, the relevant docs are updated.

### 9.4 Compliance Item Done

A compliance item is done when:
- The deliverable exists (template, implementation, documentation).
- The implementation is tested (not just documented).
- The item is reviewed against the source requirement in `legal-compliance-eu-germany.md`.
- The blocking dependency is satisfied (the slice it blocks can now ship).

### 9.5 v1 Done

v1 is done when:
- All 9 slices are complete and pass exit criteria.
- All 6 validation items pass.
- All 13 compliance items are complete.
- The following success criteria from `mvp-scope.md` section 9 are met:
  - NestFleet can intake and normalize real DocuGardener cases reliably.
  - NestFleet can auto-answer a meaningful subset of routine user requests safely.
  - NestFleet can prepare change work for bug and outage cases with clear approval routing.
  - NestFleet can produce approved PR drafts tied back to cases and change requests.
  - Auditability and notification discipline work without manual glue.
- The spike exit criteria from `technical-risks-and-spikes.md` section 6 are met:
  - Product memory is good enough for grounded answers.
  - Orchestration handles waits and approvals cleanly.
  - Low-risk automation can pass validation often enough to be useful.
  - GitHub draft flow is technically viable.
  - Notification rules do not create obvious operator overload.

---

## 10. Risks and Watchpoints

### R-01: Product Memory Quality Insufficient

**Risk**: pgvector + FTS hybrid retrieval does not produce reliable enough evidence packs for safe auto-reply.

**Impact**: SLICE-04 (auto-reply) ships in draft-only mode. Automation value is significantly reduced.

**Mitigation**: SPIKE-01 tests this explicitly. Fallback: evaluate dedicated vector DB. Worst case: all replies require human review.

**Source**: `technical-risks-and-spikes.md` 3.1. `mvp-scope.md` risk 1.

---

### R-02: Orchestration Complexity Escalates

**Risk**: The state machine + queue model becomes hard to reason about as wait states, approvals, quiet hours, and retries interact.

**Impact**: Flow bugs, audit gaps, unpredictable resume behavior.

**Mitigation**: SPIKE-02 tests the hardest flow first. If complexity is unmanageable, evaluate Temporal before committing further. Keep the queue as an execution trigger, not the source of truth (ADR-004).

**Source**: `technical-risks-and-spikes.md` 3.2.

---

### R-03: Notification Noise Erodes Operator Trust

**Risk**: Even with dedup and quiet hours, operators may receive too many notifications to act on effectively.

**Impact**: Operators ignore notifications, breaking the escalation and approval model.

**Mitigation**: SPIKE-05 simulates realistic load. Notification is phased (Phases 1-3) to allow incremental tuning. Digest windows compress low-priority traffic.

**Source**: `technical-risks-and-spikes.md` 3.3. `mvp-scope.md` risk 2.

---

### R-04: GitHub Integration Brittleness

**Risk**: Repository permissions, branch protection, rate limits, or webhook reliability make the PR draft flow unreliable.

**Impact**: The differentiating v1 edge (approved PR draft) is weakened.

**Mitigation**: SPIKE-04 tests against a real repository. Fallback: reduce v1 to issue sync only, defer PR draft to fast-follow.

**Source**: `technical-risks-and-spikes.md` 3.4. `mvp-scope.md` risk 3.

---

### R-05: Validation Abstain Rate Too High

**Risk**: The deterministic validation envelope abstains too frequently, making auto-reply nearly useless.

**Impact**: SLICE-04 delivers minimal automation. Most replies require human review.

**Mitigation**: SPIKE-03 measures abstain rate explicitly. Target: below 40%. Tuning levers: confidence thresholds, source tier requirements, validator strictness.

**Source**: `technical-risks-and-spikes.md` 3.6.

---

### R-06: Identity Integration Delays

**Risk**: OIDC integration takes longer than expected, blocking approval flows.

**Impact**: SLICE-05 (approval flow) is delayed.

**Mitigation**: SPIKE-07 tests the integration early. Fallback: ship with simplified JWT auth and manual role assignment, migrate to OIDC before production.

**Source**: `technical-risks-and-spikes.md` 3.7.

---

### R-07: AI Act Transparency Deadline

**Risk**: AI disclosure requirements apply from August 2, 2026. If outbound auto-replies ship without disclosure, the product is non-compliant.

**Impact**: Legal exposure. Customer trust damage.

**Mitigation**: CG-01 (AI Disclosure Templates) is a blocking dependency for SLICE-04. It ships before any outbound auto-reply.

**Source**: `legal-compliance-eu-germany.md` section 5.4.

---

### R-08: Scope Creep via Telegram

**Risk**: Telegram integration is requested before email-only v1 is stable.

**Impact**: Diverts effort from core v1 delivery. Telegram adds compliance overhead per `legal-compliance-eu-germany.md` section 6.4.

**Mitigation**: Telegram is explicitly deferred. The channel connector architecture (AE-04) supports adding Telegram later without rearchitecting.

**Source**: `mvp-scope.md` risk 4. `legal-compliance-eu-germany.md` section 6.4.

---

### R-09: Single-Person Lead Bottleneck

**Risk**: In early operation, one human holds all lead roles. Approval queues and escalations converge on one person.

**Impact**: Approval latency. Escalation is meaningless when the escalation target is the same person.

**Mitigation**: Role composition (SPIKE-06) handles this. Notification model should detect when escalation target equals primary target and adjust behavior. This is a known operational constraint, not a bug.

**Source**: `domain-model.md` section 13. `mvp-scope.md` section 3.

---

### R-10: Compliance Backlog Treated as Optional

**Risk**: Under delivery pressure, compliance items (CG-01 through CG-11) are deprioritized or skipped.

**Impact**: Production launch is blocked or the product ships non-compliant.

**Mitigation**: Compliance items have explicit blocking dependencies in the sequencing plan. CG-01 blocks SLICE-04. CG-07 blocks production launch. These are not negotiable deferrals.

**Source**: `legal-compliance-eu-germany.md` section 11.

---

### R-11: Cloud-Connection Channel Perceived as Phone-Home DRM

**Risk**: The cloud-connection channel may create customer friction if perceived as phone-home DRM or covert telemetry, leading to installation rejection during customer security reviews.

**Impact**: Customer onboarding delays or refusals. Enterprise security teams block the outbound connection. Reputational risk if the data-flow claims are not independently verifiable.

**Mitigation**: Document clearly that zero customer data is transmitted via the cloud connection. Provide a network traffic audit tool that customers can use to independently verify the data-flow claims. CG-13 (Cloud-Connection Data-Flow Documentation) provides the detailed technical documentation for customer security reviews. The product continues to run without the cloud connection (offline resilience), so customers can evaluate the product before approving the outbound connection.

**Source**: `monetization-and-licensing-model.md` sections 3.2 and 3.3.

---

## 10. Bug Fix Log

Bugs discovered and fixed during implementation. Kept here to prevent recurrence and inform future test coverage.

### BUG-01: agent_runs silent write failures — UUID cast on ULID IDs ✅ FIXED 2026-03-17

**File**: `src/agents/audit.ts`
**Root cause**: `writeAgentRun()` used `::uuid` PostgreSQL casts on `product_id`, `case_id`, and the `WHERE product_id` clause. ULID-prefixed IDs (`prod_01kky…`, `case_01kky…`) are TEXT, not UUIDs. The cast failed and was silently swallowed in the worker's `finally` block catch.
**Symptom**: `agent_runs` table always had 0 rows despite agents running successfully.
**Fix**: Removed all three `::uuid` casts. Columns are TEXT; no cast needed.
**Test gap**: No integration test verifies that `writeAgentRun()` actually persists rows to `agent_runs`. Add to test backlog (see Section 11).

---

### BUG-02: Lineage "Internal server error" — Zod nullable mismatch ✅ FIXED 2026-03-17

**File**: `src/infra/db/repositories/agent-runs.ts`
**Root cause**: `AgentRunRowSchema.evidence_chunk_ids` was `z.array(z.string())` but the DB column is `NULL` for all rows (feature not yet populated).
**Symptom**: `GET /lineage` returned 500 for any case with agent runs.
**Fix**: Changed to `z.array(z.string()).nullable()`.

---

### BUG-03: Hono route ordering — literal routes swallowed by `/:crId` wildcard ✅ FIXED (recurring pattern)

**File**: `src/api/index.ts`
**Root cause**: Hono resolves routes in registration order. Any router with a `/:crId` wildcard segment will swallow literal routes registered at the same path depth in subsequently-registered routers. This bit us twice:
1. `approvalsRouter`'s `/pending-approval` swallowed by `changeRequestsRouter`'s `/:crId` (fixed 2026-03-17)
2. `prDraftsRouter`'s `/pr-drafted` and `/:crId/complete` swallowed by `changeRequestsRouter`'s `/:crId` (fixed 2026-03-17)

**Rule**: Any router with literal sub-paths under `/change-requests/` must be registered **before** `changeRequestsRouter` in `api/index.ts`. The registration block in `api/index.ts` is commented to enforce this.

---

### BUG-04: Approvals "Forbidden" — admin role not superuser ✅ FIXED 2026-03-17

**File**: `src/auth/middleware.ts`
**Root cause**: `requireRole('change_lead', 'product_lead')` did not include `admin` as a wildcard pass-through.
**Symptom**: Admin user received 403 on approve/reject endpoints.
**Fix**: Added `isAdmin = user.roles.includes('admin')` short-circuit. Admin bypasses all role checks.

---

### BUG-05: Notification nodes never appeared in lineage timeline ✅ FIXED 2026-03-17

**File**: `src/api/v1/lineage.ts`
**Root cause**: `assembleLineage()` built a `notifByRef` map but never used it to emit nodes. Dead code — 21 notification rows in DB, 0 appearing in timeline.
**Fix**: Removed dead map; added loop that emits one `notification_sent` node per notification (skipping `suppressed`). Console updated with bell icon + sky-blue color for `notification_sent` in `LineageTimeline.tsx`.

---

### BUG-06: Case detail "Back" button hardcoded to /cases ✅ FIXED 2026-03-17

**File**: `console/src/app/cases/[caseId]/page.tsx`
**Root cause**: Back button used `<Link href="/cases">`. Users from `/queue` page were sent to `/cases` instead of back.
**Fix**: Replaced with `<button onClick={() => router.back()}>` to respect navigation history.

---

## 11. Test Coverage Gaps

Items that currently lack automated test coverage. Priority for the next test sprint.

| Gap | Priority | Type | Status | Notes |
| --- | --- | --- | --- | --- |
| `writeAgentRun()` persists rows to `agent_runs` | **HIGH** | Integration | ✅ NF-INT-60–65 | Added 2026-03-18 |
| `AgentRunRowSchema` parses NULL `evidence_chunk_ids` | Medium | Unit | ✅ NF-UNIT-30–33 | Added 2026-03-18 — `tests/unit/shared/agent-run-schema.test.ts` |
| `POST /change-requests/:crId/approve` | **HIGH** | Integration | ✅ NF-INT-30–34 | Added 2026-03-18 |
| `POST /change-requests/:crId/reject` | **HIGH** | Integration | ✅ NF-INT-35–38 | Added 2026-03-18 |
| `GET /change-requests/pending-approval` | Medium | Integration | ✅ NF-INT-39 | Added 2026-03-18 |
| `requireRole()` admin bypass | **HIGH** | Unit | ✅ NF-UNIT-20–25 | Added 2026-03-18 |
| `POST /cases/:caseId/send-to-change` | **HIGH** | Integration | ✅ NF-INT-40–43 | Added 2026-03-18 |
| `POST /cases/:caseId/resolve` | **HIGH** | Integration | ✅ NF-INT-44–47 | Added 2026-03-18 |
| `POST /change-requests/:crId/complete` | **HIGH** | Integration | ✅ NF-INT-50–55 | Added 2026-03-18 |
| `GET /lineage` — notification nodes appear | Medium | Integration | ✅ NF-INT-80–82 | Added 2026-03-18 — `tests/integration/lineage-notifications.test.ts` |
| `GET /lineage` — `suppressed` notifications excluded | Low | Integration | ✅ NF-INT-81 | Covered in lineage-notifications.test.ts — suppressed node absent |
| `GET /notifications` filter params | Medium | Integration | ✅ NF-INT-70–76 | Added 2026-03-18 — `tests/integration/notifications-filter.test.ts` |
| `TokenBudgetError` thrown at hard limit | Medium | Unit | ✅ NF-UNIT-34–36 | Added 2026-03-18 — `tests/unit/agents/budget.test.ts` |
| Console queue page | Low | E2E | ⏳ open | No automated UI tests in scope yet — manual verification only |
| `sanitizeUserContent()` / `prepareUserContent()` — ADR-027 prompt injection defense | **P0** | Unit | ✅ 2026-03-18 | 25 tests — tag stripping, delimiter-escape, SYSTEM injection — `tests/unit/agents/sanitize.test.ts` |
| `evaluateAbstain()` — all 4 abstain paths (audience_violation, knowledge_conflict, insufficient_tier, stale_evidence) | **P0** | Unit | ✅ 2026-03-18 | 41 tests including SPIKE-01 fresh-T3-dilution case and priority ordering — `tests/unit/memory/retrieval-service.test.ts`. **Bug found**: `audience_violation` is unreachable in production pipeline — `EvidenceChunk` does not carry `audience` field (stripped in `assembleEvidencePack`), so `(c as any).audience` is always `undefined`. See gap row below. |
| `rerankCandidates()` — composite score formula (fused × tier_weight × freshness floor) | **P0** | Unit | ✅ 2026-03-18 | Covered in `tests/unit/memory/retrieval-service.test.ts` — tier weights 1.0/0.85/0.65/0.45, freshness floor at 0.1, sort order |
| `applyVersionFilter()` — wildcard and exact-version matching | P2 | Unit | ✅ 2026-03-18 | Covered in `tests/unit/memory/retrieval-service.test.ts` — `*` passthrough, version match, version mismatch filter |
| `runAgent()` execution behavior — single-phase, two-phase, token aggregation, synthesis dedup, error translation | **P1** | Unit | ✅ 2026-03-18 | 19 tests — `generateObject` direct for single-phase, `generateText`→`generateObject` for two-phase, 100-char dedup threshold, `AI_NoObjectGeneratedError`→`StructuredOutputError`, timeout via `withTimeout`, budget pre-check — `tests/unit/agents/run-agent.test.ts` |
| **BUG**: `audience_violation` abstain reason unreachable in production — `EvidenceChunk` missing `audience` field | **P1** | Bug | ✅ 2026-03-19 | Fixed: `audience: Audience` added to `EvidenceChunk` interface (`src/memory/types.ts:69`); propagated in `assembleEvidencePack()` (`retrieval-service.ts:257`); `(c as any).audience` cast removed from `evaluateAbstain()` (`retrieval-service.ts:290`). Branch is now live. |
| RBAC enforcement — all 16 roles × endpoints per RBAC matrix (PO decision 2026-03-19) | **P0** | Integration | ✅ 2026-03-19 | **79/79 tests passing** — NF-RBAC-01 through NF-RBAC-79 — `tests/integration/rbac.test.ts`. Tests also surfaced 2 missing backend guards fixed in same session: `GET /pr-drafted` (knowledge_lead was allowed — added `requireRole` to `pr-drafts.ts:36`) and `GET /pending-approval` (support_lead/knowledge_lead were allowed — added `requireRole` to `approvals.ts:215`). |
| SEC-04: CORS `origin: ""` silent failure in production | **HIGH** | Security fix | ✅ 2026-03-19 | Fail-fast startup check added to `src/api/index.ts` — throws if `CONSOLE_ORIGIN` unset in production before app creation. `config.CONSOLE_ORIGIN!` non-null assertion used after guard. |
| SEC-05: JWT algorithm not pinned — algorithm confusion attack | **HIGH** | Security fix | ✅ 2026-03-19 | `algorithm: "HS256"` added to `signJwt()` options; `algorithms: ["HS256"]` added to `verifyJwt()` — `src/auth/jwt.ts`. |
| SEC-06: `DATABASE_URL` SSL note and `SECRET_ENCRYPTION_KEY` missing from `.env.example` | Medium | Security fix | ✅ 2026-03-19 | Added `?sslmode=require` production note to DATABASE_URL comment; added `SECRET_ENCRYPTION_KEY` placeholder with `openssl rand -base64 32` generation instructions — `.env.example`. |
| SEC-07: Missing security headers (XSS, clickjacking, MIME sniffing) | **HIGH** | Security fix | ✅ 2026-03-19 | `hono/secure-headers` middleware added to `src/api/index.ts` — sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `X-XSS-Protection: 0`. |
| SEC-08: Webhook URL, LLM API key, and CI webhook secret stored as plaintext in DB | **HIGH** | Security fix | ✅ 2026-03-20 | AES-256-GCM encryption module (`src/shared/crypto.ts`) — `encryptSecret()`/`decryptSecret()`, `enc:` prefix for backward-compat plaintext detection, 32-byte key derived from `ENCRYPTION_KEY` env var (64 hex chars), IV + ciphertext + auth tag packed as `enc:<iv_hex>:<ct_hex>:<tag_hex>`. Wired in `src/api/v1/settings.ts`: encrypt on write (LLM API key, Slack webhook URL, CI webhook secret), decrypt on read and in `test-slack` endpoint. `ENCRYPTION_KEY` added as optional Zod field to `src/shared/config.ts`. Dev pass-through (no key → plaintext stored) for zero-config local dev. |
| Worker startup parallelization — sequential `register()` calls block startup | Low | Performance | ✅ 2026-03-19 | Replaced 6 sequential `await worker.register()` calls with `await Promise.all([...])` in `src/index.ts:58`. Reduces startup latency by sum of individual registration delays. |
| CG-03: DELETE case + propagation + retention sweep | **HIGH** | Integration | ✅ 2026-03-19 | 8 tests — NF-INT-200–207 — `tests/integration/retention-api.test.ts`. Covers: 200+caseDeleted, propagation (signals/notifications deleted, audit events anonymised), 404 unknown, 401/403 RBAC, sweep deletes expired (200d > 90d window), sweep skips recent (10d < 90d), sweep 401. |
| CG-03: Retention fields in Settings API | **HIGH** | Integration | ✅ 2026-03-19 | 3 tests — NF-INT-109–111 — `tests/integration/settings-api.test.ts`. GET includes `retention` section with numeric defaults ≥ 30; PUT persists `retentionDays`/`autoCloseDays` and GET confirms; PUT rejects `retentionDays < 30` with 400. |
| CG-04: DSAR search (email / display_name ILIKE / telegram) + export | **HIGH** | Integration | ✅ 2026-03-19 | 12 tests — NF-INT-210–219 — `tests/integration/dsar-api.test.ts`. All three search modes, unknown identity zero-summary, 401/403/400(short query) guards, JSON export structure, CSV multi-section format, anonymised audit events excluded, name search resolves email for notification lookup. |
| CG-03/CG-04: Compliance page — DSAR history + RetentionSection | Medium | E2E | ✅ 2026-03-19 | 10 tests — 9.1–9.10 — `console/e2e/nestfleet.spec.ts`. AppLayout renders, DSAR search flow, history auto-expand, collapse/re-expand, multi-search counter, clear-all, RetentionSection inputs + buttons, sidebar nav. |
| Vitest + Colima: integration test runner incompatibility | Low | Infra | ✅ 2026-03-19 | `vitest.integration.config.ts` — added `DOCKER_HOST` (Colima socket) and `TESTCONTAINERS_RYUK_DISABLED=true` to `env` block. Ryuk bind-mounts the Docker socket path which Colima does not support; disabling it fixes "error while creating mount source path" on macOS. `DOCKER_HOST` falls back to `process.env.DOCKER_HOST` so CI (Linux) is unaffected. |
| SLICE-22: Permission seed integrity + audit API | **HIGH** | Unit + Integration | ✅ 2026-03-19 | 10 unit tests (NF-UNIT-90–99) GREEN: seed completeness, role isolation, no duplicate grants, naming convention. 9 integration tests (NF-INT-400–408) GREEN: GET /roles shape, per-role permission sets, 401/403 RBAC, tier gate. `tests/unit/rbac/permission-seed.test.ts`, `tests/integration/rbac-audit-api.test.ts`. Settings → Roles & Permissions tab: read-only checkmark/X view with upgrade banner for non-Scale. |
| SLICE-23: Permission engine logic + Studio API + UI | **HIGH** | Unit + Integration + E2E | ✅ 2026-03-19 | 16 unit tests (NF-UNIT-100–115) GREEN: dependency resolver, diff/dirty detection, tier gate, key validation, clone integrity, impact preview. 18 integration tests (NF-INT-420–437) GREEN: custom role CRUD, permission update + auto-dependency, impact preview, audit trail, user overrides, SSO mappings, export, tier gates. 11 E2E tests (12.1–12.11) written test-after in `console/e2e/nestfleet.spec.ts` section 12 (12.12 compare roles skipped — UI feature not yet implemented). Files: `tests/unit/rbac/permission-engine.test.ts`, `tests/integration/rbac-studio-api.test.ts`, `src/rbac/permission-engine.ts`, `src/infra/db/repositories/roles-studio.ts`, `migrations/0026_permissions_studio.sql`, `src/api/v1/roles.ts`. Total test count: ~556 unit + ~284 integration + ~49 E2E. |

---

## 12. Post-v1 Integration Roadmap

Canonical integration plan for channels, connectors, and API surface. Aligned with PO analysis 2026-03-19.

### 12.1 Strategy

NestFleet organically embeds into a product team's existing toolchain rather than replacing it. Every integration is either:

- **Inbound signal source** — where users or developers file issues, ask questions, or report outages (email, Discord, Jira, Linear). NestFleet ingests these as Signals through the channel adapter boundary (ADR-005), normalising them into the same case pipeline regardless of origin.
- **Outbound change sync** — where NestFleet-authored change requests are written back to the product's existing issue tracker (GitHub Issues today; Linear and Jira in v2). This is the "complement, don't replace" principle: NestFleet does not own the ticket — it acts on it and syncs state.
- **Operator notification channel** — where alerts reach the team (email today; Slack and optionally Teams later).
- **API surface** — enabling customers to build their own portal UI on top of NestFleet's data.

Work management tools (Linear, Jira, Asana) are **bidirectional** signal sources, not outbound-only connectors. A bug filed in Linear by a developer carries the same operational weight as a bug emailed in by a user. NestFleet should ingest both and correlate them.

### 12.2 Phased Roadmap

| Phase | Items | Rationale |
|-------|-------|-----------|
| **v1 (current)** | Email (inbound + outbound), GitHub webhooks + REST | Prove the core loop with a single channel and a single change management system |
| **v1.5 — fast-follow** | Telegram (DEFERRED-01), multi-inbox email (DEFERRED-02), CR inline edit before approve (DEFERRED-19) | Already committed; Telegram deferred for legal reasons only, not fit reasons. Inline edit addresses the "AI is 80% right" gap. |
| **v2.0 — in-product support** | Chat widget (DEFERRED-05), Contact Forms (DEFERRED-13), Slack notifications (DEFERRED-12) | Bundle that makes NestFleet competitive for in-product support; Slack is a quick win for operators |
| **v2.1 — community + API + work management** | Linear bidirectional (DEFERRED-14), Discord inbound (DEFERRED-15), Jira bidirectional (DEFERRED-16), Headless Portal / Public API (DEFERRED-17) | Developer-ICP differentiation; Linear + Discord are highest-fit for startup/scale-up engineering teams |
| **Post-v2 / conditional** | MS Teams (DEFERRED-18), Asana, third-party Help Center webhooks | Only if enterprise ICP pivot or specific customer demand; wrong ICP fit for current target |

### 12.3 Integration Inventory

| ID | Integration | Direction | Type | Phase | ICP Fit | Effort |
|----|-------------|-----------|------|-------|---------|--------|
| — | Email | Bidirectional | Channel adapter | v1 ✅ | High | Done |
| — | GitHub | Bidirectional | Change management | v1 ✅ | High | Done |
| DEFERRED-01 | Telegram | Inbound signal + reply | Channel adapter | v1.5 | Medium (EU legal risk) | Medium |
| DEFERRED-12 | Slack | Outbound operator alert | Notification adapter | v2.0 | High | Low |
| DEFERRED-05 | Chat widget | Inbound signal + reply | Channel adapter | v2.0 | High | Medium |
| DEFERRED-13 | Contact Forms | Inbound signal (structured) | Channel adapter | v2.0 | High | Low–Medium |
| DEFERRED-14 | Linear | Bidirectional (signal in + change sync out) | Signal + work mgmt | v2.1 | High | Medium |
| DEFERRED-15 | Discord | Inbound signal | Channel adapter | v2.1 | High (dev tools ICP) | Medium |
| DEFERRED-16 | Jira | Bidirectional (signal in + change sync out) | Signal + work mgmt | v2.1 | Medium | Medium |
| DEFERRED-17 | Headless Portal / Public API | Outbound (API) | API maturity | v2.1 | Medium–High | Low (API exists) |
| DEFERRED-18 | MS Teams | Outbound operator alert | Notification adapter | Post-v2 | Low (current ICP) | Medium |
| DEFERRED-19 | CR inline edit before approve | Edit proposed diff/description in console before approval | Console UX | v1.5 | **Critical** | Medium |
| — | Asana | Bidirectional | Work mgmt | Post-v2 | Low | Medium |
| — | Help Center (Plain/Crisp webhook) | Inbound signal | Channel adapter | Post-v2 | Medium | Low |

### 12.3.1 DEFERRED-19: CR Inline Edit Before Approve

**Problem:** When AI agents produce a fix that is 80% correct, the Lead has only two options today: (1) reject with feedback and wait for the AI to re-draft, or (2) approve as-is and manually edit the PR in GitHub after creation. Neither is efficient. The Lead should be able to adjust the proposed change directly in the NestFleet console and approve the corrected version in one action.

**Scope:**

| Component | Work |
|---|---|
| **Console UI** | Add a code editor panel (Monaco or CodeMirror) to the CR detail page (`/approvals/[crId]`). Shows the proposed diff in editable mode. "Approve as-is" and "Approve with edits" buttons. |
| **API** | Extend `POST /approve` to accept an optional `editedContent` field containing the Lead's modifications (edited description, edited PR body/diff instructions). |
| **PR Draft Worker** | When `editedContent` is present, use the Lead's version instead of the AI's original proposal when creating the GitHub PR. |
| **Audit trail** | Record that the CR was "approved with edits" (vs "approved as-is") in the audit event, including a diff of what was changed by the human. |

**Acceptance criteria:**
- [ ] Lead can view the AI's proposed change in an editable code/text panel
- [ ] Lead can modify the proposal and click "Approve with edits"
- [ ] The resulting GitHub PR contains the Lead's edits, not the AI's original
- [ ] Audit log records the human edit with before/after diff
- [ ] "Approve as-is" still works unchanged (no regression)
- [ ] Reject flow unchanged

**Phase:** v1.5 (fast-follow). Not blocking pilot — Leads can use GitHub's PR editor as a workaround during v1.

**Effort:** ~8-10h (3h UI editor + 2h API changes + 2h worker logic + 1-2h tests)

### 12.3.2 DEFERRED-01: Telegram Channel Adapter

**Problem:** EU/startup customers frequently use Telegram for internal ops and support escalation. Without a Telegram adapter, NestFleet cannot ingest signals from or reply via Telegram, leaving a segment of the target ICP underserved. Deferred from v1 for legal reasons (see constraints below), not fit reasons.

**Scope:**

| Component | Work |
|---|---|
| **Telegram Bot** | Register bot via BotFather; store `TELEGRAM_BOT_TOKEN` in env. Support both webhook mode (production) and polling mode (dev). |
| **Channel Adapter** | Implement `ChannelAdapter` interface per ADR-005. Map `Message` → `Signal` with `source_type: "telegram"`, extracting text, sender username, chat ID, and thread ID for group topics. |
| **Inbound router** | `POST /api/v1/webhooks/telegram` — validate `X-Telegram-Bot-Api-Secret-Token` header, parse `Update` object, route `message` and `callback_query` events. |
| **Outbound reply** | `telegram-transport.ts` — `sendTelegram(chatId, text, opts?)` via Bot API `sendMessage`. Support `reply_to_message_id` for threading. Markdown V2 formatting for rich replies. |
| **Config** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (for header validation), optional `TELEGRAM_ALLOWED_CHAT_IDS` (allowlist for private/group chats). |
| **Console UI** | Telegram configuration wizard in Settings → Notifications: bot username display, webhook status, test message button (mirroring Slack test-slack pattern). |
| **Notification delivery** | Extend `notify-agent` to dispatch via `telegram-transport` when case actor has a linked Telegram chat ID. |

**Legal / EU Constraints:**
- Telegram servers are not EU-hosted — assess GDPR data processing agreement availability before enabling for EU customers.
- Recommend offering Telegram as opt-in per product with explicit DPA acknowledgement in the onboarding wizard.
- Do not store Telegram message content in NestFleet DB beyond what is needed to create a `Signal` — apply same retention policy as email.

**Acceptance criteria:**
- [ ] Inbound Telegram message creates a `Signal` and progresses through the triage pipeline
- [ ] Agent auto-reply is delivered back to the originating Telegram chat (DM and group)
- [ ] Webhook secret validation rejects unauthenticated requests
- [ ] `TELEGRAM_ALLOWED_CHAT_IDS` allowlist blocks unknown chats when set
- [ ] Console shows bot connection status and supports test message
- [ ] EU legal notice shown during Telegram setup wizard

**Phase:** v1.5 (fast-follow). Workaround during v1: customers can email from Telegram using a forwarding bot.

**Effort:** ~12-16h (3h bot setup + 4h adapter + 2h outbound + 3h console wizard + 2h tests + 2h legal copy)

### 12.4 Architecture Constraints

- All channel adapters must implement the `ChannelAdapter` interface behind ADR-005. No channel-specific logic inside the ingress pipeline.
- All inbound adapters produce a `Signal` record with `source_type` set to the adapter name (`email`, `telegram`, `discord`, `linear`, `jira`, `contact_form`). Signal normalisation is adapter responsibility; downstream agents are source-agnostic.
- All outbound change sync adapters must implement idempotent write: if the external issue already exists (matched by `external_ref`), update it rather than creating a duplicate.
- The Headless Portal API (DEFERRED-17) is blocked on SEC-01 fix (product-scoped authorization). Publishing a public API before SEC-01 is fixed would expose cross-tenant data.
- Linear and Jira adapters share connector infrastructure with the GitHub adapter (ADR-008: mirror state, don't outsource). Change request state transitions in NestFleet are the source of truth; external issue trackers are sync targets, not owners.

### 12.5 Open Questions

| ID | Question | Affects |
|----|----------|---------|
| OQ-INT-01 | For Linear + Jira bidirectional sync: when a developer closes an issue externally (not through NestFleet approval), should NestFleet auto-close the linked change request or flag it for operator review? | DEFERRED-14, DEFERRED-16 |
| OQ-INT-02 | Should Discord support be limited to forum channels (public, structured) or also include DMs to the support bot (private, unstructured)? | DEFERRED-15 |
| OQ-INT-03 | For the Headless Portal API: should external callers authenticate with the same JWT as operators, or with a separate long-lived API token per product? | DEFERRED-17 |
| OQ-INT-04 | Contact Forms: should the JS snippet be self-hosted by the customer or served from NestFleet's CDN? Self-hosted avoids CDN dependency but increases customer ops burden. | DEFERRED-13 |

---

## 13. Billing & Monetisation Backlog

> Added 2026-03-19. Updated 2026-03-19 after PlatformCloud audit.
> Canonical pricing spec: `docs/revised-pricing-tiers.md`. Canonical monetisation spec: `docs/monetization-and-licensing-model.md`.
> Agreed model: **Community (free) / Starter ($99) / Growth ($499) / Scale (custom)**. Trial = Starter features, 30 days, no card. Pattern B.

### 13.0 PlatformCloud — Current State (audited 2026-03-19)

PlatformCloud (`../Platformcloud`) **is implemented** as a Hono/TypeScript service on SQLite. What exists:

| Component | Status | Notes |
|-----------|--------|-------|
| License validation endpoint (`POST /api/v1/license/validate`) | ✅ Built | Returns `plan: "FREE"\|"PRO"\|"TEAM"` + features array |
| Offline license file generation (`POST /api/v1/license/generate-offline`) | ✅ Built | Produces Ed25519-signed JSON (base64), **not JWT** |
| Update manifest delivery | ✅ Built | |
| Eval benchmark serving | ✅ Built | |
| Compliance template serving | ✅ Built | DocuGardener frameworks only (SOC2/GDPR/HIPAA/ISO27001/PCI_DSS) |
| Telemetry ingestion | ✅ Built | Fire-and-forget, opt-in |
| Stripe / payments / checkout | ❌ Missing | |
| Subscription management | ❌ Missing | |
| Customer portal session | ❌ Missing | |
| License creation UI / self-serve provisioning | ❌ Missing | Admin inserts directly into SQLite |
| Webhook handlers | ❌ Missing | |
| NestFleet feature matrix | ❌ Missing | Features are DocuGardener-specific |
| New plan names (COMMUNITY/STARTER/GROWTH/SCALE) | ❌ Missing | DB + code use FREE/PRO/TEAM |

**Critical structural issue — license format mismatch:**
- PlatformCloud `generate-offline` produces: Ed25519-signed JSON `{ license_key_id, org_name, plan, expires_at, issued_at, product, signature }`
- NestFleet `validateLicense()` reads a file and calls `jwt.verify(token, secret)` expecting JWT fields `{ sub, tier, productLimit, features, issuedAt, expiresAt, customerId, customerName }`
- These formats are **completely incompatible**. The offline license file cannot currently be used by NestFleet. Tracked as BIL-C07.

### 13.1 NestFleet Engine (this repo)

| ID | Item | Priority | Depends on | Notes |
|----|------|----------|------------|-------|
| BIL-01 | **License payload** — replace `max_ai_actions_monthly` with `max_outcome_units_monthly` | High | PC-BIL-09 (new license format) | Update `LicensePayload` type in `src/license/types.ts`. Blocked until license format is agreed (BIL-C07). |
| BIL-02 | **Outcome Unit tracker** — count OUs consumed per installation per month | High | BIL-01 | Local counter only; no phone-home of case content. Count events: case resolved, PR merged, release verified. Store in DB with monthly rollup. |
| BIL-03 | **OU consumption events** — emit OU event at the right lifecycle points | High | BIL-02 | Hook into: case status → `resolved`/`closed`, CR status → `completed` (merged PR), deploy status → `verified`. One OU per qualifying transition. |
| BIL-04 | **OU limit enforcement** — soft-block new case intake when monthly limit reached | Medium | BIL-02, BIL-03 | Soft block: accept signal, queue case, notify operator. Hard block deferred. Show warning in console at 80% and 100% of limit. |
| BIL-05 | ✅ **"Powered by NestFleet" signature** — append to outbound replies on Community tier | Low | — | Implemented in `src/workers/auto-reply-worker.ts` (lines 185–189). Email path: appends `\n\n---\nPowered by NestFleet · nestfleet.io` when `productTier === "community"`. No other outbound reply connectors exist yet. ✅ (2026-03-20) |
| BIL-06 | **Trial expiry enforcement** — downgrade to Community limits on day 31 | Medium | BIL-01 | `validateLicense()` already checks `expiresAt`. On expiry: tier becomes `community`, feature gates apply. Data preserved; no deletion. |
| BIL-07 | ✅ **Tier-feature alignment audit** — add `requireTier()` guards where missing + full capability model | High | — | Permission Studio = Scale ✅. `/analytics/cost` → Starter ✅. `/analytics/agents`, `/analytics/operations` → Growth ✅. `/analytics/cases`, `/analytics/memory` → Growth ✅ (bugs found and fixed 2026-03-20). Known-issue match skipped below Growth ✅. CI auto-complete skipped below Growth ✅. Knowledge Capture dispatch → GROWTH_GATED_ACTIONS ✅. Community auto-reply forces human approval ✅. Community branding footer ✅. Three-Category Enforcement Model documented (§6.3) ✅. PlatformCloud PRODUCT_REGISTRY updated to Category B flags only ✅. RBAC × Tier consistency audit: two-layer composition model verified, all four default roles audited ✅ (2026-03-20). FEATURE_CATALOG constant (`src/rbac/feature-catalog.ts`) + §6.4 spec section ✅ (2026-03-20). |
| BIL-08 | ✅ **Console tier-aware rendering** — gate features by license tier in the frontend | Medium | BIL-07 | Completed 2026-03-20. `useLicense` SWR hook (`console/src/lib/useLicense.ts`) — fetches `/api/v1/license/status`, exposes `tier`, `features`, `license`, `tierAtLeast()`, refreshes every 5 min ✅. `TierGate` component (`console/src/components/TierGate.tsx`) — wraps any content, renders upgrade prompt when tier < required ✅. Analytics page — 6 tabs tier-gated: Overview (Community), Cost & Tokens (Starter), Agent Performance / Case Analytics / Knowledge Health / Operations (Growth); locked tabs show lock icon + tier badge; SWR keys null when locked (no wasted 403s) ✅. Sidebar footer — tier pill + Products X/N mini usage bar with colour coding (green → amber at 70% → red at limit) ✅. Settings → License & Plan section redesigned — plan header card with products bar, "Included in [tier] plan" feature highlights with behavioral notes (e.g. AI Auto-Reply autonomous vs approval-gated), "Unlock with [next tier]" teaser section ✅. Note: Roles & Permissions domain-grouping confirmed correct UX (user verified 2026-03-20) — feature-group reorganisation not required. |
| BIL-09 | ✅ **Landing page plan comparison** — use `FEATURE_CATALOG` labels verbatim | Medium | BIL-07 | Completed 2026-03-20. `console/src/lib/feature-catalog.ts` — console-side presentational copy of catalog data (no engine deps), exports `getFeaturesForTier`, `getNewFeaturesAtTier`, `getLockedTeaserFeatures`, `getTierNote` ✅. `PricingSection.tsx` rewritten — plan cards now drive feature lists from catalog via `getNewFeaturesAtTier(tier)` (verbatim labels), `tierBehavior` notes inline (e.g. AI Auto-Reply approval-gated vs autonomous), locked teaser rows from `getLockedTeaserFeatures` ✅. Plan limits (product count, OU quota, support tier) kept hardcoded in `PLANS` array as they are not FEATURE_CATALOG items ✅. |

### 13.2 PlatformCloud — Work Required

| ID | Item | Priority | Blocks | Notes |
|----|------|----------|--------|-------|
| PC-BIL-09 | **License format unification** — decide and implement one format for offline license files that both NestFleet and DocuGardener can read | **Critical** | BIL-01, all NestFleet license work | Two options: (A) NestFleet adopts Ed25519 JSON reader — requires rewriting `validateLicense()`. (B) PlatformCloud switches to JWT — requires rewriting `generateOfflineLicense()`. Recommend **Option B** (JWT is standard, NestFleet validator is already built). |
| PC-BIL-10 | **Plan name migration** — rename `FREE→COMMUNITY`, `PRO→STARTER/GROWTH` split, `TEAM→SCALE` in DB + validation endpoint | High | BIL-07 (gate accuracy), all tier logic | `cloudPlanToTier()` in NestFleet now handles both old and new names (forward-compatible). Migration can be phased. |
| PC-BIL-11 | ✅ **NestFleet feature matrix** — NestFleet-specific Category B flags in `PRODUCT_REGISTRY` | High | BIL-07 | Implemented 2026-03-20. Registry contains only Category B (non-ordinal) flags: `website_widget_channel` (Starter+), `telegram_channel` (Growth+, deferred), `slack_channel` (Growth+), `discord_channel` (Scale+), `internal_api_channel` (Scale+), `basic_compliance_templates` (Starter+), `gdpr_ai_act_templates` (Growth+), `custom_compliance_bundles` (Scale+), `sso_saml` (Scale+). Ordinal capabilities (`known_issue_matching`, `policy_builder`, `permission_audit`, `permission_studio`, etc.) removed — those are enforced by `requireTier()` in the engine, not by JWT flags. See §6.3.3 and §6.3.5. |
| PC-BIL-12 | **`max_outcome_units_monthly` in license payload** — add OU limit to issued license | High | BIL-01 | Per tier: community=100, starter=1000, growth=10000, scale=100000. |
| PC-BIL-01 | ✅ **Stripe Products + Prices** — configure Community / Starter / Growth / Scale in Stripe | High | PC-BIL-02, PC-BIL-03 | `scripts/stripe-setup.ts` creates Products + Prices idempotently. Prints env vars (`STRIPE_PRICE_*`) to set. ✅ (2026-03-20) |
| PC-BIL-02 | ✅ **Self-serve checkout endpoint** — `POST /api/v1/billing/checkout` → Stripe Checkout URL | High | Console WAVE-6 CTA | Looks up license by key, creates/reuses Stripe customer, returns checkout URL. Scale → sales email (no price ID). ✅ (2026-03-20) |
| PC-BIL-03 | ✅ **Stripe webhook handler** — re-issue license on subscription change | High | BIL-06, console downgrade notice | `POST /api/v1/billing/webhook`. Handles `checkout.session.completed`, `subscription.updated/deleted`, `invoice.payment_failed/succeeded`. 14-day grace on failure. ✅ (2026-03-20) |
| PC-BIL-04 | ✅ **Customer Portal session** — `POST /api/v1/billing/portal` → Stripe Portal URL | Medium | Console WAVE-6 manage billing | Body: `{ license_key, return_url }`. Looks up `stripe_customer_id` on license. ✅ (2026-03-20) |
| PC-BIL-07 | ✅ **Trial license issuance** — `POST /api/v1/billing/trial` → 30-day trial + JWT | High | BIL-06 | No card required. `plan='trial'`, `max_outcome_units_monthly=1000`. Prevents duplicate trial per `org_id`. Also adds `GET /api/v1/billing/license/:key` for JWT refresh. ✅ (2026-03-20) |
| PC-BIL-08 | **Usage metadata ingestion** — accept aggregate OU counts from installations | Low | BIL-02, BIL-03 | Already has telemetry endpoint; extend `metrics_json` schema to include `outcome_units`. |

### 13.3 Dependency Graph

```
PC-BIL-09 (license format) ────────► BIL-01 (OU in payload)
                                           │
PC-BIL-10 (plan names) ─────────────── (parallel, independent)
PC-BIL-11 (NestFleet features) ─────── (parallel, independent)
PC-BIL-12 (OU limit in payload) ───────┤
                                        ▼
PC-BIL-07 (trial issuance) ────────► BIL-06 (trial expiry)

BIL-07 (feature gate audit) ── no dependencies, start immediately

BIL-02 + BIL-03 (OU events) ───────► BIL-04 (OU enforcement)
                                    └► Console WAVE-6: usage display

PC-BIL-01 → PC-BIL-02 (checkout) ─► W6-02 (Settings → Plan upgrade CTA)
PC-BIL-03 (webhook, grace_until) ──► W6-04 (grace period banner)
PC-BIL-04 (portal) ────────────────► W6-02 (manage billing button)
PC-BIL-07 (trial issuance) ────────► W6-01 + W6-05 (sidebar nudge + trial countdown)
BIL-02 + BIL-03 (OU tracking) ─────► W6-06 (OU usage bar — deferred within WAVE-6)

W6-02 (Settings → Plan) ───────────► W6-01 (sidebar nudge links here)
                                    └► W6-03 (TierGate links here)
```

**Recommended sequencing:**
1. ~~**Now**: BIL-07 (feature gates — no deps, revenue protection)~~ ✅ done
2. ~~**PC first sprint**: PC-BIL-09 (format), PC-BIL-10 (names), PC-BIL-11 (features), PC-BIL-12 (OU limits)~~ ✅ done
3. ~~**NestFleet after PC sprint 1**: BIL-01, BIL-02, BIL-03, BIL-06~~ (BIL-05 ✅, remainder pending)
4. ~~**PC second sprint**: PC-BIL-01–04, PC-BIL-07 (Stripe)~~ ✅ done (2026-03-20)
5. ~~**Console WAVE-6**: W6-02 → W6-01 → W6-03 → W6-04 → W6-05~~ ✅ done (2026-03-20). W6-06 deferred (blocked on BIL-02/03)
6. **NestFleet OU chain**: BIL-01 → BIL-02 → BIL-03 → BIL-04, then wire W6-06

### 13.4 Concerns & Open Questions

| ID | Concern | Severity | Resolution |
|----|---------|----------|------------|
| BIL-C01 | `isFeatureEnabled()` previously gave trial tier full access. Now removed (Pattern B). Trial marketing copy must set correct expectations. | High | Update landing page trial CTA copy before shipping PC-BIL-07. |
| BIL-C02 | ~~`is_system = TRUE` backfill ran manually~~ — **Resolved**. `0028_operator_users_is_system.sql` includes `UPDATE operator_users SET is_system = TRUE` — migration-only installs are correct. | Resolved | — |
| BIL-C03 | ~~`cloudPlanToTier()` expected new names~~ — **Resolved**. Now handles both `FREE/PRO/TEAM` (current) and `COMMUNITY/STARTER/GROWTH/SCALE` (future) for forward compatibility. | Resolved | — |
| BIL-C04 | `LicensePayload` does not yet have `max_outcome_units_monthly`. Blocks BIL-01 and all OU work. | Medium | Blocked on PC-BIL-09 (format decision) + PC-BIL-12. |
| BIL-C05 | ~~`requireTier()` guards missing~~ — **Resolved by BIL-07** 2026-03-19/2026-03-20. `/analytics/agents`, `/analytics/operations` → Growth ✅ (2026-03-19). `/analytics/cases`, `/analytics/memory` → Growth ✅ (missed in first pass, found during RBAC×Tier audit 2026-03-20 and fixed). Known-issue match + CI auto-complete + Knowledge Capture all gated ✅. | Resolved | — |
| BIL-C06 | ~~PlatformCloud not deployed~~ — **Revised**. PlatformCloud is implemented and running. Billing (Stripe) is not yet built. Console WAVE-6 is blocked on PC Stripe sprint (items PC-BIL-01 through PC-BIL-04). | Revised | See sequencing above. |
| BIL-C07 | **License format mismatch** — PlatformCloud issues Ed25519-signed JSON; NestFleet reads JWT via `jwt.verify()`. Offline license files issued by PlatformCloud today **cannot be read by NestFleet**. This is a critical blocker for any customer installation. | **Critical** | PC-BIL-09 must decide the format. Recommendation: PlatformCloud switches to JWT (HMAC-SHA256 or Ed25519-signed JWT) so NestFleet's existing validator works. DocuGardener may also need updating if it currently reads the Ed25519 JSON format. |
| BIL-C08 | PlatformCloud uses **SQLite**. Acceptable for current scale (single-instance, low write volume). Becomes a bottleneck if multiple PlatformCloud instances are needed or write concurrency increases with billing webhooks. | Low | Note for architecture review before billing launch. PostgreSQL migration path should be documented. |

### 13.5 PlatformCloud Architecture Work

> These items are prerequisites for sustainable multi-product billing and secure admin operations. Not Stripe-specific — they need to be done once before the billing sprint begins.

| ID | Item | Priority | Blocks | Notes |
|----|------|----------|--------|-------|
| PC-ARCH-01 | **Product registry** — introduce `PRODUCT_REGISTRY` in PlatformCloud that maps each product (`nestfleet`, `docugardener`, …) to its own plan structure, feature matrix, and OU tier limits | High | PC-BIL-10, PC-BIL-11 | Currently the feature matrix is hardcoded for DocuGardener only. NestFleet has a different plan vocabulary and feature set. The registry decouples products so each can evolve independently without touching shared code. Keys validated at license-generate and validate endpoints. |
| PC-ARCH-02 | **Admin API token scoping** — replace single `PLATFORM_ADMIN_SECRET` env var with scoped tokens: `platform_owner` (all), `billing_automation` (billing endpoints only), `product_admin` (product/license endpoints), `read_only` | Medium | PC-BIL-01 (Stripe webhook uses `billing_automation` token) | Current single secret grants full admin access to any caller that has it. Stripe webhooks, CI/CD, and human admins should use separate tokens with minimum required scope. |

---

### 13.6 Console WAVE-6 — Plan & Billing UX

> Unblocked as of 2026-03-20 (PC Stripe sprint complete). These items wire the console to PlatformCloud's billing endpoints and create a coherent, proactive upgrade path. The guiding principle: **Profile = personal user settings; Settings → Plan = org-level billing** — plan management lives in Settings, not Profile.
>
> Architecture decision (2026-03-20): TierGate prompts are contextual and stay, but they must link to Settings → Plan rather than dead-ending. The primary proactive upgrade path is: sidebar nudge → Settings → Plan → Stripe checkout.

| ID | Item | Priority | Depends on | Notes |
|----|------|----------|------------|-------|
| W6-01 | ~~**Sidebar upgrade nudge** — persistent "Upgrade" pill for Community and trial tiers~~ ✅ done (2026-03-20) | High | BIL-08 (sidebar tier pill exists) | "Upgrade plan" button in sidebar footer for non-paid tiers (`!isPaid`). Trial: shows days remaining (amber ≤7d, red ≤3d). Paid tiers: hidden. Navigates to `/settings?section=plan`. |
| W6-02 | ~~**Settings → Plan tab** — first-class plan management destination~~ ✅ done (2026-03-20) | High | PC-BIL-02, PC-BIL-04 | Plan & Billing tab in Settings. Shows current plan, Stripe checkout CTA (POST `/api/v1/license/checkout`), Stripe portal link (POST `/api/v1/license/portal`). Deep-linked via `?section=plan`. Stripe return handling: `?upgraded=1` triggers license refresh with retry (3× × 3s), SWR cache bust, and status banners. `?canceled=1` shows gray notice. Price consistency fixed: $99/$499 monthly, $79/$399 annually (matches landing page). `canUpgrade = !isPaid` (dev tier included). |
| W6-03 | ~~**TierGate → Settings → Plan link** — upgrade prompts are not dead ends~~ ✅ done (2026-03-20) | High | W6-02 | `TierGate.tsx`: `href="/settings?section=plan"`, label changed to `"View plans →"`. |
| W6-04 | ~~**Grace period / payment failure banner** — top-of-screen notice when license is in grace~~ ✅ done (2026-03-20) | High | PC-BIL-03 (sets `grace_until`) | New `GracePeriodBanner.tsx` — amber banner when `isInGrace` is true, "Update payment →" calls `billingPortalApi` and redirects. Injected in `AppLayout.tsx` between Header and main. |
| W6-05 | ~~**Trial expiry countdown** — urgency signal for trial users~~ ✅ done (2026-03-20) | Medium | W6-01, W6-02 | Sidebar footer countdown: `trialDaysRemaining` from `useLicense()`. Colour: ≤3d red, ≤7d amber, else gray. "Trial expires today" on day 0. Also surfaced in Settings → Plan. |
| W6-06 | **OU usage display** — consumption bar wired to real data | Low | BIL-02, BIL-03 | **Deferred** — blocked on BIL-02/03 (OU tracking chain not yet built). Stub with `--` in Settings → Plan until BIL chain lands. |

**WAVE-6 delivery order:** ~~W6-02 → W6-01 → W6-03 → W6-04 → W6-05~~ ✅ all done (2026-03-20). W6-06 deferred (blocked on BIL-02/03).

**Billing integration tests:** `tests/billing.test.ts` in PlatformCloud — 13/13 passing (PC-BIL-T-01 through PC-BIL-T-13). Covers: trial issuance, checkout session creation, webhook handling (`checkout.session.completed`, `subscription.updated`, `subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`), grace period, downgrade, full Community→Starter→Growth→downgrade lifecycle. In-memory SQLite, real HMAC webhook signing, mocked Stripe SDK.

**Stripe redirect fix:** `success_url` includes `?upgraded=1`, `cancel_url` includes `?canceled=1`. On return: retry license refresh (3× × 3s) to handle webhook race, SWR `mutate("license-status")` cache bust, status banners for each outcome.

**Price consistency fix:** Settings → Plan `PLAN_OPTIONS` corrected to match landing page (`PricingSection.tsx`): Starter $99/mo ($79 annually), Growth $499/mo ($399 annually).

**Key files that will be touched:**
- `console/src/app/settings/page.tsx` — add Plan tab, replace License & Plan card
- `console/src/components/TierGate.tsx` — add "View plans →" link
- `console/src/components/Sidebar.tsx` (or equivalent) — sidebar footer upgrade nudge + trial countdown
- `console/src/lib/useLicense.ts` — expose `grace_until`, `trial_days_remaining`, `ou_used` when available
- New: `console/src/components/GracePeriodBanner.tsx`
- New: `console/src/app/settings/plan/page.tsx` (or tab within settings)

---

### 13.7 Console WAVE-7 — UX Polish & Filter Unification

**Theme**: Operator-facing polish — modern filter patterns, urgency signals, scroll animation, and consistency across all console pages. All items completed 2026-03-20.

| ID | Item | Priority | Notes |
|----|------|----------|-------|
| W7-01 | ~~**Settings `force-dynamic` build fix**~~ ✅ 2026-03-20 | P0 | `useSearchParams()` in Settings page caused static-render build failure. Fixed by new `console/src/app/settings/layout.tsx` with `export const dynamic = "force-dynamic"`. |
| W7-02 | ~~**Landing page: ZoomOnScroll lineage animation**~~ ✅ 2026-03-20 | Medium | New `ZoomOnScroll` client component (`console/src/components/ZoomOnScroll.tsx`) — IntersectionObserver, 0.92→1.0 scale + fade-in when element enters 15% of viewport. Wrapped lineage GIF card in `console/src/app/page.tsx`. No Framer Motion dependency. |
| W7-03 | ~~**Knowledge page: UX improvements**~~ ✅ 2026-03-20 | Medium | Four changes: (1) amber pulsing "N pending review" badge in header (shown when `stats.proposed > 0`); (2) column header "Conf." → "AI Confidence"; (3) row action button changed to ghost bordered style; (4) filter strip replaced with individual bordered pills — indigo active, white+border inactive. |
| W7-04 | ~~**Analytics: tab label cleanup**~~ ✅ 2026-03-20 | Low | Removed lock icon SVGs from tab button labels (kept tier badge). Tier badge repositioned as superscript (`relative -top-1.5`). |
| W7-05 | ~~**Cases: modern Filter popover**~~ ✅ 2026-03-20 | High | Replaced two `<select>` dropdowns with a single `FilterPopover` component — funnel icon button with active-count badge, grouped dropdown (Status + Severity sections) with checkmarks, dismissible chips row below header. Matches Linear/Stripe filter UX pattern. `useRef` click-outside dismiss. |
| W7-06 | ~~**Approvals: "N awaiting approval" pulsing badge**~~ ✅ 2026-03-20 | Medium | Amber pulsing dot + count in page header; conditionally shown when `requests.length > 0`. |
| W7-07 | ~~**PR Drafts: "N ready for review" pulsing badge**~~ ✅ 2026-03-20 | Medium | Emerald pulsing dot + count in page header; conditionally shown for PRs in `ready` state. |
| W7-08 | ~~**Notifications: unified filter UX — 2 independent popovers**~~ ✅ 2026-03-20 | High | Replaced 1 styled `<select>` (Group by) + 2 plain `<select>` dropdowns with two popover buttons: **GroupByPopover** (grid icon + current label + chevron; 6 options with checkmark on active; closes on selection) and **NotifFilterPopover** (funnel icon + active-count badge; Status section 6 opts + Priority section 5 opts; dismissible chips row). Consistent with Cases popover pattern. Components defined before page component to avoid bundler hoisting issues. |

**WAVE-7 delivery order:** W7-01 → W7-02 → W7-03 → W7-04 → W7-05 → W7-06 → W7-07 → W7-08 — all complete (2026-03-20).

---

## 14. Billing & Monetisation — ✅ COMPLETE 2026-03-20

> Canonical specs: `docs/revised-pricing-tiers.md`, `docs/monetization-and-licensing-model.md`.
> Model: **Community (free) / Starter ($99/mo) / Growth ($499/mo) / Scale (custom)**. Trial = Starter features, 30 days, no card required.

### 14.1 Stripe Billing Suite (PlatformCloud)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| PC-BIL-02 | Stripe Checkout session | ✅ DONE | `POST /api/v1/billing/checkout` → Checkout URL. Tested in Stripe sandbox. |
| PC-BIL-03 | Stripe webhook handler | ✅ DONE | `POST /api/v1/billing/webhook` — handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed/succeeded`. Stripe signature verification. Stripe clover API fix: reads `sub.cancel_at` directly (unix ts), not `cancel_at_period_end`. |
| PC-BIL-04 | Stripe Billing Portal | ✅ DONE | `POST /api/v1/billing/portal` → portal URL. |
| PC-BIL-05 | Mid-cycle upgrade | ✅ DONE | `POST /api/v1/billing/upgrade` — updates subscription price in-place, Stripe prorates the diff. `customer.subscription.updated` webhook updates DB automatically. |
| PC-BIL-07 | Trial issuance | ✅ DONE | `POST /api/v1/billing/trial` — issues 30-day NestFleet trial (no card), deduplicates per org. |
| PC-BIL-09 | License format unification | ✅ DONE | `generator.ts` JWT path verified (HS256); `.license-dev` is a valid JWT NestFleet accepts. Resolves BIL-C07. |
| PC-BIL-10 | Plan name migration | ✅ DONE | `seed-dev.ts` uses correct new names (`trial`, `STARTER`). DocuGardener intentionally keeps `FREE/PRO/TEAM` per `PRODUCT_REGISTRY`. |
| PC-BIL-12 | `max_outcome_units_monthly` in payload | ✅ DONE | Flows through PlatformCloud validation response → NestFleet `maxOutcomeUnitsMonthly` payload field. |
| PC-BIL-08 | Usage metadata ingestion | ✅ DONE | Telemetry schema extended with `outcome_units`; license_key regex accepts `nf_lic_`; NestFleet `CloudConnection.reportOuUsage()` posts OU count on background sync (TELEMETRY_ENABLED guard). |

### 14.2 PlatformCloud Architecture

| ID | Item | Status | Notes |
|----|------|--------|-------|
| PC-ARCH-01 | Product registry | ✅ DONE | `PRODUCT_REGISTRY` in `src/license/validator.ts` maps `nestfleet` and `docugardener` to feature matrix + OU tier limits. |
| PC-ARCH-02 | Admin API token scoping | ✅ DONE | `auth/admin.ts` — 4 scopes (`platform_owner`, `product_admin`, `billing_automation`, `read_only`). Wired to all billing + license routes. `PLATFORM_CLOUD_TOKEN` added to NestFleet config; backwards-compatible with legacy `PLATFORM_ADMIN_SECRET`. |

### 14.3 NestFleet OU Tracking Chain (BIL-01→06)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| BIL-01 | License payload | ✅ DONE | `maxOutcomeUnitsMonthly` in `LicensePayload` (`src/license/types.ts`). |
| BIL-02 | Outcome Unit tracker | ✅ DONE | `outcome_unit_usage` table (`migrations/0030_outcome_unit_usage.sql`) + `src/billing/ou-tracker.ts` with `incrementOu()`, `getOuUsage()`, `getOuStatus()`. Idempotent dedup on `(event_type, entity_ref)`. |
| BIL-03 | OU consumption events | ✅ DONE | `incrementOu()` called at `case.resolved` in `cases.ts` and `cr.completed` (CI pass) in `github.ts`. Best-effort, non-blocking. |
| BIL-04 | OU limit enforcement | ✅ DONE | `signal-ingress.ts`: `getOuStatus()` called before case creation. `blocked` → signal stored, no case created. `warning` → case created, `ouStatus: "warning"` returned for console banner. |
| BIL-06 | Trial expiry enforcement | ✅ DONE | `getLicenseTier()` in `validator.ts`: expired trial returns `"community"` tier rather than `"trial"`. |

### 14.4 Console Billing UX

| ID | Item | Status | Notes |
|----|------|--------|-------|
| W6-01→05 | Plan & Billing settings foundation | ✅ DONE 2026-03-20 | `useLicense` hook, `LicenseSection`, checkout/portal/upgrade flows, tier badges, plan cards. |
| W6-06 | OU usage bar | ✅ DONE 2026-03-20 | `/license/status` returns `ouUsage`; bar in Settings → Plan renders amber ≥80%, red at 100%; hidden when `limit=0` (unlimited). |
| — | cancel_at orange banner | ✅ DONE 2026-03-20 | "Cancellation scheduled" banner with date + Reactivate CTA. Status dot turns orange; expiry label switches to "Ends in Nd". |
| — | ↻ manual refresh button | ✅ DONE 2026-03-20 | Syncs plan state from PlatformCloud on demand. |
| — | Source-aware portal_return message | ✅ DONE 2026-03-20 | `refreshSource` state distinguishes upgrade vs portal_return; shows correct success copy. |
| — | Growth tier Scale CTA | ✅ DONE 2026-03-20 | Growth tier shows "Contact us for Scale" CTA instead of duplicate plan cards; interval toggle hidden. |

### 14.5 Resolved Concerns

| ID | Concern | Resolution |
|----|---------|------------|
| BIL-C04 | `LicensePayload` missing `max_outcome_units_monthly` | ✅ RESOLVED — field present in `src/license/types.ts` |
| BIL-C07 | Offline JWT format mismatch between PlatformCloud and NestFleet | ✅ RESOLVED — PC-BIL-09: generator JWT path verified; both use HS256 JWT |
| BIL-C08 | PlatformCloud SQLite bottleneck at scale | 🟡 LOW — document PostgreSQL migration path before scaling billing (open concern, no immediate action) |

---

## 15. Console WAVE-4 — Operator Home Dashboard ✅ COMPLETE 2026-03-22

Delivers the operator home screen (DEFERRED-10 partial). Single-call endpoint returns live KPI counts + recent activity; console page auto-refreshes every 30 s.

### 15.1 Delivered Items

| Item | Description | Status |
|------|-------------|--------|
| `GET /api/v1/products/:productId/dashboard` | Returns `{ kpis: { openCases, pendingApprovals, readyPrDrafts, unreadNotifications }, recentActivity[15] }`. All 4 KPI queries run in parallel via `Promise.all`. Auth-gated (`requireAuth`). | ✅ |
| `console/src/app/dashboard/page.tsx` | 4 colour-coded KPI cards (indigo/amber/emerald/violet), each linking to the corresponding tab. 15-row recent activity feed with actor, entity ref, and `timeAgo` label. Skeleton loading; falls back to `0` on API error. SWR 30 s `refreshInterval`. | ✅ |
| `console/src/app/(app)/p/[slug]/dashboard/page.tsx` | Re-export wrapper — product-context routing. | ✅ |
| `console/src/lib/api.ts` | `getDashboardApi()` + `DashboardData` / `DashboardKpis` / `DashboardActivity` types. | ✅ |
| `console/src/components/Sidebar.tsx` | Dashboard nav item at top of `NAV_ITEMS` (above Queue), grid-squares icon. | ✅ |
| `console/src/lib/permissions.ts` | `dashboard` key in `NAV_ACCESS` — all six roles. | ✅ |
| `src/api/index.ts` | `dashboardRouter` registered. | ✅ |

### 15.2 Files

`src/api/v1/dashboard.ts`, `console/src/app/dashboard/page.tsx`, `console/src/app/(app)/p/[slug]/dashboard/page.tsx`, `console/src/lib/api.ts`, `console/src/components/Sidebar.tsx`, `console/src/lib/permissions.ts`, `src/api/index.ts`

---

## 16. PERF-01 — audit_events Performance Index ✅ COMPLETE 2026-03-22

Performance decision recorded after architectural review of Dashboard and Analytics query patterns at scale.

### 16.1 Decision Summary

All dashboard and analytics queries are already scoped by `product_id`, so multi-product scale does not compound query cost (each query only scans one product's rows). The real scaling axis is audit_events volume per product. OLTP/OLAP split is not warranted at current scale. Thresholds:

- **Now**: add composite index — sufficient for operational volumes.
- **Next threshold**: read replica when analytics scan latency exceeds ~500 ms or lock contention appears in `pg_stat_activity`.
- **OLAP split**: only when cross-product aggregations, year-span trend queries, or external data joins are required.

### 16.2 Index Added

**Migration**: `migrations/0035_audit_events_product_time_idx.sql`

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_product_time_idx
  ON audit_events (product_id, occurred_at DESC);
```

**Covers**:
- Dashboard activity feed: `WHERE product_id = ? ORDER BY occurred_at DESC LIMIT 15`
- Analytics overview: any time-ordered scan scoped to a product

**Note**: `CONCURRENTLY` prevents a table lock on live deployments. Migration runners must issue this statement outside a `BEGIN/COMMIT` block.

---

## 17. Console WAVE-5 — Product Memory Ingestion UI ✅ COMPLETE 2026-03-22

Delivers the operator-facing product memory management surface: manual markdown ingestion, health reporting, conflict visibility, search probe, and contextual help. Closes the loop between the backend ingestion pipeline (SLICE-03) and the operator console — operators can now view, ingest, and delete memory sources without touching the API directly.

### 17.1 Delivered Items

| Item | Description | Status |
|------|-------------|--------|
| `POST /api/v1/products/:productId/memory/ingest` | Ingest a markdown document into product memory. Accepts all 17 source types. Calls `ingestMarkdown()` — full pipeline (chunk → tier → freshness → embed → upsert with dedup on `content_hash`). Returns `{ chunksIngested, chunksSkipped, totalTokens, sourceUri, tier }`. Auth-gated: `admin` + `knowledge_lead` only (403 for all other roles). Body validated with Zod: sourceType (enum 17), sourceUri (max 2048), content (1–500k chars), sourceUpdatedAt (ISO datetime). | ✅ |
| `console/src/app/knowledge/page.tsx` — 2-tab restructure | Knowledge page restructured into **Knowledge Assets** tab (existing SLICE-24 content preserved) + **Memory Sources** tab (new). Tab state is local — no route change. | ✅ |
| Memory Sources — source list table | Displays all indexed sources from `GET /memory/sources`. Columns: source URI, type badge, tier badge (T1–T4, colour-coded), chunk count, avg freshness bar, conflict indicator. Delete button (admin only) with confirmation. SWR 30 s refresh. | ✅ |
| Memory Sources — upload slide-over panel | Slide-over triggered by "Upload Document" (admin only). Fields: source type (grouped T1/T2 `<optgroup>`), source URI with dedup note, last-updated datetime, audience (public/internal/developer), product version (optional), markdown content textarea (char counter). Calls `POST /memory/ingest`, surfaces `chunksIngested` / `chunksSkipped` / tier in success toast. | ✅ |
| Memory Sources — Documentation Health panel | Renders `GET /memory/health` report. Overall score (0–100) computed from 8 dimension levels (good=1.0, warn=0.5, fail=0.0). Dimensions displayed as **Good / Warn / Fail** badges. Capability gates (Auto-Reply, Known Issue Match, Change Prep, PR Draft, Outage Routing) as **Enabled / Degraded / Disabled** pills. Recommendations list. | ✅ |
| Memory Sources — Search Probe | Query input + action-type selector (6 options) + top-N selector (3–20). Calls `POST /memory/search`. Displays returned chunks with tier badge, source URI, section path, score, and content preview. Shows abstain reason and conflict warning when present. | ✅ |
| Memory Sources — `MemoryHelpPanel` | Collapsible contextual help panel at top of Memory Sources tab. 6 cards explaining AI memory mechanics with concrete ops-impact examples (stale pricing, missing known issues, conflict abstain, post-release re-ingest workflow). T1 card highlighted. Collapsed by default. | ✅ |
| `console/src/lib/api.ts` — 6 new functions + types | `getMemorySourcesApi`, `getMemoryStatsApi`, `getMemoryHealthApi`, `searchMemoryApi`, `ingestMemoryApi`, `deleteMemorySourceApi`. Types: `MemorySource`, `MemoryStats`, `MemoryHealthReport` (corrected: `HealthLevel` = "good"\|"warn"\|"fail", `CapabilityStatus` = "enabled"\|"degraded"\|"disabled", fields: `computedAt`, `capabilities`, `recommendedActions`), `MemorySearchResult`, `IngestMemoryPayload`, `IngestMemoryResult`. | ✅ |
| `tests/integration/memory-ingest-api.test.ts` | 20 integration tests T-W5-01–T-W5-20. Covers: happy path, tier assignment, dedup (same content → skip, changed content → new chunks), DB persistence, audience/version field storage, totalTokens, GET /sources + /stats reflection post-ingest, DELETE interaction, 401 (no token), 403 (viewer + support_lead), 200 for knowledge_lead, 400 validations (missing field, empty content, unknown sourceType, invalid datetime), freshness score correctness (T1 + today → >0.7). | ✅ |

### 17.2 Files

**Backend**: `src/api/v1/product-memory.ts`

**Console**: `console/src/app/knowledge/page.tsx`, `console/src/lib/api.ts`

**Tests**: `tests/integration/memory-ingest-api.test.ts`

### 17.3 Role Access

| Action | Roles |
|--------|-------|
| View sources, health, search probe | `operator`, `knowledge_lead`, `admin` |
| Upload document (POST /ingest) | `knowledge_lead`, `admin` |
| Delete source | `admin` only |

### 17.4 Type Shape Clarification

The `DocumentationHealthReport` returned by `GET /memory/health` uses string-level values, not numerics. Console types corrected accordingly:

- `dimensions.*` → `"good" | "warn" | "fail"` (not 0–1 floats)
- `capabilities.*` → `"enabled" | "degraded" | "disabled"` (not booleans)
- `computedAt` (not `generatedAt`); `capabilities` (not `capabilityGates`); `recommendedActions` (not `recommendations`)
- No `overallScore` field — derived on frontend: good=1.0, warn=0.5, fail=0.0, averaged across 8 dimensions
