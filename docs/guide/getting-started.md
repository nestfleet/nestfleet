# Getting Started

This guide picks up immediately after a successful `docker compose up -d`. If you haven't reached that point yet, see the project README and `self-hosting.md` first.

## 1. Opening the console for the first time

Once the stack is healthy, open `http://localhost:3000` (or whatever host you mapped). The first browser session sees one of two things:

- **No users exist yet:** you are taken to `/setup` to create the first Admin account. Pick an email and a strong password — this account has full access and cannot be locked out by RBAC.
- **A user already exists:** you are taken to `/login`. Use your credentials, or click *Sign in with GitHub* if you configured OAuth (`GITHUB_OAUTH_CLIENT_ID`).

> **Tip:** the first Admin can disable open registration later (`REGISTRATION_ENABLED=false`) and invite teammates one at a time. See [Team & Roles](./team-and-roles.md).

## 2. The setup wizard

After your first login, NestFleet runs a short three-step wizard. It is safe to leave and return — partial progress is saved.

### Step 1 — Product

Give your product a **name** and **slug** (the slug appears in URLs and webhook paths). Optionally set a **support policy** snippet — this is fed to the auto-reply agent so its tone matches your real support voice. You can also paste a **GitHub repo** (`owner/name`) now or later; this enables the Change Request → PR flow.

### Step 2 — LLM provider

Pick a provider and paste a key:

| Provider | Env var | Notes |
|----------|---------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | Recommended default |
| OpenAI | `OPENAI_API_KEY` | Works for all three tiers |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini family |
| Ollama | `OLLAMA_BASE_URL` | Local / self-hosted, no key |

NestFleet uses three model tiers: `LLM_MODEL` (default), `LLM_MODEL_FAST` (cheap triage), `LLM_MODEL_COMPLEX` (PR drafting, hard reasoning). The wizard fills sensible defaults; tune later in [Settings](./settings.md).

### Step 3 — First channel

Add at least one inbound channel so NestFleet has something to ingest:

- **Contact form** — quickest. Copy the generated embed snippet to your site.
- **Email** — paste IMAP credentials, or forward to the unique address NestFleet displays.
- **Telegram** — paste a bot token from `@BotFather`.
- **Webhook** — copy the URL + signing secret to plug into any external system.
- **GitHub Issues** — connect via the OAuth app you registered.

## 3. Sending a test signal

From the wizard's final screen, click **Send test signal**. This posts a synthetic message through the channel you just configured and lands it in the case queue. Alternatively, hit the channel directly — for the webhook channel:

```bash
curl -X POST "$NESTFLEET_URL/api/ingest/webhook/<channel-id>" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <hmac>" \
  -d '{"from":"test@example.com","subject":"Login broken","body":"I cannot reset my password."}'
```

## 4. Watching the first case appear

Navigate to **Cases → Queue**. Within a few seconds the test Signal is grouped into a Case and enters the `open` state. The pg-boss worker then picks it up:

1. `triage` job runs — sets severity, type, confidence
2. `kb.search` job runs — looks for matching known issues
3. The Case transitions to one of: `in_resolution` (auto-reply drafted), `awaiting_lead` (escalation), `in_change` (Change Request created), or stays `triaged` (low confidence → operator review)

Open the case detail view to see the **lineage timeline** — every job, prompt, and decision is recorded. See [Managing Cases](./cases.md) for the full lifecycle.

## 5. What if the LLM isn't configured yet?

NestFleet degrades gracefully. If no provider key is set, or if the provider rejects your key, the pipeline pauses at the `triage` step and the Case stays in `open` with a banner reading *"AI pipeline disabled — configure an LLM provider in Settings."* Signals still ingest, cases still group, operators can still reply manually. Once you add a key, click **Retry triage** on any waiting case or wait for the next scheduled retry.

> **Note:** no Outcome Units are consumed while the pipeline is disabled.

## What's next

- Learn the [case lifecycle](./cases.md) and how to intervene at each step
- Set up your [Knowledge Base](./knowledge-base.md) so auto-reply has something to retrieve
- Connect more [channels](./settings.md#channels) and invite teammates via [Team & Roles](./team-and-roles.md)
- Wire up [notifications](./notifications.md) so escalations reach a human fast
