# Anthropic Managed Agents — Fit Analysis for NestFleet

> **Author:** SA/PO review
> **Date:** 2026-04-09
> **Status:** Analysis complete — no implementation decision yet
> **Approach:** Honest evaluation. Goal is to simplify, not to adopt.

---

## 1. Executive summary

Anthropic's Managed Agents is a cloud-hosted agent runtime: you define an agent
(model + system prompt + tools + MCP servers), an environment (container template),
and start sessions. Anthropic provides the harness (agent loop, tool routing, error
recovery), sandbox (code execution), and session persistence (append-only event log).

**The honest verdict for NestFleet:** Managed Agents solves problems NestFleet does
not have, and does not solve the problems NestFleet actually has. It is a general-purpose
agent runtime designed for long-running, code-heavy autonomous tasks. NestFleet's agents
are short-lived, schema-constrained, read-only classification/generation functions with
deterministic orchestration. The overlap is narrow. Adopting it would add vendor lock-in
and runtime cost without removing meaningful complexity from the codebase.

There are **two narrow areas** where the underlying ideas (not the product itself)
could genuinely improve NestFleet. These are discussed in §6.

---

## 2. What Anthropic Managed Agents provides

| Capability | Description |
|------------|-------------|
| **Agent harness** | Built-in agent loop: decides when to call tools, manages context, recovers from errors. Prompt caching, compaction. |
| **Sandbox** | Containerised code execution environment. Pre-installed packages, network access rules, mounted files. Bash, file ops, web search built in. |
| **Sessions** | Append-only event log. Persistent across interactions. Queryable. SSE streaming. Checkpoint/resume. |
| **MCP integration** | External tool providers connected via MCP servers. OAuth tokens stored in secure vault, never exposed to sandbox. |
| **Multi-agent** | Research preview: agents can spawn and direct other agents. |
| **Outcomes** | Research preview: define success criteria, self-evaluation. |
| **Memory** | Research preview: persistent agent memory across sessions. |

**Pricing:** Standard Claude API token rates + **$0.08 per session-hour** active runtime + **$10 per 1,000 web searches**.

