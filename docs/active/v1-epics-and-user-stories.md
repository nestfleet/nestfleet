# NestFleet v1 Product Backlog: Epics and User Stories

## 1. Purpose

This document is the canonical product backlog for NestFleet v1. It translates the governing design documents into epics and user stories that can be estimated, prioritized, and delivered.

Every item here traces to one or more source documents. Items that do not trace are not here. Items that look like generic agile filler were removed during drafting. Items that would turn NestFleet into a generic agent shell or arbitrary workflow builder were challenged and excluded.

The backlog covers the scope from first email intake through approved PR draft for the DocuGardener pilot.

## 2. Scope Boundary

### In scope for v1

- Single product: DocuGardener
- Single inbound channel: email (Telegram deferred to fast-follow)
- Three AI personas: Frontline, Steward, Change
- Five human lead roles: Support Lead, Product Lead, Change Lead, Knowledge Lead (Release Lead reserved for later)
- One human may hold multiple lead roles
- Core lifecycle: Signal -> Conversation -> Case -> Problem -> Change Request -> Approval -> PR Draft
- Product memory grounded in trusted sources only
- Deterministic validation envelope on all consequential actions
- Notification control plane with email delivery
- Operator console built incrementally, most-useful-first
- GitHub as change-management backbone (webhooks + REST API)
- Immutable audit trail
- OIDC-compatible identity with app-level RBAC
- Client-installed on customer infrastructure, cloud-connected for updates and continuous value delivery

### Out of scope for v1

- Telegram channel (deferred to fast-follow)
- Multi-product concurrent operation
- Deployment execution or merge
- Post-release verification automation
- AI chat channel
- Arbitrary workflow designer or custom role DSL
- Live self-improving roles (governed role improvement is later phase)
- Enterprise ITSM feature breadth
- HR, worker-monitoring, credit, insurance, law-enforcement workflows
- Multi-region active-active deployment
- Role Profile Version and Role Improvement Candidate aggregates (later-phase per domain-model.md)

### Source documents

- product-vision.md
- domain-model.md
- case-and-change-lifecycle.md
- autonomy-and-approval-policy.md
- notification-model.md
- mvp-scope.md
- system-architecture.md
- architecture-decisions.md
- technical-risks-and-spikes.md
- legal-compliance-eu-germany.md
- market-landscape.md
- monetization-and-licensing-model.md

## 3. Product Outcome for v1

When v1 is complete, an operator running DocuGardener through NestFleet should be able to:

1. Receive an inbound email from a user, see it normalized into a signal and case, and watch the system enrich and triage it automatically.
2. See routine user requests answered directly when confidence, evidence, and policy thresholds are met, with full validation records and audit trail.
3. See bug reports and outage reports escalated through the change path with problem records, change requests, approval routing, and GitHub issue linking.
4. Approve or reject change requests through the approval queue, with rationale capture and notification.
5. See approved changes produce PR drafts tied to the originating case and change request, with diff summaries and validation records.
6. Receive notifications with correct priority, quiet-hours behavior, deduplication, escalation, and acknowledgement tracking.
7. Review all of the above through an operator console that shows inbox/queue, case detail, approval queue, change request view, notification center, and PR draft handoff.
8. Trust that every AI action is bounded by typed proposals, evidence requirements, policy checks, and deterministic validation, with immutable audit events for every state transition.

Success criteria from mvp-scope.md section 9 remain the governing measure.

## 3.1 Delivery Status

| Phase | Status | Date |
| --- | --- | --- |
| Phase 0: Project Bootstrap | ✅ COMPLETE | 2026-03-17 |
| Phase 1: Spikes (SPIKE-01 through SPIKE-08) | ✅ COMPLETE | 2026-03-17–19 |
| Phase 2: Enablers + First Slices | ✅ COMPLETE | 2026-03-18 |
| Phase 3: Remaining Slices (SLICE-01–26) | ✅ COMPLETE | 2026-03-19 |
| Phase 4: Integration + Polish | ✅ COMPLETE | 2026-03-20 |
| Post-v1 Console WAVE 1–4 + PERF-01 | ✅ COMPLETE | 2026-03-22 |
| **Console WAVE 5** — Product Memory Ingestion UI | ✅ COMPLETE + TESTED | 2026-03-22 / tested 2026-03-23 |
| Console WAVE 6 — Billing CTAs | ⏳ blocked | Blocked on PlatformCloud billing endpoints |

**Infrastructure prerequisites for all epics below — now available:**
- PostgreSQL 16 + pgvector ✅
- Migration runner ✅
- Hono HTTP server with health endpoint ✅
- OpenTelemetry (traces) ✅
- Structured logger ✅
- Config validation ✅
- Test infrastructure (unit + integration via testcontainers) ✅

## 4. Epic Map

| ID | Title | Category | Status |
| --- | --- | --- | --- |
| EPIC-01 | Intake & Signal Normalization | MVP-critical | ⏳ pending |
| EPIC-02 | Case Management & Control Plane | MVP-critical | ⏳ pending |
| EPIC-03 | Product Memory & Retrieval | MVP-critical | ⏳ pending |
| EPIC-04 | Deterministic Validation & Policy Engine | MVP-critical | ⏳ pending |
| EPIC-05 | Approval & Lead Routing | MVP-critical | ⏳ pending |
| EPIC-06 | Notification Control Plane | MVP-critical, phased | ⏳ pending |
| EPIC-07 | Grounded User-Request Resolution | MVP-critical | ⏳ pending |
| EPIC-08 | Change Management & GitHub Integration | MVP-critical | ⏳ pending |
| EPIC-09 | Configurable Role Templates & Team Composition | MVP-critical | ⏳ pending |
| EPIC-10 | Auditability & Compliance Controls | MVP-critical | ⏳ pending |
| EPIC-11 | Operator Console | MVP-critical, phased | ⏳ pending |
| EPIC-12 | Identity & Access Control | Enabler | ⏳ pending |
| EPIC-13 | License and Cloud Connection | MVP-critical (enabler) | ⏳ pending |
| EPIC-14 | Operator Console — Settings & Onboarding | MVP-critical | ⏳ pending |
| EPIC-15 | CI Verification & Post-Merge Feedback Loop | Post-MVP (v1.1) | ⏳ pending |

## 5. Epic Details

---

### EPIC-01: Intake & Signal Normalization

**Objective:** Accept inbound email, normalize it into signals and conversations, route it to the correct product, and create or update cases reliably.

**Why it matters:** Without intake, nothing flows. This is the mouth of the system. If signals are lost, duplicated, or misrouted, every downstream subsystem fails. The email connector is the only v1 channel and must work flawlessly.

**Source documents:** product-vision.md (lifecycle), domain-model.md (Signal, Conversation aggregates), system-architecture.md (Channel Connectors, Ingress Pipeline), architecture-decisions.md (ADR-004, ADR-005), mvp-scope.md (Slice 1).

**In-scope stories:**

#### US-01: Email Connector Receives Inbound Messages
As the NestFleet ingress pipeline, I need to receive inbound email messages via a configured email endpoint so that every user message reaches the system without manual forwarding.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Connector receives email via IMAP or webhook-based provider integration
  - Raw payload is persisted before any processing
  - Connector handles common email formats: plain text, HTML, attachments (attachment metadata captured, binary stored to S3-compatible storage)
  - Failed receipt is retried with backoff and emits an internal alert on final failure
  - Connector is behind a clean adapter boundary per ADR-005
- Source: system-architecture.md section 5.1, architecture-decisions.md ADR-005

#### US-02: Signal Creation and Normalization
As the ingress pipeline, I need to create a normalized Signal record from each inbound email so that downstream processing operates on a consistent schema regardless of channel quirks.

- Priority: must
- Dependencies: US-01
- Acceptance criteria:
  - Signal record created with all minimum fields per domain-model.md section 4.3
  - Normalized payload includes: sender identity hint, subject, body text, timestamp, thread references, attachment metadata
  - Source type is `email`; source ref preserves the original message ID
  - Signal is linked to product_id via product routing logic
  - Deduplication pre-check prevents duplicate signals from the same message ID
  - Audit event written on signal creation
- Source: domain-model.md section 4.3, system-architecture.md section 5.2

#### US-03: Identity Hint Extraction
As the ingress pipeline, I need to extract identity hints from inbound signals so that the system can link messages to known identities or flag new contacts.

- Priority: must
- Dependencies: US-02, EPIC-12 (Identity aggregate)
- Acceptance criteria:
  - Email address is extracted and matched against known Identity records
  - If no match, a provisional identity record is created with type `end_user`
  - Display name is extracted from email headers when available
  - Identity linking is idempotent (repeated messages from the same sender do not create duplicate identities)
- Source: domain-model.md section 4.2

#### US-04: Conversation Threading
As the ingress pipeline, I need to group related signals into Conversations so that the system maintains thread coherence across multiple messages from the same user about the same topic.

- Priority: must
- Dependencies: US-02
- Acceptance criteria:
  - Conversation record created with minimum fields per domain-model.md section 4.4
  - Threading uses email In-Reply-To and References headers, falling back to subject-line matching
  - New conversation created when no thread match exists
  - Existing conversation updated with new signal when thread match is found
  - Participant IDs maintained on conversation record
  - Last message timestamp updated on each new signal
- Source: domain-model.md section 4.4

#### US-05: Product Routing
As the ingress pipeline, I need to route signals to the correct product so that DocuGardener messages reach the DocuGardener control plane and unknown products are flagged.

- Priority: must
- Dependencies: US-02
- Acceptance criteria:
  - Product routing uses configured rules (email address patterns, subject prefixes, or explicit product mapping)
  - Signals that cannot be routed are flagged for operator review
  - Product_id is set on Signal and Conversation records
  - v1 supports exactly one product (DocuGardener); multi-product routing is structurally present but not required to be exercised
- Source: domain-model.md section 4.1, mvp-scope.md section 4.1

#### US-06: Case Creation from Conversation
As the case control plane, I need to create a Case record when a new conversation indicates a new issue so that every user concern enters the operational lifecycle.

- Priority: must
- Dependencies: US-04, EPIC-02 (Case aggregate)
- Acceptance criteria:
  - Case created in `new` state with minimum fields per domain-model.md section 4.5
  - Case linked to originating conversation and signal
  - Reporter identity set from identity hint extraction
  - Product_id inherited from conversation
  - Case automatically transitions from `new` to `enriching` after signal normalization per case-and-change-lifecycle.md section 5.2
  - Audit event written on case creation
- Source: domain-model.md section 4.5, case-and-change-lifecycle.md section 5.2

**Out-of-scope clarifications:**
- Telegram connector (deferred to fast-follow)
- GitHub webhook signal ingestion belongs to EPIC-08
- Scheduled reminder events as signal sources belong to EPIC-06

**Epic-level acceptance criteria:**
- An email sent to the configured DocuGardener address results in a Signal, Conversation, and Case within the system
- Duplicate emails do not produce duplicate signals
- Thread continuity is maintained across multi-message exchanges
- Every creation event has an audit trail

**Dependencies:** EPIC-12 for Identity, EPIC-02 for Case lifecycle

---

### EPIC-02: Case Management & Control Plane

**Objective:** Implement the case state machine, lifecycle transitions, ownership tracking, and the control plane that orchestrates work across personas.

**Why it matters:** The case is the central operational object in v1. The control plane is what makes NestFleet a governed product operations platform rather than a loose collection of AI agents. Without deterministic state transitions and ownership tracking, the system cannot enforce policy, route work, or maintain auditability.

**Source documents:** domain-model.md (Case, Problem aggregates), case-and-change-lifecycle.md (full document), system-architecture.md (Case Control Plane, Agent Flow Engine), architecture-decisions.md (ADR-001, ADR-004), autonomy-and-approval-policy.md (persona permissions).

**In-scope stories:**

#### US-07: Case State Machine Implementation
As the case control plane, I need to enforce the canonical case state machine so that cases can only transition through valid states with required controls at each boundary.

- Priority: must
- Dependencies: US-06
- Acceptance criteria:
  - All ten states implemented: new, enriching, triaged, awaiting-user, awaiting-lead, in-resolution, in-change, pr-drafting, resolved, closed
  - Every transition enforces entry conditions per case-and-change-lifecycle.md section 5.1
  - Invalid transitions are rejected with a clear error
  - Every transition writes an audit event
  - State machine is the source of truth; agents cannot bypass it
- Source: case-and-change-lifecycle.md section 5.1, domain-model.md section 6.1

#### US-08: Case Enrichment by Frontline Persona
As the Frontline persona, I need to enrich cases with classification hints, summaries, and context so that the Steward can triage effectively.

- Priority: must
- Dependencies: US-07, EPIC-03 (retrieval), EPIC-04 (validation)
- Acceptance criteria:
  - Frontline produces a typed enrichment proposal including: conversation summary, issue-type hint, severity hint, duplicate/known-issue check result
  - Enrichment proposal passes through the validation envelope before being applied
  - Case transitions from `enriching` to `triaged` only when minimum artifacts exist per case-and-change-lifecycle.md section 9.1: normalized summary, product ID, issue-type proposal, duplicate check result
  - Evidence refs attached to the enrichment record
- Source: case-and-change-lifecycle.md sections 5.2 and 9.1, domain-model.md section 7.1

