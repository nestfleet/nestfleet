// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId:     string;
  email:      string;
  roles:      string[];
  productIds: string[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ─── Case ────────────────────────────────────────────────────────────────────

export type CaseStatus =
  | "new"
  | "enriching"
  | "triaged"
  | "in-resolution"
  | "awaiting-lead"
  | "in-change"
  | "resolved"
  | "closed";

export type CaseSeverity = "critical" | "high" | "normal" | "low";

export type CaseType = string;

export interface CaseRow {
  case_id: string;
  title: string;
  status: CaseStatus;
  severity: CaseSeverity | null;
  type: CaseType | null;
  current_persona: string | null;
  created_at: string;
  updated_at: string;
  product_id: string;
  triage_output: Record<string, unknown> | null;
  /** Populated by the list endpoint via CTE on audit_events */
  last_event_action?: string | null;
  last_event_at?: string | null;
  /** SLICE-10: true if resolved entirely by AI agents (no human intervention) */
  ai_resolved?: boolean;
  /** DEFERRED-24: AI draft reply held for Lead review when auto-send gates fail */
  draft_reply?: string | null;
}

// ─── Change Request ───────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "high" | "medium" | "low";

export type ChangeRequestStatus =
  | "draft"
  | "analysis"
  | "approval-pending"
  | "approved"
  | "implementation-prep"
  | "pr-drafted"
  | "completed"
  | "rejected";

export interface ChangeRequest {
  change_request_id: string;
  title: string;
  status: ChangeRequestStatus;
  risk_level: RiskLevel;
  case_id: string;
  impact_summary: string | null;
  proposed_scope: string | null;
  affected_surfaces: string[];
  implementation_notes: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  github_pr_url: string | null;
  github_pr_number: number | null;
  // SLICE-13 / GitHub sync fields
  ci_details: Record<string, unknown> | null;
  merged_at: string | null;
  // 0039: origin track
  cr_track: "customer_reported" | "infra_debt";
  // Decision audit fields
  approved_at: string | null;
  rejected_at: string | null;
  rejection_rationale: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  product_id: string;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ApiItemResponse<T> {
  data: T;
}

// ─── Lineage ─────────────────────────────────────────────────────────────────

export type LineageNodeType =
  | "signal_received"
  | "case_created"
  | "triage"
  | "known_issue_match"
  | "routing"
  | "change_request_created"
  | "change_prep"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "pr_drafted"
  | "pr_merged"
  | "ci_passed"
  | "ci_failed"
  | "deployed"
  | "deploy_failed"
  | "auto_reply"
  | "escalated"
  | "resolved"
  | "notification_sent"
  | "system_event";

export type LineageActionType =
  | "approve"
  | "reject"
  | "escalate"
  | "view_cr"
  | "view_pr";

export interface LineageNode {
  nodeId: string;
  type: LineageNodeType;
  occurredAt: string;
  actorType: "agent" | "human" | "system";
  actorRef: string;
  action: string;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  agentRun: {
    runId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    outputSnapshot: Record<string, unknown>;
    outcome: string;
  } | null;
  availableActions: LineageActionType[];
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  edgeType: "default" | "success" | "failure" | "branch";
}

export interface CrossProductCaseLink {
  productId: string;
  caseId: string;
  title: string | null;
  status: string;
  createdAt: string;
}

export interface LineageResponse {
  caseId: string;
  productId: string;
  currentStatus: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  signal: {
    signalId: string;
    fromEmail: string;
    subject: string;
    body: string;
    receivedAt: string;
  } | null;
  changeRequests: Array<{
    changeRequestId: string;
    title: string | null;
    status: string;
    riskLevel: string;
    githubIssueUrl: string | null;
    githubIssueNumber: number | null;
    githubPrUrl: string | null;
    githubPrNumber: number | null;
    // SLICE-13: CI / deploy tracking
    ciStatus: string | null;
    deployStatus: string | null;
    mergedAt: string | null;
  }>;
  crossProductLinks: CrossProductCaseLink[];
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  notification_id:  string;
  product_id:       string;
  kind:             string;
  priority:         "critical" | "high" | "normal" | "low";
  audience_type:    string;
  recipient_ref:    string;
  source_type:      string;
  source_ref:       string;
  subject:          string | null;
  body:             string | null;
  status:           "pending" | "sent" | "failed" | "suppressed" | "acked";
  scheduled_for:    string;
  sent_at:          string | null;
  error_message:    string | null;
  ack_required:     boolean;
  ack_deadline:     string | null;
  acked_at:         string | null;
  acked_by:         string | null;
  escalation_level: number;
  created_at:       string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface OperatorUser {
  userId: string;
  email: string;
  displayName: string | null;
  roles: string[];
  productIds: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── License ─────────────────────────────────────────────────────────────────

export interface LicenseStatus {
  valid: boolean;
  expired: boolean;
  tier: string | null;
  productLimit: number;
  currentProducts: number;
  features: string[];
  expiresAt: string | null;
  /** W6-06: Outcome Unit consumption for the current calendar month */
  ouUsage: { usage: number; limit: number; percent: number } | null;
  customerId: string | null;
  customerName: string | null;
  statusMessage: string;
  cloudConnected: boolean;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
