# Onboarding & Channels Hub — Refactor Specification

> **Version:** 1.0
> **Date:** 2026-03-24
> **Status:** Draft
> **Author:** Product / Architecture
> **Parent:** [`../business/product-suite-strategy.md`](../business/product-suite-strategy.md)
> **Scope:** NestFleet Console — `console/src/app/setup/`, `console/src/app/settings/`, `console/src/components/AddProductWizard.tsx`

---

## 1. Problem Statement

NestFleet currently splits channel configuration across five disconnected Settings sections (CI Integration, Chat Widget, Contact Form, Notifications, and implicitly LLM). The first-run wizard introduces a product and an LLM, but never guides the operator through connecting the channels their users will actually contact them through.

The result: a P1 owner (e.g. DocuGardener) completes the wizard, opens the Console, and has no signal that four channels are unconfigured. They discover Chat Widget and Contact Form by browsing Settings. Telegram is env-var only — no UI path at all.

As NestFleet v2 adds Linear, Jira, Telegram (full), WhatsApp, and others, the current Settings structure collapses — each new channel appends another section to an already long left-nav.

**This refactor fixes the structure before v2 channels arrive.**

---

## 2. Current State

### 2.1 First-run wizard (`/setup/page.tsx`) — 5 steps

| Step | Content | Problem |
|------|---------|---------|
| 1 — Welcome | Product name | Fine |
| 2 — LLM | Provider, API key, model | Skippable — creates risk of dead products with no AI |
| 3 — Leads | Support/Change/Product Lead emails | Buried before channels — operator doesn't understand why this matters yet |
| 4 — GitHub | Repo URL + PAT | Only one channel, chosen without context |
| 5 — Done | Green screen, "Open Console" | No completeness signal, no next steps |

**Root problem:** channels are an afterthought in the wizard. The operator leaves the wizard without understanding that email, chat, or contact form need separate configuration.

### 2.2 Settings page (`/settings/page.tsx`) — 11 sections

```
Product
LLM Provider
Lead Assignments
Agent Behavior
Notifications          ← Slack + Telegram (env-var only) + quiet hours
CI Integration         ← GitHub webhook + PAT
Contact Form           ← public key + embed snippet
Chat Widget            ← toggle + welcome message + snippet
Roles & Permissions
Users (admin)
Plan & Billing (admin)
```

**Root problems:**
- Channel sections (Notifications, CI Integration, Contact Form, Chat Widget) are not grouped — a P1 owner configuring all channels visits four separate sections
- No status indicator per channel (is it receiving events? when was the last one?)
- Notifications mixes channel config (Slack webhook URL) with policy config (quiet hours) — different concerns in one section
- Telegram is read-only display of an env-var value, not a configurable field

### 2.3 Add Product wizard (`AddProductWizard.tsx`) — 3 steps

Name → Stage → Confirm. No channel prompt. Every additional product starts with zero channels configured and no guidance to fix that.

### 2.4 Scalability gap

v2 channel additions (Linear, Jira, Telegram full, WhatsApp, SMS) have no structural home. Each would be added as another Settings section. At v2+3, the left-nav becomes unusable.

---

## 3. Goals

| Goal | Metric |
|------|--------|
| Every new product has at least one channel configured before the operator sees the case list | Wizard completion → channel configured: 100% |
| All channels visible in one place with live status | Channels hub page: all channels in one view |
| Adding a new channel in v2 requires no Settings page restructuring | Channel catalog pattern: new channel = new config entry, not a new section |
| P1 owners can self-serve channel setup without reading docs | Setup completion without support contact |
| Telegram and future channels configurable via UI, not env vars | Zero env-var-only channels |

---

## 4. Non-Goals

- Implementing the v2 channels themselves (Linear, Jira, WhatsApp, SMS) — this spec defines their *structural home*, not their implementation
- Changing the backend signal ingress logic
- Changing the case lifecycle or triage pipeline
- Replacing the Settings page for non-channel concerns (Product, LLM, Leads, Agent Behavior, Roles, Users, Plan)

---

## 5. Proposed Architecture

### 5.1 Settings restructure

**Before:**
```
Product · LLM Provider · Lead Assignments · Agent Behavior ·
Notifications · CI Integration · Contact Form · Chat Widget ·
Roles & Permissions · Users · Plan & Billing
```

