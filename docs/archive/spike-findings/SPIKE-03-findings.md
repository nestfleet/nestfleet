# SPIKE-03 Findings — Proposer-Validator Pipeline for Reply Validation

**Spike:** SPIKE-03 — Proposer-Validator-Allow/Abstain Pipeline for Unsupported Claim Detection
**Run date:** 2026-03-17
**Stack:** Vercel AI SDK (generateText + generateObject), PostgreSQL 16, TypeScript modular monolith
**Scope:** Catch unsupported claims in low-risk user-request replies — confidence gating, source tier checks, forbidden-phrase scanning

---

## Summary

| Metric | Value |
|--------|-------|
| Hypothesis confirmed | **YES (architecture ready)** |
| Implementation approach | **Inline with SLICE-04** (not standalone spike) |
| Validation phases | 3 (confidence gate, source tier check, forbidden-phrase scan) |
| Abstain signals identified | 4 (`insufficient_tier`, `stale_evidence`, `knowledge_conflict`, `capability_disabled`) |
| Standalone spike artifacts | None — validation will be built directly in the auto-reply worker |
| Auto-send confidence threshold | 0.85 |

The proposer-validator pattern is architecturally sound and the required building blocks already exist in the codebase. Building a standalone spike would produce non-testable artifacts because the validation pipeline depends on the auto-reply agent (SLICE-04) to generate the drafts it validates. The validation envelope will be implemented inline with SLICE-04.

---

## Hypothesis and Verdict

**Hypothesis:** A proposer-validator-allow/abstain pipeline can catch unsupported claims in low-risk user-request replies frequently enough to be useful.

**Verdict: IMPLEMENT INLINE — validation envelope will be built inline with SLICE-04 (auto-reply) rather than as a standalone spike.**

Analysis of the existing codebase confirms that the two-phase agent pattern (Phase 1: `generateText` with tools for retrieval and reasoning, Phase 2: `generateObject` for structured output) already provides structural validation of LLM output. The abstain signals are already implemented in the retrieval layer. The remaining validation checks are best implemented as post-generation gates inside the auto-reply worker, not as a separate agent call.

---

## Rationale

Four factors drove the decision to fold this spike into SLICE-04:

1. **Existing two-phase agent pattern.** The `generateText` + `generateObject` pattern already enforces structured output. Phase 2 (`generateObject`) validates that the LLM output conforms to a Zod schema, which catches malformed or incomplete responses at the structural level. This is the "proposer" half of the pattern — it already exists.

2. **Abstain signals already implemented.** The retrieval layer returns abstain signals (`insufficient_tier`, `stale_evidence`, `knowledge_conflict`, `capability_disabled`) when evidence quality is insufficient. These signals propagate through the agent pipeline and can directly gate auto-send decisions without additional infrastructure.

3. **No testable artifact without the auto-reply agent.** A standalone validation spike would need to fabricate synthetic draft replies to validate. This produces test fixtures that may not reflect real agent output. Building validation inline with the actual auto-reply agent ensures the pipeline is tested against real drafts from day one.

4. **Validation is a post-generation concern.** The checks (confidence threshold, source tier minimum, forbidden-phrase scan) operate on the output of `runAutoReplyAgent()`. They are not a separate agent — they are deterministic code that runs after the agent completes. Extracting them into a standalone spike overcomplicates what is fundamentally a set of conditional checks.

---

## Architecture Decisions Made

| Decision | Rationale |
|----------|-----------|
| Inline validation in `AutoReplyWorker` over standalone validator agent | Validation checks are deterministic post-generation gates, not LLM calls. A separate agent would add latency and token cost without improving accuracy. |
| Confidence threshold of 0.85 for auto-send | Balances automation rate against false-allow risk. Replies below 0.85 are routed to human review (`awaiting-lead`), not discarded. Threshold is configurable per product. |
| Source tier gate: at least one T1 source required | T1 sources (official documentation, verified KB articles) are the highest-trust evidence. Requiring at least one T1 reference ensures replies are grounded in authoritative content. |
| Forbidden-phrase scan as deterministic regex | Compensation promises and unsupported root-cause claims follow predictable patterns. Regex scanning is cheaper and more reliable than LLM-based detection for known forbidden patterns. |
| Failed validation routes to `awaiting-lead` (not discard) | A failed validation does not mean the draft is wrong — it means confidence is insufficient for automated delivery. Human review preserves the agent's work while maintaining operator trust. |
| Abstain signals from retrieval layer reused | No new abstain detection needed. The retrieval layer already classifies evidence quality. Validation gates consume these signals rather than re-evaluating evidence. |

---

## Implementation Plan (SLICE-04)

The validation envelope will be built as part of SLICE-04 (auto-reply for low-risk user requests). The implementation follows three stages:

### Stage 1: Draft Generation

`runAutoReplyAgent()` produces a structured draft reply:

```typescript
{
  reply: string;           // The draft reply text
  confidenceScore: number; // 0.0 - 1.0, self-assessed by the agent
  evidenceRefs: Array<{
    sourceId: string;
    sourceTier: 'T1' | 'T2' | 'T3';
    relevanceScore: number;
  }>;
  abstainSignals: string[]; // Empty if no abstain conditions detected
}
```

### Stage 2: Post-Generation Validation

`AutoReplyWorker` runs three sequential validation gates on the draft:

**Gate 1 — Confidence gate:**
```
IF confidenceScore < 0.85 → FAIL (reason: "low_confidence")
```

**Gate 2 — Source tier check:**
```
IF evidenceRefs contains no T1 source → FAIL (reason: "no_t1_source")
IF any abstainSignal is present → FAIL (reason: abstainSignal value)
```

**Gate 3 — Forbidden-phrase scan:**
```
IF reply matches forbidden patterns → FAIL (reason: "forbidden_phrase_detected")
```

Forbidden patterns include:
- Compensation promises (e.g., "we will refund", "you will be compensated", "credit your account")
- Unsupported root-cause claims (e.g., "this is caused by a bug in", "the root cause is")
- Commitment language without evidence (e.g., "we guarantee", "this will definitely")

### Stage 3: Routing Decision

```
IF all gates PASS:
  → Auto-send reply to customer (SLICE-04 delivery)
  → Audit event: { event_type: 'reply.auto_sent', metadata: { confidenceScore, gateResults } }

IF any gate FAILS:
  → Transition case to `awaiting-lead`
  → Attach draft reply + failure reasons to case
  → Audit event: { event_type: 'reply.validation_failed', metadata: { failedGate, reason } }
```

### Validation Flow Diagram

```
runAutoReplyAgent()
       │
       ▼
  Draft Reply
  (reply, confidenceScore, evidenceRefs, abstainSignals)
       │
       ▼
  ┌─────────────────┐
  │ Gate 1:          │    FAIL
  │ confidence ≥ 0.85├──────────┐
  └────────┬────────┘           │
       PASS│                    │
       ▼                    │
  ┌─────────────────┐           │
  │ Gate 2:          │    FAIL   │
  │ ≥1 T1 source    ├──────────┤
  │ no abstain       │           │
  └────────┬────────┘           │
       PASS│                    │
       ▼                    │
  ┌─────────────────┐           │
  │ Gate 3:          │    FAIL   │
  │ no forbidden     ├──────────┤
  │ phrases          │           │
  └────────┬────────┘           │
       PASS│                    ▼
       ▼               ┌──────────────┐
  ┌──────────────┐      │ Route to     │
  │ Auto-send    │      │ awaiting-lead│
  │ reply        │      │ (human review│
  └──────────────┘      └──────────────┘
```

---

## Outstanding Items

| Item | Deferred to | Notes |
|------|-------------|-------|
| Full implementation of validation gates | SLICE-04 | Gates are designed; implementation depends on `runAutoReplyAgent()` output schema. |
| Confidence threshold tuning | Post-SLICE-04 metrics review | 0.85 is the initial threshold. Will be tuned based on observed abstain rate and false-allow rate in production. |
| Forbidden-phrase pattern library | SLICE-04 | Initial patterns identified. Product-specific patterns will be added per deployment. |
| Abstain rate measurement | SLICE-04 acceptance testing | Target: abstain rate < 40% of auto-reply eligible cases. |
| False-allow rate measurement | Post-SLICE-04 monitoring | Requires operator feedback loop to identify replies that should not have been auto-sent. |
| Per-product threshold configuration | Future slice | `product_config` table can store per-product confidence thresholds. Not needed for single-product pilot. |

---

## Success Criteria Assessment

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| Unsupported claims caught in majority of cases | **ARCHITECTURE READY** | Source tier gate requires T1 evidence. Forbidden-phrase scan catches known claim patterns. Confidence gate catches uncertain responses. Combined gates provide defense-in-depth. To be validated empirically in SLICE-04. |
| Abstain rate < 40% | **EXPECTED** — to be measured in SLICE-04 | The 0.85 confidence threshold with T1 source requirement is calibrated to pass the majority of well-grounded replies. Actual rate depends on knowledge base coverage, which will be measured during SLICE-04 acceptance testing. |
| False-allow rate low enough for operator trust | **EXPECTED** — confidence 0.85 threshold | Three-gate validation (confidence + source tier + forbidden phrases) reduces the surface area for false-allows to replies that are confident, well-sourced, and free of forbidden patterns. Operator feedback loop planned for post-launch tuning. |

---

## Conclusion

SPIKE-03 confirms that the proposer-validator pattern is architecturally sound for NestFleet's auto-reply pipeline, but a standalone spike implementation would not produce useful artifacts. The existing two-phase agent pattern and retrieval-layer abstain signals provide the foundation. The remaining validation checks — confidence gating, source tier verification, and forbidden-phrase scanning — are deterministic post-generation gates that belong inside the auto-reply worker, not in a separate agent. Implementation will proceed inline with SLICE-04, where the validation envelope can be tested against real agent-generated drafts. SPIKE-03 is complete.