#### US-09: Case Classification (Type and Severity)
As the Steward persona, I need to confirm or adjust case type and severity after enrichment so that routing and automation rules apply correctly.

- Priority: must
- Dependencies: US-08
- Acceptance criteria:
  - Case type set to one of: user_request, bug_report, outage_report, user_feedback
  - Severity set to one of: critical, high, normal, low
  - Classification must include evidence-backed rationale per autonomy-and-approval-policy.md section 5
  - High-impact severity changes are approval-gated per autonomy-and-approval-policy.md section 5
  - Validation record emitted for classification
- Source: case-and-change-lifecycle.md section 4, autonomy-and-approval-policy.md section 5

#### US-10: Clarification Request Flow
As the Frontline persona, I need to ask clarifying questions when the case lacks information necessary for safe triage so that we do not guess when evidence is missing.

- Priority: must
- Dependencies: US-07, EPIC-04 (validation for outbound), EPIC-06 (notification delivery)
- Acceptance criteria:
  - Case transitions from `enriching` to `awaiting-user` only when missing information blocks safe triage
  - Clarification message passes through validation envelope before delivery
  - Reminder scheduled after 24 hours and 72 hours per case-and-change-lifecycle.md section 8.2
  - When user replies, conversation is updated and case transitions back to `enriching`
  - Case may auto-close after 7 calendar days of inactivity for user_request type
- Source: case-and-change-lifecycle.md sections 5.2 and 8.2, autonomy-and-approval-policy.md section 5

#### US-11: Case Triage and Routing Decision
As the Steward persona, I need to decide the next step after triage (direct resolution, lead escalation, or change path) so that each case follows the correct flow based on risk and policy.

- Priority: must
- Dependencies: US-09, EPIC-04 (policy checks)
- Acceptance criteria:
  - `triaged -> in-resolution` allowed only for low-risk paths covered by policy
  - `triaged -> awaiting-lead` required for ambiguous risk, high user impact, or human commitments
  - `triaged -> in-change` allowed only when product/operational change is necessary and a change request draft exists
  - Routing decision includes evidence refs and policy evaluation result
  - Validation record emitted for routing decision
- Source: case-and-change-lifecycle.md section 5.2, autonomy-and-approval-policy.md sections 4 and 8

#### US-12: Problem Record Creation and Linking
As the Steward persona, I need to create Problem records when cases reveal a repeated or systemic issue so that patterns are tracked and can trigger change work.

- Priority: must
- Dependencies: US-09
- Acceptance criteria:
  - Problem record created with minimum fields per domain-model.md section 4.6
  - Multiple cases can link to one problem
  - Problem creation emits a validation record per autonomy-and-approval-policy.md section 5
  - Problem routing follows domain-model.md section 9: Product Lead when roadmap tradeoffs are involved
  - Pattern confidence tracked on the problem record
- Source: domain-model.md section 4.6, case-and-change-lifecycle.md section 7

#### US-13: Case Closure and Cooling-Off
As the case control plane, I need to enforce closure rules so that cases are not left in limbo and are not closed prematurely.

- Priority: must
- Dependencies: US-07
- Acceptance criteria:
  - user_request cases auto-close after 7 calendar days of inactivity after validated response
  - bug_report and outage_report cases require operator review or explicit user resolution signal before closure
  - user_feedback cases may close after routing and acknowledgement, but linked problem/backlog items remain open
  - `resolved -> closed` happens automatically after configured cooling-off period or on explicit operator close
  - Final audit event written on closure
  - Reopen path retained
- Source: case-and-change-lifecycle.md section 5.3

#### US-14: Queue-Driven Task Orchestration
As the agent flow engine, I need to schedule persona work as bounded tasks via a durable queue so that the system is resumable, retryable, and agents never own long-running state.

- Priority: must
- Dependencies: US-07
- Acceptance criteria:
  - Tasks are enqueued by the control plane and consumed by persona workers
  - Queue is an execution trigger, not the source of truth (ADR-004)
  - Tasks survive process restarts
  - Failed tasks are retried with backoff
  - Handoff between Frontline, Steward, and Change personas happens through state transitions, not direct agent-to-agent calls
  - Queue adapter boundary is clean per ADR-005 (swappable between Redis-backed and PG-backed)
- Source: system-architecture.md sections 5.6 and 5.7, architecture-decisions.md ADR-004, ADR-005

**Out-of-scope clarifications:**
- The direct resolution path (what happens during `in-resolution`) is covered in EPIC-07
- The change path (what happens during `in-change` and `pr-drafting`) is covered in EPIC-08
- SLA enforcement and stale-case alerting belong to EPIC-06

**Epic-level acceptance criteria:**
- A case can be driven through every valid path in the state machine: direct resolution, lead escalation, and change path
- Invalid transitions are rejected
- Every state transition produces an audit event
- Persona handoffs happen through the control plane, not through agent-owned state

**Dependencies:** EPIC-01 (intake), EPIC-04 (validation), EPIC-12 (identity for ownership)

---

### EPIC-03: Product Memory & Retrieval

**Objective:** Ingest trusted DocuGardener sources, index them for hybrid retrieval, and assemble evidence-backed memory packs that ground every AI action.

**Why it matters:** Product memory is the evidence infrastructure that makes NestFleet deterministic and trustworthy. Without it, every persona hallucinates. Weak retrieval quality is identified as the highest-risk technical area in technical-risks-and-spikes.md.

**Source documents:** architecture-decisions.md (ADR-006, ADR-007), system-architecture.md (Product Memory Pipeline, Retrieval and Evidence Service), mvp-scope.md (section 6), technical-risks-and-spikes.md (spike 1).

**In-scope stories:**

#### US-15: Source Registration and Trust Tiering
As an operator, I need to register approved knowledge sources for DocuGardener with explicit trust levels so that the retrieval system only uses vetted content.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Sources can be registered with type: markdown docs, FAQ, GitHub issues, PR metadata, release notes, known issues, historical cases
  - Each source has a trust tier (authoritative, approved, provisional)
  - Source registration includes product_id scoping
  - Sources can be deactivated without deletion
- Source: mvp-scope.md section 6, architecture-decisions.md ADR-007

#### US-16: Content Ingestion Pipeline
As the product memory pipeline, I need to ingest registered sources, normalize them into chunks, and tag them with metadata so that the retrieval layer has structured content to search.

- Priority: must
- Dependencies: US-15
- Acceptance criteria:
  - Markdown docs are parsed, chunked, and stored with section-level granularity
  - GitHub issues and PR metadata are fetched via GitHub API and stored as structured records
  - Each chunk carries: product_id, source_type, source_ref, trust_tier, freshness_timestamp, content_hash
  - Sensitive content is redacted or excluded per legal-compliance-eu-germany.md section 7.3
  - Re-ingestion updates existing chunks and removes stale ones
  - Raw documents stored in S3-compatible storage per ADR-012
- Source: system-architecture.md section 5.8, architecture-decisions.md ADR-006, ADR-007, ADR-012

#### US-17: Hybrid Retrieval (FTS + Vector)
As the retrieval service, I need to combine PostgreSQL full-text search and pgvector similarity to find the most relevant content for a given query so that evidence packs are grounded in multiple retrieval signals.

- Priority: must
- Dependencies: US-16
- Acceptance criteria:
  - Retrieval combines FTS scores and vector similarity scores
  - Results are filtered by product_id and trust_tier
  - Freshness weighting ensures stale content ranks lower
  - Application-level reranking produces a final ranked list
  - Retrieval is task-specific: different retrieval profiles for triage, resolution, and change preparation
- Source: architecture-decisions.md ADR-006, system-architecture.md section 5.9

#### US-18: Evidence Pack Assembly
As the retrieval service, I need to assemble a memory pack for each persona task that includes ranked evidence with source IDs, trust metadata, and citations so that every AI action can be traced to its grounding sources.

- Priority: must
- Dependencies: US-17
- Acceptance criteria:
  - Memory pack includes: ranked content chunks, source_ref for each chunk, trust_tier, freshness, and a citation label
  - Memory pack is scoped to the specific task (not a full context dump per ADR-007)
  - Memory pack respects token budget constraints for the downstream model call
  - Evidence refs from the memory pack are attached to every proposal the persona produces
- Source: architecture-decisions.md ADR-007, system-architecture.md section 5.9, autonomy-and-approval-policy.md section 7

#### US-19: Known-Issue and Duplicate Detection
As the retrieval service, I need to check whether an incoming case matches a known issue or an existing open case so that duplicates are flagged and known resolutions are surfaced.

- Priority: must
- Dependencies: US-17
- Acceptance criteria:
  - Duplicate check compares incoming case summary against open cases using semantic similarity
  - Known-issue check compares against approved known-issue records in product memory
  - Results include a confidence score and the matching source
  - Results are surfaced as part of the enrichment phase (US-08)
  - False positives are expected; results are suggestions, not automatic merges
- Source: case-and-change-lifecycle.md section 9.1, autonomy-and-approval-policy.md section 15

#### US-20: Knowledge Asset Capture After Resolution
As the system, I need to create Knowledge Asset records after case resolution so that successful resolutions feed back into product memory for future cases.

- Priority: should
- Dependencies: US-13 (case closure), US-15
- Acceptance criteria:
  - Knowledge Asset record created with minimum fields per domain-model.md section 4.10
  - Asset type indicates: FAQ candidate, known-issue candidate, docs-update candidate
  - Asset linked to originating case and change request where applicable
  - Asset status starts as `draft`; promotion to `approved` requires Knowledge Lead review
  - Approved assets are ingested into product memory on next pipeline run
- Source: domain-model.md section 4.10, product-vision.md (knowledge lifecycle stage)

**Out-of-scope clarifications:**
- Broad uncontrolled ingestion from arbitrary URLs or feeds
- Real-time streaming ingestion from GitHub activity (batch or webhook-triggered is sufficient)
- Chat memory or conversation-context accumulation (product memory is evidence infrastructure per ADR-007)

**Epic-level acceptance criteria:**
- DocuGardener markdown docs, FAQ content, GitHub issues, and known issues are indexed and retrievable
- A query about a common DocuGardener support topic returns relevant, correctly cited evidence
- Stale or low-trust content is ranked below fresh authoritative content
- Evidence packs are attached to every persona proposal

**Dependencies:** EPIC-12 (operator identity for source registration), EPIC-08 (GitHub API access for issue/PR metadata ingestion)

---

### EPIC-04: Deterministic Validation & Policy Engine

**Objective:** Implement the validation envelope and policy engine that gate every consequential AI action, ensuring typed proposals, evidence checks, schema validation, and deterministic allow/deny/abstain decisions.

**Why it matters:** This is the trust boundary of the system. Without it, NestFleet is just another chatbot with access to production data. The validation envelope is what makes automation safe enough to use and audit. It is also a legal requirement under GDPR Article 32 and AI Act transparency obligations.

**Source documents:** autonomy-and-approval-policy.md (full document), domain-model.md (Validation Record aggregate), system-architecture.md (Policy Engine), technical-risks-and-spikes.md (spike 3, spike 6), legal-compliance-eu-germany.md (sections 5.6 and 8.2).

**In-scope stories:**

#### US-21: Action Tier Classification
As the policy engine, I need to classify every proposed action into the correct tier (T0-T5) so that the system knows whether to auto-execute, validate, require approval, or forbid.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - All six tiers implemented per autonomy-and-approval-policy.md section 4
  - T0: read-only, automatic
  - T1: low-risk user-facing, automatic with validation
  - T2: record-mutating, automatic with validation + audit
  - T3: engineering artifacts, approval-gated
  - T4: human commitments, approval required
  - T5: forbidden, always blocked
  - Tier classification is deterministic based on action type and context, not model confidence alone
- Source: autonomy-and-approval-policy.md section 4

#### US-22: Typed Proposal Schema
As the validation layer, I need every AI-generated action to be expressed as a typed proposal with a defined schema so that validation, audit, and review operate on structured data, not free text.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Proposal schemas defined for: user reply, severity classification, case routing decision, problem creation, change request creation, approval package, PR draft creation
  - Each proposal includes: action_type, target_ref, evidence_refs, persona, confidence_score, proposed_output
  - Proposals that do not match the schema are rejected before policy evaluation
- Source: autonomy-and-approval-policy.md section 6, domain-model.md section 2.5

#### US-23: Validation Record Lifecycle
As the validation layer, I need to create and manage Validation Records for every T1-T4 action so that the full validation chain is durable and auditable.

- Priority: must
- Dependencies: US-22
- Acceptance criteria:
  - Validation Record created with all minimum fields per domain-model.md section 4.14
  - State machine implemented: proposed -> schema-passed -> validator-passed -> awaiting-human -> approved -> rejected -> executed -> abstained
  - Record preserves: policy_version, schema_version, evidence_refs, validator_type, validator_result, requires_human_approval
  - Record is immutable after terminal state
- Source: domain-model.md sections 4.14 and 6.4

#### US-24: Policy Engine Evaluation
As the policy engine, I need to evaluate each validated proposal against product and role policies to return allow, require_approval, or deny so that no consequential action bypasses governance.

