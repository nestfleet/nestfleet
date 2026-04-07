# NestFleet Architecture Decisions

## 1. Purpose

This document records the first architecture decisions that determine whether NestFleet is feasible as a product. These are not exhaustive implementation details. They are the minimum set of decisions needed to de-risk the concept before feature-level specification.

## 2. Decision Standard

Each decision in this document should answer:

- what is being chosen
- why it is being chosen now
- what is explicitly rejected for now
- what risks remain

## 3. ADR-001: Build NestFleet as a Product Control Plane, Not a Generic Agent Shell

### Decision

NestFleet will be built as a product-operations control plane with its own domain model, lifecycle engine, approval model, notification control plane, and product memory layer.

Generic multi-agent runtimes may be used as implementation substrates or prototyping aids, but NestFleet will not depend on one of them as its product definition.

### Rationale

This is the main product boundary. Without it, NestFleet collapses into "configured agents plus integrations" and loses defensibility against generic tools.

### Reject for Now

- shipping NestFleet as a thin wrapper around OpenClaw-class tooling
- making the runtime substrate the product story

### Consequence

The control plane, domain objects, and policy layer must remain first-class code owned by NestFleet.

## 4. ADR-002: Use a Modular Monolith First

### Decision

Implement v1 as a modular monolith with strong internal boundaries rather than splitting into many deployable services immediately.

### Rationale

For the current stage, the dominant risks are product and workflow correctness, not distributed systems scale.

A modular monolith is:

- faster to ship
- easier to audit
- easier to self-host
- easier to reason about while the domain is still moving

### Reject for Now

- early service sprawl
- premature platform decomposition

### Consequence

Service boundaries still need to exist in code, but they do not need separate deployments yet.

## 5. ADR-003: PostgreSQL Is the Source of Truth

### Decision

Use `PostgreSQL` as the primary system of record for domain entities, workflow state, approvals, notifications, validation records, and audit references.

### Rationale

PostgreSQL is mature, self-hostable, portable, and operationally efficient for a product that needs strong consistency around business records and state transitions.

### Reject for Now

- splitting truth across a workflow engine database and separate business database
- using a document store as the primary domain store

### Consequence

The platform state machine should be expressed in application logic backed by relational records.

## 6. ADR-004: Queue Plus State-Machine Orchestration

### Decision

Use a queue plus explicit state-machine orchestration model.

- business truth and lifecycle state live in PostgreSQL
- workers execute bounded tasks
- queues trigger work; they do not own truth

### Rationale

NestFleet needs resumability, approvals, retries, quiet-hours behavior, and durable wait states. That fits explicit state machines much better than chat-session-centric agent loops.

### Reject for Now

- opaque autonomous agent loops as the runtime backbone
- workflow products that become the hidden source of truth

### Consequence

The flow engine must treat agents as task executors, not as state owners.

## 7. ADR-005: Start with OSS Queue Infrastructure, Keep the Adapter Boundary

### Decision

Use OSS worker-queue infrastructure for task dispatch, with a clean adapter boundary so it can be swapped later.

Recommended v1 direction:

- PostgreSQL remains the durable workflow store
- worker dispatch may use Redis-backed jobs if operationally justified
- for simpler installations, PostgreSQL-backed jobs remain an acceptable fallback

### Rationale

NestFleet needs asynchronous fan-out, retries, and scheduled work, but it does not yet need an enterprise workflow platform.

### Reject for Now

- coupling the full product to a proprietary workflow runtime
- inventing a custom scheduler before the first live pilot

### Consequence

Queue choice is an implementation detail behind the orchestration contract, not a domain decision.

## 8. ADR-006: Product Memory Uses PostgreSQL Full-Text Search Plus pgvector in v1

### Decision

Implement product memory in v1 using:

- `PostgreSQL` full-text search
- `pgvector` for vector similarity
- task-specific reranking in application logic

### Rationale

This supports hybrid retrieval without introducing a separate search or vector platform too early. It also aligns with the self-hostable and OSS-first requirements.

### Reject for Now

- starting with a separate dedicated vector database by default
- naive vector-only retrieval

### Consequence

Retrieval quality must come from source tiering, metadata filtering, hybrid search, and reranking, not from embeddings alone.

## 9. ADR-007: Product Memory Is Evidence Infrastructure, Not Generic Chat Memory

### Decision

Every role should consume product-scoped memory packs assembled from approved sources with source ids, freshness, and trust metadata.

### Rationale

This keeps NestFleet compatible with deterministic validation and explainability requirements.

### Reject for Now

- unconstrained long-context dumping into the model
- broad uncontrolled ingestion

### Consequence

The product memory pipeline is a core subsystem, not an optional enhancement.

## 10. ADR-008: GitHub Integration Uses Webhooks Plus Official APIs

### Decision

Use GitHub webhooks for event ingestion and GitHub's official REST APIs for issue and pull-request linked operations in v1.

### Rationale

GitHub is the mandatory change-management backbone in v1. Webhooks provide timely state changes; the API provides deterministic record creation and updates.

### Reject for Now

- polling GitHub as the primary synchronization model
- treating GitHub as the only source of truth

### Consequence

NestFleet mirrors GitHub state into its own domain model instead of outsourcing its business logic to GitHub.

## 11. ADR-009: Identity Must Be OIDC-Compatible and Self-Hostable

### Decision

NestFleet should require an OIDC-compatible identity boundary from the start.

Recommended direction:

- hosted deployments may use a managed identity layer
- self-hosted deployments should have a documented self-hostable reference path
- `Keycloak` is a strong reference option for self-hosted OIDC-compatible deployments

