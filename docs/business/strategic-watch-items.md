# NestFleet — Strategic Watch Items

> Items in this file are **not in scope** for any current planning cycle.
> They are tracked here to prevent premature implementation while keeping the signals visible.
> Review cadence: reassess each item quarterly. Promote to backlog only when a market reference implementation exists **and** the beachhead ICP explicitly requests it.
>
> Last reviewed: 2026-03-30 (SDLC strategy spikes + strategic pivot to AGPL SaaS-first)
>
> **Strategic pivot 2026-03-30:** NestFleet is pivoting to AGPL open-source + SaaS-first with direct Stripe billing. PlatformCloud is frozen. The NF-PIVOT decoupling phase is the active work (see `docs/active/active-backlog.md §12`). The watch items below remain valid — they are about product direction, not the billing model.

---

## Watch-1: Feature Flag Awareness in Change Lifecycle

**Source:** SDLC strategy spikes, Spike 4
**Why not now:** The beachhead ICP (lean teams, 1–5 people) frequently skips feature flags entirely. Relevant only when NestFleet moves up-market to teams with continuous deployment pipelines that separate deploy from release.

**The future state (when relevant):** A NestFleet Case should be able to track flag state, not just PR-merged state. CR lifecycle would gain a `flag_enabled` terminal state after `deployed`. The Change Lead could toggle the flag from the Approvals page.

**Trigger for re-evaluation:** ≥3 paying customers request flag-state tracking OR NestFleet acquires a Series A-stage customer with LaunchDarkly/Unleash in their stack.

**Design note:** When building this, avoid coupling to a specific flag provider. Model the state (`deployed_behind_flag → flag_enabled → complete`) generically; each provider is a 1-day adapter.

---

## Watch-2: PR-less / Commit-to-Main Change Flow

**Source:** SDLC strategy spikes, Spike 5
**Why not now:** NestFleet's core governance value proposition is the approval gate before any production change. The PR is the audit trail. Our beachhead explicitly wants this gate. Removing it for any risk tier is premature until adversarial agent-vs-agent verification has a production reference implementation in the market.

**The future state (when relevant):** For `risk_level = "low"` CRs with high AI confidence (>90%) and no affected surface flagged as critical, NestFleet could offer an "auto-approve and commit" path. A human would still receive a notification and have a 30-minute veto window.

**Trigger for re-evaluation:** A credible product (nominal.dev, Devin, or similar) ships adversarial agent verification at production scale with documented incident rates. Reassess NestFleet's low-risk CR path at that point.

**Risk note:** Do not conflate "no PR" with "no audit trail." Any PR-less path must still write a full audit event with the agent run output, diff, and confidence score. The trail cannot be optional.

---

## Watch-3: Slack as Primary Inbound Case Channel

**Source:** SDLC strategy spikes "explicitly not adding" list
**Why not now:** Slack is an operator notification channel (DEFERRED-12 ✅). Full inbound Slack case creation duplicates email work, requires Slack app approval, and blurs the product boundary. The beachhead's users do not file bugs in Slack.

**Exception path:** DEFERRED-20 (Slack inbound signals) is in v2.0 — this is about internal developer signals (e.g., a Slack message from a dev flagging a regression), not customer-facing support. That distinction must be preserved.

**Trigger for re-evaluation:** A specific enterprise customer requests Slack as their primary customer-facing support channel. At that point, the decision is a customer-specific configuration, not a product-wide investment.

---

## Watch-4: Generic Observability (OTel / Datadog / Prometheus)

**Source:** SDLC strategy spikes "explicitly not adding" list
**Why not now:** Generic observability is an infrastructure-layer problem. NestFleet is an operations governance layer. Building an alert router that understands OTel schemas, Prometheus rules, and Datadog monitor payloads requires maintaining N integrations with no incremental product value beyond Sentry (DEFERRED-25).

**The right path:** DEFERRED-25 (Sentry Bridge) proves the pattern with one well-defined integration. If the pattern succeeds and customers request other sources, add adapters one at a time (Betterstack, PagerDuty) — but never a generic "alert webhook" that accepts arbitrary payloads.

**Trigger for re-evaluation:** DEFERRED-25 is live, ≥2 customers are using it, and a specific second source (Betterstack most likely) is requested by ≥2 customers.