- Priority: must
- Dependencies: US-21, US-22
- Acceptance criteria:
  - Policy evaluation checks: action tier, persona permissions, product-level rules, severity context, confidence thresholds
  - Auto-reply threshold enforced: user_request + normal/low + confidence >= 0.85 + approved sources + validator pass
  - Auto-change-draft threshold enforced: bug_report/outage_report/repeated feedback + confidence >= 0.75 + evidence complete
  - PR draft threshold enforced: change request approved + repo permissions + validator pass + no secrets
  - When evidence is weak or policy is unclear, result is `abstain` per autonomy-and-approval-policy.md section 12
  - Audit event written for every policy evaluation
- Source: autonomy-and-approval-policy.md sections 6, 8, and 12

#### US-25: Forbidden Action Enforcement
As the policy engine, I need to block all T5 actions unconditionally so that NestFleet never executes prohibited operations regardless of what a persona proposes.

- Priority: must
- Dependencies: US-21
- Acceptance criteria:
  - Blocked actions: merge/deploy, credential changes, compensation/legal commitments, account termination, HR/worker-monitoring workflows, cross-customer training on customer content
  - Block is enforced at the policy layer, not just in persona prompts
  - Blocked attempts produce an audit event and internal alert
- Source: autonomy-and-approval-policy.md section 11, legal-compliance-eu-germany.md section 10

#### US-26: Abstain and Escalate Behavior
As the policy engine, I need to force abstention and escalation when conditions are uncertain so that NestFleet never acts on incomplete or conflicting evidence.

- Priority: must
- Dependencies: US-24, EPIC-05 (lead routing)
- Acceptance criteria:
  - Abstention triggers: conflicting evidence, low-trust retrieval only, cross-product boundary, possibly critical but incomplete, regulated/prohibited domain, validator-proposer disagreement
  - Escalation target follows policy: Support Lead for communication, Product Lead for prioritization, Change Lead for implementation, all leads for critical outage
  - Abstention rate is tracked as a metric
- Source: autonomy-and-approval-policy.md section 12

#### US-27: Rollout Gate and Kill Switch
As an operator, I need to enable/disable automation paths with feature flags and kill switches so that new automation can be tested in review-only mode before going live.

- Priority: should
- Dependencies: US-24
- Acceptance criteria:
  - Each automation path (auto-reply, auto-change-draft, auto-PR-draft) has an independent enable/disable flag
  - Review-only mode: proposals are generated and validated but require manual execution
  - Disagreement and abstain rates are logged per automation path
  - Kill switch immediately disables an automation path and routes all affected work to lead review
- Source: autonomy-and-approval-policy.md section 13

**Out-of-scope clarifications:**
- Secondary LLM-based validator (v1 uses schema + rule-based validation; LLM validator is a later enhancement)
- Policy DSL or visual policy editor (v1 policies are code-configured)
- Cross-customer policy learning

**Epic-level acceptance criteria:**
- Every consequential AI action produces a typed proposal and validation record
- Policy evaluation correctly gates auto-reply, change-draft, and PR-draft paths based on documented thresholds
- Forbidden actions are always blocked
- Abstention works correctly when evidence is insufficient
- Automation paths can be independently enabled, disabled, or put in review-only mode

**Dependencies:** EPIC-03 (evidence for validation), EPIC-05 (escalation targets), EPIC-10 (audit events)

---

### EPIC-05: Approval & Lead Routing

**Objective:** Implement the approval queue, lead routing model, and decision capture so that every approval-gated action reaches the right human with the right context and rationale is preserved.

**Why it matters:** NestFleet is a governed system. The approval model is what makes it trustworthy for operators and legally defensible. Without explicit lead routing, escalations go nowhere. Without approval capture, there is no accountability. This is also required for AI Act compliance (no fully automated consequential decisions).

**Source documents:** domain-model.md (Approval aggregate, section 9 lead routing), autonomy-and-approval-policy.md (sections 9, 10), case-and-change-lifecycle.md (approval-gated transitions), legal-compliance-eu-germany.md (section 5.6).

**In-scope stories:**

#### US-28: Approval Record Creation
As the approval service, I need to create Approval records when the policy engine determines human approval is required so that every gated action has a formal approval request.

- Priority: must
- Dependencies: US-24 (policy engine), EPIC-12 (identity)
- Acceptance criteria:
  - Approval record created with minimum fields per domain-model.md section 4.8
  - Approval package includes: target entity, requested action, rationale, risk level, evidence refs, policy outcome, expected user impact, rollback note
  - Approval linked to the requesting persona and target entity (case, change request, or PR draft)
  - Status starts as `pending`
- Source: domain-model.md section 4.8, autonomy-and-approval-policy.md section 10

#### US-29: Lead Role Routing
As the approval service, I need to route approval requests to the correct lead role based on the action type so that the right person sees each request.

- Priority: must
- Dependencies: US-28, EPIC-09 (lead role mapping)
- Acceptance criteria:
  - Routing rules per autonomy-and-approval-policy.md section 9:
    - High-impact user communication -> Support Lead
    - Product behavior/roadmap tradeoff -> Product Lead
    - Change request approval -> Change Lead
    - Docs/runbook publication -> Knowledge Lead
  - One human may hold multiple lead roles
  - Routing respects product-scoped team configuration
  - If the mapped lead is unavailable, escalation policy applies per EPIC-06
- Source: domain-model.md section 9, autonomy-and-approval-policy.md section 9

#### US-30: Approval Decision Capture
As a lead, I need to approve or reject an action with a rationale so that the decision is recorded, the case progresses, and the audit trail is complete.

- Priority: must
- Dependencies: US-28
- Acceptance criteria:
  - Lead can approve or reject with free-text rationale
  - Decision updates the Approval record status and decided_at timestamp
  - Approval triggers the next state transition on the target entity
  - Rejection updates the target entity status and notifies the originating persona
  - Audit event written for every decision
  - Decision is final (no silent re-approval without new request)
- Source: domain-model.md section 4.8, case-and-change-lifecycle.md section 6.2

#### US-31: Approval Queue View
As an operator or lead, I need to see all pending approvals assigned to my roles so that nothing falls through the cracks.

- Priority: must
- Dependencies: US-28, EPIC-11 (operator console)
- Acceptance criteria:
  - Queue shows pending approvals filtered by lead role
  - Each item shows: target type, action summary, risk level, evidence summary, requested_at, SLA status
  - Queue is sorted by priority and age
  - Queue count is visible from the main console navigation
- Source: mvp-scope.md section 5

**Out-of-scope clarifications:**
- Multi-step approval chains (v1 uses single-lead approval per action)
- Delegated approvals or deputy routing
- Approval via Telegram (email notification with console action in v1)

**Epic-level acceptance criteria:**
- Every approval-gated action produces an Approval record routed to the correct lead
- Leads can approve or reject with rationale through the operator console
- Approval decisions trigger correct state transitions and audit events
- Pending approvals are visible and trackable

**Dependencies:** EPIC-04 (policy engine triggers approvals), EPIC-06 (notification of approval requests), EPIC-09 (lead role mapping), EPIC-11 (console for approval actions), EPIC-12 (identity)

---

### EPIC-06: Notification Control Plane

**Objective:** Implement notification creation, deduplication, priority routing, quiet-hours behavior, acknowledgement tracking, escalation chains, and email delivery so that operators and users receive the right information at the right time without noise.

**Why it matters:** Notifications are operational control signals, not cosmetic output. If they are too noisy, operators abandon the system. If they are too quiet, critical cases are missed. The notification control plane is what distinguishes NestFleet from a passive dashboard. This is identified as a key risk area in technical-risks-and-spikes.md.

**Source documents:** notification-model.md (full document), domain-model.md (Notification, Escalation Policy aggregates), system-architecture.md (Notification Service), technical-risks-and-spikes.md (spike 5).

**In-scope stories:**

#### US-32: Notification Record Creation
As the notification service, I need to create Notification records from system events so that every important event is captured as a typed notification before delivery.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Notification record created with all minimum fields per domain-model.md section 4.11
  - Notification carries: kind, priority, audience_type, channel, source_type, source_ref, correlation_id, ack_required, ack_deadline
  - Event-to-notification mapping per notification-model.md section 10 implemented for all listed events
- Source: domain-model.md section 4.11, notification-model.md section 10

#### US-33: Notification Priority and Quiet Hours
As the notification service, I need to enforce priority-based delivery rules and quiet-hours policies so that critical alerts break through immediately while normal traffic respects operator hours.

- Priority: must
- Dependencies: US-32
- Acceptance criteria:
  - Four priorities implemented: critical, high, normal, low
  - Default quiet hours: 20:00-08:00 local time + weekends
  - Critical bypasses quiet hours; ack deadline 10 minutes; repeats every 30 minutes until acknowledged
  - High: ack deadline 60 minutes during business hours; defers outside quiet hours unless outage/urgent
  - Normal: ack deadline 4 business hours; one reminder after 2 business hours
  - Low: digest only, no ack required
  - Digest windows default to 09:00 and 17:00 local time
- Source: notification-model.md sections 8 and 9

#### US-34: Notification Deduplication and Suppression
As the notification service, I need to deduplicate and suppress redundant notifications so that operators are not overwhelmed by repeated alerts about the same event.

- Priority: must
- Dependencies: US-32
- Acceptance criteria:
  - Dedup by: product_id + source_type + source_ref + kind + priority
  - Identical reminders not resent within active retry window
  - Related low-priority signals collapsed into next digest window
  - Older pending notification replaced by newer higher-priority notification for same source
  - Suppression count tracked as a metric
- Source: notification-model.md section 11

#### US-35: Notification State Machine
As the notification service, I need to track notification lifecycle through defined states so that delivery, acknowledgement, and escalation are deterministic.

- Priority: must
- Dependencies: US-32
- Acceptance criteria:
  - States implemented: pending, sent, acknowledged, escalated, suppressed, failed
  - Every transition writes an audit event
  - Failed deliveries requeue with backoff; final failure emits internal alert
  - Delivery is at-least-once with idempotent dedup keys
- Source: domain-model.md section 6.3, notification-model.md section 14

#### US-36: Escalation Chain Execution
As the notification service, I need to escalate unacknowledged notifications through the defined escalation chain so that critical and high-priority items reach a human.

- Priority: must
- Dependencies: US-35, EPIC-05 (lead routing)
- Acceptance criteria:
  - Escalation follows notification-model.md section 12:
    - Critical: operator -> Support Lead + Product Lead -> secondary channel retry
    - High: primary lead -> reminder -> optional secondary channel
    - Normal: primary lead -> one reminder -> digest fallback
    - Low: no escalation, digest only
  - Escalation policy records per domain-model.md section 4.12 drive timeouts and retry strategy
  - Escalation events are auditable
- Source: notification-model.md section 12, domain-model.md section 4.12

#### US-37: Email Notification Delivery
As the notification service, I need to deliver notifications via email so that operators and users receive alerts through the v1 delivery channel.

- Priority: must
- Dependencies: US-35
- Acceptance criteria:
  - Internal notifications delivered via email to operator and lead addresses
  - External notifications (user follow-up, clarification, resolution) delivered to user email
  - External notifications use the same channel as originating conversation
  - Email templates are channel-aware per notification-model.md section 13
  - AI disclosure included in user-facing messages per legal-compliance-eu-germany.md section 5.4
  - No marketing content in support flows
  - Delivery attempts are auditable
- Source: notification-model.md sections 7 and 13, legal-compliance-eu-germany.md section 5.4

#### US-38: Acknowledgement Tracking
As the notification service, I need to track whether notifications requiring acknowledgement have been acknowledged so that escalation and SLA tracking work correctly.

- Priority: must
- Dependencies: US-35
- Acceptance criteria:
  - Ack tracking for critical, high, and normal notifications
  - Ack can happen via console action or email reply (email ack via reply-to tracking)
  - Missed ack triggers escalation per US-36
  - Ack latency tracked as a metric
- Source: notification-model.md sections 8 and 9

#### US-39: Digest Summary Generation
As the notification service, I need to batch low-priority notifications into digest summaries delivered at configured windows so that operators get a manageable overview without per-item interruption.

- Priority: should
- Dependencies: US-34, US-37
- Acceptance criteria:
  - Digest compiled from pending low-priority notifications
  - Delivered at 09:00 and 17:00 local time by default
  - Digest includes: summary of new cases, stale items, pending approvals, resolved cases
  - Individual items suppressed from separate delivery when included in digest
- Source: notification-model.md sections 5.1 and 9

#### US-40: Stale Case and Change Alerts
As the notification service, I need to emit alerts when cases or change requests are stuck in waiting states beyond SLA thresholds so that nothing silently rots.

- Priority: should
- Dependencies: US-32
- Acceptance criteria:
  - stale_case_alert for cases stuck in awaiting-user or awaiting-lead beyond SLA
  - stale_change_alert for change requests stuck in analysis or implementation-prep beyond 2 business days
  - Alerts routed to the assigned lead role
- Source: notification-model.md section 5.1, case-and-change-lifecycle.md section 8.2

**Out-of-scope clarifications:**
- Telegram delivery channel (deferred to fast-follow)
- Voice, SMS, or phone-call escalation
- Custom user-configurable notification builders
- Complex incident paging rotations

