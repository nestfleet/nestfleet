# NestFleet Product Memory Specification

## 1. Purpose

This document defines the canonical specification for NestFleet's Product Memory subsystem. It governs how product knowledge is ingested, structured, tiered, retrieved, evaluated, and degraded across any product NestFleet operates.

Product Memory is not generic chat memory. It is the evidence infrastructure that determines whether an AI persona action is grounded, safe, and policy-compliant. Every auto-reply, triage decision, and change preparation depends on the quality of what is stored here.

This spec applies to all products NestFleet services, not only DocuGardener.

---

## 2. Governing Principle

**Documentation quality determines AI fleet quality.**

If the input documentation is sparse, contradictory, stale, or structurally poor, the AI fleet cannot make trustworthy decisions. NestFleet does not attempt to compensate for bad documentation by increasing model creativity. Instead, it degrades explicitly: routes to humans, raises abstain signals, and reports the gap to the operator.

Garbage in, explicit route-to-human out. Never garbage in, confident-but-wrong answer out.

---

## 3. Source Tier Model

The Source Tier Model is the canonical classification of every knowledge source NestFleet ingests. Tier assignment governs both retrieval ranking and policy gating. A source's tier determines which AI actions its content may ground.

### 3.1 Tier Definitions

| Tier | Label | Description |
| --- | --- | --- |
| **T1** | Authoritative | Operator-curated, product-version-specific, and explicitly maintained. Changes to this tier should go through a review process. |
| **T2** | High-trust technical | Technically accurate and maintained, but may be less comprehensive or more operationally focused than T1. |
| **T3** | Curated signal | Historically accurate, filtered for quality at ingestion time, but not maintained at T1 standards. |
| **T4** | Raw signal | High-noise, unverified, or ephemeral. Useful only for pattern detection and duplicate matching. Never grounds an auto-reply. |

### 3.2 Source-Type-to-Tier Mapping

| Source type | Default tier | Notes |
| --- | --- | --- |
| Product specification | T1 | Core feature descriptions, behavior contracts, acceptance criteria |
| Feature specifications | T1 | Detailed feature-level docs |
| FAQ (operator-curated) | T1 | Explicit Q&A pairs maintained by the operator |
| Known issues registry | T1 | Curated list of confirmed bugs, workarounds, and status |
| API / interface documentation | T1 | OpenAPI, GraphQL schema descriptions, error code registry |
| Architecture overview | T2 | System design, component boundaries, data flows |
| Technical implementation spec | T2 | Code-level design decisions, module responsibilities |
| Deployment and operations guide | T2 | Infrastructure, configuration, environment variables |
| Troubleshooting guide | T2 | Step-by-step resolution procedures |
| Runbooks | T2 | Operational playbooks |
| Changelog and release notes | T2 | Version history, breaking changes, deprecations |
| GitHub issues (closed, labeled, linked to merged PR) | T3 | Filtered: must have label, resolution comment, or PR link |
| GitHub PRs (merged, with description) | T3 | Implementation context for Change persona |
| OpenAPI spec (auto-generated) | T2 | If auto-generated from code, treat as T2 not T1 |
| JSDoc / Sphinx auto-generated docs | T2 | Mark `source_subtype: auto_generated` |
| GitHub issues (open, unlabeled, unresolved) | T4 | Signal only — duplicate detection, never reply grounding |
| Commit messages | T4 | Signal only |
| Slack / chat exports | T4 | Signal only, if ingested at all |

### 3.3 Policy Gates by Tier

The following table defines which tiers may appear in an evidence pack for each action type. If the minimum tier requirement is not met, the action must abstain and route to a human lead.

| Action | Minimum tier required | Notes |
| --- | --- | --- |
| Case triage (classify, severity hint) | At least one T1 or T2 source | README alone is insufficient |
| Auto-reply to user request | T1 only | No T3 or T4 sources may appear as primary evidence |
| Known-issue match confirmation | T1 or T3 (filtered) | T3 acceptable for duplicate detection |
| Change request creation | T1 + T2 (problem statement + tech context) | Both tiers required |
| PR draft preparation | T2 technical spec + repository structure | T1 alone is insufficient |
| Outage severity classification | T1 (product spec or known issues) | Must have authoritative grounding |

---

## 4. Recommended Documentation Structure

NestFleet ships this guidance to every new product operator at onboarding. It is not a hard requirement for the system to start, but it is a hard requirement for full AI fleet capability to unlock.

### 4.1 Tier 1 — Minimum Required for Auto-Reply

