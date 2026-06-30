// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { RiskBadge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { canPerformAction } from "@/lib/permissions";
import {
  getPendingApprovalsApi,
  approveChangeRequestApi,
  rejectChangeRequestApi,
  escalateCaseApi,
} from "@/lib/api";
import type { ChangeRequest } from "@/lib/types";
import { useProductIdWithFallback, useProductSafe } from "@/lib/product-context";
import { usePendingNotificationRefs } from "@/lib/usePendingNotificationRefs";
import { SearchInput } from "@/components/SearchInput";


// ─── Types ────────────────────────────────────────────────────────────────────

type ModalMode = "approve" | "reject" | "escalate";

interface ActiveModal {
  mode:    ModalMode;
  crId:    string;
  crTitle: string;
  caseId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** How long the CR has been waiting — framed as urgency, not just a timestamp */
function waitingTime(createdAt: string): string {
  try { return formatDistanceToNow(new Date(createdAt)); }
  catch { return "—"; }
}

/** Truncate impact summary to a readable length for the table cell */
function truncate(text: string | null, max = 90): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const productId = useProductIdWithFallback();
  const router = useRouter();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";
  const { toast } = useToast();
  const { user } = useAuth();
  const userRoles = user?.roles ?? [];
  const canApprove = canPerformAction(userRoles, "approval.approve");

  const { data, error, isLoading, mutate } = useSWR(
    productId ? ["pending-approvals", productId] : null,
    () => getPendingApprovalsApi(productId),
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );

  const requests: ChangeRequest[] = data?.data ?? [];
  const pendingRefs = usePendingNotificationRefs(productId);

  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.trim().toLowerCase();
  const visibleRequests = q
    ? requests.filter((cr) =>
        cr.title.toLowerCase().includes(q) ||
        cr.change_request_id.toLowerCase().includes(q) ||
        cr.case_id.toLowerCase().includes(q) ||
        (cr.impact_summary ?? "").toLowerCase().includes(q)
      )
    : requests;

  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [note,        setNote]        = useState("");
  const [reason,      setReason]      = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openApprove  = (cr: ChangeRequest) => { setNote("");   setActiveModal({ mode: "approve",  crId: cr.change_request_id, crTitle: cr.title }); };
  const openReject   = (cr: ChangeRequest) => { setReason(""); setActiveModal({ mode: "reject",   crId: cr.change_request_id, crTitle: cr.title }); };
  const openEscalate = (cr: ChangeRequest) => {               setActiveModal({ mode: "escalate", crId: cr.change_request_id, crTitle: cr.title, caseId: cr.case_id }); };
  const closeModal   = () => { if (!isSubmitting) setActiveModal(null); };

  const handleApprove = async () => {
    if (!activeModal) return;
    setIsSubmitting(true);
    try {
      await approveChangeRequestApi(productId, activeModal.crId, note.trim() || undefined);
      toast("Change request approved", "success");
      setActiveModal(null);
      await mutate();
    } catch (err) {
      toast(`Approval failed: ${(err as Error).message}`, "error");
    } finally { setIsSubmitting(false); }
  };

  const handleReject = async () => {
    if (!activeModal) return;
    if (reason.trim().length < 10) { toast("Reason must be at least 10 characters", "error"); return; }
    setIsSubmitting(true);
    try {
      await rejectChangeRequestApi(productId, activeModal.crId, reason.trim());
      toast("Change request rejected", "info");
      setActiveModal(null);
      await mutate();
    } catch (err) {
      toast(`Rejection failed: ${(err as Error).message}`, "error");
    } finally { setIsSubmitting(false); }
  };

  const handleEscalate = async () => {
    if (!activeModal?.caseId) return;
    setIsSubmitting(true);
    try {
      await escalateCaseApi(productId, activeModal.caseId);
      toast("Case escalated to Lead", "info");
      setActiveModal(null);
      await mutate();
    } catch (err) {
      toast(`Escalation failed: ${(err as Error).message}`, "error");
    } finally { setIsSubmitting(false); }
  };

