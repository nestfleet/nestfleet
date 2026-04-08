/**
 * BETA-NF-01 — NestFleet self-beta signal injection
 *
 * Injects 12 realistic NestFleet support + ops scenarios into a "NestFleet"
 * product on the target instance, exercising the full triage pipeline on
 * NestFleet's own issue types (self-hosting, GitHub App, billing, AI quality).
 *
 * Usage:
 *   # Local sandbox
 *   npx tsx --env-file .env scripts/beta-eval/inject-nf-signals.ts --all
 *
 *   # Target main VPS (supply API base URL + admin token)
 *   NF_API_URL=https://nestfleet.dev NF_TOKEN=<jwt> \
 *     npx tsx --env-file .env scripts/beta-eval/inject-nf-signals.ts --all
 *
 *   # Single scenario
 *   npx tsx --env-file .env scripts/beta-eval/inject-nf-signals.ts --scenario NF-08
 *
 *   # Dry run
 *   npx tsx --env-file .env scripts/beta-eval/inject-nf-signals.ts --all --dry-run
 *
 *   # Specify product ID explicitly (skip auto-detect)
 *   npx tsx --env-file .env scripts/beta-eval/inject-nf-signals.ts --all \
 *     --nf-product-id prod_xxx
 *
 * Scenarios:
 *   NF-01  email         Self-hoster: docker compose up, API returns 503          [HIGH]
 *   NF-02  email         GitHub App webhook not receiving PRs                     [HIGH]
 *   NF-03  contact_form  Triage AI sent auto-reply to internal Slack thread       [MEDIUM]
 *   NF-04  email         How to add a second product                              [LOW]
 *   NF-05  chat          OU limit approaching — how to upgrade                    [MEDIUM]
 *   NF-06  email         License JWT not updating after manual apply              [HIGH]
 *   NF-07  email         Telegram bot not responding to user messages             [MEDIUM]
 *   NF-08  scheduled     Monitoring alert: API 500 error rate > 5%               [CRITICAL]
 *   NF-09  github_webhook Change request approval emails not sending after SMTP  [MEDIUM]
 *   NF-10  email         Production outage misclassified as LOW by triage AI     [HIGH]
 *   NF-11  email         Self-hoster: how to upgrade from v0.1 to next release   [LOW]
 *   NF-12  contact_form  Enterprise managed hosting inquiry                      [LOW]
 */

import { getDb, closeDb } from "../../src/infra/db/client.js"
import { newId } from "../../src/infra/db/id.js"
import { ingestEmailSignal, type IngestResult } from "../../src/ingress/signal-ingress.js"
import { ingestContactFormSignal } from "../../src/ingress/contact-form-ingress.js"
import { startChatSession } from "../../src/ingress/chat-ingress.js"
import {
  createSignal,
  updateSignal,
  createConversation,
  createCase,
  findIdentityByEmail,
  createIdentity,
  createAuditEvent,
  findProductById,
} from "../../src/infra/db/repositories/index.js"
import { transitionCase } from "../../src/domain/case-state-machine.js"
import { dispatch } from "../../src/agents/dispatcher.js"
import type { ParsedEmail } from "../../src/email/parser.js"
import type { SignalSourceType } from "../../src/infra/db/repositories/signals.js"

// ── CLI argument parsing ────────────────────────────────────────────────────

interface CLIArgs {
  mode:        "all" | "scenario"
  scenarioId?: string
  nfProductId?: string
  dryRun:      boolean
  delayMs:     number
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const result: CLIArgs = { mode: "all", dryRun: false, delayMs: 5000 }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === "--all") {
      result.mode = "all"
    } else if (arg === "--scenario" && args[i + 1]) {
      result.mode = "scenario"
      result.scenarioId = args[++i]!.toUpperCase()
    } else if (arg === "--nf-product-id" && args[i + 1]) {
      result.nfProductId = args[++i]!
    } else if (arg === "--dry-run") {
      result.dryRun = true
    } else if (arg === "--delay" && args[i + 1]) {
      result.delayMs = parseInt(args[++i]!, 10)
    }
  }

  return result
}

// ── Scenario definitions ────────────────────────────────────────────────────

interface ScenarioDef {
  id:         string
  sourceType: SignalSourceType
  fromEmail:  string
  fromName:   string
  subject:    string
  body:       string
}

