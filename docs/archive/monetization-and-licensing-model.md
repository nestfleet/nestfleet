# NestFleet Monetization and Licensing Model

## 1. Purpose

This document defines the deployment, licensing, and monetization model for NestFleet. It resolves the tension between customer data sovereignty, IP protection, and sustainable revenue for a small product team.

## 2. Core Design Constraint

The model must satisfy three requirements simultaneously:

- customers must not be forced to send sensitive data (code, cases, conversations) to NestFleet infrastructure
- NestFleet must generate recurring revenue that cannot be trivially bypassed by cloning features
- the model must remain accessible to small teams, not only enterprises

## 3. Deployment Model: Client-Installed, Cloud-Connected

### 3.1 Primary Runtime

NestFleet runs entirely on the customer's infrastructure. All customer data stays local.

Components on customer infrastructure:

- NestFleet engine (TypeScript modular monolith)
- PostgreSQL (domain records, pgvector, workflow state)
- Redis or PostgreSQL-backed job queue
- S3-compatible object storage
- email connector endpoints
- GitHub webhook receiver

The customer configures their own LLM provider (OpenAI, Anthropic, or self-hosted Ollama). NestFleet does not proxy model calls. The customer's data goes to their chosen model provider under their own agreement.

### 3.2 Cloud Connection (NestFleet Cloud)

The customer installation connects to a thin NestFleet Cloud service for continuous value delivery. This connection transmits zero customer data.

What the cloud connection sends to NestFleet Cloud (metadata only):

- license ID
- NestFleet version
- aggregate usage counts (cases per month, AI actions per month, active products)
- error type codes (not error content)
- feature flags in use

What the cloud connection receives from NestFleet Cloud:

- software updates and security patches
- evaluation benchmarks and quality baselines
- compliance template bundles (AI disclosure, DPIA, transfer maps)
- role template improvements (better prompt strategies, retrieval profiles)
- security advisories

What the cloud connection never sends:

- case content, conversation text, user identities
- repository content, PR diffs, code
- product memory content
- notification content
- any PII

### 3.3 Offline Resilience

The product continues to run without an active cloud connection. There is no kill switch. An expired or disconnected license means the product keeps running but stops receiving updates, evaluation benchmarks, compliance templates, and security patches.

After 90 days without updates, the operator console displays an unsupported version banner.

## 4. Legal Position

### 4.1 NestFleet as Software Vendor

Under this model, NestFleet is a software vendor that delivers a product and an update service. NestFleet is not a data processor for customer operational data because customer data never reaches NestFleet infrastructure.

### 4.2 Minimal DPA Scope

The DPA between NestFleet and the customer covers only the thin cloud-connection metadata:

- license ID
- version and usage counts
- error type codes

This is comparable to a software telemetry agreement, not a full data-processing agreement for support conversations and code.

### 4.3 Reduced Certification Burden

Because NestFleet does not host or process customer operational data, the certification requirements shift dramatically:

| Full SaaS model | Client-installed model |
| --- | --- |
| SOC 2 Type II for customer data handling | Standard software vendor security posture |
| BSI C5 for hosted German customers | BSI C5 deferred until optional hosted tier is offered |
| Full GDPR Article 28 processor obligations | Minimal processor scope (metadata only) |
| Subprocessor inventory for all customer data flows | Subprocessor inventory only for the update channel |

### 4.4 Customer's Own Compliance Responsibility

The customer is responsible for:

- their own GDPR compliance for case data processing
- their own DPA with their LLM provider
- their own GitHub transfer assessment
- their own DPIA where required

NestFleet supports this by providing DPIA templates, privacy notice templates, and compliance guidance through the cloud connection.

## 5. Licensing Model

### 5.1 License Type: Business Source License (BSL)

Source code is visible for trust, audit, and security review. Commercial production use requires an active subscription.

BSL properties:

- source code is fully readable
- free for non-production evaluation and development
- commercial production use requires a valid license
- prevents competitors from hosting NestFleet as a managed service
- converts to full open source after a defined delay period (typically 3 to 4 years)

### 5.2 License Enforcement

A signed license file (JWT) is delivered to the customer installation:

- `customer_id`
- `tier` (`community` | `starter` | `growth` | `scale` | `trial`)
- `max_products`
- `max_outcome_units_monthly` (replaces former `max_ai_actions_monthly`)
- `features` (feature flag list)
- `issued_at`
- `expires_at`
- `update_channel_key` (authenticates to NestFleet Cloud)

The license file is checked at startup. No phone-home is required for the product to run. The update channel requires a valid, non-expired license to pull updates.

### 5.3 What Happens When a License Expires

- the product keeps running (no kill switch)
- the update channel stops delivering updates
- evaluation benchmarks stop refreshing
- compliance templates go stale
- security patches stop arriving
- after 90 days, operator console shows unsupported version banner

## 6. Pricing Model

> **Canonical reference**: `docs/revised-pricing-tiers.md`. This section summarises the agreed model; the canonical doc governs in case of conflict.

### 6.1 Pricing Axis

Price by active products managed plus automation volume (Outcome Units). Not by seats.

