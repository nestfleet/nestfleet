// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * LineageTimeline — vertical event timeline for NestFleet case lineage.
 *
 * Usage:
 *   <LineageTimeline response={lineageData} productId={PRODUCT_ID} onActionComplete={() => mutate()} />
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  approveChangeRequestApi,
  rejectChangeRequestApi,
  escalateCaseApi,
  resolveCaseApi,
  sendToChangeApi,
  reopenCaseApi,
  sendFollowupApi,
} from "@/lib/api";
import { useProductBasePath } from "@/lib/product-context";
import type { LineageNode, LineageNodeType, LineageResponse } from "@/lib/types";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LineageTimelineProps {
  response: LineageResponse;
  productId: string;
  onActionComplete: () => void;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function NodeIcon({ type, actorType }: { type: LineageNodeType; actorType: LineageNode["actorType"] }) {
  // Human actor always gets a person icon regardless of node type
  if (actorType === "human") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    );
  }

  switch (type) {
    case "signal_received":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
        </svg>
      );
    case "case_created":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      );
    case "triage":
    case "known_issue_match":
    case "change_prep":
    case "auto_reply":
    case "pr_drafted":
      // Agent/CPU icon
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 4.5v.75a.75.75 0 00.75.75h9a.75.75 0 00.75-.75V4.5m-10.5 0h10.5m-10.5 0a.75.75 0 00-.75.75v.75m12-.75a.75.75 0 01.75.75v.75m-12 10.5h10.5m-10.5 0a.75.75 0 01-.75-.75v-.75m12 1.5a.75.75 0 00.75-.75v-.75M6.75 8.25h10.5a.75.75 0 01.75.75v6a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V9a.75.75 0 01.75-.75z" />
        </svg>
      );
    // SLICE-13: PR merged — git merge icon
    case "pr_merged":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3v10.5m0 0a3 3 0 106 0M7.5 13.5a3 3 0 106 0m3-10.5v3.75a3.75 3.75 0 01-3.75 3.75H9.75" />
        </svg>
      );
    // SLICE-13: CI passed — checkmark in circle
    case "ci_passed":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    // SLICE-13: CI failed — X in circle
    case "ci_failed":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    // SLICE-13: deployed — cloud upload icon
    case "deployed":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.099 11.095H6.75z" />
        </svg>
      );
    // SLICE-13: deploy failed — cloud with X
    case "deploy_failed":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 3a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.099 11.095H6.75" />
        </svg>
      );
    case "routing":
    case "change_request_created":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      );
    case "approval_requested":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "approved":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
    case "rejected":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "resolved":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "escalated":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
      );
    case "chat_thread":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      );
    case "notification_sent":
      // Bell icon
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      );
    // FEAT-015: triage correction — pencil/edit icon
    case "triage_corrected":
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
      );
    default:
      // system_event
      return (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
        </svg>
      );
  }
}

// Node icon circle color by type
function nodeIconClasses(type: LineageNodeType, actorType: LineageNode["actorType"]): string {
  if (actorType === "human") return "bg-blue-100 text-blue-600";

  switch (type) {
    case "signal_received":       return "bg-blue-100 text-blue-600";
    case "case_created":          return "bg-gray-100 text-gray-500";
    case "triage":
    case "known_issue_match":
    case "change_prep":
    case "auto_reply":
    case "pr_drafted":            return "bg-indigo-100 text-indigo-600";
    case "routing":
    case "change_request_created": return "bg-purple-100 text-purple-600";
    case "approval_requested":    return "bg-orange-100 text-orange-600";
    case "approved":              return "bg-green-100 text-green-600";
    case "rejected":              return "bg-red-100 text-red-600";
    case "resolved":              return "bg-emerald-100 text-emerald-600";
    case "escalated":             return "bg-red-100 text-red-600";
    case "chat_thread":           return "bg-green-100 text-green-600";
    case "notification_sent":     return "bg-sky-100 text-sky-600";
    // FEAT-015: triage correction — amber to match warning color semantics
    case "triage_corrected":      return "bg-amber-100 text-amber-600";
    // SLICE-13: CI / deploy nodes
    case "pr_merged":             return "bg-violet-100 text-violet-600";
    case "ci_passed":             return "bg-emerald-100 text-emerald-600";
    case "ci_failed":             return "bg-red-100 text-red-600";
    case "deployed":              return "bg-teal-100 text-teal-600";
    case "deploy_failed":         return "bg-red-100 text-red-600";
    default:                      return "bg-gray-100 text-gray-500";
  }
}