Every product NestFleet services should have at minimum:

1. **Product Specification** — What the product does, feature descriptions, behavior expectations, edge cases. One document or structured folder. Must be versioned.
2. **FAQ** — At least 20 operator-curated Q&A pairs covering the most common support topics. This is the single most impactful document for Frontline auto-reply quality.
3. **Known Issues Registry** — A maintained list of confirmed bugs, their severity, workarounds, and resolution status. Can be a markdown file, a GitHub issue label group, or a structured YAML.
4. **API / Interface Documentation** — If the product has an API, REST, GraphQL, or CLI, a machine-readable or prose description of endpoints, parameters, errors, and behavior contracts.

### 4.2 Tier 2 — Required for Change Path and PR Draft

5. **Architecture Overview** — How the system is structured. Component boundaries, data flows, key dependencies. Minimum 500 words with a diagram or equivalent prose structure. Required to unlock Change persona in full mode.
6. **Technical Implementation Spec** — Code-level design. Module responsibilities, key functions, data models, integration points. Required to unlock PR Draft preparation.
7. **Deployment and Operations Guide** — How to run and configure the product. Environment variables, infrastructure requirements, startup sequence.
8. **Troubleshooting Guide** — Common failure modes and how to diagnose them. Step-by-step procedures.
9. **Changelog** — Version history. What changed, what broke, what was deprecated. Keeps product memory version-aware.

### 4.3 Tier 3 — Enrichment Sources (Optional but Valuable)

10. **Closed GitHub issues** — Filtered to labeled, resolved issues with a resolution comment. Improves duplicate detection and known-issue matching significantly.
11. **Merged GitHub PRs with descriptions** — Provides implementation context for the Change persona.

### 4.4 Structure Recommendations

- Use consistent heading hierarchy. NestFleet's chunker uses headers to establish section context for each chunk. Flat wall-of-text docs chunk poorly.
- Prefer markdown. NestFleet's ingestion pipeline is markdown-first.
- Separate concerns per file. One document per topic is better than one mega-document. Retrieval precision improves with focused documents.
- Keep code blocks tagged with language identifiers (```python, ```typescript). NestFleet's chunker treats code blocks separately from prose.
- Date or version-stamp documents at the top. Freshness scoring depends on it.

---

## 5. Chunk Metadata Schema

Every chunk stored in the product memory index must carry the following metadata. This metadata drives retrieval filtering, freshness scoring, conflict detection, and policy gating.

| Field | Type | Description |
| --- | --- | --- |
| `chunk_id` | UUID | Unique identifier for the chunk |
| `product_id` | string | Which product this chunk belongs to |
| `source_type` | enum | See source-type-to-tier mapping in section 3.2 |
| `source_subtype` | string | Optional: `auto_generated`, `curated`, `raw` |
| `tier` | T1 \| T2 \| T3 \| T4 | Assigned at ingestion per section 3.2 |
| `source_uri` | string | File path, GitHub URL, or document reference |
| `section_path` | string | Heading hierarchy: `Installation > Docker > Environment Variables` |
| `content_type` | prose \| code \| structured | Drives retrieval strategy (vector vs FTS) |
| `language` | string | ISO 639-1 language code. e.g., `en`, `de` |
| `product_version` | string | Product version this content applies to. `*` if not version-specific |
| `ingested_at` | timestamp | When this chunk was ingested |
| `source_updated_at` | timestamp | When the source document was last modified |
| `freshness_score` | float 0–1 | Computed: 1.0 = current, decays toward 0 over staleness window |
| `audience` | public \| internal | Restricts retrieval for external vs internal actions |
| `conflict_flag` | boolean | Set by conflict detector at ingestion |
| `embedding` | vector(1536) | Embedding for vector similarity search |

---

## 6. Structure-Aware Chunking Strategy

Chunking is not a simple token-split operation. NestFleet uses content-type-aware chunking to preserve semantic integrity and enable the right retrieval strategy per chunk type.

### 6.1 Prose Chunks

- Split on markdown heading boundaries (H1, H2, H3).
- Maximum chunk size: 512 tokens.
- Minimum chunk size: 50 tokens (discard smaller fragments).
- Include section path in chunk metadata for context injection.
- Include preceding heading hierarchy as a prefix in the chunk text.
- Overlap: 50-token overlap between adjacent prose chunks to prevent boundary loss.

### 6.2 Code Block Chunks

