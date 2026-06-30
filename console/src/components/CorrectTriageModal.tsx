// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * CorrectTriageModal — FEAT-015
 *
 * Allows support_lead / product_lead / change_lead / admin to correct the
 * AI-assigned triage classification for a case.
 *
 * Usage:
 *   <CorrectTriageModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSuccess={() => mutate()}
 *     productId={productId}
 *     caseId={caseId}
 *     currentType="bug_report"
 *     currentSeverity="normal"
 *     caseStatus={caseRow.status}
 *     hasCr={caseRow.status === "in-change" || caseRow.status === "awaiting-approval"}
 *   />
 */

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { correctTriageApi, ApiError } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CorrectTriageModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after successful correction — parent should refetch case data. */
  onSuccess: () => void;
  productId: string;
  caseId: string;
  /** Current AI-assigned type, e.g. "bug_report" */
  currentType: string;
  /** Current AI-assigned severity: "low" | "normal" | "high" | "critical" */
  currentSeverity: string;
  /** Current case status — used to decide which warning banner to show */
  caseStatus: string;
  /** True when case has an active Change Request (in-change or awaiting-approval) */
  hasCr: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "bug_report",    label: "Bug" },
  { value: "user_request",  label: "Request" },
  { value: "outage_report", label: "Outage" },
  { value: "user_feedback", label: "Feedback" },
  { value: "sales_inquiry", label: "Sales" },
];

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low",      label: "Low" },
  { value: "normal",   label: "Normal" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" },
];

const MAX_REASON_LENGTH = 200;

// ─── Component ────────────────────────────────────────────────────────────────

export function CorrectTriageModal({
  open,
  onClose,
  onSuccess,
  productId,
  caseId,
  currentType,
  currentSeverity,
  caseStatus,
  hasCr,
}: CorrectTriageModalProps) {
  const { toast } = useToast();

  const [selectedType,     setSelectedType]     = useState(currentType);
  const [selectedSeverity, setSelectedSeverity] = useState(currentSeverity);
  const [reason,           setReason]           = useState("");
  const [submitting,       setSubmitting]       = useState(false);
  const [inlineError,      setInlineError]      = useState<string | null>(null);

  // Reset local state whenever the modal opens/closes
  function handleClose() {
    if (submitting) return;
    setSelectedType(currentType);
    setSelectedSeverity(currentSeverity);
    setReason("");
    setInlineError(null);
    onClose();
  }

  // Apply is enabled when reason is non-empty AND at least one value differs
  const typeChanged     = selectedType     !== currentType;
  const severityChanged = selectedSeverity !== currentSeverity;
  const canSubmit = reason.trim().length > 0 && (typeChanged || severityChanged);

  async function handleApply() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setInlineError(null);
    try {
      await correctTriageApi(productId, caseId, {
        ...(typeChanged     ? { type: selectedType }         : {}),
        ...(severityChanged ? { severity: selectedSeverity } : {}),
        reason: reason.trim(),
      });
      toast("Triage corrected — pipeline restarted", "success");
      onSuccess();
      handleClose();
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : "Unexpected error — please try again.";
      setInlineError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Warning banners
  const showCrWarning    = hasCr;
  const showDraftWarning = !hasCr && (caseStatus === "reply-drafted" || caseStatus === "awaiting-lead");

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Correct Triage"
      className="max-w-lg"
    >
      <div className="space-y-5">

        {/* ── Warning banners ── */}
        {showCrWarning && (
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              This will cancel the active Change Request and restart the pipeline.
            </p>
          </div>
        )}

        {showDraftWarning && (
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              The current reply draft will be discarded.
            </p>
          </div>
        )}

        {/* ── Type selector ── */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Type</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Case type">
            {TYPE_OPTIONS.map((opt) => {
              const isSelected = selectedType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedType(opt.value)}
                  aria-pressed={isSelected}
                  className={
                    isSelected
                      ? "rounded-full px-3 py-1 text-sm font-medium bg-indigo-600 text-white ring-1 ring-indigo-600 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                      : "rounded-full px-3 py-1 text-sm font-medium bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Severity selector ── */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Severity</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Case severity">
            {SEVERITY_OPTIONS.map((opt) => {
              const isSelected = selectedSeverity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedSeverity(opt.value)}
                  aria-pressed={isSelected}
                  className={
                    isSelected
                      ? "rounded-full px-3 py-1 text-sm font-medium bg-indigo-600 text-white ring-1 ring-indigo-600 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                      : "rounded-full px-3 py-1 text-sm font-medium bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Reason textarea ── */}
        <div>
          <label
            htmlFor="correct-triage-reason"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Reason <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <textarea
            id="correct-triage-reason"
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            placeholder="Why is this classification wrong?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
            aria-describedby="correct-triage-reason-counter"
          />
          <p
            id="correct-triage-reason-counter"
            className={`mt-1 text-right text-xs ${
              reason.length >= MAX_REASON_LENGTH ? "text-red-500" : "text-gray-400"
            }`}
          >
            {reason.length}/{MAX_REASON_LENGTH}
          </p>
        </div>

        {/* ── Inline error ── */}
        {inlineError && (
          <p role="alert" className="text-sm text-red-600">
            {inlineError}
          </p>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-busy={submitting}
          >
            {submitting && (
              <svg
                className="h-3.5 w-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            Apply Correction
          </button>
        </div>
      </div>
    </Modal>
  );
}
