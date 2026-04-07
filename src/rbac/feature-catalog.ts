/**
 * FEATURE_CATALOG — canonical user-facing feature taxonomy. §6.4.
 *
 * Single source of truth mapping user-visible feature names to:
 *   - The minimum ProductTier required
 *   - The RBAC permissions that govern the feature (for the permission matrix)
 *   - An optional Category B feature flag (channels, SSO, compliance bundles)
 *   - Per-tier behavior descriptions (features that exist at multiple tiers
 *     but behave differently, e.g. AI Auto-Reply)
 *
 * Used by three surfaces — the same label strings appear on all three:
 *   1. Frontend: Roles & Permissions page — groups permission rows by feature group
 *   2. Frontend: Plan comparison / upgrade prompts
 *   3. Marketing: landing page feature list
 *
 * This catalog is PURELY PRESENTATIONAL. It is not an enforcement mechanism.
 * Enforcement happens via:
 *   - requireTier()         → Category A (API middleware)
 *   - requireFeature()      → Category B (channel / compliance handlers)
 *   - in-worker tier checks → Category C (behavioral gates)
 *
 * Analytics note: `analytics:read` is a single RBAC permission that covers
 * all analytics sub-endpoints. It appears in multiple FeatureEntry.permissions
 * arrays. In the permission matrix render it once per group; in the plan
 * comparison render each sub-feature entry separately with its own minTier.
 */

import type { ProductTier } from "./permission-engine.js"
import type { PermissionId } from "../infra/db/repositories/permissions.js"

// ── Types ──────────────────────────────────────────────────────────────────────

export type FeatureGroupId =
  | "support_inbox"
  | "developer_workflow"
  | "knowledge_base"
  | "analytics"
  | "channels"
  | "compliance"
  | "team_access"
  | "platform"

/** Per-tier behavior description for features that exist across multiple tiers
 *  but work differently depending on the active tier. */
export interface TierBehavior {
  tier: ProductTier
  /** Short description of how the feature behaves at this tier. */
  note: string
}

export interface FeatureEntry {
  /** Machine-readable identifier for this feature. */
  id: string
  /**
   * User-facing label.
   * Used verbatim on the landing page, in-app nav, plan comparison cards,
   * and upgrade prompts. Do not create per-surface variants.
   */
  label: string
  /** One-liner description for tooltip, plan card, or landing page bullet. */
  description: string
  /** Minimum ProductTier required to access this feature. */
  minTier: ProductTier
  /**
   * RBAC permissions required to USE this feature.
   * Empty for purely behavioral / tier-gated features that carry no
   * distinct RBAC permission (e.g. CI Auto-Complete, channel integrations).
   * When non-empty, these permission IDs are rendered inside this feature
   * group on the Roles & Permissions page matrix.
   */
  permissions: readonly PermissionId[]
  /**
   * Category B feature flag that gates this feature in the license JWT.
   * Present only for channel integrations, compliance bundles, and SSO —
   * the capabilities most likely to be rebundled across tiers.
   */
  featureFlag?: string
  /**
   * Tier-specific behavior notes for features that span multiple tiers with
   * different behaviors (e.g. AI Auto-Reply: human-approval on Community,
   * autonomous on Starter+). The UI renders the relevant note next to the
   * tier badge on the plan comparison page.
   */
  tierBehavior?: readonly TierBehavior[]
  /** Feature is cataloged but not yet implemented. Shown grayed in UI. */
  comingSoon?: true
}

export interface FeatureGroup {
  id: FeatureGroupId
  /** Section label in the Roles & Permissions page and plan comparison. */
  label: string
  /** Short description shown in plan comparison header card. */
  description: string
  /** Lowest tier at which at least one feature in this group is available. */
  minTier: ProductTier
  features: readonly FeatureEntry[]
}

// ── Catalog ────────────────────────────────────────────────────────────────────

