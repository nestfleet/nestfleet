/**
 * Lineage API — provides a unified timeline for a case showing every
 * significant event from first signal to current state.
 *
 * Route:
 *   GET /api/v1/products/:productId/cases/:caseId/lineage
 *
 * Protected by requireAuth().
 */

import { Hono } from "hono"
import { logger } from "../../shared/logger.js"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import { findCaseById } from "../../infra/db/repositories/cases.js"
import { findChangeRequestsByCase } from "../../infra/db/repositories/change-requests.js"
import { findAuditEventsByCaseLineage } from "../../infra/db/repositories/audit-events.js"
import { findAgentRunsByCaseId } from "../../infra/db/repositories/agent-runs.js"
import { findSignalById, findSignalByCaseId } from "../../infra/db/repositories/signals.js"
import { findIdentitiesByEmailCrossProduct } from "../../infra/db/repositories/identities.js"
import { getDb } from "../../infra/db/client.js"
import { findNotificationsByCaseLineage } from "../../infra/db/repositories/notifications.js"
import type { AuditEventRow } from "../../infra/db/repositories/audit-events.js"
import type { AgentRunRow } from "../../infra/db/repositories/agent-runs.js"
import type { ChangeRequestRow } from "../../infra/db/repositories/change-requests.js"
import type { NotificationRow } from "../../infra/db/repositories/notifications.js"
import type { SignalRow } from "../../infra/db/repositories/signals.js"

// ── Types ─────────────────────────────────────────────────────────────────────

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
  | "chat_thread"
  | "notification_sent"
  | "system_event"

export type AvailableAction =
  | "approve"
  | "reject"
  | "escalate"
  | "resolve"
  | "send_to_change"
  | "view_cr"
  | "view_pr"
  | "reopen"
  | "send_followup"

export interface AgentRunDetail {
  runId: string
  modelId: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  outputSnapshot: Record<string, unknown>
  outcome: string
}

export interface LineageNode {
  nodeId: string
  type: LineageNodeType
  occurredAt: string
  actorType: "agent" | "human" | "system"
  actorRef: string
  action: string
  title: string
  summary: string
  metadata: Record<string, unknown>
  agentRun: AgentRunDetail | null
  availableActions: AvailableAction[]
}

interface SignalDetail {
  signalId: string
  fromEmail: string
  subject: string
  body: string
  receivedAt: string
}

interface ChangeRequestSummary {
  changeRequestId: string
  title: string | null
  status: string
  riskLevel: string
  githubIssueUrl: string | null
  githubIssueNumber: number | null
  githubPrUrl: string | null
  githubPrNumber: number | null
  // SLICE-13: CI / deploy tracking
  ciStatus: string | null
  deployStatus: string | null
  mergedAt: string | null
}

export interface LineageEdge {
  id: string
  source: string
  target: string
  label?: string
  edgeType: "default" | "success" | "failure" | "branch"
}

interface CrossProductCaseLink {
  productId: string
  caseId: string
  title: string | null
  status: string
  createdAt: string
}

interface LineageResponse {
  caseId: string
  productId: string
  currentStatus: string
  nodes: LineageNode[]
  edges: LineageEdge[]
  signal: SignalDetail | null
  changeRequests: ChangeRequestSummary[]
  crossProductLinks: CrossProductCaseLink[]
}

// ── Helpers: action → type ────────────────────────────────────────────────────

export function actionToNodeType(action: string, entityType?: string): LineageNodeType {
  switch (action) {
    case "signal.received":         return "signal_received"
    case "case.created":            return "case_created"
    case "case.triaged":            return "triage"
    case "case.routed":             return "routing"
    case "case.auto_replied":       return "auto_reply"
    case "case.reply_drafted":      return "auto_reply"
    case "case.resolved":           return "resolved"
    case "case.reopened":           return "escalated"
    case "case.followup_sent":      return "auto_reply"
    case "case.draft_reply_sent":   return "auto_reply"
    case "case.escalated":          return "escalated"
    case "cr.analysis_started":     return "change_prep"
    case "cr.approval_requested":   return "approval_requested"
    case "cr.approved":             return "approved"
    case "cr.rejected":             return "rejected"
    case "cr.pr_drafted":           return "pr_drafted"
    // SLICE-13: CI / deploy events
    case "cr.pr_merged":            return "pr_merged"
    case "cr.ci_passed":            return "ci_passed"
    case "cr.ci_failed":            return "ci_failed"
    case "cr.deployed":             return "deployed"
    case "cr.deploy_failed":        return "deploy_failed"
    case "change_request.created":  return "change_request_created"
    case "created":
      if (entityType === "change_request") return "change_request_created"
      return "system_event"
    default:
      return "system_event"
  }
}