**1 Outcome Unit (OU)** = any one of:
- 1 successfully resolved support thread
- 1 approved and merged PR draft
- 1 verified production release follow-up

### 6.2 Tier Structure — Detailed Feature Matrix

Each tier is designed around a **single operational shift** that justifies the price jump:

| Tier | One-liner | Operational mode |
| --- | --- | --- |
| **Community** | "See the magic" | Watch an AI team resolve a case and draft a PR |
| **Starter** | "Run it for real" | Production-ready, automated pipeline with confidence-based auto-resolve |
| **Growth** | "Let it run itself" | Autonomous operations, self-learning AI, data-driven |
| **Scale** | "Enterprise governance" | SSO, custom roles, compliance bundles, unlimited |

#### 6.2.1 Quantitative Limits

| Metric | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Price** | $0 (non-commercial BSL) | ~$99/month | ~$499/month | Custom (~$2,500+/month) |
| **Active products** | 1 | 3 | 10 | Unlimited |
| **Outcome Units / month** | 100 | 1,000 | 10,000 | 100,000+ |
| **Human Lead slots** | 1 (single owner) | 3 | Unlimited | Unlimited |
| **Users (console access)** | 1 | 5 | 25 | Unlimited |
| **OU cost per unit** | — | ~$0.099 | ~$0.050 | ~$0.025 |

#### 6.2.2 Core Pipeline (available to all tiers)

Every tier gets the full signal-to-PR pipeline. This is the "see the magic" moment that hooks users on Community and keeps them on every paid tier.

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| Signal ingestion (inbound email) | ✅ | ✅ | ✅ | ✅ |
| AI triage & classification | ✅ | ✅ | ✅ | ✅ |
| Memory-backed context retrieval | ✅ | ✅ | ✅ | ✅ |
| Change request drafting | ✅ | ✅ | ✅ | ✅ |
| GitHub PR creation | ✅ | ✅ | ✅ | ✅ |
| Human approval gate | ✅ | ✅ | ✅ | ✅ |
| AI disclosure on outbound replies | ✅ | ✅ | ✅ | ✅ |

#### 6.2.3 Input Channels

| Channel | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Email** | ✅ | ✅ | ✅ | ✅ |
| **Website Widget** | — | ✅ | ✅ | ✅ |
| **Telegram** | — | — | ✅ | ✅ |
| **Slack** | — | — | ✅ | ✅ |
| **Discord** | — | — | — | ✅ |
| **Internal tooling / API** | — | — | — | ✅ |

#### 6.2.4 Notification Channels (operator alerts)

| Channel | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Email notifications** | ✅ | ✅ | ✅ | ✅ |
| **Telegram alerts** | — | ✅ | ✅ | ✅ |
| **Slack notifications** | — | — | ✅ | ✅ |
| **Discord / internal webhooks** | — | — | — | ✅ |
| **Channel preference per role** | — | — | ✅ | ✅ |

#### 6.2.5 AI Intelligence & Autonomy

Starter delivers real automation — the AI can auto-resolve cases where it is highly confident, without waiting for human approval. Growth adds the *intelligence* layer: pattern recognition from historical resolutions, self-learning, and compounding deflection capacity.

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Prompt-based AI responses** | ✅ | ✅ | ✅ | ✅ |
| **Human approval required** | Always | Configurable | Configurable | Configurable |
| **Confidence-based auto-resolve** (AI confidence > threshold → skip approval) | — | ✅ | ✅ | ✅ |
| **Pattern-based smart auto-resolve** (known-issue match → proven resolution applied) | — | — | ✅ | ✅ |
| **Known-issue matching** (proactive: "I've seen this before") | — | — | ✅ | ✅ |
| **Knowledge Capture** (AI learns from resolved cases, builds FAQ/runbooks) | — | — | ✅ | ✅ |
| **CI auto-complete** (PR merges when CI passes, no manual click) | — | — | ✅ | ✅ |
| **Custom quality benchmarks** | — | — | — | ✅ |

> **The two levels of auto-resolution:** Starter auto-resolves cases where the AI's confidence exceeds a configurable threshold (e.g. 95%) — it handles the *obvious* stuff. Growth adds pattern-based auto-resolution powered by Known-issue matching and Knowledge Capture: the AI recognizes that *this exact problem was solved before* and applies the proven resolution. This is a compounding asset — every resolved case makes future deflection more effective.
>
> **Why this matters at Growth scale:** At 10,000 OUs/month, a 25% known-issue match rate means 2,500 cases that never reach engineering. At 30 minutes per case saved, that is 1,250 engineering hours per month. $499/month versus 1,250 hours. The math is not close.

#### 6.2.6 Analytics & Evaluation

Starter shows you that the machine is running and what it costs. Growth shows you whether it is running well. Scale lets you define what "well" means.

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Overview metrics** (case count, resolution rate) | — | ✅ | ✅ | ✅ |
| **Cost & token tracking** | — | ✅ | ✅ | ✅ |
| **Agent performance** (per-persona metrics, error rates) | — | — | ✅ | ✅ |
| **Case analytics** (resolution time, escalation funnel) | — | — | ✅ | ✅ |
| **Knowledge & memory stats** (chunk health, retrieval quality) | — | — | ✅ | ✅ |
| **Operations metrics** (approval response time, queue depth, manual triage rate) | — | — | ✅ | ✅ |
| **Policy builder** (define triage rules, escalation thresholds) | — | — | ✅ | ✅ |
| **Quality drift detection** | — | — | ✅ | ✅ |
| **Fleet-wide quality benchmarks** (anonymized cross-customer norms) | — | — | — | ✅ |
| **Custom benchmarks & export** | — | — | — | ✅ |

