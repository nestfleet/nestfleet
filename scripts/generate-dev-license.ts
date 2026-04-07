/**
 * generate-dev-license.ts
 *
 * Generates a signed NestFleet license JWT for local tier testing.
 * Writes it to .license-dev (or a custom path) and prints the exact
 * .env line to activate it.
 *
 * Usage:
 *   tsx --env-file .env scripts/generate-dev-license.ts --tier community
 *   tsx --env-file .env scripts/generate-dev-license.ts --tier starter
 *   tsx --env-file .env scripts/generate-dev-license.ts --tier growth
 *   tsx --env-file .env scripts/generate-dev-license.ts --tier scale
 *
 * To deactivate (restore dev mode / full access):
 *   Remove LICENSE_FILE_PATH from .env and restart.
 *
 * The token is signed with LICENSE_SECRET (default: "nestfleet-dev-license-secret").
 * Never use generated dev licenses in production.
 */

import jwt from "jsonwebtoken"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

// ── Category B feature flags per tier ─────────────────────────────────────────
// Mirrors the PRODUCT_REGISTRY in PlatformCloud (§6.3.5).
// Ordinal features are NOT listed here — they are enforced by requireTier().

const FEATURES_BY_TIER: Record<string, string[]> = {
  community: [],
  starter: [
    "website_widget_channel",
    "basic_compliance_templates",
  ],
  growth: [
    "website_widget_channel",
    "slack_channel",
    // telegram_channel is deferred
    "basic_compliance_templates",
    "gdpr_ai_act_templates",
  ],
  scale: [
    "website_widget_channel",
    "slack_channel",
    "discord_channel",
    "internal_api_channel",
    "basic_compliance_templates",
    "gdpr_ai_act_templates",
    "custom_compliance_bundles",
    "sso_saml",
  ],
}

const PRODUCT_LIMIT_BY_TIER: Record<string, number> = {
  community: 1,
  starter:   3,
  growth:    10,
  scale:     999,
}

const OU_LIMIT_BY_TIER: Record<string, number> = {
  community: 100,
  starter:   1_000,
  growth:    10_000,
  scale:     100_000,
}

// ── Parse args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const tierIdx = args.indexOf("--tier")
const outIdx  = args.indexOf("--out")

const tier   = tierIdx !== -1 ? args[tierIdx + 1] : "starter"
const outArg = outIdx  !== -1 ? args[outIdx  + 1] : ".license-dev"

if (!tier || !["community", "starter", "growth", "scale"].includes(tier)) {
  console.error("Usage: tsx scripts/generate-dev-license.ts --tier community|starter|growth|scale")
  process.exit(1)
}

const outPath = resolve(process.cwd(), outArg)

// ── Build payload ──────────────────────────────────────────────────────────────

const secret = process.env["LICENSE_SECRET"] ?? "nestfleet-dev-license-secret"

const nowSeconds = Math.floor(Date.now() / 1000)
const oneYearSeconds = 365 * 24 * 60 * 60

const payload = {
  sub:             `dev-license-${tier}`,
  tier,
  productLimit:    PRODUCT_LIMIT_BY_TIER[tier]!,
  features:        FEATURES_BY_TIER[tier]!,
  issuedAt:        nowSeconds,
  expiresAt:       nowSeconds + oneYearSeconds,  // 1-year dev license
  customerId:      "dev-customer",
  customerName:    "Dev / Local Testing",
  max_outcome_units_monthly: OU_LIMIT_BY_TIER[tier]!,
}

// Sign with ignoreExpiration-compatible format (validator uses ignoreExpiration: true)
const token = jwt.sign(payload, secret, { algorithm: "HS256", noTimestamp: true })

// ── Write file ─────────────────────────────────────────────────────────────────

writeFileSync(outPath, token, "utf-8")

// ── Print summary ──────────────────────────────────────────────────────────────

const tierLabel = tier.toUpperCase()
const featureList = FEATURES_BY_TIER[tier]!

console.log("")
console.log(`✅  Dev license written: ${outPath}`)
console.log("")
console.log(`    Tier:             ${tierLabel}`)
console.log(`    Product limit:    ${PRODUCT_LIMIT_BY_TIER[tier]}`)
console.log(`    OU limit/month:   ${OU_LIMIT_BY_TIER[tier]!.toLocaleString()}`)
console.log(`    Category B flags: ${featureList.length > 0 ? featureList.join(", ") : "(none)"}`)
console.log(`    Expires:          +1 year (dev only)`)
console.log("")
console.log("─── What is UNLOCKED at this tier ──────────────────────────────────────")
console.log("")

const UNLOCKED: Record<string, string[]> = {
  community: [
    "✅  All case management, signals, approvals",
    "✅  AI Auto-Reply (human approval required before send)",
    "✅  AI Triage, Known-Issue Matching, Outage Routing",
    "✅  Change Requests + AI PR Drafts",
    "✅  Manual Knowledge Base management",
    "✅  Analytics: Overview Dashboard only",
    "✅  Compliance: basic reports only",
    "✅  Default roles + role assignment",
    "✅  Settings, Audit Log, Products",
    "🔒  Analytics: Cost, AI Performance, Case Analytics, Operations (Starter/Growth+)",
    "🔒  Channels: Website Widget (Starter+)",
    "🔒  AI Auto-Reply autonomous send (Starter+)",
    "🔒  CI Auto-Complete (Growth+)",
    "🔒  Auto Knowledge Capture (Growth+)",
    "🔒  Custom Roles, SSO (Scale+)",
  ],
  starter: [
    "✅  Everything in Community",
    "✅  AI Auto-Reply: autonomous send (no human approval required)",
    "✅  Analytics: Overview + Cost & Token Usage",
    "✅  Channel: Website Widget",
    "✅  Compliance: Basic Templates",
    "🔒  Analytics: AI Performance, Case Analytics, Operations (Growth+)",
    "🔒  Channels: Slack (Growth+)",
    "🔒  CI Auto-Complete (Growth+)",
    "🔒  Auto Knowledge Capture (Growth+)",
    "🔒  GDPR/AI Act Templates, DSAR (Growth+)",
    "🔒  Custom Roles, SSO (Scale+)",
  ],
  growth: [
    "✅  Everything in Starter",
    "✅  Analytics: AI Performance, Case Analytics, Knowledge Health, Operations",
    "✅  Channel: Slack",
    "✅  CI Auto-Complete",
    "✅  Auto Knowledge Capture",
    "✅  Compliance: GDPR/AI Act Templates",
    "🔒  Channels: Discord, Internal API (Scale+)",
    "🔒  Custom Roles, Per-User Overrides, SSO (Scale+)",
    "🔒  Custom Compliance Bundles (Scale+)",
  ],
  scale: [
    "✅  Everything in Growth",
    "✅  Channels: Discord, Internal API",
    "✅  Custom Roles + Permission Studio",
    "✅  Per-User Permission Overrides",
    "✅  SSO / SAML + Group → Role Mapping",
    "✅  Custom Compliance Bundles",
  ],
}

for (const line of UNLOCKED[tier]!) {
  console.log(`    ${line}`)
}

console.log("")
console.log("─── To activate ─────────────────────────────────────────────────────────")
console.log("")
console.log(`    Add to .env:`)
console.log(`    LICENSE_FILE_PATH=${outPath}`)
console.log("")
console.log("    Then restart the server.")
console.log("")
console.log("─── To deactivate (restore full dev access) ─────────────────────────────")
console.log("")
console.log("    Remove LICENSE_FILE_PATH from .env and restart.")
console.log("")
