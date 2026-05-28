// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

export interface GuideEntry {
  slug: string
  title: string
  description: string
  content: string // markdown string
}

export const GUIDES: GuideEntry[] = [
  {
    slug: "concepts",
    title: "Core Concepts",
    description:
      "Cases, Signals, Change Requests, Outcome Units, and the NestFleet vocabulary.",
    content: `# Core Concepts

NestFleet has a small, precise vocabulary. Understanding these terms makes every other guide much clearer.

## Signal

A **Signal** is any inbound message or event from the outside world — a support email, a Telegram message, a GitHub issue, or a webhook payload. Signals are the raw input; NestFleet normalises them into Cases before any AI processing begins.

## Case

A **Case** is the central unit of work. Every Signal becomes a Case. A Case carries the original content, the source channel, a severity (P0–P4), a type (bug, feature-request, question, …), a confidence score, and a lifecycle status.

## Change Request (CR)

A **Change Request** is a structured proposal to modify the product. When the triage agent determines that a Case represents a novel bug or a significant feature request, it drafts a CR with affected surfaces, risk level, recommended approver, and — optionally — a GitHub Pull Request artifact.

## Outcome Unit (OU)

An **Outcome Unit** measures billable AI consumption. One OU is roughly one agent invocation (triage, auto-reply, CR draft, knowledge update). Dashboards show OU burn rate per product and per feature.

## Knowledge Base

The **Knowledge Base** is a living collection of FAQs, runbooks, and known-issue records. Every resolved Case can propose new entries or updates. The knowledge base feeds the RAG context for auto-reply and triage.

## Product

A **Product** is the top-level organisational unit in NestFleet. Each product has its own channels, team members, knowledge base, settings, and case queue. You can operate multiple products from one NestFleet instance.

---

*Full content coming soon. This placeholder covers the key vocabulary — detailed explanations with examples will be added in a follow-up.*
`,
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    description:
      "From first login to your first resolved case.",
    content: `# Getting Started

This guide takes you from a fresh NestFleet account to your first AI-resolved case in under 30 minutes.

## Prerequisites

- A NestFleet account (SaaS at nestfleet.dev, or self-hosted — see the Self-Hosting docs)
- An LLM API key (Anthropic Claude, OpenAI GPT-4, or Google Gemini)
- Optional: a GitHub account if you want Change Request PR drafting

## Step 1 — Create your first Product

After logging in you land on the product selector. Click **New Product** and give it a name and a short slug (e.g. \`my-app\`). The slug is used in URLs and API paths — it cannot be changed later.

## Step 2 — Configure your LLM

Go to **Settings → LLM** and enter your API key. Select the standard model (used for auto-reply and CR drafting) and the fast model (used for triage). Recommended defaults:

| Tier | Model |
|------|-------|
| Standard | claude-sonnet-4-5 |
| Fast | claude-haiku-3-5 |

## Step 3 — Connect a channel

Go to **Settings → Channels** and connect at least one inbound channel (email, Telegram, GitHub, or webhook). Each channel has a guided setup flow.

## Step 4 — Send a test signal

Use the **Send test signal** button in the channel settings to inject a sample message. Within a few seconds a Case should appear in the queue with a triage result.

## Step 5 — Review and close

Open the Case from the queue. Review the triage reasoning, confirm or override severity, and click **Close** to resolve it. Congratulations — your first Case is done.

---

*Full content coming soon. Step-by-step screenshots and environment-specific instructions will be added in a follow-up.*
`,
  },
  {
    slug: "cases",
    title: "Managing Cases",
    description:
      "The case queue, lifecycle, approvals, and resolution.",
    content: `# Managing Cases

Cases are the day-to-day operational heartbeat of NestFleet. This guide covers the queue, lifecycle transitions, approvals, and resolution patterns.

## The Queue

The Cases queue (\`/p/[slug]/queue\`) shows all open cases for the selected product, sorted by severity (highest first) then arrival time (oldest first).

### Filters

| Filter | Description |
|--------|-------------|
| Status | new, triaged, awaiting-lead, open, auto-resolved, closed |
| Severity | P0 through P4 |
| Type | bug, feature-request, question, outage, … |
| Assignee | filter to your own queue or a team member's |
| Channel | email, Telegram, GitHub, webhook |
| Date range | narrow to a specific time window |

## Lifecycle

Cases move through these states:

- **new** — arrived, triage job enqueued
- **triaged** — triage complete, waiting for routing
- **awaiting-lead** — low confidence or escalated; a lead must review
- **open** — acknowledged, actively being worked on
- **auto-resolved** — auto-reply sent; pending human confirmation
- **closed** — resolved and closed

## Approvals

Cases flagged as requiring approval (P0/P1, or cases with low confidence that triggered a Change Request) appear in the **Approvals** tab. A Support Lead or Change Lead must approve before the action is finalised.

## Resolution

To resolve a case:
1. Open the case detail view
2. Add any internal notes
3. Click **Close** and select a resolution reason
4. Optionally link to a Knowledge Base entry created during resolution

---

*Full content coming soon. Bulk actions, SLA tracking, and escalation flows will be covered in a follow-up.*
`,
  },
  {
    slug: "change-requests",
    title: "Change Requests",
    description:
      "CR workflow, GitHub PR drafting, and approval gates.",
    content: `# Change Requests

A **Change Request (CR)** is a structured proposal to modify the product, generated by the AI agent when a Case represents a novel defect or significant feature request.

## How CRs are created

When the triage agent classifies a case as a \`bug\` or \`feature-request\` with sufficient confidence, it automatically drafts a CR containing:

- **Title** — a concise description of the change
- **Summary** — one paragraph explaining the problem and proposed fix
- **Affected surfaces** — which parts of the codebase or product are affected
- **Risk level** — Low / Medium / High / Critical
- **Recommended approver** — the role best placed to review this change
- **GitHub PR artifact** — an optional draft PR linked to your connected repository

## The CR lifecycle

| State | Meaning |
|-------|---------|
| draft | AI-generated, not yet reviewed |
| pending-approval | Submitted for human review |
| approved | Approved by the designated lead |
| rejected | Rejected with a reason; case re-queued |
| implemented | Change merged or deployed |
| closed | CR closed without implementation |

## Approval gates

CRs require approval from the appropriate lead role before implementation proceeds:

- **High / Critical risk** — Change Lead must approve
- **Medium risk** — Support Lead or Change Lead can approve
- **Low risk** — Any team member with \`approve_cr\` permission

## GitHub PR drafting

If you have connected a GitHub App in Settings → Integrations, NestFleet can draft a Pull Request template in your repository. The PR includes the CR summary, affected files (best-effort from the AI analysis), and a checklist for the reviewer.

---

*Full content coming soon. Multi-step approval chains and rejection workflows will be added in a follow-up.*
`,
  },
  {
    slug: "knowledge-base",
    title: "Knowledge Base",
    description:
      "Adding sources, reviewing AI-proposed updates, RAG best practices.",
    content: `# Knowledge Base

The Knowledge Base is a living library of FAQs, runbooks, and known-issue records that NestFleet uses to answer questions, triage cases, and draft auto-replies.

## Types of entries

| Type | Purpose |
|------|---------|
| FAQ | Frequently asked questions and their answers |
| Known Issue | A documented bug with status and workaround |
| Runbook | Step-by-step operational procedure |
| Policy | Internal policy or decision record |

## Adding entries manually

Go to **Knowledge Base** in the sidebar and click **New Entry**. Fill in the title, content (markdown supported), and tags. Entries are immediately available for RAG retrieval.

## AI-proposed updates

After every resolved case, NestFleet's knowledge agent analyses the resolution and proposes:

1. New FAQ entries based on the question and answer
2. Updates to existing known-issue records
3. New runbook steps if a manual workaround was documented

Proposed updates appear in the **Pending Review** tab. A Knowledge Lead reviews and accepts or rejects each proposal.

## RAG best practices

- **Keep entries focused** — one concept per entry makes retrieval more precise
- **Use consistent terminology** — the AI matches on vocabulary; inconsistent terms reduce recall
- **Add tags** — tags filter the retrieval context and prevent noise from unrelated sections
- **Archive stale entries** — outdated content degrades answer quality; archive rather than delete (preserves audit history)
- **Review proposed updates weekly** — a growing backlog of unreviewed proposals reduces the quality signal

---

*Full content coming soon. Embedding configuration and vector search tuning will be covered in a follow-up.*
`,
  },
  {
    slug: "team-and-roles",
    title: "Team & Roles",
    description:
      "The 6 built-in roles, inviting users, and permissions.",
    content: `# Team & Roles

NestFleet uses role-based access control (RBAC) with six built-in roles. Roles are assigned per product — the same user can be a Support Lead on one product and a viewer on another.

## Built-in roles

| Role | Primary responsibility |
|------|----------------------|
| **Admin** | Full access to all settings, users, and data. Can create and delete products. |
| **Operator** | Day-to-day case management and queue operations. Cannot change LLM or billing settings. |
| **Support Lead** | Can approve cases and auto-replies. Receives P0/P1 escalation alerts. |
| **Change Lead** | Can approve and reject Change Requests. Manages the CR pipeline. |
| **Product Lead** | Manages product settings, channels, and integrations. Cannot access billing. |
| **Knowledge Lead** | Reviews and approves AI-proposed knowledge base updates. |

## Inviting users

1. Go to **Settings → Team**
2. Click **Invite member**
3. Enter the user's email address and select their role
4. The user receives an invitation email with a one-time sign-up link

## Permission matrix

| Action | Admin | Operator | Support Lead | Change Lead | Product Lead | Knowledge Lead |
|--------|-------|----------|--------------|-------------|--------------|----------------|
| View cases | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Close cases | ✓ | ✓ | ✓ | — | — | — |
| Approve auto-reply | ✓ | — | ✓ | — | — | — |
| Approve CR | ✓ | — | ✓ | ✓ | — | — |
| Manage channels | ✓ | — | — | — | ✓ | — |
| Manage knowledge | ✓ | — | — | — | — | ✓ |
| Change LLM settings | ✓ | — | — | — | ✓ | — |
| Manage team | ✓ | — | — | — | — | — |

---

*Full content coming soon. Custom role composition and org-level admin controls will be added in a follow-up.*
`,
  },
  {
    slug: "notifications",
    title: "Notifications",
    description:
      "Email, Slack, per-product preferences, and digests.",
    content: `# Notifications

NestFleet sends notifications through email and Slack (Telegram for self-hosted instances). Preferences are configured per product per user.

## Notification channels

| Channel | Use case |
|---------|----------|
| **Email** | Case assignments, CR approvals, weekly digest |
| **Slack** | Real-time P0/P1 alerts, CR pending approval |
| **Telegram** | Real-time alerts (self-hosted, configured in Settings) |
| **In-app** | All notification types, always on |

## Event types

| Event | Who is notified |
|-------|----------------|
| New P0/P1 case | Support Lead, on-call team |
| Case assigned to you | Assignee |
| CR pending approval | Designated approver role |
| CR approved / rejected | CR creator |
| Knowledge proposal ready | Knowledge Lead |
| Weekly digest | All team members with digest enabled |

## Configuring preferences

Go to **Settings → Notifications** (per product) to:

- Enable or disable each event type per channel
- Set quiet hours (no alerts between 22:00 and 07:00 local time)
- Choose digest frequency (daily / weekly / off)

## Slack integration

1. Go to **Settings → Integrations → Slack**
2. Click **Add to Slack** and authorise the NestFleet app in your workspace
3. Select the default alert channel
4. Optionally configure per-severity routing (P0 → \`#incidents\`, P1 → \`#support\`)

---

*Full content coming soon. Webhook-based notification forwarding will be added in a follow-up.*
`,
  },
  {
    slug: "analytics",
    title: "Analytics",
    description:
      "Dashboards, token costs, OU consumption, and trends.",
    content: `# Analytics

The Analytics dashboard gives you a real-time view of case volume, AI performance, team workload, and cost metrics.

## Dashboard sections

### Case volume

- Cases received per day / week / month
- Breakdown by severity, type, and channel
- Resolution time distribution (P0–P4 separately)
- Cases auto-resolved vs. manually closed

### AI performance

- Triage accuracy (cases where severity was overridden by a human)
- Auto-reply acceptance rate
- Average confidence score over time
- CR approval rate and rejection reasons

### Token costs

- Total tokens consumed per model per day
- Cost per resolved case
- Cost breakdown by feature (triage, auto-reply, CR drafting, knowledge updates)

### Outcome Units (OUs)

- OU consumption per product
- OU burn rate vs. plan allowance
- Projected month-end consumption

## Filters

All charts support filtering by:

- Date range (last 7 days, last 30 days, custom)
- Product (if you operate multiple products)
- Team member

## Exporting data

Click **Export CSV** on any chart panel to download the underlying data. Exports include all dimensions and metrics for the selected date range.

---

*Full content coming soon. Custom dashboards and alert thresholds will be added in a follow-up.*
`,
  },
  {
    slug: "settings",
    title: "Settings & Configuration",
    description:
      "LLM tiers, embedding, registration, backup, and retention.",
    content: `# Settings & Configuration

Product and instance-level settings control how NestFleet behaves for your team and your AI pipeline.

## LLM configuration

Go to **Settings → LLM** to configure:

| Setting | Description |
|---------|-------------|
| Standard model | Used for auto-reply drafting and CR generation |
| Fast model | Used for triage (lower cost, lower latency) |
| API key | Your provider key (Anthropic, OpenAI, or Google) |
| Auto-reply confidence threshold | Minimum confidence required for autonomous reply (default: 0.80) |

### Recommended model pairings

| Use case | Standard | Fast |
|----------|----------|------|
| High quality, moderate volume | claude-sonnet-4-5 | claude-haiku-3-5 |
| Cost-optimised, high volume | gpt-4o-mini | gpt-4o-mini |
| Maximum quality | claude-opus-4 | claude-sonnet-4-5 |

## Embedding configuration

The knowledge base uses a separate embedding model for vector search. Configure it under **Settings → Knowledge Base → Embedding**:

- **Provider** — OpenAI (text-embedding-3-small) or Anthropic (voyage-3-lite)
- **Dimensions** — 1536 (OpenAI) or 512 (Voyage)

Changing the embedding model requires re-indexing the knowledge base. This can take several minutes for large knowledge bases.

## Registration settings

Admins can control who can sign up:

- **Open registration** — anyone can create an account
- **Invite-only** — new users must be invited by an existing admin
- **Disabled** — no new registrations (useful after initial team setup)

## Data retention

Configure how long case data is retained under **Settings → Data**:

- Case retention: 30 days / 90 days / 1 year / indefinite
- Audit log retention: always 1 year minimum (cannot be reduced)
- Knowledge base entries: indefinite (archive instead of delete)

## Backup

See the Self-Hosting → Backup & Restore guide for database backup configuration. SaaS customers have automatic daily backups with a 30-day retention window.

---

*Full content coming soon. SAML SSO, IP allowlists, and advanced retention policies will be added in a follow-up.*
`,
  },
]