// Row background tint
function nodeRowBg(actorType: LineageNode["actorType"], type: LineageNodeType): string {
  if (type === "approved")         return "border-l-2 border-green-400";
  if (type === "rejected")         return "border-l-2 border-red-400";
  // FEAT-015: amber left-border for triage corrections
  if (type === "triage_corrected") return "border-l-2 border-amber-400";
  // SLICE-13: CI / deploy visual treatment
  if (type === "ci_passed")      return "border-l-2 border-emerald-400";
  if (type === "ci_failed")      return "border-l-2 border-red-400";
  if (type === "deployed")       return "border-l-2 border-teal-400";
  if (type === "deploy_failed")  return "border-l-2 border-red-500";
  if (type === "pr_merged")      return "border-l-2 border-violet-300";
  if (actorType === "agent") return "bg-indigo-50/40";
  if (actorType === "human") return "bg-blue-50/40";
  return "";
}

// ─── Modal state ──────────────────────────────────────────────────────────────

type ModalMode = "approve" | "reject" | "resolve";

interface ActiveModal {
  mode: ModalMode;
  crId: string;
  crTitle: string;
}

// ─── Single node row ──────────────────────────────────────────────────────────

interface NodeRowProps {
  node: LineageNode;
  isLast: boolean;
  productId: string;
  changeRequests: LineageResponse["changeRequests"];
  onOpenModal: (modal: ActiveModal) => void;
  onEscalate: (nodeId: string) => void;
  onResolve: (nodeId: string) => void;
  onSendToChange: (nodeId: string) => void;
  onReopen: (nodeId: string) => void;
  onSendFollowup: (nodeId: string) => void;
}

