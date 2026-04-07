/**
 * Console-side presentational copy of FEATURE_CATALOG.
 * Labels and data must stay verbatim with src/rbac/feature-catalog.ts.
 * No engine dependencies — types are redeclared locally.
 *
 * Used by: PricingSection, TierGate upgrade prompts, Settings plan card.
 */

export type ProductTier = "community" | "starter" | "growth" | "scale";

export interface TierBehavior {
  tier: ProductTier;
  note: string;
}

export interface FeatureEntry {
  id: string;
  label: string;
  description: string;
  minTier: ProductTier;
  tierBehavior?: readonly TierBehavior[];
  comingSoon?: true;
}

export interface FeatureGroup {
  id: string;
  label: string;
  description: string;
  minTier: ProductTier;
  features: readonly FeatureEntry[];
}

const TIER_ORDER: Record<ProductTier, number> = {
  community: 0,
  starter:   1,
  growth:    2,
  scale:     3,
};

export const FEATURE_CATALOG: readonly FeatureGroup[] = [

  // 1. Support Inbox
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
      },
      {
        id: "signal_queue",
        label: "Signal Queue",
        description: "View and dismiss AI-surfaced signals and alerts.",
        minTier: "community",
      },
      {
        id: "approval_workflows",
        label: "Approval Workflows",
        description: "Human-in-the-loop approval queue for AI decisions that require sign-off.",
        minTier: "community",
      },
      {
        id: "ai_auto_reply",
        label: "AI Auto-Reply",
        description: "AI drafts and sends replies to incoming support cases.",
        minTier: "community",
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
      },
      {
        id: "known_issue_matching",
        label: "Known-Issue Matching",
        description: "AI matches incoming cases to documented known issues to accelerate resolution.",
        minTier: "community",
      },
      {
        id: "outage_routing",
        label: "Outage Routing",
        description: "AI routes high-severity signals to the correct on-call team using runbooks.",
        minTier: "community",
      },
    ],
  },

  // 2. Developer Workflow
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
      },
      {
        id: "ai_pr_drafts",
        label: "AI PR Drafts",
        description: "AI generates pull request drafts from approved change requests.",
        minTier: "community",
      },
      {
        id: "ci_auto_complete",
        label: "CI Auto-Complete",
        description: "Change requests are automatically completed when CI passes on the linked PR.",
        minTier: "growth",
      },
    ],
  },

  // 3. Knowledge Base
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
      },
      {
        id: "auto_knowledge_capture",
        label: "Auto Knowledge Capture",
        description: "AI automatically extracts FAQ entries and runbook patterns from resolved cases.",
        minTier: "growth",
      },
    ],
  },

  // 4. Analytics
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
      },
      {
        id: "analytics_cost",
        label: "Cost & Token Usage",
        description: "Token consumption and estimated LLM cost broken down by action type and model.",
        minTier: "starter",
      },
      {
        id: "analytics_agents",
        label: "AI Performance",
        description: "Per-agent success rates, latency, error patterns, and token efficiency.",
        minTier: "growth",
      },
      {
        id: "analytics_cases",
        label: "Case Analytics",
        description: "Resolution time, escalation funnel, case volume trends, and CSAT proxies.",
        minTier: "growth",
      },
      {
        id: "analytics_memory",
        label: "Knowledge Health",
        description: "Knowledge base coverage, embedding gaps, freshness scores, and conflict flags.",
        minTier: "growth",
      },
      {
        id: "analytics_operations",
        label: "Operations Metrics",
        description: "Approval queue depth, rejection rate, manual triage rate, escalation rate.",
        minTier: "growth",
      },
    ],
  },

  // 5. Channels
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
      },
      {
        id: "channel_slack",
        label: "Slack",
        description: "Receive and respond to support requests inside Slack channels or DMs.",
        minTier: "growth",
      },
      {
        id: "channel_telegram",
        label: "Telegram",
        description: "Receive and respond to support requests via a Telegram bot.",
        minTier: "growth",
        comingSoon: true,
      },
      {
        id: "channel_discord",
        label: "Discord",
        description: "Receive and respond to support requests in Discord servers.",
        minTier: "scale",
      },
      {
        id: "channel_internal_api",
        label: "Internal API Channel",
        description: "Programmatic signal ingestion from internal tooling via authenticated API.",
        minTier: "scale",
      },
    ],
  },

  // 6. Compliance
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
      },
      {
        id: "compliance_basic_templates",
        label: "Basic Compliance Templates",
        description: "AI disclosure templates and basic data processing notices.",
        minTier: "starter",
      },
      {
        id: "compliance_gdpr_templates",
        label: "GDPR / AI Act Templates",
        description: "GDPR Art. 13/14 notices, DPIA templates, AI Act transparency disclosures.",
        minTier: "growth",
      },
      {
        id: "compliance_dsar",
        label: "DSAR Operations",
        description: "Search for and export a data subject's personal data (GDPR Art. 15/17).",
        minTier: "growth",
        comingSoon: true,
      },
    ],
  },

  // 7. Team & Access
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
      },
      {
        id: "role_assignment",
        label: "Role Assignment",
        description: "Assign and revoke roles for team members.",
        minTier: "community",
      },
      {
        id: "custom_roles",
        label: "Custom Roles",
        description: "Create roles with any combination of atomic permissions.",
        minTier: "scale",
      },
      {
        id: "permission_overrides",
        label: "Per-User Permission Overrides",
        description: "Grant or revoke individual permissions for a specific user within a role.",
        minTier: "scale",
      },
      {
        id: "sso_saml",
        label: "SSO / SAML",
        description: "Single sign-on via SAML 2.0 — connect your identity provider.",
        minTier: "scale",
      },
      {
        id: "sso_group_mapping",
        label: "SSO Group → Role Mapping",
        description: "Automatically assign roles based on IdP group membership.",
        minTier: "scale",
      },
    ],
  },

  // 8. Platform
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
      },
      {
        id: "audit_log",
        label: "Audit Log",
        description: "Immutable record of all operator and system actions.",
        minTier: "community",
      },
    ],
  },

] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** All non-comingSoon features available at or below the given tier. */
export function getFeaturesForTier(tier: ProductTier): FeatureEntry[] {
  const rank = TIER_ORDER[tier];
  return FEATURE_CATALOG.flatMap((g) =>
    g.features.filter((f) => TIER_ORDER[f.minTier] <= rank && !f.comingSoon),
  );
}

/** Features that are newly unlocked AT this specific tier (not inherited). */
export function getNewFeaturesAtTier(tier: ProductTier): FeatureEntry[] {
  const rank = TIER_ORDER[tier];
  return FEATURE_CATALOG.flatMap((g) =>
    g.features.filter((f) => TIER_ORDER[f.minTier] === rank && !f.comingSoon),
  );
}

/** First N features from the next tier up — used for "locked" teaser rows. */
export function getLockedTeaserFeatures(tier: ProductTier, max = 4): FeatureEntry[] {
  const NEXT: Partial<Record<ProductTier, ProductTier>> = {
    community: "starter",
    starter:   "growth",
    growth:    "scale",
  };
  const next = NEXT[tier];
  if (!next) return [];
  return getNewFeaturesAtTier(next).slice(0, max);
}

/** The tier behavior note for a feature at a specific tier, if one exists. */
export function getTierNote(feature: FeatureEntry, tier: ProductTier): string | undefined {
  return feature.tierBehavior?.find((b) => b.tier === tier)?.note;
}