// ── Helpers: type → title ─────────────────────────────────────────────────────

export function nodeTypeToTitle(type: LineageNodeType, action: string): string {
  switch (type) {
    case "signal_received":        return "Signal received"
    case "case_created":           return "Case opened"
    case "chat_thread":            return "Live chat"
    case "triage":                 return "Triage"
    case "known_issue_match":      return "Known issue match"
    case "routing":                return "Routing decision"
    case "change_request_created": return "Change request created"
    case "change_prep":            return "Change analysis"
    case "approval_requested":     return "Approval requested"
    case "approved":               return "Approved"
    case "rejected":               return "Rejected"
    case "pr_drafted":             return "PR draft prepared"
    // SLICE-13: CI / deploy nodes
    case "pr_merged":              return "PR merged"
    case "ci_passed":              return "CI passed"
    case "ci_failed":              return "CI failed"
    case "deployed":               return "Deployed"
    case "deploy_failed":          return "Deployment failed"
    case "auto_reply":
      if (action === "case.followup_sent") return "Follow-up sent"
      return "Auto-reply sent"
    case "escalated":
      if (action === "case.reopened") return "Case reopened"
      return "Escalated to lead"
    case "resolved":               return "Resolved"
    case "notification_sent":      return "Notification sent"
    case "system_event":           return action
  }
}

// ── Helpers: metadata → summary ───────────────────────────────────────────────

function deriveSummary(type: LineageNodeType, metadata: Record<string, unknown>): string {
  switch (type) {
    case "triage": {
      const severity   = metadata["severity"]   as string | undefined
      const caseType   = metadata["type"]        as string | undefined
      const confidence = metadata["confidence"]  as number | undefined
      const parts: string[] = []
      if (severity   !== undefined) parts.push(`Severity: ${severity}`)
      if (caseType   !== undefined) parts.push(`Type: ${caseType}`)
      if (confidence !== undefined) parts.push(`Confidence: ${Math.round(confidence * 100)}%`)
      return parts.join(" | ")
    }
    case "routing": {
      const reason = metadata["reason"] as string | undefined
      return reason !== undefined ? `→ ${reason.replace(/_/g, " ")}` : ""
    }
    case "approval_requested": {
      const riskLevel  = metadata["riskLevel"]  as string | undefined
      const confidence = metadata["confidence"] as number | undefined
      const parts: string[] = []
      if (riskLevel  !== undefined) parts.push(`Risk: ${riskLevel}`)
      if (confidence !== undefined) parts.push(`Confidence: ${Math.round(confidence * 100)}%`)
      return parts.join(" | ")
    }
    case "approved":
    case "rejected": {
      const note   = metadata["note"]   as string | undefined
      const reason = metadata["reason"] as string | undefined
      return note ?? reason ?? ""
    }
    case "change_prep": {
      const riskLevel = metadata["riskLevel"] as string | undefined
      return riskLevel !== undefined ? `Risk: ${riskLevel}` : ""
    }
    default:
      return ""
  }
}

// ── Helpers: actor_type coercion ──────────────────────────────────────────────

function coerceActorType(raw: string): "agent" | "human" | "system" {
  if (raw === "agent")              return "agent"
  if (raw === "lead" || raw === "user") return "human"
  return "system"
}

// ── Helpers: availableActions ─────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["closed", "rejected"])
const CR_NODE_TYPES     = new Set<LineageNodeType>(["change_request_created", "change_prep", "approval_requested"])