function NodeRow({ node, isLast, changeRequests, onOpenModal, onEscalate, onResolve, onSendToChange, onReopen, onSendFollowup }: NodeRowProps) {
  const router = useRouter();
  const basePath = useProductBasePath();
  const [isExpanded, setIsExpanded] = useState(false);

  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(node.occurredAt), { addSuffix: true });
    } catch {
      return node.occurredAt;
    }
  })();

  const hasDetails =
    Object.keys(node.metadata).length > 0 ||
    (node.agentRun?.outputSnapshot && Object.keys(node.agentRun.outputSnapshot).length > 0);

  // Resolve change request ID for approve/reject/view_cr actions
  const resolveChangeRequestId = (): string | null => {
    // Try metadata.changeRequestId first
    if (typeof node.metadata.changeRequestId === "string") {
      return node.metadata.changeRequestId;
    }
    // Fall back to first CR in the lineage changeRequests array
    return changeRequests[0]?.changeRequestId ?? null;
  };

  // Resolve GitHub PR URL — prefer the canonical source (CR record's github_pr_url,
  // populated by the worker and stored on the change_requests row) over the audit
  // event metadata copy, which may be absent if the PR creation was skipped.
  const resolveGithubPrUrl = (): string | null => {
    // Primary: find the CR that has a github_pr_url
    for (const cr of changeRequests) {
      if (cr.githubPrUrl) return cr.githubPrUrl;
    }
    // Fallback: audit event metadata (camelCase key written by pr-draft-prep-worker)
    const metaUrl = node.metadata.githubPrUrl;
    if (typeof metaUrl === "string" && metaUrl) return metaUrl;
    return null;
  };

  const handleActionClick = (action: string) => {
    if (action === "approve" || action === "reject") {
      const crId = resolveChangeRequestId();
      if (!crId) return;
      const cr = changeRequests.find((c) => c.changeRequestId === crId);
      onOpenModal({
        mode: action as ModalMode,
        crId,
        crTitle: cr?.title ?? "Change Request",
      });
    } else if (action === "send_to_change") {
      onSendToChange(node.nodeId);
    } else if (action === "resolve") {
      onResolve(node.nodeId);
    } else if (action === "escalate") {
      onEscalate(node.nodeId);
    } else if (action === "reopen") {
      onReopen(node.nodeId);
    } else if (action === "send_followup") {
      onSendFollowup(node.nodeId);
    } else if (action === "view_cr") {
      const crId = resolveChangeRequestId();
      if (crId) router.push(`${basePath}/approvals/${crId}`);
    } else if (action === "view_pr") {
      const url = resolveGithubPrUrl();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="relative flex gap-3">
      {/* Left column: icon + connecting line */}
      <div className="relative flex w-9 shrink-0 flex-col items-center">
        <div
          className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white ${nodeIconClasses(node.type, node.actorType)}`}
          aria-hidden="true"
        >
          <NodeIcon type={node.type} actorType={node.actorType} />
        </div>
        {!isLast && (
          <div className="absolute top-7 bottom-0 left-1/2 w-px -translate-x-1/2 border-l border-gray-200" aria-hidden="true" />
        )}
      </div>

      {/* Right column: content */}
      <div
        className={`mb-2 min-w-0 flex-1 rounded-lg bg-white shadow-sm ring-1 ring-black/5 overflow-hidden ${nodeRowBg(node.actorType, node.type)}`}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-0.5">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{node.title}</p>
          <time
            dateTime={node.occurredAt}
            className="shrink-0 text-xs text-gray-400 whitespace-nowrap"
          >
            {relativeTime}
          </time>
        </div>

        {/* Summary */}
        <p className="px-3 pb-1.5 text-xs text-gray-600 leading-relaxed">{node.summary}</p>

        {/* FEAT-015: triage_corrected — rich diff display */}
        {(node.type === "triage_corrected" || node.action === "case.triage_corrected" || node.action === "triage_corrected") && (() => {
          const meta = node.metadata;
          const oldType     = typeof meta.oldType     === "string" ? meta.oldType     : null;
          const newType     = typeof meta.newType     === "string" ? meta.newType     : null;
          const oldSeverity = typeof meta.oldSeverity === "string" ? meta.oldSeverity : null;
          const newSeverity = typeof meta.newSeverity === "string" ? meta.newSeverity : null;
          const reason      = typeof meta.reason      === "string" ? meta.reason      : null;
          const crCancelled = meta.crCancelled === true;

          const typeLabel = (v: string) =>
            v === "bug_report"    ? "Bug"      :
            v === "user_request"  ? "Request"  :
            v === "outage_report" ? "Outage"   :
            v === "user_feedback" ? "Feedback" :
            v === "sales_inquiry" ? "Sales"    :
            v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

          const sevLabel = (v: string) =>
            v.charAt(0).toUpperCase() + v.slice(1);

          return (
            <div className="mx-3 mb-2 rounded-md bg-amber-50 px-3 py-2 space-y-1.5 ring-1 ring-amber-100">
              {oldType && newType && (
                <div className="flex items-center gap-1.5 text-xs text-amber-800">
                  <span className="font-medium text-amber-600">Type:</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5">{typeLabel(oldType)}</span>
                  <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium">{typeLabel(newType)}</span>
                </div>
              )}
              {oldSeverity && newSeverity && (
                <div className="flex items-center gap-1.5 text-xs text-amber-800">
                  <span className="font-medium text-amber-600">Severity:</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5">{sevLabel(oldSeverity)}</span>
                  <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium">{sevLabel(newSeverity)}</span>
                </div>
              )}
              {reason && (
                <p className="text-xs text-amber-800">
                  <span className="font-medium text-amber-600">Reason:</span>{" "}
                  <span className="italic">&ldquo;{reason}&rdquo;</span>
                </p>
              )}
              {crCancelled && (
                <p className="text-xs font-medium text-amber-700">
                  CR cancelled — pipeline restarted
                </p>
              )}
            </div>
          );
        })()}

        {/* Human actor ref */}
        {node.actorType === "human" && node.actorRef && (
          <p className="px-3 pb-1.5 text-xs text-gray-500">
            <span aria-hidden="true">&#x1F464;</span> {node.actorRef}
          </p>
        )}

        {/* Expandable details (agent pills + metadata live here) */}
        {hasDetails && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              aria-expanded={isExpanded}
              aria-controls={`details-${node.nodeId}`}
            >
              <svg
                className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
              {isExpanded ? "Hide details" : "Details"}
              {node.actorType === "agent" && node.agentRun && !isExpanded && (
                <span className="ml-1 text-gray-300">
                  {/* Detect intentionally-skipped steps: success with zero tokens/duration */}
                  {node.agentRun.outcome === "success" && node.agentRun.outputTokens === 0 && node.agentRun.durationMs === 0
                    ? <span className="text-blue-400">· skipped</span>
                    : <>· {node.agentRun.modelId} · {node.agentRun.inputTokens + node.agentRun.outputTokens} tok · {node.agentRun.durationMs}ms</>
                  }
                </span>
              )}
            </button>

            {isExpanded && (
              <div id={`details-${node.nodeId}`} className="px-3 pb-2 space-y-2">
                {node.actorType === "agent" && node.agentRun && (() => {
                  // A step that succeeded with 0 output tokens + 0 duration was intentionally
                  // skipped by the agent (e.g. known_issue_match with no DB entries to match).
                  const isSkipped =
                    node.agentRun.outcome === "success" &&
                    node.agentRun.outputTokens === 0 &&
                    node.agentRun.durationMs === 0;
                  const isAbstained = node.agentRun.outcome === "abstain";
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        <span aria-hidden="true">&#x1F916;</span> {node.agentRun.modelId}
                      </span>
                      {isSkipped ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-500"
                          title="No input data to process — LLM call was skipped"
                        >
                          skipped
                        </span>
                      ) : isAbstained ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                          abstained
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            <span aria-hidden="true">&#x2191;</span> {node.agentRun.inputTokens.toLocaleString()} in
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            <span aria-hidden="true">&#x2193;</span> {node.agentRun.outputTokens.toLocaleString()} out
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            <span aria-hidden="true">&#x23F1;</span> {node.agentRun.durationMs.toLocaleString()}ms
                          </span>
                        </>
                      )}
                    </div>
                  );
                })()}
                {Object.keys(node.metadata).length > 0 && (
                  <>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Metadata</p>
                    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-2 text-xs text-green-400 leading-relaxed scrollbar-thin">
                      {JSON.stringify(node.metadata, null, 2)}
                    </pre>
                  </>
                )}
                {node.agentRun?.outputSnapshot && Object.keys(node.agentRun.outputSnapshot).length > 0 && (
                  <>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Output Snapshot</p>
                    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-2 text-xs text-green-400 leading-relaxed scrollbar-thin">
                      {JSON.stringify(node.agentRun.outputSnapshot, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {node.availableActions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2">
            {node.availableActions.map((action) => {
              if (action === "approve") {
                return (
                  <button
                    key="approve"
                    onClick={() => handleActionClick("approve")}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
                  >
                    Approve
                  </button>
                );
              }
              if (action === "reject") {
                return (
                  <button
                    key="reject"
                    onClick={() => handleActionClick("reject")}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                  >
                    Reject
                  </button>
                );
              }
              if (action === "send_to_change") {
                return (
                  <button
                    key="send_to_change"
                    onClick={() => handleActionClick("send_to_change")}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 transition-colors"
                  >
                    Send to Change
                  </button>
                );
              }
              if (action === "resolve") {
                return (
                  <button
                    key="resolve"
                    onClick={() => handleActionClick("resolve")}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
                  >
                    Mark Resolved
                  </button>
                );
              }
              if (action === "escalate") {
                return (
                  <button
                    key="escalate"
                    onClick={() => handleActionClick("escalate")}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 transition-colors"
                  >
                    Escalate to Lead
                  </button>
                );
              }
              if (action === "reopen") {
                return (
                  <button
                    key="reopen"
                    onClick={() => handleActionClick("reopen")}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 transition-colors"
                  >
                    Reopen Case
                  </button>
                );
              }
              if (action === "send_followup") {
                return (
                  <button
                    key="send_followup"
                    onClick={() => handleActionClick("send_followup")}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors"
                  >
                    Send Follow-up
                  </button>
                );
              }
              if (action === "view_cr") {
                return (
                  <button
                    key="view_cr"
                    onClick={() => handleActionClick("view_cr")}
                    className="flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors"
                  >
                    View Change Request
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                );
              }
              if (action === "view_pr") {
                // Resolve URL from the CR record (canonical source) with fallback
                // to audit event metadata. If neither has it, skip the button —
                // this happens when GitHub integration was not configured.
                const url = resolveGithubPrUrl();
                if (!url) return null;
                return (
                  <a
                    key="view_pr"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors"
                  >
                    View PR
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LineageTimeline({ response, productId, onActionComplete }: LineageTimelineProps) {
  const { toast } = useToast();

  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeModal = () => {
    if (!isSubmitting) setActiveModal(null);
  };

  const handleApprove = async () => {
    if (!activeModal) return;
    setIsSubmitting(true);
    try {
      await approveChangeRequestApi(productId, activeModal.crId, note.trim() || undefined);
      toast("Change request approved successfully", "success");
      setActiveModal(null);
      onActionComplete();
    } catch (err) {
      toast(`Approval failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!activeModal) return;
    if (reason.trim().length < 10) {
      toast("Rejection reason must be at least 10 characters", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await rejectChangeRequestApi(productId, activeModal.crId, reason.trim());
      toast("Change request rejected", "info");
      setActiveModal(null);
      onActionComplete();
    } catch (err) {
      toast(`Rejection failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [resolveNote, setResolveNote] = useState("");

  const handleResolve = (_nodeId: string) => {
    setResolveNote("");
    setActiveModal({ mode: "resolve", crId: "", crTitle: response.caseId });
  };

  const handleResolveSubmit = async () => {
    setIsSubmitting(true);
    try {
      const note = resolveNote.trim() || "Resolved by operator";
      await resolveCaseApi(productId, response.caseId, note);
      toast("Case marked as resolved", "success");
      setActiveModal(null);
      onActionComplete();
    } catch (err) {
      toast(`Resolve failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendToChange = async (_nodeId: string) => {
    try {
      await sendToChangeApi(productId, response.caseId);
      toast("Case sent to change — Change Request created", "success");
      onActionComplete();
    } catch (err) {
      toast(`Send to Change failed: ${(err as Error).message}`, "error");
    }
  };

  const handleEscalate = async (_nodeId: string) => {
    try {
      await escalateCaseApi(productId, response.caseId);
      toast("Case escalated to lead", "info");
      onActionComplete();
    } catch (err) {
      toast(`Escalation failed: ${(err as Error).message}`, "error");
    }
  };

  const handleReopen = async (_nodeId: string) => {
    try {
      await reopenCaseApi(productId, response.caseId);
      toast("Case reopened — awaiting lead review", "info");
      onActionComplete();
    } catch (err) {
      toast(`Reopen failed: ${(err as Error).message}`, "error");
    }
  };

  const handleSendFollowup = async (_nodeId: string) => {
    const message = window.prompt("Enter follow-up message to send to the customer:");
    if (!message?.trim()) return;
    try {
      await sendFollowupApi(productId, response.caseId, message.trim());
      toast("Follow-up email sent to customer", "success");
      onActionComplete();
    } catch (err) {
      toast(`Follow-up failed: ${(err as Error).message}`, "error");
    }
  };

  const openModal = (modal: ActiveModal) => {
    if (modal.mode === "approve") setNote("");
    else if (modal.mode === "resolve") setResolveNote("");
    else setReason("");
    setActiveModal(modal);
  };

  const RESOLVABLE_STATUSES = ["triaged", "awaiting-lead", "in-resolution", "in-change", "pr-drafting"]

  if (response.nodes.length === 0) {
    const canResolveFromEmpty = RESOLVABLE_STATUSES.includes(response.currentStatus)
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-black/5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">No events yet</p>
          <p className="mt-1 text-xs text-gray-400">The agent is processing — events will appear here shortly.</p>
          {canResolveFromEmpty ? (
            <button
              onClick={() => handleResolve("")}
              className="mt-5 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
            >
              Mark Resolved
            </button>
          ) : (
            <div className="mt-4 h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden="true" />
          )}
        </div>
        {/* Resolve modal must render even in empty state so state updates work */}
        <Modal isOpen={activeModal?.mode === "resolve"} onClose={closeModal} title="Resolve Case">
          {activeModal?.mode === "resolve" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="resolve-note-empty" className="block text-sm font-medium text-gray-700">
                  Resolution note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="resolve-note-empty"
                  rows={3}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="What was done to resolve this? Leave blank to use default."
                  disabled={isSubmitting}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleResolveSubmit} disabled={isSubmitting} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors">
                  {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                  Mark Resolved
                </button>
              </div>
            </div>
          )}
        </Modal>
      </>
    );
  }

  const isTerminal = ["resolved", "closed", "rejected"].includes(response.currentStatus)

  return (
    <>
      {/* ── Direction header ── */}
      <div className="flex items-center gap-3 px-1 mb-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 12l4-4M3 12l4 4" />
          </svg>
          Origin
        </span>
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
        </svg>
        <div className="flex-1 border-t border-dashed border-gray-200" />
        {isTerminal ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            {response.currentStatus.charAt(0).toUpperCase() + response.currentStatus.slice(1)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
            In progress
          </span>
        )}
      </div>

      <div
        role="list"
        aria-label="Case event timeline"
        className="relative space-y-0"
      >
        {response.nodes.map((node, index) => (
          <div key={node.nodeId} role="listitem">
            <NodeRow
              node={node}
              isLast={index === response.nodes.length - 1}
              productId={productId}
              changeRequests={response.changeRequests}
              onOpenModal={openModal}
              onEscalate={handleEscalate}
              onResolve={handleResolve}
              onSendToChange={handleSendToChange}
              onReopen={handleReopen}
              onSendFollowup={handleSendFollowup}
            />
          </div>
        ))}
      </div>

      {/* Approve modal */}
      <Modal
        isOpen={activeModal?.mode === "approve"}
        onClose={closeModal}
        title="Approve Change Request"
      >
        {activeModal?.mode === "approve" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Approving:{" "}
              <span className="font-medium text-gray-900">{activeModal.crTitle}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="lineage-approve-note" className="block text-sm font-medium text-gray-700">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="lineage-approve-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an approval note..."
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Approve
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal
        isOpen={activeModal?.mode === "reject"}
        onClose={closeModal}
        title="Reject Change Request"
      >
        {activeModal?.mode === "reject" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting:{" "}
              <span className="font-medium text-gray-900">{activeModal.crTitle}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="lineage-reject-reason" className="block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="lineage-reject-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this change request is being rejected..."
                disabled={isSubmitting}
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20 disabled:bg-gray-50 resize-none"
              />
              {reason.trim().length < 10 && (
                <p className="text-xs text-gray-400">{reason.trim().length === 0 ? "A reason is required." : `${10 - reason.trim().length} more character${10 - reason.trim().length === 1 ? "" : "s"} needed.`}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isSubmitting || reason.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Reject
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Resolve modal (UX-09) ── */}
      <Modal isOpen={activeModal?.mode === "resolve"} onClose={closeModal} title="Resolve Case">
        {activeModal?.mode === "resolve" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="resolve-note-timeline" className="block text-sm font-medium text-gray-700">
                Resolution note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="resolve-note-timeline"
                rows={3}
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="What was done to resolve this? Leave blank to use default."
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleResolveSubmit} disabled={isSubmitting} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors">
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Mark Resolved
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
