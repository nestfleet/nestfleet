// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow, format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { RiskBadge, Badge } from "@/components/Badge";
import { DetailRow } from "@/components/DetailRow";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  getChangeRequestApi,
  approveChangeRequestApi,
  rejectChangeRequestApi,
} from "@/lib/api";
import { useProductIdWithFallback, useProductBasePath } from "@/lib/product-context";
import { broadcastInvalidation } from "@/lib/useSWRBroadcast";


type ModalMode = "approve" | "reject";

interface PageProps {
  params: Promise<{ crId: string }>;
}

export default function CRDetailPage({ params }: PageProps) {
  const productId = useProductIdWithFallback();
  const basePath  = useProductBasePath();
  const { crId } = use(params);
  const { toast } = useToast();

  const { data: cr, error, isLoading, mutate } = useSWR(
    productId && crId ? ["cr", productId, crId] : null,
    () => getChangeRequestApi(productId, crId),
    { revalidateOnFocus: true }
  );

  const [activeModal,  setActiveModal]  = useState<ModalMode | null>(null);
  const [note,         setNote]         = useState("");
  const [reason,       setReason]       = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeModal = () => {
    if (!isSubmitting) setActiveModal(null);
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveChangeRequestApi(productId, crId, note.trim() || undefined);
      toast("Change request approved", "success");
      setActiveModal(null);
      await mutate();
      broadcastInvalidation(productId, ["approvals", "approvals-badge"]);
    } catch (err) {
      toast(`Approval failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (reason.trim().length < 10) {
      toast("Rejection reason must be at least 10 characters", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await rejectChangeRequestApi(productId, crId, reason.trim());
      toast("Change request rejected", "info");
      setActiveModal(null);
      await mutate();
      broadcastInvalidation(productId, ["approvals", "approvals-badge"]);
    } catch (err) {
      toast(`Rejection failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${format(d, "MMM d, yyyy 'at' HH:mm")} (${formatDistanceToNow(d, { addSuffix: true })})`;
    } catch {
      return dateStr;
    }
  };

  const isPending = cr?.status === "approval-pending";

  return (
    <AppLayout>
      {/* Navigation breadcrumbs */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={`${basePath}/approvals`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 rounded-sm"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Change Approvals
        </Link>

        {cr?.case_id && (
          <>
            <span className="text-gray-300" aria-hidden="true">|</span>
            <Link
              href={`${basePath}/cases/${cr.case_id}`}
              className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 rounded-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              View Case Lineage
            </Link>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-gray-400">Loading change request...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">Failed to load change request</p>
          <p className="mt-1 text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      ) : !cr ? null : (
        <div className="space-y-4">
          {/* Header card */}
          <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 leading-snug">
                  {cr.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge riskLevel={cr.risk_level} />
                  <Badge
                    variant={
                      cr.status === "approved"
                        ? "green"
                        : cr.status === "rejected"
                        ? "red"
                        : cr.status === "approval-pending"
                        ? "yellow"
                        : "gray"
                    }
                  >
                    {cr.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                </div>
              </div>

              {/* Actions — only show if pending */}
              {isPending && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Approve as-is */}
                  <button
                    onClick={() => { setNote(""); setActiveModal("approve"); }}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Approve
                  </button>

                  {/* Reject */}
                  <button
                    onClick={() => { setReason(""); setActiveModal("reject"); }}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Option C: what happens after approval ── */}
          {isPending && (
            <div className="rounded-xl bg-indigo-50 ring-1 ring-indigo-200 px-5 py-3.5 flex items-start gap-3">
              <svg className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs text-indigo-700 leading-relaxed">
                <span className="font-semibold">After you approve:</span>{" "}
                NestFleet will generate a draft PR in GitHub based on this scope.
                You'll review and refine the actual code there, then return to <span className="font-medium">PR Drafts</span> and click <span className="font-medium">Accept &amp; Complete</span> when satisfied.
                GitHub is your code editor — NestFleet handles the loop.
              </p>
            </div>
          )}

          {/* ── Decision outcome card ── */}
          {(cr.status === "approved" || cr.status === "rejected") && (
            <div className={`rounded-xl ring-1 px-5 py-4 flex items-start gap-3 ${
              cr.status === "approved"
                ? "bg-emerald-50 ring-emerald-200"
                : "bg-red-50 ring-red-200"
            }`}>
              {cr.status === "approved" ? (
                <svg className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${cr.status === "approved" ? "text-emerald-800" : "text-red-800"}`}>
                  {cr.status === "approved" ? "Approved" : "Rejected"}
                  {cr.approved_at && (
                    <span className="ml-2 font-normal text-xs text-emerald-600">
                      {formatDate(cr.approved_at)}
                    </span>
                  )}
                  {cr.rejected_at && (
                    <span className="ml-2 font-normal text-xs text-red-500">
                      {formatDate(cr.rejected_at)}
                    </span>
                  )}
                </p>
                {cr.rejection_rationale && (
                  <p className="mt-1 text-sm text-red-700 leading-relaxed">{cr.rejection_rationale}</p>
                )}
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left column */}
            <div className="space-y-4">
              {/* Metadata */}
              <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Details</h2>
                <dl className="space-y-3 text-sm">
                  <DetailRow label="CR ID">
                    <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600 break-all">
                      {cr.change_request_id}
                    </code>
                  </DetailRow>
                  <DetailRow label="Risk Level">
                    <RiskBadge riskLevel={cr.risk_level} />
                  </DetailRow>
                  <DetailRow label="Case ID">
                    {cr.case_id ? (
                      <Link
                        href={`${basePath}/cases/${cr.case_id}`}
                        className="font-mono text-xs text-indigo-600 hover:underline focus:outline-hidden focus:underline"
                      >
                        {cr.case_id}
                      </Link>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </DetailRow>
                  <DetailRow label="Created">
                    <span className="text-gray-700">{formatDate(cr.created_at)}</span>
                  </DetailRow>
                  <DetailRow label="Updated">
                    <span className="text-gray-700">{formatDate(cr.updated_at)}</span>
                  </DetailRow>
                  {cr.github_issue_number !== null && (
                    <DetailRow label="GitHub Issue">
                      {cr.github_issue_url ? (
                        <a
                          href={cr.github_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm focus:outline-hidden focus:underline"
                        >
                          #{cr.github_issue_number}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : (
                        <span>#{cr.github_issue_number}</span>
                      )}
                    </DetailRow>
                  )}
                </dl>
              </div>

              {/* Affected surfaces */}
              {cr.affected_surfaces.length > 0 && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Affected Surfaces
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {cr.affected_surfaces.map((surface) => (
                      <Badge key={surface} variant="blue">
                        {surface}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Impact summary */}
              {cr.impact_summary && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Impact Summary
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {cr.impact_summary}
                  </p>
                </div>
              )}

              {/* Proposed scope */}
              {cr.proposed_scope && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Proposed Scope
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {cr.proposed_scope}
                  </p>
                </div>
              )}

              {/* Implementation notes */}
              {cr.implementation_notes && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Implementation Notes
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {cr.implementation_notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve modal ── */}
      <Modal
        isOpen={activeModal === "approve"}
        onClose={closeModal}
        title="Approve Change Request"
      >
        {cr && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Approving:{" "}
              <span className="font-medium text-gray-900">{cr.title}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="cr-approve-note" className="block text-sm font-medium text-gray-700">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="cr-approve-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an approval note..."
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-gray-300">
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Approve
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject modal ── */}
      <Modal
        isOpen={activeModal === "reject"}
        onClose={closeModal}
        title="Reject Change Request"
      >
        {cr && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting:{" "}
              <span className="font-medium text-gray-900">{cr.title}</span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="cr-reject-reason" className="block text-sm font-medium text-gray-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="cr-reject-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this change request is being rejected..."
                disabled={isSubmitting}
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 shadow-xs focus:border-red-400 focus:outline-hidden focus:ring-2 focus:ring-red-400/20 disabled:bg-gray-50 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={closeModal} disabled={isSubmitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-gray-300">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isSubmitting || reason.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                Reject
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