export function buildAvailableActions(
  type: LineageNodeType,
  caseStatus: string,
  linkedCrId: string | null,
): AvailableAction[] {
  const actions: AvailableAction[] = []

  // Approval actions — only on approval_requested nodes when case is approval-pending
  if (type === "approval_requested" && caseStatus === "approval-pending") {
    actions.push("approve", "reject")
  }

  // Resolve — operator can manually resolve when case is in-resolution
  if (caseStatus === "in-resolution") {
    actions.push("resolve")
  }

  // Escalate — any non-terminal node, unless already awaiting-lead
  if (!TERMINAL_STATUSES.has(caseStatus) && caseStatus !== "awaiting-lead") {
    actions.push("escalate")
  }

  // Send to Change — only when awaiting-lead (lead decides a CR is needed)
  if (caseStatus === "awaiting-lead") {
    actions.push("send_to_change")
  }

  // Reopen + Follow-up — only on resolved cases
  if (caseStatus === "resolved") {
    actions.push("reopen")
    actions.push("send_followup")
  }

  // CR link
  if (CR_NODE_TYPES.has(type) && linkedCrId !== null) {
    actions.push("view_cr")
  }

  // PR link
  if (type === "pr_drafted") {
    actions.push("view_pr")
  }

  return actions
}

// ── Helpers: build AgentRunDetail from a row ──────────────────────────────────

function toAgentRunDetail(run: AgentRunRow): AgentRunDetail {
  return {
    runId:          run.id,
    modelId:        run.model_id,
    inputTokens:    run.input_tokens  ?? 0,
    outputTokens:   run.output_tokens ?? 0,
    durationMs:     run.duration_ms   ?? 0,
    outputSnapshot: run.output_snapshot ?? {},
    outcome:        run.outcome,
  }
}

// ── Helpers: agent_run action_type → audit event action ───────────────────────

function agentActionTypeToAuditAction(actionType: string): string | null {
  switch (actionType) {
    case "triage":          return "case.triaged"
    case "change_prep":     return "cr.analysis_started"
    case "auto_reply":      return "case.auto_replied"
    case "pr_draft_prep":   return "cr.pr_drafted"
    default:                return null
  }
}

// ── Core assembler ────────────────────────────────────────────────────────────

