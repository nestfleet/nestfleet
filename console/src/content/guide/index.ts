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

NestFleet models product operations as a small set of well-defined primitives. Understanding these five or six nouns is enough to navigate the rest of the product, the API, and the console. This page introduces each one, explains why it exists, and shows how they connect.

## Signal

A **Signal** is the raw atom of input. Every email reply, Telegram message, GitHub issue comment, contact-form submission, or external webhook arrives at NestFleet as a Signal. A Signal records *where* the message came from (channel), *who* sent it (a normalised identity), *what* was said (the body), and *when* it arrived.

Signals are immutable. They are the audit trail. Anything NestFleet "knows" about a user complaint can ultimately be traced back to one or more Signals.

> **Why it exists:** decoupling raw ingestion from interpretation lets us replay, re-triage, and debug without losing source-of-truth data.

## Case

A **Case** is a unit of *work*. One or more related Signals are grouped into a Case — for example, an inbound email and the three follow-up replies in the same thread all belong to one Case. The Case is what an operator opens, what the LLM triages, what gets resolved.

Each Case has:

- a **lifecycle state** (\`open\`, \`triaged\`, \`in_resolution\`, \`in_change\`, \`awaiting_lead\`, \`resolved\`, \`closed\`)
- a **triage result** (severity, type, confidence)
- a **lineage timeline** (every signal, every AI action, every human action)
- zero or more linked **Conversations**, **Change Requests**, or **KB proposals**

See [Managing Cases](./cases.md) for the full lifecycle.

## Conversation

A **Conversation** is the outbound side of a Case — the reply thread NestFleet (or an operator) sends back to the reporter. When the auto-reply agent drafts a message, it lives inside a Conversation attached to the Case. Conversations track delivery status, threading IDs, and any follow-up Signals that come back in.

## Change Request (CR)

When triage decides a Case represents a *novel* bug or feature gap — not something the knowledge base already covers — NestFleet creates a **Change Request**. A CR captures the proposed code or content change, the affected surfaces, a risk level, and a recommended approver. If a GitHub repo is connected, NestFleet drafts a pull request and tracks its CI status against the CR. See [Change Requests](./change-requests.md).

## Knowledge Base (KB)

The **Knowledge Base** is NestFleet's long-term memory: product docs, FAQs, runbooks, and accepted past resolutions. It is chunked and embedded so the triage and auto-reply agents can retrieve relevant context (RAG) before deciding what to do. After a Case is resolved, NestFleet often proposes new KB entries based on what was learned. See [Knowledge Base](./knowledge-base.md).

## Product

A **Product** is the top-level tenant inside NestFleet. Channels, KB entries, team members, LLM config, notification rules, and analytics are all scoped to a Product. Most self-hosters run a single Product; SaaS-style deployments may host several.

## Channel

A **Channel** is an inbound source: an email mailbox, a Telegram bot, a GitHub repo, a contact form embed, or a generic webhook endpoint. Each Channel produces Signals tagged with its identity. Channels can be paused, rate-limited, or routed to specific operators.

## Persona / Role

Every user belongs to one of six built-in **Roles**: Admin, Operator, Support Lead, Change Lead, Product Lead, Knowledge Lead. Roles gate which actions a user can take in the console and API. See [Team & Roles](./team-and-roles.md).

## Outcome Unit (OU)

An **Outcome Unit** is NestFleet's billable / metered atom. One OU is consumed whenever NestFleet autonomously *closes* a case (auto-reply accepted and sent, or resolved without operator action) or *escalates* a case via the AI pipeline. Routine actions like viewing the queue, manually replying, or re-triaging do not consume OUs.

> **Community tier:** capped at 200 OUs per calendar month by default. Set \`COMMUNITY_OU_LIMIT=0\` to remove the cap on your self-hosted instance.

## Glossary

| Term | One-line definition |
|------|---------------------|
| Signal | Raw inbound message from any channel |
| Case | A unit of work; one or more grouped Signals |
| Conversation | Outbound reply thread attached to a Case |
| Change Request (CR) | Proposed code/content change linked to a Case |
| Knowledge Base (KB) | Embedded long-term memory used for RAG |
| Product | Top-level tenant; everything is scoped to it |
| Channel | An inbound source (email, Telegram, GitHub, webhook) |
| Role | One of 6 permission sets assigned to each user |
| Outcome Unit (OU) | Metered atom; consumed on autonomous close/escalate |
| RAG | Retrieval-Augmented Generation — KB lookup before LLM call |

Next: [Getting Started](./getting-started.md).
`,
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    description:
      "From first login to your first resolved case.",
    content: `# Getting Started

This guide picks up immediately after a successful \`docker compose up -d\`. If you haven't reached that point yet, see the project README and \`self-hosting.md\` first.

## 1. Opening the console for the first time

Once the stack is healthy, open \`http://localhost:3000\` (or whatever host you mapped). The first browser session sees one of two things:

- **No users exist yet:** you are taken to \`/setup\` to create the first Admin account. Pick an email and a strong password — this account has full access and cannot be locked out by RBAC.
- **A user already exists:** you are taken to \`/login\`. Use your credentials, or click *Sign in with GitHub* if you configured OAuth (\`GITHUB_OAUTH_CLIENT_ID\`).

> **Tip:** the first Admin can disable open registration later (\`REGISTRATION_ENABLED=false\`) and invite teammates one at a time. See [Team & Roles](./team-and-roles.md).

## 2. The setup wizard

After your first login, NestFleet runs a short three-step wizard. It is safe to leave and return — partial progress is saved.

### Step 1 — Product

Give your product a **name** and **slug** (the slug appears in URLs and webhook paths). Optionally set a **support policy** snippet — this is fed to the auto-reply agent so its tone matches your real support voice. You can also paste a **GitHub repo** (\`owner/name\`) now or later; this enables the Change Request → PR flow.

### Step 2 — LLM provider

Pick a provider and paste a key:

| Provider | Env var | Notes |
|----------|---------|-------|
| Anthropic | \`ANTHROPIC_API_KEY\` | Recommended default |
| OpenAI | \`OPENAI_API_KEY\` | Works for all three tiers |
| Google | \`GOOGLE_GENERATIVE_AI_API_KEY\` | Gemini family |
| Ollama | \`OLLAMA_BASE_URL\` | Local / self-hosted, no key |

NestFleet uses three model tiers: \`LLM_MODEL\` (default), \`LLM_MODEL_FAST\` (cheap triage), \`LLM_MODEL_COMPLEX\` (PR drafting, hard reasoning). The wizard fills sensible defaults; tune later in [Settings](./settings.md).

### Step 3 — First channel

Add at least one inbound channel so NestFleet has something to ingest:

- **Contact form** — quickest. Copy the generated embed snippet to your site.
- **Email** — paste IMAP credentials, or forward to the unique address NestFleet displays.
- **Telegram** — paste a bot token from \`@BotFather\`.
- **Webhook** — copy the URL + signing secret to plug into any external system.
- **GitHub Issues** — connect via the OAuth app you registered.

## 3. Sending a test signal

From the wizard's final screen, click **Send test signal**. This posts a synthetic message through the channel you just configured and lands it in the case queue. Alternatively, hit the channel directly — for the webhook channel:

\`\`\`bash
curl -X POST "$NESTFLEET_URL/api/ingest/webhook/<channel-id>" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: <hmac>" \\
  -d '{"from":"test@example.com","subject":"Login broken","body":"I cannot reset my password."}'
\`\`\`

## 4. Watching the first case appear

Navigate to **Cases → Queue**. Within a few seconds the test Signal is grouped into a Case and enters the \`open\` state. The pg-boss worker then picks it up:

1. \`triage\` job runs — sets severity, type, confidence
2. \`kb.search\` job runs — looks for matching known issues
3. The Case transitions to one of: \`in_resolution\` (auto-reply drafted), \`awaiting_lead\` (escalation), \`in_change\` (Change Request created), or stays \`triaged\` (low confidence → operator review)

Open the case detail view to see the **lineage timeline** — every job, prompt, and decision is recorded. See [Managing Cases](./cases.md) for the full lifecycle.

## 5. What if the LLM isn't configured yet?

NestFleet degrades gracefully. If no provider key is set, or if the provider rejects your key, the pipeline pauses at the \`triage\` step and the Case stays in \`open\` with a banner reading *"AI pipeline disabled — configure an LLM provider in Settings."* Signals still ingest, cases still group, operators can still reply manually. Once you add a key, click **Retry triage** on any waiting case or wait for the next scheduled retry.

> **Note:** no Outcome Units are consumed while the pipeline is disabled.

## What's next

- Learn the [case lifecycle](./cases.md) and how to intervene at each step
- Set up your [Knowledge Base](./knowledge-base.md) so auto-reply has something to retrieve
- Connect more [channels](./settings.md#channels) and invite teammates via [Team & Roles](./team-and-roles.md)
- Wire up [notifications](./notifications.md) so escalations reach a human fast
`,
  },
  {
    slug: "cases",
    title: "Managing Cases",
    description:
      "The case queue, lifecycle, approvals, and resolution.",
    content: `# Managing Cases

Cases are where most operator time is spent. This guide walks through the queue view, the case lifecycle, the detail panel, and every intervention point an operator (or lead) has.

## The case queue

Open **Cases → Queue** in the console. The queue is a virtualised table sorted by *priority then age* by default.

### Columns

| Column | Meaning |
|--------|---------|
| **ID** | Short case ID (e.g. \`C-1042\`) |
| **Subject** | Inferred from the first Signal or set by triage |
| **State** | One of the lifecycle states (see below) |
| **Severity** | \`low\` / \`medium\` / \`high\` / \`critical\` — set by triage |
| **Type** | \`bug\`, \`question\`, \`feature\`, \`outage\`, \`other\` |
| **Confidence** | Triage confidence score (0–1) |
| **Channel** | The source channel icon |
| **Assignee** | Operator the case is routed to, if any |
| **Updated** | Relative time of last event |

### Filters

The filter bar supports state, severity, type, channel, assignee, and "needs my action" (cases waiting on the current user's role). Filters are URL-persisted — you can bookmark or share a view.

### Sort

Click any column header to sort. Multi-column sort is available via shift-click.

## Case lifecycle

\`\`\`
open  ──►  triaged  ──►  in_resolution  ──►  resolved  ──►  closed
                  │
                  ├──►  in_change      ──►  resolved  ──►  closed
                  │
                  └──►  awaiting_lead  ──►  resolved  ──►  closed
\`\`\`

| State | What it means | Who acts next |
|-------|---------------|---------------|
| \`open\` | Newly created from one or more Signals; not yet triaged | Pipeline (auto) |
| \`triaged\` | Triage finished; confidence too low for auto-routing | Operator |
| \`in_resolution\` | Auto-reply drafted, awaiting send or approval | Operator / Support Lead |
| \`in_change\` | A Change Request was created from this case | Change Lead |
| \`awaiting_lead\` | Severity escalated; lead must respond | Support Lead |
| \`resolved\` | Case is finished; KB proposal may be pending | Knowledge Lead (optional) |
| \`closed\` | Terminal state; archived to long-term storage | — |

## The case detail view

Click any row to open the detail panel. Three panes:

### Left — Signal & Conversation

The original message(s), normalised. Reply threads (Conversations) appear inline. Use **Reply** to compose manually, or **Approve & send** if an auto-reply draft is pending.

### Middle — AI Triage

Shows the structured triage output: severity, type, confidence, rationale, and any matched KB entries with their similarity scores. If confidence is below the configured threshold (default \`0.7\`), the case is held for operator review instead of auto-routed.

### Right — Lineage timeline

Every event in chronological order: signal received, triage started/finished (with token cost), KB hits, draft generated, operator action, state transitions, notifications sent, OUs charged. This is your audit trail.

## Approving or rejecting an auto-reply

When the auto-reply agent drafts a message, the case enters \`in_resolution\`. The draft appears in the left pane with three buttons:

- **Approve & send** — sends the reply as-is, marks the case \`resolved\`, charges 1 OU.
- **Edit & send** — opens an editor; saved edits are recorded in the lineage.
- **Reject** — discards the draft; the case returns to \`triaged\` for manual handling.

> **Tip:** Support Leads can configure *auto-send threshold* — drafts above a confidence (e.g. \`0.9\`) bypass approval entirely. See [Settings](./settings.md).

## Manually resolving a case

Any Operator can click **Resolve** on a case in any non-terminal state. You'll be prompted for a short resolution note (one sentence is fine — it feeds the KB proposal step). The case moves to \`resolved\`. No OU is charged for manual resolution.

## Correcting a wrong triage classification

If triage got severity or type wrong, click **Edit triage** in the middle pane. Your correction is saved both as the new case state *and* as a labelled training signal that improves future triage prompts (visible in [Analytics](./analytics.md) → Triage drift).

## Escalating a case manually

Click **Escalate** to push a case to \`awaiting_lead\`. You'll pick a lead role (Support / Change / Product) and optionally write a one-line context note. The matching lead receives a notification per their preferences.

## Search and filtering

The global search bar (\`/\` to focus) searches across:

- Case ID, subject, body of any Signal
- Reporter email or identity
- Triage rationale text
- Tags and assignees

Search supports prefix operators: \`state:awaiting_lead\`, \`severity:>=high\`, \`channel:telegram\`, \`assignee:me\`, \`before:2026-05-01\`. Combine freely — \`state:triaged severity:high channel:email\`.

Saved searches appear in the left rail and can be set as your default queue view.

## See also

- [Change Requests](./change-requests.md) — the \`in_change\` branch in depth
- [Knowledge Base](./knowledge-base.md) — how matching works and how proposals are reviewed
- [Notifications](./notifications.md) — making sure leads see escalations in time
`,
  },
  {
    slug: "change-requests",
    title: "Change Requests",
    description:
      "CR workflow, GitHub PR drafting, and approval gates.",
    content: `# Change Requests

A **Change Request** (CR) is NestFleet's bridge between customer signal and code change. When the pipeline decides a Case represents a real, novel problem — something the Knowledge Base does not already cover and that probably needs a fix, not a reply — it opens a CR and (optionally) drafts a pull request against your repo.

## When NestFleet creates a CR

Triage produces a \`type\` and a \`confidence\`. The CR branch is taken when **all** of the following hold:

1. \`type\` is \`bug\` or \`feature\`
2. No KB entry exceeded the match threshold (default cosine similarity \`0.78\`)
3. Confidence in the triage classification is above the auto-route threshold
4. The Product has a connected GitHub repo *or* a designated Change Lead

If a repo is connected, NestFleet immediately enqueues a \`cr.draft_pr\` job. If not, the CR is created in \`proposed\` state and waits for the Change Lead to act.

> **Note:** Operators can also create CRs manually from any case. See *Manual CR creation* below.

## The CR detail view

Open **Change Requests** in the side nav, or click the CR badge from a Case. The detail view has four sections:

### Summary

A one-paragraph problem statement, generated from the Case's signal(s) and triage rationale. Editable by Change Lead.

### Affected surfaces

A list of code paths, API endpoints, console pages, or docs pages that the LLM (using your repo's code search) believes are involved. Each entry links directly to the file at the inferred line range.

### Risk level

One of \`low\`, \`medium\`, \`high\`. Computed from: blast radius of affected surfaces, whether migrations are involved, presence of auth/billing code, and historical CR data. Risk drives which approver is recommended.

### Recommended approver

Defaults to the Change Lead, but escalates to Admin for \`high\`-risk CRs that touch auth, billing, or DB migrations.

## Approval workflow

A CR moves through:

\`\`\`
proposed  ──►  pr_drafted  ──►  pr_ready  ──►  approved  ──►  merged
                                            └►  rejected
                                            └►  changes_requested
\`\`\`

From the detail view, an authorised reviewer (Change Lead or Admin) has three buttons:

- **Approve** — marks the CR \`approved\`. If a PR exists, NestFleet posts an approving review and (optionally) merges if \`auto_merge=true\`.
- **Reject** — marks the CR \`rejected\`. The linked PR is closed with a referencing comment. The parent Case returns to \`triaged\` for alternative handling (e.g. manual reply).
- **Request changes** — keeps the CR open and posts a comment on the PR with the requested change. NestFleet's PR-revision agent will attempt one revision pass.

## GitHub PR drafting

When the \`cr.draft_pr\` job runs:

1. NestFleet clones a sparse checkout of the affected files into an ephemeral workspace
2. The \`LLM_MODEL_COMPLEX\` tier is invoked with the case context, KB excerpts, and existing code
3. A unified diff is produced and applied
4. A branch is created (\`nestfleet/cr-<id>\`), pushed, and a PR is opened via the GitHub API
5. CI status updates stream back into the CR via the GitHub webhook

The CR detail view shows the live PR status: branch name, commit SHA, files changed, CI checks, review threads.

> **Tip:** if CI fails, NestFleet automatically attempts up to \`CR_AUTO_FIX_RETRIES\` (default \`1\`) revision pass. After that, the CR is flagged for human attention.

## After approval vs rejection

**Approval path:**

1. CR marked \`approved\`, PR review submitted
2. If \`auto_merge=true\` and CI is green, NestFleet merges
3. The parent Case enters \`resolved\`
4. If reporter contact is known, NestFleet drafts a follow-up reply: *"This is fixed in version X — thanks for reporting."*
5. Notifications fire to: Change Lead, Support Lead, original reporter (optional)

**Rejection path:**

1. CR marked \`rejected\`, PR closed with reason
2. Parent Case returns to \`triaged\`
3. Notification fires to the operator who originally handled the case

Both transitions are recorded in the Case lineage and the CR audit log.

## Manual CR creation from a case

From any Case detail view, click **Create Change Request** in the actions menu. You'll be asked for:

- A one-line title
- A problem statement (pre-filled from the case)
- Optional affected surfaces (autocomplete from the repo)
- Risk level (defaults to \`medium\`)

The CR is created in \`proposed\` state. Click **Draft PR** at any time to invoke the same drafting pipeline used by automatic CRs.

## See also

- [Cases](./cases.md) — the parent Case lifecycle
- [Settings](./settings.md#github) — connecting a repo and configuring auto-merge
- [Team & Roles](./team-and-roles.md) — Change Lead permissions
`,
  },
  {
    slug: "knowledge-base",
    title: "Knowledge Base",
    description:
      "Adding sources, reviewing AI-proposed updates, RAG best practices.",
    content: `# Knowledge Base

The **Knowledge Base** (KB) is NestFleet's long-term memory. Everything the AI pipeline "knows" beyond the model's pretraining lives here: your product docs, FAQs, runbooks, past case resolutions, internal policy notes. Without a populated KB, NestFleet can still triage and route, but auto-reply quality is poor and the rate of true \`match\` outcomes is low. With a good KB, NestFleet becomes substantially more autonomous.

## How the KB feeds the pipeline

Two pipeline steps read from the KB:

1. **Triage** — when classifying a case, the triage prompt is given the top-K most similar KB chunks. This grounds the severity/type decision and lets the LLM say "this looks like the known issue documented in *Password reset returns 500*" instead of inventing context.
2. **Auto-reply** — the auto-reply agent retrieves KB chunks scoped to the case's inferred topic and quotes them (with internal citations) when drafting the response.

Retrieval uses vector similarity over OpenAI-compatible embeddings stored in **pgvector**. Default settings retrieve the top 8 chunks above cosine similarity \`0.72\`.

## Adding knowledge sources

Open **Knowledge Base → Sources**. Three ways to add content:

### Manual entry

Click **New entry**. Pick a type (\`faq\`, \`runbook\`, \`policy\`, \`doc\`, \`past_resolution\`), give it a title, and write the body in Markdown. Tags and a product-area field improve retrieval precision.

### Document upload

Drag a file in (\`.md\`, \`.pdf\`, \`.txt\`, \`.html\`). NestFleet parses, splits into chunks, embeds each chunk, and stores them. The original file is kept for re-embedding when you change the embedding model.

### URL crawl

Paste a URL or sitemap. NestFleet crawls (respecting \`robots.txt\`), extracts main content, and ingests each page as an entry. Set a re-crawl schedule (\`daily\`, \`weekly\`, \`monthly\`, \`never\`) per source.

> **Tip:** if your docs site is in a Git repo, add it via **Sources → Git** and NestFleet will re-sync on every push using the GitHub webhook.

## Auto-proposed KB updates

When a case is resolved — manually or via auto-reply — a \`kb.propose\` job runs. The agent looks at the original Signal, the actual resolution (reply text or CR diff), and the current KB. It then drafts one of three outputs:

| Proposal kind | When it triggers |
|---------------|------------------|
| **New entry** | The case is genuinely novel and no existing KB chunk overlaps |
| **Entry update** | A close-but-stale KB entry exists; the proposal patches it |
| **No-op** | The resolution adds no new information |

Proposals appear under **Knowledge Base → Proposals** with a diff view (for updates) or a preview (for new entries).

## Reviewing proposals

The Knowledge Lead (or any Admin) sees pending proposals. For each:

- **Accept** — adds the entry / applies the patch and re-embeds. The original case is linked as the proposal source.
- **Edit & accept** — opens an inline editor before saving.
- **Reject** — discards. Optionally captures a one-line reason that feeds a "rejected proposals" filter used to tune the proposer prompt.

> **Note:** rejecting many similar proposals is a strong signal that your retrieval threshold or proposer temperature needs adjusting. Check [Analytics](./analytics.md) → KB hygiene.

## Chunking & embedding (conceptual)

You do not configure chunking directly, but it helps to know what's happening:

- Documents are split by semantic boundaries (headings first, paragraphs second, hard 1200-token max)
- Each chunk gets a metadata envelope: source, type, tags, parent doc, position
- Chunks are embedded with the configured embedding model (default \`text-embedding-3-small\`, 1536 dims)
- Vectors and metadata are stored in the \`kb_chunks\` table with an HNSW index

Changing the embedding model triggers a background re-embed of all entries. NestFleet keeps both vector sets until the new one is fully populated, then switches atomically.

## Best practices for KB content

A small, well-structured KB beats a huge dumped one. Guidelines:

1. **One concept per entry.** If a FAQ answer covers two unrelated problems, split it. RAG retrieves chunks; tight chunks score higher.
2. **Lead with the symptom, not the cause.** Users describe symptoms; the embedding will match better if your KB does too. *"Login button does nothing"* beats *"NextAuth session race condition."*
3. **Include the user-visible message verbatim.** Quote the exact error text — this is gold for similarity matching.
4. **Date your runbooks.** Add a \`last_verified: YYYY-MM-DD\` line. The auto-reply agent treats stale entries with lower confidence.
5. **Use \`past_resolution\` aggressively.** Accept the auto-proposed entries — they encode real, lived support knowledge in the exact words your users used.
6. **Tag by surface, not by team.** *"billing-portal"* is a better tag than *"team-payments"*. Surfaces are stable; teams reorganise.

## See also

- [Cases](./cases.md) — where KB matches surface in the triage pane
- [Analytics](./analytics.md) → KB hygiene metrics
- [Settings](./settings.md#embedding) — choosing an embedding provider and dimensions
`,
  },
  {
    slug: "team-and-roles",
    title: "Team & Roles",
    description:
      "The 6 built-in roles, inviting users, and permissions.",
    content: `# Team & Roles

NestFleet uses role-based access control (RBAC) with six built-in roles. Every authenticated user has exactly one role per Product. This guide explains what each role can do, how to invite teammates, how to change roles, and how to enable GitHub OAuth.

## The six roles

| Role | Cases | Auto-reply approval | Change Requests | Knowledge Base | Team & billing | Product config |
|------|-------|---------------------|-----------------|----------------|----------------|----------------|
| **Admin** | Full | Approve / send | Approve / merge | Full | Manage users, view billing | Edit all |
| **Operator** | Read & resolve, reply manually | Send only if pre-approved | Read | Read | — | Read |
| **Support Lead** | Full, can reassign | **Approve / reject** drafts, set thresholds | Read | Read, propose entries | View team | Read |
| **Change Lead** | Read | — | **Approve / reject / merge**, manage PR templates | Read | View team | Read GitHub config |
| **Product Lead** | Read | — | Read | Read | View team | Read all settings |
| **Knowledge Lead** | Read | — | Read | **Full** — accept/reject proposals, manage sources | View team | Read |

### Role notes

- **Admin** is the only role that can change other users' roles or invite new users.
- **Operator** is the day-to-day workhorse — they can resolve cases, reply to customers, and pause channels, but cannot approve AI-drafted replies or change requests.
- **Support Lead** owns reply quality. They tune the auto-send threshold and review borderline drafts.
- **Change Lead** owns code-change governance. They are the human gate between the LLM and your repo's \`main\` branch.
- **Product Lead** is intentionally read-only on operations but sees full analytics — designed for founders / PMs who want visibility without operational risk.
- **Knowledge Lead** curates the KB. In small teams this often pairs with Support Lead in a single person.

> **Tip:** roles are *additive within seniority lanes* — an Admin can do everything a Lead can do. But Leads are siloed from each other; a Change Lead cannot approve auto-replies.

## Inviting users

1. Open **Settings → Team**
2. Click **Invite member**
3. Enter an email address and pick a role
4. Optionally write a short welcome note
5. Click **Send invite**

The invitee receives an email with a single-use link valid for 7 days. Clicking it lands them on a sign-up page where they set their password (or sign in with GitHub — see below). After their first login, the invite is consumed and they appear in the team list as \`active\`.

If your SMTP isn't configured yet, the invite link is displayed in the dialog after creation — copy and send it manually.

> **Note:** while \`REGISTRATION_ENABLED=false\`, invites are the *only* way to add users. This is the recommended setting for production.

## Assigning and changing roles

From **Settings → Team**, click a user row. The slide-over panel shows:

- Current role and the date it was last changed
- A dropdown to set a new role (Admin only)
- A list of recent actions (audit trail)
- A **Deactivate** button (preserves history; the user can no longer log in)
- A **Remove** button (Admin-only; soft-deletes after a 30-day grace period)

Role changes take effect on the user's next request. If they're currently logged in, their session is re-evaluated against the new permissions automatically — no logout required.

## GitHub OAuth login

Instead of password login, users can sign in with GitHub. This is recommended for engineering teams since it removes one credential to manage.

### Setup (Admin, one-time)

1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set the callback URL to \`https://<your-host>/api/auth/github/callback\`
3. Copy the Client ID and Client Secret
4. In NestFleet, **Settings → Auth → GitHub OAuth**, paste both values
5. Toggle **Enable GitHub sign-in**

Set the following env vars (or use the settings page, which writes them for you):

\`\`\`bash
GITHUB_OAUTH_CLIENT_ID=Iv1.xxxxxxxxxxxxx
GITHUB_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OAUTH_CALLBACK_URL=https://app.example.com/api/auth/github/callback
\`\`\`

### User experience

On the login page, users see a **Sign in with GitHub** button. The first time someone signs in, NestFleet checks for an invite matching their GitHub email; if found, the invite is consumed and the user is created with the invited role. If no invite matches and \`REGISTRATION_ENABLED=false\`, sign-in is rejected.

> **Tip:** you can restrict GitHub sign-in to a specific organisation by setting \`GITHUB_OAUTH_REQUIRE_ORG=your-org\`. Members outside the org are denied even with a valid GitHub token.

## See also

- [Settings](./settings.md) — registration lock, OAuth env vars
- [Cases](./cases.md) — what each role sees in the queue
- [Change Requests](./change-requests.md) — Change Lead workflow in depth
`,
  },
  {
    slug: "notifications",
    title: "Notifications",
    description:
      "Email, Slack, per-product preferences, and digests.",
    content: `# Notifications

Notifications are how NestFleet pulls a human into the loop when the AI pipeline can't or shouldn't act alone. This guide covers the events that trigger notifications, how to wire up email and Slack, and how to test the channels end-to-end.

## Triggering events

NestFleet emits notifications for the following events. Each can be enabled, disabled, or routed independently per role and per product.

| Event | Default recipient | Default channel |
|-------|-------------------|------------------|
| **Case escalated to lead** | Support Lead | Email + Slack |
| **Auto-reply awaiting approval** | Support Lead | Slack |
| **Change Request created** | Change Lead | Email |
| **PR ready for review** | Change Lead | Slack |
| **PR CI failed** | Change Lead | Slack |
| **KB proposal pending** | Knowledge Lead | Daily digest |
| **Stale case warning** (no action in 24h) | Assignee + Support Lead | Email |
| **OU limit 80% reached** | Admin | Email |
| **OU limit reached** | Admin | Email + Slack |
| **Channel ingestion failure** | Admin + Operator | Slack |
| **Authentication anomaly** (5+ failed logins) | Admin | Email |

> **Tip:** the "needs my action" queue filter in [Cases](./cases.md) is the in-app equivalent of these notifications. You don't *have* to wire up email or Slack — but in practice, async teams need at least one.

## Email setup

Open **Settings → Notifications → Email**. Three providers are supported.

### SMTP

For any IMAP/SMTP mailbox (Gmail, Fastmail, your own MX, etc.):

\`\`\`bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=app-password-here
SMTP_FROM="NestFleet <notifications@example.com>"
SMTP_SECURE=true   # use STARTTLS
\`\`\`

### Postmark

\`\`\`bash
POSTMARK_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POSTMARK_FROM=notifications@example.com
\`\`\`

### Resend

\`\`\`bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM=notifications@example.com
\`\`\`

Only one provider is active at a time. The settings page lets you switch and re-test without restarting.

## Slack setup

Two options: an **incoming webhook** (simplest) or a **bot token** (richer interactivity).

### Incoming webhook

1. In Slack, **Apps → Incoming Webhooks → Add new webhook**
2. Pick a channel, copy the URL
3. In NestFleet, **Settings → Notifications → Slack**, paste the URL
4. Click **Send test message**

\`\`\`bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/your-webhook-token
\`\`\`

### Bot token

A bot token unlocks interactive buttons (Approve / Reject directly from Slack) and per-role channel routing.

1. Create a Slack app at \`api.slack.com/apps\`
2. Add scopes: \`chat:write\`, \`chat:write.public\`, \`users:read.email\`
3. Install to your workspace, copy the Bot User OAuth Token (\`xoxb-...\`)
4. In NestFleet, paste under **Slack → Bot token**

\`\`\`bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

> **Note:** if both webhook and bot token are configured, the bot token wins.

## Per-product notification preferences

Each Product has its own notification matrix. Open **Settings → Notifications → Routing**. The matrix is \`event × role × channel\`. For each cell, choose \`off\`, \`instant\`, or \`digest\`.

Common patterns:

- **Lean team:** all events to one shared Slack channel, instant.
- **Distributed team:** escalations instant to Slack, everything else digest by email.
- **Quiet hours:** route to digest between 18:00 and 09:00 local time. Configure per user under their profile.

## Digest schedule

Digest-routed events accumulate and ship in a single message:

- **Hourly digest** — fires at the top of each hour if there's content
- **Daily digest** — fires at 09:00 in the user's configured timezone (default \`UTC\`)
- **Weekly digest** — fires Monday 09:00; designed for Product Lead role

Each digest includes a one-line summary per event plus a deep-link back into the console.

## Testing notifications

From **Settings → Notifications**, every section has a **Send test** button. The test message includes the trigger name, the configured provider, and a timestamp — handy for confirming the message reached the right channel and looks right.

For end-to-end testing of an actual event:

\`\`\`bash
# Synthesise a stale-case event without waiting 24 hours
curl -X POST "$NESTFLEET_URL/api/admin/notifications/test" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"case.stale","case_id":"C-1042"}'
\`\`\`

If a test fails, check **Settings → Notifications → Delivery log** for the last 100 attempts, including status codes and response bodies from the provider.

## See also

- [Settings](./settings.md) — SMTP and Slack env vars
- [Team & Roles](./team-and-roles.md) — who sees which event by default
- [Analytics](./analytics.md) — notification volume metrics
`,
  },
  {
    slug: "analytics",
    title: "Analytics",
    description:
      "Dashboards, token costs, OU consumption, and trends.",
    content: `# Analytics

Analytics is where you decide whether NestFleet is actually doing its job — and where you find the levers to make it do better. The dashboard is read-only for Operators and Product Lead, fully interactive for Admin.

## The dashboard at a glance

Open **Analytics** in the left rail. The default view is a four-quadrant overview for the last 30 days:

| Quadrant | What it shows |
|----------|---------------|
| **Volume** | Cases received, by channel, stacked |
| **Outcomes** | Auto-resolved vs escalated vs manual, as % of total |
| **AI quality** | Triage confidence distribution, auto-reply approval rate |
| **Cost** | Token spend by model tier, OU consumption against the cap |

Date range is adjustable (last 7/30/90 days, this month, last month, custom). Channel and severity filters apply globally.

## Case resolution trends

The **Outcomes** chart breaks resolution mode into three series:

- **Auto-resolved** — auto-reply approved (or auto-sent) and customer didn't reply again within 72 hours
- **Escalated** — moved to a lead at any point; counted by the lead role that handled it
- **Manual** — operator handled the entire case without auto-reply being approved

A healthy steady state typically lands at 50–70% auto-resolved once your KB has matured. If auto-resolved is below 20% after a month of operation, investigate KB coverage (see [Knowledge Base](./knowledge-base.md)).

Click any bar segment to drill into the underlying case list.

## AI pipeline metrics

### Triage confidence distribution

A histogram of triage confidence scores. Look for:

- A **bimodal** distribution (clusters near 0.9 and 0.4) — healthy: the model is confident when it should be and humble when it shouldn't be
- A **uniform** distribution — unhealthy: the model is guessing. Often a sign of LLM model misconfiguration or a too-narrow KB

### Auto-reply success rate

For each drafted auto-reply, NestFleet tracks:

- **Approval rate** — drafts approved by humans, % of total drafted
- **Edit rate** — drafts approved-but-edited, % of approved
- **Bounce rate** — cases where the customer re-replied within 72h (a proxy for "the auto-reply didn't actually solve it")

> **Tip:** the gap between approval rate and bounce rate is the *real* auto-resolution rate. A 90% approval rate with a 40% bounce rate is worse than a 70% approval rate with a 5% bounce rate.

### Triage drift

A chart of operator triage corrections over time. If corrections climb after an LLM model change, your new model isn't a clean upgrade for this dataset — consider reverting.

## Token cost tracking

The **Cost** quadrant shows daily token spend split by model tier:

| Tier | Env var | Typical use |
|------|---------|-------------|
| Standard | \`LLM_MODEL\` | Auto-reply drafting, KB proposals |
| Fast | \`LLM_MODEL_FAST\` | Triage classification |
| Complex | \`LLM_MODEL_COMPLEX\` | PR drafting, deep reasoning |

For each tier you see input tokens, output tokens, and dollar cost (using the configured provider's published prices). The unit-economics card shows **cost per resolved case** and **cost per OU** — the two numbers worth printing on a sticker.

## Outcome Unit consumption

The **OU meter** shows month-to-date consumption against your cap. By default the Community tier is capped at 200 OUs per calendar month; the meter turns amber at 80% and red at 100%.

When the cap is hit:

- Cases continue to ingest and group
- Manual reply, manual resolve, and KB management continue to work
- The AI pipeline pauses on the next case it would charge an OU for (auto-close or escalate)
- A banner appears in the console; Admins receive a notification

To remove the cap on a self-hosted instance, set \`COMMUNITY_OU_LIMIT=0\` and restart. See [Settings](./settings.md#community-ou-limit).

## Exporting data

Three export formats from any chart:

- **CSV** — raw rows underlying the chart
- **PNG** — the chart image for slides
- **JSON** — the full time-series with metadata, useful for piping into an external BI tool

For programmatic access, the same data is available via \`GET /api/analytics/{metric}?from=...&to=...\` with an admin API token.

## Using analytics to tune the system

Two practical loops:

### Tune the LLM config

- Low approval rate + high token cost → switch \`LLM_MODEL\` to a stronger tier, accept higher cost per OU
- High triage drift → switch \`LLM_MODEL_FAST\` to a more capable model for triage, or raise the auto-route confidence threshold
- High bounce rate → the auto-reply isn't grounded enough — look at the KB

### Tune the KB

- Cases with no KB match + repeating subjects → write KB entries for the top recurring subjects
- High rejection rate on auto-proposed KB entries → the proposer is too eager; lower its temperature or tighten the schema
- Drop in auto-resolved % over time → KB drift, run a re-embed and audit \`last_verified\` dates

## See also

- [Knowledge Base](./knowledge-base.md) — tuning RAG quality
- [Settings](./settings.md) — model tier and embedding configuration
- [Cases](./cases.md) — the underlying records behind every metric
`,
  },
  {
    slug: "settings",
    title: "Settings & Configuration",
    description:
      "LLM tiers, embedding, registration, backup, and retention.",
    content: `# Settings & Configuration

This page is the reference for every operator-facing setting NestFleet exposes. Most can be edited in the console under **Settings**; all have an environment-variable equivalent that takes precedence and is the recommended approach for production.

## Product settings

Open **Settings → Product**.

| Field | What it does |
|-------|--------------|
| **Name** | Display name across the console and outbound emails |
| **Slug** | URL-safe identifier, used in webhook paths and exports |
| **Support policy** | Free-text snippet fed to the auto-reply agent's system prompt — set your tone here |
| **Default reply language** | Auto-reply target language; \`auto\` matches the incoming signal |
| **Business hours** | Used by escalation timing and stale-case detection |
| **GitHub repo** | \`owner/name\` — enables CR → PR drafting |

The support policy is the highest-leverage field: a few well-worded sentences ("We never apologise for outages without committing to a fix date") visibly change auto-reply behaviour.

## LLM configuration

Open **Settings → LLM**.

\`\`\`bash
# Provider — one of: anthropic | openai | google | ollama
LLM_PROVIDER=anthropic

# Three tiers; pick models from the chosen provider's catalog
LLM_MODEL=claude-sonnet-4-7-20260201
LLM_MODEL_FAST=claude-haiku-4-7-20260201
LLM_MODEL_COMPLEX=claude-opus-4-7-20260201

# Provider keys (set only the one matching LLM_PROVIDER)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
GOOGLE_GENERATIVE_AI_API_KEY=xxxxxxxxxxxxx
OLLAMA_BASE_URL=http://ollama:11434
\`\`\`

**Tier meanings:**

- \`LLM_MODEL\` — default for all general work (auto-reply drafting, KB proposals)
- \`LLM_MODEL_FAST\` — cheap, high-throughput; used for triage classification
- \`LLM_MODEL_COMPLEX\` — strongest available; used for PR drafting and deep reasoning

You can mix tiers across providers (e.g. Anthropic for standard, OpenAI for fast) by setting per-tier provider overrides under **Settings → LLM → Advanced**.

> **Tip:** if you switch providers, do it during low traffic — in-flight jobs use the old config until they retry.

## Embedding configuration

Open **Settings → Embedding**.

\`\`\`bash
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
\`\`\`

Changing the embedding model triggers a background re-embed of all KB entries. Both vector sets are retained until the new one is complete; then NestFleet swaps atomically. Progress is visible under **Knowledge Base → Sources → Re-embed status**.

Common choices:

| Model | Dims | Notes |
|-------|------|-------|
| \`text-embedding-3-small\` | 1536 | Default, cheap, strong baseline |
| \`text-embedding-3-large\` | 3072 | Higher quality, ~5x cost |
| \`nomic-embed-text\` (Ollama) | 768 | Self-hosted, no provider call |

## Registration lock

\`\`\`bash
REGISTRATION_ENABLED=false   # recommended for production
\`\`\`

When \`false\`, the public sign-up page returns 404. New users can only join via invite (see [Team & Roles](./team-and-roles.md)). When \`true\`, anyone with the URL can register — fine for local dev, dangerous for an exposed instance.

## Community OU limit

\`\`\`bash
COMMUNITY_OU_LIMIT=200   # default
# COMMUNITY_OU_LIMIT=0   # unlimited, recommended for self-hosters
\`\`\`

This sets the calendar-month cap on Outcome Units. The Community tier defaults to 200; set \`0\` to remove the cap entirely. Counters reset on UTC midnight on the first of the month.

> **Note:** removing the cap does not change the AGPL-3.0 licence terms — it just lifts the in-app rate limit.

## Backup configuration

Open **Settings → Backup**. NestFleet supports any S3-compatible object store (AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.).

\`\`\`bash
BACKUP_ENABLED=true
BACKUP_S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
BACKUP_S3_BUCKET=nestfleet-backups
BACKUP_S3_REGION=eu-central-1
BACKUP_S3_ACCESS_KEY=AKIA...
BACKUP_S3_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
BACKUP_SCHEDULE="0 3 * * *"   # cron, daily 03:00
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=base64-32-byte-key
\`\`\`

Backups include the Postgres dump plus uploaded KB source files. Encryption is AES-256-GCM with a key you control — losing it means losing the ability to restore.

Restore is a one-shot CLI inside the container:

\`\`\`bash
docker compose exec api node scripts/restore.js \\
  --backup s3://nestfleet-backups/2026-05-27T03-00-00.dump.enc
\`\`\`

> **Warning:** restore is destructive. It drops and recreates the database. Always test on a staging instance first.

## SMTP / notification settings

See [Notifications](./notifications.md) for the full SMTP, Postmark, Resend, and Slack configuration. Settings live under **Settings → Notifications** and the env vars are documented there.

## Retention and data deletion

Open **Settings → Retention**. Three independent retention windows:

| Data | Default | Env var |
|------|---------|---------|
| Closed cases (full detail) | 365 days | \`RETENTION_CASES_DAYS\` |
| Lineage events on closed cases | 90 days | \`RETENTION_LINEAGE_DAYS\` |
| Raw signal bodies (after case closes) | 30 days | \`RETENTION_SIGNALS_DAYS\` |

After the window, data is hard-deleted on a daily sweep job (\`retention.sweep\`). Aggregated analytics survive — only row-level detail is removed.

For GDPR / right-to-be-forgotten requests, **Settings → Privacy → Erase by identity** accepts an email or reporter ID and deletes all matching Signals, Cases, and Conversations across all retention windows, with an audit record of the action.

> **Tip:** if you need indefinite retention for compliance, set the env vars to \`0\`. The console will surface a banner reminding you of the storage growth implication.

## See also

- [Getting Started](./getting-started.md) — first-run wizard maps to these settings
- [Team & Roles](./team-and-roles.md) — registration lock and OAuth
- [Notifications](./notifications.md) — SMTP / Slack configuration in depth
- [Knowledge Base](./knowledge-base.md) — embedding choice trade-offs
`,
  },
]
