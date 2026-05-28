# Managing Cases

Cases are where most operator time is spent. This guide walks through the queue view, the case lifecycle, the detail panel, and every intervention point an operator (or lead) has.

## The case queue

Open **Cases → Queue** in the console. The queue is a virtualised table sorted by *priority then age* by default.

### Columns

| Column | Meaning |
|--------|---------|
| **ID** | Short case ID (e.g. `C-1042`) |
| **Subject** | Inferred from the first Signal or set by triage |
| **State** | One of the lifecycle states (see below) |
| **Severity** | `low` / `medium` / `high` / `critical` — set by triage |
| **Type** | `bug`, `question`, `feature`, `outage`, `other` |
| **Confidence** | Triage confidence score (0–1) |
| **Channel** | The source channel icon |
| **Assignee** | Operator the case is routed to, if any |
| **Updated** | Relative time of last event |

### Filters

The filter bar supports state, severity, type, channel, assignee, and "needs my action" (cases waiting on the current user's role). Filters are URL-persisted — you can bookmark or share a view.

### Sort

Click any column header to sort. Multi-column sort is available via shift-click.

## Case lifecycle

```
open  ──►  triaged  ──►  in_resolution  ──►  resolved  ──►  closed
                  │
                  ├──►  in_change      ──►  resolved  ──►  closed
                  │
                  └──►  awaiting_lead  ──►  resolved  ──►  closed
```

| State | What it means | Who acts next |
|-------|---------------|---------------|
| `open` | Newly created from one or more Signals; not yet triaged | Pipeline (auto) |
| `triaged` | Triage finished; confidence too low for auto-routing | Operator |
| `in_resolution` | Auto-reply drafted, awaiting send or approval | Operator / Support Lead |
| `in_change` | A Change Request was created from this case | Change Lead |
| `awaiting_lead` | Severity escalated; lead must respond | Support Lead |
| `resolved` | Case is finished; KB proposal may be pending | Knowledge Lead (optional) |
| `closed` | Terminal state; archived to long-term storage | — |

## The case detail view

Click any row to open the detail panel. Three panes:

### Left — Signal & Conversation

The original message(s), normalised. Reply threads (Conversations) appear inline. Use **Reply** to compose manually, or **Approve & send** if an auto-reply draft is pending.

### Middle — AI Triage

Shows the structured triage output: severity, type, confidence, rationale, and any matched KB entries with their similarity scores. If confidence is below the configured threshold (default `0.7`), the case is held for operator review instead of auto-routed.

### Right — Lineage timeline

Every event in chronological order: signal received, triage started/finished (with token cost), KB hits, draft generated, operator action, state transitions, notifications sent, OUs charged. This is your audit trail.

## Approving or rejecting an auto-reply

When the auto-reply agent drafts a message, the case enters `in_resolution`. The draft appears in the left pane with three buttons:

- **Approve & send** — sends the reply as-is, marks the case `resolved`, charges 1 OU.
- **Edit & send** — opens an editor; saved edits are recorded in the lineage.
- **Reject** — discards the draft; the case returns to `triaged` for manual handling.

> **Tip:** Support Leads can configure *auto-send threshold* — drafts above a confidence (e.g. `0.9`) bypass approval entirely. See [Settings](./settings.md).

## Manually resolving a case

Any Operator can click **Resolve** on a case in any non-terminal state. You'll be prompted for a short resolution note (one sentence is fine — it feeds the KB proposal step). The case moves to `resolved`. No OU is charged for manual resolution.

## Correcting a wrong triage classification

If triage got severity or type wrong, click **Edit triage** in the middle pane. Your correction is saved both as the new case state *and* as a labelled training signal that improves future triage prompts (visible in [Analytics](./analytics.md) → Triage drift).

## Escalating a case manually

Click **Escalate** to push a case to `awaiting_lead`. You'll pick a lead role (Support / Change / Product) and optionally write a one-line context note. The matching lead receives a notification per their preferences.

## Search and filtering

The global search bar (`/` to focus) searches across:

- Case ID, subject, body of any Signal
- Reporter email or identity
- Triage rationale text
- Tags and assignees

Search supports prefix operators: `state:awaiting_lead`, `severity:>=high`, `channel:telegram`, `assignee:me`, `before:2026-05-01`. Combine freely — `state:triaged severity:high channel:email`.

Saved searches appear in the left rail and can be set as your default queue view.

## See also

- [Change Requests](./change-requests.md) — the `in_change` branch in depth
- [Knowledge Base](./knowledge-base.md) — how matching works and how proposals are reviewed
- [Notifications](./notifications.md) — making sure leads see escalations in time
