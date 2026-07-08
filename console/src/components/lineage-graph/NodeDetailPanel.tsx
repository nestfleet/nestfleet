// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import type { LineageNode, LineageResponse, Notification, ChangeRequest } from "@/lib/types";
import { NodeIcon, nodeIconClasses } from "./lineage-icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  approveChangeRequestApi,
  rejectChangeRequestApi,
  escalateCaseApi,
  getNotificationsApi,
  getChangeRequestApi,
  getPrDraftApi,
} from "@/lib/api";
import { useProductBasePath } from "@/lib/product-context";

interface NodeDetailPanelProps {
  node: LineageNode | null;
  changeRequests: LineageResponse["changeRequests"];
  productId: string;
  caseId: string;
  onClose: () => void;
  onActionComplete: () => void;
}

// Actions that are surfaced as inline snippets instead of navigation buttons
const SNIPPET_ACTIONS = new Set(["view_cr", "view_pr_draft", "view_notifications"]);

// ── Snippet: Notifications ────────────────────────────────────────────────────

function NotificationsSnippet({
  productId,
  caseId,
}: {
  productId: string;
  caseId: string;
}) {
  const router = useRouter();
  const { data, isLoading } = useSWR(
    ["notifications-snippet", productId, caseId],
    () => getNotificationsApi(productId, { limit: 20 }),
  );

  const items: Notification[] = (data?.data ?? [])
    .filter((n) => n.source_ref === caseId)
    .slice(0, 3);

  const openFullPage = () =>
    router.push(`/notifications?caseId=${caseId}`);

  return (
    <SnippetWrapper
      title="Notifications"
      count={items.length}
      isLoading={isLoading}
      onOpenFullPage={openFullPage}
      openLabel="Open Notifications"
    >
      {items.length === 0 && !isLoading ? (
        <p className="text-[11px] text-zinc-500 italic">No notifications for this case.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((n) => (
            <div key={n.notification_id} className="rounded-sm bg-zinc-800/60 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-zinc-200 truncate">{n.recipient_ref}</span>
                <StatusBadge value={n.status} map={NOTIF_STATUS_COLORS} />
              </div>
              {n.subject && (
                <p className="text-[10px] text-zinc-400 truncate mt-0.5">{n.subject}</p>
              )}
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {n.sent_at
                  ? formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })
                  : formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      )}
    </SnippetWrapper>
  );
}

// ── Snippet: Change Request ───────────────────────────────────────────────────

function ChangeRequestSnippet({
  productId,
  crId,
}: {
  productId: string;
  crId: string;
}) {
  const router = useRouter();
  const basePath = useProductBasePath();
  const { data, isLoading } = useSWR(
    ["cr-snippet", productId, crId],
    () => getChangeRequestApi(productId, crId),
  );

  const openFullPage = () => router.push(`${basePath}/approvals/${crId}`);

  return (
    <SnippetWrapper
      title="Change Request"
      isLoading={isLoading}
      onOpenFullPage={openFullPage}
      openLabel="Open Change Request"
    >
      {data && <CRBody cr={data} />}
    </SnippetWrapper>
  );
}

// ── Snippet: PR Draft ─────────────────────────────────────────────────────────

function PrDraftSnippet({
  productId,
  crId,
}: {
  productId: string;
  crId: string;
}) {
  const router = useRouter();
  const basePath = useProductBasePath();
  const { data, isLoading } = useSWR(
    ["pr-draft-snippet", productId, crId],
    () => getPrDraftApi(productId, crId),
  );

  const openFullPage = () => router.push(`${basePath}/pr-drafts/${crId}`);
  const openGitHub = data?.github_pr_url
    ? () => window.open(data.github_pr_url!, "_blank")
    : undefined;

  return (
    <SnippetWrapper
      title="PR Draft"
      isLoading={isLoading}
      onOpenFullPage={openFullPage}
      openLabel="Open PR Draft"
      secondaryAction={openGitHub ? { label: "View on GitHub ↗", onClick: openGitHub } : undefined}
    >
      {data && <CRBody cr={data} showPr />}
    </SnippetWrapper>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function CRBody({ cr, showPr = false }: { cr: ChangeRequest; showPr?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-zinc-200 leading-snug">{cr.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusBadge value={cr.status} map={CR_STATUS_COLORS} />
        <StatusBadge value={cr.risk_level} map={RISK_COLORS} />
        {showPr && cr.github_pr_number && (
          <span className="text-[10px] text-zinc-400">PR #{cr.github_pr_number}</span>
        )}
      </div>
      {cr.impact_summary && (
        <p className="text-[10px] text-zinc-400 line-clamp-2">{cr.impact_summary}</p>
      )}
    </div>
  );
}

function StatusBadge({
  value,
  map,
}: {
  value: string;
  map: Record<string, string>;
}) {
  const cls = map[value] ?? "bg-zinc-700 text-zinc-400";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      {value}
    </span>
  );
}

function SnippetWrapper({
  title,
  count,
  isLoading,
  onOpenFullPage,
  openLabel,
  secondaryAction,
  children,
}: {
  title: string;
  count?: number;
  isLoading: boolean;
  onOpenFullPage: () => void;
  openLabel: string;
  secondaryAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          {title}{count !== undefined && count > 0 ? ` (${count})` : ""}
        </h5>
        {isLoading && (
          <span className="text-[10px] text-zinc-600 animate-pulse">Loading…</span>
        )}
      </div>
      {!isLoading && children}
      <div className="flex items-center gap-3 pt-0.5">
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
        <button
          onClick={onOpenFullPage}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
        >
          {openLabel} ↗
        </button>
      </div>
    </div>
  );
}

const NOTIF_STATUS_COLORS: Record<string, string> = {
  sent:       "bg-green-500/15 text-green-400",
  pending:    "bg-amber-500/15 text-amber-400",
  failed:     "bg-red-500/15 text-red-400",
  suppressed: "bg-zinc-600/40 text-zinc-400",
  acked:      "bg-blue-500/15 text-blue-400",
};

const CR_STATUS_COLORS: Record<string, string> = {
  "approval-pending":    "bg-amber-500/15 text-amber-400",
  "approved":            "bg-green-500/15 text-green-400",
  "rejected":            "bg-red-500/15 text-red-400",
  "pr-drafted":          "bg-violet-500/15 text-violet-400",
  "completed":           "bg-green-500/15 text-green-400",
  "draft":               "bg-zinc-600/40 text-zinc-400",
  "analysis":            "bg-blue-500/15 text-blue-400",
  "implementation-prep": "bg-indigo-500/15 text-indigo-400",
};

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400",
  high:     "bg-orange-500/15 text-orange-400",
  medium:   "bg-amber-500/15 text-amber-400",
  low:      "bg-green-500/15 text-green-400",
};

// ── Main Panel ────────────────────────────────────────────────────────────────

export function NodeDetailPanel({
  node, changeRequests, productId, caseId, onClose, onActionComplete,
}: NodeDetailPanelProps) {
  const { toast: showToast } = useToast();
  const [activeModal, setActiveModal] = useState<"approve" | "reject" | null>(null);
  const [modalNote, setModalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedRunId, setCopiedRunId] = useState(false);

  const copyRunId = useCallback(() => {
    if (!node?.agentRun?.runId) return;
    navigator.clipboard.writeText(node.agentRun.runId).then(() => {
      setCopiedRunId(true);
      setTimeout(() => setCopiedRunId(false), 2000);
    });
  }, [node]);

  if (!node) return null;

  const iconCls = nodeIconClasses(node.type, node.actorType);
  const crId = (node.metadata?.changeRequestId as string) ?? changeRequests[0]?.changeRequestId;

  // Determine which snippets to show
  const showNotificationsSnippet = node.type === "notification_sent";
  const showCrSnippet = !!crId && node.availableActions.includes("view_cr");
  const showPrDraftSnippet = !!crId && (node.type === "pr_drafted" || node.type === "approved");

  const resolveGithubPrUrl = (): string | null => {
    for (const cr of changeRequests) {
      if (cr.githubPrUrl) return cr.githubPrUrl;
    }
    const metaUrl = node.metadata?.githubPrUrl;
    if (typeof metaUrl === "string" && metaUrl) return metaUrl;
    return null;
  };

  const handleAction = async (action: string) => {
    if (action === "approve" || action === "reject") {
      setActiveModal(action);
      setModalNote("");
      return;
    }
    if (action === "view_pr") {
      const url = resolveGithubPrUrl();
      if (url) window.open(url, "_blank");
      return;
    }
    if (action === "escalate") {
      try {
        await escalateCaseApi(productId, caseId);
        showToast("Case escalated to lead", "success");
        onActionComplete();
      } catch {
        showToast("Failed to escalate", "error");
      }
    }
  };

  const handleModalSubmit = async () => {
    if (!crId) return;
    setSubmitting(true);
    try {
      if (activeModal === "approve") {
        await approveChangeRequestApi(productId, crId, modalNote || undefined);
        showToast("Change request approved", "success");
      } else {
        if (modalNote.length < 10) return;
        await rejectChangeRequestApi(productId, crId, modalNote);
        showToast("Change request rejected", "success");
      }
      setActiveModal(null);
      onActionComplete();
    } catch {
      showToast(`Failed to ${activeModal ?? "submit"}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Backend-controlled action buttons — exclude snippet-handled ones
  const actionButtons = node.availableActions
    .filter((action) => !SNIPPET_ACTIONS.has(action))
    .map((action) => {
      if (action === "view_pr" && !resolveGithubPrUrl()) return null;
      const styles: Record<string, string> = {
        approve:  "bg-green-600 hover:bg-green-700 text-white",
        reject:   "bg-red-600 hover:bg-red-700 text-white",
        escalate: "bg-orange-600 hover:bg-orange-700 text-white",
        view_pr:  "bg-indigo-600 hover:bg-indigo-700 text-white",
      };
      const labels: Record<string, string> = {
        approve: "Approve", reject: "Reject", escalate: "Escalate",
        view_pr: "View PR on GitHub",
      };
      return (
        <button
          key={action}
          onClick={() => handleAction(action)}
          className={`px-3 py-1.5 rounded-sm text-xs font-medium ${styles[action] ?? "bg-zinc-700 text-zinc-300"}`}
        >
          {labels[action] ?? action}
        </button>
      );
    })
    .filter(Boolean);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 384 }}
        animate={{ x: 0 }}
        exit={{ x: 384 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-96 h-full bg-zinc-900 border-l border-zinc-700 overflow-y-auto shrink-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className={`rounded-full p-1.5 ${iconCls}`}>
              <NodeIcon type={node.type} actorType={node.actorType} />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">{node.title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* Meta */}
          <div className="space-y-1 text-xs text-zinc-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span title={new Date(node.occurredAt).toLocaleString()}>
                {formatDistanceToNow(new Date(node.occurredAt), { addSuffix: true })}
              </span>
              <span className="text-zinc-600">·</span>
              <time className="text-zinc-500" dateTime={node.occurredAt}>
                {format(new Date(node.occurredAt), "MMM d, HH:mm:ss")}
              </time>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                {node.actorType}
              </span>
              <span className="text-zinc-500 truncate">{node.actorRef}</span>
            </div>
          </div>

          {/* Summary */}
          {node.summary && (
            <p className="text-sm text-zinc-300">{node.summary}</p>
          )}

          {/* Agent Run */}
          {node.agentRun && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Agent Run</h4>
                <button
                  onClick={copyRunId}
                  title={`Copy run ID: ${node.agentRun.runId}`}
                  className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {copiedRunId ? (
                    <>
                      <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="text-green-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                      <span className="font-mono">{node.agentRun.runId.slice(-8)}</span>
                    </>
                  )}
                </button>
              </div>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs">
                {node.agentRun.modelId}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-sm bg-zinc-800/80 px-2 py-1.5">
                  <p className="text-[10px] text-zinc-500">Input tokens</p>
                  <p className="text-xs font-medium text-zinc-300">{node.agentRun.inputTokens.toLocaleString()}</p>
                </div>
                <div className="rounded-sm bg-zinc-800/80 px-2 py-1.5">
                  <p className="text-[10px] text-zinc-500">Output tokens</p>
                  <p className="text-xs font-medium text-zinc-300">{node.agentRun.outputTokens.toLocaleString()}</p>
                </div>
                <div className="rounded-sm bg-zinc-800/80 px-2 py-1.5">
                  <p className="text-[10px] text-zinc-500">Duration</p>
                  <p className="text-xs font-medium text-zinc-300">{(node.agentRun.durationMs / 1000).toFixed(2)}s</p>
                </div>
                <div className="rounded-sm bg-zinc-800/80 px-2 py-1.5">
                  <p className="text-[10px] text-zinc-500">Outcome</p>
                  {/* A step with success + 0 output tokens + 0 duration means the LLM
                      call was intentionally skipped (e.g. known_issue_match with no DB entries). */}
                  {node.agentRun.outcome === "success" && node.agentRun.outputTokens === 0 && node.agentRun.durationMs === 0 ? (
                    <p
                      className="text-xs font-medium text-blue-400"
                      title="No input data to process — LLM call was skipped"
                    >
                      skipped
                    </p>
                  ) : node.agentRun.outcome === "abstain" ? (
                    <p
                      className="text-xs font-medium text-amber-400"
                      title={typeof node.agentRun.outputSnapshot?.reason === "string"
                        ? node.agentRun.outputSnapshot.reason
                        : "Agent abstained from producing an output"}
                    >
                      abstained
                    </p>
                  ) : (
                    <p className={`text-xs font-medium ${
                      node.agentRun.outcome === "success" ? "text-green-400" :
                      node.agentRun.outcome === "error"   ? "text-red-400" :
                      "text-zinc-300"
                    }`}>{node.agentRun.outcome}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Inline Snippets — prefetched on node selection */}
          {showNotificationsSnippet && (
            <NotificationsSnippet productId={productId} caseId={caseId} />
          )}
          {showCrSnippet && (
            <ChangeRequestSnippet productId={productId} crId={crId} />
          )}
          {showPrDraftSnippet && (
            <PrDraftSnippet productId={productId} crId={crId} />
          )}

          {/* Metadata */}
          {Object.keys(node.metadata).length > 0 && (
            <details className="group">
              <summary className="text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-400">
                Metadata
              </summary>
              <pre className="mt-2 p-2 rounded-sm bg-zinc-800/50 text-xs text-zinc-400 overflow-x-auto max-h-48">
                {JSON.stringify(node.metadata, null, 2)}
              </pre>
            </details>
          )}

          {/* Output Snapshot */}
          {node.agentRun?.outputSnapshot && Object.keys(node.agentRun.outputSnapshot).length > 0 && (
            <details className="group">
              <summary className="text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-400">
                Output Snapshot
              </summary>
              <pre className="mt-2 p-2 rounded-sm bg-zinc-800/50 text-xs text-zinc-400 overflow-x-auto max-h-48">
                {JSON.stringify(node.agentRun.outputSnapshot, null, 2)}
              </pre>
            </details>
          )}

          {/* Action Buttons */}
          {actionButtons.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
              {actionButtons}
            </div>
          )}
        </div>

        {/* Approve/Reject Modals */}
        {activeModal && (
          <Modal
            isOpen={true}
            onClose={() => setActiveModal(null)}
            title={activeModal === "approve" ? "Approve Change Request" : "Reject Change Request"}
          >
            <div className="space-y-3">
              <textarea
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder={activeModal === "approve" ? "Optional note..." : "Reason for rejection (min 10 chars)..."}
                className="w-full h-24 rounded-sm bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 p-2 focus:border-indigo-500 focus:outline-hidden"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setActiveModal(null)} className="px-3 py-1.5 rounded-sm text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600">Cancel</button>
                <button
                  onClick={handleModalSubmit}
                  disabled={submitting || (activeModal === "reject" && modalNote.length < 10)}
                  className={`px-3 py-1.5 rounded-sm text-xs text-white ${activeModal === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} disabled:opacity-50`}
                >
                  {submitting ? "..." : activeModal === "approve" ? "Approve" : "Reject"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