### Rationale

Identity and RBAC are not later-phase concerns in a product with approvals, lead routing, and auditability.

### Reject for Now

- custom username-password auth as the long-term model
- hard-coding identity behavior into the app without a standards-based boundary

### Consequence

The app should model lead roles and permissions internally, while authentication should sit behind an OIDC-compatible boundary.

## 12. ADR-010: Fine-Grained Authorization Stays Policy-Driven; Zanzibar-Class Authorization Is Deferred

### Decision

Use application-level RBAC and policy evaluation in v1. Keep the code structured so that a relationship-based authorization service can be introduced later if needed.

`OpenFGA` is a credible later option if multi-tenant authorization complexity grows.

### Rationale

The product already has a substantial policy layer. Introducing a separate fine-grained authorization platform too early would add conceptual and operational cost before the access model is proven.

### Reject for Now

- over-engineering authorization for a single-product-first MVP

### Consequence

Authorization logic must stay modular so a later migration remains possible.

## 13. ADR-011: Observability Uses OpenTelemetry

### Decision

Use `OpenTelemetry` as the observability instrumentation standard from the start.

### Rationale

NestFleet needs traceability across connectors, workflow steps, model calls, notification delivery, approvals, and GitHub interactions. OpenTelemetry is open and vendor-neutral, which fits the OSS-first and portability goals.

### Reject for Now

- vendor-specific instrumentation baked directly into app logic

### Consequence

Metrics, traces, and logs should be correlated across every end-to-end flow.

## 14. ADR-012: Object Storage Uses an S3-Compatible Interface, Provider Deferred

### Decision

Use an S3-compatible object-storage abstraction for artifacts and imported content, but defer the concrete default provider selection.

### Rationale

NestFleet needs artifact storage, but choosing a concrete OSS storage server too early creates avoidable licensing and operational debate. The interface matters more than the provider at this stage.

### Reject for Now

- tying the product to one object-store implementation

### Consequence

The storage adapter should support hosted and self-hosted providers without changing domain logic.

## 15. ADR-013: Configurable Team Composition Is a Core Runtime Concern

### Decision

The runtime must support:

- shipped role templates
- product-scoped active team members
- per-role tool scope
- per-role retrieval scope
- per-role notification policy
- per-role lead routing

### Rationale

This is central to the product idea: NestFleet should feel like a configurable virtual team, not a fixed agent trio.

### Reject for Now

- arbitrary user-authored role DSL
- arbitrary visual flow builder

### Consequence

Configuration should be powerful but opinionated.

## 16. ADR-014: Governed Role Improvement Is Later, Not Live in MVP

### Decision

Advanced roles such as a later `L3 Developer` may improve through versioned role-profile promotion, but live self-modification in production is forbidden.

Allowed loop:

1. collect outcome data
2. evaluate candidate improvements
3. test offline or in shadow mode
4. promote reviewed versions

### Rationale

This preserves the deterministic control model while still allowing meaningful adaptation over time.

### Reject for Now

- unrestricted self-rewriting agents
- self-expanding permissions
- unreviewed behavior promotion

### Consequence

Role evolution becomes a managed product feature, not emergent runtime behavior.

## 17. ADR-015: Client-Installed First, Cloud-Connected for Value Delivery

### Decision

The primary runtime shape is client-installed on customer infrastructure. All customer data stays on the customer's systems. NestFleet Cloud provides a thin update and value-delivery channel that transmits zero customer data.

An optional hosted SaaS tier may be offered later as a premium option requiring full processor DPA and appropriate certifications.

### Rationale

Customers building products on GitHub are often unwilling to send sensitive artifacts (code, cases, conversations) to a third-party SaaS. A client-installed model removes this trust barrier. It also shifts NestFleet from data-processor to software-vendor, which materially reduces the certification burden and DPA scope for launch.

The cloud connection ensures continuous revenue justification through value that cannot be cloned once: evaluation benchmarks, compliance template updates, role template improvements, and security patches.

### Reject for Now

- hosted SaaS as the default deployment path (deferred to later premium tier)
- desktop-first or offline-only architecture (cloud connection is expected)
- free self-hosted production tier (every production installation requires a subscription)

### Consequence

The product must include a license module and a cloud-connection subsystem. Feature gating must be clean and centralized. The deployment story must work on a single customer VPS or container host.

## 18. ADR-016: Business Source License for IP Protection

### Decision

NestFleet source code is published under a Business Source License (BSL). Source is visible for trust, audit, and security review. Commercial production use requires an active subscription.

### Rationale

In the age of AI-assisted development, any feature that can be described as a spec can be reimplemented cheaply. Traditional open-core feature gating (free core, paid premium features) is weakened because a competent team with AI coding tools can clone premium features in days.

BSL provides legal protection against commercial free-riding and competitive hosting while maintaining the transparency that builds customer trust.

### Reject for Now

- fully proprietary closed source (destroys the trust advantage for security-conscious customers)
- MIT or Apache permissive license (enables unrestricted commercial use without payment)
- traditional open-core with a powerful free tier (enables the clone attack)

### Consequence

The license file, feature gates, and update channel must be designed into the architecture from the start. The 30-day free trial is the evaluation path, not a permanent free tier.

## 19. ADR-017: Customer-Provided LLM, NestFleet Does Not Proxy Model Calls

### Decision

The customer configures their own LLM provider (OpenAI, Anthropic, or self-hosted Ollama). NestFleet agent workers call the customer's configured model endpoint directly. NestFleet does not proxy, intercept, or store model call content.

### Rationale

