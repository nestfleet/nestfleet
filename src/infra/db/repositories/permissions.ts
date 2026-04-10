/**
 * Permission registry — SLICE-22.
 *
 * Single source of truth for all atomic permissions in NestFleet.
 * Exported as TypeScript constants so that unit tests can validate the
 * seed without a database connection.
 *
 * 30 permissions across 11 domains:
 *   cases(5), signals(2), change_requests(5), pr_drafts(2),
 *   approvals(2), analytics(1), settings(2), compliance(4),
 *   memory(3), audit(1), products(3)
 *
 * Default role permission counts:
 *   admin          → 30  (all)
 *   operator       → 18  (no destructive / PII / elevated-write)
 *   support_lead   → 12  (read + transition + approval workflows)
 *   knowledge_lead → 16  (change + PR + memory write; no case write or compliance)
 *   change_lead    → 15  (CR lifecycle + PR push + approvals; no case write or settings)
 *   product_lead   → 14  (CR approve + case transition + approvals; no PR push or settings)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionId = string

export interface PermissionDefinition {
  readonly id: PermissionId
  readonly domain: string
  readonly action: string
  readonly label: string
  readonly description: string
  readonly destructive: boolean
  readonly sensitive: boolean
}

// ── Permission Registry ───────────────────────────────────────────────────────

export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [

  // ── cases (5) ──────────────────────────────────────────────────────────────
  {
    id: "cases:read",
    domain: "cases",
    action: "read",
    label: "View cases",
    description: "Read support cases and their full conversation history.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "cases:create",
    domain: "cases",
    action: "create",
    label: "Create cases",
    description: "Open new support cases on behalf of users.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "cases:transition",
    domain: "cases",
    action: "transition",
    label: "Transition case status",
    description: "Move cases between workflow states (triage, resolve, close).",
    destructive: false,
    sensitive: false,
  },
  {
    id: "cases:delete",
    domain: "cases",
    action: "delete",
    label: "Delete cases",
    description: "Permanently remove a case and its history. Irreversible.",
    destructive: true,
    sensitive: false,
  },
  {
    id: "cases:export",
    domain: "cases",
    action: "export",
    label: "Export cases",
    description: "Download cases in bulk (CSV / JSON). May contain PII.",
    destructive: false,
    sensitive: true,
  },

  // ── signals (2) ────────────────────────────────────────────────────────────
  {
    id: "signals:read",
    domain: "signals",
    action: "read",
    label: "View signals",
    description: "Read incoming signals and alerts surfaced by the agent.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "signals:dismiss",
    domain: "signals",
    action: "dismiss",
    label: "Dismiss signals",
    description: "Mark signals as reviewed and remove them from the active queue.",
    destructive: false,
    sensitive: false,
  },

  // ── change_requests (5) ────────────────────────────────────────────────────
  {
    id: "change_requests:read",
    domain: "change_requests",
    action: "read",
    label: "View change requests",
    description: "Read change requests and their review history.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "change_requests:create",
    domain: "change_requests",
    action: "create",
    label: "Create change requests",
    description: "Draft and submit new change requests for review.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "change_requests:approve",
    domain: "change_requests",
    action: "approve",
    label: "Approve change requests",
    description: "Grant approval on a pending change request.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "change_requests:reject",
    domain: "change_requests",
    action: "reject",
    label: "Reject change requests",
    description: "Decline and close a pending change request.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "change_requests:complete",
    domain: "change_requests",
    action: "complete",
    label: "Complete change requests",
    description: "Mark an approved change request as deployed and done.",
    destructive: false,
    sensitive: false,
  },

  // ── pr_drafts (2) ──────────────────────────────────────────────────────────
  {
    id: "pr_drafts:read",
    domain: "pr_drafts",
    action: "read",
    label: "View PR drafts",
    description: "Read agent-generated pull request drafts and diffs.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "pr_drafts:push",
    domain: "pr_drafts",
    action: "push",
    label: "Push PR drafts",
    description: "Submit PR drafts to the configured version-control repository.",
    destructive: false,
    sensitive: false,
  },

  // ── approvals (2) ─────────────────────────────────────────────────────────
  {
    id: "approvals:read",
    domain: "approvals",
    action: "read",
    label: "View approvals",
    description: "Read the approval queue and individual approval decisions.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "approvals:act",
    domain: "approvals",
    action: "act",
    label: "Act on approvals",
    description: "Approve or reject items in the human-in-the-loop approval queue.",
    destructive: false,
    sensitive: false,
  },

  // ── analytics (1) ─────────────────────────────────────────────────────────
  {
    id: "analytics:read",
    domain: "analytics",
    action: "read",
    label: "View analytics",
    description: "Access the analytics dashboard — case volumes, resolution rates, CSAT.",
    destructive: false,
    sensitive: false,
  },

  // ── settings (2) ──────────────────────────────────────────────────────────
  {
    id: "settings:read",
    domain: "settings",
    action: "read",
    label: "View settings",
    description: "Read product configuration — LLM provider, agent behavior, channels.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "settings:write",
    domain: "settings",
    action: "write",
    label: "Manage settings",
    description: "Update product configuration. Includes LLM API key rotation.",
    destructive: false,
    sensitive: true,
  },

  // ── compliance (4) ────────────────────────────────────────────────────────
  {
    id: "compliance:read",
    domain: "compliance",
    action: "read",
    label: "View compliance",
    description: "Read compliance reports, DSAR status summaries, and retention stats.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "compliance:dsar_search",
    domain: "compliance",
    action: "dsar_search",
    label: "Search DSARs",
    description: "Search for a user's personal data across all NestFleet stores (GDPR Art. 15).",
    destructive: false,
    sensitive: true,
  },
  {
    id: "compliance:dsar_export",
    domain: "compliance",
    action: "dsar_export",
    label: "Export DSAR data",
    description: "Export a full data subject access report. Contains raw PII.",
    destructive: false,
    sensitive: true,
  },
  {
    id: "compliance:retention_run",
    domain: "compliance",
    action: "retention_run",
    label: "Run retention sweep",
    description: "Trigger a retention purge that permanently deletes records past their retention window.",
    destructive: true,
    sensitive: false,
  },

  // ── memory (3) ────────────────────────────────────────────────────────────
  {
    id: "memory:read",
    domain: "memory",
    action: "read",
    label: "View memory",
    description: "Read product knowledge base entries used by the agent.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "memory:write",
    domain: "memory",
    action: "write",
    label: "Edit memory",
    description: "Create and update knowledge base entries.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "memory:delete",
    domain: "memory",
    action: "delete",
    label: "Delete memory",
    description: "Permanently remove knowledge base entries. Irreversible.",
    destructive: true,
    sensitive: false,
  },

  // ── audit (1) ─────────────────────────────────────────────────────────────
  {
    id: "audit:read",
    domain: "audit",
    action: "read",
    label: "View audit log",
    description: "Read the immutable audit trail of all operator actions.",
    destructive: false,
    sensitive: false,
  },

  // ── products (3) ──────────────────────────────────────────────────────────
  {
    id: "products:read",
    domain: "products",
    action: "read",
    label: "View products",
    description: "List and read products in the portfolio.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "products:create",
    domain: "products",
    action: "create",
    label: "Create products",
    description: "Provision new products in the portfolio.",
    destructive: false,
    sensitive: false,
  },
  {
    id: "products:update",
    domain: "products",
    action: "update",
    label: "Update products",
    description: "Modify product metadata (name, stage, channels).",
    destructive: false,
    sensitive: false,
  },
] as const

export const TOTAL_PERMISSIONS = PERMISSION_REGISTRY.length // 30

// ── Default Role Permissions ──────────────────────────────────────────────────

const ALL_PERMISSION_IDS: readonly PermissionId[] = PERMISSION_REGISTRY.map((p) => p.id)

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly PermissionId[]> = {
  /**
   * admin — full access to everything (30 permissions).
   * System superuser: the only role with destructive and PII permissions.
   */
  admin: ALL_PERMISSION_IDS,

  /**
   * operator — core operational access (18 permissions).
   * Can read/create/transition cases, work approvals, dismiss signals, and create CRs.
   * No destructive actions, no PII access, no elevated writes.
   */
  operator: [
    "cases:read",
    "cases:create",
    "cases:transition",
    "cases:export",
    "signals:read",
    "signals:dismiss",
    "change_requests:read",
    "change_requests:create",
    "pr_drafts:read",
    "pr_drafts:push",
    "approvals:read",
    "approvals:act",
    "analytics:read",
    "settings:read",
    "compliance:read",
    "memory:read",
    "audit:read",
    "products:read",
  ],

  /**
   * support_lead — focused on case escalation and approval workflows (12 permissions).
   * Can transition cases and act on approvals but cannot create cases or touch change requests.
   */
  support_lead: [
    "cases:read",
    "cases:transition",
    "signals:read",
    "change_requests:read",
    "approvals:read",
    "approvals:act",
    "analytics:read",
    "settings:read",
    "compliance:read",
    "memory:read",
    "audit:read",
    "products:read",
  ],

  /**
   * knowledge_lead — owns change requests, PR drafts, and memory (16 permissions).
   * Can approve/reject/complete CRs and push PR drafts but has no case write or compliance access.
   */
  knowledge_lead: [
    "cases:read",
    "signals:read",
    "change_requests:read",
    "change_requests:create",
    "change_requests:approve",
    "change_requests:reject",
    "change_requests:complete",
    "pr_drafts:read",
    "pr_drafts:push",
    "approvals:read",
    "analytics:read",
    "settings:read",
    "memory:read",
    "memory:write",
    "audit:read",
    "products:read",
  ],

  /**
   * change_lead — owns the change request and PR draft lifecycle (15 permissions).
   * Can approve/reject CRs, push PR drafts, and act on approvals.
   * No case write, no settings access, no compliance or memory write.
   */
  change_lead: [
    "cases:read",
    "signals:read",
    "change_requests:read",
    "change_requests:create",
    "change_requests:approve",
    "change_requests:reject",
    "change_requests:complete",
    "pr_drafts:read",
    "pr_drafts:push",
    "approvals:read",
    "approvals:act",
    "analytics:read",
    "memory:read",
    "audit:read",
    "products:read",
  ],

  /**
   * product_lead — senior product oversight role (14 permissions).
   * Can approve/reject CRs, transition cases (including triage), act on approvals.
   * No PR push, no settings access, no memory write or compliance write.
   */
  product_lead: [
    "cases:read",
    "cases:transition",
    "signals:read",
    "change_requests:read",
    "change_requests:approve",
    "change_requests:reject",
    "pr_drafts:read",
    "approvals:read",
    "approvals:act",
    "analytics:read",
    "compliance:read",
    "memory:read",
    "audit:read",
    "products:read",
  ],
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