**Epic-level acceptance criteria:**
- Every significant system event produces a correctly prioritized notification
- Critical notifications reach operators within 10 minutes and escalate if unacknowledged
- Normal traffic compresses into manageable load
- Duplicate suppression works
- Quiet hours are respected for non-critical items
- Notification metrics (send rate, ack latency, escalation rate, suppression count) are trackable

**Dependencies:** EPIC-05 (lead routing for escalation), EPIC-10 (audit events), EPIC-12 (identity for audience resolution)

---

### EPIC-07: Grounded User-Request Resolution

**Objective:** Enable the Frontline and Steward personas to answer routine user requests directly when confidence, evidence, and policy thresholds are met, producing validated replies grounded in product memory.

**Why it matters:** This is the highest-value automation path in NestFleet v1. If it works, it proves that the system can safely handle real support volume. If it fails, it proves that the product memory and validation layers need more work before the change path matters. This corresponds to mvp-scope.md Slice 2.

**Source documents:** autonomy-and-approval-policy.md (sections 7.1, 8.1, 15), case-and-change-lifecycle.md (section 7.1), mvp-scope.md (Slice 2), technical-risks-and-spikes.md (spikes 1, 3).

**In-scope stories:**

#### US-41: Evidence-Based Reply Generation
As the Frontline persona, I need to generate a reply to a user request using a product memory evidence pack so that the answer is grounded in approved sources, not hallucinated.

- Priority: must
- Dependencies: US-18 (evidence pack), US-22 (typed proposal)
- Acceptance criteria:
  - Reply is generated from evidence pack content, not from model parametric knowledge alone
  - Reply draft is a typed proposal with: reply text, evidence refs, confidence score, source citations
  - Reply includes citations to source documents
  - Reply does not contain unsupported root-cause claims, promises, compensation, or legal commitments
- Source: autonomy-and-approval-policy.md section 7.1, architecture-decisions.md ADR-007

#### US-42: Auto-Reply Threshold Evaluation
As the policy engine, I need to evaluate whether a generated reply can be sent automatically or must be routed to a lead so that only safe, well-grounded answers go out without human review.

- Priority: must
- Dependencies: US-41, US-24 (policy evaluation)
- Acceptance criteria:
  - Auto-send allowed only when all conditions met: case type is user_request, severity is normal or low, confidence >= 0.85, retrieval uses only approved source tiers, validator pass recorded, no custom promise or unsupported claim
  - If any condition fails: reply saved as draft and routed to Support Lead or operator
  - Validation record created for every evaluation
  - Threshold values are configurable per product
- Source: autonomy-and-approval-policy.md section 8.1

#### US-43: Reply Delivery via Email
As the notification service, I need to deliver approved replies to users via email so that the resolution reaches the user through their original channel.

- Priority: must
- Dependencies: US-42, US-37 (email delivery)
- Acceptance criteria:
  - Reply sent from the product's configured email address
  - Reply maintains thread continuity with the original conversation
  - AI disclosure included per legal-compliance-eu-germany.md section 5.4
  - Reply queued for next business window during quiet hours (for non-critical items)
  - Delivery success/failure tracked
- Source: notification-model.md section 13, legal-compliance-eu-germany.md section 5.4

#### US-44: Draft Reply Review by Lead
As a Support Lead, I need to review reply drafts that did not meet the auto-send threshold so that I can approve, edit, or reject them before they reach the user.

- Priority: must
- Dependencies: US-42, US-31 (approval queue)
- Acceptance criteria:
  - Draft reply appears in the approval queue with: reply text, evidence sources, confidence score, reason for manual routing
  - Lead can approve as-is, edit and approve, or reject with rationale
  - Approved reply is sent via US-43
  - Rejected reply returns the case to the Steward for re-evaluation
  - Decision captured as an Approval record
- Source: autonomy-and-approval-policy.md section 8.1

#### US-45: Resolution Completion and Knowledge Check
As the case control plane, I need to mark a case as resolved after a validated reply is delivered and trigger a knowledge capture check so that the resolution enters the learning loop.

- Priority: must
- Dependencies: US-43, US-13 (closure), US-20 (knowledge capture)
- Acceptance criteria:
  - Case transitions to `resolved` after reply delivery and user follow-up window
  - Knowledge capture check evaluates whether the resolution should produce a Knowledge Asset candidate
  - Resolution summary written to case record
  - User follow-up notification scheduled per notification policy
- Source: case-and-change-lifecycle.md section 10.1

**Out-of-scope clarifications:**
- Resolution of bug reports or outage reports (those follow the change path in EPIC-08)
- Multi-turn conversational resolution (v1 handles single-exchange resolution; multi-turn uses the clarification flow in US-10)
- Voice or chat-based resolution channels

**Epic-level acceptance criteria:**
- A routine user question about DocuGardener receives a grounded, cited answer within the configured SLA
- Answers that meet all threshold conditions are sent automatically
- Answers below threshold are routed to Support Lead for review
- No unsupported claims, promises, or hallucinated content reaches the user
- Resolution produces audit trail and triggers knowledge capture check

**Dependencies:** EPIC-03 (evidence packs), EPIC-04 (validation), EPIC-05 (approval for draft reviews), EPIC-06 (email delivery)

---

### EPIC-08: Change Management & GitHub Integration

**Objective:** Implement the change request lifecycle, GitHub issue syncing, implementation context assembly, and PR draft generation so that cases requiring product changes flow through to reviewable engineering artifacts.

**Why it matters:** The change path is what differentiates NestFleet from a support-only system. Without GitHub-first change management, NestFleet loses its strongest market differentiator per market-landscape.md. This corresponds to mvp-scope.md Slices 3 and 4.

**Source documents:** case-and-change-lifecycle.md (section 6), domain-model.md (Change Request, PR Draft aggregates), autonomy-and-approval-policy.md (sections 7.3, 7.4, 8.2, 8.3), system-architecture.md (Change Service), architecture-decisions.md (ADR-008), technical-risks-and-spikes.md (spike 4), mvp-scope.md (Slices 3, 4).

**In-scope stories:**

#### US-46: Change Request Creation
As the Steward persona, I need to create a Change Request when a case or problem requires a product change so that change work enters a governed lifecycle.

- Priority: must
- Dependencies: US-11 (triage routing), US-12 (problem linking)
- Acceptance criteria:
  - Change Request created with minimum fields per domain-model.md section 4.7
  - Origin type set (case, problem, or manual)
  - Required evidence per autonomy-and-approval-policy.md section 7.3: problem statement, affected area, linked case/problem refs, GitHub target
  - Auto-creation threshold: bug_report/outage_report/repeated feedback + confidence >= 0.75 + evidence complete
  - If threshold not met, route to Product Lead or Change Lead
  - Initial status: `draft`
  - Validation record emitted
- Source: domain-model.md section 4.7, autonomy-and-approval-policy.md sections 7.3 and 8.2

#### US-47: Change Request State Machine
As the change service, I need to enforce the change request state machine so that changes progress through analysis, approval, implementation, and PR draft with required controls at each boundary.

- Priority: must
- Dependencies: US-46
- Acceptance criteria:
  - All eight states implemented: draft, analysis, approval-pending, approved, implementation-prep, pr-drafted, completed, rejected
  - Transition rules per case-and-change-lifecycle.md section 6.2 enforced
  - Required artifacts before each transition per section 6.2
  - Every transition writes an audit event
  - Rejected changes update linked case and notify originating persona
- Source: case-and-change-lifecycle.md section 6, domain-model.md section 6.2

#### US-48: GitHub Issue Sync
As the Change persona, I need to create and sync GitHub Issues for change requests so that every change-worthy case is tracked in the product's GitHub repository.

- Priority: must
- Dependencies: US-47
- Acceptance criteria:
  - GitHub Issue created via REST API when change request enters `analysis`
  - Issue contains: title, problem summary, linked case refs, severity, affected area
  - GitHub issue ref stored on Change Request record
  - Status changes in NestFleet are reflected as GitHub Issue comments or label updates
  - GitHub webhook events for issue updates are ingested back as signals
  - Minimum necessary context sent to GitHub per legal-compliance-eu-germany.md section 7.4
- Source: architecture-decisions.md ADR-008, domain-model.md section 11

#### US-49: Approval Package for Change Request
As the Change persona, I need to prepare an approval package for the Change Lead so that the approval decision is informed by complete context.

- Priority: must
- Dependencies: US-47, US-28 (approval creation)
- Acceptance criteria:
  - Package contains per autonomy-and-approval-policy.md section 10: change summary, risk level, affected surfaces, proposed approval role, user-communication implication, rollback note
  - Package includes evidence refs and policy evaluation result
  - Change request transitions to `approval-pending` only when package is complete
  - Approval request routed to Change Lead (or Product Lead for behavior/roadmap tradeoffs)
- Source: autonomy-and-approval-policy.md section 10, case-and-change-lifecycle.md section 9.3

#### US-50: Implementation Context Assembly
As the Change persona, I need to assemble repository context for PR draft preparation so that the generated diff is informed by actual code structure, existing patterns, and relevant docs.

- Priority: must
- Dependencies: US-47 (approved state), US-18 (evidence pack)
- Acceptance criteria:
  - Context assembled after change request reaches `approved` status
  - Context includes: repository file tree (relevant subset), existing related code, doc structure, test patterns, related PR history
  - Context is scoped to the minimum needed per legal-compliance-eu-germany.md section 7.4
  - No secrets, credentials, or production tokens included in context
  - Context attached to the change request record
- Source: autonomy-and-approval-policy.md section 7.4, system-architecture.md section 5.12

#### US-51: PR Draft Generation
As the Change persona, I need to generate a PR draft with code or documentation changes tied to the approved change request so that the operator has a reviewable engineering artifact.

- Priority: must
- Dependencies: US-50, US-23 (validation record)
- Acceptance criteria:
  - PR Draft record created with minimum fields per domain-model.md section 4.9
  - Branch created in the target repository
  - Diff includes proposed changes with clear commit messages
  - PR opened as draft on GitHub via REST API
  - PR body links back to: change request, originating case, evidence summary
  - Validation record created per autonomy-and-approval-policy.md section 8.3
  - PR draft creation requires: approved change request, repo permissions, validator pass, no secrets
  - Change request transitions to `pr-drafted`
- Source: domain-model.md section 4.9, autonomy-and-approval-policy.md section 8.3

#### US-52: PR Draft Review Handoff
As an operator or Change Lead, I need to review the generated PR draft and mark the change request as completed or send it back for revision so that the v1 lifecycle terminates cleanly.

- Priority: must
- Dependencies: US-51, EPIC-11 (PR draft review in console)
- Acceptance criteria:
  - PR draft visible in operator console with: diff summary, test summary, validation record, linked case and change request
  - Operator can mark as completed (change request -> `completed`, case -> `resolved`)
  - Operator can reject with rationale (change request -> `rejected`)
  - Completion triggers notification (pr_ready) and knowledge capture check
  - `pr-drafted -> completed` is the v1 terminal point
- Source: case-and-change-lifecycle.md section 6.2, mvp-scope.md section 5

#### US-53: GitHub Webhook Ingestion
As the ingress pipeline, I need to receive GitHub webhook events for issues and pull requests so that external changes to change-linked artifacts are reflected in NestFleet.

- Priority: should
- Dependencies: US-48
- Acceptance criteria:
  - Webhook receiver handles: issue comments, issue state changes, PR review events, PR merge events
  - Events create signals linked to the relevant change request
  - Mirrored state is additive (GitHub events update NestFleet records but do not override controlled state transitions)
  - Webhook signature verification for security
- Source: architecture-decisions.md ADR-008

**Out-of-scope clarifications:**
- Merge or deploy (v1 ends at approved PR draft)
- Multi-repo change coordination
- CI/CD pipeline integration
- Automated test execution against PR drafts

**Epic-level acceptance criteria:**
- A bug report case flows through: change request creation -> GitHub issue sync -> approval -> PR draft generation -> review handoff
- PR drafts are linked to cases, change requests, and GitHub issues with full traceability
- Approval is required before PR draft creation
- No secrets or credentials appear in model prompts or PR content
- Change requests can be rejected at any stage with rationale

**Dependencies:** EPIC-02 (case lifecycle), EPIC-03 (evidence for context), EPIC-04 (validation), EPIC-05 (approval), EPIC-06 (notifications), EPIC-12 (GitHub auth)

---

### EPIC-09: Configurable Role Templates & Team Composition

**Objective:** Implement the role template registry and product-scoped team configuration so that operators can enable, disable, and configure shipped personas per product without custom role authoring.

**Why it matters:** Configurable team composition is central to the NestFleet product story per ADR-013. Without it, NestFleet is a fixed three-persona system. With it, the system can adapt to different product needs by adjusting which roles are active and how they are configured. This is what makes NestFleet feel like a virtual team rather than a rigid bot.

**Source documents:** domain-model.md (Role Template, Active Team Member aggregates), system-architecture.md (Team Configuration and Role Registry, section 9), architecture-decisions.md (ADR-013, ADR-014), technical-risks-and-spikes.md (spike 6).

**In-scope stories:**