#### 6.2.7 CI/CD Integration

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **GitHub webhook receiver** | ✅ | ✅ | ✅ | ✅ |
| **PR status tracking** | ✅ | ✅ | ✅ | ✅ |
| **CI pass/fail status** | — | ✅ | ✅ | ✅ |
| **Deployment tracking** | — | — | ✅ | ✅ |
| **Auto-complete on CI pass** (hands-free merge) | — | — | ✅ | ✅ |

#### 6.2.8 Governance & RBAC

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Default roles** (admin, operator, support_lead, change_lead, product_lead, knowledge_lead) | ✅ | ✅ | ✅ | ✅ |
| **Role assignment per user** | ✅ | ✅ | ✅ | ✅ |
| **Permission audit** (read-only: view what each role can do) | — | — | ✅ | ✅ |
| **Customize default role permissions** | — | — | — | ✅ |
| **Create custom roles** (atomic permission blocks) | — | — | — | ✅ |
| **User-level permission overrides** | — | — | — | ✅ |
| **GDPR role delegation** (DPO role with `dsar:search`, `retention:run`) | — | — | — | ✅ |
| **SSO / SAML integration** | — | — | — | ✅ |
| **SSO group → role mapping** | — | — | — | ✅ |
| **Role change audit trail** (actor + timestamp) | — | — | — | ✅ |
| **Permission Studio UI** | — | — | — | ✅ |

#### 6.2.9 Compliance & Legal

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **AI disclosure on outbound messages** | ✅ (auto) | ✅ (auto) | ✅ (configurable) | ✅ (configurable) |
| **Basic compliance templates** (privacy notice, AUP) | — | ✅ | ✅ | ✅ |
| **GDPR templates** (DPIA, transfer map, data flow docs) | — | — | ✅ | ✅ |
| **AI Act templates** (transparency, risk classification) | — | — | ✅ | ✅ |
| **Custom compliance bundles** (industry-specific: FinTech, MedTech) | — | — | — | ✅ |
| **Regulatory change alerts** | — | — | — | ✅ |
| **Compliance template auto-update** (via cloud connection) | — | — | ✅ | ✅ |

#### 6.2.10 Audit, Security & Support

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **Basic activity logs** (console actions) | — | ✅ | ✅ | ✅ |
| **Structured audit logs** (who did what, when, on which product) | — | — | ✅ | ✅ |
| **Advanced audit logs + export** (SIEM-ready, retention policies) | — | — | — | ✅ |
| **Security patches** (via cloud connection) | — | ✅ | ✅ | ✅ |
| **Priority security advisories** | — | — | — | ✅ |
| **Support channel** | Community (GitHub Issues) | Email | Priority email | Dedicated onboarding + priority |
| **SLA** | Best-effort | 48h response | 24h response | 4h response + named contact |

#### 6.2.11 Branding & Deployment

| Capability | Community | Starter | Growth | Scale |
| --- | --- | --- | --- | --- |
| **"Powered by NestFleet" signature** | Required | — | — | — |
| **White-label outbound replies** | — | ✅ | ✅ | ✅ |
| **Self-hosted (customer VPC)** | ✅ | ✅ | ✅ | ✅ |
| **Offline resilience** (no kill switch) | ✅ | ✅ | ✅ | ✅ |
| **Cloud connection** (updates, evals, templates) | — | ✅ | ✅ | ✅ |

#### 6.2.12 The Upgrade Story — What Breaks at Each Ceiling

**Community → Starter ($0 → $99):**
You hit 100 OUs in week two. You have a second product. Users on your website can't reach support because there's no widget. The "Powered by NestFleet" footer is unprofessional in enterprise conversations. **$99 removes all friction.** You get a website widget for your product pages, confidence-based auto-resolution so the AI handles obvious cases without you clicking "Approve," and cost tracking so you know exactly what your LLM is costing you. ROI: Intercom charges $0.99 per Fin resolution — 1,000 resolutions there costs $990/month plus seat fees. NestFleet Starter delivers the same for $99.

**Starter → Growth ($99 → $499):**
The hardest jump. Three things make it obvious:

1. **The compounding asset** — Known-issue matching means the AI checks every incoming case against your library of resolved issues. Starter auto-resolves based on confidence alone. Growth auto-resolves based on *proven patterns from your history*. A 25% match rate at Growth volume means hundreds of cases that never reach engineering. Your past resolution work becomes future deflection capacity. This value grows every month — it is the feature you will never want to turn off.

2. **From running AI to managing AI** — Starter shows you case count, resolution rate, and LLM costs. Growth shows you *how well*: agent performance, quality drift, escalation funnels, approval response time, manual triage rate. Without this data, you are operating on faith. With it, you make data-driven decisions about policy and staffing.