- Extract each fenced code block as a separate chunk.
- Tag with `content_type: code` and detected language.
- Do NOT split code blocks mid-block.
- Retrieval strategy: FTS (keyword/fuzzy match) rather than vector similarity.
- Code chunks may also receive a vector embedding but rank below prose matches for natural-language queries.

### 6.3 Structured Data Chunks (OpenAPI, JSON Schema, YAML)

- Convert to natural-language summary at ingestion time.
- Example: `POST /api/v1/cases — Creates a new case. Parameters: product_id (required), signal_id (required). Returns: case object with id, status, created_at.`
- Store original structured form in S3; store NL summary as the chunk text.
- Tag with `content_type: structured` and `source_subtype: auto_generated` if spec is machine-generated.

### 6.4 FAQ Chunks

- Each Q&A pair is one chunk.
- Include both question and answer in the chunk text for retrieval.
- Tag with `source_type: faq` and `tier: T1`.
- FAQ chunks receive highest retrieval priority for question-like queries.

### 6.5 GitHub Issue Chunks

- One issue per chunk.
- Include: title, body summary (first 300 chars), labels, resolution comment summary.
- Tag with `tier: T3` if filtered (closed, labeled, resolved), `tier: T4` otherwise.
- Do not embed the full thread. Summarize at ingestion using a lightweight LLM call.

---

## 7. Freshness Scoring

### 7.1 Freshness Decay Model

Freshness score decays linearly from 1.0 to 0.0 over the configured staleness window per tier.

| Tier | Default staleness window | Freshness at window end |
| --- | --- | --- |
| T1 | 90 days | 0.0 (must refresh) |
| T2 | 180 days | 0.0 (must refresh) |
| T3 | 365 days | 0.2 (still usable, flagged) |
| T4 | No decay | Always 1.0 (used for signal only) |

Formula: `freshness = max(0, 1 - (days_since_update / staleness_window))`

### 7.2 Freshness in Retrieval

- Freshness score is multiplied into the final retrieval score as a soft signal.
- Chunks with `freshness < 0.3` are excluded from auto-reply evidence packs (T1/T2 only).
- Chunks with `freshness < 0.3` remain available for T3 duplicate detection.
- A `stale_source_warning` flag is set on any validation record where the evidence pack includes a chunk with `freshness < 0.5`.

### 7.3 Version-Aware Filtering

When the inbound signal carries a product version identifier (from email metadata, ticket template, or explicit user input):
- Chunks tagged with a different `product_version` are deprioritized (score multiplied by 0.3).
- Chunks tagged with `*` (version-agnostic) are not penalized.
- If no version can be determined from the signal, version filtering is skipped and a `version_unknown` flag is set on the case.

---

## 8. Conflict Detection

### 8.1 What Constitutes a Conflict

A conflict is detected when two or more T1 or T2 chunks from different source documents make factually contradictory claims about the same entity, behavior, or value.

Examples:
- Document A says endpoint X returns 404 on missing resource; Document B says it returns 200 with empty body.
- Document A says feature Y requires authentication; Document B describes it as public.
- Document A gives the default timeout as 30 seconds; Document B gives it as 60 seconds.

### 8.2 Detection Approach

Conflict detection runs as a post-ingestion analysis step, not in the hot retrieval path.

Method:
1. After ingesting a new or updated chunk, retrieve the top-10 semantically similar chunks from the same product and tier.
2. Run a lightweight LLM conflict-detection pass over the chunk pair: "Do these two passages make contradictory factual claims about the same entity?"
3. If conflict is confirmed, set `conflict_flag: true` on both chunks and create a `KnowledgeConflict` record.

### 8.3 Effect of Conflict on Retrieval

- Conflicting chunks are surfaced to the operator in the Documentation Health Report.
- If a retrieval result set for a given query contains two conflicting chunks, the action is forced to `abstain` regardless of confidence score.
- The abstain reason is set to `knowledge_conflict` with references to the conflicting source URIs.
- The operator is notified via a `stale_case_alert`-class notification to resolve the conflict.

---

## 9. Audience Control

Every chunk carries an `audience` tag: `public` or `internal`.

- `public` chunks may appear in evidence packs for external (user-facing) actions.
- `internal` chunks may only appear in evidence packs for internal actions (triage, change prep, PR drafting).
- Chunks containing credentials, internal URLs, PII, or system-internal state must be tagged `internal` at ingestion time.
- The policy engine enforces this at retrieval time: if the action target is external, `internal` chunks are excluded from the evidence pack regardless of relevance score.

Operators may override `audience` tags per chunk after ingestion via the operator console.

---

## 10. Language Handling