#### US-54: Role Template Registry
As the system, I need to store shipped role template definitions so that the platform has a canonical set of configurable personas with defined responsibilities, tool scopes, and boundaries.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Role Template record with minimum fields per domain-model.md section 4.15
  - v1 ships three templates: Frontline, Steward, Change
  - Each template defines: responsibilities, allowed issue classes, allowed channels, tool scope, retrieval profile, notification profile, approval boundary
  - Templates are immutable shipped configuration (not user-editable in v1)
- Source: domain-model.md section 4.15, system-architecture.md section 9.1

#### US-55: Active Team Member Configuration
As an operator, I need to create product-scoped team members by enabling role templates and configuring per-product overrides so that each product has a tailored team composition.

- Priority: must
- Dependencies: US-54
- Acceptance criteria:
  - Active Team Member record with minimum fields per domain-model.md section 4.16
  - Team member is product-scoped (one product, one role template instance)
  - Operator can enable or disable team members
  - Per-product overrides allowed for: channel scope, tool scope, retrieval scope, lead role mapping, notification policy
  - Overrides constrained within the role template's boundaries (cannot exceed template permissions)
  - Flow engine respects active team composition when scheduling work
- Source: domain-model.md section 4.16, system-architecture.md section 9.2

#### US-56: Lead Role Mapping
As an operator, I need to map human lead roles (Support Lead, Product Lead, Change Lead, Knowledge Lead) to specific operators per product so that approval routing and escalation reach the right person.

- Priority: must
- Dependencies: US-55, EPIC-12 (identity)
- Acceptance criteria:
  - Each active team member can have a lead_role_mapping
  - One human identity can map to multiple lead roles
  - Lead mapping is used by EPIC-05 for approval routing and EPIC-06 for escalation
  - Unmapped roles produce a configuration warning
- Source: domain-model.md section 3.2, section 9

#### US-57: Team Composition Validation
As the system, I need to validate that the active team composition for a product covers all required flows so that an incomplete team does not silently break the lifecycle.

- Priority: should
- Dependencies: US-55
- Acceptance criteria:
  - Validation checks: at least one Frontline-capable member, at least one Steward-capable member, at least one Change-capable member (if change path is enabled)
  - Missing lead role mappings produce warnings
  - Validation runs on team configuration changes and on product activation
  - Validation results visible in operator console
- Source: system-architecture.md section 9.3, technical-risks-and-spikes.md spike 6

**Out-of-scope clarifications:**
- Arbitrary user-authored role definitions or role DSL
- Visual flow builder for custom persona workflows
- Unconstrained prompt editing as the primary configuration mechanism
- Role Profile Versions and Role Improvement Candidates (later-phase aggregates per domain-model.md sections 4.17, 4.18)
- Governed role improvement loop (per ADR-014, later phase)

**Epic-level acceptance criteria:**
- DocuGardener is configured with three active team members (Frontline, Steward, Change) with appropriate lead mappings
- Disabling a team member adjusts flow routing without system errors
- Per-product overrides work within template boundaries
- Incomplete team composition produces clear warnings

**Dependencies:** EPIC-12 (identity for lead mapping), EPIC-02 (control plane respects team composition)

---

### EPIC-10: Auditability & Compliance Controls

**Objective:** Implement immutable audit events, retention controls, DSAR-ready search, AI disclosure, and the compliance infrastructure required for the customer's own GDPR compliance and AI Act transparency. Under the client-installed model, NestFleet is a software vendor, not a data processor for customer operational data. Compliance controls exist to support the customer's obligations, not to satisfy NestFleet processor duties.

**Why it matters:** The customer's NestFleet installation handles personal data, makes operational decisions, and communicates with end users. The customer bears GDPR controller (or processor) obligations for this data; NestFleet as a software vendor provides the tooling to meet those obligations. Without auditability, the product is operationally opaque and the customer cannot demonstrate compliance. Audit logging is not a later feature; it is an MVP security baseline per legal-compliance-eu-germany.md section 8.1. Every other epic depends on audit events being written correctly.

**Source documents:** domain-model.md (Audit Event aggregate), legal-compliance-eu-germany.md (full document, especially sections 4, 5, 8), autonomy-and-approval-policy.md (section 6), system-architecture.md (Audit and Analytics).

**In-scope stories:**

#### US-58: Immutable Audit Event Creation
As the audit service, I need to write immutable audit events for every significant state transition and AI action so that there is a complete, tamper-evident operational record.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Audit Event record with minimum fields per domain-model.md section 4.13
  - Events written for: signal creation, case transitions, change request transitions, approval decisions, notification sends, validation records, policy evaluations, PR draft creation
  - Events are append-only; no update or delete
  - Events include: entity_type, entity_ref, actor_type (persona, operator, system), actor_ref, action, timestamp, metadata
  - Events stored in PostgreSQL with write-ahead integrity
- Source: domain-model.md section 4.13, legal-compliance-eu-germany.md section 8.1

#### US-59: Audit Trail Query
As an operator, I need to query the audit trail by entity, actor, time range, and action type so that I can investigate any case, decision, or AI action after the fact.

- Priority: must
- Dependencies: US-58
- Acceptance criteria:
  - Query supports filtering by: entity_type, entity_ref, actor_type, actor_ref, action, time range
  - Results ordered by timestamp
  - Query performance acceptable for operational use (indexed on common query patterns)
  - Audit trail accessible from operator console case detail view
- Source: legal-compliance-eu-germany.md section 4.5, system-architecture.md section 5.13

#### US-60: Retention and Deletion Controls
As the system, I need to enforce configurable retention windows and propagate deletion into all storage layers so that GDPR data minimization and erasure obligations can be met.

- Priority: must
- Dependencies: US-58
- Acceptance criteria:
  - Retention windows configurable per product and per record type
  - Deletion propagates to: PostgreSQL records, product memory index, S3-stored artifacts
  - Deletion of personal data from product memory triggers re-indexing
  - Deletion events are themselves audited (record of what was deleted and when, without preserving the deleted content)
  - Configurable retention settings per client-installed deployment
- Source: legal-compliance-eu-germany.md sections 4.3 and 4.5

#### US-61: DSAR-Ready Search and Export
As an operator, I need to search for all records associated with a specific identity and export them so that data subject access requests can be fulfilled.

- Priority: must
- Dependencies: US-59, EPIC-12 (identity)
- Acceptance criteria:
  - Search by identity_id returns: signals, conversations, cases, notifications, audit events, validation records, and any associated knowledge assets
  - Export in a structured format (JSON or CSV)
  - Export includes metadata about AI-generated content and decisions
  - Rectification support: operator can correct identity data and propagate changes
- Source: legal-compliance-eu-germany.md section 4.5

#### US-62: AI Disclosure in External Communications
As the system, I need to include AI disclosure in all user-facing email communications so that end users know they are interacting with an AI system, meeting AI Act transparency requirements.

- Priority: must
- Dependencies: US-37 (email delivery)
- Acceptance criteria:
  - AI disclosure template included in all outbound user-facing emails
  - Disclosure happens at first contact and remains visible in thread
  - Disclosure text is configurable per product
  - Disclosure presence is verified by the validation layer before outbound delivery
- Source: legal-compliance-eu-germany.md section 5.4

#### US-63: Prompt Minimization and Redaction
As the system, I need to minimize personal data sent to external model providers and redact sensitive content before model calls so that data exposure is limited to what is necessary.

- Priority: must
- Dependencies: US-18 (evidence packs)
- Acceptance criteria:
  - Evidence packs sent to models contain only the minimum content needed for the task
  - PII redaction applied before external model calls where feasible (email addresses, phone numbers)
  - Secrets, credentials, and production tokens never included in model prompts
  - Redaction rules are configurable
  - Model call payloads are logged (with redaction) for audit purposes
- Source: legal-compliance-eu-germany.md sections 7.3 and 8.2, autonomy-and-approval-policy.md section 7.4

#### US-64: Operational Metrics Collection
As the system, I need to collect operational metrics for automation quality so that the team can monitor false-positive rates, abstain rates, and resolution quality.

- Priority: should
- Dependencies: US-58
- Acceptance criteria:
  - Metrics tracked: auto-reply rate, abstain rate, lead-override rate, escalation rate, resolution time by case type, notification-to-action conversion rate, user-facing correction rate
  - Metrics exposed via OpenTelemetry per ADR-011
  - Metrics queryable for weekly review during pilot per autonomy-and-approval-policy.md section 16
- Source: system-architecture.md section 5.13, notification-model.md section 15, autonomy-and-approval-policy.md section 16

**Out-of-scope clarifications:**
- BSI C5 certification (later market requirement)
- SBOM generation (CRA future requirement, not MVP blocker)
- Formal DPIA document generation (NestFleet provides data for DPIA; the document is a legal deliverable)
- Employee performance analytics (forbidden per legal-compliance-eu-germany.md section 10)

**Epic-level acceptance criteria:**
- Every state transition and AI action across all epics produces an immutable audit event
- An operator can reconstruct the full history of any case from audit trail alone
- Retention and deletion work end-to-end including product memory
- DSAR search returns all records for a given identity
- AI disclosure appears in every user-facing email
- Model calls use minimized, redacted context

**Dependencies:** All other epics (audit events are cross-cutting)

---

### EPIC-11: Operator Console

**Objective:** Build the operator-facing web console incrementally, starting with the most operationally useful views, so that operators can monitor, review, approve, and manage NestFleet operations without needing direct database access.

**Why it matters:** The MVP must feel like an internal control console per mvp-scope.md section 5. Without it, operators have no visibility into the system and cannot perform their lead roles. The console is built most-useful-first rather than feature-complete; each view unlocks a specific operational capability.

**Source documents:** mvp-scope.md (section 5), system-architecture.md (reference stack: React).

**In-scope stories:**

#### US-65: Inbox and Case Queue View
As an operator, I need to see all active cases in a queue view with status, type, severity, age, and assignment so that I know what needs attention.

- Priority: must
- Dependencies: EPIC-02 (case records)
- Acceptance criteria:
  - Queue shows all cases for the configured product
  - Filterable by: status, type, severity, assigned lead role
  - Sortable by: severity, age, last update
  - Case count badges visible by status category
  - Queue refreshes on new case creation
- Source: mvp-scope.md section 5

#### US-66: Case Detail View
As an operator, I need to see full case detail including conversation history, evidence, classification, validation records, and linked artifacts so that I can understand any case completely.

- Priority: must
- Dependencies: US-65
- Acceptance criteria:
  - Shows: case metadata, conversation thread, enrichment details, classification rationale, evidence refs, linked problem/change request/PR draft
  - Shows: validation records and audit trail for the case
  - Shows: current state and allowed transitions
  - Operator can manually transition state where policy allows
  - Operator can add notes
- Source: mvp-scope.md section 5

#### US-67: Approval Queue View
As a lead, I need a dedicated approval queue showing all pending approvals assigned to my roles so that I can efficiently process approval-gated work.

- Priority: must
- Dependencies: US-31 (approval queue), US-65
- Acceptance criteria:
  - Shows pending approvals filtered by lead role
  - Each item shows: target summary, risk level, evidence summary, requested_at, SLA countdown
  - Approve and reject actions with rationale capture inline
  - Queue count visible in navigation
- Source: mvp-scope.md section 5

#### US-68: Change Request View
As an operator, I need to see change request details including linked cases, GitHub issue, approval status, and implementation context so that I can track change work through the lifecycle.

- Priority: must
- Dependencies: EPIC-08 (change request records)
- Acceptance criteria:
  - Shows: change request metadata, origin case/problem, risk level, current state, approval history
  - Shows: linked GitHub issue with link to GitHub
  - Shows: implementation context summary
  - Shows: linked PR draft if one exists
- Source: mvp-scope.md section 5

#### US-69: Notification Center
As an operator, I need a notification center showing recent notifications, acknowledgement status, and escalation state so that I can see what the system has communicated and what requires my attention.

- Priority: must
- Dependencies: EPIC-06 (notification records)
- Acceptance criteria:
  - Shows recent notifications grouped by priority
  - Shows acknowledgement status and deadline
  - Allows manual acknowledgement
  - Shows escalation chain state for unacknowledged items
  - Filterable by kind, priority, and status
- Source: mvp-scope.md section 5

#### US-70: PR Draft Review View
As an operator or Change Lead, I need to review PR draft details including diff summary, validation record, and linked case/change request so that I can accept or reject the generated artifact.

- Priority: must
- Dependencies: US-52 (PR draft handoff)
- Acceptance criteria:
  - Shows: PR draft metadata, diff summary, test summary, validation record
  - Shows: linked change request and originating case
  - Link to GitHub PR for full diff review
  - Accept (mark completed) and reject actions with rationale
- Source: mvp-scope.md section 5

#### US-71: Team Configuration View
As an operator, I need to view and configure the active team composition for a product so that I can enable/disable roles, adjust lead mappings, and see team validation warnings.

- Priority: should
- Dependencies: EPIC-09 (team configuration)
- Acceptance criteria:
  - Shows active team members with role template, status, and lead mapping
  - Allows enable/disable of team members
  - Allows lead role mapping changes
  - Shows team composition validation warnings
  - Shows per-product override settings
- Source: system-architecture.md section 9

#### US-72: Product Memory Status View ✅ DELIVERED (WAVE-5, 2026-03-22)
As an operator, I need to see the status of product memory sources (last ingested, chunk count, freshness) so that I can verify the system is working with current knowledge.

