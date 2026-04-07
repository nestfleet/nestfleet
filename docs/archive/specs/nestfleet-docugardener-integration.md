# NestFleet ↔ DocuGardener Integration Bridge — Technical Specification

> Version: 1.0
> Date: 2026-03-20
> Status: **Draft**
> Parent: [`../product-suite-strategy.md`](../product-suite-strategy.md) §5

---

## 1. Overview

The integration bridge is the suite's core differentiator. It connects NestFleet (support operations) and DocuGardener (documentation quality) into a **closed feedback loop**: support insights improve documentation, and better documentation reduces support volume.

Both products remain independently deployable. The bridge is an **opt-in add-on** activated when a customer runs both products against the same PlatformCloud tenant.

### 1.1 Design Principles

| Principle | Detail |
|-----------|--------|
| **Async-first** | All cross-product communication flows through an event bus (pg-boss queue or lightweight NATS subject). No synchronous API coupling. |
| **Graceful degradation** | If one product is unavailable, the other continues operating. Events are queued and replayed on reconnection. |
| **Tenant-scoped** | Events are scoped to a PlatformCloud `tenant_id`. No cross-tenant leakage. |
| **Auditable** | Every bridge event is persisted in a shared `bridge_events` table with full provenance (source product, actor, timestamp, payload hash). |
| **Idempotent** | Consumers use event IDs for deduplication. Replaying an event produces no side effects. |

### 1.2 Event Bus Architecture

```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────────┐
│              │       │                     │       │                  │
│   NestFleet  │──────▶│   Bridge Event Bus   │◀──────│  DocuGardener    │
│   (producer/ │       │                     │       │  (producer/      │
│    consumer) │◀──────│  pg-boss queue       │──────▶│   consumer)      │
│              │       │  "bridge.*" topics   │       │                  │
└──────────────┘       └─────────────────────┘       └──────────────────┘
                               │
                       ┌───────▼────────┐
                       │ bridge_events  │
                       │ (audit log)    │
                       └────────────────┘
```

**Queue topics:**

| Topic | Direction | Description |
|-------|-----------|-------------|
| `bridge.doc-gap.detected` | NF → DG | Documentation gap identified during triage |
| `bridge.doc-update.proposed` | DG → NF | Doc update ready for knowledge base |
| `bridge.doc-update.published` | DG → NF | Doc published, triggers RAG re-index |
| `bridge.deflection.attributed` | NF → DG | Support case deflected by a doc update |
| `bridge.lineage.external-ref` | Bidirectional | Cross-product lineage reference |
| `bridge.notification.cross-product` | Bidirectional | Notification targeting the other product's users |

---

## 2. Integration Point 1: Doc Gap Signal

**Direction:** NestFleet → DocuGardener
**Trigger:** NestFleet triage agent detects a documentation gap during case analysis.

### 2.1 When It Fires

During triage (`TriageAgent.run()`), the LLM classifies incoming support signals. When the classification includes `documentation_gap: true` or the agent's reasoning references missing/outdated docs, a `DocGapSignal` event is emitted.

### 2.2 Event Schema

```typescript
interface DocGapSignalEvent {
  eventId: string;              // UUID v7
  tenantId: string;
  sourceProduct: "nestfleet";
  occurredAt: string;           // ISO 8601
  type: "bridge.doc-gap.detected";
  payload: {
    caseId: string;             // NestFleet case that triggered detection
    signalId: string;           // Original support signal ID
    gapType: "missing" | "outdated" | "incomplete" | "contradictory";
    confidence: number;         // 0.0–1.0, from triage LLM
    suggestedTopic: string;     // Free-text topic the docs should cover
    relevantSnippets: string[]; // Excerpts from the support signal that evidence the gap
    productId: string;          // NestFleet product context
    metadata: {
      triageRunId: string;
      modelUsed: string;
      classificationVersion: string;
    };
  };
}
```

### 2.3 DocuGardener Consumer Behavior

1. **Receive** event from `bridge.doc-gap.detected` queue.
2. **Match** `suggestedTopic` against existing doc inventory using embedding similarity (cosine > 0.75 threshold).
3. **If match found** → create a `DocUpdateTask` linked to the existing document, pre-populated with `relevantSnippets` as context.
4. **If no match** → create a `NewDocProposal` with the topic and snippets, flagged for human review.
5. **Acknowledge** event (pg-boss `complete()`).

### 2.4 Deduplication