export const FEATURE_CATALOG: readonly FeatureGroup[] = [

  // ── 1. Support Inbox ────────────────────────────────────────────────────────
  {
    id: "support_inbox",
    label: "Support Inbox",
    description: "AI handles incoming support cases — auto-reply, triage, routing, and escalation.",
    minTier: "community",
    features: [
      {
        id: "case_management",
        label: "Case Management",
        description: "View, create, and move cases through the support workflow.",
        minTier: "community",
        permissions: ["cases:read", "cases:create", "cases:transition"],
      },
      {
        id: "case_export",
        label: "Case Export",
        description: "Download cases in bulk (CSV / JSON). Contains PII — restricted to operator+.",
        minTier: "community",
        permissions: ["cases:export"],
      },
      {
        id: "case_deletion",
        label: "Case Deletion",
        description: "Permanently remove a case and its history. Irreversible — admin only.",
        minTier: "community",
        permissions: ["cases:delete"],
      },
      {
        id: "signal_queue",
        label: "Signal Queue",
        description: "View and dismiss AI-surfaced signals and alerts.",
        minTier: "community",
        permissions: ["signals:read", "signals:dismiss"],
      },
      {
        id: "approval_workflows",
        label: "Approval Workflows",
        description: "Human-in-the-loop approval queue for AI decisions that require sign-off.",
        minTier: "community",
        permissions: ["approvals:read", "approvals:act"],
      },
      {
        id: "ai_auto_reply",
        label: "AI Auto-Reply",
        description: "AI drafts and sends replies to incoming support cases.",
        minTier: "community",
        permissions: [],
        tierBehavior: [
          { tier: "community", note: "AI drafts reply — a human must approve before sending." },
          { tier: "starter",   note: "AI sends directly when confidence exceeds threshold." },
          { tier: "growth",    note: "AI sends directly when confidence exceeds threshold." },
          { tier: "scale",     note: "AI sends directly when confidence exceeds threshold." },
        ],
      },
      {
        id: "ai_triage",
        label: "AI Triage",
        description: "AI classifies case type, severity, and urgency automatically.",
        minTier: "community",
        permissions: [],
      },
      {
        id: "known_issue_matching",
        label: "Known-Issue Matching",
        description: "AI matches incoming cases to documented known issues to accelerate resolution.",
        minTier: "community",
        permissions: [],
      },
      {
        id: "outage_routing",
        label: "Outage Routing",
        description: "AI routes high-severity signals to the correct on-call team using runbooks.",
        minTier: "community",
        permissions: [],
      },
    ],
  },

  // ── 2. Developer Workflow ───────────────────────────────────────────────────
  {
    id: "developer_workflow",
    label: "Developer Workflow",
    description: "From change request to merged PR — AI-assisted, human-approved.",
    minTier: "community",
    features: [
      {
        id: "change_requests",
        label: "Change Requests",
        description: "Draft, review, approve, and complete change requests with a full audit trail.",
        minTier: "community",
        permissions: [
          "change_requests:read",
          "change_requests:create",
          "change_requests:approve",
          "change_requests:reject",
          "change_requests:complete",
        ],
      },
      {
        id: "ai_pr_drafts",
        label: "AI PR Drafts",
        description: "AI generates pull request drafts from approved change requests.",
        minTier: "community",
        permissions: ["pr_drafts:read", "pr_drafts:push"],
      },
      {
        id: "ci_auto_complete",
        label: "CI Auto-Complete",
        description: "Change requests are automatically completed when CI passes on the linked PR.",
        minTier: "growth",
        permissions: [],
      },
    ],
  },

  // ── 3. Knowledge Base ───────────────────────────────────────────────────────
  {
    id: "knowledge_base",
    label: "Knowledge Base",
    description: "A living knowledge base your AI actually uses — FAQs, runbooks, known issues.",
    minTier: "community",
    features: [
      {
        id: "knowledge_management",
        label: "Knowledge Management",
        description: "Read, write, and delete knowledge base entries used by the AI agent.",
        minTier: "community",
        permissions: ["memory:read", "memory:write", "memory:delete"],
      },
      {
        id: "auto_knowledge_capture",
        label: "Auto Knowledge Capture",
        description: "AI automatically extracts FAQ entries and runbook patterns from resolved cases.",
        minTier: "growth",
        permissions: [],
      },
    ],
  },

  // ── 4. Analytics ────────────────────────────────────────────────────────────
  {
    id: "analytics",
    label: "Analytics",
    description: "Know what your AI is doing, how well it's working, and what it's costing.",
    minTier: "community",
    features: [
      {
        id: "analytics_overview",
        label: "Overview Dashboard",
        description: "High-level KPIs — case volumes, resolution rate, AI automation rate.",
        minTier: "community",
        permissions: ["analytics:read"],
      },
      {
        id: "analytics_cost",
        label: "Cost & Token Usage",
        description: "Token consumption and estimated LLM cost broken down by action type and model.",
        minTier: "starter",
        permissions: ["analytics:read"],
      },
      {
        id: "analytics_agents",
        label: "AI Performance",
        description: "Per-agent success rates, latency, error patterns, and token efficiency.",
        minTier: "growth",
        permissions: ["analytics:read"],
      },
      {
        id: "analytics_cases",
        label: "Case Analytics",
        description: "Resolution time, escalation funnel, case volume trends, and CSAT proxies.",
        minTier: "growth",
        permissions: ["analytics:read"],
      },
      {
        id: "analytics_memory",
        label: "Knowledge Health",
        description: "Knowledge base coverage, embedding gaps, freshness scores, and conflict flags.",
        minTier: "growth",
        permissions: ["analytics:read"],
      },
      {
        id: "analytics_operations",
        label: "Operations Metrics",
        description: "Approval queue depth, rejection rate, manual triage rate, escalation rate.",
        minTier: "growth",
        permissions: ["analytics:read"],
      },
    ],
  },

  // ── 5. Channels ─────────────────────────────────────────────────────────────
  {
    id: "channels",
    label: "Channels",
    description: "Meet your users where they are — web, Slack, Discord, or your own API.",
    minTier: "starter",
    features: [
      {
        id: "channel_website_widget",
        label: "Website Widget",
        description: "Embed a support widget directly in your product or documentation site.",
        minTier: "starter",
        permissions: [],
        featureFlag: "website_widget_channel",
      },
      {
        id: "channel_slack",
        label: "Slack",
        description: "Receive and respond to support requests inside Slack channels or DMs.",
        minTier: "growth",
        permissions: [],
        featureFlag: "slack_channel",
      },
      {
        id: "channel_telegram",
        label: "Telegram",
        description: "Receive and respond to support requests via a Telegram bot.",
        minTier: "growth",
        permissions: [],
        featureFlag: "telegram_channel",
        comingSoon: true,
      },
      {
        id: "channel_discord",
        label: "Discord",
        description: "Receive and respond to support requests in Discord servers.",
        minTier: "scale",
        permissions: [],
        featureFlag: "discord_channel",
      },
      {
        id: "channel_internal_api",
        label: "Internal API Channel",
        description: "Programmatic signal ingestion from internal tooling via authenticated API.",
        minTier: "scale",
        permissions: [],
        featureFlag: "internal_api_channel",
      },
    ],
  },

  // ── 6. Compliance ───────────────────────────────────────────────────────────
  {
    id: "compliance",
    label: "Compliance",
    description: "Stay compliant without slowing down — reports, templates, and GDPR tooling.",
    minTier: "community",
    features: [
      {
        id: "compliance_reports",
        label: "Compliance Reports",
        description: "Read compliance status summaries and data retention statistics.",
        minTier: "community",
        permissions: ["compliance:read"],
      },
      {
        id: "compliance_basic_templates",
        label: "Basic Compliance Templates",
        description: "AI disclosure templates and basic data processing notices.",
        minTier: "starter",
        permissions: [],
        featureFlag: "basic_compliance_templates",
      },
      {
        id: "compliance_gdpr_templates",
        label: "GDPR / AI Act Templates",
        description: "GDPR Art. 13/14 notices, DPIA templates, AI Act transparency disclosures.",
        minTier: "growth",
        permissions: [],
        featureFlag: "gdpr_ai_act_templates",
      },
      {
        id: "compliance_dsar",
        label: "DSAR Operations",
        description: "Search for and export a data subject's personal data (GDPR Art. 15/17).",
        minTier: "growth",
        permissions: ["compliance:dsar_search", "compliance:dsar_export", "compliance:retention_run"],
        comingSoon: true,
      },
    ],
  },

  // ── 7. Team & Access ────────────────────────────────────────────────────────
  {
    id: "team_access",
    label: "Team & Access",
    description: "Right people, right access — roles, overrides, and SSO for larger teams.",
    minTier: "community",
    features: [
      {
        id: "default_roles",
        label: "Default Roles",
        description: "Four built-in roles: Admin, Operator, Support Lead, Knowledge Lead.",
        minTier: "community",
        permissions: [],
      },
      {
        id: "role_assignment",
        label: "Role Assignment",
        description: "Assign and revoke roles for team members.",
        minTier: "community",
        permissions: [],
      },
      {
        id: "custom_roles",
        label: "Custom Roles",
        description: "Create roles with any combination of atomic permissions.",
        minTier: "scale",
        permissions: [],
      },
      {
        id: "permission_overrides",
        label: "Per-User Permission Overrides",
        description: "Grant or revoke individual permissions for a specific user within a role.",
        minTier: "scale",
        permissions: [],
      },
      {
        id: "sso_saml",
        label: "SSO / SAML",
        description: "Single sign-on via SAML 2.0 — connect your identity provider.",
        minTier: "scale",
        permissions: [],
        featureFlag: "sso_saml",
      },
      {
        id: "sso_group_mapping",
        label: "SSO Group → Role Mapping",
        description: "Automatically assign roles based on IdP group membership.",
        minTier: "scale",
        permissions: [],
        featureFlag: "sso_group_mapping",
      },
    ],
  },

  // ── 8. Platform ─────────────────────────────────────────────────────────────
  {
    id: "platform",
    label: "Platform",
    description: "Manage products, settings, and the audit trail for your NestFleet installation.",
    minTier: "community",
    features: [
      {
        id: "product_management",
        label: "Product Management",
        description: "Create and configure products in your portfolio (count limited by tier).",
        minTier: "community",
        permissions: ["products:read", "products:create", "products:update"],
      },
      {
        id: "settings",
        label: "Settings",
        description: "Configure LLM provider, agent behavior, and product channels.",
        minTier: "community",
        permissions: ["settings:read", "settings:write"],
      },
      {
        id: "audit_log",
        label: "Audit Log",
        description: "Immutable record of all operator and system actions.",
        minTier: "community",
        permissions: ["audit:read"],
      },
    ],
  },

] as const

