# NestFleet + DocuGardener — Client SDLC Integration
## Use Cases, Communication Architecture, and Ops Processes

> **Document type:** Business / Product spec
> **Version:** 1.0
> **Date:** 2026-03-24
> **Status:** Draft
> **Author:** Product Owner
> **Related:** [`../specs/nestfleet-docugardener-integration.md`](../specs/nestfleet-docugardener-integration.md) (technical bridge spec)

---

## 1. Purpose and Scope

This document describes how a **software company (Client A)** uses NestFleet and DocuGardener
together inside their own SDLC. It covers the use cases, communication topology, actor roles,
and operational process patterns that emerge from this deployment.

This is distinct from the scenario where DocuGardener is a *served product* in NestFleet
(NestFleet handling DocuGardener's own customers). Here, Client A is the operator — they run
both tools against their own codebase and own support channels.

**In scope:**
- Signal flows for external customer support
- Signal flows for internal doc quality ops
- Use cases with actor journeys and step-by-step flows
- Communication channel topology
- Ops process patterns for engineering and support teams

**Out of scope:**
- Technical bridge event schemas (see `nestfleet-docugardener-integration.md`)
- Deployment and infrastructure (see `path-to-production.md`)
- Billing and licensing (see `monetization-and-licensing-model.md`)

---

## 2. The Setup

```
Client A  (software company — builds and ships Product X)
    │
    ├── DocuGardener   →  monitors Client A's own repos and documentation
    │                     flags drift, proposes fixes, gates CI on doc health
    │
    └── NestFleet      →  manages Client A's support and change operations
                          receives customer signals, runs triage, drives CRs and PRs
```

Client A's customers never interact with either tool directly. DocuGardener runs against
Client A's repositories. NestFleet receives signals from Client A's support channels.

**The key insight:** DocuGardener's output — drift alerts, CI gate results, auto-heal proposals
— becomes *input* into NestFleet's signal stream. The two tools form a closed feedback loop
inside Client A's SDLC. A customer complaint about wrong docs and a nightly drift alert about
the same file both converge into the same NestFleet CR pipeline, then the same PR, then the
same DocuGardener verification pass.

---

## 3. Actors

| Actor | Role in Client A | Primary tool | Primary notification channel |
|-------|-----------------|-------------|------------------------------|
| **External Customer** | Uses Client A's Product X | — (inbound only) | Email, GitHub Issues, Chat widget |
| **Support Lead** | Handles customer signals, triages, routes, sends replies | NestFleet queue | Slack + email |
| **Change Lead** | Reviews and approves CRs before engineering work starts | NestFleet Approvals | Slack + email |
| **Engineer** | Implements fixes, writes PRs, updates docs | GitHub + DocuGardener | GitHub PRs |
| **Doc Owner** | Maintains documentation accuracy, reviews drift alerts | DocuGardener + NestFleet | Slack + email |
| **Platform Lead** | Owns infra, runbooks, service contracts between services | Both tools | GitHub + Slack |
| **Engineering Manager** | Sprint planning, doc-debt review, ops metrics | NestFleet Analytics | Dashboard + weekly digest |

---

## 4. Communication Architecture

### 4.1 Two Signal Streams, One Pipeline

Client A operates two completely separate inbound signal streams that feed the same
NestFleet case and CR pipeline:

```
EXTERNAL STREAM — customer-facing
──────────────────────────────────────────────────────────────
Customer email        → POST /webhooks/email/:productId
Customer GitHub issue → POST /webhooks/github/:productId       → NestFleet Case
Customer chat widget  → POST /webhooks/chat/:productId              │
Customer contact form → POST /webhooks/contact-form/:productId      │
                                                                     ▼
INTERNAL STREAM — DocuGardener bridge                         Change Request
──────────────────────────────────────────────────────────────      │
DocuGardener drift    → bridge event (scheduled/internal)           ▼
CI gate failure       → scheduled signal via GitHub check_suite  GitHub PR
Post-deploy scan      → bridge event                                │
                                                                     ▼
                                                           DocuGardener verifies
                                                           docs are correct ✓
```

Operators see both streams in the NestFleet queue filtered by `source_type`. External signals
carry a customer identity and a reply thread. Internal signals carry a drift score and a
document path. Both generate cases. Both can generate CRs.

### 4.2 Channel Topology

```
EXTERNAL CHANNELS (customer → Client A)
─────────────────────────────────────────────────────────────────────
Channel         │ Protocol         │ Reply path
────────────────┼──────────────────┼────────────────────────────────
Email           │ Postmark webhook │ Email reply (Resend, threading)
GitHub Issues   │ GitHub webhook   │ GitHub issue comment (API)
Chat widget     │ SSE + REST       │ SSE push to browser (real-time)
Contact form    │ REST             │ Email reply to form's email field
────────────────┴──────────────────┴────────────────────────────────

INTERNAL CHANNELS (DocuGardener → NestFleet)
─────────────────────────────────────────────────────────────────────
Channel              │ Protocol           │ Reply path
─────────────────────┼────────────────────┼──────────────────────────
Bridge events        │ pg-boss queue      │ PR merge (no external reply)
CI gate failure      │ GitHub check_suite │ PR fix (no external reply)
Scheduled drift scan │ Cron / REST        │ PR merge (no external reply)
─────────────────────┴────────────────────┴──────────────────────────

OPERATOR NOTIFICATION CHANNELS (NestFleet → team)
─────────────────────────────────────────────────────────────────────
Channel   │ Priority routing
──────────┼─────────────────────────────────────────────────────────
Slack     │ Critical: immediate bypass quiet hours
          │ High: within 15 min
          │ Normal/Low: digest window
Email     │ Same priority routing
Telegram  │ Available for on-call (same routing)
──────────┴─────────────────────────────────────────────────────────
```

### 4.3 Identity and Thread Continuity

- **Email threads:** `Message-ID` / `In-Reply-To` headers link follow-up emails to the same
  case. Customer never needs to reference a ticket number.
- **GitHub issues:** Issue number is the thread key. All comments (inbound and outbound)
  stay on the same issue thread. PR mentions cross-reference the case.
- **Chat sessions:** Session token (`chsess_`) stored in browser localStorage preserves
  context across page reloads until the case is resolved.
- **Internal signals:** Document path + product ID serve as the thread key. Multiple drift
  alerts for the same file accumulate on the same case rather than spawning duplicates.

---

## 5. Use Cases

### UC-1 — Customer-Reported Documentation Error → Direct Fix Loop

**Trigger:** A customer using Client A's API hits documentation that does not match actual
API behavior. They report it via email or GitHub issue.

**Actors:** Customer, Support Lead, Engineer, Doc Owner (as Change Lead)

**Signal (email example):**
```
From: dev@customer.io
To: support@productx.io
Subject: Auth header name wrong in Node.js SDK docs

Your Node.js SDK example uses 'apiKey' as the header name but your API
actually expects 'x-api-key'. Spent 3 hours on this.
```

**Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | NestFleet | Email → signal → case created. Triage: severity=normal, type=bug_report, labels=[docs, sdk, auth] |
| 2 | NestFleet AI | Searches KB for auth header docs. If DocuGardener has already flagged the same file as drifted, the case is linked to the existing drift task. Confidence check: if gates pass → auto-reply: "Confirmed — fix in progress." If gates fail → draft held for Support Lead. |
| 3 | Support Lead | Reviews case, confirms it is a pure doc error (not a code bug), creates CR: "Fix auth header name in Node.js SDK docs — 'apiKey' → 'x-api-key'" |
| 4 | Change Lead | Approves CR (low risk, docs-only). risk_level=low triggers fast-track approval. |
| 5 | Engineer | Picks up CR → PR drafted targeting the SDK docs file |
| 6 | DocuGardener | CI check on the PR: verifies the new header name matches the OpenAPI spec value. If match → CI passes. If mismatch → CI fails, PR blocked. |
| 7 | NestFleet | GitHub `check_suite.success` event received → CR status: `pr-drafted` → `completed`. Case resolved. |
| 8 | NestFleet | Customer notified via email: "The documentation has been corrected." Reply on same thread. |

**Ops pattern:** Customer complaint → CR → PR → DocuGardener verification → customer
notified. The doc fix is guaranteed to match the actual API spec — DocuGardener's CI check
is the verification layer, not a manual review.

**Value:** Zero drift between the fix and the spec. Zero separate Jira/Linear ticket.
End-to-end tracked in one place.

---

### UC-2 — Release Gate: Docs Required Before Merge

**Trigger:** An engineer ships a new endpoint or changes an existing API contract but
does not update the documentation. DocuGardener's CI check fails, blocking the PR from
merging.

**Actors:** Engineer, Change Lead (Doc Owner), NestFleet (automated)

**Setup prerequisite:** DocuGardener is configured as a required CI check on the `main`
branch. Drift score threshold: any public-facing doc with score > 0.6 blocks the merge.

**Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | Engineer | Opens PR: "Add new POST /webhooks/verify endpoint." Code ships. Docs not updated. |
| 2 | DocuGardener | CI check runs. Finds no documentation for `POST /webhooks/verify`. Drift score: 1.0. CI check fails. GitHub PR shows ❌ `docugardener/doc-health`. PR blocked. |
| 3 | NestFleet | Receives `check_suite.failure` GitHub webhook. Creates case: "Release gate blocked — POST /webhooks/verify undocumented." severity=high, source_type=github_webhook. |
| 4 | NestFleet | Creates CR automatically: "Document POST /webhooks/verify before merge." status: draft → analysis → approval-pending (severity=high fast-tracks through analysis). |
| 5 | Change Lead | Reviews CR in Approvals queue. Approves: the endpoint spec is clear from the PR diff. |
| 6 | Doc Owner | Picks up CR, adds endpoint documentation. Opens a follow-up PR (or commits directly to the original PR branch). |
| 7 | DocuGardener | CI re-runs. Doc now exists and matches the endpoint schema. Drift score: 0.0. CI check passes. ✅ |
| 8 | Engineer | Original PR is now unblocked. Merges. |
| 9 | NestFleet | `check_suite.success` received. CR: `completed`. Case: `resolved`. |

**Audit trail:** The entire sequence — gate failure, CR approval, doc fix, gate pass — is
preserved in NestFleet's audit trail with timestamps. Engineering Manager can see at sprint
review: "Release blocked for 52 minutes on PR #189 due to missing endpoint docs."

**Ops pattern:** Doc quality is enforced at the gate, not discovered by customers. NestFleet
provides the case-management and approval wrapper around what DocuGardener flags. The
engineer's experience: CI fails with a clear message and a NestFleet case link. They don't
need to understand either tool.

---

### UC-3 — Proactive Drift Alert: Fix Before Customer Impact

**Trigger:** DocuGardener's nightly scan detects documentation drift that no customer has
yet reported. Client A wants to resolve it before it generates support noise.

**Actors:** Doc Owner, Change Lead, NestFleet (automated)

**Signal (bridge event from DocuGardener):**
```json
{
  "event": "bridge.doc-gap.detected",
  "docPath": "docs/api/billing.md",
  "driftScore": 0.71,
  "affectedEndpoints": ["POST /subscriptions", "DELETE /subscriptions/:id"],
  "suggestedAction": "update_docs"
}
```

**Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | NestFleet | Bridge event → scheduled signal → case created: "Doc drift: billing API (score 0.71)." severity=low (no customer impact), source_type=scheduled, labels=[doc-drift, billing-api, proactive]. |
| 2 | NestFleet | Routes to Doc Owner's queue (not Support Lead — no customer urgency). No AI auto-reply (internal signal, no external sender). |
| 3 | Doc Owner | Reviews case. Sees: which endpoints, drift score, DocuGardener's diff view linked. Notes: "billing.md doesn't reflect the new proration logic we shipped last sprint." |
| 4 | Doc Owner | Creates CR: "Update billing API docs: proration logic for DELETE /subscriptions/:id." risk_level=low. |
| 5 | Change Lead | Auto-approved (low risk, docs-only, below manual-review threshold). |
| 6 | Doc Owner | Fixes docs. PR merged. |
| 7 | DocuGardener | Next nightly scan: drift score 0.0. Bridge event: `bridge.doc-update.published`. |
| 8 | NestFleet | Receives published event. Case closes automatically. RAG knowledge base re-indexed with updated billing docs. |

**Ops pattern:** Proactive maintenance processed at normal sprint cadence, not as emergency
response. NestFleet gives the drift alert a case ID and a CR, making it a first-class work
item visible to the EM — not a Slack message that gets buried.

**Key difference from UC-1:** No customer is affected. No reply thread. The entire loop
is internal. The customer never sees this work happen.

---

### UC-4 — Incident Response → Runbook Updated and Verified

**Trigger:** A production incident occurs. The on-call resolves it using tribal knowledge
because the runbook was outdated. Post-incident: the runbook must be updated. DocuGardener
verifies the update actually matches the current system state.

**Actors:** On-Call Engineer, Support Lead, Platform Lead, Doc Owner, Change Lead

**Signal (monitoring alert):**
```
Alert: DB failover failed — manual intervention required
Component: primary-db
On-call escalated: 03:15 UTC
Recovery time: 47 min (expected: 8 min)
Root cause: failover_config.yml out of sync with actual DB topology
```

**Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | NestFleet | Monitoring → signal → case: "Production incident: DB failover failure." severity=critical → bypasses quiet hours → all leads notified immediately. |
| 2 | On-Call | Works the incident. NestFleet case stays open as the incident log. All actions noted in case comments. |
| 3 | On-Call | Incident resolved. Notes in case: "failover_config.yml was referencing decommissioned replica node." |
| 4 | Support Lead | Case transitions to `in-resolution`. Creates two CRs from the incident findings: |
| | | CR-1: "Hotfix: update failover_config.yml — remove decommissioned replica." risk_level=high. |
| | | CR-2: "Update db-failover-runbook.md — add manual intervention steps for topology mismatch." risk_level=medium. |
| 5 | Change Lead | Approves CR-1 immediately (production risk). Approves CR-2 same morning. |
| 6 | On-Call | CR-1 merged by on-call. Topology fix ships within the hour. |
| 7 | Platform Lead | CR-2: updates `db-failover-runbook.md` with new topology diagram and manual intervention steps. |
| 8 | DocuGardener | CI check on the runbook PR: verifies the updated topology diagram references the actual live replica nodes (via config file diff). Passes. ✅ |
| 9 | NestFleet | Both CRs completed. Case closes. Post-incident note added: "46-min excess downtime. Root cause: stale runbook. Runbook updated and verified by DocuGardener." |
| 10 | Engineering Manager | Sprint retro: reviews NestFleet incident audit trail. Decision: add DocuGardener drift check to `/docs/runbooks/` directory. Threshold: score > 0.5 triggers case. |

**Ops pattern:** Incidents generate CRs, not just Jira tickets. DocuGardener is the
exit criterion for the runbook CR — the fix is not complete until DocuGardener verifies
the updated runbook reflects the current system state. This closes the loop that most
incident processes miss: the runbook is actually correct after the update, not just updated
with new text.

---

### UC-5 — Developer Ecosystem: Three GitHub Issues, Three Risk Tiers

**Trigger:** Client A has a public developer API. Three GitHub issues arrive from external
developers on the same day, each requiring a different response.

**Actors:** Developer (external), Support Lead, Change Lead, Doc Owner, Engineer

#### Issue A — SDK Types Mismatch (High Risk)
```
Title: TypeScript types in SDK don't match API response shapes
Body: The SDK's VerificationResult type has `credentialHash: string`
      but the API actually returns `credential_hash: string` (snake_case).
      This breaks TypeScript strict mode compilation.
Labels: bug, typescript, sdk
```

| Step | Action |
|------|--------|
| 1 | NestFleet: severity=high (SDK breakage, affects all TS users), type=bug_report. |
| 2 | DocuGardener: confirms drift — OpenAPI spec uses snake_case, SDK types use camelCase. Already flagged in a pending drift case. NestFleet links the customer case to it. |
| 3 | CR: "Regenerate TypeScript types from OpenAPI spec. Applies to all response shapes." risk_level=high. |
| 4 | Change Lead approves. Engineer regenerates types from spec. DocuGardener CI verifies alignment. |
| 5 | GitHub issue auto-commented at each stage: "Under investigation" → "Fix in review" → "Fixed in v2.3.1." |

#### Issue B — Rate Limit Discrepancy (Medium Risk)
```
Title: Docs say 100 req/min but I'm hitting 429 at 60
Body: Your rate limiting docs state 100 req/min on the Growth plan
      but I consistently get 429 errors after 60 requests. Either
      the docs are wrong or the enforcement is wrong.
Labels: bug, rate-limiting
```

| Step | Action |
|------|--------|
| 1 | NestFleet: severity=normal, type=bug_report. AI triage: confidence < 0.85 (ambiguous — could be doc error OR actual misconfiguration). Case → awaiting-lead. |
| 2 | Support Lead investigates. Confirms: actual limit IS 60/min in production. Docs are wrong (left over from a limit reduction 2 months ago). |
| 3 | CR-1: "Fix rate limit docs: 60 req/min, not 100." risk_level=low (docs-only). |
| 4 | CR-2: "Audit rate limit config: staging uses 100, prod uses 60 — align or document intentionally." risk_level=medium. |
| 5 | Both CRs run in parallel. GitHub issue commented at merge of each CR. |

#### Issue C — Minor Docs Gap (Low Risk)
```
Title: Webhook payload example missing retry_count field
Body: Your webhook payload example doesn't show the retry_count field
      that actually appears in production payloads. Minor thing but
      tripped me up.
Labels: documentation, feedback
```

| Step | Action |
|------|--------|
| 1 | NestFleet: severity=low, type=user_feedback. |
| 2 | DocuGardener confirms: webhook payload docs have drift score 0.3 (known minor gap). |
| 3 | CR: "Add retry_count to webhook payload example." risk_level=low. Auto-approved. |
| 4 | Doc Owner fixes in 30 min. DocuGardener CI passes. Issue closed with comment the same day. |

**Ops pattern:** The same pipeline handles all three, but with appropriate friction at each
risk level. Low-risk doc fixes are auto-approved and resolved in under an hour. Medium-risk
changes get Change Lead review. High-risk SDK changes get full CR treatment. The developer
experience is identical across all three: GitHub issue filed, automated acknowledgement,
status comments at each stage, closed when fixed.

---

### UC-6 — Sprint Doc Debt Review (Engineering Manager)

**Trigger:** End of sprint. EM wants to understand accumulated doc debt, resolution rate,
and what needs attention next sprint.

**Actors:** Engineering Manager, Change Lead, Doc Owner

**Inputs:**
- NestFleet Analytics: cases, CRs, time-to-resolution by type
- DocuGardener: drift scores by module, CI failure frequency
- Bridge: deflection attributions (cases resolved by AI using docs updated this sprint)

**Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | EM | Opens NestFleet Analytics dashboard for Sprint 23. Sees: 14 external signals, 3 doc-related (21%), 2 auto-resolved via AI, 1 escalated to CR (resolved in 2 days), 4 internal drift cases from bridge events, 2 CRs still in approval-pending. |
| 2 | EM | Opens the 2 stalled CRs. Both are low-risk doc fixes waiting on Change Lead. Pings Change Lead. Both approved within the hour. |
| 3 | EM | Reviews DocuGardener health panel: billing.md: 0.71 → 0.0 (fixed). auth-overview.md: 0.45 (still pending). webhooks.md: 0.0 → 0.12 (new drift from this week's webhook changes). |
| 4 | EM | Creates next sprint work items for the two pending items: auth-overview.md (low priority, existing Doc Owner assignment), webhooks.md (medium priority — drift is recent and relates to current sprint's webhook changes). Created as manual cases in NestFleet (source_type=manual). |
| 5 | EM | Reviews deflection report: 3 of this week's customer signals auto-resolved using docs updated in sprint. Estimated support cost saved: $240. Shares with leadership as ROI evidence. |

**Ops pattern:** Doc debt is managed like technical debt — tracked, sized, prioritized
in sprints. NestFleet gives it case IDs and CRs. DocuGardener gives it drift scores.
Together they make it visible and processable — not "someone should update the docs."

---

## 6. Ops Process Patterns

### 6.1 The Two Queues

Client A operates two distinct queues within NestFleet. Same UI, same pipeline, different
owner and SLA:

| | External Queue | Internal Queue |
|--|---------------|----------------|
| **Source** | Customer signals (email, GitHub, chat) | Bridge events, CI failures, scheduled scans |
| **Owner** | Support Lead | Doc Owner / Platform Lead |
| **SLA** | 4-hour first response | Next sprint (unless blocking release) |
| **Reply destination** | Customer (email / GitHub comment / SSE) | PR merge — no external reply |
| **Filter** | `source_type IN (email, github_webhook, chat, contact_form)` | `source_type IN (scheduled, manual)` |
| **Priority signal** | Customer urgency language, plan tier, time pressure | Drift score, blast radius, release blocking |

Both queues feed the same CR approval pipeline. A doc error reported by a customer and a
doc error detected by DocuGardener's nightly scan both produce the same type of CR. The
difference is urgency and who gets notified.

### 6.2 Risk Levels and Approval Gates

| CR risk_level | Typical source | Approval path | Expected cycle time |
|---------------|---------------|---------------|---------------------|
| `low` | Docs-only fix, no code change | Auto-approved OR Change Lead in same day | < 24 hours |
| `medium` | Code change, limited blast radius | Change Lead review required | 1–2 days |
| `high` | Wide blast radius, SDK/API change, infra | Change Lead + optional Product Lead | 2–3 days |

DocuGardener's CI check is the exit gate for all doc-touching CRs, regardless of risk level.
Even a `low`-risk auto-approved CR is not considered complete until the CI check passes.

### 6.3 The Closed Feedback Loop

```
Customer signal (or nightly scan)
         │
         ▼
   NestFleet Case
         │
         ▼
   NestFleet CR ──────────────────────────────────────────┐
         │                                                 │
         ▼                                                 │
   GitHub PR (doc fix)                                     │
         │                                                 │
         ▼                                                 │
   DocuGardener CI check                                   │
         │                                                 │
    passes? ──── yes ──► PR merges                         │
         │                   │                             │
        no                   ▼                             │
         │          DocuGardener re-indexes                │
         │          NestFleet KB updated                   │
         │                   │                             │
         ▼                   ▼                             │
   PR blocked ◄────── Next similar signal                  │
   (engineer must     auto-resolved by AI ◄────────────────┘
    fix the fix)      using the updated KB
                           (deflection)
```

The loop is complete when a doc fix directly prevents the next customer from filing the
same support case. Deflection attribution (bridge metric) closes the ROI measurement.

### 6.4 Incident Doc Requirement

For every production incident that results in a post-mortem, Client A should enforce:

1. **A runbook CR** is created before the incident case is closed.
2. The runbook CR requires DocuGardener CI check passage — the runbook update must
   match the current system state, not just contain new text.
3. The incident case is not closed until the runbook CR reaches `completed`.

This prevents the most common failure mode: runbooks are updated, but the update contains
errors or still references the old architecture.

### 6.5 Doc Coverage SLAs

Based on UC patterns, Client A should configure the following DocuGardener thresholds
as NestFleet trigger conditions:

| Module | Drift threshold | Resulting NestFleet signal | Severity |
|--------|----------------|---------------------------|----------|
| Public API docs | > 0.40 | Case created immediately | normal |
| SDK reference docs | > 0.50 | Case created immediately | normal |
| Runbooks / ops docs | > 0.60 | Case created immediately | normal |
| Internal service contracts | > 0.70 | Case created in next digest | low |
| Changelog / release notes | > 0.80 | Case created in next digest | low |
| CI/CD gate violation | Any drift | Release blocked + case created | high |

---

## 7. Configuration Requirements

### 7.1 NestFleet Product Configuration

For Client A's product in NestFleet (`support_policy`):

```json
{
  "github_repo": "client-a/product-x",
  "auto_reply_enabled": true,
  "quiet_hours": { "start": 20, "end": 8, "timezone": "UTC" },
  "escalation_team": ["support_lead", "change_lead"],
  "enabled_channels": ["email", "github", "chat", "contact_form"],
  "lead_assignments": {
    "support_lead":  "support@client-a.io",
    "change_lead":   "cto@client-a.io",
    "knowledge_lead": "docs@client-a.io"
  },
  "bridge": {
    "docugardener_enabled": true,
    "auto_create_cr_on_drift": true,
    "drift_cr_risk_default": "low"
  }
}
```

### 7.2 DocuGardener Configuration

For Client A's repos in DocuGardener (`.docugardener.yml`):

```yaml
ci:
  required_check: true           # Block PRs on drift > threshold
  threshold: 0.60                # Drift score that triggers CI failure
  scope:
    - docs/api/**
    - docs/sdk/**
    - docs/runbooks/**
  ignore:
    - docs/archive/**
    - docs/internal/scratch/**

bridge:
  nestfleet_enabled: true
  emit_on_drift: true            # Send bridge event on nightly scan drift
  emit_on_ci_failure: true       # Send bridge event on CI gate failure
  tenant_id: "client-a-tenant-id"

notifications:
  slack_webhook: "${DOCUGARDENER_SLACK_WEBHOOK}"
  targets:
    - role: doc_owner
    - role: platform_lead
```

### 7.3 Channel Setup Checklist

```
□ Email
  □ Postmark inbound address configured for support@productx.io
  □ Forward rule → POST /webhooks/email/:productId
  □ Resend FROM address verified

□ GitHub
  □ Webhook configured on client-a/product-x repo
  □ Webhook URL: POST /webhooks/github/:productId
  □ Events: issues, pull_request, check_suite, deployment_status
  □ Secret configured (X-Hub-Signature-256 validation)

□ Chat Widget
  □ ch_pub_ key generated in NestFleet Console
  □ Widget script embedded on productx.io support page
  □ data-api pointing at NestFleet public URL
  □ Pre-chat form: name + email fields enabled

□ Contact Form
  □ cf_pub_ key generated in NestFleet Console
  □ Contact form on productx.io pointing at POST /webhooks/contact-form/:productId
  □ Origin allowlist configured (contactFormAllowedOrigins)

□ DocuGardener Bridge
  □ Bridge enabled in support_policy
  □ DocuGardener tenant ID matches NestFleet tenant ID
  □ bridge_events table provisioned in PlatformCloud DB
  □ pg-boss topics registered: bridge.*

□ Operator Notifications
  □ Slack webhook URL in product config
  □ Lead email addresses in lead_assignments
  □ Quiet hours verified for timezone
```

---

## 8. Success Metrics

### 8.1 Support Operations

| Metric | Target | Source |
|--------|--------|--------|
| Customer first-response time | < 4 hours (business hours) | NestFleet case timestamps |
| Auto-resolution rate | ≥ 25% of eligible cases | NestFleet Analytics V4 |
| Doc-related cases as % of total | < 15% (decreasing over time) | NestFleet case labels |
| Cases deflected by updated docs | Increasing month-over-month | Bridge deflection metric |
| CI gate violation frequency | Decreasing sprint-over-sprint | DocuGardener / NestFleet |

### 8.2 Documentation Quality

| Metric | Target | Source |
|--------|--------|--------|
| Average drift score across public docs | < 0.30 | DocuGardener health panel |
| Time from drift detected to CR resolved | < 5 business days | NestFleet case lifecycle |
| CI gate failure rate (% of PRs blocked) | < 5% | GitHub / DocuGardener CI |
| Runbook currency (post-incident update rate) | 100% within 24h | NestFleet incident CRs |
| Proactive drift fixes (no customer report first) | > 60% of doc fixes | source_type=scheduled vs email |

### 8.3 Engineering Ops

| Metric | Target | Source |
|--------|--------|--------|
| CR approval cycle time | < 2 business days (medium risk) | NestFleet CR timestamps |
| Stale CRs (approval-pending > 3 days) | 0 at sprint review | NestFleet Approvals queue |
| Doc debt backlog size | Flat or decreasing | NestFleet cases (source: scheduled) |
| Incident-to-runbook-updated cycle time | < 24 hours | NestFleet incident CR lifecycle |

---

## 9. Anti-Patterns to Avoid

| Anti-pattern | Why it breaks the system | Correct approach |
|--------------|--------------------------|-----------------|
| Closing NestFleet cases without a CR for doc errors | The fix has no audit trail, DocuGardener never verifies it | Always create a CR for doc fixes, even low-risk ones |
| Merging doc PRs without DocuGardener CI check | The fix might introduce new drift (wrong terminology, stale refs) | Make DocuGardener CI a required check on all doc-touching PRs |
| Treating drift alerts as noise (closing without action) | Drift accumulates; customers hit it later | Every drift alert becomes a case; cases get CRs; CRs get prioritized |
| Bypassing Change Lead approval on "obviously safe" doc fixes | Removes accountability; doc fixes can have wide blast radius (SDK types, API specs) | Low-risk CRs should use auto-approve threshold, not manual bypass |
| Using NestFleet only for reactive support | Miss the proactive loop entirely; doc debt grows silently | Configure bridge + thresholds so DocuGardener feeds NestFleet proactively |
| Siloing: Support team ignores DocuGardener alerts, Doc team ignores NestFleet cases | Two teams solving the same problem independently | Single NestFleet queue for both streams; shared sprint doc-debt review |

---

## 10. Related Documents

| Document | Purpose |
|----------|---------|
| [`../specs/nestfleet-docugardener-integration.md`](../specs/nestfleet-docugardener-integration.md) | Technical bridge spec: event schemas, DB tables, queue topics, rollout plan |
| [`../reference/case-and-change-lifecycle.md`](../reference/case-and-change-lifecycle.md) | Case and CR state machines, transition rules |
| [`../reference/notification-model.md`](../reference/notification-model.md) | Notification priority, quiet hours, digest logic |
| [`../business/product-suite-strategy.md`](../business/product-suite-strategy.md) | Suite positioning and cross-sell strategy |
| [`../business/beta-evaluation-scenarios.md`](../business/beta-evaluation-scenarios.md) | Beta test scenarios (DG-01..09, SS-01..09, XP-01..03, NF-01..08) |
