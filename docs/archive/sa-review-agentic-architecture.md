# SA Review: NestFleet Agentic Architecture (V2 / Phase 2)

**Reviewer:** SA / AI Ops SME
**Date:** 2026-03-18
**Scope:** Existing agentic flow implementation + Phase 2 agentic engine design (`docs/phase2-agentic-engine-design.md`, `docs/architecture-decisions.md` ADR-022–029, `src/agents/`, `src/workers/`)

---

## TL;DR

The architecture is **fundamentally sound** — the core decisions (control plane owns state, agents as pure functions, Zod-first structured output, pg-boss for transactionality, static tool sets) are the right ones for a governed agentic system at this stage. The documentation is unusually complete for an early-stage product.

That said, there are **seven structural concerns** to address before the system handles real production volume. Two are high-severity.

---

## Strengths

**State ownership clarity.** ADR-004 + ADR-023 are correctly reasoned. Agents carry no state; workers own the transition. This is the right separation for a system that needs human approvals, retries, and audit trails.

**Compile-time tool boundaries.** `TOOL_SETS_BY_ACTION_TYPE` as a static constant (ADR-024) is exactly the right defense. Dynamic tool registries are a common mistake in agentic systems; avoided here.

**Structured output as a hard gate.** Zod-first via `generateObject()` means malformed LLM output can never reach a write path. Non-negotiable for a governed system — implemented correctly.

**Evidence → abstain path.** The retrieval layer returning `abstain: true` before the LLM is ever called (not "call LLM and see if it abstains") is the correct design. Most systems get this backwards.

**Three-layer prompt injection defense.** Strip → XML delimit → Zod gate. Solid. The explicit XML tag instruction in the system prompt aligns with Anthropic's guidance.

---

## Concerns

### #1 — HIGH: No Enforced State Machine Transitions (Ghost States Risk)

**What I see:** The lifecycle doc (`case-and-change-lifecycle.md`) defines 10 case states with explicit allowed exits. The implementation calls `updateCase(caseId, { status: nextStatus })` directly in each worker with no domain-layer guard.

**The risk:** Any worker can call `updateCase()` with any status string — there is no compile-time or runtime rejection of illegal transitions. A bug in a new worker could put a case directly from `enriching → in-change`, bypassing triage. At scale this produces zombie cases in states that should be unreachable.

**Concrete reference:** `src/workers/steward-worker.ts:225` calls `updateCase(caseId, { status: "in-change" })` even though the lifecycle doc requires `in-change` entry to come from `triaged` state. Nothing enforces this.

**Recommendation:** Introduce a `CaseStateMachine.transition(caseId, from, to)` function that:
- Takes the expected `from` state as a parameter
- Reads current state from DB
- Validates the `from → to` pair against an allowed-transitions map
- Throws `InvalidStateTransitionError` if invalid
- Executes `updateCase()` only if valid

One-day implementation that eliminates an entire class of data integrity bugs.

---

### #2 — HIGH: State Transition and Job Dispatch Are Not Atomic

**What I see** in `src/workers/steward-worker.ts:225–243`:
```typescript
// Step 7: update case state
await updateCase(caseId, { status: decision.nextStatus, ... })

// Step 7a: dispatch follow-on job — marked "non-fatal"
try {
  await dispatch({ actionType: "auto_reply", ... })
} catch (dispatchErr) {
  logger.error({ dispatchErr, caseId }, "auto_reply dispatch failed (non-fatal)")
}
```

**The risk:** If `updateCase` succeeds and `dispatch` fails, the case is permanently stuck in `in-resolution` with no active job to advance it. The catch makes this a **silent stuck state** — no alert, no human notification, just a log entry. ADR-025 explicitly names "transactional enqueue" as a key pg-boss benefit, but this benefit is only realized if the state transition and enqueue happen inside the same PG transaction. `dispatcher.ts:119` calls `boss.send()` independently.

**Recommendation:** Use pg-boss's transaction-aware `send` method. pg-boss v7+ supports passing an existing db transaction connection to `boss.send()`. Wrap `updateCase + dispatch` in a single PG transaction, passing the transaction handle to both. The pg-boss docs call this pattern "transactional send."

---

### #3 — MEDIUM: Outage Routing Fallback Incomplete (ADR-029 Gap)

**Spec says (ADR-029):** "On LLM failure OR abstain → immediately escalate to ALL leads via critical notification."

**What I see** in `src/workers/steward-worker.ts:177–181`:
```typescript
} catch (err) {
  // Policy violation or abstain — still route to awaiting-lead
  logger.warn({ err, caseId }, "Outage routing agent failed — escalating to lead regardless")
}
```

The critical notification (step 9) only fires for `caseSeverity === "critical"`. An `outage_report` case classified as `high` by triage will fail the outage routing agent, route to `awaiting-lead`, and **never trigger an immediate escalation notification** despite being an active outage.

Additionally, step 9 notifies only `support_lead`. ADR-029 says "all leads" — `product_lead` and `change_lead` are not notified.

**Recommendation:** In the outage routing catch block, add an immediate critical notification to all three leads regardless of `caseSeverity` when `caseType === "outage_report"`.

---

### #4 — MEDIUM: Two-Phase LLM Design Creates Hidden Token and Latency Budget Overrun