// ── Lookup helpers ─────────────────────────────────────────────────────────────

/**
 * Returns all FeatureEntry objects for a given ProductTier —
 * i.e. every feature the customer can actually use at that tier.
 */
export function getFeaturesForTier(tier: ProductTier): FeatureEntry[] {
  const TIER_ORDER: Record<ProductTier, number> = {
    community: 0,
    starter:   1,
    growth:    2,
    scale:     3,
  }
  const tierRank = TIER_ORDER[tier]
  return FEATURE_CATALOG.flatMap((g) =>
    g.features.filter((f) => TIER_ORDER[f.minTier] <= tierRank && !f.comingSoon),
  )
}

/**
 * Returns the FeatureGroup that contains a given permission ID,
 * for organizing the permission matrix on the Roles & Permissions page.
 * Returns undefined if the permission is not listed in any feature entry.
 */
export function getFeatureGroupForPermission(
  permissionId: string,
): FeatureGroup | undefined {
  return FEATURE_CATALOG.find((g) =>
    g.features.some((f) => (f.permissions as readonly string[]).includes(permissionId)),
  )
}

/**
 * Returns all features in the catalog that require the given tier or higher
 * but are NOT available at the tier below — i.e. the unlock delta when
 * upgrading FROM `fromTier`.
 */
export function getUpgradeUnlocks(fromTier: ProductTier): FeatureEntry[] {
  const NEXT: Partial<Record<ProductTier, ProductTier>> = {
    community: "starter",
    starter:   "growth",
    growth:    "scale",
  }
  const toTier = NEXT[fromTier]
  if (!toTier) return []

  const TIER_ORDER: Record<ProductTier, number> = {
    community: 0,
    starter:   1,
    growth:    2,
    scale:     3,
  }
  const fromRank = TIER_ORDER[fromTier]
  const toRank   = TIER_ORDER[toTier]

  return FEATURE_CATALOG.flatMap((g) =>
    g.features.filter(
      (f) => TIER_ORDER[f.minTier] > fromRank && TIER_ORDER[f.minTier] <= toRank,
    ),
  )
}