This keeps customer data (prompts, case content, code context) entirely within the customer's own data-flow boundary. The customer's DPA with their model provider governs those calls. NestFleet never touches the sensitive content in transit.

### Reject for Now

- NestFleet-hosted model routing (creates a data-processing relationship for sensitive content)
- mandatory model vendor (reduces customer choice and creates vendor lock-in)

### Consequence

Agent workers must accept a configurable model endpoint. The product memory pipeline, retrieval service, and all prompt construction happen locally on the customer's installation.

## 20. ADR-018: Product Memory Source Tier Model Governs Both Retrieval Ranking and Policy Gating

### Decision

Product memory sources are classified into four tiers (T1–T4). Tier assignment is mandatory at ingestion time and is a permanent property of every stored chunk. Tiers govern two independent concerns:

1. **Retrieval ranking**: T1 chunks are promoted over T2, T2 over T3, T3 over T4 when relevance scores are otherwise equal.
2. **Policy gating**: each AI persona action type has a minimum tier requirement. If the evidence pack does not meet the minimum tier requirement, the action must abstain regardless of confidence score.

The authoritative tier-to-source-type mapping and the action-to-minimum-tier table are defined in `docs/product-memory-specification.md` sections 3.2 and 3.3.

### Rationale

A retrieval-only tier model (ranking only) is insufficient because a high-similarity T4 chunk (e.g., a raw open GitHub issue) could still dominate an evidence pack and produce a confident but wrong auto-reply. The tier model must act as a hard policy gate so that the validation envelope has a deterministic, auditable reason to block or allow each action, independent of similarity score.

### Reject for Now

- using similarity score alone as the quality signal
- allowing operators to override tier gates at runtime without an explicit policy change
- merging tier and confidence into a single composite signal

### Consequence

Every retrieval result must carry its tier as metadata. The policy engine checks tier composition of the evidence pack before passing it to the persona. Validation records must include the evidence pack's tier summary.

---

## 21. ADR-019: Structure-Aware Chunking — Content Type Determines Chunking Strategy and Retrieval Method

### Decision

Chunks are not produced by a uniform token-split operation. NestFleet's ingestion pipeline classifies every document fragment into one of three content types — `prose`, `code`, or `structured` — and applies a different chunking strategy and retrieval method to each.

- **Prose**: split on markdown heading boundaries, 512-token max, 50-token overlap, section path injected as context prefix. Retrieved via vector similarity.
- **Code**: each fenced code block is a single chunk, never split mid-block. Retrieved primarily via FTS (keyword match). Vector embedding computed but deprioritized for natural-language queries.
- **Structured** (OpenAPI, JSON Schema, YAML): converted to a natural-language summary at ingestion. Original stored in object storage. Retrieved via vector similarity on the NL summary.

The canonical chunking rules are defined in `docs/product-memory-specification.md` section 6.

### Rationale

Uniform token-split chunking destroys the semantic boundary between prose and code, makes code blocks unsearchable by keyword, and loses the section hierarchy that gives each chunk its meaning. Embedding a raw function signature against a natural-language user question produces misleading similarity scores.

### Reject for Now

- character-based splitting without structure awareness
- treating code blocks as prose for embedding purposes
- ignoring heading hierarchy in chunk context

### Consequence

The ingestion pipeline must parse markdown AST, detect fenced code blocks, detect structured data files, and route each fragment to the appropriate chunker. This adds ingestion complexity but is necessary for retrieval quality.

---

## 22. ADR-020: Documentation Health Assessment Is a First-Class Product Feature

### Decision

NestFleet computes a Documentation Health Report after every ingestion run for each product. The report is displayed in the operator console and determines which AI fleet capabilities are active for that product.

Capabilities gated by documentation health include: auto-reply, known-issue matching, change request preparation, PR draft preparation, and outage routing. If required documentation coverage is absent, the corresponding capability is explicitly disabled with an operator-visible reason and recommended action — not silently degraded.

The health dimensions, thresholds, capability gates, and report format are defined in `docs/product-memory-specification.md` sections 11 and 12.2.

### Rationale

Without a health gate, NestFleet will attempt to auto-reply, triage, and prepare changes using whatever documentation exists — including sparse, stale, or contradictory sources. This produces confident-but-wrong outputs that erode operator trust faster than routing to a human would.

Explicit capability gates make the system's reasoning visible and actionable: the operator knows exactly what documentation to add to unlock a capability, rather than observing degraded quality with no explanation.

### Reject for Now

- silently reducing confidence thresholds when documentation is poor
- allowing all capabilities to run regardless of documentation quality
- requiring a human to manually assess documentation quality before onboarding

### Consequence

The ingestion pipeline must compute and persist health dimensions after every run. The operator console must display current capability status per product. A new `DocumentationHealthReport` domain object is required.

---

## 23. ADR-021: Freshness and Product Version Are Mandatory Retrieval Signals

### Decision

Every chunk carries two mandatory temporal/version signals: `source_updated_at` (the last-modified timestamp of the source document) and `product_version` (the product version the chunk applies to, or `*` for version-agnostic content).

Freshness score is computed from `source_updated_at` using a tier-specific staleness window (T1: 90 days, T2: 180 days, T3: 365 days) and is multiplied into the final retrieval score as a soft signal. Chunks with `freshness < 0.3` are excluded from auto-reply evidence packs.

When the inbound signal carries a product version, chunks for other versions are deprioritized (score × 0.3). When version is unknown, a `version_unknown` flag is set on the case.

The decay formula, staleness windows, and version filtering rules are defined in `docs/product-memory-specification.md` section 7.

### Rationale