**What I see** in `src/agents/run-agent.ts`: Every agent runs two sequential LLM calls:
- Phase 1: `generateText` (gather evidence via tools, up to `maxSteps=3`)
- Phase 2: `generateObject` (structured output from phase-1 context)

**Concerns:**

1. **Actual token consumption is ~2× the budget check.** The pre-call estimate checks `estimateTokens(system + prompt)`. Phase 2 `synthesisPrompt` (lines 171–175) is `prompt + toolResultContext + phase1.text + "produce JSON"`. For `change_prep` (10K budget), Phase 2 alone could hit 15K+ input tokens after tool results. The budget check doesn't account for this.

2. **Latency compounds.** `triage` has a P50=5s SLO. Two sequential model calls (with retry × 2 on each) could easily push P95 past the 15s timeout. The timeout in `TIMEOUTS_MS` wraps the entire two-phase pair, which is correct, but the SLO targets don't reflect two-round-trip reality.

3. **Tool results injected twice.** Tool call results appear in Phase 1's conversation history AND are re-injected into `synthesisPrompt` (lines 166–169). The model sees duplicated evidence.

**Recommendation:** Evaluate whether Phase 2 is necessary for simpler agents (triage, auto_reply) — `generateObject` with `mode:'json'` and inline tools may work for supported providers. For complex agents (change_prep, pr_draft_prep), the two-phase approach is justified. Consider separate per-phase token budgets per action type.

---

### #5 — MEDIUM: Severity Enum Mismatch Between Domain Model and Schema

**Domain model and lifecycle docs** use: `critical`, `high`, `normal`, `low`

**`src/agents/impl/triage.ts:33` Zod schema** uses: `z.enum(["critical", "high", "medium", "low"])`

**`src/agents/impl/triage.ts:75` system prompt** uses: `medium` (matching schema, not domain model)

**The risk:** The DB likely stores `normal` (consistent with lifecycle doc) while the agent outputs `medium`. The translation between agent output and case severity fields must be explicit, or the case DB and triage output use different vocabularies. This breaks "all normal severity cases" queries silently.

**Recommendation:** Standardize on one enum. The domain model says `normal` — the schema should match. If `medium` is kept in the LLM prompt for naturalness, add an explicit mapping in the worker before writing to DB.

---

### #6 — MEDIUM: outage_routing Bypasses Its Own Queue

**What I see:** `outage_routing` has its own queue with `concurrency: 5, retryDelaySeconds: 3` (tighter than other queues). But `src/workers/steward-worker.ts:162–181` calls `runOutageRoutingAgent()` directly and inline — not via `dispatch()`.

**The risk:**
- Running inline within `StewardWorker` means outage routing competes for the same execution slot as `known_issue_match` logic.
- The 3s retry semantics of the `outage_routing` queue never apply — failures fall through immediately to the catch block.
- The P95=12s SLO is unmeasurable since the outage routing span is a child of the steward span, not an independent measurement.

**Recommendation:** For outage cases, dispatch `outage_routing` as a separate job. The steward worker transitions case to `awaiting-lead`, and a dedicated `OutageRoutingWorker` handles routing logic and fires escalation notification. This respects the designed queue separation and makes the SLO independently observable.

---

### #7 — LOW: Signal Text Sourcing Is Fragile

**What I see** in `src/workers/steward-worker.ts:108–113`:
```typescript
const signalText =
  (payload["signalText"] as string | undefined) ??
  (caseRow.triage_output?.["reasoning"] as string | undefined) ??
  caseRow.title ??
  ""
```

**The risk:** `triage_output?.["reasoning"]` is the agent's *reasoning about the triage*, not the original customer signal text. Using it as the signal for known issue matching means the matcher is operating on the triage agent's summary, not the customer's words. The `""` fallback produces a near-zero-quality embedding and a misleading `knownIssueMatched: false` result with no warning.

**Recommendation:** Store the original normalized signal text on the case record at ingestion time (e.g., `cases.signal_text`). Workers retrieve it from there rather than reconstructing it from downstream artifacts.

---

## Summary Table

| # | Concern | Severity | Effort |
|---|---------|----------|--------|
| 1 | No enforced state transition guards | HIGH | S (~1 day) |
| 2 | State transition + dispatch not atomic | HIGH | S (~1 day) |
| 3 | Outage routing fallback incomplete (ADR-029 gap) | MEDIUM | S (~hours) |
| 4 | Two-phase token/latency budget reality | MEDIUM | M (~days) |
| 5 | Severity enum mismatch (normal vs medium) | MEDIUM | S (~hours) |
| 6 | outage_routing bypasses its own queue | MEDIUM | M (~days) |
| 7 | Signal text sourcing fragile | LOW | S (~hours) |

---

## Architectural Gaps Not Yet Designed (Noted for Future Phases)

1. **No worker startup registration orchestration.** Nothing ensures all 6 workers are registered before the first webhook lands. A race at startup could dispatch jobs to unregistered queues (pg-boss will buffer, but observable lag during cold start).

2. **No cross-agent flow correlation entity.** The `triage → known_issue_match → auto_reply` chain is reconstructable via audit records but requires JOIN queries across `agent_runs`. A `flow_run_id` on `agent_runs` (grouping related jobs into a named flow) would make end-to-end flow observability direct rather than reconstructed.

3. **Governed Learning Loop (system-architecture.md §5.15) has no Phase 2 delivery story.** Fine for v1 pilot — flagging it as a significant future surface that needs its own design document before implementation begins.