function assembleLineage(
  auditEvents: AuditEventRow[],
  agentRuns: AgentRunRow[],
  changeRequests: ChangeRequestRow[],
  notifications: NotificationRow[],
  caseStatus: string,
): LineageNode[] {
  // Build a map: audit action → first matching agent run (for attachment)
  const agentRunByAuditAction = new Map<string, AgentRunRow>()
  const knownIssueRuns: AgentRunRow[] = []

  for (const run of agentRuns) {
    if (run.action_type === "known_issue_match") {
      knownIssueRuns.push(run)
      continue
    }
    const auditAction = agentActionTypeToAuditAction(run.action_type)
    if (auditAction !== null && !agentRunByAuditAction.has(auditAction)) {
      agentRunByAuditAction.set(auditAction, run)
    }
  }

  // Build a map: entity_ref (CR id) → change request row for linking
  const crById = new Map<string, ChangeRequestRow>()
  for (const cr of changeRequests) {
    crById.set(cr.change_request_id, cr)
  }

  // Determine which entity_refs are CR ids (so we can link view_cr)
  const crIds = new Set(changeRequests.map((cr) => cr.change_request_id))

  // Build nodes from audit events
  const nodes: LineageNode[] = []

  for (const evt of auditEvents) {
    const type      = actionToNodeType(evt.action, evt.entity_type)
    const title     = nodeTypeToTitle(type, evt.action)
    const summary   = deriveSummary(type, evt.metadata)
    const actorType = coerceActorType(evt.actor_type)

    // Find linked CR id: if entity_ref is a CR id, use it; otherwise null
    const linkedCrId = crIds.has(evt.entity_ref) ? evt.entity_ref : null

    const attachedRun = agentRunByAuditAction.get(evt.action) ?? null

    const node: LineageNode = {
      nodeId:           evt.audit_event_id,
      type,
      occurredAt:       evt.occurred_at.toISOString(),
      actorType,
      actorRef:         evt.actor_ref,
      action:           evt.action,
      title,
      summary,
      metadata:         evt.metadata,
      agentRun:         attachedRun !== null ? toAgentRunDetail(attachedRun) : null,
      availableActions: buildAvailableActions(type, caseStatus, linkedCrId),
    }

    nodes.push(node)
  }

  // Insert known_issue_match agent runs as synthetic nodes between routing and
  // change_request_created. We place them at their created_at timestamp.
  for (const run of knownIssueRuns) {
    const node: LineageNode = {
      nodeId:           run.id,
      type:             "known_issue_match",
      occurredAt:       run.created_at.toISOString(),
      actorType:        "agent",
      actorRef:         run.action_type,
      action:           "agent.known_issue_match",
      title:            nodeTypeToTitle("known_issue_match", "agent.known_issue_match"),
      summary:          deriveSummary("known_issue_match", run.output_snapshot ?? {}),
      metadata:         run.output_snapshot ?? {},
      agentRun:         toAgentRunDetail(run),
      availableActions: buildAvailableActions("known_issue_match", caseStatus, null),
    }
    nodes.push(node)
  }

  // Insert notification nodes — one node per notification row (all statuses except suppressed)
  for (const notif of notifications) {
    if (notif.status === "suppressed") continue

    const occurredAt = notif.sent_at ?? notif.scheduled_for
    const kindLabel     = notif.kind.replace(/_/g, " ")
    const audienceLabel = notif.audience_type.replace(/_/g, " ")
    const statusLabel   = notif.status

    const summary = `${kindLabel} → ${audienceLabel} via ${notif.channel} (${statusLabel})`

    const node: LineageNode = {
      nodeId:    notif.notification_id,
      type:      "notification_sent",
      occurredAt: occurredAt.toISOString(),
      actorType: "system",
      actorRef:  "notification-system",
      action:    `notification.${notif.kind}`,
      title:     nodeTypeToTitle("notification_sent", `notification.${notif.kind}`),
      summary,
      metadata: {
        kind:         notif.kind,
        channel:      notif.channel,
        audienceType: notif.audience_type,
        recipientRef: notif.recipient_ref,
        status:       notif.status,
        subject:      notif.subject,
        priority:     notif.priority,
      },
      agentRun:         null,
      availableActions: [],
    }
    nodes.push(node)
  }

  // Sort all nodes by occurredAt ascending
  nodes.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  // Collapse all case.chat_reply nodes into a single "chat_thread" node.
  // A live chat can generate many reply events — showing each as a separate
  // node makes the lineage noisy and unreadable.
  const collapsed: LineageNode[] = []
  let chatNode: LineageNode | null = null

  for (const node of nodes) {
    if (node.action === "case.chat_reply") {
      if (!chatNode) {
        chatNode = {
          ...node,
          type:    "chat_thread",
          title:   "Live chat",
          summary: "1 message",
          metadata: { ...node.metadata, messageCount: 1 },
        }
        collapsed.push(chatNode)
      } else {
        // Update the existing chat node: bump count and advance timestamp
        const count = ((chatNode.metadata.messageCount as number) ?? 1) + 1
        chatNode.summary  = `${count} messages`
        chatNode.occurredAt = node.occurredAt
        chatNode.metadata = { ...chatNode.metadata, messageCount: count }
      }
    } else {
      chatNode = null   // reset on any non-chat node (preserves ordering)
      collapsed.push(node)
    }
  }

  // ── Timing correction: known_issue_match nodes ────────────────────────────
  // agent_runs.created_at is written in the worker's finally block — AFTER
  // execute() completes. Since execute() writes the case.routed audit event,
  // the KIM run timestamp is always slightly NEWER than the routing node's
  // timestamp. This inverts the expected chronological order and prevents the
  // semantic edge builder from connecting known_issue_match → routing.
  // Fix: place KIM nodes 1ms before the routing node so ordering is correct.
  const routingNode = collapsed.find((n) => n.type === "routing")
  if (routingNode) {
    const routingMs = new Date(routingNode.occurredAt).getTime()
    let corrected = false
    for (const n of collapsed) {
      if (n.type === "known_issue_match" && new Date(n.occurredAt).getTime() >= routingMs) {
        n.occurredAt = new Date(routingMs - 1).toISOString()
        corrected = true
      }
    }
    if (corrected) {
      collapsed.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    }
  }

  return collapsed
}

// ── Edge builder (SLICE-18) ───────────────────────────────────────────────────

/** Semantic successor table — maps a node type to its expected next types (in priority order). */
const SEMANTIC_SUCCESSORS: Partial<Record<LineageNodeType, LineageNodeType[]>> = {
  signal_received:        ["case_created"],
  case_created:           ["triage"],
  triage:                 ["known_issue_match", "routing"],
  known_issue_match:      ["routing"],
  routing:                ["change_request_created", "auto_reply", "escalated", "resolved"],
  auto_reply:             ["resolved"],
  change_request_created: ["change_prep"],
  change_prep:            ["approval_requested"],
  approval_requested:     ["approved", "rejected"],
  approved:               ["pr_drafted"],
  pr_drafted:             ["pr_merged", "resolved"],
  pr_merged:              ["ci_passed", "ci_failed"],
  ci_passed:              ["deployed", "deploy_failed", "resolved"],
  deployed:               ["resolved"],
}