Source: [Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview),
[Engineering blog](https://www.anthropic.com/engineering/managed-agents)

---

## 3. NestFleet's current agent architecture (what we are evaluating against)

### 3.1 Agent inventory

| Agent | Purpose | LLM calls | Duration | Tools | Output |
|-------|---------|-----------|----------|-------|--------|
| Triage | Classify severity, category, routing, labels | 1 call (single-phase) | 3–10s | `lookupKnownIssue`, `lookupSeverityPolicy` | Structured JSON (Zod schema) |
| Auto-reply | Draft grounded customer response | 1 call (single-phase) | 5–15s | `lookupFaq`, `lookupKnownIssue` | Structured JSON |
| Known-issue match | Match case to known issues | 2 calls (two-phase) | 5–15s | `lookupKnownIssue`, `searchSimilarCases` | Structured JSON |
| Change prep | Analyse CR scope, create GitHub issue | 2 calls (two-phase) | 15–40s | `lookupSpec`, `lookupArchitecture`, `lookupChangelog` | Structured JSON |
| PR draft prep | Generate code changes + PR | 2 calls (two-phase) | 30–90s | `lookupChangeRequest`, `lookupGithubContext`, `lookupSpec` | Structured JSON |
| Outage routing | Route critical incidents | 2 calls (two-phase) | 5–12s | `lookupRunbook`, `lookupTeamRouting`, `lookupKnownIssue` | Structured JSON |
| Knowledge capture | Extract FAQ from resolved case | 1 call (single-phase) | 5–15s | `lookupFaq`, `searchSimilarCases` | Structured JSON |

**Key characteristics:**
- Every agent is a **pure async function** — no persistent state, no file system, no code execution
- Every output is **structured JSON** validated against a Zod schema
- Maximum duration: ~90 seconds (PR draft prep). Typical: 5–15 seconds.
- All tools are **read-only PostgreSQL lookups** (FTS + pgvector). No side effects.
- Orchestration is **deterministic**: `steward-worker.ts` is a hand-coded decision tree, not an LLM routing decision

### 3.2 What NestFleet builds itself

| Component | Lines of custom code | What it does |
|-----------|---------------------|--------------|
| Agent harness | `run-agent.ts` (~370 lines) | Two-phase execution, timeout, retry with budget doubling, OTel spans |
| Orchestration | `steward-worker.ts` (~400 lines) | Routing decision tree, sidecar CR, parallel dispatch |
| Atomic dispatch | `transactional-dispatch.ts` (~160 lines) | `SELECT FOR UPDATE` + case transition + pg-boss insert in one TX |
| Tool binding | `tool-sets.ts` (~80 lines) | Hardcoded action-type → tool-set mapping |
| 11 tools | `tools/*.ts` (~800 lines total) | PostgreSQL FTS + pgvector lookups, all read-only |
| Token budgets | `budget.ts` + `types.ts` (~200 lines) | Monthly soft/hard limits per action type per product |
| Post-validation | Per-worker (~100 lines each) | 4-gate auto-send, severity overrides, sensitivity scan |
| Prompt management | Inline in each `impl/*.ts` | Hardcoded system prompts with heuristic instructions |
| Error hierarchy | `types.ts` (~80 lines) | `AgentError`, `PolicyViolationError`, `StructuredOutputError`, etc. |
| Abstain logic | Per-agent (~30 lines each) | Evidence pack abstain → soft pass or hard throw |

**Total custom agent infrastructure: ~2,500 lines.**

### 3.3 What NestFleet delegates to libraries

| Library | What it handles |
|---------|----------------|
| **Vercel AI SDK** | `generateText`, `generateObject`, provider adapters, tool schema generation, structured output JSON mode |
| **pg-boss** | Queue management, job dedup (singleton keys), retry scheduling, worker registration |
| **Zod** | Output schema definition and validation |
| **pgvector** | Vector similarity search |
| **PostgreSQL FTS** | Full-text search across all tools |
| **OpenTelemetry** | Distributed tracing |

---

## 4. Capability-by-capability comparison

### 4.1 What Managed Agents provides that NestFleet does NOT need

| MA capability | NestFleet reality | Assessment |
|---------------|-------------------|------------|
| **Sandbox (code execution)** | NestFleet agents never execute code. They classify, generate text, and produce structured JSON. The only agent that produces code (PR draft prep) does so as output text, not execution. | **No value.** Adding a sandbox would increase cost and attack surface for zero benefit. |
| **Long-running sessions (hours)** | Longest agent: ~90s (PR draft prep). Typical: 5–15s. No agent needs to persist state across multiple interactions. | **No value.** NestFleet agents are fire-and-forget tasks, not interactive sessions. |
| **Web search + fetch** | NestFleet agents are grounded in the product's KB (PostgreSQL), not the open web. Web search would introduce hallucination risk, not reduce it. | **Actively harmful** for NestFleet's trust model. Source tiering (T1/T2/T3) depends on knowing the provenance of every piece of evidence. |
| **File operations (read/write/edit)** | Agents read from PostgreSQL (via tools). No file system interaction. | **No value.** |
| **Bash execution** | No agent needs shell access. | **No value.** |
| **SSE streaming of agent output** | NestFleet processes agent results server-side (update case, send email, post to GitHub). The operator never watches an agent think in real time. | **No value.** The Console shows the completed result, not the process. |
| **Multi-agent coordination** | NestFleet's agent graph is deterministic: triage → steward → [auto-reply \| change-prep → PR-draft]. The steward is a hand-coded decision tree, not an LLM that delegates to sub-agents. This is deliberate — the routing logic must be auditable and deterministic. | **Actively harmful.** Replacing deterministic routing with LLM-based delegation would degrade auditability and introduce non-deterministic case routing. |

### 4.2 What Managed Agents provides that NestFleet ALREADY has

| MA capability | NestFleet equivalent | Assessment |
|---------------|---------------------|------------|
| **Agent harness (tool routing, error recovery)** | `run-agent.ts` + Vercel AI SDK. Custom but working. ~370 lines. | **No improvement.** MA harness is more general but NestFleet's is more specific (two-phase strategy, budget doubling retry, abstain logic). Replacing it would lose the two-phase pattern and domain-specific error handling. |
| **MCP tool integration** | NestFleet tools are PostgreSQL-backed factory functions. They are not MCP servers. | **Migration cost > benefit.** Converting 11 tools to MCP would add network hops, latency, and a protocol layer for tools that are currently sub-millisecond DB queries. |
| **Session persistence** | pg-boss job records + `agent_runs` table + `audit_events`. Every agent run is logged with input, output, schema version, token usage, duration. | **No improvement.** NestFleet's audit trail is more structured (typed events) than MA's append-only log. |
| **Prompt caching** | Vercel AI SDK supports prompt caching natively for Anthropic models. | **Parity.** No improvement from MA. |
| **Context compaction** | NestFleet agents have tight token budgets (6K–20K input). They don't need compaction — the input is already curated by the evidence pack. | **No value.** Compaction is for long sessions with growing context. NestFleet agents are stateless single-shot. |

### 4.3 What Managed Agents provides that NestFleet COULD benefit from

| MA capability | NestFleet gap | Real benefit | Cost |
|---------------|---------------|--------------|------|
| **Outcomes (define success criteria, self-evaluation)** | NestFleet has post-validation gates (4-gate auto-send) but no agent self-evaluation against defined success criteria. | Could improve severity calibration (58% accuracy). Agent could self-check: "Does my severity assignment match the defined criteria?" before finalising. | Research preview. Not GA. Vendor-locked. Can be replicated with a second LLM call + evaluation prompt. |
| **Memory (persistent across sessions)** | NestFleet has product memory (KB), but agents don't learn from their own past runs. Known-issue match is the closest — it checks historical patterns, but the agent itself doesn't improve. | Could improve triage calibration over time. "Last 10 cases with 'timeout' keyword were triaged High, not Normal." | Research preview. Not GA. Can be approximated by feeding triage corrections back as T3 memory chunks. |

---

## 5. Non-functional requirements evaluation

### 5.1 Vendor lock-in

| Dimension | Current NestFleet | With Managed Agents |
|-----------|-------------------|---------------------|
| **LLM provider** | Multi-provider via Vercel AI SDK (OpenAI, Anthropic, Google, Ollama) | **Anthropic only.** MA runs Claude. No provider choice. |
| **Runtime** | Self-hosted. Runs on any Linux box with Docker. | **Anthropic cloud only.** Sessions run in Anthropic's infrastructure. |
| **Data residency** | Customer data stays in customer's VPS. GDPR-clean. | **Data leaves customer infrastructure.** Signal text, case content, KB articles sent to Anthropic's runtime. Requires DPA with Anthropic. For NestFleet's regulated ICP: potentially a blocker. |
| **Exit strategy** | Switch LLM provider by changing one env var. | Rewrite all agents back to self-hosted. MA agent definitions (YAML + system prompts) are portable in theory, but the harness, tools, and session model are not. |

**Assessment:** NestFleet's multi-provider model is a competitive advantage over
Intercom/Zendesk (which are locked to OpenAI). Adopting MA would erase this advantage
and create the deepest possible vendor dependency — not just model, but runtime.

### 5.2 Cost

**Current NestFleet cost per case (5 agent calls, Gemini 2.5 Flash):**
```
~15,000 input tokens × $0.15/MTok = $0.00225
~5,000 output tokens × $0.60/MTok = $0.003
Total LLM: ~$0.005 per case
Infrastructure: $0 marginal (runs on customer's existing VPS)
```

**With Managed Agents (same 5 agent calls, Claude Sonnet):**
```
~15,000 input tokens × $3.00/MTok = $0.045
~5,000 output tokens × $15.00/MTok = $0.075
Runtime: ~60s active = $0.08/3600 × 60 = $0.0013
Total: ~$0.12 per case
```

**Cost increase: ~24×.** At 1,000 cases/month, that is $5/month (current) vs $120/month
(MA). At 10,000 cases/month: $50 vs $1,200.

Even using Claude Haiku via MA, the runtime surcharge ($0.08/hr) and the Anthropic-only
pricing make it structurally more expensive than multi-provider self-hosted.

### 5.3 Extendability

| Dimension | Current NestFleet | With Managed Agents |
|-----------|-------------------|---------------------|
| Adding a new agent | Create `impl/new-agent.ts`, add Zod schema, register in dispatcher. ~100 lines. | Create agent definition (YAML), configure tools, start session. Comparable effort. |
| Adding a new tool | Create `tools/new-tool.ts`, register in `tool-sets.ts`. ~50 lines. | Build MCP server or add built-in tool config. More overhead for DB-backed tools. |
| Custom orchestration logic | Edit `steward-worker.ts` decision tree. Full control. | Limited to what MA's harness supports. Custom routing requires multi-agent (research preview). |
| Custom post-validation | Edit worker code. 4-gate pattern is inline, fully transparent. | No equivalent. Would need to be implemented as a tool call or a post-session validation step. |
| Non-Anthropic model | Change env var or product DB config. | Not possible. |

---

## 6. What NestFleet can honestly learn from Managed Agents

Not from the product, but from the **architecture ideas** behind it.

### 6.1 ~~Idea: session event log for agent audit trail~~ — WITHDRAWN

**Re-assessed 2026-04-09.** NestFleet already provides substantial agent transparency:
- **Lineage graph** in Console shows every agent node with run ID, model, tokens, duration, outcome
- **Node Detail Panel** (click any lineage node) renders full `output_snapshot` JSON —
  including `evidenceRefs`, `reasoning`, `sourceTiers`, `confidenceScore`, labels
- **`agent_runs`** table stores `evidence_chunk_ids[]` (which KB chunks were retrieved)
  and `output_snapshot` (complete LLM structured output)

The gap is narrower than initially assessed: only *per-tool-call intermediate traces*
within two-phase agents (known-issue-match, change-prep, PR-draft-prep, outage-routing)
are not persisted — the phase 1 tool calls and their results are discarded after
synthesis. For single-phase agents (triage, auto-reply, knowledge-capture), the
existing lineage + output snapshot is sufficient.

**Downgraded to P3.** Only relevant for debugging two-phase agent quality issues.

### 6.2 Idea: agent definition as declarative config (adopt partially)

**Current NestFleet gap:** Each agent's system prompt, schema, tool set, and token budget
are scattered across 3–4 files: `impl/triage.ts` (prompt + schema), `tool-sets.ts`
(tools), `types.ts` (budget), `llm-provider.ts` (model tier). Adding a new agent
requires touching all four.

**MA's approach:** Agent = one definition (model + system prompt + tools + MCP servers).
YAML or API. Single source of truth.

**What NestFleet could do (without MA):** Merge the four parallel maps into one
`AGENT_REGISTRY`:

```typescript
const AGENT_REGISTRY: Record<ActionType, AgentDefinition> = {
  triage: {
    modelTier:     "fast",
    systemPrompt:  TRIAGE_SYSTEM_PROMPT,
    outputSchema:  triageOutputSchema,
    schemaVersion: "1.0",
    tools:         ["lookupKnownIssue", "lookupSeverityPolicy"],
    strategy:      "single-phase",
    tokenBudget:   { phase1In: 6000, phase1Out: 1500 },
    timeout:       90_000,
    postValidation: triagePostValidation,
  },
  // ...
}
```

**Honest value assessment (re-assessed 2026-04-09):**

Today, adding a new agent touches 4 files:
- `impl/new-agent.ts` — system prompt + schema + function (~120 lines)
- `types.ts` — `ActionType` union + `TOKEN_BUDGETS` entry (~6 lines)
- `tool-sets.ts` — `case` in switch (~5 lines)
- `run-agent.ts` — `TIMEOUTS_MS` entry (~1 line)

With the registry, it would be 2 files: `impl/new-agent.ts` + `registry.ts`.

| Benefit | Real? |
|---------|-------|
| Fewer files to touch | Yes, but marginal — 4 files to 2, saving ~12 lines |
| Self-documenting agent graph | **Yes, genuinely.** Today to answer "what tools does change_prep use, what's its timeout, what's its budget?" you grep 3 files. The registry is one table. For onboarding a new developer or auditing: real value. |
| Prevents config drift | Modest. The compiler already catches missing cases via exhaustive switch + `never` guard. The registry just makes inconsistency structurally impossible rather than compile-time caught. |
| Unlocks dynamic/configurable agents | **No — and this matters.** NestFleet agents are compile-time definitions with auditable schemas. A registry doesn't change this. Operator customisation already uses `product.agent_config`. |
| Reduces total LOC | No. ~15 lines across 3 files → ~15 lines in 1 registry file. Net: zero. |

**Verdict:** Valid code quality improvement. Self-documenting graph is the real win.
But savings are small (minutes per new agent, not hours) and compile-time checks already
prevent the worst failure mode. **Downgraded to P3 — do it when already refactoring the
agent layer for another reason, not as a standalone task.**

### 6.3 What NOT to adopt

| MA feature | Why not |
|------------|---------|
| MCP for internal tools | NestFleet's tools are sub-ms PostgreSQL queries. MCP adds HTTP + JSON-RPC overhead for zero benefit. MCP makes sense for external integrations (Jira, Linear), not for internal DB lookups. |
| Session model | NestFleet agents are stateless. Adding sessions adds complexity for a pattern that doesn't match the workload. |
| Cloud runtime | Data sovereignty is a competitive advantage. Sending support conversations to Anthropic's cloud is a regression, not an improvement. |
| Multi-agent delegation | Deterministic orchestration is an asset. The steward's decision tree is auditable. LLM-based delegation is not. |

---

## 7. Verdict matrix

| Question | Answer |
|----------|--------|
| Does MA solve a problem NestFleet has? | **Mostly no.** NestFleet's agents are short, structured, read-only. MA is for long, interactive, code-executing sessions. |
| Would MA reduce NestFleet's codebase complexity? | **No.** The ~2,500 lines of custom agent infrastructure are domain-specific (two-phase execution, abstain logic, token budgets, post-validation gates). MA doesn't have equivalents — they would need to be rebuilt on top of MA. |
| Would MA reduce ops complexity? | **No.** NestFleet agents run in the same process as the backend. MA would add a cloud dependency, network hops, and a new billing dimension. |
| Would MA improve agent quality? | **Maybe marginally** — the Outcomes feature (research preview) could help with severity calibration. But it is not GA, Anthropic-only, and replicable with a second LLM call. |
| Would MA create vendor lock-in? | **Yes, deeply.** Model + runtime + data residency all locked to Anthropic. NestFleet's current multi-provider model would be destroyed. |
| Would MA increase cost? | **Yes, ~24× per case.** Token pricing (Anthropic vs Gemini) + runtime surcharge. |
| Is there a future scenario where MA fits? | **Possibly for PR draft prep** — the one agent that could benefit from code execution (run tests, validate changes). But only if the customer already uses Claude and accepts cloud execution. This is a narrow, optional add-on — not a platform migration. |

---

## 8. Recommended actions

| Priority | Action | Effort | Source of idea |
|----------|--------|--------|---------------|
| P3 | Add `tool_trace` JSONB for two-phase agents only (phase 1 tool calls + results) | S | MA session event log concept (§6.1). Single-phase agents already have full visibility via lineage + output_snapshot. |
| P3 | Refactor agent configs into `AGENT_REGISTRY` (merge 4 parallel maps) | M | MA declarative agent config concept (§6.2). Real win is self-documenting graph. Do when already refactoring agent layer. |
| P3 | Evaluate MA for PR draft prep as an optional code-execution backend (not a platform replacement) | Spike | MA sandbox capability for the one agent that generates code |
| — | Do not adopt MA as the NestFleet agent runtime | — | Cost (24x), lock-in (model+runtime+data), data sovereignty regression, architecture mismatch |

---

## 9. Sources

- [Claude Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Claude Managed Agents blog announcement](https://claude.com/blog/claude-managed-agents)
- [FindSkill.ai pricing breakdown](https://findskill.ai/blog/claude-managed-agents-explained/)
- [The New Stack analysis](https://thenewstack.io/with-claude-managed-agents-anthropic-wants-to-run-your-ai-agents-for-you/)