Without freshness scoring, outdated documentation silently competes with current documentation in retrieval results and may win on similarity score alone. A product that has gone through several releases with documentation lagging behind will produce confidently wrong answers unless staleness is a first-class retrieval signal.

Without version filtering, a user on v1.x may receive a confident answer that applies only to v2.x behavior.

### Reject for Now

- treating all documents as equally fresh regardless of age
- using ingestion timestamp as a proxy for source freshness (file can be ingested repeatedly without content change)
- version detection via LLM inference at query time (too slow and unreliable)

### Consequence

Every ingestion step must extract and store `source_updated_at` from source metadata (git commit timestamp for GitHub files, file mtime for filesystem sources). Every retrieval must compute and apply the freshness multiplier. The validation record must include `min_freshness` and `stale_evidence` flag from the evidence pack.

---

## 24. ADR-022: Agent Framework Selection — Vercel AI SDK

**Status:** Accepted
**Date:** 2026-03-17

### Context

Phase 2 requires calling LLMs with structured output across three providers (OpenAI-compatible, Anthropic, Ollama). Agents must produce Zod-validated structured output as a hard constraint. Provider switching must be a config-only change.

### Decision

Use `ai` (Vercel AI SDK v4+) with `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `ollama-ai-provider` adapters. Expose a provider factory function `getLlmProvider(config: Config): LanguageModelV1` in `src/agents/llm-provider.ts`.

### Rationale

- `generateObject(schema: ZodSchema)` integrates Zod output validation at the call boundary — non-negotiable requirement for structured agent output
- Normalized tool-call format across all three providers in a single API surface
- No UI framework dependency — works as a pure Node.js library
- Provider factory decouples runtime config from LLM call sites
- Zero vendor lock-in: one-line config change to switch providers

### Rejected

- **LangChain.js**: violates ADR-001 (makes the framework the product), large bundle, abstraction leaks, runtime-configurable agents vs. compile-time-safe tool sets
- **Custom direct-HTTP for chat**: viable but means implementing normalized tool calling, structured output parsing, retry logic, and provider-switching from scratch — undifferentiated infrastructure work
- **OpenAI SDK only**: Anthropic tool-call format diverges in ways that require a custom adapter layer, losing the benefit of direct SDK use

### Consequence

All agent invocations use `generateObject()` or `generateText()` from the Vercel AI SDK. No agent imports provider SDKs directly — all go through the factory. Adding a fourth provider means writing one factory branch, not modifying agent code.

---

## 25. ADR-023: Agent as Pure Function, Not Stateful Class

**Status:** Accepted
**Date:** 2026-03-17

### Context

Agents must be testable in isolation, restartable on worker crash, and free of shared mutable state between invocations. The system design treats agents as task executors, not state owners (ADR-004).

### Decision

Every agent is implemented as a pure async function:

```typescript
type AgentFn<TInput, TOutput> = (input: TInput) => Promise<AgentResult<TOutput>>
```

Agents carry no state between invocations. All state lives in PostgreSQL, owned by the control plane and workers.

### Rationale

- Pure functions are trivially unit-testable — inject input, assert output, no mocks for stateful object lifecycle
- Idempotent and restartable: a worker crash during agent execution can safely retry the same job
- No shared mutable state eliminates an entire class of concurrency bugs at high queue throughput
- `AgentResult<TOutput>` provides a uniform envelope: `output`, `usage`, `durationMs`, `modelId`, `traceId`

### Rejected

- **Stateful agent class with lifecycle methods**: adds complexity without benefit when all state already lives in the database; makes testing harder; violates ADR-004

### Consequence

Workers handle state transitions (read case → call agent → write result). Agents handle LLM inference only. Every new agent is a function in `src/agents/` — no base class to extend, no registry to register with.

---

## 26. ADR-024: Tool Security Model — Static Tool Sets Per Action Type

**Status:** Accepted
**Date:** 2026-03-17

### Context

LLMs with tool-calling capabilities can, in adversarial conditions, be steered toward calling tools outside the intended scope for their task. Dynamic tool registries make this surface impossible to audit statically.

### Decision

Tool sets are **compile-time constants** per action type, defined in `src/agents/tool-sets.ts` as `TOOL_SETS_BY_ACTION_TYPE`. No runtime tool registration. No operator-configurable tool sets in v1. All tools are read-only — no tool writes to the database or calls a mutation API.

Tool sets by action type:

| Action Type | Allowed Tools |
|---|---|
| `auto_reply` | `lookupFaq`, `lookupKnownIssue` |
| `triage` | `lookupKnownIssue`, `lookupSeverityPolicy` |
| `known_issue_match` | `lookupKnownIssue`, `searchSimilarCases` |
| `change_prep` | `lookupSpec`, `lookupArchitecture`, `lookupChangelog` |
| `pr_draft_prep` | `lookupChangeRequest`, `lookupGithubContext`, `lookupSpec` |
| `outage_routing` | `lookupRunbook`, `lookupTeamRouting`, `lookupKnownIssue` |

### Rationale

- Static tool sets are auditable at code review time without tracing runtime state
- Read-only constraint means a successful tool-call manipulation cannot cause a write side effect — only reads, which are bounded by `product_id` isolation
- Compile-time check: if `actionType` is not in `TOOL_SETS_BY_ACTION_TYPE`, dispatch is rejected before the LLM is called

### Rejected

- **Runtime tool registry**: operators or plugins register tools at runtime — untestable surface, operator error risk, RBAC complexity
- **Same tool set for all agents**: loses the defense-in-depth property where each agent's blast radius is limited to its intended tools

### Consequence

Every tool implementation must enforce `WHERE product_id = $authoritative_id` by construction. The authoritative `product_id` comes from the case record read by the worker, not from the job payload. Cross-product query paths do not exist in v1.

---

## 27. ADR-025: Queue Selection — pg-boss

**Status:** Accepted
**Date:** 2026-03-17

### Context

Agent jobs require durable queue semantics: transactional enqueue (state transition + job dispatch in the same transaction), retry with backoff, dead-letter capture, and restart durability. The modular monolith constraint bars new infrastructure components unless justified.

### Decision

Use `pg-boss` (PostgreSQL-backed job queue) for all agent job dispatch.

### Rationale

- Transactional enqueue: state transitions and job dispatch share the same PG transaction — no phantom jobs, no missed transitions
- Zero new infrastructure: runs entirely within the existing PostgreSQL instance
- Dead-letter, deduplication, retries with backoff are built in
- Job state is queryable with plain SQL for debugging and ops introspection
- Singleton key `{actionType}:{caseId}` provides deduplication at dispatch time

### Rejected

- **BullMQ / Redis**: introduces Redis as new required infrastructure, incompatible with self-hosted single-server deployment model
- **In-process queues (Bull, p-queue, etc.)**: no restart durability — jobs in flight during process restart are lost
- **AWS SQS / cloud queues**: incompatible with client-installed modular monolith, adds external dependency

### Consequence

pg-boss runs as a worker process within the NestFleet Node.js process. Queue configuration is per-action-type (concurrency, retry limit, retry delay). Dead-lettered jobs trigger operator notification via `nestfleet_agent_dlq` logging channel.

---

## 28. ADR-026: Audit Trail Schema — `agent_runs` Table

**Status:** Accepted
**Date:** 2026-03-17

### Context

Every agent invocation must be auditable: what model was used, what the outcome was, what evidence was provided, and what output was produced. This is required for GDPR accountability (ADR-008), compliance validation records (CG-05), and operational debugging.

### Decision

Every agent invocation produces an immutable record in the `agent_runs` table. The schema captures: job ID, product ID, case ID, action type, outcome (`success|abstain|error|validation_failure`), model ID, token usage, duration, evidence chunk IDs, output schema version, Zod validation result, output snapshot (GDPR-sensitive), and OTel trace/span IDs.

### Rationale

- Immutable append-only record satisfies GDPR accountability without requiring event sourcing infrastructure
- `output_snapshot` (Zod-validated output as JSONB) enables "why did the agent do that?" queries without replaying jobs
- OTel IDs link the DB record to the distributed trace for full observability correlation
- `evidence_chunk_ids` links to `memory_chunks` for explainability: operator can trace which source documents drove the agent output

### Rejected

- **Log-only audit trail**: not queryable, not durable across log rotation, not GDPR-erasure-capable
- **Event sourcing**: full event store overhead not justified for v1 audit requirements

### Consequence

`output_snapshot` is access-gated (`audit:read` RBAC). GDPR erasure sets it to `{"erased": true, "erasedAt": "..."}` — metadata rows are retained for accounting. `evidence_chunk_ids` is a `TEXT[]` column referencing `memory_chunks.chunk_id`.

---

## 29. ADR-027: Prompt Injection Defense — XML Delimiter Model

**Status:** Accepted
**Date:** 2026-03-17

### Context

Agent prompts include untrusted external content (customer ticket text, issue descriptions, PR bodies). Prompt injection attacks attempt to override agent instructions by embedding instruction-like text in user content.

### Decision

Three-layer defense:

1. **Pre-sanitization**: `sanitizeUserContent(text)` strips XML/HTML tags from untrusted content before it is wrapped in the prompt. Prevents tag injection attacks.

2. **XML delimiter isolation**: Untrusted content is wrapped in a named XML tag in the user turn only, never the system turn. System prompt explicitly states the content inside the tag is unvalidated external input and must never be treated as instructions.

3. **Zod output validation as final gate**: A successful injection that produces off-schema output is caught by Zod validation. After `maxRetries: 2` schema failures: `StructuredOutputError`. The injection cannot cause a write side effect — Zod validation is a precondition for any worker write.

### Rationale

- No single layer is sufficient; defense-in-depth is required for adversarial text inputs
- XML delimiters are recommended by Anthropic for Claude prompt injection mitigation; they also work with OpenAI models
- Zod validation as a final gate means even a fully successful injection cannot produce an undetectable side effect — it either fails schema validation or produces on-schema output (which is acceptable)

### Rejected

- **Blocklist-based filtering**: maintenance burden, false positives on legitimate content, incomplete coverage
- **Single-layer defense (sanitization only)**: insufficient; sophisticated attacks can survive sanitization

### Consequence

`sanitizeUserContent(text: string): string` is a required preprocessing step for all untrusted content. It must be called before content is included in any prompt. The function is in `src/agents/sanitize.ts`.

---

## 30. ADR-028: LLM Token Budget Enforcement

**Status:** Accepted
**Date:** 2026-03-17

### Context

Uncontrolled LLM token usage at high throughput creates unpredictable cost exposure and can exhaust per-product quotas. Token budget enforcement must operate at two levels: per-action-type (model call) and per-product (monthly aggregate).

### Decision

Two enforcement tiers:

1. **Per-call**: Each action type has a defined input token budget and `maxTokens` output limit. Input token estimate is checked pre-call (rough: `length/4`). The `maxTokens` parameter is set on every AI SDK call. Exceeding input estimate → `TokenBudgetError`.

2. **Per-product monthly**: Token usage is tracked in `product_llm_usage` table (rolling monthly totals per product, action type, model). Soft limit → `budget_hold` product status + operator notification. Hard limit (configurable per product) → job rejected at dispatch time.

Token budgets by action type: `auto_reply` 8K in/1K out, `triage` 6K in/800 out, `known_issue_match` 5K in/600 out, `change_prep` 10K in/2K out, `pr_draft_prep` 12K in/3K out, `outage_routing` 6K in/800 out.

### Rationale

- Per-call budgets prevent individual runaway calls regardless of monthly state
- Per-product monthly tracking gives operators visibility into cost per customer
- Soft limit before hard limit avoids silent breakage — operator gets a notification window to increase the limit or investigate anomalous usage
- `outage_routing` budget is tight and P95 latency-constrained (12s target) — larger input would increase cost and latency simultaneously

### Rejected

- **No budget enforcement**: unacceptable cost exposure risk
- **Cloud provider rate limits only**: provider limits are per-account, not per-product, so they don't isolate one product's usage from another

### Consequence

`product_llm_usage` table requires a migration. `writeAgentRun()` updates the rolling usage counters atomically. Dispatch rejects jobs for products in `budget_hold` state.

---

## 31. ADR-029: Outage Routing Fallback — Human Escalation on LLM Failure

**Status:** Accepted
**Date:** 2026-03-17

### Context

Outage routing has a P95 target of 12 seconds and is safety-critical: a missed outage routing event means an active outage goes unaddressed. LLM availability cannot be assumed during an outage (the outage may be caused by infrastructure issues affecting the LLM provider). The LLM step improves routing quality but must never be the safety mechanism.

### Decision

On LLM failure (timeout, provider error) OR evidence abstain for `outage_routing`: **immediately escalate to all leads via critical notification** without waiting for retries. Quiet-hours bypass is mandatory for outage notifications. The LLM retry (×2 with 3s exponential backoff) proceeds in background but the human escalation is not gated on it.

### Rationale

- The LLM step enhances routing quality; it is not the safety mechanism for outage response
- Waiting for two LLM retries (total ~9 seconds) before escalating may violate the P95 12s target
- During a real infrastructure outage, the LLM provider may itself be degraded — retries compound the delay
- Human escalation on first failure is the correct safety-first behavior for a time-sensitive, high-impact event

### Rejected

- **Retry first, then escalate**: introduces latency that may breach the P95 target and delays human response to an active outage
- **Escalate only after retry exhaustion**: same problem — and during a real outage, retry exhaustion may take minutes

### Consequence

`outage_routing` worker has a different failure path than all other agents: `catch (error) { await escalateToAllLeads(case); throw error }` — the escalation happens in the catch block before the error is propagated to pg-boss for retry. This is the only agent type where the error path triggers an immediate side effect before retry.

---

## 33. ADR-030: LLM API Key Encryption at Rest — AES-256-GCM with `enc:` Prefix Protocol

**Status:** Accepted
**Date:** 2026-03-23

### Context

NestFleet stores customer-supplied LLM provider API keys in the `products` table as `llm_config JSONB`. These keys carry significant blast radius: a leaked key enables unrestricted LLM API usage on the customer's account and potentially arbitrary spend. They must not be stored as plaintext in the database.

Additionally, keys must survive partial configuration: an operator may save a key once and never re-enter it. The product must be able to retrieve and use the stored key without re-prompting.

### Decision

LLM API keys (and any other secrets stored in configuration JSONB) are encrypted with **AES-256-GCM** using the `encryptSecret(value: string): string` function in `src/shared/crypto.ts`. Encrypted values are stored with an `enc:` prefix (e.g., `enc:iv:ciphertext:authTag` in base64url). The decryption function `decryptSecret(value: string): string` detects the `enc:` prefix and decrypts; values without the prefix are returned as-is (backward compatibility for plaintext values from before the migration).

Three enforcement rules:

1. **Encrypt at write, not at read.** API keys are encrypted immediately at every write boundary: setup wizard (`POST /setup/complete`), settings update (`PUT /products/:id/settings`). Plaintext keys never touch the database.
2. **Never expose raw keys in API responses.** `GET /products/:id/settings` returns only `apiKeyLast4: "****xxxx"` (via `maskApiKey()`) when a key of ≥8 chars exists, `null` otherwise. The raw key is decrypted only inside agent workers and the LLM provider factory — never serialized into a response payload.
3. **Mask in the UI.** The console Settings → LLM section renders the API key field as a locked read-only display showing `apiKeyLast4` when a saved key exists. The user must click "Change" to replace it. The unlock input uses `autoComplete="new-password"` to prevent browser password-manager autofill.

### Rejected

- **Plaintext storage with access control**: insufficient — a single DB read or log line exposes the key. Defense-in-depth requires encryption regardless of access controls.
- **KMS or external secret store for v1**: adds operational complexity (dependency, credential rotation, availability coupling) before justification. AES-256-GCM with a server-side encryption key (`ENCRYPTION_KEY` env var) is the correct scope for the self-hosted client-installed model.
- **Hashing (one-way)**: keys must be decryptable for use in LLM API calls — one-way hashing cannot satisfy the use case.

### Consequence

`ENCRYPTION_KEY` env var is mandatory in production. Key rotation requires a DB migration to re-encrypt stored values. `maskApiKey()` (`src/api/v1/settings.ts`) is the only function allowed to produce a key hint for UI display. Any code path that reads `llm_config.apiKey` from the DB must call `decryptSecret()` before use.

---

## 34. ADR-031: Multi-Product Console Architecture — URL Prefix + React Context (Option C)

**Status:** Accepted
**Date:** 2026-03-21

### Context

The original console was single-product: the active product ID was a build-time constant (`NEXT_PUBLIC_PRODUCT_ID` in `.env.local`). Switching products required editing `.env.local` and restarting the dev server. This is not a UI gap — it is an architectural coupling that blocks all multi-product features.

Three options were evaluated:

| Option | Mechanism | Problem |
|--------|-----------|---------|
| A: URL-only | `/products/:productId/cases` | Breaks every existing bookmark; no shared switching context |
| B: Context + localStorage | `ProductProvider` at root; `localStorage` persists selection | Not URL-visible — can't share links; `localStorage` is shared across browser tabs, creating a last-writer-wins race |
| C: Hybrid — URL prefix + React Context | `/p/[slug]/` route group; context reads slug from URL | URL is canonical; context provides reactivity; per-tab independence |

### Decision

**Option C: URL prefix + React Context** is the canonical multi-product architecture.

- **URL structure**: `/p/[slug]/cases`, `/p/[slug]/settings`, etc. The slug in the URL is the single source of truth for the active product.
- **Next.js route group**: `console/src/app/(app)/p/[slug]/` route group with `layout.tsx` that mounts `<ProductProvider key={slug} slug={slug}>`.
- **ProductProvider**: fetches the full product object from `GET /api/v1/products`, exposes `{ product, products, productId }` via React context. `useProductId()` and `useProductIdWithFallback()` hooks are the only allowed way for page code to obtain the current product ID.
- **key={slug} on ProductProvider**: forces full React subtree remount on slug change. This eliminates the async race window where the provider's `product` state remained at the old product during a refetch, causing child components to read stale IDs during the transition.
- **`nf_last_product` cookie**: set by middleware on every product page visit; used as a hint by the root redirect (`/` → `/p/${lastSlug}/queue`) for returning users. Does not affect already-open tabs.
- **Middleware `/cases` redirect**: `console/src/middleware.ts` redirects `/cases` → `/p/${lastSlug}/cases` using the cookie, covering returning users with old bookmarks and the already-authenticated `useEffect` redirect.
- **Single-product graceful degradation**: `useProductIdWithFallback()` falls back to `NEXT_PUBLIC_PRODUCT_ID` env var when called outside `ProductProvider`, maintaining backward compatibility for existing single-product deployments.

### Rejected

- **Option B (Context + localStorage)**: `localStorage` is shared across browser tabs — Tab 1 on Product A, Tab 2 switching to Product B would silently affect Tab 1's next render. Not acceptable for a multi-operator environment where each tab may be monitoring a different product.
- **`NEXT_PUBLIC_PRODUCT_ID` as the runtime product source**: build-time constant cannot support switching without a rebuild. Zero pages are allowed to read this env var directly post-migration.

### Consequence

No page in `console/src/` may import or reference `process.env.NEXT_PUBLIC_PRODUCT_ID` directly (enforcement: grep in CI). All product-scoped data fetching goes through `useProductId()`. Adding a new product-scoped page requires only `const productId = useProductId()` — no env var reading, no prop drilling from layout. Full multi-tab independence: two browser tabs can independently display different products. Full spec: `docs/specs/multi-product-console-architecture.md`.

---

## 35. ADR-032: Console Product-Switch Isolation — `key` Prop Remount on Section Components

**Status:** Accepted
**Date:** 2026-03-23

### Context

React's `useState` initializers run only once on component mount. Settings section components (`LlmSection`, `LeadsSection`, `AgentSection`, etc.) initialize their local form state from the `settings` prop at mount time. When the active product changes and SWR refetches settings, the `settings` prop updates — but `useState` does not re-initialize, leaving the form fields showing the previous product's values during (and after) the transition.

This manifested as: switching Product A → B showed Product A's LLM model, API key hint, and form values in Product B's settings page, even after the SWR data had resolved to Product B's data.

Two locations required the fix:

1. **Section components in `settings/page.tsx`**: each section rendered with `key={productId}` forces React to unmount and remount the component on product switch, re-running all `useState` initializers with fresh props.
2. **`ProductProvider` in `SlugLayout`**: rendered with `key={slug}`. Without this, there was an async race window where `ProductProvider.product` state remained at the old product during the `getProductsApi()` refetch — child components (including the settings page) could read the stale `productId` during this window, defeating the section-level `key` fix.

### Decision

Any component that:
- (a) initializes local state from a prop that changes when the active product changes, AND
- (b) is rendered inside `ProductProvider`

**must** use `key={productId}` to ensure full remount on product switch. The canonical pattern:

```tsx
{activeSection === "llm" && <LlmSection key={productId} settings={settings} onSave={handleSave} />}
```

`ProductProvider` itself uses `key={slug}` in `SlugLayout` to reset all context state atomically before the async refetch begins:

```tsx
<ProductProvider key={slug} slug={slug}>
  {children}