3. **Channels where your team and users actually live** — Starter gives you email + widget. Growth adds Telegram and Slack — both as input channels (users can report issues from Slack/Telegram) and notification channels (your operators get alerts in Slack instead of buried in email). Plus CI auto-complete: PRs merge automatically when CI passes, no manual click.

**Growth → Scale ($499 → $2,500+):**
Enterprise buyers self-identify. Three hard gates:

1. **SSO/SAML** — without centralized identity, you cannot pass enterprise procurement. This is a binary requirement, not a preference.
2. **Permission Studio** — "admin/operator/lead" is too coarse for a 50-person team. Custom roles with dependency resolution model exactly who can approve what, for which products.
3. **Discord + internal tooling API** — developer communities live in Discord. Internal teams need API-driven integrations. Scale meets every audience where work happens.

Scale is not "Growth but bigger." Scale is "I am building a platform, not running a tool."

#### 6.2.13 Future Consideration: the $199 Bridge Tier

> **Status: under evaluation for post-Phase 3.**

The $99 → $499 jump is 5×. Some teams that aren't yet hitting the Starter ceiling will wait. A potential "Team" tier at ~$199/month could surface the compounding asset earlier:

| | Team (proposed) |
| --- | --- |
| Price | ~$199/month |
| Products | 5 |
| OUs | 3,000 |
| Key unlock | Known-issue matching + basic eval dashboard |
| Not included | Policy builder, GDPR templates, pattern-based auto-resolution, CI auto-complete |

Rationale: a user who has experienced known-issue matching — watching the AI deflect cases that used to take 30 minutes — will not voluntarily give it up. This creates a softer ramp and surfaces the compounding asset at the moment users are most likely to build the habit of relying on it.

Decision deferred until post-pilot usage data confirms whether the $99 → $499 conversion rate needs a bridge.

### 6.3 Capability Enforcement Model

This section is the **canonical reference for implementation**. Every gated capability in NestFleet maps to exactly one enforcement mechanism. No capability uses more than one mechanism. No gated capability uses none.

#### 6.3.1 The Three-Category Model

| Category | Name | Mechanism | Where applied |
| --- | --- | --- | --- |
| **A** | Ordinal Tier Gate | `requireTier(minTier)` middleware on API route | API layer — before handler executes |
| **B** | Feature Flag Gate | `requireFeature("flag_name")` middleware on API route or channel entry point | API layer or channel handler |
| **C** | Behavioral Gate | Explicit tier check inside worker / service logic | Inside the worker, not at the API boundary |

**Rule for choosing category:**
- Use **Category A** when the capability is a direct function of tier level and every higher tier includes it (ordinal, additive).
- Use **Category B** when the capability could be rebundled differently in a future tier restructuring, or when it is a discrete channel integration that does not follow strict tier ordering.
- Use **Category C** when the gate changes *how* a pipeline step executes rather than *whether* an endpoint is accessible.

**Conflict resolution:** If a capability could fit both A and B, use A. Feature flags are reserved for channels and compliance bundles — the things most likely to be rebundled. Everything else is ordinal.

#### 6.3.2 Category A — Ordinal Tier Gate Catalog

Applied via `requireTier(minTier)` on the Hono route definition. The tier hierarchy is `community < starter < growth < scale`.

| Min tier | Capability | Route / location |
| --- | --- | --- |
| `starter` | Cost & token tracking | `GET /analytics/cost` |
| `starter` | Basic activity logs | (future: `GET /audit/activity`) |
| `growth` | Agent performance metrics | `GET /analytics/agents` |
| `growth` | Case analytics (resolution time, escalation funnel) | `GET /analytics/cases` |
| `growth` | Memory & knowledge health stats | `GET /analytics/memory` |
| `growth` | Operations metrics (queue depth, approval time) | `GET /analytics/operations` |
| `growth` | Policy builder (triage rules, escalation thresholds) | (future: `GET/POST /policy`) |
| `growth` | Quality drift detection | (future: `GET /analytics/quality`) |
| `growth` | Deployment tracking (CI/CD) | (future: `GET /analytics/deployments`) |
| `growth` | Permission audit view | (future: `GET /rbac/audit`) |
| `growth` | Structured audit logs | (future: `GET /audit/structured`) |
| `scale` | Custom roles CRUD | `POST/PUT/DELETE /roles/*` |
| `scale` | Permission Studio | (future: `GET/POST /rbac/studio`) |
| `scale` | Advanced audit logs + export | (future: `GET /audit/export`) |
| `scale` | Custom quality benchmarks | (future: `GET/POST /analytics/benchmarks`) |
| `scale` | Fleet-wide quality norms | (future: `GET /analytics/fleet`) |
| `scale` | GDPR role delegation (DPO role) | (future: `POST /rbac/dpo-delegation`) |
| `growth` | DSAR search (GDPR Art. 15) | (future: `GET /compliance/dsar/search`) |
| `growth` | DSAR export (GDPR Art. 15) | (future: `POST /compliance/dsar/export`) |
| `growth` | Retention sweep (GDPR Art. 17) | (future: `POST /compliance/retention/run`) |