- Priority: should
- Dependencies: EPIC-03 (product memory)
- Acceptance criteria:
  - Shows registered sources with: type, trust tier, last ingestion time, chunk count, status ✅
  - Flags stale sources (not updated within configured freshness window) ✅ — freshness bar per source (red/amber/green)
  - Shows ingestion errors ✅ — error toast on failed ingest
  - Allows manual re-ingestion trigger ✅ — upload slide-over with full form (source type, URI, date, audience, version, markdown content)
- Source: mvp-scope.md section 6

**Delivered as Console WAVE-5 (2026-03-22).** Memory Sources tab on the Knowledge page. Full details in delivery archive Section 17.

#### US-73: Audit Trail View
As an operator, I need to browse and search the audit trail so that I can investigate decisions, review AI behavior, and respond to compliance queries.

- Priority: should
- Dependencies: US-59 (audit query)
- Acceptance criteria:
  - Searchable by entity, actor, action type, and time range
  - Timeline visualization for a given entity
  - Accessible from case detail view as a contextual audit trail
- Source: legal-compliance-eu-germany.md section 4.5

**Out-of-scope clarifications:**
#### US-87: AI-Resolved Badge

As an operator, I want to see a subtle visual indicator (sparkle/icon) next to the status of cases that were resolved entirely by AI agents without any human intervention, so that I can distinguish autonomous resolutions from human-assisted ones at a glance and build trust in the system over time.

- Priority: should
- Dependencies: EPIC-02 (case records), EPIC-10 (audit events)
- Acceptance criteria:
  - Badge is computed from audit trail: all `actor_type` values for the case are `agent` or `system` (zero `lead` or `operator` actions beyond signal creation)
  - Badge appears as a small icon next to the Status column in the cases list
  - Tooltip on hover shows: "Resolved automatically. N agent actions, 0 human interventions"
  - Clicking the badge navigates to the case lineage
  - `ai_resolved` computed field available in `findCasesByProduct` API response
  - Cases with mixed human+agent actions do NOT show the badge
- Source: PO discussion 2026-03-18

#### US-88: Settings Page

As an operator, I want a settings page in the console where I can configure LLM provider and API key, lead assignments, agent tone, and quiet hours, so that I can manage NestFleet configuration without editing env vars or running seed scripts.

- Priority: must
- Dependencies: EPIC-14 (Settings & Onboarding)
- Acceptance criteria:
  - Settings page accessible from navigation sidebar
  - Tabs: LLM Provider, Lead Assignments, Agent Behavior, Notification Policy
  - API key is masked after save (only last 4 chars visible)
  - Connection test button for LLM provider (validates key before saving)
  - All changes take effect on next agent run without server restart
- Source: PO discussion 2026-03-18

#### US-89: First-Run Configuration Wizard

As an operator installing NestFleet for the first time, I want a guided wizard that walks me through: account creation → LLM setup → product creation → lead assignment → GitHub connection, so that the product is operational within 10 minutes of installation.

- Priority: must
- Dependencies: EPIC-14, EPIC-12 (Identity)
- Acceptance criteria:
  - Wizard detects first-run state (no operator_users exist)
  - 5-step flow: Welcome → Connect LLM → Create Product → Assign Leads → Connect GitHub
  - Each step validates before allowing next (connection test, email format, repo access)
  - Wizard can be re-entered from settings if initial setup was partial
  - Completion redirects to Cases page with empty state
- Source: PO discussion 2026-03-18

#### US-90: Batch Memory Source Upload (DEFERRED-22)
As a knowledge lead, I want to point NestFleet at a local folder of markdown documents and have them all ingested in one operation, so that I can populate the memory index for a new product without manually pasting each document.

- Priority: should
- Dependencies: US-72 (memory status view, delivered WAVE-5), EPIC-03 (product memory pipeline)
- Acceptance criteria:
  - Operator selects a folder from the console (or provides a glob path via CLI)
  - System discovers all `.md`, `.mdx`, `.txt`, and `.yaml`/`.json` (OpenAPI) files recursively
  - Source type and audience are inferred from file path (e.g. `docs/faq.md` → `faq`, `docs/architecture/` → `architecture_overview`) with operator override available per file or per folder
  - Each file is ingested via the existing pipeline (chunk → tier → freshness → embed → upsert with dedup)
  - Progress is shown per file: filename, inferred source type, chunks ingested/skipped, status
  - Errors on individual files do not abort the batch — they are collected and shown at the end
  - Re-running on the same folder with unchanged files is a no-op (dedup by content_hash)
  - Final summary: N files processed, M chunks ingested, K chunks skipped (unchanged), E errors
- Source: operator feedback 2026-03-22 — "can I just load the local folder with the SAD package?"
- Deferred: see DEFERRED-22

**Out of scope (deferred):**

- Polished end-user self-service portal
- Mobile-optimized interface (desktop-first for operators)
- Real-time collaborative editing
- Dashboard with aggregated analytics (metrics are collected per US-64; dashboards are post-MVP)

**Epic-level acceptance criteria:**
- An operator can perform all daily operations (case review, approval, change tracking, notification management, PR review) through the console
- Every view loads within acceptable response time
- Console respects RBAC (operators see only their product, leads see only their approvals)

**Dependencies:** All other epics (console is the presentation layer for all operational data), EPIC-12 (authentication and RBAC)

---

### EPIC-12: Identity & Access Control

**Objective:** Implement OIDC-compatible authentication, app-level RBAC, operator and lead identity management, and the access control layer that secures every console and API action.

**Why it matters:** Identity is the enabler for everything else. Without it, approvals have no actor, audit events have no accountability, RBAC has no subject, and the console has no access control. This is not a later concern; it is an MVP security baseline per architecture-decisions.md ADR-009.

**Source documents:** architecture-decisions.md (ADR-009, ADR-010), domain-model.md (Identity aggregate), system-architecture.md (section 10), legal-compliance-eu-germany.md (section 8.1), technical-risks-and-spikes.md (spike 7).

**In-scope stories:**

#### US-74: OIDC-Compatible Authentication
As the system, I need to authenticate operators and leads through an OIDC-compatible identity boundary so that authentication is standards-based, compatible with the client-installed deployment model, and not custom-rolled.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - Authentication via OIDC-compatible provider (Keycloak as reference for client-installed deployments)
  - Customer configures their own OIDC provider as part of the client-installed deployment
  - Login produces a JWT with standard claims
  - Session management with token refresh
  - Logout invalidates session
- Source: architecture-decisions.md ADR-009

#### US-75: Application-Level RBAC
As the system, I need to enforce role-based access control on every console and API action so that operators see only their product and leads can only act on their assigned roles.

- Priority: must
- Dependencies: US-74
- Acceptance criteria:
  - Roles defined: operator, Support Lead, Product Lead, Change Lead, Knowledge Lead, system admin
  - Permissions scoped by product and role
  - One identity can hold multiple roles
  - Every API endpoint checks RBAC before processing
  - Console views filter content by role
  - Authorization logic is modular (prepared for later Zanzibar-class migration per ADR-010)
- Source: architecture-decisions.md ADR-010, system-architecture.md section 10

#### US-76: Operator and Lead Identity Management
As a system admin, I need to create operator accounts, assign them to products, and map them to lead roles so that the team is configured and access is controlled.

- Priority: must
- Dependencies: US-74, US-75
- Acceptance criteria:
  - Create/update/deactivate operator identities
  - Assign operators to products
  - Map operators to lead roles per product
  - Changes audited
  - At least one admin account required for initial setup
- Source: domain-model.md section 4.2, technical-risks-and-spikes.md spike 7

#### US-77: End-User Identity Resolution
As the system, I need to maintain Identity records for end users who contact DocuGardener so that cases, conversations, and notifications are linked to the correct person for communication and DSAR purposes.

- Priority: must
- Dependencies: US-03 (identity hint extraction)
- Acceptance criteria:
  - Identity record per domain-model.md section 4.2 for each known end user
  - Identity linked via email address
  - Provisional identities created from email headers on first contact
  - Identity merging when same user is identified across different email addresses (manual in v1)
  - Identity search supports DSAR workflows per US-61
- Source: domain-model.md section 4.2

#### US-78: Tenant and Product Isolation
As the system, I need to enforce data isolation between products (and later between tenants) so that DocuGardener data is not accessible from other product contexts.

- Priority: must
- Dependencies: US-75
- Acceptance criteria:
  - All queries scoped by product_id
  - No cross-product data leakage in console views, API responses, or product memory retrieval
  - Database-level row isolation by product_id
  - Architecture supports tenant isolation for future multi-tenant deployments if an optional hosted tier is added later
- Source: legal-compliance-eu-germany.md section 8.1, system-architecture.md section 10

**Out-of-scope clarifications:**
- Zanzibar-class fine-grained authorization (deferred per ADR-010)
- SSO federation with customer identity providers (later feature for Scale tier)
- Self-service registration (operators are admin-created in v1)
- OAuth scopes for third-party API consumers

**Epic-level acceptance criteria:**
- Operators authenticate via OIDC and receive role-appropriate console access
- Every API action is RBAC-checked
- One human can hold multiple lead roles and see consolidated approval queues
- Product isolation prevents cross-product data access
- Identity management supports DSAR search

**Dependencies:** None (enabler epic; all other epics depend on this)

---

### EPIC-13: License and Cloud Connection

**Objective:** Implement the license validation, feature gating, usage tracking, cloud connection, and trial mode that enforce the BSL licensing model and deliver continuous value from NestFleet Cloud without transmitting any customer data.

**Why it matters:** NestFleet is a client-installed product with a BSL license. Without license enforcement, there is no revenue model. Without the cloud connection, there is no continuous value delivery (updates, eval benchmarks, compliance templates, role improvements, security patches). Without feature gates, tier differentiation is impossible. This epic is the commercial backbone of the product. It must be present from day one because every production installation requires an active subscription or trial.

**Source documents:** monetization-and-licensing-model.md (full document), architecture-decisions.md (ADR-015, ADR-016, ADR-017).

**In-scope stories:**

#### US-79: License File Validation
As the license module, I need to verify a signed license file (JWT) at startup so that the system confirms it is running under a valid, non-expired license before enabling production features.

- Priority: must
- Dependencies: none
- Acceptance criteria:
  - License file is a signed JWT containing: customer_id, tier, max_products, max_ai_actions_monthly, features (feature flag list), issued_at, expires_at, update_channel_key
  - JWT signature verified against NestFleet public key at application startup
  - Invalid or missing license prevents the application from starting in production mode (development and evaluation modes remain available)
  - Expired license is detected; the application continues running but logs a warning and disables the update channel
  - License claims are parsed and made available to the feature gate service and usage tracker
  - Audit event written on license validation success and failure
- Source: monetization-and-licensing-model.md section 5.2

#### US-80: Feature Gate Service
As the license module, I need to check the current license tier before enabling tier-gated features so that customers only access features included in their subscription.

- Priority: must
- Dependencies: US-79
- Acceptance criteria:
  - Feature gate checks are centralized in the license module, not scattered through business logic
  - Features are cleanly separated into always-available and tier-gated categories at the module level
  - Gate checks use the `features` list and `tier` from the validated license
  - Gated features return a clear "feature not available in current tier" response when accessed without entitlement
  - Feature gate state is queryable by other modules (EPIC-04 policy engine, EPIC-09 role templates)
  - Gate decisions are deterministic and cacheable (no per-request network calls)
- Source: monetization-and-licensing-model.md section 10.3

#### US-81: Usage Tracker
As the license module, I need to count AI actions per month locally so that usage limits per tier can be enforced and aggregate usage metadata can be reported to NestFleet Cloud.

- Priority: must
- Dependencies: US-79
- Acceptance criteria:
  - AI actions (model calls that produce typed proposals) are counted per calendar month
  - Usage counts are stored locally in PostgreSQL, not sent in real time
  - When the monthly limit (max_ai_actions_monthly from license) is approached (80%), a warning is surfaced in the operator console
  - When the monthly limit is reached, behavior degrades gracefully: new AI actions are queued for lead review instead of auto-executing, but the system does not stop
  - Usage counter resets on calendar month boundary
  - No phone-home is required for usage tracking to function
- Source: monetization-and-licensing-model.md sections 5.2 and 10.1

#### US-82: Cloud Connection Client
As the cloud connection module, I need to connect to NestFleet Cloud to pull software updates, evaluation benchmarks, compliance templates, role template improvements, and security advisories so that the customer installation receives continuous value.

- Priority: must
- Dependencies: US-79 (update_channel_key from license)
- Acceptance criteria:
  - Cloud connection authenticates using the update_channel_key from the license file
  - Connection pulls: software updates and security patches, evaluation benchmarks and quality baselines, compliance template bundles (AI disclosure, DPIA, transfer maps), role template improvements (prompt strategies, retrieval profiles), security advisories
  - Update channel requires a valid, non-expired license
  - Received content is stored locally and applied through the appropriate module (role registry for role updates, compliance store for templates, etc.)
  - Connection uses HTTPS with certificate pinning
  - Pull frequency is configurable with sensible defaults (e.g., daily check for updates, hourly for security advisories)
- Source: monetization-and-licensing-model.md sections 3.2 and 10.2

