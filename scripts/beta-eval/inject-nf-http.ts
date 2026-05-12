/**
 * BETA-NF-01 — NestFleet self-beta HTTP injection
 *
 * Sends all 12 NF scenarios to the main VPS via the external webhook endpoint.
 * This avoids needing direct DB access or source files on the VPS.
 *
 * Usage:
 *   npx tsx scripts/beta-eval/inject-nf-http.ts
 */

const API_URL    = "https://nestfleet.dev"
const PRODUCT_ID = "prod_01knkydkkerx3cgvd8xkb2st3q"
const API_KEY    = "beta-nf-test-key-2026"

interface Scenario {
  id:         string
  fromEmail:  string
  fromName:   string
  subject:    string
  body:       string
}

const scenarios: Scenario[] = [
  {
    id:        "NF-01",
    fromEmail: "devops@startup.io",
    fromName:  "Alex Mercer",
    subject:   "API returns 503 after docker compose up — health check failing",
    body: `Hi,

I'm trying to self-host NestFleet using the docker-compose.yml from the repo.
Everything comes up but GET /health returns 503.

docker compose ps shows:
  nestfleet-api      running (unhealthy)
  nestfleet-postgres running (healthy)
  nestfleet-console  running
  nestfleet-caddy    running

API logs show:
  ERROR: relation "operator_users" does not exist

I think the DB migrations didn't run? I set DATABASE_URL correctly — it connects to postgres.

Steps I followed:
  cp .env.example .env   # filled in JWT_SECRET and ENCRYPTION_KEY
  docker compose up -d

Running on Ubuntu 22.04, Docker 24.0.7.

Alex`,
  },
  {
    id:        "NF-02",
    fromEmail: "eng@fintech-startup.com",
    fromName:  "Priya Nair",
    subject:   "GitHub App webhook not receiving PR events — NestFleet not tracking PRs",
    body: `Hello,

We installed the NestFleet GitHub App on our org 2 days ago but PR events are
not showing up in NestFleet. Our open PRs are not being tracked.

In GitHub → App Settings → Advanced → Recent Deliveries, all payloads show
HTTP 401 with response: {"error":"Unauthorized"}.

Our setup:
  - GITHUB_WEBHOOK_SECRET set in .env (copied from GitHub App settings)
  - GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY set
  - Webhooks pointing to https://our-domain.com/webhooks/github
  - SSL valid (Let's Encrypt)

The GitHub App is installed on org level with access to all repos.

Is there a known issue with the webhook signature validation?

Priya Nair
Engineering Lead`,
  },
  {
    id:        "NF-03",
    fromEmail: "cto@b2b-saas.com",
    fromName:  "Tom Eriksson",
    subject:   "AI auto-reply sent to internal Slack thread — privacy issue",
    body: `This is urgent. Your AI triage system sent an automated reply to an internal Slack thread that was not a customer support request.

Our Slack is connected via the external webhook channel. An engineer posted an internal message about a failing test suite and NestFleet's AI replied to it as if it were a customer complaint — with a full triage response and a "we are looking into this" message.

The response was sent back to our Slack channel, confusing the team and potentially leaking the fact that we use NestFleet internally.

How do we configure NestFleet to exclude certain Slack channels or add a minimum signal threshold before auto-replying?

Tom Eriksson
CTO`,
  },
  {
    id:        "NF-04",
    fromEmail: "founder@indie-saas.com",
    fromName:  "Mia Johansson",
    subject:   "How do I add a second product to NestFleet?",
    body: `Hi,

I'm on the community self-hosted version. I have one product set up (my main SaaS).
I want to add a second product for a side project.

I can't find the "Add Product" button anywhere. Am I missing something?

I'm running the latest docker-compose.yml from GitHub.

Thanks,
Mia`,
  },
  {
    id:        "NF-05",
    fromEmail: "ops@growthco.io",
    fromName:  "Growth Co Ops",
    subject:   "OU limit at 80% — what happens when we hit 100%?",
    body: `Hi, we're on the community plan and just got a warning banner saying we've used 80% of our monthly Outcome Units (160/200).

Two questions:
1. What happens when we hit 200? Are new cases blocked or just queued?
2. How do we upgrade to get more capacity? We process about 250 cases/month.

We're self-hosting so not sure how billing works.`,
  },
  {
    id:        "NF-06",
    fromEmail: "sysadmin@enterprise-co.com",
    fromName:  "David Park",
    subject:   "License JWT applied manually but NestFleet still shows Community tier",
    body: `Hello,

We purchased a Starter plan and received a license.jwt file. I applied it manually
by placing it at the path specified in LICENSE_FILE_PATH.

The API logs show:
  INFO: License file loaded — tier: starter

But the console still shows "Community" in Settings → Plan. The /api/v1/license/status
endpoint returns tier: "community".

I've restarted the API container twice. The file is at /opt/nestfleet/license.jwt with 0644 permissions.

Does the license need to be hot-reloaded or does a full restart fail to pick it up?

David Park
Systems Administrator`,
  },
  {
    id:        "NF-07",
    fromEmail: "support-lead@community-app.io",
    fromName:  "Fatima Al-Hassan",
    subject:   "Telegram bot connected in settings but not responding to user messages",
    body: `Hi,

I've set up the Telegram channel in NestFleet settings. The bot is connected
(green status in Channels) and the test message from the settings page sends successfully.

But when real users send messages to the bot (@ourbot_nestfleet), nothing appears
in NestFleet. No cases are created.

My setup:
  - TELEGRAM_BOT_TOKEN set correctly (tested with curl)
  - Webhook set via: curl -X POST https://api.telegram.org/bot<token>/setWebhook?url=https://our-domain.com/webhooks/telegram (returns ok: true)
  - NestFleet is behind Caddy with valid SSL

The Caddy logs don't show any incoming POST to /webhooks/telegram.

Could the webhook URL be wrong? What path does NestFleet expect for Telegram?

Fatima`,
  },
  {
    id:        "NF-08",
    fromEmail: "monitoring@nestfleet.internal",
    fromName:  "NestFleet Monitoring",
    subject:   "ALERT: API 500 error rate > 5% — triage agent timeout spike",
    body: `Alert: API 500 error rate elevated
Component: nestfleet-api
Metric: http_5xx_rate = 8.3% (threshold: 5%)
Duration: 12 minutes
First occurrence: 2026-04-08T21:00:00Z

Top error: "Triage agent timeout after 30000ms"
Affected endpoint: POST /api/v1/cases/:caseId/dispatch
Request count: 47 errors in last 15 min

Likely cause: LLM provider (Anthropic) response latency spike
LLM_PROVIDER: anthropic
LLM_MODEL: claude-sonnet-4-6

pg-boss queue depth: 23 pending triage jobs
DB connections: 8/25 (healthy)

Action required: Check LLM provider status page, consider increasing agent timeout or switching to fallback model.`,
  },
  {
    id:        "NF-09",
    fromEmail: "platform@techorg.com",
    fromName:  "Platform Team",
    subject:   "Change request approval emails stopped after SMTP migration to Postmark",
    body: `We migrated our email provider from Gmail SMTP to Postmark yesterday.
Updated the env vars:
  POSTMARK_API_KEY=<new key>
  SMTP_HOST=  (cleared)
  SMTP_USER=  (cleared)
  SMTP_PASS=  (cleared)

Since the migration, change request approval emails are not being sent.
Cases are still being triaged, but approvers don't receive the approval request email.

Postmark activity log shows 0 outbound messages from NestFleet since the migration.
The Postmark API key is correct (tested with curl — returns 200).

Is there a specific env var priority for Postmark vs SMTP? Do we need to restart
the pg-boss queue workers to pick up the new email config?

Platform Team`,
  },
  {
    id:        "NF-10",
    fromEmail: "ceo@b2b-platform.com",
    fromName:  "Sarah Okonkwo",
    subject:   "URGENT: AI classified our production outage as LOW severity — no one notified",
    body: `This is a serious product quality issue.

Yesterday at 2pm our entire platform was down for 47 minutes. A customer submitted a support case through your contact form widget explaining the situation clearly: "ALL API endpoints are returning 503, our entire platform is down, hundreds of users affected."

NestFleet triaged it as LOW severity with the note "general question about API behavior." No alerts were triggered, no one was notified. We found out because a customer called our CEO directly.

This is unacceptable. The AI completely misread a production outage as a low-priority inquiry.

We need:
1. An explanation of why this happened
2. How to adjust the triage sensitivity for our product
3. A way to review/override AI severity classifications

Sarah Okonkwo
CEO, B2B Platform Co`,
  },
  {
    id:        "NF-11",
    fromEmail: "devops@selfhost-user.net",
    fromName:  "Chris Bakker",
    subject:   "Upgrade process from v0.1.0 — is it just docker compose pull?",
    body: `Hi,

I'm on the self-hosted community version running the GHCR images tagged as 0.1.0.
When a new release comes out, is the upgrade process just:

  docker compose pull && docker compose up -d

Or is there a migration step needed for the database?

Do you have a changelog or release notes I should check before upgrading?

Thanks,
Chris`,
  },
  {
    id:        "NF-12",
    fromEmail: "procurement@largeenterprise.com",
    fromName:  "Rachel Thompson",
    subject:   "Managed hosting inquiry — 500-person engineering org",
    body: `Hello,

I'm the Head of Engineering Tools at a 500-person engineering org. We evaluated NestFleet's community version and are impressed with the AI triage capabilities.

We're interested in the managed SaaS option but have a few questions before proceeding:

1. What's included in the Growth tier vs Scale tier?
2. Do you offer SSO/SAML integration (we use Okta)?
3. Is there a SOC2 report available?
4. What's the data residency — EU or US?
5. Can we get a 30-day trial on the Growth tier before committing?

We process roughly 800 support cases per month across 5 products.

Rachel Thompson
Head of Engineering Tools`,
  },
]