**What is NOT in this table (intentionally):**
- `/analytics/overview` — no gate; Community gets basic case count and resolution rate. This is the "see the magic" hook.
- GitHub webhook receiver, PR status tracking — no gate; all tiers.
- Default roles and role assignment — no gate; all tiers.
- AI disclosure — no gate; all tiers (behaviour differs by tier — see Category C).
- SSO/SAML — enforced via `requireFeature("sso_saml")` (Category B), not ordinal, because it requires PlatformCloud to provision an IdP configuration.
- Knowledge Capture dispatch — enforced via Category C (behavioral, see 6.3.4).

#### 6.3.3 Category B — Feature Flag Gate Catalog

Applied via `requireFeature("flag")`. The flag must be present in the `features[]` array of the license JWT. The JWT is issued by PlatformCloud using the `PRODUCT_REGISTRY` (see 6.3.5).

Category B is intentionally **minimal**. Only capabilities that either (a) could be selectively included in a future bridge tier without regard to the full tier order, or (b) require external provisioning (channel credentials, IdP configuration) belong here.

| Flag | Min tier in current model | Capability | Applied at |
| --- | --- | --- | --- |
| `website_widget_channel` | Starter | Website support widget (inbound signal channel) | Widget channel handler |
| `telegram_channel` | Growth (deferred — see note) | Telegram as both input and operator notification channel | Telegram channel handler |
| `slack_channel` | Growth | Slack as both input and operator notification channel | Slack channel handler |
| `discord_channel` | Scale | Discord as both input and operator notification channel | Discord channel handler |
| `internal_api_channel` | Scale | Programmatic/API-driven signal ingestion | Internal API channel handler |
| `basic_compliance_templates` | Starter | Privacy notice, AUP — delivered via cloud connection | Compliance feed handler |
| `gdpr_ai_act_templates` | Growth | GDPR DPIA, AI Act transparency templates — via cloud | Compliance feed handler |
| `custom_compliance_bundles` | Scale | Industry-specific bundles (FinTech, MedTech) — via cloud | Compliance feed handler |
| `sso_saml` | Scale | SSO / SAML integration — requires IdP provisioning | SSO authentication handler |

> **Telegram note:** Telegram is deferred. The flag `telegram_channel` is defined in the registry but no channel handler exists yet. When implemented, the handler calls `requireFeature("telegram_channel")`. Do not split into input/notification variants — one flag covers both.

> **SSO note:** `sso_saml` is the one case where a Category B flag exists for a Scale-only feature. It is in Category B rather than A because SSO requires PlatformCloud to provision an IdP connection record — the flag confirms that provisioning has occurred, not just that the customer is on Scale tier.

**Flags that have been removed from Category B** (they were in the PRODUCT_REGISTRY previously but belong to Category A or are not needed):
- `standard_eval_dashboard` — removed; `/analytics/overview` is ungated for all tiers.
- `full_eval_pipeline` — removed; the deeper analytics are gated by `requireTier("growth")`.
- `policy_builder` — removed; gated by `requireTier("growth")`.
- `permission_audit` — removed; gated by `requireTier("growth")`.
- `permission_studio` — removed; gated by `requireTier("scale")`.
- `custom_roles` — removed; gated by `requireTier("scale")`.
- `advanced_audit_logs` — removed; gated by `requireTier("scale")`.
- `email_channel` — removed; email is the universal base channel, not a gated feature.

#### 6.3.4 Category C — Behavioral Gate Catalog

These gates live **inside workers and services**, not at the API boundary. They change *how* a pipeline step behaves rather than blocking access to an endpoint.

| Behavior | Gate condition | Location | Action when gate fails |
| --- | --- | --- | --- |
| Confidence-based auto-resolve | `tier >= starter` | `auto-reply-worker.ts` | Force `awaiting-lead` regardless of confidence score |
| "Powered by NestFleet" footer | `tier === community` | `auto-reply-worker.ts` | Append footer to all outbound reply emails |
| CI auto-complete on CI pass | `tier >= growth` | `webhooks/github.ts` | Skip auto-complete; CR remains in `pr-drafted`, operator clicks manually |
| Known-issue match dispatch | `tier >= growth` | `steward-worker.ts` | Skip agent call; `knownIssueMatched = false`, routing continues normally |
| Knowledge Capture dispatch | `tier >= growth` | Agent dispatcher | Skip dispatch; case proceeds without knowledge capture step |
| AI disclosure (configurable vs auto) | `tier >= growth` | `auto-reply-worker.ts` | Below Growth: auto-disclosure always applied, not configurable |

**Community auto-resolve rule (critical):** On Community tier, the auto-reply worker MUST NOT auto-send even when confidence exceeds the threshold. The transition target is always `awaiting-lead`. This enforces the "human approval required: always" guarantee for Community and is the primary behavioral differentiator between Community and Starter.

#### 6.3.5 PlatformCloud PRODUCT_REGISTRY — Canonical Definition

This is the authoritative source of which Category B flags belong to which tier in `src/license/validator.ts` (PlatformCloud). The registry emits only Category B flags — ordinal capabilities are not listed here because they are enforced by `requireTier()` in the NestFleet engine, not by the JWT payload.