**After:**
```
Product
LLM Provider
Team & Leads
Agent Behavior
Channels          ← new hub page (replaces CI / Chat / ContactForm / Notifications)
Notifications     ← policy only: quiet hours, weekend suppression, escalation rules
Roles & Permissions
Users
Plan & Billing
```

Channel-specific setup (Slack webhook URL, GitHub PAT, widget snippet) moves into the Channels hub. Notifications retains only policy configuration.

### 5.2 Three surfaces to change

```
┌─────────────────────────────────────────────────────────────────┐
│  Surface 1: First-run wizard (/setup)                           │
│  4 steps: Identity → AI Brain → First Channel → Done+Checklist  │
├─────────────────────────────────────────────────────────────────┤
│  Surface 2: Channels Hub (Settings → Channels)                  │
│  Catalog of channel cards with status + guided setup flows      │
├─────────────────────────────────────────────────────────────────┤
│  Surface 3: Add Product wizard (modal)                          │
│  3 steps: Name → Stage → First Channel prompt                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Surface 1 — First-run Wizard Refactor

### 6.1 New step structure

```
Step 1 — Product Identity
Step 2 — AI Brain
Step 3 — First Channel
Step 4 — Done
```

Removed: separate Leads step (moved into Team & Leads Settings section post-setup).
Rationale: operators don't know their lead assignments before they've seen what NestFleet does. Leads can be configured after first use with context.

### 6.2 Step 3 — First Channel (new)

The operator picks one channel and configures the minimum required fields inline.

**Channel options presented:**

| Channel | Icon | Tagline | Min required fields |
|---------|------|---------|---------------------|
| Email | ✉️ | "Receive emails at your support address" | Inbound address shown (auto-provisioned), optional: custom domain |
| GitHub Issues | 🐙 | "Get notified when users open issues" | Repo URL + PAT |
| Chat Widget | 💬 | "Let users chat from inside your product" | Welcome message |
| Contact Form | 📋 | "Add a contact form to your website" | (zero — key auto-generated) |
| Skip | — | "I'll configure channels later" | — |

**Behaviour:**
- Selecting a channel expands an inline mini-form with only the minimum required fields
- "Skip" is always available and non-judgmental — it leads to the same Done screen
- No channel requires more than 2 fields at this step — deep configuration happens in the Channels hub

**Skip policy:** Skipping Step 3 or skipping the entire wizard does not block Console access. The Channels hub completeness badge will surface the gap.

### 6.3 Step 4 — Done + Completeness Preview (new)

```
✅ DocuGardener is live

AI provider:   Gemini 2.5 Flash  ✅
First channel: Email (forwarding active)  ✅

More channels to configure:
  ○ GitHub Issues    → Set up
  ○ Chat Widget      → Set up
  ○ Contact Form     → Set up
  ○ Slack            → Set up
  ○ Telegram         → Set up

[Open Console]   [Configure more channels →]
```

- "Set up" links navigate directly to the channel's guided flow in the Channels hub
- "Configure more channels →" opens the full Channels hub
- The checklist persists as a sidebar badge until all desired channels are configured

### 6.4 Wizard API changes

`POST /api/v1/setup/complete` payload extended:

```typescript
{
  productName: string
  llm?: { provider, apiKey, model, embeddingModel }
  // leads removed from wizard — moved to Settings
  firstChannel?: {
    type: "email" | "github" | "chat" | "contact_form"
    config: Record<string, string>   // channel-specific fields
  }
}
```

---

## 7. Surface 2 — Channels Hub

### 7.1 Page location

`Settings → Channels` — routed at `/p/[slug]/settings?section=channels`

Replaces: `ci`, `contact-form`, `chat` sections. The `notifications` section is renamed and scoped to policy only.

### 7.2 Channel catalog definition

The catalog is a static configuration array — not DB-driven. Adding a new channel = adding an entry.

```typescript
type ChannelAuthType = "webhook" | "oauth" | "snippet" | "env" | "api_key"
type ChannelStatus   = "connected" | "not_configured" | "no_events" | "error"
type ChannelCategory = "inbound" | "outbound" | "platform"