  if (!productId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-50">
            <svg className="h-7 w-7 text-yellow-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900">No product configured</h2>
          <p className="mt-1 text-sm text-gray-500">
            Set <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono">NEXT_PUBLIC_PRODUCT_ID</code> in your{" "}
            <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono">.env.local</code> to load approvals.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Change Approvals</h1>
            <p className="text-sm text-gray-500">
              {isLoading
                ? "Loading…"
                : `${visibleRequests.length} change request${visibleRequests.length !== 1 ? "s" : ""} awaiting review`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            {!isLoading && requests.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg ring-1 ring-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {requests.length} awaiting approval
              </span>
            )}
            {/* Search */}
            <div className="mt-2 sm:mt-0">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search approvals…" />
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 overflow-hidden">
          {isLoading && visibleRequests.length === 0 ? (
            <div className="flex items-center justify-center py-14">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm text-gray-400">Loading approvals…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
                <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Failed to load approvals</p>
              <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-green-50">
                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">All clear</p>
              <p className="mt-1 text-xs text-gray-500">No change requests are pending approval.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Change Request
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Risk
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">
                      Impact
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                      Waiting
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRequests.map((cr) => (
                    <ApprovalRow
                      key={cr.change_request_id}
                      cr={cr}
                      hasPendingNotif={pendingRefs.has(cr.change_request_id)}
                      onViewDetail={() => router.push(`${basePath}/approvals/${cr.change_request_id}`)}
                      onApprove={() => openApprove(cr)}
                      onReject={() => openReject(cr)}
                      onEscalate={() => openEscalate(cr)}
                      canApprove={canApprove}
                      truncate={truncate}
                      waitingTime={waitingTime}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isLoading && !error && visibleRequests.length > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 30s</p>
        )}
      </div>

      {/* ── Approve modal ── */}
      <Modal isOpen={activeModal?.mode === "approve"} onClose={closeModal} title="Approve Change Request">
        {activeModal?.mode === "approve" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Approving: <span className="font-medium text-gray-900">{activeModal.crTitle}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="approve-note" className="block text-sm font-medium text-gray-700">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="approve-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an approval note…"
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleApprove} disabled={isSubmitting} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors">
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Approve
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject modal ── */}
      <Modal isOpen={activeModal?.mode === "reject"} onClose={closeModal} title="Reject Change Request">
        {activeModal?.mode === "reject" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting: <span className="font-medium text-gray-900">{activeModal.crTitle}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this change request is being rejected…"
                disabled={isSubmitting}
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-xs focus:border-red-400 focus:outline-hidden focus:ring-2 focus:ring-red-400/20 disabled:bg-gray-50 resize-none"
              />
              {reason.trim().length < 10 && (
                <p className="text-xs text-gray-400">
                  {reason.trim().length === 0
                    ? "A reason is required."
                    : `${10 - reason.trim().length} more character${10 - reason.trim().length === 1 ? "" : "s"} needed.`}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleReject} disabled={isSubmitting || reason.trim().length < 10} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors">
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Reject
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Escalate to Lead modal (UX-06) ── */}
      <Modal isOpen={activeModal?.mode === "escalate"} onClose={closeModal} title="Escalate to Lead">
        {activeModal?.mode === "escalate" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will move the originating case back to Lead review — the change request will remain pending.
            </p>
            <p className="text-sm text-gray-600">
              Change request: <span className="font-medium text-gray-900">{activeModal.crTitle}</span>
            </p>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleEscalate} disabled={isSubmitting} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-50 transition-colors">
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Escalate to Lead
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface ApprovalRowProps {
  cr:               ChangeRequest;
  hasPendingNotif:  boolean;
  onViewDetail:     () => void;
  onApprove:        () => void;
  onReject:         () => void;
  onEscalate:       () => void;
  canApprove:       boolean;
  truncate:         (text: string | null, max?: number) => string;
  waitingTime:      (createdAt: string) => string;
}

function ApprovalRow({ cr, hasPendingNotif, onViewDetail, onApprove, onReject, onEscalate, canApprove, truncate, waitingTime }: ApprovalRowProps) {
  const productId = useProductIdWithFallback();
  const router = useRouter();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";

  const shortCrId   = cr.change_request_id.length > 17 ? cr.change_request_id.slice(0, 16) + "…" : cr.change_request_id;
  const shortCaseId = cr.case_id ? (cr.case_id.length > 17 ? cr.case_id.slice(0, 16) + "…" : cr.case_id) : null;
  const impact      = truncate(cr.impact_summary);

  return (
    <tr className="hover:bg-indigo-50/30 transition-colors">

      {/* ── Change Request cell ── */}
      <td className="px-4 py-2 max-w-sm">
        {/* Title — click to view detail */}
        <div className="flex items-center gap-2 min-w-0">
          {hasPendingNotif && (
            <span
              className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400"
              title="Has pending or unacknowledged notification"
              aria-label="Pending notification"
            />
          )}
          <button
            onClick={onViewDetail}
            className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors text-left truncate block max-w-xs focus:outline-hidden focus:underline"
          >
            {cr.title}
          </button>
          {cr.cr_track === "infra_debt" && (
            <span
              className="shrink-0 inline-flex items-center rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-inset ring-orange-200"
              title="Auto-flagged infra debt — no user blocking, workaround already delivered"
            >
              Infra Debt
            </span>
          )}
        </div>

        {/* Subtitle: short IDs + affected surfaces */}
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500 flex-wrap">
          <code className="font-mono">{shortCrId}</code>

          {shortCaseId && (
            <>
              <span className="text-gray-300">·</span>
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`${basePath}/cases/${cr.case_id}`); }}
                className="font-mono text-indigo-500 hover:text-indigo-700 hover:underline focus:outline-hidden"
                title="Go to originating case"
              >
                {shortCaseId}
              </button>
            </>
          )}

          {cr.affected_surfaces && cr.affected_surfaces.length > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span>
                {cr.affected_surfaces.slice(0, 3).join(", ")}
                {cr.affected_surfaces.length > 3 && ` +${cr.affected_surfaces.length - 3}`}
              </span>
            </>
          )}
        </div>
      </td>

      {/* ── Risk ── */}
      <td className="px-3 py-2 shrink-0">
        <RiskBadge riskLevel={cr.risk_level} />
      </td>

      {/* ── Impact ── */}
      <td className="px-3 py-2 hidden md:table-cell max-w-xs">
        {impact ? (
          <p className="text-xs text-gray-500 leading-relaxed">{impact}</p>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* ── Waiting ── */}
      <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
        <p className="text-xs text-gray-500">{waitingTime(cr.created_at)}</p>
      </td>

      {/* ── Actions ── */}
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          {canApprove && (
            <>
              <button
                onClick={onApprove}
                className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 focus:outline-hidden focus:ring-2 focus:ring-red-500 transition-colors"
              >
                Reject
              </button>
              {cr.case_id && (
                <button
                  onClick={onEscalate}
                  className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 focus:outline-hidden focus:ring-2 focus:ring-amber-400 transition-colors"
                  title="Send case back to Lead review"
                >
                  Escalate
                </button>
              )}
            </>
          )}
          <button
            onClick={onViewDetail}
            className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-gray-400 transition-colors"
            title="View full detail"
          >
            Detail
          </button>
        </div>
      </td>
    </tr>
  );
}