- Language is detected automatically at ingestion using a lightweight language detection library.
- Detected language is stored in chunk metadata.
- Embedding model selection may vary by language. Default: OpenAI `text-embedding-3-small` (multilingual). Alternative: a dedicated multilingual model for non-English-dominant corpora.
- If the primary corpus language is not English (e.g., German), this is flagged in the Documentation Health Report.
- Cross-language retrieval (query in English, doc in German) is flagged with a `language_mismatch_warning` on the case.
- v1 does not perform automatic translation at ingestion. Translation is a post-v1 enhancement.

---

## 11. Documentation Health Report

The Documentation Health Report is a first-class operator-facing feature. It is computed after every ingestion run and displayed in the operator console.

### 11.1 Health Dimensions

| Dimension | Measurement | Threshold |
| --- | --- | --- |
| T1 Coverage | % of product feature areas with at least one T1 chunk | GOOD ≥ 70%, WARN 40–70%, FAIL < 40% |
| FAQ Coverage | Count of FAQ Q&A pairs | GOOD ≥ 20, WARN 10–20, FAIL < 10 |
| Known Issues | Count of T1/T3 known issue entries | GOOD ≥ 15, WARN 5–15, FAIL < 5 |
| Architecture Coverage | T2 architecture doc present and fresh | GOOD = present + fresh, WARN = present + stale, FAIL = absent |
| Technical Spec Coverage | T2 technical spec present and fresh | GOOD = present + fresh, WARN = present + stale, FAIL = absent |
| Freshness | % of T1 chunks with freshness ≥ 0.5 | GOOD ≥ 80%, WARN 50–80%, FAIL < 50% |
| Conflicts | Count of unresolved KnowledgeConflict records | GOOD = 0, WARN 1–3, FAIL > 3 |
| Language | Primary language detected | GOOD = en, WARN = non-en (flag only) |

### 11.2 Capability Gates

Health dimensions determine which AI fleet capabilities are unlocked:

| Capability | Required conditions |
| --- | --- |
| Auto-reply to user requests | T1 Coverage GOOD + FAQ Coverage GOOD |
| Known-issue matching | Known Issues WARN or better |
| Change request preparation | Architecture Coverage GOOD or WARN |
| PR draft preparation | Technical Spec Coverage GOOD |
| Outage routing | T1 Coverage GOOD + Known Issues WARN or better |

If a required condition is FAIL, the corresponding capability is disabled and the operator console shows an explicit reason with recommended actions.

### 11.3 Report Format

```
[Product] Documentation Health — NestFleet Assessment
══════════════════════════════════════════════════════
T1 Coverage         ████████████░░  85%   GOOD
FAQ Coverage        ████████████░░  23 entries  GOOD
Known Issues        ████░░░░░░░░░░  8 entries   WARN
Architecture        ██████████████  Present, fresh  GOOD
Technical Spec      ░░░░░░░░░░░░░░  ABSENT      FAIL
Freshness           ██████████████  94%   GOOD
Conflicts           ░░░░░░░░░░░░░░  0     GOOD

Capability status:
  Auto-reply:          ✅ ENABLED
  Known-issue match:   ⚠️  ENABLED (low known-issues volume)
  Change prep:         ✅ ENABLED
  PR draft:            ❌ DISABLED — technical spec required
  Outage routing:      ⚠️  ENABLED (monitor known-issues volume)

Recommended actions:
  1. Add technical implementation spec to enable PR draft preparation
  2. Expand known issues registry (currently 8 — aim for 15+)
```

---

## 12. Abstain and Degrade Rules

### 12.1 Action-Level Abstain Rules

The retrieval layer must set an `abstain` signal before the AI persona even runs when any of the following conditions are true:

| Condition | Abstain reason | Route to |
| --- | --- | --- |
| Evidence pack contains only T3/T4 sources | `insufficient_tier` | Support Lead |
| Evidence pack contains a `conflict_flag: true` chunk pair | `knowledge_conflict` | Support Lead |
| All T1 chunks in evidence pack have `freshness < 0.3` | `stale_evidence` | Support Lead |
| Query is version-sensitive but `version_unknown` flag is set | `version_unknown` | Support Lead |
| Required capability gate is FAIL for this action type | `capability_disabled` | Operator |
| `audience: internal` chunk is the only relevant evidence for an external action | `audience_violation` | Support Lead |
| Language mismatch between query and primary evidence language | `language_mismatch_warning` | Support Lead (soft) |

### 12.2 Graceful Capability Degradation