interface ChannelDefinition {
  id:           string               // e.g. "github", "email", "telegram"
  name:         string
  icon:         string               // emoji or SVG path
  description:  string
  authType:     ChannelAuthType
  category:     ChannelCategory
  tier:         "starter" | "growth" | "scale"   // minimum tier required
  available:    boolean              // false = shown as "Coming soon"
  deferredRef:  string | null        // e.g. "DEFERRED-14" — links to backlog item
  targetRelease: string | null       // e.g. "v2.1" — informational
  setupSteps:   ChannelSetupStep[]
}
```

### 7.3 v1 channel catalog (shipping with this refactor)

| id | Name | Auth type | Tier | Status |
|----|------|-----------|------|--------|
| `email` | Email | `api_key` (inbound address) | Starter | Active |
| `github` | GitHub Issues | `webhook` + PAT | Starter | Active |
| `chat` | Chat Widget | `snippet` | Starter | Active |
| `contact_form` | Contact Form | `snippet` | Starter | Active |
| `slack` | Slack | `webhook` | Growth | Active |
| `telegram` | Telegram | `api_key` (bot token) | Growth | Active — UI-configurable (replaces env-var) |

### 7.4 v2 channel catalog (shown as "Coming soon" cards)

Sourced from official DEFERRED backlog items plus product-vision §16.2 work management integrations. Each entry notes its DEFERRED reference where one exists.

#### Inbound signal channels (user → NestFleet case)

| id | Name | Auth type | DEFERRED | Target | Notes |
|----|------|-----------|----------|--------|-------|
| `discord` | Discord | `oauth` | DEFERRED-15 | v2.1 | Forum channels + DMs; strong developer-tool ICP fit; thread-aware ingestion |
| `linear` | Linear | `oauth` | DEFERRED-14 | v2.1 | Bidirectional: issues → cases, CRs → Linear issues; T3 memory indexing |
| `jira` | Jira | `oauth` | DEFERRED-16 | v2.1 | Bidirectional: Jira Service Management tickets → cases; mirrors Linear connector pattern; sequence after Linear |
| `asana` | Asana | `oauth` | — (product-vision §16.2) | v2.2+ | Work management integration; lower ICP priority than Linear/Jira for startup segment |
| `whatsapp` | WhatsApp Business | `oauth` | — (product-vision §5.3) | v2.2+ | Via Meta Cloud API; high-value for non-developer user segments |
| `sms` | SMS / Voice | `api_key` | — (product-vision §16.3) | v2.2+ | Twilio / MessageBird; SMS inbound + voice transcription for escalation |

#### Outbound / notification channels (NestFleet → operator team)

| id | Name | Auth type | DEFERRED | Target | Notes |
|----|------|-----------|----------|--------|-------|
| `ms_teams` | Microsoft Teams | `webhook` | DEFERRED-18 | On-demand | Outbound notifications; activate on first enterprise Teams customer request |

#### Platform integrations (API / ecosystem)

| id | Name | Auth type | DEFERRED | Target | Notes |
|----|------|-----------|----------|--------|-------|
| `headless_api` | Public API / Headless Portal | `api_key` | DEFERRED-17 | v2.1 | OpenAPI spec + TypeScript SDK; enables P1 owners to build custom support UI on NestFleet's backend; prerequisite: SEC-01 (product-scoped auth) |
| `zapier` | Zapier | `api_key` | — | v2.2+ | Generic webhook bridge; enables long-tail integrations without first-party adapters |
| `intercom` | Intercom (bridge) | `api_key` | — | v2.2+ | Forward existing Intercom conversations to NestFleet; migration path for teams switching |

> **Note on WhatsApp, SMS, Asana, Zapier, Intercom:** These are not in the formal DEFERRED backlog yet. They are grounded in product-vision §5.3 ("omnichannel"), §10.1 ("app feedback and internal channels"), and §16.2 ("work management: Jira, Asana, Linear"). A DEFERRED item should be created for each before implementation planning begins.

"Coming soon" cards are visible in the catalog, grayed out, with a "Notify me" or "Request early access" CTA. They communicate the roadmap without requiring any implementation.

### 7.5 Channel card anatomy

Each channel renders as a card in a responsive grid (2 columns on ≥1280px, 1 column below).

```
┌─────────────────────────────────────────────────────────┐
│  🐙  GitHub Issues                    ● Connected        │
│                                                          │
│  Receive issues from your GitHub repo as cases.         │
│  Auto-reply posts back to the issue thread.             │
│                                                          │
│  Last event: 4 minutes ago                              │
│  Repo: your-org/docugardener                     │
│                                              [Configure] │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  💬  Chat Widget                       ⚠ No events       │
│                                                          │
│  Snippet detected — no sessions received yet.           │
│                                                          │
│  [View snippet]          [Send test ping]               │
│                                              [Configure] │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  🔵  Linear                      ✦ Coming soon          │
│                                                          │
│  Route Linear issues to NestFleet cases automatically.  │
│                                                          │
│                               [Notify me when available] │
└─────────────────────────────────────────────────────────┘
```

**Status badge mapping:**

| Status | Badge | Colour | Condition |
|--------|-------|--------|-----------|
| `connected` | ● Connected | Green | At least one event received in last 7 days |
| `not_configured` | ○ Not set up | Gray | No config saved for this channel |
| `no_events` | ⚠ No events | Amber | Config saved but zero events received (or last event >7 days ago) |
| `error` | ✗ Error | Red | Last ingress attempt failed (webhook 4xx/5xx, auth failure) |
| `coming_soon` | ✦ Coming soon | Purple | `v2: true` in catalog definition |

### 7.6 Per-channel guided flow (slide-over panel)

Clicking `Configure` or `Set up` opens a right-side slide-over panel (not a new page — the catalog remains visible behind it).

Each flow follows the same three-part structure:

```
[1] Provision    — NestFleet generates the artefact P1 needs
[2] Configure    — P1 provides secrets / preferences
[3] Verify       — live test confirms the channel is working
```

#### Email flow

```
[1] Provision
    Your inbound address (auto-generated, never changes):
    ┌────────────────────────────────────────────┐
    │  dg_prod_xxxx@in.nestfleet.dev         [Copy]│
    └────────────────────────────────────────────┘
    Set up forwarding from your support address:
    [Gmail]  [Outlook]  [Fastmail]  [Cloudflare]  [Other]
    → shows platform-specific forwarding steps inline

