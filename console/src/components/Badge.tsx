// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import clsx from "clsx";
import type { CaseStatus, CaseSeverity, RiskLevel } from "@/lib/types";

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CaseStatus, string> = {
  new: "bg-gray-100 text-gray-700 ring-gray-200",
  enriching: "bg-blue-100 text-blue-700 ring-blue-200",
  triaged: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  "in-resolution": "bg-green-100 text-green-700 ring-green-200",
  "awaiting-lead": "bg-orange-100 text-orange-700 ring-orange-200",
  "in-change": "bg-purple-100 text-purple-700 ring-purple-200",
  resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  closed: "bg-gray-200 text-gray-600 ring-gray-300",
  // QE-05
  "processing-failed": "bg-red-100 text-red-700 ring-red-200",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  enriching: "Enriching",
  triaged: "Triaged",
  "in-resolution": "In Resolution",
  "awaiting-lead": "Awaiting Lead",
  "in-change": "In Change",
  resolved: "Resolved",
  closed: "Closed",
  // QE-05
  "processing-failed": "Processing Failed",
};

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700 ring-gray-200";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles,
        className
      )}
    >
      {label}
    </span>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<CaseSeverity, string> = {
  critical: "bg-red-100 text-red-700 ring-red-200",
  high: "bg-orange-100 text-orange-700 ring-orange-200",
  normal: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  low: "bg-gray-100 text-gray-600 ring-gray-200",
};

interface SeverityBadgeProps {
  severity: CaseSeverity | null | undefined;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  if (!severity) return <span className="text-gray-300 text-xs">—</span>;
  const styles =
    SEVERITY_STYLES[severity] ?? "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize",
        styles,
        className
      )}
    >
      {severity}
    </span>
  );
}

// ─── Risk Level Badge ─────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskLevel, string> = {
  critical: "bg-red-100 text-red-700 ring-red-200",
  high: "bg-orange-100 text-orange-700 ring-orange-200",
  medium: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  low: "bg-green-100 text-green-700 ring-green-200",
};

interface RiskBadgeProps {
  riskLevel: RiskLevel;
  className?: string;
}

export function RiskBadge({ riskLevel, className }: RiskBadgeProps) {
  const styles =
    RISK_STYLES[riskLevel] ?? "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize",
        styles,
        className
      )}
    >
      {riskLevel}
    </span>
  );
}

// ─── Status Dot (Option B — dot + text, no background pill) ──────────────────

const STATUS_DOT_COLOR: Record<CaseStatus, string> = {
  new:            "bg-gray-400",
  enriching:      "bg-blue-400",
  triaged:        "bg-indigo-400",
  "in-resolution":"bg-green-500",
  "awaiting-lead":"bg-orange-400",
  "in-change":    "bg-purple-400",
  resolved:       "bg-emerald-500",
  closed:         "bg-gray-300",
  // QE-05
  "processing-failed": "bg-red-500",
};

export function StatusDot({ status, className }: StatusBadgeProps) {
  const dot   = STATUS_DOT_COLOR[status] ?? "bg-gray-400";
  const label = STATUS_LABELS[status]    ?? status;
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className={clsx("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
      <span className="text-xs text-gray-700 whitespace-nowrap">{label}</span>
    </span>
  );
}

// ─── Severity Dot (Option B — colored square icon + text, no background pill) ─

const SEVERITY_DOT_COLOR: Record<CaseSeverity, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  normal:   "bg-gray-300",
  low:      "bg-gray-200",
};

const SEVERITY_TEXT_COLOR: Record<CaseSeverity, string> = {
  critical: "text-red-700",
  high:     "text-orange-700",
  normal:   "text-gray-500",
  low:      "text-gray-400",
};

interface SeverityDotProps {
  severity: CaseSeverity | null | undefined;
  className?: string;
}

export function SeverityDot({ severity, className }: SeverityDotProps) {
  if (!severity) return <span className="text-gray-300 text-xs">—</span>;
  const dot  = SEVERITY_DOT_COLOR[severity]  ?? "bg-gray-300";
  const text = SEVERITY_TEXT_COLOR[severity] ?? "text-gray-500";
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className={clsx("h-2 w-2 shrink-0 rounded-sm", dot)} aria-hidden="true" />
      <span className={clsx("text-xs capitalize font-medium", text)}>{severity}</span>
    </span>
  );
}

// ─── Risk Dot (dot + text, no background pill) ────────────────────────────────

const RISK_DOT_COLOR: Record<RiskLevel, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-green-400",
};

const RISK_TEXT_COLOR: Record<RiskLevel, string> = {
  critical: "text-red-700",
  high:     "text-orange-700",
  medium:   "text-yellow-700",
  low:      "text-green-700",
};

export function RiskDot({ riskLevel, className }: RiskBadgeProps) {
  const dot  = RISK_DOT_COLOR[riskLevel]  ?? "bg-gray-300";
  const text = RISK_TEXT_COLOR[riskLevel] ?? "text-gray-500";
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className={clsx("h-2 w-2 shrink-0 rounded-sm", dot)} aria-hidden="true" />
      <span className={clsx("text-xs capitalize font-medium", text)}>{riskLevel}</span>
    </span>
  );
}

// ─── Generic Badge ────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  variant?: "gray" | "blue" | "green" | "red" | "yellow" | "purple" | "orange";
  className?: string;
}

const VARIANT_STYLES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  blue: "bg-blue-100 text-blue-700 ring-blue-200",
  green: "bg-green-100 text-green-700 ring-green-200",
  red: "bg-red-100 text-red-700 ring-red-200",
  yellow: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  purple: "bg-purple-100 text-purple-700 ring-purple-200",
  orange: "bg-orange-100 text-orange-700 ring-orange-200",
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
