/**
 * Beta Evaluation — Signal Injection Script
 *
 * Injects the 18 evaluation scenarios into NestFleet by calling the
 * appropriate ingress pipelines directly (no HTTP needed — same process).
 *
 * For email signals: uses ingestEmailSignal()
 * For contact_form:  uses ingestContactFormSignal()
 * For chat:          uses startChatSession()
 * For github_webhook, slack, scheduled: uses a generic ingress helper
 *   that mirrors the email pipeline but with the correct source_type.
 *
 * Usage:
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --all
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-01
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --product dg
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --product ss
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --product xp
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --all --dry-run
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --all --delay 10000
 *   npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --all \
 *     --dg-product-id prod_xxx --ss-product-id prod_yyy
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
  createIdentity,
  findIdentityByEmail,
  createAuditEvent,
  findProductById,
} from "../../src/infra/db/repositories/index.js"
import { transitionCase } from "../../src/domain/case-state-machine.js"
import { dispatch } from "../../src/agents/dispatcher.js"
import type { ParsedEmail } from "../../src/email/parser.js"
import type { SignalSourceType } from "../../src/infra/db/repositories/signals.js"

// ── CLI argument parsing ────────────────────────────────────────────────────

interface CLIArgs {
  mode: "all" | "scenario" | "product"
  scenarioId?: string
  productFilter?: "dg" | "ss" | "xp"
  dgProductId?: string
  ssProductId?: string
  dryRun: boolean
  delayMs: number
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const result: CLIArgs = {
    mode: "all",
    dryRun: false,
    delayMs: 5000,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--all") {
      result.mode = "all"
    } else if (arg === "--scenario" && args[i + 1]) {
      result.mode = "scenario"
      result.scenarioId = args[++i]!.toUpperCase()
    } else if (arg === "--product" && args[i + 1]) {
      result.mode = "product"
      result.productFilter = args[++i]!.toLowerCase() as "dg" | "ss" | "xp"
    } else if (arg === "--dg-product-id" && args[i + 1]) {
      result.dgProductId = args[++i]!
    } else if (arg === "--ss-product-id" && args[i + 1]) {
      result.ssProductId = args[++i]!
    } else if (arg === "--dry-run") {
      result.dryRun = true
    } else if (arg === "--delay" && args[i + 1]) {
      result.delayMs = parseInt(args[++i]!, 10)
    }
  }

  return result
}

// ── Scenario definitions ────────────────────────────────────────────────────

type ProductSlug = "dg" | "ss" | "xp"

interface ScenarioDef {
  id: string
  productSlug: ProductSlug
  /** Which NestFleet product this signal is for (dg or ss). XP scenarios specify which one. */
  targetProduct: "dg" | "ss"
  sourceType: SignalSourceType
  fromEmail: string
  fromName: string
  subject: string
  body: string
}