[2] Configure send-as (recommended)
    So replies appear to come from support@docugardener.io:

    Add these DNS records to docugardener.io:
    ┌─────────────────────────────────────────────────────┐
    │ TXT  @                  v=spf1 include:nestfleet.dev  │
    │ TXT  nestfleet._domainkey  [value]            [Copy] │
    └─────────────────────────────────────────────────────┘
    DNS status: [ Checking... / ✅ Verified / ⚠ Not found ]
    [Recheck]

[3] Verify
    [Send test email →]
    "We'll send a message to your inbound address.
     It should appear as a case within 30 seconds."
    ⏳ Waiting...  /  ✅ Test case received — Email is live
```

#### GitHub flow

```
[1] Provision
    Add this webhook to your GitHub repository:
    Settings → Webhooks → Add webhook

    Payload URL:    https://nestfleet.dev/api/v1/webhooks/github  [Copy]
    Content type:   application/json
    Secret:         [generated]  [Copy]  [Regenerate]
    Events:         ☑ Issues  ☑ Pull requests  ☐ Push

[2] Configure
    Repository (owner/repo):  [________________]
    GitHub PAT:               [________________]  [lock icon]
    Scope required: repo, read:org

[3] Verify
    [Create test issue →]   opens github.com/owner/repo/issues/new in new tab
    ⏳ Waiting for webhook ping...
    ✅ Issue received as case — GitHub is live
```

#### Chat Widget flow

```
[1] Configure
    Welcome message:  [Having trouble? Ask here.]
    Accent colour:    [hex picker — defaults to product accent colour]

[2] Add to your app
    Platform: [Next.js] [React] [HTML] [WordPress] [Webflow] [Other]

    → Next.js variant:
    ┌──────────────────────────────────────────────────────┐
    │ // app/layout.tsx                                    │
    │ import Script from 'next/script'                     │
    │                                                      │
    │ <Script                                              │
    │   src="https://nestfleet.dev/widget/nestfleet-chat.js"│
    │   data-product-key="dg_pub_xxxx"                     │
    │   strategy="afterInteractive" />                     │
    └──────────────────────────────────────────────────────┘
    [Copy]

    Identity passthrough (users auto-identified when logged in):
    ┌──────────────────────────────────────────────────────┐
    │ // after your own auth resolves                      │
    │ window.NestFleet?.identify({                         │
    │   email: user.email,                                 │
    │   name:  user.name,                                  │
    │ })                                                   │
    └──────────────────────────────────────────────────────┘

[3] Verify
    ⏳ Waiting for first session...
    [Open preview →]   opens a test page with the widget embedded
    ✅ First session received — Chat Widget is live
```

#### Contact Form flow

```
[1] Provision
    Public key (safe to include in HTML):
    [cf_pub_xxxx]  [Copy]  [Regenerate key]

