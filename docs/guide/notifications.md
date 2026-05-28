# Notifications

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

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=app-password-here
SMTP_FROM="NestFleet <notifications@example.com>"
SMTP_SECURE=true   # use STARTTLS
```

### Postmark

```bash
POSTMARK_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POSTMARK_FROM=notifications@example.com
```

### Resend

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM=notifications@example.com
```

Only one provider is active at a time. The settings page lets you switch and re-test without restarting.

## Slack setup

Two options: an **incoming webhook** (simplest) or a **bot token** (richer interactivity).

### Incoming webhook

1. In Slack, **Apps → Incoming Webhooks → Add new webhook**
2. Pick a channel, copy the URL
3. In NestFleet, **Settings → Notifications → Slack**, paste the URL
4. Click **Send test message**

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/your-webhook-token
```

### Bot token

A bot token unlocks interactive buttons (Approve / Reject directly from Slack) and per-role channel routing.

1. Create a Slack app at `api.slack.com/apps`
2. Add scopes: `chat:write`, `chat:write.public`, `users:read.email`
3. Install to your workspace, copy the Bot User OAuth Token (`xoxb-...`)
4. In NestFleet, paste under **Slack → Bot token**

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
```

> **Note:** if both webhook and bot token are configured, the bot token wins.

## Per-product notification preferences

Each Product has its own notification matrix. Open **Settings → Notifications → Routing**. The matrix is `event × role × channel`. For each cell, choose `off`, `instant`, or `digest`.

Common patterns:

- **Lean team:** all events to one shared Slack channel, instant.
- **Distributed team:** escalations instant to Slack, everything else digest by email.
- **Quiet hours:** route to digest between 18:00 and 09:00 local time. Configure per user under their profile.

## Digest schedule

Digest-routed events accumulate and ship in a single message:

- **Hourly digest** — fires at the top of each hour if there's content
- **Daily digest** — fires at 09:00 in the user's configured timezone (default `UTC`)
- **Weekly digest** — fires Monday 09:00; designed for Product Lead role

Each digest includes a one-line summary per event plus a deep-link back into the console.

## Testing notifications

From **Settings → Notifications**, every section has a **Send test** button. The test message includes the trigger name, the configured provider, and a timestamp — handy for confirming the message reached the right channel and looks right.

For end-to-end testing of an actual event:

```bash
# Synthesise a stale-case event without waiting 24 hours
curl -X POST "$NESTFLEET_URL/api/admin/notifications/test" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"case.stale","case_id":"C-1042"}'
```

If a test fails, check **Settings → Notifications → Delivery log** for the last 100 attempts, including status codes and response bodies from the provider.

## See also

- [Settings](./settings.md) — SMTP and Slack env vars
- [Team & Roles](./team-and-roles.md) — who sees which event by default
- [Analytics](./analytics.md) — notification volume metrics