const scenarios: ScenarioDef[] = [
  // ── NF-01: Self-hoster 503 on API after docker compose up ────────────────
  {
    id:         "NF-01",
    sourceType: "email",
    fromEmail:  "devops@startup.io",
    fromName:   "Alex Mercer",
    subject:    "API returns 503 after docker compose up — health check failing",
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

  // ── NF-02: GitHub App webhook not delivering ──────────────────────────────
  {
    id:         "NF-02",
    sourceType: "email",
    fromEmail:  "eng@fintech-startup.com",
    fromName:   "Priya Nair",
    subject:    "GitHub App webhook not receiving PR events — NestFleet not tracking PRs",
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

  // ── NF-03: AI auto-replied to an internal Slack thread ───────────────────
  {
    id:         "NF-03",
    sourceType: "contact_form",
    fromEmail:  "cto@b2b-saas.com",
    fromName:   "Tom Eriksson",
    subject:    "AI auto-reply sent to internal Slack thread — privacy issue",
    body: `This is urgent. Your AI triage system sent an automated reply to an internal Slack thread that was not a customer support request.

Our Slack is connected via the external webhook channel. An engineer posted an internal message about a failing test suite and NestFleet's AI replied to it as if it were a customer complaint — with a full triage response and a "we are looking into this" message.

The response was sent back to our Slack channel, confusing the team and potentially leaking the fact that we use NestFleet internally.

How do we configure NestFleet to exclude certain Slack channels or add a minimum signal threshold before auto-replying?

Tom Eriksson
CTO`,
  },

  // ── NF-04: How to add a second product ──────────────────────────────────
  {
    id:         "NF-04",
    sourceType: "email",
    fromEmail:  "founder@indie-saas.com",
    fromName:   "Mia Johansson",
    subject:    "How do I add a second product to NestFleet?",
    body: `Hi,

I'm on the community self-hosted version. I have one product set up (my main SaaS).
I want to add a second product for a side project.

I can't find the "Add Product" button anywhere. Am I missing something?

I'm running the latest docker-compose.yml from GitHub.

Thanks,
Mia`,
  },

  // ── NF-05: OU limit approaching — upgrade question ───────────────────────
  {
    id:         "NF-05",
    sourceType: "chat",
    fromEmail:  "ops@growthco.io",
    fromName:   "Growth Co Ops",
    subject:    "OU limit at 80% — what happens when we hit 100%?",
    body: `Hi, we're on the community plan and just got a warning banner saying we've used 80% of our monthly Outcome Units (160/200).

Two questions:
1. What happens when we hit 200? Are new cases blocked or just queued?
2. How do we upgrade to get more capacity? We process about 250 cases/month.

We're self-hosting so not sure how billing works.`,
  },

  // ── NF-06: License JWT not updating after manual apply ───────────────────
  {
    id:         "NF-06",
    sourceType: "email",
    fromEmail:  "sysadmin@enterprise-co.com",
    fromName:   "David Park",
    subject:    "License JWT applied manually but NestFleet still shows Community tier",
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

  // ── NF-07: Telegram bot not responding ──────────────────────────────────
  {
    id:         "NF-07",
    sourceType: "email",
    fromEmail:  "support-lead@community-app.io",
    fromName:   "Fatima Al-Hassan",
    subject:    "Telegram bot connected in settings but not responding to user messages",
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

  // ── NF-08: Monitoring alert — API 500 error rate ─────────────────────────
  {
    id:         "NF-08",
    sourceType: "scheduled",
    fromEmail:  "monitoring@nestfleet.internal",
    fromName:   "NestFleet Monitoring",
    subject:    "ALERT: API 500 error rate > 5% — triage agent timeout spike",
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

  // ── NF-09: CR approval emails not sending after SMTP change ──────────────
  {
    id:         "NF-09",
    sourceType: "github_webhook",
    fromEmail:  "platform@techorg.com",
    fromName:   "Platform Team",
    subject:    "Change request approval emails stopped after SMTP migration to Postmark",
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

  // ── NF-10: Triage misclassified production outage as LOW ─────────────────
  {
    id:         "NF-10",
    sourceType: "email",
    fromEmail:  "ceo@b2b-platform.com",
    fromName:   "Sarah Okonkwo",
    subject:    "URGENT: AI classified our production outage as LOW severity — no one notified",
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

  // ── NF-11: How to upgrade from v0.1 to next release ─────────────────────
  {
    id:         "NF-11",
    sourceType: "email",
    fromEmail:  "devops@selfhost-user.net",
    fromName:   "Chris Bakker",
    subject:    "Upgrade process from v0.1.0 — is it just docker compose pull?",
    body: `Hi,

I'm on the self-hosted community version running the GHCR images tagged as 0.1.0.
When a new release comes out, is the upgrade process just:

  docker compose pull && docker compose up -d

Or is there a migration step needed for the database?

Do you have a changelog or release notes I should check before upgrading?

Thanks,
Chris`,
  },

  // ── NF-12: Enterprise managed hosting inquiry ────────────────────────────
  {
    id:         "NF-12",
    sourceType: "contact_form",
    fromEmail:  "procurement@largeenterprise.com",
    fromName:   "Rachel Thompson",
    subject:    "Managed hosting inquiry — 500-person engineering org",
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

// ── Generic signal ingress (github_webhook, scheduled) ─────────────────────

async function ingestGenericSignal(
  productId: string,
  scenario:  ScenarioDef,
  runId:     string,
): Promise<IngestResult> {
  const product = await findProductById(productId)
  if (!product) throw new Error(`Product not found: ${productId}`)

  const sourceRef  = `beta-nf:${scenario.id}`
  const signalText = `Subject: ${scenario.subject}\n\n${scenario.body}`

  const signal = await createSignal({
    product_id:        productId,
    source_type:       scenario.sourceType,
    source_ref:        sourceRef,
    received_at:       new Date(),
    raw_payload: {
      fromEmail:  scenario.fromEmail,
      fromName:   scenario.fromName,
      subject:    scenario.subject,
      body:       scenario.body,
      betaEval:   true,
      scenarioId: scenario.id,
    },
    processing_status: "received",
  })
  const signalId = signal.signal_id
  await updateSignal(signalId, { processing_status: "normalizing" })

  let identityId: string
  const existing = await findIdentityByEmail(productId, scenario.fromEmail)
  if (existing) {
    identityId = existing.identity_id
  } else {
    const identity = await createIdentity({
      product_id:      productId,
      type:            "end_user",
      display_name:    scenario.fromName || undefined,
      email_addresses: [scenario.fromEmail],
    })
    identityId = identity.identity_id
  }

  const channel = scenario.sourceType === "chat" ? "chat" as const : "internal" as const
  const conv = await createConversation({
    product_id:      productId,
    channel,
    subject:         scenario.subject.slice(0, 200),
    thread_key:      `beta-nf:${scenario.id}:${runId}`,
    participant_ids: [identityId],
    status:          "active",
    last_message_at: new Date(),
  })
  const conversationId = conv.conversation_id

  const newCase = await createCase({
    product_id:           productId,
    title:                scenario.subject.slice(0, 200),
    reporter_identity_id: identityId,
    conversation_ids:     [conversationId],
    status:               "new",
    current_persona:      "frontline",
    signal_text:          signalText,
  })
  const caseId = newCase.case_id
  await transitionCase(caseId, "new", "enriching")

  await updateSignal(signalId, {
    identity_id:     identityId,
    conversation_id: conversationId,
    case_id:         caseId,
    processing_status: "normalized",
    normalized_payload: { signalText, subject: scenario.subject, fromEmail: scenario.fromEmail, fromName: scenario.fromName },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "beta-nf-inject",
    action:      "signal.received",
    after_state: { signalId, source_type: scenario.sourceType, processing_status: "normalized" },
    metadata:    { scenarioId: scenario.id, fromEmail: scenario.fromEmail },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "case",
    entity_ref:  caseId,
    actor_type:  "system",
    actor_ref:   "beta-nf-inject",
    action:      "case.created",
    after_state: { caseId, status: "enriching", signalId, conversationId },
    metadata:    { subject: scenario.subject, scenarioId: scenario.id },
  })

  const jobId = newId("job_")
  await dispatch({
    actionType: "triage",
    productId,
    caseId,
    jobId,
    payload: { signalText, signalId },
  })

  await updateSignal(signalId, { processing_status: "linked" })

  return { signalId, conversationId, caseId, identityId, duplicate: false }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()

  // Filter scenarios
  let filtered: ScenarioDef[]
  if (args.mode === "scenario") {
    filtered = scenarios.filter((s) => s.id === args.scenarioId)
    if (filtered.length === 0) {
      console.error(`❌ Unknown scenario: ${args.scenarioId}`)
      console.error(`   Available: ${scenarios.map((s) => s.id).join(", ")}`)
      process.exit(1)
    }
  } else {
    filtered = scenarios
  }

  console.log(`\n🚀 BETA-NF-01 — NestFleet Self-Beta Signal Injection`)
  console.log(`   Mode:      ${args.mode}${args.scenarioId ? ` (${args.scenarioId})` : ""}`)
  console.log(`   Scenarios: ${filtered.length}`)
  console.log(`   Delay:     ${args.delayMs}ms between injections`)
  console.log(`   Dry run:   ${args.dryRun}\n`)

  if (args.dryRun) {
    for (const s of filtered) {
      console.log(`  [dry-run] ${s.id} | ${s.sourceType} | ${s.fromEmail}`)
      console.log(`            ${s.subject.slice(0, 80)}`)
    }
    console.log(`\n✅ Dry run complete. ${filtered.length} signals would be injected.`)
    return
  }

  // ── Discover NestFleet product ID ────────────────────────────────────────
  const db = getDb()
  let nfProductId = args.nfProductId

  if (!nfProductId) {
    const [product] = await db<Array<{ product_id: string; name: string }>>`
      SELECT product_id, name FROM products
      WHERE name ILIKE 'nestfleet' OR name ILIKE 'nf' OR slug ILIKE 'nestfleet'
      LIMIT 1
    `
    nfProductId = product?.product_id
  }

  if (!nfProductId) {
    console.error(`❌ NestFleet product not found.`)
    console.error(`   Create a product named "NestFleet" in the console, then re-run.`)
    console.error(`   Or pass: --nf-product-id prod_xxx`)
    await closeDb()
    process.exit(1)
  }

  console.log(`  Product ID: ${nfProductId}\n`)

  const runId = Date.now().toString(36)
  console.log(`  Run ID: ${runId}\n`)

  // ── Inject signals ───────────────────────────────────────────────────────
  const results: Array<{ id: string; result?: IngestResult; error?: string }> = []

  for (let i = 0; i < filtered.length; i++) {
    const scenario = filtered[i]!

    console.log(`  [${i + 1}/${filtered.length}] ${scenario.id}`)
    console.log(`    Channel: ${scenario.sourceType}`)
    console.log(`    From:    ${scenario.fromName} <${scenario.fromEmail}>`)
    console.log(`    Subject: ${scenario.subject.slice(0, 70)}`)

    try {
      let result: IngestResult

      if (scenario.sourceType === "email") {
        const email: ParsedEmail = {
          messageId:       `beta-nf:${scenario.id}@nestfleet.local`,
          fromEmail:       scenario.fromEmail,
          fromName:        scenario.fromName,
          subject:         scenario.subject,
          bodyText:        scenario.body,
          bodyHtml:        "",
          replyTo:         scenario.fromEmail,
          inReplyTo:       null,
          references:      null,
          receivedAt:      new Date(),
          attachmentCount: 0,
        }
        result = await ingestEmailSignal(nfProductId, email)
      } else if (scenario.sourceType === "contact_form") {
        result = await ingestContactFormSignal(nfProductId, {
          name:    scenario.fromName,
          email:   scenario.fromEmail,
          subject: scenario.subject,
          message: scenario.body,
        })
      } else if (scenario.sourceType === "chat") {
        result = await startChatSession(nfProductId, {
          name:    scenario.fromName,
          email:   scenario.fromEmail,
          message: `${scenario.subject}\n\n${scenario.body}`,
        })
      } else {
        // github_webhook, scheduled
        result = await ingestGenericSignal(nfProductId, scenario, runId)
      }

      results.push({ id: scenario.id, result })
      console.log(`    ✅ signal=${result.signalId}  case=${result.caseId}  dup=${result.duplicate}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ id: scenario.id, error: msg })
      console.log(`    ❌ ${msg}`)
    }

    if (i < filtered.length - 1 && args.delayMs > 0) {
      console.log(`    ⏳ ${args.delayMs}ms...\n`)
      await new Promise((r) => setTimeout(r, args.delayMs))
    } else {
      console.log()
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const successes  = results.filter((r) => r.result && !r.result.duplicate)
  const duplicates = results.filter((r) => r.result?.duplicate)
  const errors     = results.filter((r) => r.error)

  console.log(`\n📊 Injection Summary:`)
  console.log(`   Total:      ${results.length}`)
  console.log(`   ✅ Created: ${successes.length}`)
  console.log(`   ⏭  Dups:    ${duplicates.length}`)
  console.log(`   ❌ Errors:  ${errors.length}`)

  if (successes.length > 0) {
    console.log(`\n📋 Cases created:`)
    for (const r of successes) {
      console.log(`   ${r.id}: ${r.result!.caseId}`)
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors:`)
    for (const r of errors) {
      console.log(`   ${r.id}: ${r.error}`)
    }
  }

  console.log(`\n💡 Next steps:`)
  console.log(`   1. Wait ~3 min for triage agents to process all cases`)
  console.log(`   2. Open Console → Cases → verify ${successes.length} cases triaged`)
  console.log(`   3. Check severity, type, and AI response quality for each scenario`)
  console.log(`   4. Pay attention to NF-08 (CRITICAL alert), NF-10 (misclassification risk),`)
  console.log(`      NF-03 (privacy/routing), NF-01 (self-host setup — should be HIGH)`)

  await closeDb()
  console.log(`\n✅ Done.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