NestFleet degrades capabilities explicitly rather than silently attempting actions it cannot ground:

- **Auto-reply disabled** → All user-request cases enter `awaiting-lead` immediately with reason `auto_reply_capability_disabled`.
- **Change prep degraded** → Change persona operates in `draft-only` mode: produces a structured problem statement but does not attempt implementation context.
- **PR draft disabled** → Change persona stops at `approved` state and notifies Change Lead to prepare PR manually.

---

## 13. Ingestion Pipeline Architecture

### 13.1 Ingestion Sources Supported in v1

- Local filesystem (markdown files)
- GitHub repository (markdown docs, OpenAPI specs, issue/PR metadata via API)
- Manual operator upload (via operator console)

### 13.2 Ingestion Trigger Modes

- **On-demand**: operator-triggered via console or CLI
- **Webhook-driven**: GitHub push event triggers re-ingestion of changed files
- **Scheduled**: configurable periodic full re-ingestion (default: nightly)

### 13.3 Ingestion Steps

For each source document:

1. Fetch and detect language
2. Parse structure (markdown AST, OpenAPI schema, JSON)
3. Split into typed chunks (prose, code, structured) per section 6
4. Compute embeddings (prose and structured chunks)
5. Assign tier, audience, version metadata
6. Compute freshness score
7. Run conflict detection against existing index
8. Upsert chunks and metadata to PostgreSQL + pgvector index
9. Update Documentation Health Report
10. Emit `ingestion_complete` event with summary

### 13.4 Ingestion Idempotency

- Chunks are keyed on `(product_id, source_uri, section_path, content_hash)`.
- Re-ingesting an unchanged document is a no-op.
- Updated documents trigger re-embedding and freshness reset only for changed chunks.

---

## 14. Retrieval Architecture

### 14.1 Hybrid Retrieval

Every retrieval request combines three signals:

1. **Vector similarity**: cosine similarity against the query embedding. Primary signal for prose and structured chunks.
2. **Full-text search**: PostgreSQL FTS with `ts_rank`. Primary signal for code chunks and keyword-heavy queries.
3. **Metadata filters**: applied before scoring. Mandatory: `product_id`, `audience` (for external actions). Optional: `product_version`, `tier` (minimum tier gate), `content_type`.

Final score: `(vector_weight × vector_score) + (fts_weight × fts_score) × freshness_score`

Default weights: `vector_weight = 0.7`, `fts_weight = 0.3`. Configurable per product.

### 14.2 Reranking

After initial retrieval (top-20 candidates), a reranking pass:
1. Promotes T1 sources over T2/T3 with equal base scores.
2. Promotes FAQ chunks for question-like queries.
3. Demotes chunks with `conflict_flag: true`.
4. Demotes chunks with `freshness < 0.5`.

Final evidence pack: top-5 chunks after reranking.

### 14.3 Evidence Pack Composition

The evidence pack passed to the AI persona contains:
- Top-5 reranked chunks with full metadata
- Aggregate tier summary: `{ t1: 3, t2: 1, t3: 1, t4: 0 }`
- Aggregate freshness summary: `min_freshness`, `avg_freshness`
- Conflict flag: `has_conflicts: boolean`
- Abstain signal: `abstain: boolean`, `abstain_reason: string | null`

The persona prompt template injects the evidence pack with explicit source attribution for each chunk.

---

## 15. v1 Scope and Deferral

### In scope for v1

- Source tier model (T1–T4)
- Metadata schema
- Structure-aware chunking (prose, code, structured)
- pgvector + FTS hybrid retrieval
- Freshness scoring and staleness filtering
- Conflict detection (ingestion-time, LLM-assisted)
- Audience tags and enforcement
- Documentation Health Report
- Capability gates
- Abstain and degrade rules
- GitHub and filesystem ingestion sources
- Webhook-driven re-ingestion trigger

### Deferred to post-v1

- Automatic translation at ingestion (multi-language)
- Active learning from case outcomes to improve retrieval
- Chunk-level operator editing via console
- Semantic versioning of the knowledge base
- Cross-product knowledge sharing

---

## 16. Source Documents

- `architecture-decisions.md` ADR-006, ADR-007, ADR-018, ADR-019, ADR-020, ADR-021
- `domain-model.md` section 4.10 (Knowledge Asset)
- `autonomy-and-approval-policy.md` sections 7, 8.1, 12
- `system-architecture.md` sections 5.8, 5.9 (Product Memory subsystem)
- `v1-spikes-and-delivery-backlog.md` SPIKE-01