Multiple support cases may surface the same doc gap. DocuGardener deduplicates by:
- Hashing `(gapType, suggestedTopic_embedding)` into a 64-bit fingerprint.
- If a `DocUpdateTask` with the same fingerprint exists and is `open` or `in_progress`, the new signal is appended as additional evidence rather than creating a duplicate task.

---

## 3. Integration Point 2: Doc Update Proposal

**Direction:** DocuGardener → NestFleet
**Trigger:** DocuGardener proposes a documentation update (either from a gap signal or its own staleness detection).

### 3.1 When It Fires

When DocuGardener's update agent drafts a doc change and it enters the `review` stage, a proposal event is sent to NestFleet so the support team can see what's coming.

### 3.2 Event Schema

```typescript
interface DocUpdateProposalEvent {
  eventId: string;
  tenantId: string;
  sourceProduct: "docugardener";
  occurredAt: string;
  type: "bridge.doc-update.proposed";
  payload: {
    proposalId: string;         // DocuGardener proposal ID
    documentPath: string;       // e.g., "docs/api/authentication.md"
    documentTitle: string;
    changeType: "create" | "update" | "deprecate";
    summary: string;            // Human-readable summary of the change
    diffPreviewUrl: string;     // URL to DocuGardener's diff viewer
    originGapEventId?: string;  // If this proposal was triggered by a NestFleet gap signal
    originCaseIds: string[];    // NestFleet case IDs that contributed evidence
    estimatedImpact: {
      relatedCaseCount: number; // How many open/recent cases touch this topic
      weeklySignalVolume: number; // Signals per week on this topic
    };
  };
}
```

### 3.3 NestFleet Consumer Behavior

1. **Receive** event from `bridge.doc-update.proposed` queue.
2. **Store** in `knowledge_updates` table with status `proposed`.
3. **Link** to any open cases matching `originCaseIds`.
4. **Surface** in NestFleet console:
   - Badge on the Knowledge section: "1 doc update proposed"
   - In related cases: inline card showing the proposal summary with a "View in DocuGardener" link.
5. **Optional webhook** to Slack/Teams: "DocuGardener proposes updating Authentication docs — 12 related cases."

### 3.4 Feedback Loop

If a NestFleet operator reviews the proposal and has feedback (e.g., "this doesn't address the OAuth2 edge case"), they can post a comment via the bridge:

```typescript
interface ProposalFeedbackEvent {
  eventId: string;
  tenantId: string;
  sourceProduct: "nestfleet";
  type: "bridge.doc-update.feedback";
  payload: {
    proposalId: string;
    feedbackType: "approve" | "request_changes" | "reject";
    comment: string;
    authorId: string;           // PlatformCloud user ID
  };
}
```

DocuGardener receives this and updates the proposal's review state accordingly.

---

## 4. Integration Point 3: Knowledge Refresh

**Direction:** DocuGardener → NestFleet
**Trigger:** DocuGardener publishes a documentation update (the proposal was approved and merged).

### 4.1 When It Fires

After a doc update passes review and is published (merged to the docs repo or published to the docs site), DocuGardener emits a publish event.

### 4.2 Event Schema

```typescript
interface DocPublishedEvent {
  eventId: string;
  tenantId: string;
  sourceProduct: "docugardener";
  occurredAt: string;
  type: "bridge.doc-update.published";
  payload: {
    proposalId: string;
    documentPath: string;
    documentTitle: string;
    publishedUrl: string;       // Live URL of the updated doc
    contentHash: string;        // SHA-256 of the new content
    changeType: "create" | "update" | "deprecate";
    originCaseIds: string[];
    chunkIds: string[];         // Doc chunks affected (for targeted re-indexing)
  };
}
```

### 4.3 NestFleet Consumer Behavior

1. **Receive** event from `bridge.doc-update.published` queue.
2. **Trigger targeted RAG re-index:**
   - If `chunkIds` are provided, re-embed only those chunks (incremental).
   - Otherwise, re-crawl `documentPath` and re-embed all chunks for that document.