```typescript
nestfleet: {
  features: {
    trial:     ["website_widget_channel", "basic_compliance_templates"],
    COMMUNITY: [],
    STARTER:   ["website_widget_channel", "basic_compliance_templates"],
    GROWTH:    ["website_widget_channel", "telegram_channel", "slack_channel",
                "basic_compliance_templates", "gdpr_ai_act_templates"],
    SCALE:     ["website_widget_channel", "telegram_channel", "slack_channel",
                "discord_channel", "internal_api_channel",
                "basic_compliance_templates", "gdpr_ai_act_templates",
                "custom_compliance_bundles", "sso_saml"],
  },
  ouLimits: {
    trial:     1_000,
    COMMUNITY: 100,
    STARTER:   1_000,
    GROWTH:    10_000,
    SCALE:     100_000,
  },
}
```

> **Trial:** Trial maps to the Starter feature set for `requireFeature()` checks (same flags as STARTER). For `requireTier()` checks, trial is treated as `starter` tier by `licenseToProductTier()`. After trial expiry, `getLicenseTier()` returns `"community"` (BIL-06).

#### 6.3.5b RBAC × Tier Composition Model

The system uses **two independent gatekeeping layers that compose in sequence** on every authenticated request:

```
Request
  └─ requireAuth()         — validates JWT, attaches user context
       └─ requireTier()    — installation-wide: does this license allow this endpoint?
            └─ requireRole() — user-level: does this specific user hold the required role?
```

**Key properties:**

1. **`requireTier()` is installation-wide, not per-user.** It reflects the product license, not the user's role. Even `admin` on Community tier cannot access Growth-gated endpoints.

2. **`admin` bypasses `requireRole()`, never `requireTier()`.** Admin is a superuser at the user-permission layer, not at the license layer. On Starter: admin has access to all Starter-available routes. On Community: admin cannot use Growth-gated endpoints.

3. **`analytics:read` is intentionally coarse.** All four default roles have `analytics:read`. The tier gates on specific sub-routes (`/analytics/cost`, `/analytics/agents`, `/analytics/operations`, `/analytics/cases`, `/analytics/memory`) narrow what a user can actually reach within that permission. This is the correct model — `requireTier()` is the sub-partition, not a second permission.

4. **Role sub-mappings within a tier are consistent:**

| Role | Category A capabilities available on Starter |
| --- | --- |
| `admin` | All 30 permissions + all Starter-available routes |
| `operator` | Cases r/w/transition/export, signals, CRs r/create, PR drafts, approvals, analytics (overview + cost), settings:read, compliance:read, memory:read, audit:read |
| `support_lead` | Cases r/transition, signals, CRs:read, approvals, analytics (overview + cost), settings:read, compliance:read, memory:read, audit:read |
| `knowledge_lead` | Cases:read, signals, CRs full lifecycle + approve/reject/complete, PR drafts push, analytics (overview + cost), settings:read, memory r/w, audit:read |

5. **DSAR/GDPR compliance permissions (`compliance:dsar_search`, `compliance:dsar_export`, `compliance:retention_run`) are `admin`-only in RBAC AND will require `requireTier("growth")` on their routes (see §6.3.2 catalog).** The admin role provides the user-level gate; `requireTier("growth")` provides the license-level gate. Both must pass.

6. **Scale-only studio operations** (`POST/PUT/DELETE /roles/*`) are gated by `requireRole("admin")` + `requireTier("scale")`. Both layers must pass — an `admin` on Starter cannot create custom roles.

#### 6.3.6 Implementation Checklist

The following code changes are required to bring the backend into full alignment with this model. Unchecked items are known gaps.

**Category A gaps (requireTier missing or wrong):**
- [x] `/analytics/cost` — changed from `requireTier("growth")` to `requireTier("starter")`
- [x] `/analytics/overview` — no gate (intentional; Community gets basic case count)
- [x] `/analytics/cases` — added `requireTier("growth")` (was missing; spec said Growth+)
- [x] `/analytics/memory` — added `requireTier("growth")` (was missing; spec said Growth+)
- [ ] Future DSAR/compliance routes — apply `requireTier("growth")` per §6.3.2 catalog on implementation
- [ ] Future audit, policy, and deployment routes — apply `requireTier()` from §6.3.2 catalog on implementation

**Category B gaps (requireFeature not wired):**
- [ ] `requireFeature()` is defined but never called — wire it to channel handlers as channels are implemented (no channel handlers beyond email exist yet; this is forward-looking)
- [x] PlatformCloud `PRODUCT_REGISTRY` — updated to match §6.3.5 (ordinal flags removed, correct tier assignments applied)

**Category C gaps (behavioral gates missing):**
- [x] "Powered by NestFleet" footer — Community tier (BIL-05 ✅)
- [x] Known-issue match dispatch — Growth+ (BIL-07 ✅)
- [x] Confidence-based auto-resolve — `tier < starter` forces `awaiting-lead` in `auto-reply-worker.ts`
- [x] CI auto-complete — `tier < growth` skips auto-complete in `webhooks/github.ts`
- [x] Knowledge Capture dispatch — `GROWTH_GATED_ACTIONS` set in `dispatcher.ts`; TypeScript errors for `knowledge_capture` ActionType also resolved