/** Edge type based on target node type. */
function edgeTypeForTarget(target: LineageNodeType): LineageEdge["edgeType"] {
  if (["approved", "ci_passed", "deployed", "resolved"].includes(target)) return "success"
  if (["rejected", "ci_failed", "deploy_failed"].includes(target)) return "failure"
  if (["change_request_created", "auto_reply", "escalated"].includes(target)) return "branch"
  return "default"
}

/**
 * Build edges between lineage nodes using semantic successor rules.
 * Falls back to sequential connection for unmatched types.
 * Notification nodes are attached as side-edges from the preceding non-notification node.
 */
export function buildEdges(nodes: LineageNode[]): LineageEdge[] {
  const edges: LineageEdge[] = []
  const edgeSet = new Set<string>() // prevent duplicate edges

  // Index: first node of each type (by occurredAt)
  const firstByType = new Map<LineageNodeType, LineageNode>()
  // Index: nodes by type for multi-match (approval branches, CI branches)
  const allByType = new Map<LineageNodeType, LineageNode[]>()

  for (const node of nodes) {
    if (!firstByType.has(node.type)) {
      firstByType.set(node.type, node)
    }
    const list = allByType.get(node.type) ?? []
    list.push(node)
    allByType.set(node.type, list)
  }

  function addEdge(sourceId: string, targetId: string, targetType: LineageNodeType, label?: string) {
    const key = `${sourceId}->${targetId}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push({
      id: `edge-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      ...(label !== undefined ? { label } : {}),
      edgeType: edgeTypeForTarget(targetType),
    })
  }

  // Pass 1: semantic edges
  for (const node of nodes) {
    if (node.type === "notification_sent") continue // handled in pass 2

    const successors = SEMANTIC_SUCCESSORS[node.type]
    if (!successors) continue

    // For branching types (approval_requested → approved/rejected), connect to ALL matching successors
    const isBranching = node.type === "approval_requested" || node.type === "pr_merged" || node.type === "ci_passed"

    if (isBranching) {
      for (const succType of successors) {
        const targets = allByType.get(succType) ?? []
        for (const target of targets) {
          if (target.occurredAt >= node.occurredAt) {
            addEdge(node.nodeId, target.nodeId, target.type)
          }
        }
      }
    } else {
      // Connect to the first matching successor type that occurred after this node
      for (const succType of successors) {
        const targets = allByType.get(succType) ?? []
        const target = targets.find((t) => t.occurredAt >= node.occurredAt)
        if (target) {
          addEdge(node.nodeId, target.nodeId, target.type)
          break // first match only for non-branching
        }
      }
    }
  }

  // Pass 2: notification side-edges — attach to the preceding non-notification node
  let lastNonNotification: LineageNode | null = null
  for (const node of nodes) {
    if (node.type !== "notification_sent") {
      lastNonNotification = node
    } else if (lastNonNotification) {
      addEdge(lastNonNotification.nodeId, node.nodeId, "notification_sent")
    }
  }

  // Pass 3: sequential fallback for orphan nodes (no incoming edge)
  const hasIncoming = new Set(edges.map((e) => e.target))
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i]!
    if (node.type === "notification_sent") continue
    if (!hasIncoming.has(node.nodeId)) {
      // Connect from previous non-notification node
      for (let j = i - 1; j >= 0; j--) {
        if (nodes[j]!.type !== "notification_sent") {
          addEdge(nodes[j]!.nodeId, node.nodeId, node.type)
          break
        }
      }
    }
  }

  return edges
}

// ── Router ────────────────────────────────────────────────────────────────────

export const lineageRouter = new Hono<{ Variables: AuthVariables }>()