const scenarios: ScenarioDef[] = [
  // ── DocuGardener ────────────────────────────────────────────────────────
  {
    id: "DG-01",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "github_webhook",
    fromEmail: "marcus@fintech.io",
    fromName: "Marcus Chen",
    subject: "False positive blocking release — internal struct rename triggers drift check",
    body: `I opened a PR that renames internal service structs (PaymentProcessor → PaymentEngine). DocuGardener's drift check blocked the merge with a 0.82 drift score, pointing to docs/architecture.md.

This is a false positive. The renamed structs are purely internal — never exposed in the public API or user-facing docs. The only reference in docs/architecture.md is an internal architecture diagram that doesn't affect any user.

Our release is scheduled in 2 hours and this is blocking the merge.

PR: #247, Branch: refactor/payment-engine
Drift score: 0.82
Flagged doc: docs/architecture.md
CI status: all green except DocuGardener check`,
  },
  {
    id: "DG-02",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "email",
    fromEmail: "sarah.chen@medcore.io",
    fromName: "Sarah Chen",
    subject: "URGENT - Compliance export not working for SOC2 audit deadline TOMORROW",
    body: `We have a SOC2 audit deadline TOMORROW and the compliance export feature is returning empty ZIP files. When I go to Workspace > Export > Compliance Bundle, it processes for about 2 minutes then downloads a 0-byte ZIP.

We're on the Enterprise plan and this is a critical feature for us — it's the main reason we upgraded. We have 847 documents that need to be in the compliance package.

I've tried:
- Different browsers (Chrome, Firefox)
- Different export formats (ZIP, PDF bundle)
- Smaller selections (50 docs) — same empty result

This is affecting our ability to pass the audit. Please help ASAP.

Sarah Chen
VP Compliance, MedCore Health
Enterprise Plan, Account #MC-2024-0847`,
  },
  {
    id: "DG-03",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "email",  // Re-channeled from Slack (PO Review §B1 — Slack inbound not implemented)
    fromEmail: "priya@scaleup.io",
    fromName: "Priya Sharma",
    subject: "Nightly rollup creating 8+ separate issues — can we consolidate?",
    body: `Hi,

The nightly rollup is creating 8+ GitHub issues per night on our monorepo.
Is there a way to consolidate them into one issue or set a minimum drift
threshold before an issue gets created? Getting hard to manage.

We set consolidate: true in .docugardener.yml about a week ago but it's still
creating individual issues. Our devs are getting notification fatigue from
8+ issues every morning.

Config:
rollup:
  consolidate: true
  minDriftScore: 0.4
  schedule: "0 6 * * *"

Repos: 3 active repos, all with the same config.
Plan: Team ($79/mo)

Is there a cache that needs to be cleared? Or does the config take a full cycle to take effect?

Thanks,
Priya`,
  },
  {
    id: "DG-04",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "github_webhook",
    fromEmail: "daniel@backend.dev",
    fromName: "Daniel Okonkwo",
    subject: "Inconsistent drift scores — same PR gets 0.3 on re-run after getting 0.91",
    body: `I'm seeing inconsistent drift scores on the same PR. First run: 0.91 (blocked merge). I re-ran the DocuGardener check without any changes and it came back as 0.3 (passed).

This makes the drift detection unreliable because I can just keep re-running until it passes.

Repo: backend-api (private, Enterprise plan)
PR: #89 — "Add pagination to /api/v1/documents endpoint"
First check: 0.91, flagged docs/api/documents.md
Second check (re-run, no changes): 0.3, passed

Is this an embedding cache issue? The docs file hasn't changed in 45 days.`,
  },
  {
    id: "DG-05",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "email",
    fromEmail: "raj.patel@buildfast.io",
    fromName: "Raj Patel",
    subject: "Billing question — charged full month after upgrading mid-cycle",
    body: `Hello,

I upgraded from Solo ($29/mo) to Team ($79/mo) on March 10th, which was day 10 of my billing cycle. I expected to get a pro-rata credit for the remaining 20 days on Solo, but my invoice shows a full $79 charge with no credit applied.

Can you check my account? My billing email is raj.patel@buildfast.io.

Expected charge: $79 - ~$19.33 credit = ~$59.67
Actual charge: $79.00

Thanks,
Raj`,
  },
  {
    id: "DG-06",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "github_webhook",
    fromEmail: "alex@oss.dev",
    fromName: "Alex Rivera",
    subject: "Setup wizard crashes on organizations with 100+ repos",
    body: `The DocuGardener setup wizard crashes (white screen) when trying to list repositories for our GitHub organization. We have 147 active repos.

Steps to reproduce:
1. Install DocuGardener GitHub App on our org
2. Open DocuGardener setup wizard
3. Step 2: "Select Repositories" — shows loading spinner for ~10 seconds
4. White screen, browser console shows: "RangeError: Maximum call stack size exceeded"

This happens on Chrome 122 and Firefox 125. The org has 147 repos.

We can't complete the onboarding. Smaller orgs (I tested with a personal account with 12 repos) work fine.

Plan: Team (just purchased, can't use the product yet)`,
  },
  {
    id: "DG-07",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "chat",
    fromEmail: "trial-user@eval.io",
    fromName: "Trial User",
    subject: "OAuth flow — insufficient scope error when connecting GitHub Enterprise",
    body: `I'm trying to connect DocuGardener to our GitHub Enterprise Server instance. When I click "Connect GitHub Enterprise" in the integration settings, I go through the OAuth flow but then get an error: "Insufficient scope — required: repo, read:org, admin:repo_hook"

I'm a GitHub Enterprise admin, so permissions shouldn't be an issue. The OAuth app was created by our team last week.

What scopes do I need to configure on the OAuth app?`,
  },
  {
    id: "DG-08",
    productSlug: "dg",
    targetProduct: "dg",
    sourceType: "contact_form",
    fromEmail: "j.walsh@bigcorp.com",
    fromName: "Jennifer Walsh",
    subject: "Enterprise inquiry — SOC2 compliance, on-premise deployment, custom SLA",
    body: `Hello,

I'm the Director of Engineering at BigCorp (4,200 employees, 800+ developers). We're evaluating documentation management tools for our engineering organization and DocuGardener has been shortlisted.

Our requirements:
1. SOC2 Type II compliance (mandatory for our security team)
2. On-premise deployment option (our code cannot leave our data centers)
3. Custom SLA with 99.9% uptime guarantee
4. SSO integration with Okta (we're already an Okta customer)
5. Dedicated support channel with <4h response time for critical issues

Can you arrange a call with your enterprise sales team? We're looking to make a decision by end of Q2.

Jennifer Walsh
Director of Engineering, BigCorp
Phone: +1-555-0199`,
  },

  // ── SkillSeal ──────────────────────────────────────────────────────────
  {
    id: "SS-01",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "email",
    fromEmail: "amara.diallo@gmail.com",
    fromName: "Amara Diallo",
    subject: "Re: Your credential is ready to claim — vault is empty",
    body: `Hi,

I received the email saying my UX Design credential is ready to claim. I clicked the link, confirmed my identity, and the page said "Credential issued successfully."

But when I go to my vault, it's completely empty. No credentials showing. I've refreshed multiple times and waited 20 minutes.

My portfolio review is tomorrow morning and I need this credential visible to share with potential clients.

Email used for claim: amara.diallo@gmail.com
Credential: UX Design Professional (issued by DesignAcademy)
Claimed at: approximately 2 hours ago`,
  },
  {
    id: "SS-02",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "github_webhook",
    fromEmail: "viktor@talenthub.io",
    fromName: "Viktor Petrov",
    subject: "[v2.1.0] Webhook payload missing credentialId field — 200+ failed deliveries",
    body: `Since v2.1.0 deployed at ~09:00 UTC, our webhook endpoint is receiving malformed payloads.

Expected payload structure:
{ "event": "credential.issued", "credentialId": "cred_xxx", "talentDid": "did:xxx", ... }

Actual payload received:
{ "event": "credential.issued", "talentDid": "did:xxx", ... }  ← credentialId missing

We process ~35 credentials/hour. All today's issuances are undelivered to our users.
This is a regression from v2.0.x where credentialId was always present.

We're a Growth plan customer ($499/mo) and this is impacting 200+ credential deliveries.

Attached: webhook logs (last 50 events), v2.0.x vs v2.1.0 payload diff
Labels: bug, regression, critical, billing-impact`,
  },
  {
    id: "SS-03",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "email",  // Re-channeled from Slack (PO Review §B1 — Slack inbound not implemented)
    fromEmail: "claire@techcorp.com",
    fromName: "Claire Dubois",
    subject: "Batch ZK verification timing out after 3 candidates",
    body: `Hi,

Batch ZK verification is timing out after 3 candidates. I have a 50-person batch
and a hiring review meeting in 4 hours.

The UI just shows a spinner and then nothing. No error message. I've tried 3 times.

Plan: Recruiter Pro ($199/mo). Using selective disclosure (>$120K threshold).

Claire Dubois
Senior Technical Recruiter, TechCorp`,
  },
  {
    id: "SS-04",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "email",
    fromEmail: "j.hartley@northamptonuniversity.edu",
    fromName: "James Hartley",
    subject: "University credentials showing 'issuer verification failed' after domain change",
    body: `Hello,

Our university migrated to a new domain last week. We were previously northampton.ac.uk and are now northamptonuniversity.edu.

Students are reporting that their credentials show an error when shared:
"Issuer verification failed — DID document not resolvable"

I believe this is related to a DNS TXT record we set up during onboarding for the old domain. Can you advise how to update the DID configuration?

We have 12 students who have reported this issue so far.

James Hartley
IT Systems Administrator, Northampton University
Plan: Growth ($499/mo)`,
  },
  {
    id: "SS-05",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "email",
    fromEmail: "marco.rossi@protonmail.com",
    fromName: "Marco Rossi",
    subject: "Auto-generated credential contains outdated skills — damaging my job application",
    body: `Your AI auto-generated a "Web3 Full-Stack Developer" credential for me that includes a Solidity v0.7 badge from 2021. I'm currently in a hiring process and the recruiter has flagged this as outdated (current standard is v0.8+).

I have a v0.8 certification from 2023 that should have been used instead, or the 2021 badge should have been excluded given I have a more recent one.

This is causing real damage to my job application. I need this fixed urgently.

Marco Rossi
Plan: Talent Pro ($9/mo)`,
  },
  {
    id: "SS-06",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "email",
    fromEmail: "ops@talentbridge.co",
    fromName: "TalentBridge Operations",
    subject: "CRITICAL: Batch verification API broken — blocking $2M placement deal",
    body: `Our integration with your /api/v1/credentials/verify-batch endpoint is returning 500 errors for any batch over 50 candidates. We have a placement deadline of March 25th for our biggest client (180 candidates to verify).

Error response:
{
  "error": "Internal Server Error",
  "requestId": "req_8f2k4m9x",
  "timestamp": "2026-03-19T14:22:00Z"
}

This worked fine last week with batches of 200+. Something changed in your latest release.

Urgency: This is blocking a $2M placement deal.

TalentBridge Operations Team
Enterprise Plan`,
  },
  {
    id: "SS-07",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "chat",
    fromEmail: "user@mobile.test",
    fromName: "Mobile User",
    subject: "Generate Proof button not working on mobile",
    body: `I'm trying to share my verified React experience with a recruiter using the mobile wallet. When I tap "Generate Proof" nothing happens. I've tried on iPhone 15 (Safari) and Pixel 8 (Chrome). The recruiter needs this by tomorrow for my interview. Can you help?`,
  },
  {
    id: "SS-08",
    productSlug: "ss",
    targetProduct: "ss",
    sourceType: "scheduled",
    fromEmail: "monitoring@skillseal.internal",
    fromName: "SkillSeal Monitoring",
    subject: "ALERT: Blockchain anchor failure rate > 50%",
    body: `Alert: Blockchain anchor failure rate > 50%
Component: credential-anchor-service
Error: Transaction underpriced (gas estimation failed)
Affected: 23 pending credential issuances in last hour
Network: Base L2 (chainId: 8453)
First occurrence: 2026-03-20T15:00:00Z
Severity: Critical
Action required: Investigate gas estimation failures and consider increasing MAX_GAS_MULTIPLIER`,
  },

  // ── Cross-product ──────────────────────────────────────────────────────
  {
    id: "XP-01",
    productSlug: "xp",
    targetProduct: "dg",  // Bridge event targets DocuGardener's case queue
    sourceType: "scheduled",
    fromEmail: "bridge@nestfleet.internal",
    fromName: "NestFleet Bridge",
    subject: "bridge.doc-gap.detected — NestFleet API docs 3 versions behind",
    body: `Bridge Event: doc-gap.detected

Source Product: DocuGardener (nightly scan)
Target Product: NestFleet
Document: docs/api/signals.md
Current documented version: v1.2
Latest code version: v1.5
Drift score: 0.73
Affected endpoints:
  - POST /api/v1/signals
  - GET /api/v1/signals/:id
Suggested action: update_docs

This gap was also detected in SkillSeal's NestFleet integration guide.`,
  },
  {
    id: "XP-02",
    productSlug: "xp",
    targetProduct: "ss",  // Cross-product identity test targets SkillSeal
    sourceType: "email",
    fromEmail: "sarah.chen@medcore.io",  // Same email as DG-02 — tests cross-product identity linking (requires DG-02 run first)
    fromName: "Sarah Chen",
    subject: "Need to bulk-import credentials for new hires",
    body: `Hi, we're onboarding 45 new engineers next month and need to bulk-import their verified credentials from our internal training platform. Is there a batch import API or CSV upload option?

Thanks,
Sarah Chen
MedCore Devices`,
  },
]

