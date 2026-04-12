// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

// FEAT-002: Static channel catalog. Adding a new channel = adding an entry here.
// No DB required — status is computed via GET /channels/status.

export type ChannelStatus   = "connected" | "no_events" | "not_configured" | "coming_soon"
export type ChannelCategory = "inbound" | "outbound" | "platform"
export type ChannelAuthType = "webhook" | "oauth" | "snippet" | "env" | "api_key"

export interface ChannelDefinition {
  id:            string
  name:          string
  icon:          string          // emoji
  description:   string
  authType:      ChannelAuthType
  category:      ChannelCategory
  minTier:       "starter" | "growth" | "scale"
  available:     boolean         // false = Coming soon
  deferredRef:   string | null
  targetRelease: string | null
}

export const CHANNEL_CATALOG: ChannelDefinition[] = [
  // ── v1 — available ────────────────────────────────────────────────────────
  {
    id:            "email",
    name:          "Email",
    icon:          "✉️",
    description:   "Receive support emails as cases. Customers reply to your address; NestFleet delivers them here.",
    authType:      "api_key",
    category:      "inbound",
    minTier:       "starter",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "github",
    name:          "GitHub Issues",
    icon:          "🐙",
    description:   "Turn GitHub issues into cases automatically. Auto-reply posts back to the issue thread.",
    authType:      "webhook",
    category:      "inbound",
    minTier:       "starter",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "chat",
    name:          "Chat Widget",
    icon:          "💬",
    description:   "Embed a live-chat widget in your product. Sessions stream to NestFleet cases in real time.",
    authType:      "snippet",
    category:      "inbound",
    minTier:       "starter",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "contact_form",
    name:          "Contact Form",
    icon:          "📋",
    description:   "Add a hosted contact form to any page. Zero configuration — public key auto-generated.",
    authType:      "snippet",
    category:      "inbound",
    minTier:       "starter",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "slack",
    name:          "Slack",
    icon:          "🔔",
    description:   "Post critical case alerts and escalations to a Slack channel.",
    authType:      "webhook",
    category:      "outbound",
    minTier:       "growth",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "telegram",
    name:          "Telegram",
    icon:          "✈️",
    description:   "Connect a Telegram bot to receive messages as cases. Configurable via UI.",
    authType:      "api_key",
    category:      "inbound",
    minTier:       "growth",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },
  {
    id:            "external",
    name:          "External Webhook",
    icon:          "🔗",
    description:   "Send signals from any source via a simple HTTP webhook. API-key authenticated.",
    authType:      "api_key",
    category:      "inbound",
    minTier:       "starter",
    available:     true,
    deferredRef:   null,
    targetRelease: null,
  },

  // ── v2 — coming soon ──────────────────────────────────────────────────────
  {
    id:            "discord",
    name:          "Discord",
    icon:          "🎮",
    description:   "Route forum channels and DMs to NestFleet cases. Thread-aware ingestion.",
    authType:      "oauth",
    category:      "inbound",
    minTier:       "growth",
    available:     false,
    deferredRef:   "DEFERRED-15",
    targetRelease: "v2.1",
  },
  {
    id:            "linear",
    name:          "Linear",
    icon:          "🔵",
    description:   "Route Linear issues to NestFleet cases. Bidirectional: CRs sync back to Linear.",
    authType:      "oauth",
    category:      "platform",
    minTier:       "scale",
    available:     false,
    deferredRef:   "DEFERRED-14",
    targetRelease: "v2.1",
  },
  {
    id:            "jira",
    name:          "Jira",
    icon:          "🟠",
    description:   "Jira Service Management tickets become NestFleet cases automatically.",
    authType:      "oauth",
    category:      "platform",
    minTier:       "scale",
    available:     false,
    deferredRef:   "DEFERRED-16",
    targetRelease: "v2.1",
  },
  {
    id:            "whatsapp",
    name:          "WhatsApp Business",
    icon:          "💚",
    description:   "High-value for non-developer user segments. Via Meta Cloud API.",
    authType:      "oauth",
    category:      "inbound",
    minTier:       "scale",
    available:     false,
    deferredRef:   null,
    targetRelease: "v2.2",
  },
  {
    id:            "ms_teams",
    name:          "Microsoft Teams",
    icon:          "🟪",
    description:   "Post outbound notifications to a Teams channel.",
    authType:      "webhook",
    category:      "outbound",
    minTier:       "scale",
    available:     false,
    deferredRef:   "DEFERRED-18",
    targetRelease: "on-demand",
  },
]

export const ACTIVE_CHANNELS   = CHANNEL_CATALOG.filter((c) => c.available)
export const UPCOMING_CHANNELS = CHANNEL_CATALOG.filter((c) => !c.available)