lineageRouter.get(
  "/products/:productId/cases/:caseId/lineage",
  requireAuth(),
  async (c) => {
    const productId = c.req.param("productId")
    const caseId    = c.req.param("caseId")

    try {
      // 1. Load and verify case ownership
      const caseRow = await findCaseById(caseId)
      if (!caseRow || caseRow.product_id !== productId) {
        return c.json({ error: "Case not found" }, 404)
      }

      // 2. Load change requests (needed to build the entity_ref set)
      const changeRequests = await findChangeRequestsByCase(caseId)
      const crIds = changeRequests.map((cr) => cr.change_request_id)

      // 3. Load audit events, agent runs, notifications in parallel
      const [auditEvents, agentRuns, notifications] = await Promise.all([
        findAuditEventsByCaseLineage(caseRow.product_id, caseId, crIds),
        findAgentRunsByCaseId(caseId),
        findNotificationsByCaseLineage(caseRow.product_id, caseId, crIds),
      ])

      // 4. Resolve originating signal — try signal.received audit event first,
      //    then fall back to direct signals.case_id lookup (handles seeded/injected cases).
      let signal: {
        signalId: string
        fromEmail: string
        subject: string
        body: string
        receivedAt: string
      } | null = null

      const signalReceivedEvent = auditEvents.find((e) => e.action === "signal.received")
      let signalRow: SignalRow | null = null

      if (signalReceivedEvent !== undefined) {
        signalRow = await findSignalById(signalReceivedEvent.entity_ref)
      }

      // Fallback: look up by case_id directly
      if (signalRow === null) {
        signalRow = await findSignalByCaseId(caseId)
      }

      if (signalRow !== null) {
        const np = signalRow.normalized_payload
        signal = {
          signalId:   signalRow.signal_id,
          fromEmail:  (np["fromEmail"] as string | undefined) ?? (np["from_email"] as string | undefined) ?? (np["from"] as string | undefined) ?? "",
          subject:    (np["subject"]   as string | undefined) ?? "",
          body:       (np["signalText"] as string | undefined) ?? (np["body"] as string | undefined) ?? "",
          receivedAt: signalRow.received_at.toISOString(),
        }
      }

      // 5a. Cross-product identity links (BEF-20)
      //     If the originating signal has a fromEmail, find cases in other products
      //     belonging to the same email address (different product_id).
      const crossProductLinks: CrossProductCaseLink[] = []
      const fromEmail = signal?.fromEmail
      if (fromEmail) {
        const crossIdentities = await findIdentitiesByEmailCrossProduct(fromEmail)
        const db = getDb()
        for (const identity of crossIdentities) {
          if (identity.product_id === productId) continue
          type CaseLinkRow = { case_id: string; title: string | null; status: string; created_at: Date }
          const linkedCases = await db<CaseLinkRow[]>`
            SELECT case_id, title, status, created_at
            FROM cases
            WHERE product_id = ${identity.product_id}
              AND reporter_identity_id = ${identity.identity_id}
            ORDER BY created_at DESC
            LIMIT 5
          `
          for (const c of linkedCases) {
            crossProductLinks.push({
              productId: identity.product_id,
              caseId:    c.case_id,
              title:     c.title,
              status:    c.status,
              createdAt: c.created_at.toISOString(),
            })
          }
        }
      }

      // 5. Assemble lineage timeline
      const nodes = assembleLineage(
        auditEvents,
        agentRuns,
        changeRequests,
        notifications,
        caseRow.status,
      )

      // 6. Build change request summaries
      const changeRequestSummaries: ChangeRequestSummary[] = changeRequests.map((cr) => ({
        changeRequestId:   cr.change_request_id,
        title:             cr.title,
        status:            cr.status,
        riskLevel:         cr.risk_level ?? "low",
        githubIssueUrl:    cr.github_issue_url,
        githubIssueNumber: cr.github_issue_number,
        githubPrUrl:       cr.github_pr_url,
        githubPrNumber:    cr.github_pr_number,
        // SLICE-13: CI / deploy tracking
        ciStatus:          cr.ci_status,
        deployStatus:      cr.deploy_status,
        mergedAt:          cr.merged_at?.toISOString() ?? null,
      }))

      // 7. Build edges for graph view (SLICE-18)
      const edges = buildEdges(nodes)

      const response: LineageResponse = {
        caseId:             caseRow.case_id,
        productId:          caseRow.product_id,
        currentStatus:      caseRow.status,
        nodes,
        edges,
        signal,
        changeRequests:     changeRequestSummaries,
        crossProductLinks,
      }

      return c.json({ data: response })
    } catch (err) {
      logger.error({ err, productId, caseId }, "Failed to build case lineage")
      return c.json({ error: "Internal server error" }, 500)
    }
  },
)