// ── Generic signal ingress for non-email/non-form/non-chat channels ─────────

async function ingestGenericSignal(
  productId: string,
  scenario: ScenarioDef,
  runId: string,
): Promise<IngestResult> {
  const product = await findProductById(productId)
  if (!product) throw new Error(`Product not found: ${productId}`)

  const sourceRef = `beta-eval:${scenario.id}`
  const signalText = `Subject: ${scenario.subject}\n\n${scenario.body}`

  // 1. Create signal
  const signal = await createSignal({
    product_id:        productId,
    source_type:       scenario.sourceType,
    source_ref:        sourceRef,
    received_at:       new Date(),
    raw_payload:       {
      fromEmail: scenario.fromEmail,
      fromName:  scenario.fromName,
      subject:   scenario.subject,
      body:      scenario.body,
      betaEval:  true,
      scenarioId: scenario.id,
    },
    processing_status: "received",
  })
  const signalId = signal.signal_id
  await updateSignal(signalId, { processing_status: "normalizing" })

  // 2. Identity resolution
  let identityId: string
  const existingIdentity = await findIdentityByEmail(productId, scenario.fromEmail)
  if (existingIdentity) {
    identityId = existingIdentity.identity_id
  } else {
    const { createIdentity: createId } = await import("../../src/infra/db/repositories/index.js")
    const identity = await createId({
      product_id:      productId,
      type:            "end_user",
      display_name:    scenario.fromName || undefined,
      email_addresses: [scenario.fromEmail],
    })
    identityId = identity.identity_id
  }

  // 3. Conversation
  // ConversationChannelSchema: "email" | "telegram" | "internal" | "chat"
  // Map source_type → conversation channel: github_webhook/scheduled/manual → "internal"
  const channel = scenario.sourceType === "chat" ? "chat" as const : "internal" as const
  const conv = await createConversation({
    product_id:      productId,
    channel,
    subject:         scenario.subject.slice(0, 200),
    thread_key:      `beta-eval:${scenario.id}:${runId}`,
    participant_ids: [identityId],
    status:          "active",
    last_message_at: new Date(),
  })
  const conversationId = conv.conversation_id

  // 4. Case
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

  // 5. Link signal
  await updateSignal(signalId, {
    identity_id:     identityId,
    conversation_id: conversationId,
    case_id:         caseId,
    processing_status: "normalized",
    normalized_payload: {
      signalText,
      subject:   scenario.subject,
      fromEmail: scenario.fromEmail,
      fromName:  scenario.fromName,
    },
  })

  // 6. Audit events
  await createAuditEvent({
    product_id:  productId,
    entity_type: "signal",
    entity_ref:  signalId,
    actor_type:  "system",
    actor_ref:   "beta-eval-inject",
    action:      "signal.received",
    after_state: { signalId, source_type: scenario.sourceType, processing_status: "normalized" },
    metadata:    { scenarioId: scenario.id, fromEmail: scenario.fromEmail },
  })

  await createAuditEvent({
    product_id:  productId,
    entity_type: "case",
    entity_ref:  caseId,
    actor_type:  "system",
    actor_ref:   "beta-eval-inject",
    action:      "case.created",
    after_state: { caseId, status: "enriching", signalId, conversationId },
    metadata:    { subject: scenario.subject, scenarioId: scenario.id },
  })

  // 7. Dispatch triage
  const jobId = newId("job_")
  await dispatch({
    actionType: "triage",
    productId,
    caseId,
    jobId,
    payload: { signalText, signalId },
  })

  // 8. Mark linked
  await updateSignal(signalId, { processing_status: "linked" })

  return { signalId, conversationId, caseId, identityId, duplicate: false }
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
  } else if (args.mode === "product") {
    filtered = scenarios.filter((s) => s.productSlug === args.productFilter)
  } else {
    filtered = scenarios
  }

  console.log(`\n🚀 Beta Evaluation — Signal Injection`)
  console.log(`   Mode: ${args.mode}${args.scenarioId ? ` (${args.scenarioId})` : ""}${args.productFilter ? ` (${args.productFilter})` : ""}`)
  console.log(`   Scenarios: ${filtered.length}`)
  console.log(`   Delay: ${args.delayMs}ms between injections`)
  console.log(`   Dry run: ${args.dryRun}\n`)

  if (args.dryRun) {
    for (const s of filtered) {
      console.log(`  [dry-run] ${s.id} | ${s.targetProduct} | ${s.sourceType} | ${s.fromEmail}`)
      console.log(`            Subject: ${s.subject.slice(0, 80)}`)
    }
    console.log(`\n✅ Dry run complete. ${filtered.length} signals would be injected.`)
    return
  }

  // ── Discover product IDs ────────────────────────────────────────────────
  const db = getDb()
  let dgProductId = args.dgProductId
  let ssProductId = args.ssProductId

  if (!dgProductId || !ssProductId) {
    const products = await db<Array<{ product_id: string; name: string }>>`
      SELECT product_id, name FROM products WHERE name IN ('DocuGardener', 'SkillSeal')
    `
    for (const p of products) {
      if (p.name === "DocuGardener" && !dgProductId) dgProductId = p.product_id
      if (p.name === "SkillSeal" && !ssProductId) ssProductId = p.product_id
    }
  }

  console.log(`  Products:`)
  console.log(`    DocuGardener: ${dgProductId ?? "NOT FOUND"}`)
  console.log(`    SkillSeal:    ${ssProductId ?? "NOT FOUND"}\n`)

  // Validate needed products exist
  const neededDg = filtered.some((s) => s.targetProduct === "dg")
  const neededSs = filtered.some((s) => s.targetProduct === "ss")
  if (neededDg && !dgProductId) {
    console.error(`❌ DocuGardener product not found. Create it first via Console.`)
    await closeDb()
    process.exit(1)
  }
  if (neededSs && !ssProductId) {
    console.error(`❌ SkillSeal product not found. Create it first via Console.`)
    await closeDb()
    process.exit(1)
  }

  // ── Generate unique run ID for dedup ────────────────────────────────────
  const runId = Date.now().toString(36)
  console.log(`  Run ID: ${runId}\n`)

  // ── Inject signals ──────────────────────────────────────────────────────
  const results: Array<{ id: string; result?: IngestResult; error?: string }> = []

  for (let i = 0; i < filtered.length; i++) {
    const scenario = filtered[i]!
    const productId = scenario.targetProduct === "dg" ? dgProductId! : ssProductId!

    console.log(`  [${i + 1}/${filtered.length}] Injecting ${scenario.id}...`)
    console.log(`    Product: ${scenario.targetProduct} (${productId})`)
    console.log(`    Channel: ${scenario.sourceType}`)
    console.log(`    From: ${scenario.fromName} <${scenario.fromEmail}>`)
    console.log(`    Subject: ${scenario.subject.slice(0, 70)}`)

    try {
      let result: IngestResult

      if (scenario.sourceType === "email") {
        // Use real email ingress pipeline
        const email: ParsedEmail = {
          messageId:       `beta-eval:${scenario.id}@nestfleet.local`,
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
        result = await ingestEmailSignal(productId, email)
      } else if (scenario.sourceType === "contact_form") {
        // Use real contact form ingress
        result = await ingestContactFormSignal(productId, {
          name:    scenario.fromName,
          email:   scenario.fromEmail,
          subject: scenario.subject,
          message: scenario.body,
        })
      } else if (scenario.sourceType === "chat") {
        // Use real chat ingress
        const chatResult = await startChatSession(productId, {
          name:    scenario.fromName,
          email:   scenario.fromEmail,
          message: `${scenario.subject}\n\n${scenario.body}`,
        })
        result = chatResult
      } else {
        // Generic ingress for github_webhook, manual (slack), scheduled
        result = await ingestGenericSignal(productId, scenario, runId)
      }

      results.push({ id: scenario.id, result })
      console.log(`    ✅ Signal: ${result.signalId}`)
      console.log(`       Case:   ${result.caseId}`)
      console.log(`       Dup:    ${result.duplicate}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ id: scenario.id, error: msg })
      console.log(`    ❌ Error: ${msg}`)
    }

    // Delay between injections (skip after last one)
    if (i < filtered.length - 1 && args.delayMs > 0) {
      console.log(`    ⏳ Waiting ${args.delayMs}ms...\n`)
      await new Promise((r) => setTimeout(r, args.delayMs))
    } else {
      console.log()
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const successes = results.filter((r) => r.result && !r.result.duplicate)
  const duplicates = results.filter((r) => r.result?.duplicate)
  const errors = results.filter((r) => r.error)

  console.log(`\n📊 Injection Summary:`)
  console.log(`   Total:      ${results.length}`)
  console.log(`   ✅ Created: ${successes.length}`)
  console.log(`   ⏭  Dups:    ${duplicates.length}`)
  console.log(`   ❌ Errors:  ${errors.length}`)

  if (successes.length > 0) {
    console.log(`\n📋 Cases created:`)
    for (const r of successes) {
      console.log(`   ${r.id}: case=${r.result!.caseId}`)
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors:`)
    for (const r of errors) {
      console.log(`   ${r.id}: ${r.error}`)
    }
  }

  console.log(`\n💡 Next steps:`)
  console.log(`   1. Wait ~5 minutes for triage agents to process all cases`)
  console.log(`   2. Open Console → Cases tab → verify ${successes.length} cases`)
  console.log(`   3. Check triage results: severity, type, AI response quality`)
  console.log(`   4. Record results in the evaluation matrix (docs/beta-evaluation-scenarios.md)`)

  await closeDb()
  console.log(`\n✅ Injection complete.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