// ── Inject ────────────────────────────────────────────────────────────────────

async function injectScenario(scenario: Scenario, index: number): Promise<void> {
  const threadId  = `beta-nf:${scenario.id}:${Date.now().toString(36)}`
  const message   = `Subject: ${scenario.subject}\n\n${scenario.body}`

  const body = {
    threadId,
    senderName: scenario.fromName,
    senderRef:  scenario.fromEmail,
    message,
    channelContext: { betaEval: true, scenarioId: scenario.id },
  }

  console.log(`  [${index}] ${scenario.id}  ${scenario.fromName} <${scenario.fromEmail}>`)
  console.log(`       ${scenario.subject.slice(0, 72)}`)

  const res = await fetch(
    `${API_URL}/webhooks/external/${PRODUCT_ID}`,
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    },
  )

  const json = await res.json() as Record<string, unknown>

  if (!res.ok) {
    console.log(`       ❌ HTTP ${res.status}: ${JSON.stringify(json)}`)
  } else if (json["duplicate"]) {
    console.log(`       ⏭  duplicate`)
  } else {
    console.log(`       ✅ caseId=${json["caseId"]}  signalId=${json["signalId"]}`)
  }
}

async function main() {
  console.log(`\n🚀 BETA-NF-01 — HTTP Injection → ${API_URL}`)
  console.log(`   Product:  ${PRODUCT_ID}`)
  console.log(`   Scenarios: ${scenarios.length}\n`)

  const results: Array<{ id: string; ok: boolean }> = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    try {
      await injectScenario(scenario, i + 1)
      results.push({ id: scenario.id, ok: true })
    } catch (err) {
      console.log(`       ❌ ${err instanceof Error ? err.message : String(err)}`)
      results.push({ id: scenario.id, ok: false })
    }

    if (i < scenarios.length - 1) {
      await new Promise((r) => setTimeout(r, 3000))
    }
    console.log()
  }

  const ok  = results.filter((r) => r.ok).length
  const err = results.filter((r) => !r.ok).length

  console.log(`\n📊 Summary: ${ok} injected, ${err} errors`)
  console.log(`\n💡 Next: wait ~3 min, then open https://nestfleet.dev → Cases`)
  console.log(`   Look for cases triaged under the NestFleet product.`)
  console.log(`   Key scenarios to validate:`)
  console.log(`     NF-01 (self-host 503)    → HIGH severity`)
  console.log(`     NF-08 (monitoring alert) → CRITICAL severity`)
  console.log(`     NF-10 (misclassification)→ HIGH, routing concern`)
  console.log(`     NF-03 (privacy/Slack)    → escalation needed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
