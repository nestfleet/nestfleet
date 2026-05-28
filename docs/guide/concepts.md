# Core Concepts

NestFleet models product operations as a small set of well-defined primitives. Understanding these five or six nouns is enough to navigate the rest of the product, the API, and the console. This page introduces each one, explains why it exists, and shows how they connect.

## Signal

A **Signal** is the raw atom of input. Every email reply, Telegram message, GitHub issue comment, contact-form submission, or external webhook arrives at NestFleet as a Signal. A Signal records *where* the message came from (channel), *who* sent it (a normalised identity), *what* was said (the body), and *when* it arrived.

Signals are immutable. They are the audit trail. Anything NestFleet "knows" about a user complaint can ultimately be traced back to one or more Signals.

> **Why it exists:** decoupling raw ingestion from interpretation lets us replay, re-triage, and debug without losing source-of-truth data.

## Case

A **Case** is a unit of *work*. One or more related Signals are grouped into a Case — for example, an inbound email and the three follow-up replies in the same thread all belong to one Case. The Case is what an operator opens, what the LLM triages, what gets resolved.

Each Case has:

- a **lifecycle state** (`open`, `triaged`, `in_resolution`, `in_change`, `awaiting_lead`, `resolved`, `closed`)
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

> **Community tier:** capped at 200 OUs per calendar month by default. Set `COMMUNITY_OU_LIMIT=0` to remove the cap on your self-hosted instance.

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