#### US-83: Aggregate Metadata Reporting
As the cloud connection module, I need to report aggregate metadata to NestFleet Cloud so that NestFleet can maintain fleet-wide quality benchmarks and license compliance without receiving any customer data.

- Priority: must
- Dependencies: US-82, US-81
- Acceptance criteria:
  - Metadata sent to NestFleet Cloud includes only: license ID, NestFleet version, aggregate usage counts (cases per month, AI actions per month, active products), error type codes (not error content), feature flags in use
  - Metadata explicitly excludes: case content, conversation text, user identities, repository content, PR diffs, code, product memory content, notification content, any PII
  - Reporting happens only when the cloud connection is active
  - Reporting frequency is configurable (default: daily)
  - Customer can inspect exactly what metadata is being sent (metadata payload is logged locally)
  - Reporting failure does not affect product operation
- Source: monetization-and-licensing-model.md section 3.2

#### US-84: Offline Resilience
As the system, I need to continue running without an active cloud connection so that customer operations are never interrupted by cloud connectivity issues or license expiry.

- Priority: must
- Dependencies: US-79, US-82
- Acceptance criteria:
  - Product continues full operation without cloud connection; there is no kill switch
  - An expired license means the product keeps running but stops receiving updates, evaluation benchmarks, compliance templates, and security patches
  - Locally cached updates, benchmarks, compliance templates, and role templates remain available indefinitely
  - Offline state is surfaced in the operator console as an informational banner
  - Reconnection is automatic when cloud connectivity is restored
  - No feature degradation during temporary network outages
- Source: monetization-and-licensing-model.md section 3.3

#### US-85: Trial Mode
As a prospective customer, I need a 30-day time-limited full-feature trial so that I can evaluate NestFleet completely before purchasing a subscription.

- Priority: must
- Dependencies: US-79, US-80
- Acceptance criteria:
  - Trial license is a standard license JWT with a 30-day expiry and a `trial: true` flag
  - Trial provides full feature access (not feature-limited)
  - Trial countdown is visible in the operator console
  - Warning notifications at 7 days and 1 day before expiry
  - After trial expiry, the application continues running in a degraded read-only mode: existing data is accessible, but new AI actions are not processed
  - Trial cannot be extended by reinstalling; trial is tied to a license ID
  - Upgrade path from trial to paid subscription is a license file swap, not a reinstallation
- Source: monetization-and-licensing-model.md sections 6.3 and 6.4

#### US-86: Unsupported Version Banner
As the operator console, I need to display an unsupported version banner when the installation has not received updates for 90 days so that operators are aware they are running stale software without security patches.

- Priority: should
- Dependencies: US-82, EPIC-11 (operator console)
- Acceptance criteria:
  - Banner appears in the operator console when the last successful update check was more than 90 days ago
  - Banner is informational, not blocking; the system continues to operate
  - Banner includes the date of the last successful update and a prompt to renew the subscription or restore cloud connectivity
  - Banner is dismissible but reappears on next login
- Source: monetization-and-licensing-model.md sections 3.3 and 5.3

**Out-of-scope clarifications:**
- License key management portal or self-service provisioning (license files are delivered manually or via a simple API in v1)
- Automatic software update application (updates are delivered via the cloud connection; the operator applies them manually in v1)
- Usage-based billing integration (usage is tracked locally and reported as metadata; billing is handled outside the product)
- Hosted SaaS tier (deferred until client-installed model proves revenue viability)

**Epic-level acceptance criteria:**
- A valid license file enables the full product at the correct tier
- An invalid or missing license prevents production startup with a clear error
- Feature gates correctly restrict tier-gated features
- Usage tracking counts AI actions and warns before limits are reached
- Cloud connection delivers updates and receives only aggregate metadata, zero customer data
- Product operates normally without cloud connectivity
- 30-day trial works end-to-end: full features, countdown, expiry, upgrade path
- Unsupported version banner appears after 90 days without updates

**Dependencies:** None (enabler epic; EPIC-04 depends on feature gates, EPIC-09 depends on license tier for role template access, EPIC-11 depends on this for trial banner and unsupported version banner)

---

### EPIC-14: Operator Console — Settings & Onboarding

**Objective:** Provide a self-service settings pane and first-run configuration wizard so that operators can configure LLM providers, lead assignments, notification policies, and product connections without requiring manual database seed scripts or environment variable editing.

**In-scope stories:**

- US-14-01: As an operator, I want to select my LLM provider (OpenAI / Anthropic / Gemini) and enter the corresponding API key from a settings page, so that NestFleet can use the customer's own model provider without env var editing.
- US-14-02: As an operator, I want to configure lead email assignments (Support Lead, Change Lead, Product Lead, Knowledge Lead) from a settings page, so that notification routing and approval routing work correctly.
- US-14-03: As an operator, I want to adjust agent response tone (formal / friendly / technical) from a settings page, so that outbound communications match the product's brand voice.
- US-14-04: As an operator, I want to configure quiet hours start/end and weekend suppression per product, so that notification scheduling respects local working patterns.
- US-14-05: As an operator, I want a first-run wizard that guides me through: account creation → LLM connection test → product creation → lead assignment → GitHub connection, so that NestFleet is operational within 10 minutes of installation.
- US-14-06: As an operator, I want a connection test step in the wizard that validates LLM API key and GitHub access before saving, so that I don't save broken configuration and then debug silently failing agents.

**Out of scope (deferred):**

- Response template editing UI (post-v1: templates are hardcoded in v1 agent prompts)
- Custom persona authoring UI (EPIC-09 scope — deferred per v1 decision)
- Product memory source management UI (manual ingestion scripts in v1)
- Multi-tenant settings isolation (single-product v1)

**Acceptance criteria:**

- All settings persist to `products` table (JSON `support_policy`, `lead_assignments`, `llm_config` columns)
- API key is stored encrypted at rest (never returned in plaintext via API after initial save)
- LLM connection test returns clear SUCCESS/FAIL before saving
- Wizard completes end-to-end in under 10 minutes
- Settings changes take effect on next agent run without server restart

**Dependencies:** EPIC-12 (Identity — auth required for settings access), EPIC-11 (Console — settings page lives in the console)

---

### EPIC-15: CI Verification & Post-Merge Feedback Loop

**Objective:** Extend the change request lifecycle beyond PR draft to track merge, CI build, and optionally deployment status via GitHub webhooks, so that NestFleet can confirm a change actually succeeded — or auto-detect failures and re-open the case.

**In-scope stories (v1.1):**

- US-15-01: As a Change Lead, I want the change request to automatically advance to `pr-merged` when the linked GitHub PR is merged, so that I can see merge status without checking GitHub.
- US-15-02: As a Change Lead, I want the change request to automatically advance to `ci-passed` when the CI check suite passes after merge, so that I have confidence the change didn't break anything.
- US-15-03: As a Change Lead, I want to be notified immediately when a CI check suite fails for a NestFleet-authored PR, so that I can intervene before the failure impacts customers.
- US-15-04: As a Change Lead, I want a failed CI to transition the change request to `ci-failed` and emit a high-priority notification, so that CI failures are tracked in the NestFleet audit trail alongside the case.
- US-15-05: As an operator, I want to configure per-product CI tracking settings (branch filter, auto-complete on green CI, require deploy verification), so that CI feedback behavior matches the product's deployment process.

**Deferred to v1.2:**

- US-15-06: `deployment_status` webhook tracking → CR advances to `deployed` or `deploy-failed`
- US-15-07: Deployment health-check verification before auto-closing CR
- US-15-08: Auto-case-creation on deploy failure (separate from the originating CR)

**Deferred to v2:**

- Full CI-as-channel: NestFleet watches pipeline health independently for all builds, not just for NestFleet-authored PRs.

**Acceptance criteria (v1.1):**

- `pull_request.merged` webhook transitions CR from `pr-drafted` → `pr-merged`
- `check_suite.completed (success)` transitions CR from `pr-merged` → `ci-passed`
- `check_suite.completed (failure)` transitions CR from `pr-merged` → `ci-failed`
- `ci-passed` + `auto_complete_on_ci_pass=true` → CR auto-completes and case resolves
- CI failures emit high-priority notification to Change Lead
- Audit events recorded for every CI-driven state transition
- Only PRs matching `branch_filter` (default: `main`) are tracked

**Dependencies:** EPIC-08 (Change Management — existing GitHub webhook infrastructure), EPIC-06 (Notification — CI failure alerts)

---

## 6. Cross-Epic Dependencies

```
EPIC-12 (Identity)
  |
  +--> EPIC-01 (Intake) --> EPIC-02 (Case Management)
  |                              |
  |                              +--> EPIC-07 (Grounded Resolution)
  |                              |
  |                              +--> EPIC-08 (Change & GitHub)
  |
  +--> EPIC-03 (Product Memory)
  |       |
  |       +--> EPIC-07 (evidence packs)
  |       +--> EPIC-08 (implementation context)
  |
  +--> EPIC-04 (Validation & Policy)
  |       |
  |       +--> EPIC-07 (reply validation)
  |       +--> EPIC-08 (change/PR validation)
  |       +--> EPIC-05 (triggers approvals)
  |
  +--> EPIC-05 (Approval & Routing)
  |       |
  |       +--> EPIC-07 (draft review)
  |       +--> EPIC-08 (change approval)
  |
  +--> EPIC-06 (Notifications) --- cross-cutting, consumed by all operational epics
  |
  +--> EPIC-09 (Role Templates) --> EPIC-02 (flow routing), EPIC-05 (lead mapping)
  |
  +--> EPIC-10 (Audit) --- cross-cutting, consumed by all epics
  |
  +--> EPIC-11 (Console) --- presentation layer for all operational epics
  |
  +--> EPIC-13 (License & Cloud Connection)
          |
          +--> EPIC-04 (feature gates for policy engine)
          +--> EPIC-09 (license tier for role template access)
          +--> EPIC-11 (trial banner, unsupported version banner)
```

**Critical path for delivery:**

1. EPIC-12 (Identity) + EPIC-13 (License & Cloud Connection) -- enablers, must start first or in parallel
2. EPIC-01 (Intake) + EPIC-10 (Audit) + EPIC-09 (Role Templates) -- can start in parallel
3. EPIC-02 (Case Management) + EPIC-04 (Validation) -- depend on intake, identity, and feature gates from EPIC-13
4. EPIC-03 (Product Memory) -- can start independently, needed before EPIC-07
5. EPIC-06 (Notifications) -- needed by EPIC-02 for escalation but basic version can be phased
6. EPIC-05 (Approval) -- depends on identity, validation, and notifications
7. EPIC-07 (Grounded Resolution) -- depends on memory, validation, approval, and notifications
8. EPIC-08 (Change & GitHub) -- depends on case management, validation, approval, and notifications
9. EPIC-11 (Console) -- built incrementally; basic queue view needed early, other views phased

## 7. Deferred Work

The following items are explicitly deferred from v1. They are tracked here so they are not lost and so that v1 architecture does not prevent their later addition.

### DEFERRED-01: Telegram Channel
- Deferred from v1 to fast-follow
- Reason: legal risk concentration (legal-compliance-eu-germany.md section 6.4), compliance overhead, and focus on proving the core with email first
- Architecture impact: channel adapter boundary (ADR-005) must support adding Telegram without architectural change

### DEFERRED-02: Multi-Product Concurrent Operation
- Deferred from v1
- Reason: v1 proves the model with one product (DocuGardener) per mvp-scope.md
- Architecture impact: product_id isolation must be present in v1 data model to enable later

### DEFERRED-03: Governed Role Improvement
- Deferred per ADR-014
- Includes: Role Profile Version aggregate, Role Improvement Candidate aggregate, evaluation pipelines, shadow testing, reviewed promotion
- Reason: requires stable operational baseline before improvement loops are meaningful
- Architecture impact: role templates must be versioned data, not hard-coded prompts

### DEFERRED-04: Deployment Execution and Post-Release Verification
- Deferred from v1
- v1 ends at approved PR draft
- Reason: merge/deploy is T5 forbidden in v1 (autonomy-and-approval-policy.md section 11)
- Architecture impact: change request state machine includes `completed` as v1 terminal; later states for deployment can be added

### DEFERRED-05: AI Chat Channel
- Deferred from v1 to v2.0
- Reason: not in v1 channel scope; introduces additional compliance and UX complexity
- Architecture impact: conversation model supports channel-agnostic threading; channel adapter boundary (ADR-005) supports adding without structural change
- Target: v2.0 "in-product support" bundle alongside Contact Forms (DEFERRED-13)

### DEFERRED-06: Advanced Incident Management
- Deferred from v1
- Reason: v1 handles outage reports via the standard case lifecycle with priority escalation; dedicated incident command features are out of scope
- Architecture impact: severity model and escalation chains provide foundation

### DEFERRED-07: Zanzibar-Class Fine-Grained Authorization
- Deferred per ADR-010
- Reason: app-level RBAC sufficient for single-product v1
- Architecture impact: authorization logic is modular behind a clean interface

### DEFERRED-08: Deployment Automation Tooling
- Deferred from v1
- Reason: client-installed is the default v1 runtime per monetization-and-licensing-model.md; initial deployment is manual or script-assisted, not fully automated
- Architecture impact: no vendor lock-in in infrastructure choices; deployment automation (Helm charts, Terraform modules) is a post-v1 investment