**RBAC × Tier consistency (§6.3.5b):**
- [x] RBAC × Tier composition model documented and verified — two-layer architecture confirmed consistent
- [x] All four default roles audited against Starter tier — no permission mismatches found
- [x] DSAR permissions identified as admin-only + future Growth+ tier gate — documented in §6.3.2 catalog

**User-facing feature taxonomy (§6.4):**
- [x] `FEATURE_CATALOG` constant written — `src/rbac/feature-catalog.ts`
- [x] Eight feature groups defined with user-facing labels, descriptions, tier assignments, and permission mappings
- [x] Three lookup helpers: `getFeaturesForTier()`, `getFeatureGroupForPermission()`, `getUpgradeUnlocks()`
- [ ] Frontend Roles & Permissions page — implement group-organized matrix using `FEATURE_CATALOG` (frontend work)
- [ ] Landing page plan comparison — use `FEATURE_CATALOG` labels verbatim (marketing/frontend work)

### 6.4 User-Facing Feature Taxonomy

#### 6.4.1 Purpose

The enforcement model in §6.3 uses three internal categories (A/B/C) and RBAC permission domains (cases, signals, change_requests…). These are implementation mechanics — they do not map directly to the language a user sees on the landing page or inside the app.

This section defines the **canonical user-facing feature taxonomy**: eight feature groups with user-readable names and descriptions. These names are used verbatim on three surfaces:

1. **Landing page** — plan comparison table, feature bullet lists
2. **In-app Roles & Permissions page** — permission matrix organized by feature group, with tier badges
3. **Upgrade prompts** — "Upgrade to Growth to unlock AI Performance, Case Analytics…"

Same label string, all three surfaces. No per-surface variants.

#### 6.4.2 The Eight Feature Groups

| Group | Min tier | Covers (implementation) |
|---|---|---|
| **Support Inbox** | Community | `cases:*`, `signals:*`, `approvals:*`, `auto_reply` / `triage` / `known_issue_match` / `outage_routing` workers |
| **Developer Workflow** | Community | `change_requests:*`, `pr_drafts:*`, CI auto-complete Category C gate |
| **Knowledge Base** | Community | `memory:*`, `knowledge_capture` worker (Growth+) |
| **Analytics** | Community | `analytics:read` + tier-split sub-endpoints (see §6.3.2) |
| **Channels** | Starter | Category B flags: `website_widget_channel`, `slack_channel`, `telegram_channel`, `discord_channel`, `internal_api_channel` |
| **Compliance** | Community | `compliance:*`, Category B flags: `basic_compliance_templates`, `gdpr_ai_act_templates`, DSAR routes (Growth+) |
| **Team & Access** | Community | Default roles, role studio `POST/PUT/DELETE /roles/*` (Scale+), `sso_saml` flag |
| **Platform** | Community | `products:*`, `settings:*`, `audit:read` |

#### 6.4.3 Feature Entries with Tier Splits

Some features exist at multiple tiers but behave or unlock differently. The UI must communicate this within the group — not by hiding the feature, but by showing its tier-specific behavior note:

| Feature | Community | Starter | Growth | Scale |
|---|---|---|---|---|
| **AI Auto-Reply** | Human approval required before send | Autonomous send when confidence ≥ threshold | ← same | ← same |
| **Analytics** | Overview dashboard only | + Cost & token usage | + AI performance, case analytics, knowledge health, operations | ← same |
| **Compliance** | Reports only | + Basic templates | + GDPR/AI Act templates + DSAR operations | ← same |
| **Team & Access** | Default roles + assignment | ← same | ← same | + Custom roles, overrides, SSO |

#### 6.4.4 Roles & Permissions Page Layout

The permission matrix is organized by feature group, not by RBAC domain. Within each group, feature entries that have no associated permissions (behavioral or channel features) are shown as capability rows above the permission rows.

Tier-locked groups are visible in full but rendered in a locked state with an upgrade call-to-action. Admin users see all groups including locked ones — this is an intentional upsell surface.

```
┌─ Analytics ─────────────────────────────────────────────────────────┐
│                                         admin  op  sup_lead  know.  │
│  Overview Dashboard    Community          ✅   ✅    ✅       ✅    │
│  ──────────────────────────────────────────────────── Starter+ ───  │
│  Cost & Token Usage    Starter            ✅   ✅    ✅       ✅    │
│  ──────────────────────────────────────────────────── Growth+  ───  │
│  AI Performance        Growth        🔒  🔒   🔒    🔒       🔒    │
│  Case Analytics        Growth        🔒  🔒   🔒    🔒       🔒    │
│  Knowledge Health      Growth        🔒  🔒   🔒    🔒       🔒    │
│  Operations Metrics    Growth        🔒  🔒   🔒    🔒       🔒    │
│                                                                      │
│  analytics:read ──────────────────────── ✅   ✅    ✅       ✅    │
│                              [Upgrade to Growth to unlock →]         │
└─────────────────────────────────────────────────────────────────────┘
```

`analytics:read` is a single RBAC permission that appears once in the matrix. The four sub-features above it are rendered as capability rows (no permission checkbox, just tier badge + locked/unlocked state). The role's granted `analytics:read` determines the checkbox; the tier gate determines which capability rows are live.