3. **Update** `knowledge_updates` table: status → `published`.
4. **Auto-close or annotate** related cases:
   - Cases in `originCaseIds` that are still `open` or `waiting` get an internal note: "Related documentation has been updated — [link]."
   - Cases are NOT auto-resolved (human decides if the doc fix addresses the customer's specific issue).
5. **Log** a lineage event of type `knowledge_refresh` on each related case's lineage graph.

### 4.4 Re-index Strategy

| Scenario | Action | Latency Target |
|----------|--------|----------------|
| Incremental (chunkIds provided) | Re-embed specific chunks, upsert into vector store | < 30 seconds |
| Full document | Re-crawl document, re-chunk, re-embed, replace in vector store | < 2 minutes |
| Bulk (> 10 documents) | Queue as background job, process sequentially | < 10 minutes |

---

## 5. Integration Point 4: Support Deflection Metric

**Direction:** NestFleet → DocuGardener
**Trigger:** NestFleet detects that a case was deflected (auto-resolved or self-served) because of a recently updated document.

### 5.1 When It Fires

During triage or auto-reply, if NestFleet's RAG retrieval returns a document that was recently updated by DocuGardener (within the last 30 days), AND the case is subsequently resolved without human intervention (auto-reply accepted, or user self-served within 24 hours), a deflection attribution event is emitted.

### 5.2 Attribution Logic

```
1. Case arrives → Triage runs RAG retrieval
2. Retrieved doc has `knowledge_updates.source = 'docugardener'`
   AND `knowledge_updates.published_at > now() - 30 days`
3. Case resolves via:
   a. Auto-reply (user confirms resolution), OR
   b. Self-service (user closes within 24h without agent interaction)
4. → Emit deflection attribution event
```

### 5.3 Event Schema

```typescript
interface DeflectionAttributionEvent {
  eventId: string;
  tenantId: string;
  sourceProduct: "nestfleet";
  occurredAt: string;
  type: "bridge.deflection.attributed";
  payload: {
    caseId: string;
    deflectionType: "auto_reply" | "self_service";
    attributedDocuments: Array<{
      documentPath: string;
      proposalId: string;        // DocuGardener proposal that updated it
      similarityScore: number;   // How relevant the doc was to the case
    }>;
    estimatedCostSaved: {
      currency: "USD";
      amount: number;            // Based on avg cost-per-case from analytics
    };
    caseMetadata: {
      topic: string;
      signalSource: string;
      timeToResolution: number;  // seconds
    };
  };
}
```

### 5.4 DocuGardener Consumer Behavior

1. **Receive** event and store in `deflection_attributions` table.
2. **Update dashboard metrics:**
   - "Cases deflected this month: N"
   - "Estimated cost saved: $X"
   - Per-document: "This doc update deflected N cases"
3. **ROI report** generation: DocuGardener can produce a monthly report showing the dollar value of documentation improvements, attributed back to specific proposals.

### 5.5 Anti-Gaming

- Attribution requires a minimum similarity score of 0.80 between the case and the retrieved doc.
- A single case can attribute to at most 3 documents.
- Attribution is logged but immutable — no retroactive adjustments.

---

## 6. Integration Point 5: Shared Lineage

**Direction:** Bidirectional
**Trigger:** Any cross-product event that should appear in a case's or document's history.

### 6.1 Concept

NestFleet's lineage graph (the DAG view on case detail) currently shows only NestFleet-internal events. With the integration bridge, DocuGardener events that are causally linked to a case should appear as **external reference nodes** in the lineage.

Similarly, DocuGardener's document history timeline should show NestFleet events (gap signals, deflection attributions) as external references.

### 6.2 Event Schema

```typescript
interface ExternalLineageRefEvent {
  eventId: string;
  tenantId: string;
  sourceProduct: "nestfleet" | "docugardener";
  occurredAt: string;
  type: "bridge.lineage.external-ref";
  payload: {
    // Where to attach the reference
    targetProduct: "nestfleet" | "docugardener";
    targetEntityType: "case" | "document" | "proposal";
    targetEntityId: string;

    // The reference itself
    refType: "doc_gap_detected" | "doc_update_proposed" | "doc_published"
           | "deflection_attributed" | "knowledge_refreshed";
    refLabel: string;           // Human-readable label for the node
    refUrl: string;             // Deep link into the source product
    refMetadata: Record<string, unknown>;
  };
}
```

### 6.3 NestFleet Lineage Integration

New `LineageNodeType` added: `external_ref`

```typescript
// In types.ts — extend LineageNodeType union
type LineageNodeType = ... | "external_ref";
```

External ref nodes render distinctly in the graph:
- **Icon:** Globe or external-link icon
- **Border:** Purple dashed (matches the `branch` edge style)
- **Actor type:** `system` (since the action originated in another product)
- **Click behavior:** Opens the `refUrl` in a new tab (deep link to DocuGardener)
- **Graph placement:** Satellite treatment (dashed border, reduced opacity) — these are context nodes, not core flow nodes

### 6.4 DocuGardener Timeline Integration

DocuGardener's document history timeline gains an `external_ref` entry type:
- Shows as "NestFleet: Gap detected from case #1234" or "NestFleet: 3 cases deflected by this update"
- Links back to NestFleet case detail

### 6.5 Edge Rules

External ref nodes connect to the lineage graph via:
- **Doc gap:** Edge from the `triage` node to the `external_ref` node (the gap was detected during triage)
- **Doc update proposed:** Edge from the `external_ref` node to any `knowledge_refresh` node on the same case
- **Deflection:** Edge from the `auto_reply` or `resolved` node to the `external_ref` attribution node

---

## 7. Integration Point 6: Unified Notifications

**Direction:** Bidirectional
**Trigger:** A cross-product event that a user in the other product should be aware of.

### 7.1 Concept

Users logged into the NestFleet console should see relevant DocuGardener notifications in their notification feed (and vice versa). This leverages the shared PlatformCloud notification system.

### 7.2 Notification Routing

```
┌─────────────┐    bridge event    ┌───────────────────┐    notification    ┌─────────────┐
│  Product A  │ ──────────────────▶│  PlatformCloud    │ ──────────────────▶│  Product B  │
│  (source)   │                    │  Notification Svc │                    │  (target)   │
└─────────────┘                    └───────────────────┘                    └─────────────┘
```

### 7.3 Cross-Product Notification Types

| Source | Notification | Target Audience | Priority |
|--------|-------------|-----------------|----------|
| NestFleet | "Doc gap detected: [topic]" | DocuGardener doc owners | Medium |
| NestFleet | "3 cases deflected by your doc update" | DocuGardener doc authors | Low (digest) |
| DocuGardener | "Doc update proposed for [document]" | NestFleet support leads | Medium |
| DocuGardener | "Doc published: [document] — knowledge base refreshing" | NestFleet operators | Low |
| DocuGardener | "Review requested: [proposal] needs support team input" | NestFleet operators with `reviewer` role | High |

### 7.4 Notification Schema

```typescript
interface CrossProductNotification {
  notificationId: string;
  tenantId: string;
  sourceProduct: "nestfleet" | "docugardener";
  targetProduct: "nestfleet" | "docugardener";
  occurredAt: string;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  actionUrl: string;           // Deep link into the source product
  targetRoles: string[];       // PlatformCloud roles that should see this
  targetUserIds?: string[];    // Specific users (optional override)
  groupKey?: string;           // For digest grouping (e.g., daily deflection summary)
  expiresAt?: string;          // Auto-dismiss after this time
}
```

### 7.5 Delivery Channels

| Channel | Behavior |
|---------|----------|
| **Console feed** | Appears in the unified notification bell. Prefixed with product badge: `[DG]` or `[NF]`. |
| **Email digest** | Low-priority notifications batched into a daily digest. Medium/high sent immediately. |
| **Webhook** | If the tenant has configured Slack/Teams/Discord webhooks, cross-product notifications are forwarded with source context. |

### 7.6 Notification Preferences

Users can configure per-product notification preferences in PlatformCloud settings:
- "Receive DocuGardener notifications in NestFleet console" (on/off)
- "Receive NestFleet notifications in DocuGardener console" (on/off)
- Per-type muting (e.g., mute deflection digests but keep proposal alerts)

---

## 8. Shared Data Model

### 8.1 `bridge_events` Table (Audit Log)

```sql
CREATE TABLE bridge_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  event_type    TEXT NOT NULL,          -- e.g., "bridge.doc-gap.detected"
  source_product TEXT NOT NULL,         -- "nestfleet" | "docugardener"
  payload       JSONB NOT NULL,
  payload_hash  TEXT NOT NULL,          -- SHA-256 for dedup
  idempotency_key TEXT UNIQUE,          -- event_id from source
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed | expired
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  consumer_ack  JSONB,                 -- consumer response metadata
  retry_count   INT NOT NULL DEFAULT 0,
  max_retries   INT NOT NULL DEFAULT 3
);

CREATE INDEX idx_bridge_events_tenant_type ON bridge_events(tenant_id, event_type);
CREATE INDEX idx_bridge_events_status ON bridge_events(status) WHERE status = 'pending';
CREATE INDEX idx_bridge_events_created ON bridge_events(created_at);
```

### 8.2 `knowledge_updates` Table (NestFleet side)

```sql
CREATE TABLE knowledge_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  product_id      UUID NOT NULL,
  source          TEXT NOT NULL DEFAULT 'docugardener',
  proposal_id     TEXT,                 -- DocuGardener proposal ID
  document_path   TEXT NOT NULL,
  document_title  TEXT NOT NULL,
  change_type     TEXT NOT NULL,        -- create | update | deprecate
  summary         TEXT,
  status          TEXT NOT NULL DEFAULT 'proposed',  -- proposed | published | rejected
  published_url   TEXT,
  content_hash    TEXT,
  origin_case_ids TEXT[],              -- NestFleet case IDs
  bridge_event_id UUID REFERENCES bridge_events(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.3 `deflection_attributions` Table (DocuGardener side)

```sql
CREATE TABLE deflection_attributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  case_id         TEXT NOT NULL,        -- NestFleet case ID
  deflection_type TEXT NOT NULL,        -- auto_reply | self_service
  document_path   TEXT NOT NULL,
  proposal_id     TEXT,
  similarity_score NUMERIC(4,3) NOT NULL,
  cost_saved_usd  NUMERIC(10,2),
  bridge_event_id UUID REFERENCES bridge_events(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deflection_attr_tenant ON deflection_attributions(tenant_id);
CREATE INDEX idx_deflection_attr_proposal ON deflection_attributions(proposal_id);
```

---

## 9. Error Handling & Resilience

| Failure Mode | Handling |
|-------------|----------|
| **Consumer down** | pg-boss retains events in queue. Delivered on next poll (default: 30s). Max retention: 7 days. |
| **Event processing fails** | Retry with exponential backoff (1s, 4s, 16s). After `max_retries`, status → `failed`, alert sent to PlatformCloud admin. |
| **Duplicate event** | `idempotency_key` UNIQUE constraint rejects duplicates at the DB level. Consumer checks `bridge_events` before processing. |
| **Schema mismatch** | Events include a `schemaVersion` field. Consumers validate against their supported versions. Unknown versions are logged and skipped (no crash). |
| **One product uninstalled** | Bridge events for the missing product accumulate with `pending` status. After 7 days, auto-expired. No impact on the remaining product. |

---

## 10. Security & Access Control

| Concern | Approach |
|---------|----------|
| **Tenant isolation** | All bridge queries include `WHERE tenant_id = $1`. Row-level security (RLS) enforced at DB level. |
| **Product authorization** | Bridge events are only accepted from authenticated product instances. PlatformCloud issues per-product API keys scoped to `bridge.*` topics. |
| **PII in events** | Events should not contain customer PII. `relevantSnippets` in doc gap signals are sanitized (PII redacted by the triage agent before emission). |
| **Deep link tokens** | `actionUrl` and `refUrl` fields use short-lived tokens (15-minute TTL) that resolve to authenticated sessions in the target product. |

---

## 11. Rollout Plan

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Phase 0** | Shared `bridge_events` table + pg-boss topics. No consumers. Events logged for observability. | Week 1 |
| **Phase 1** | Integration Point 1 (Doc Gap Signal) + Integration Point 6 (Unified Notifications — gap alerts only). | Weeks 2–3 |
| **Phase 2** | Integration Points 2 + 3 (Doc Update Proposal + Knowledge Refresh). End-to-end gap-to-refresh loop. | Weeks 4–6 |
| **Phase 3** | Integration Point 4 (Deflection Metric) + ROI dashboard. | Weeks 7–8 |
| **Phase 4** | Integration Point 5 (Shared Lineage) — external ref nodes in both products' UIs. | Weeks 9–10 |
| **Phase 5** | Full notification matrix + preference UI + email digests. | Weeks 11–12 |

---

## 12. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gap-to-proposal latency | < 1 hour | Time from `bridge.doc-gap.detected` to `bridge.doc-update.proposed` |
| Proposal-to-publish latency | < 48 hours | Time from proposal to published (includes human review) |
| RAG re-index latency | < 2 minutes (single doc) | Time from `bridge.doc-update.published` to NestFleet vector store updated |
| Deflection attribution accuracy | > 90% precision | Spot-check sample of attributed deflections monthly |
| Bridge event delivery rate | > 99.9% | `delivered / (delivered + failed)` over 30-day window |
| Cross-sell influence | 30% of single-product customers adopt the suite within 6 months | Tracked via PlatformCloud billing |

---

## 13. Open Questions

- [ ] Should bridge events use pg-boss (already in stack) or a dedicated message broker (NATS/Redis Streams) for lower latency?
- [ ] Should DocuGardener's proposal diff be embedded in the event payload or always fetched via `diffPreviewUrl`?
- [ ] Should deflection attribution run as a batch job (nightly) or real-time (on case resolution)?
- [ ] Should the `external_ref` lineage node type support inline previews (hover card with doc summary) or always link out?
- [ ] What is the PII redaction strategy for `relevantSnippets`? LLM-based or regex-based?
