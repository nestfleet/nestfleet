# SDLC Is Dead — Strategy Spikes for NestFleet

> **Source:** ["The SDLC is Dead" by Boris Tane](https://boristane.com/blog/the-software-development-lifecycle-is-dead/)
> **Date reviewed:** 2026-03-27

---

## Executive Summary

The article argues AI agents are **collapsing the SDLC** from a wide sequential loop (Requirements → Design → Code → Test → Review → Deploy → Monitor) into a tight cycle: **Intent → Agent → Observe → Repeat.** The key surviving asset isn't *process*. It's **context** and **observability**.

For NestFleet, this is a **strategic tailwind**, not a threat. NestFleet is exactly the governed context + operations layer this new paradigm requires. However, the temptation to expand scope (Jira, all channels, full observability) must be resisted. The spikes below are filtered for **market pull** over intellectual elegance.

---

## Strategy Spikes

| # | Spike | Priority | Rationale |
|---|-------|----------|-----------|
| 1 | [Observability Bridge (MVP Scope)](#spike-1-observability-bridge-mvp-scope) | 🔴 **P0** | Strongest defensible moat; article's clearest market signal |
| 2 | [Approval Friction Reduction](#spike-2-approval-friction-reduction) | 🟠 **P1** | Required to stay relevant as agent autonomy rises |
| 3 | [Marketing: Re-frame as "Context Engine"](#spike-3-marketing-re-frame-as-context-engine) | 🟠 **P1** | Positioning is ahead of the market shift; capture it first |
| 4 | [Feature Flag Awareness](#spike-4-feature-flag-awareness) | 🟡 **P2** | Needed as deploy/release decouple; no market demand yet |
| 5 | [PR-less Change Flow](#spike-5-pr-less-change-flow) | 🔵 **P3** | Interesting direction; premature for our beachhead market |

---

## Spike Detail

### Spike 1: Observability Bridge (MVP Scope)

**Priority: 🔴 P0 — Must spike in next quarter**

**What the article says:** "Observability is the last stage standing. The future is closed-loop systems where telemetry data becomes context for the agent that shipped the code."

**What NestFleet has:** The `NestFleet ↔ DocuGardener` bridge already proves a non-customer signal (a doc drift scan) can trigger a Case → CR → PR → close loop. The pattern is proven internally.

**The spike:** Extend the Ingress Pipeline to accept **one well-defined observability signal type** — specifically, an error-rate / uptime alert from Sentry or Betterstack. NOT Datadog. NOT OpenTelemetry. ONE integration.

**Scope guard:**
- Do **not** build a generic "alert router." Build a single webhook handler for Sentry Issue alerts.
- Treat identically to `source_type=scheduled`. Same Case/CR pipeline. No new UI.
- The spike delivers: incident → NestFleet Case → Steward triages → CR with Product Memory context → human approves.
- **Does NOT include:** auto-deploying a fix, rolling back, or any autonomous production action.

**Market justification:** Every small B2B SaaS team uses Sentry. Sentry → NestFleet Case (with triage + CR) is a 10x improvement over Sentry → GitHub Issue → Jira with zero new infra.

---

### Spike 2: Approval Friction Reduction

**Priority: 🟠 P1 — Design decision; spike within 2 quarters**

**What the article says:** Human PR review is a bottleneck. The alternative is adversarial agent verification + exception-based human review.

**The tension with NestFleet:** Our product vision insists on human approval for medium/high-risk changes. The article calls this "luddism." Both are right depending on the customer.

**The spike:** Make the approval step **zero-friction for low-risk CRs**:
1. One-tap approval via Slack message (not a console login).
2. Agent-generated "Risk Summary" card with a confidence score surfaced at the approval step — decide in 10 seconds, not 10 minutes.
3. **Do NOT** pursue adversarial agent-vs-agent auto-verification. That requires the PR-less flow (Spike 5) and is premature.

**Scope guard:** This spike is about the **UX of the approval gate**, not removing it. Our beachhead needs the gate; we just need to make it instant.

---

### Spike 3: Marketing — Re-frame as "Context Engine"

**Priority: 🟠 P1 — Strategic; incorporate into GTM next content cycle**

**What the article says:** "The new skill is context engineering. The SDLC is dead." The tool that wins best captures, organizes, and serves context to agents.

**The opportunity:** NestFleet's Product Memory layer is being built for exactly this, but we're marketing NestFleet as a "support tool." This leaves positioning on the table.

**The spike:** Revise `go-to-market-strategy.md` to add a fourth narrative pillar:
> **"Context-Native Operations"** — "When your dev tools, support signals, and docs live in the same product memory, your AI agents act on ground truth — not guesswork."

**Scope guard:** Messaging spike only. No new features required.

---

### Spike 4: Feature Flag Awareness

**Priority: 🟡 P2 — Parking lot; revisit in 6+ months**

**What the article says:** Agents naturally decouple deployment from release via feature flags. "Code gets deployed continuously, every change lands in production behind a gate."

**Why it matters later:** As the CR-to-PR flow matures, the NestFleet Case should track *flag state*, not just *PR merged*.

**Why it's P2:** Our beachhead customers are small teams that often skip feature flags entirely. Relevant only when Spike 1 proves out and we move up-market.

**Scope guard:** No integration work. Spike = a design document for flag-aware Change lifecycle targeting the next market segment.

---

### Spike 5: PR-less Change Flow

**Priority: 🔵 P3 — Watch, don't build**

**What the article says:** "Agents commit to main. Automated checks validate. It ships automatically. A human only gets involved when the system genuinely doesn't know what to do."

**Why P3:** Our beachhead relies on the PR as an audit trail and DocuGardener CI as the quality gate. This is not a market demand today.

**Scope guard:** Monitor. Follow how nominal.dev and similar products evolve. Revisit when adversarial agent verification has a market reference implementation.

---

## What We Are Explicitly Not Adding to Scope

> [!CAUTION]
> These are interesting but contradict our strategic discipline of not boiling the ocean.

| Temptation | Why We Decline |
|---|---|
| **Jira / Confluence integration** | Our ICP (lean, founder-led) lives in GitHub Issues. Adding Jira adds surface without ICP fit. |
| **Slack / Teams as primary inbound channel** | Slack is for *notifications*. Full inbound case channel duplicates email/chat work. |
| **Generic observability (OTel, Prometheus, Datadog)** | Too many options, too little signal at our stage. One integration (Sentry) proves the pattern. |
| **Full ITSM change management (CAB boards, ITIL)** | Explicitly excluded from product vision. We are the anti-ServiceNow. |

---

## Recommended Next Actions

| Action | Spike | Effort |
|---|---|---|
| Create `docs/specs/observability-bridge-sentry.md` spec | Spike 1 (P0) | Next sprint |
| Update `docs/business/go-to-market-strategy.md` with "Context-Native" pillar | Spike 3 (P1) | 1 writing session |
| Add "Slack-native approval UX" as design task in backlog | Spike 2 (P1) | Backlog entry |
| Create `docs/business/strategic-watch-items.md` for Spikes 4 & 5 | Spikes 4–5 | 30 min |
