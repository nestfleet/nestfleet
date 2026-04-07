# NestFleet Technical Risks and Spikes

## 1. Purpose

This document identifies the highest-risk technical assumptions in NestFleet and converts them into concrete feasibility spikes.

The goal is to answer the make-or-break questions before detailed feature specifications consume delivery time.

## 2. Risk Ranking Method

Each item is ranked by:

- product criticality
- likelihood of failure or rework
- blast radius if the assumption is wrong

## 3. Highest-Risk Areas

### 3.1 Product Memory Quality

**Specification:** `docs/product-memory-specification.md` (full governing spec — ADR-018, ADR-019, ADR-020, ADR-021)

**Updated 2026-03-17** — scope expanded beyond basic retrieval quality to cover source tier model, structure-aware chunking, freshness scoring, conflict detection, documentation health assessment, and capability gating. These are not enhancements — they are required for the system to be safe across any product, not just DocuGardener.

Risk:

- product-scoped retrieval may not be good enough to support safe auto-response, triage, and PR-preparation grounding across products with varying documentation quality
- source tier model may not reliably distinguish T1 from T3 sources under retrieval pressure
- structure-aware chunking may produce worse results than naive chunking for certain source types
- freshness scoring may not decay correctly or may overly suppress useful stale content
- conflict detection may produce too many false positives (flagging non-conflicting paraphrases) or miss real contradictions
- documentation health thresholds may be too strict or too permissive to be useful

Why it matters:

- weak or untrusted retrieval breaks Frontline (auto-reply), Steward (triage and known-issue matching), and Change (implementation context) simultaneously
- a system that produces confident answers from poor documentation is worse than a system that routes to humans
- the source tier model and capability gates are the primary mechanism preventing hallucination-grounded actions

Spike:

Core retrieval:
- stand up PostgreSQL with pgvector and FTS
- ingest DocuGardener sources using the structure-aware chunking pipeline (prose, code, structured chunks per ADR-019)
- apply full chunk metadata schema (tier, freshness, audience, version, content_type, language, section_path)
- implement hybrid retrieval: vector similarity + FTS + metadata filter + tier-weighted reranking + freshness multiplier
- build 30+ evaluation prompts covering: user requests (T1 grounded), bug lookups (T3 grounded), known-issue queries, implementation context queries (T2 grounded), version-sensitive queries, and queries with no relevant documentation

Source tier model validation:
- verify T1 sources dominate over T3/T4 in retrieval results for the same query
- verify policy gate blocks auto-reply when evidence pack contains only T3/T4 sources
- verify abstain fires correctly for `insufficient_tier`, `stale_evidence`, and `knowledge_conflict` conditions

Freshness and conflict:
- inject deliberately stale chunks and verify they are excluded from auto-reply evidence packs
- inject two contradictory T1 chunks and verify conflict detection flags both and triggers abstain

Documentation health:
- run health assessment against DocuGardener (expected: mostly GOOD)
- run health assessment against a deliberately sparse corpus (README only) and verify correct FAIL states and capability disablement
- verify capability gates match health report state

Success criteria:

- T1 and T2 sources dominate retrieval results in ≥ 80% of queries when they exist
- Policy gate correctly blocks auto-reply when evidence pack has no T1 source (zero false-allows in test set)
- Abstain fires for stale evidence, conflict, and insufficient tier — confirmed on synthetic test cases
- Conflict detection flags contradictory T1 pairs with < 20% false-positive rate on a 20-pair test set
- Freshness decay correctly excludes chunks beyond the staleness window
- Documentation health report distinguishes DocuGardener (rich) from sparse corpus on all dimensions
- Capability gates are consistent with health report state on both corpora
- Hallucination pressure drops materially when evidence packs are provided vs. raw prompting

Failure implications:

- if T1/T3 tier separation is insufficient → reconsider tier assignment at ingestion, add explicit source-type boosting
- if conflict detection false-positive rate > 20% → simplify to structural contradiction detection only, defer semantic conflict to post-v1
- if freshness decay is too aggressive → widen staleness window per tier and re-evaluate
- if pgvector quality is insufficient for structure-aware chunks → evaluate Weaviate (DocuGardener already uses it)

### 3.2 Queue Plus State-Machine Orchestration

Risk:

- the chosen orchestration model may become complex too quickly under wait states, quiet hours, retries, and approvals

Why it matters:

- this is the control backbone of the product

Spike:

- implement one end-to-end flow prototype:
  `email signal -> case -> clarification -> awaiting-lead -> approval -> GitHub issue sync`

Success criteria:

- workflow survives restarts
- wait states resume correctly
- audit and notification events stay correlated

### 3.3 Notification Noise and Escalation Logic

Risk:

- the notification model may be either too noisy to trust or too weak to protect critical cases

Why it matters:

- operators will abandon the system quickly if notification quality is poor

Spike:

- simulate a week of mixed case traffic
- run the v1 priority, quiet-hours, reminder, and escalation rules against it

Success criteria:

- critical events break through reliably
- normal and low traffic compress into manageable operator load
- duplicate suppression works

### 3.4 GitHub Change Path

Risk:

- repository context, permissions, and artifact generation may be too brittle for a reliable PR-draft flow

Why it matters:

- the change path is the edge that makes NestFleet different from a support-only system

Spike:

- implement a repo-scoped proof of concept for:
  `bug case -> change request -> approval -> branch/PR draft package`

Success criteria:

- issue and PR linkage is stable
- repo policy checks work
- generated output is reviewable and traceable

### 3.5 Configurable Role Composition

Risk:

- role configuration may either be too rigid to matter or too open-ended to remain governable

Why it matters:

- this is central to the product story

Spike:

- model three shipped role templates and two per-product team configurations
- test enabling and disabling roles without breaking flows

Success criteria:

- flows adjust cleanly to active roles
- policies and notifications follow role configuration
- no custom role-authoring system is needed for the pilot

### 3.6 Deterministic Validation Envelope

Risk:

- schema validation, evidence checks, and secondary validation may not be enough to make automation dependable in practice

Why it matters:

- this is the trust boundary of the system

Spike:

- run low-risk user-request reply generation through:
  proposer -> validator -> allow or abstain

Success criteria:

- unsupported claims are caught frequently enough to be useful
- abstain behavior is not so high that the feature becomes pointless

### 3.7 Identity and Approval Model

Risk:

- approvals, lead routing, and auditability may become awkward if identity and RBAC are not integrated early enough

Why it matters:

- NestFleet is a governed operations product, not a casual bot

Spike:

- prototype login, lead-role mapping, approval request, approval action, and audit event generation

Success criteria:

- one user can hold multiple lead roles
- approval history is queryable and unambiguous

### 3.8 License and Cloud-Connection Channel

Risk:

- the license module and cloud-connection update channel may introduce operational friction, latency, or customer-facing complexity that undermines the client-installed experience

Why it matters:

- this is the revenue backbone and the continuous-value-delivery mechanism
- if the update channel is fragile, unreliable, or intrusive, customers will resent it
- if the license module creates startup delays or false rejections, it erodes trust

Spike:

- implement a minimal license validator (JWT signature check at startup)
- implement a minimal cloud-connection client that pulls a mock update manifest
- test startup behavior with valid, expired, and missing license files
- test offline resilience (product runs without cloud connection)
- test feature gating for one tier-gated feature

Success criteria:

- startup with valid license is instant (no perceptible delay)
- startup with expired license succeeds with degraded mode (no updates, banner shown)
- startup with missing license fails clearly with actionable error
- cloud-connection failure does not block product operation
- feature gate correctly enables or disables a tier-gated capability

## 4. Recommended Spike Order

1. product memory quality
2. queue plus state-machine orchestration
3. deterministic validation envelope
4. GitHub change path
5. notification noise and escalation logic
6. configurable role composition
7. identity and approval model
8. license and cloud-connection channel

## 5. Recommended Timebox

- spike 1: `3 to 5 days`
- spike 2: `3 to 5 days`
- spike 3: `2 to 4 days`
- spike 4: `2 to 4 days`
- spike 5: `1 to 2 days`
- spike 6: `1 to 2 days`
- spike 7: `1 to 2 days`
- spike 8: `1 to 2 days`

These do not need polished UI. They need decisive answers.

## 6. Exit Criteria Before Feature-by-Feature Specification

Do not go deep into detailed slice-level specs until:

- product memory is good enough for grounded answers
- orchestration handles waits and approvals cleanly
- low-risk automation can pass validation often enough to be useful
- GitHub draft flow is technically viable
- notification rules do not create obvious operator overload

## 7. Immediate Deliverables from the Spike Phase

- one prototype repo or workspace for feasibility code
- one evaluation dataset for product memory and low-risk responses
- one end-to-end traced flow demo
- one findings document with architecture adjustments
