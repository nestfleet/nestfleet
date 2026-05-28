# Analytics

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
| Standard | `LLM_MODEL` | Auto-reply drafting, KB proposals |
| Fast | `LLM_MODEL_FAST` | Triage classification |
| Complex | `LLM_MODEL_COMPLEX` | PR drafting, deep reasoning |

For each tier you see input tokens, output tokens, and dollar cost (using the configured provider's published prices). The unit-economics card shows **cost per resolved case** and **cost per OU** — the two numbers worth printing on a sticker.

## Outcome Unit consumption

The **OU meter** shows month-to-date consumption against your cap. By default the Community tier is capped at 200 OUs per calendar month; the meter turns amber at 80% and red at 100%.

When the cap is hit:

- Cases continue to ingest and group
- Manual reply, manual resolve, and KB management continue to work
- The AI pipeline pauses on the next case it would charge an OU for (auto-close or escalate)
- A banner appears in the console; Admins receive a notification

To remove the cap on a self-hosted instance, set `COMMUNITY_OU_LIMIT=0` and restart. See [Settings](./settings.md#community-ou-limit).

## Exporting data

Three export formats from any chart:

- **CSV** — raw rows underlying the chart
- **PNG** — the chart image for slides
- **JSON** — the full time-series with metadata, useful for piping into an external BI tool

For programmatic access, the same data is available via `GET /api/analytics/{metric}?from=...&to=...` with an admin API token.

## Using analytics to tune the system

Two practical loops:

### Tune the LLM config

- Low approval rate + high token cost → switch `LLM_MODEL` to a stronger tier, accept higher cost per OU
- High triage drift → switch `LLM_MODEL_FAST` to a more capable model for triage, or raise the auto-route confidence threshold
- High bounce rate → the auto-reply isn't grounded enough — look at the KB

### Tune the KB

- Cases with no KB match + repeating subjects → write KB entries for the top recurring subjects
- High rejection rate on auto-proposed KB entries → the proposer is too eager; lower its temperature or tighten the schema
- Drop in auto-resolved % over time → KB drift, run a re-embed and audit `last_verified` dates

## See also

- [Knowledge Base](./knowledge-base.md) — tuning RAG quality
- [Settings](./settings.md) — model tier and embedding configuration
- [Cases](./cases.md) — the underlying records behind every metric