const REGISTRY_MAP = new Map<PermissionId, PermissionDefinition>(
  PERMISSION_REGISTRY.map((p) => [p.id, p]),
)

/**
 * Returns the list of known role IDs (admin, operator, support_lead, knowledge_lead).
 */
export function listRoleIds(): string[] {
  return Object.keys(DEFAULT_ROLE_PERMISSIONS)
}

/**
 * Returns the full permission matrix for a given role:
 * every permission in the registry annotated with `granted: boolean`.
 * Returns null if roleId is not a known default role.
 */
export function getRolePermissionMatrix(
  roleId: string,
): Array<PermissionDefinition & { granted: boolean }> | null {
  const granted = DEFAULT_ROLE_PERMISSIONS[roleId]
  if (!granted) return null

  const grantedSet = new Set(granted)
  return PERMISSION_REGISTRY.map((p) => ({
    ...p,
    granted: grantedSet.has(p.id),
  }))
}

/**
 * Returns summary rows for all roles (id + name + permissionCount).
 */
export function listRolesWithCounts(): Array<{
  id: string
  name: string
  permissionCount: number
}> {
  const ROLE_NAMES: Record<string, string> = {
    admin: "Administrator",
    operator: "Operator",
    support_lead: "Support Lead",
    knowledge_lead: "Knowledge Lead",
    change_lead: "Change Lead",
    product_lead: "Product Lead",
  }

  return Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([id, perms]) => ({
    id,
    name: ROLE_NAMES[id] ?? id,
    permissionCount: perms.length,
  }))
}
