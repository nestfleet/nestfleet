"use client";

import type { LineageNodeType, LineageNode } from "@/lib/types";

// ── Icon component ─────────────────────────────────────────────────────────────

export function NodeIcon({ type, actorType }: { type: LineageNodeType; actorType: LineageNode["actorType"] }) {
  if (actorType === "human") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    );
  }

  const paths: Record<string, string> = {
    signal_received: "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z",
    case_created: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
    routing: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    change_request_created: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
    approval_requested: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    approved: "M4.5 12.75l6 6 9-13.5",
    rejected: "M6 18L18 6M6 6l12 12",
    pr_merged: "M7.5 3v10.5m0 0a3 3 0 106 0M7.5 13.5a3 3 0 106 0m3-10.5v3.75a3.75 3.75 0 01-3.75 3.75H9.75",
    ci_passed: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    ci_failed: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    deployed: "M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.099 11.095H6.75z",
    deploy_failed: "M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 3a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.099 11.095H6.75",
    resolved: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    escalated: "M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18",
    notification_sent: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  };

  // Agent types share one icon
  const agentTypes = ["triage", "known_issue_match", "change_prep", "auto_reply", "pr_drafted"];
  const agentPath = "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 4.5v.75a.75.75 0 00.75.75h9a.75.75 0 00.75-.75V4.5m-10.5 0h10.5m-10.5 0a.75.75 0 00-.75.75v.75m12-.75a.75.75 0 01.75.75v.75m-12 10.5h10.5m-10.5 0a.75.75 0 01-.75-.75v-.75m12 1.5a.75.75 0 00.75-.75v-.75M6.75 8.25h10.5a.75.75 0 01.75.75v6a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V9a.75.75 0 01.75-.75z";

  const d = agentTypes.includes(type) ? agentPath : (paths[type] ?? paths["routing"]!);

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ── Color classes ──────────────────────────────────────────────────────────────

export function nodeIconClasses(type: LineageNodeType, actorType: LineageNode["actorType"]): string {
  if (actorType === "human") return "bg-blue-500/20 text-blue-400";

  const map: Partial<Record<LineageNodeType, string>> = {
    signal_received:        "bg-blue-500/20 text-blue-400",
    case_created:           "bg-zinc-600/30 text-zinc-400",
    triage:                 "bg-indigo-500/20 text-indigo-400",
    known_issue_match:      "bg-indigo-500/20 text-indigo-400",
    routing:                "bg-purple-500/20 text-purple-400",
    change_request_created: "bg-purple-500/20 text-purple-400",
    change_prep:            "bg-indigo-500/20 text-indigo-400",
    approval_requested:     "bg-orange-500/20 text-orange-400",
    approved:               "bg-green-500/20 text-green-400",
    rejected:               "bg-red-500/20 text-red-400",
    pr_drafted:             "bg-indigo-500/20 text-indigo-400",
    pr_merged:              "bg-violet-500/20 text-violet-400",
    ci_passed:              "bg-emerald-500/20 text-emerald-400",
    ci_failed:              "bg-red-500/20 text-red-400",
    deployed:               "bg-teal-500/20 text-teal-400",
    deploy_failed:          "bg-red-500/20 text-red-400",
    auto_reply:             "bg-indigo-500/20 text-indigo-400",
    escalated:              "bg-red-500/20 text-red-400",
    resolved:               "bg-emerald-500/20 text-emerald-400",
    notification_sent:      "bg-sky-500/20 text-sky-400",
    system_event:           "bg-zinc-600/30 text-zinc-400",
  };
  return map[type] ?? "bg-zinc-600/30 text-zinc-400";
}

export function nodeBorderColor(type: LineageNodeType): string {
  const map: Partial<Record<LineageNodeType, string>> = {
    approved:    "border-green-500/40",
    rejected:    "border-red-500/40",
    ci_passed:   "border-emerald-500/40",
    ci_failed:   "border-red-500/40",
    deployed:    "border-teal-500/40",
    resolved:    "border-emerald-500/40",
    escalated:   "border-red-500/40",
    pr_merged:   "border-violet-500/40",
  };
  return map[type] ?? "border-zinc-700";
}