[2] Add to your site
    Platform: [HTML] [Next.js] [React] [Webflow] [WordPress]

    → HTML variant:
    ┌──────────────────────────────────────────────────────┐
    │ <div id="nestfleet-contact-form"></div>               │
    │ <script                                              │
    │   src="https://nestfleet.dev/widget/nestfleet-form.js"│
    │   data-public-key="cf_pub_xxxx" async>               │
    │ </script>                                            │
    └──────────────────────────────────────────────────────┘
    [Copy]

[3] Verify
    [Submit test form →]   opens test page with form
    ⏳ Waiting for submission...
    ✅ Test submission received as case — Contact Form is live
```

#### Slack flow

```
[1] Provision (outbound notifications)
    In Slack: Apps → Incoming Webhooks → Add to Slack → choose channel

[2] Configure
    Webhook URL:  [https://hooks.slack.com/...]  [Test connection]
    Notify on:    ☑ New critical cases  ☑ Escalations  ☐ All cases

[3] Verify
    [Send test notification →]
    ✅ Test message received in #support-alerts
```

#### Telegram flow (replaces env-var config)

```
[1] Create bot
    In Telegram: message @BotFather → /newbot → copy token
    Bot name tip: "DocuGardener Support" (@DocuGardener_SupportBot)

[2] Configure
    Bot token:  [____________________]  [lock icon]
    [Connect →]   NestFleet calls setWebhook automatically

[3] Verify
    Bot username: @DocuGardener_SupportBot  ✅
    [Send test message →]   opens t.me/DocuGardener_SupportBot
    ✅ Message received as case — Telegram is live
```

#### Linear flow (v2, shown as Coming soon — spec for implementation reference)

```
[1] Connect
    [Connect Linear account →]  → OAuth redirect → authorise → return
    ✅ Connected as alexey@company.com (Workspace: NestFleet Dev)

[2] Configure
    Teams:        ☑ Engineering  ☑ Support  ☐ Design
    Issue types:  ☑ Bug  ☑ Incident  ☐ Feature Request
    Auto-reply:   ☑ Post triage summary as Linear comment

[3] Verify
    [Create test issue in Linear →]
    ✅ Test issue received as case — Linear is live
```

### 7.7 Backend: channel status API

New endpoint required:

```
GET /api/v1/products/:productId/channels/status
```

Response:
```typescript
{
  channels: {
    [channelId: string]: {
      status:      "connected" | "not_configured" | "no_events" | "error"
      lastEventAt: string | null    // ISO timestamp
      errorDetail: string | null    // last error message if status=error
      config:      Record<string, string>   // non-secret fields only
    }
  }
}
```

Status is computed from:
- `connected`: `COUNT(*) FROM signals WHERE product_id=X AND source_type=Y AND created_at > now()-'7 days'` > 0
- `no_events`: config saved but count = 0
- `not_configured`: no config saved
- `error`: last signal ingress for this source_type resulted in error (requires `signals.ingress_error` field or separate ingress_log)

Polled by the Channels hub page via SWR with `refreshInterval: 30_000`.

---

## 8. Surface 3 — Add Product Wizard Update

Add a Step 3 between Stage and Confirm:

```
Step 1 — Name
Step 2 — Stage
Step 3 — First Channel  ← new (same channel picker as first-run wizard Step 3)
Step 4 — Confirm
```

Step 3 is skippable. It uses the same `<ChannelPickerStep>` component as the first-run wizard to avoid duplication.

---

## 9. Sidebar completeness badge

A persistent indicator in the Sidebar near the Settings nav item:

```typescript
// Shown when: channels where status === "not_configured" > 0
// Hidden when: all channels configured OR dismissed by operator

<span className="ml-auto text-xs text-amber-500">
  {unconfiguredCount} channel{unconfiguredCount > 1 ? "s" : ""} to set up
</span>
```

Clicking the badge navigates to `Settings → Channels`.

Dismissed via a `nf_channels_badge_dismissed` localStorage key. Reappears when a new channel becomes available (v2 channel added to catalog).

---

## 10. Component map

```
console/src/
├── app/
│   ├── setup/
│   │   └── page.tsx                    MODIFY — 4-step wizard, new Step3Channel
│   └── (app)/p/[slug]/settings/
│       └── page.tsx                    MODIFY — add "channels" section, remove ci/chat/contact-form
├── components/
│   ├── AddProductWizard.tsx            MODIFY — add Step3Channel
│   ├── ChannelsHub.tsx                 NEW    — hub page with catalog grid
│   ├── ChannelCard.tsx                 NEW    — status card component
│   ├── ChannelSetupPanel.tsx           NEW    — slide-over guided flow
│   ├── channel-flows/
│   │   ├── EmailFlow.tsx               NEW
│   │   ├── GitHubFlow.tsx              NEW    — extracts from CiSection
│   │   ├── ChatWidgetFlow.tsx          NEW    — extracts from ChatWidgetSection
│   │   ├── ContactFormFlow.tsx         NEW    — extracts from ContactFormSection
│   │   ├── SlackFlow.tsx               NEW    — extracts from NotificationsSection
│   │   ├── TelegramFlow.tsx            NEW    — replaces env-var display
│   │   └── ComingSoonFlow.tsx          NEW    — generic placeholder for v2
│   ├── ChannelPickerStep.tsx           NEW    — shared by setup wizard + add-product wizard
│   └── Sidebar.tsx                     MODIFY — completeness badge
└── lib/
    └── channel-catalog.ts              NEW    — ChannelDefinition[] static config
```

---

## 11. Notifications section cleanup

After channels move to the Channels hub, `Settings → Notifications` retains only:

- Quiet hours (start time, end time, timezone)
- Weekend suppression toggle
- Escalation rules (notify on Critical, notify on High)
- Per-channel notification policy (which channels get which severity alerts)

Slack webhook URL and Telegram bot token move to their respective channel flows.

---

## 12. Migration notes

- Existing Slack webhook URLs and GitHub PATs stored in `support_policy` / `ci_config` JSONB fields are not moved — the new channel flows read from and write to the same backend fields. No DB migration required.
- Existing Telegram `TELEGRAM_BOT_TOKEN` env var continues to work as fallback. New UI writes the token to `products.ci_config.telegramBotToken` (encrypted, same pattern as GitHub PAT). The backend reads UI config first, falls back to env var.
- Settings deep-links using `?section=ci`, `?section=chat`, `?section=contact-form` redirect to `?section=channels` with the relevant channel's slide-over pre-opened.

---

## 13. Definition of Done

| Criterion | Verification |
|-----------|-------------|
| First-run wizard has 4 steps including channel picker | Manual walkthrough |
| All v1 channels visible in Channels hub with status | Channels hub renders all 6 cards |
| `● Connected` status shows for channels with recent events | Inject a signal → status updates within 30s |
| `⚠ No events` status shows for configured-but-silent channels | Configure Slack webhook, send no messages → amber badge |
| Each channel has a Provision → Configure → Verify flow | Per-channel guided flows render and complete |
| Telegram configurable via UI (no env-var required) | Set bot token in UI → webhook registered → test message creates case |
| v2 channels show as "Coming soon" cards | Linear, Jira, WhatsApp visible in catalog |
| DNS verification shows live status for email send-as | Add DNS records → Recheck → turns green |
| Completeness badge appears in sidebar when channels unconfigured | Fresh product → badge shows "5 channels to set up" |
| `?section=ci` redirects to `?section=channels` | Deep-link test |
| Add Product wizard includes channel picker step | Modal walkthrough |
| All existing Settings channel config still works post-refactor | Regression check on CI, Chat, ContactForm sections |

---

## 14. Open questions

| # | Question | Owner | Due |
|---|----------|-------|-----|
| OQ-1 | Does `GET /channels/status` need its own DB view or can it be computed on the fly from `signals` table count? At scale (millions of signals) a materialized view may be needed. | Backend | Before implementation |
| OQ-2 | Should "Coming soon" cards have a waitlist / notify-me backend, or is a static CTA sufficient for v1 of this refactor? | Product | Before implementation |
| OQ-3 | Email send-as DNS verification — does NestFleet need to provision DKIM keypairs per product, or use a shared signing domain? Shared is simpler but less professional (reply-to shows nestfleet.dev sender). Per-product DKIM is the Postmark/Mailgun pattern. | Infrastructure | Before email flow implementation |
| OQ-4 | Identity passthrough (`NestFleet.identify()`) for Chat Widget — should this be signed (HMAC) to prevent user impersonation? Intercom uses HMAC identity verification as a security feature. | Security | Before chat flow ships to production |
| OQ-5 | Where does the `nf_channels_badge_dismissed` state live? localStorage works for single-device, but a multi-device operator loses the dismissal. Low priority for now but worth noting. | Frontend | Post-v1 |