</ProductProvider>
```

### Rejected

- **`useEffect` to reset state on `settings` prop change**: requires every section component to implement its own reset logic; error-prone (easy to miss a state variable); adds imperative complexity for what React's key mechanism handles declaratively.
- **Lifting all section state to parent**: would require the parent `SettingsPage` to own all form state across all sections simultaneously, creating significant coupling and memory overhead.

### Consequence

This pattern is the standard for any console component that: (1) has local form/display state derived from product-scoped props, and (2) may be rendered across product switches without unmounting. New settings sections must follow this pattern. The `key` must be derived from `productId` (not from any other signal), since `productId` is the canonical product identity in the console.

---

## 36. ADR-033: Lease-Based License Validation (LPP Adoption — SAD-04)

**Status:** Accepted
**Date:** 2026-03-27

### Context

NestFleet previously refreshed its license from PlatformCloud on a fixed 6-hour `setInterval`. This had several problems:

1. The interval was hardcoded — PlatformCloud could not signal that a shorter TTL was needed (e.g., during a pending revocation or grace transition).
2. There was no cloud status state machine: PlatformCloud could return `grace`, `read_only`, or `revoked` states, but NestFleet had no code path to act on them.
3. No 304 support: every refresh was a full state re-parse even when nothing had changed.
4. Offline failures were silently swallowed with no operator visibility and no autonomous degradation.

### Decision

Adopt the PlatformCloud License Propagation Protocol (SAD-04):

1. **Lease-based scheduling:** `refreshFromCloud()` reads `lease.ttl_seconds + jitter_seconds` from the 200 response and schedules the next refresh via `setTimeout` chain: `delay = ttl_seconds * 1000 + Math.random() * jitter_seconds * 1000`. Falls back to 6h if no lease returned. `startCloudRefreshInterval()` retained as a backward-compat shim.

2. **config_version + 304:** Request body includes `cached_config_version`. Server returns 304 when config is unchanged; NestFleet resets the lease timer without mutating state.

3. **Cloud status state machine:** Module-level `_cloudStatus: LicenseCloudStatus | undefined` reflects the server-reported state (`active | grace | read_only | revoked`). `requireLicenseActive()` middleware enforces it: `grace` → pass with header; `read_only | revoked` → 403.

4. **Pending changes:** `_pendingChanges: PendingChange[]` stores the discrete delta from the server. Exposed via `getLicensePendingChanges()`. Never merged with `features[]`.

5. **Offline degradation:** Failure to reach the cloud sets `_offlineWarning = true`. If the cloud has been unreachable ≥ 24h (C-05), `_cloudStatus` autonomously transitions to `"read_only"`. Restored on next successful validation.

### Consequences

- Cloud refresh is now server-cadenced, not hardcoded. Emergency revocations propagate faster.
- Write operations are blocked within one lease interval of a `read_only` or `revoked` state.
- Operators receive clear UI feedback for all license states via `LicenseStatusBanner`.
- `startCloudRefreshInterval()` callers are unaffected (shim).

---

## 37. ADR-034: Capability Manifest Push on Startup (SAD-06)

**Status:** Accepted
**Date:** 2026-03-27

### Context

PlatformCloud needs a machine-readable declaration of which features NestFleet exposes, how they are gated, and their quota dimensions. Without this, PlatformCloud cannot enforce tier gating, feature-flag delivery, or pending-change scheduling on the NestFleet feature set.

### Decision

NestFleet pushes a `ProductCapabilityManifest` to PlatformCloud after each successful license validation (`PATCH /api/v1/admin/products/nestfleet/capabilities`, Bearer `PLATFORM_CLOUD_TOKEN`).

**Manifest build rules (`src/license/manifest.ts`):**
- Source: `FEATURE_CATALOG` (38 features across 8 groups).
- `comingSoon: true` features → excluded (not yet available; they remain in FEATURE_CATALOG for the console UI's roadmap display).
- Feature has `featureFlag` → `{ gate: "flag", key: featureFlag }`.
- Feature has no `featureFlag` → `{ gate: "tier", key: feature.id, min_tier: feature.minTier }`.
- Duplicate keys prevented by a `seenKeys: Set<string>` guard.
- Quota dimensions: `["outcome_units_monthly", "active_products", "lead_slots", "users"]`.

**Push guard:** `_lastPushedManifestHash` (SHA-256 of the serialized manifest JSON) prevents re-pushing unchanged manifests across successive validation cycles.

**No-op safety:** Push silently skips when `PLATFORM_CLOUD_TOKEN` is not configured.

### Why push on each validation cycle (not only startup)?

This debounced-by-hash approach means: if FEATURE_CATALOG changes in a new deployment, the manifest is pushed exactly once after the next scheduled validation — without requiring a dedicated startup hook or a separate push schedule.

### SSO taxonomy

`sso_group_mapping.featureFlag` was corrected from `"sso_saml"` (shared with SSO SAML) to `"sso_group_mapping"`. Root cause: two features in FEATURE_CATALOG shared the same `featureFlag` key, which would have collapsed them into a single manifest entry. Fix at source (catalog) rather than in the manifest builder.

### Consequences

- PlatformCloud always has a current, machine-readable view of NestFleet's feature surface.
- Feature additions/removals propagate to PlatformCloud on next validation cycle, not deployment.
- `comingSoon` features are invisible to PlatformCloud until they graduate.
- The manifest is idempotent: pushing the same manifest twice has no side effects.

---

## 38. Immediate Follow-On Questions

These decisions are enough to begin Phase 2 implementation. The next unresolved architecture questions are:

- GitHub integration contract for `pr_draft_prep` (to be defined in SPIKE-04)
- OIDC/approval flow for `change_prep` and `pr_draft_prep` gates (SPIKE-07)
- Exact event schema connecting agent outputs to notification dispatch (to be defined in AE-04 / SLICE-07)

## 19. Sources

Primary sources checked on March 16–17, 2026 for the technology directions referenced here:

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [pg-boss GitHub](https://github.com/timgit/pg-boss)
- [GitHub Webhooks Docs](https://docs.github.com/webhooks-and-events/webhooks/creating-webhooks)
- [GitHub Issues REST API](https://docs.github.com/en/rest/issues/issues)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