#### 6.4.5 Implementation

The canonical TypeScript constant lives at `src/rbac/feature-catalog.ts`. It exports:

- `FEATURE_CATALOG: readonly FeatureGroup[]` — the full taxonomy
- `getFeaturesForTier(tier)` — all non-`comingSoon` features available at a given tier
- `getFeatureGroupForPermission(permissionId)` — maps a permission ID to its parent feature group (used by the permission matrix renderer to know which section header to render)
- `getUpgradeUnlocks(fromTier)` — the feature delta unlocked by upgrading one tier (used by upgrade prompt components)

The catalog is **not imported by any backend enforcement code**. It is a frontend/shared presentational constant only.

---

### 6.5 Trial Model (Pattern B)

- **Trial tier**: Starter feature set, 30 days, no credit card required.
- The trial does **not** unlock Growth or Scale features. This prevents the "extract value then quit" pattern for one-time-configuration features (policy builder, eval pipeline, known-issue matching).
- After trial expiry, the installation locks to Community limits until a paid plan is activated.
- Growth evaluation: 14-day trial, credit card required, or via sales demo.

### 6.6 Community Tier Rationale

A permanent free Community tier (1 product, 100 OUs, non-commercial) replaces the previous "no free tier" position. Rationale:
- Enables bottom-up adoption through developer communities without enabling free-riding on production workloads (100 OUs is not production-viable for a real product).
- The BSL already prevents commercial cloning. The volume limit prevents production use without paying.
- "Powered by NestFleet" signature on Community tier provides brand distribution.

## 7. Continuous Value Delivery

The subscription is justified by continuous value that cannot be cloned once.

### 7.1 Evaluation Pipeline

NestFleet Cloud runs a continuous evaluation service built from aggregate anonymized quality patterns across all customers:

- validation quality benchmarks (false-positive rate, abstain rate, unsupported-claim rate)
- retrieval quality baselines per product type
- quality drift detection and alerts
- comparison against fleet-wide quality norms

No individual customer data is used. The benchmarks are statistical models derived from aggregate metadata.

### 7.2 Compliance Template Feed

EU regulations are moving targets. NestFleet Cloud delivers:

- updated AI disclosure templates when regulatory guidance changes
- updated DPIA templates per EDPB guidance
- updated transfer map templates when the subprocessor landscape changes
- regulatory change alerts relevant to the customer's channel and region configuration

### 7.3 Role Template Improvements

Shipped role templates improve over time:

- better prompt strategies for Frontline, Steward, and Change personas
- better retrieval profiles per domain type
- better validation heuristics
- new shipped role templates for emerging use cases

### 7.4 Security and Update Cadence

- version updates with features, bug fixes, and performance improvements
- security patches and CVE response
- dependency updates
- security advisories when relevant vulnerabilities are discovered

## 8. Anti-Clone Defense Analysis

### 8.1 What a Competitor or Customer Could Try

| Attack | Defense |
| --- | --- |
| Fork the BSL code and run without paying | BSL prohibits commercial production use. Legal protection applies. Without cloud connection, eval, compliance, and security degrade over time. |
| Clone premium features using AI coding tools | No free production base to extend. Cloned features go stale without the continuous value feeds. |
| Build a competing hosted service on NestFleet code | BSL explicitly prohibits this use case. |
| Use the 30-day trial indefinitely | Trial is time-limited with license expiry, not feature-limited with soft gates. |

### 8.2 What the Model Does Not Try to Prevent

- a customer modifying their licensed installation for internal needs (allowed, expected)
- a customer inspecting the source for security audit (the whole point of visible source)
- a researcher or contributor studying the codebase (encouraged)

## 9. Optional Future Hosted Tier

A hosted SaaS tier may be offered later for customers who prefer not to operate their own infrastructure. This tier would:

- run the full NestFleet stack on NestFleet-managed infrastructure
- require full processor DPA and appropriate certifications (SOC 2, BSI C5)
- cost more than self-installed tiers to cover infrastructure and compliance overhead
- be a premium option, not the default path

This is deferred until the client-installed model proves revenue viability and the certification investment is justified by market demand.

## 10. Architectural Requirements

The monetization model requires the following architectural components:

### 10.1 License Module

- license file validator (verify JWT signature at startup)
- feature gate service (check tier before enabling gated features)
- usage tracker (count AI actions per month, local only, no phone-home)

### 10.2 Cloud Connection Module

- license sync (validate subscription status during update pulls)
- update delivery (receive and apply software updates)
- evaluation feed (receive quality benchmarks)
- compliance feed (receive template updates)
- role update feed (receive role template improvements)
- security feed (receive patch notifications and advisories)

### 10.3 Feature Boundary

Features must be cleanly separated into always-available and tier-gated categories at the module level. Feature gates must be checked through the license module, not scattered through business logic.

## 11. Sources

This model draws on observed patterns from:

- MariaDB BSL (originator of the Business Source License)
- HashiCorp BSL transition
- Sentry BSL adoption
- GitLab open-core and self-managed model
- Chatwoot self-hosted pricing model
- JetBrains subscription model for locally-installed tools