### DEFERRED-09: Optional Hosted SaaS Tier
- Deferred until client-installed model proves revenue viability
- Reason: client-installed is the default deployment model per monetization-and-licensing-model.md; a hosted SaaS tier would require full processor DPA, SOC 2, BSI C5, and infrastructure investment that is not justified until market demand is proven
- Architecture impact: product_id isolation and tenant isolation (US-78) provide the foundation; hosted tier would add NestFleet-managed infrastructure, full data-processing agreements, and higher pricing

### DEFERRED-10: Dashboard and Analytics Views ✅ DELIVERED (2026-03-22)
- ~~Deferred from v1 console~~
- **Analytics dashboard** delivered as SLICE-20 (2026-03-19): 5 tabs (Overview, Cost & Tokens, Agent Performance, Cases, Memory Health), RBAC-gated, 16 integration tests.
- **Operator home Dashboard** delivered as WAVE-4 (2026-03-22): KPI summary cards (open cases, pending approvals, ready PR drafts, unread notifications) + 15-event recent activity feed. SWR 30 s refresh. `GET /api/v1/products/:productId/dashboard`.
- **Performance**: `audit_events_product_time_idx` composite index `(product_id, occurred_at DESC)` added in migration `0035` to cover both dashboard activity feed and analytics time-ordered scans. OLTP/OLAP split not warranted at current scale — read replica is the next threshold, not a separate pipeline.

### Console WAVE-5: Product Memory Ingestion UI ✅ DELIVERED + TESTED (2026-03-22 / tested 2026-03-23)

Closes US-72. Delivers the full operator-facing memory management surface as a second tab on the Knowledge page.

**Manual test sign-off (2026-03-23):** 2 real production documents ingested (SAD package). Health score updated to 94%. Upload, source list, health panel dimensions + capability gates, Search Probe returning results — all verified working end-to-end against live API.

**What shipped:**
- `POST /api/v1/products/:productId/memory/ingest` — ingest any markdown source type (admin/knowledge_lead). Runs full pipeline: chunk → tier assign → freshness score → embed → upsert with dedup (`content_hash`). Returns `{ chunksIngested, chunksSkipped, totalTokens, sourceUri, tier }`.
- **Memory Sources tab** — source list (tier badge, freshness bar, conflict indicator, delete for admin), Documentation Health panel (8 dimension badges + 5 capability gate pills with Enabled/Degraded/Disabled status), Search Probe (test what the AI retrieves for any query before it runs on real cases).
- **Upload slide-over** — T1/T2 grouped source type picker, URI, last-updated date (drives freshness score), audience, product version, markdown content textarea.
- **Contextual help panel** (collapsible) — 6 cards explaining AI memory mechanics with concrete ops-impact examples: stale pricing in FAQ, missing known issues blocking recognition, conflict-driven abstain, post-release re-ingest workflow. T1 card highlighted.
- **20 integration tests** T-W5-01–T-W5-20: happy path, tier assignment, dedup (same/changed content), DB persistence, audience/version fields, totalTokens, source list + stats reflection, DELETE interaction, 401/403 auth gates, 400 validations, freshness score correctness.

**Role access**: view (operator, knowledge_lead, admin) · upload (knowledge_lead, admin) · delete (admin only).

**Files**: `src/api/v1/product-memory.ts`, `console/src/app/knowledge/page.tsx`, `console/src/lib/api.ts`, `tests/integration/memory-ingest-api.test.ts`. Full detail in delivery archive Section 17.

### DEFERRED-11: Secondary LLM-Based Validator
- Deferred from v1
- Reason: v1 uses schema + rule-based validation; LLM-based secondary validation adds complexity and latency
- Architecture impact: validator_type field on Validation Record supports adding LLM validators later

### DEFERRED-12: Slack Notification Delivery
- Deferred from v1 to v2.0
- Reason: v1 operators receive all alerts via email; Slack delivery is high-value but not blocking for the pilot
- Scope: outbound operator notification channel — case alerts, approval requests, escalations delivered as Slack messages in addition to or instead of email; operator configures Slack webhook or bot token per product
- Architecture impact: notification delivery is pluggable per US-37; adding a Slack delivery adapter requires no structural change — delivery channel is a field on the Notification record
- Target: v2.0 "in-product support" bundle; quick win — estimated low build effort via Slack Incoming Webhooks API

### DEFERRED-13: Contact Forms (Structured Inbound Intake)
- Deferred from v1 to v2.0
- Reason: v1 inbound channel is email only; forms introduce a JS snippet distribution and hosting concern that is out of scope for the pilot
- Scope: embeddable JS snippet that renders a structured form inside the customer's product; form fields map directly to Signal attributes (case type, severity, product version, steps to reproduce, affected feature); form submission POSTs to NestFleet ingress, creating a pre-structured Signal that bypasses most AI extraction work
- Architecture impact: inbound ingress pipeline is channel-agnostic from Signal creation onward; Contact Form is another channel adapter (ADR-005); structured fields reduce triage agent workload compared to freeform email
- Target: v2.0 alongside Chat (DEFERRED-05); forms + chat form the "in-product support" bundle that competes with Crisp/Plain for developer-tool ICP

### DEFERRED-14: Linear Integration (Bidirectional Signal Source + Change Sync)
- Deferred from v1 to v2.1
- Reason: v1 uses GitHub Issues as the sole change management backbone; Linear is not in the pilot product's stack
- Scope (bidirectional):
  - **Inbound**: Linear webhook events (issue created, issue updated, issue commented) ingested as Signals; Linear issues are a first-class source of operational intelligence alongside email and GitHub — a bug filed in Linear is as valid a case trigger as a user email
  - **Outbound**: NestFleet-authored change requests sync back to Linear as Issues; operators can approve a change in NestFleet and have the corresponding Linear issue created or updated automatically
  - Product memory: Linear issues and comments indexed as T3 source tier evidence (known issues, feature requests, historical context)
- Architecture impact: Linear adapter follows the same connector boundary as GitHub (ADR-008); `source_type = "linear"` on Signal and ChangeRequest aggregates; no structural schema change needed
- Target: v2.1; Linear is the primary issue tracker for startup/scale-up engineering teams (NestFleet's core ICP); should be prioritised ahead of Jira for this segment

### DEFERRED-15: Discord Inbound Channel
- Deferred from v1 to v2.1
- Reason: not in v1 channel scope; Discord bot/Gateway API introduces additional operational dependency
- Scope: ingest messages from Discord forum channels as Signals; forum posts where users report bugs, ask questions, or flag outages are treated identically to email signals through the same triage and case pipeline; Discord DMs to the support bot are optionally supported as a private conversation channel
- Architecture impact: Discord adapter behind ADR-005 channel adapter boundary; `source_type = "discord"` on Signal; no structural change
- Differentiation: no other product-ops tool natively ingests Discord signals; strong fit for developer-tool ICP (Vercel, Cursor, Raycast, Laravel-style companies run active Discord communities)
- Compliance: lower EU data-residency risk than Telegram; Discord's API is stable and well-documented
- Target: v2.1 "community and API" bundle alongside Headless Portal and Linear

### DEFERRED-16: Jira Integration (Bidirectional Signal Source + Change Sync)
- Deferred from v1 to v2.1
- Reason: pilot product (DocuGardener) uses GitHub Issues, not Jira; adding Jira before the connector pattern is validated with Linear adds risk
- Scope (bidirectional, mirrors DEFERRED-14 Linear):
  - **Inbound**: Jira webhook events (issue created, commented, transitioned) ingested as Signals; Jira Service Management tickets treated as first-class signal sources
  - **Outbound**: NestFleet change requests sync back as Jira issues; status transitions in NestFleet propagate to Jira
  - Product memory: Jira issues indexed as T3 evidence (known issues, historical bug patterns)
- Architecture impact: same connector boundary as Linear (DEFERRED-14); `source_type = "jira"` on Signal; connector logic is parallel to Linear adapter
- Note: sequence Linear first (stronger ICP fit for startups); validate the bidirectional connector pattern there before investing in the broader Jira surface area
- Target: v2.1, after Linear connector is proven

### DEFERRED-17: Headless Portal / Public API
- Deferred from v1 to v2.1
- Reason: public API requires SEC-01 (product-scoped authorization) to be fixed first; API documentation and SDK investment is not justified before the core is stable
- Scope: expose NestFleet's case, conversation, and signal APIs as a documented public API so customers can build their own support portal UI in their own product; includes OpenAPI spec, TypeScript client SDK, and webhook event subscriptions for real-time updates
- Architecture impact: minimal — NestFleet already has a REST API; this is API maturity (OpenAPI spec, versioning, auth tokens for external callers) not new functionality; prerequisite is SEC-01 fix (product-scoped access control) and SEC-07 (security headers)
- Value: unlocks white-label and enterprise use cases; customers who want a fully branded support experience can build on NestFleet's API without being constrained by the operator console UI
- Target: v2.1; emerges naturally from API hardening post-v1

### DEFERRED-18: MS Teams Notification Delivery
- Deferred indefinitely (revisit on enterprise ICP demand signal)
- Reason: NestFleet's current ICP (solo founders, lean product teams) predominantly uses Slack, not MS Teams; Teams integration investment is not justified until NestFleet moves upmarket to enterprise customers on Microsoft 365 stacks
- Scope if activated: outbound notification delivery to Teams channels via Incoming Webhooks or Bot Framework; same delivery adapter pattern as Slack (DEFERRED-12)
- Architecture impact: notification delivery adapter; no structural change
- Trigger: first enterprise pilot customer on Teams stack requests it

### DEFERRED-22: Batch Memory Source Upload (Folder Ingestion)
- Deferred from WAVE-5 console delivery
- Reason: WAVE-5 delivers single-document manual upload (paste markdown → ingest). Folder ingestion requires file-picker UI, path-based source type inference, per-file progress stream, and error collection — a meaningful scope increment not justified before single-document flow is validated with operators.
- Background: backend `ingestFromFilesystem()` already exists in `src/memory/ingestion/pipeline.ts` and handles recursive discovery, format detection, source type inference, and batch dedup. The missing piece is the console UI surface and a streaming progress endpoint.
- Scope:
  - **CLI path (quick win)**: expose `ingestFromFilesystem()` as a CLI command (`nestfleet memory ingest-folder --product <id> --path ./docs`) — no UI required, useful immediately for operators with terminal access
  - **Console path (full)**: folder picker or drag-and-drop, inferred source type table with overrides, per-file progress rows (SSE stream), final summary card
- Architecture impact: `POST /api/v1/products/:productId/memory/ingest-folder` accepting a server-side path (CLI/server mode) or `multipart/form-data` file upload (browser mode); SSE stream for progress; reuses `ingestFromFilesystem()` unchanged
- URI convention (interim): until batch upload ships, operators should use `docs://<folder>/<filename>.md` URIs consistently when uploading manually — this makes future dedup work correctly when batch upload is added
- Trigger: first operator onboarding a product with >5 documentation sources

## 8. Open Questions

### OQ-01: Email Provider Integration Model
Which email provider integration model should v1 use: IMAP polling, provider webhook (e.g., SendGrid, Postmark inbound), or direct SMTP with a custom receiver? This affects US-01 and the connector adapter boundary.

### OQ-02: Queue Implementation Choice
Should v1 use Redis-backed workers or PostgreSQL-backed jobs? ADR-005 defers this decision. The spike (technical-risks-and-spikes.md spike 2) should resolve it. Affects US-14.

### OQ-03: Product Memory Freshness Model
What is the concrete freshness window for product memory sources? How often should re-ingestion run for GitHub issues and PR metadata? Affects US-16 and US-72.

### OQ-04: Confidence Score Calibration
How are confidence scores for auto-reply (0.85) and auto-change-draft (0.75) calibrated during the pilot? Are they based on model logprobs, retrieval quality metrics, or a composite score? Affects US-42 and US-46.

### OQ-05: AI Disclosure Text
What is the exact AI disclosure text for user-facing emails? Must it be reviewed by counsel before launch? Affects US-62. Required by August 2, 2026 per AI Act; should be ready before production use.

### OQ-06: GitHub App vs. Personal Access Token
Should the GitHub integration use a GitHub App (recommended for production) or a personal access token (simpler for pilot)? Affects US-48, US-51, and US-53.

### OQ-07: Digest Content and Format
What specific information should appear in digest summaries, and what is the email format? Affects US-39. Requires operator feedback during pilot.

### OQ-08: Identity Merge Strategy
How should duplicate end-user identities be merged when the same person uses different email addresses? Manual merge in v1 (per US-77), but the exact UX and data propagation need design. Affects US-77 and US-61.

### OQ-09: Evaluation Dataset for Product Memory Spike
The product memory quality spike (technical-risks-and-spikes.md spike 1) requires 20-30 real support-like prompts for DocuGardener. Who creates these, and what is the pass criteria? Affects US-17 and US-19.

### OQ-10: Quiet Hours Configuration Scope
Are quiet hours configured globally, per product, or per lead? The notification model defaults to 20:00-08:00 local time + weekends, but "local time" requires knowing each lead's timezone. Affects US-33.
