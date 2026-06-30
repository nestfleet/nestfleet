// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { Handle, Position } from "@xyflow/react";
import { formatDistanceToNow } from "date-fns";
import type { LineageNode } from "@/lib/types";
import type { TerminalKind } from "@/lib/lineage-graph-utils";
import { NodeIcon, nodeIconClasses, nodeBorderColor } from "./lineage-icons";

// ── START chip ─────────────────────────────────────────────────────────────────

function StartChip() {
  return (
    <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap pointer-events-none">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Start</span>
    </div>
  );
}

// ── END chip ───────────────────────────────────────────────────────────────────

const END_CHIP: Record<TerminalKind, { ring: string; bg: string; text: string; label: string }> = {
  success: { ring: "ring-2 ring-emerald-500/70", bg: "bg-emerald-950 ring-1 ring-emerald-700/60", text: "text-emerald-400", label: "END ✓" },
  failure: { ring: "ring-2 ring-red-500/70",     bg: "bg-red-950 ring-1 ring-red-700/60",         text: "text-red-400",     label: "END ✗" },
  open:    { ring: "ring-2 ring-amber-500/50",   bg: "bg-amber-950 ring-1 ring-amber-700/50",     text: "text-amber-400",  label: "· In Progress" },
};

function EndChip({ kind }: { kind: TerminalKind }) {
  const s = END_CHIP[kind];
  return (
    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none">
      <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    </div>
  );
}

// ── Sequence badge ─────────────────────────────────────────────────────────────

function SeqBadge({ n, compact }: { n: number; compact: boolean }) {
  return (
    <span
      className="absolute top-0.5 left-0.5 text-[8px] font-mono font-bold text-zinc-600 leading-none pointer-events-none select-none"
      aria-label={`Step ${n}`}
    >
      {n}
    </span>
  );
}

// ── Retry badge ────────────────────────────────────────────────────────────────

function RetryBadge() {
  return (
    <span className="absolute top-0.5 right-0.5 flex items-center gap-0.5 rounded-full bg-amber-950 px-1 py-0.5 text-[8px] font-semibold text-amber-400 ring-1 ring-amber-700/50 pointer-events-none select-none">
      ↺
    </span>
  );
}

// ── Attempt Frame ──────────────────────────────────────────────────────────────
// This is a separate node type rendered as a background container.

const FRAME_STYLES: Record<AttemptOutcome, { border: string; bg: string; label: string }> = {
  failure: { border: "border-red-500/25",     bg: "bg-red-950/15",     label: "text-red-600/60" },
  success: { border: "border-emerald-500/25", bg: "bg-emerald-950/15", label: "text-emerald-600/60" },
  pending: { border: "border-zinc-600/25",    bg: "bg-zinc-800/15",    label: "text-zinc-600/60" },
};

type AttemptOutcome = "failure" | "success" | "pending";

export function AttemptFrameNode({ data }: { data: Record<string, unknown> }) {
  const label   = data.label   as string;
  const outcome = (data.outcome as AttemptOutcome | undefined) ?? "pending";
  const width   = data.width   as number;
  const height  = data.height  as number;
  const s       = FRAME_STYLES[outcome];

  return (
    <div
      className={`rounded-xl border ${s.border} ${s.bg} select-none`}
      style={{ width, height }}
    >
      <span className={`absolute top-2 left-3 text-[9px] font-semibold uppercase tracking-widest ${s.label}`}>
        {label}
        {outcome === "failure" && " · rejected"}
        {outcome === "success" && " · completed"}
      </span>
    </div>
  );
}

// ── Main node component ────────────────────────────────────────────────────────

// React Flow v12 passes `data` as Record<string, unknown> — we cast internally.
export function LineageGraphNode({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected?: boolean;
}) {
  const node           = data.node           as LineageNode;
  const compact        = data.compact        as boolean   | undefined;
  const isRoot         = data.isRoot         as boolean   | undefined;
  const isTerminal     = data.isTerminal     as boolean   | undefined;
  const terminalKind   = (data.terminalKind  as TerminalKind | undefined) ?? "open";
  const onCriticalPath = data.onCriticalPath as boolean   | undefined;
  const highlightMode  = data.highlightMode  as boolean   | undefined;
  const isSatellite    = data.isSatellite    as boolean   | undefined;
  const sequenceNumber = data.sequenceNumber as number    | undefined;
  const isRetry        = data.isRetry        as boolean   | undefined;

  if (!node) return null;

  // Opacity: satellites are always subdued; off-path nodes fade in highlight mode
  const satelliteOpacity = isSatellite ? 0.55 : 1;
  const highlightOpacity = (highlightMode && onCriticalPath === false) ? 0.18 : 1;
  const opacity = Math.min(satelliteOpacity, highlightOpacity);

  const iconCls     = nodeIconClasses(node.type, node.actorType);
  const borderCls   = nodeBorderColor(node.type);
  const termRingCls = isTerminal ? END_CHIP[terminalKind].ring : "";

  // Satellite: dashed border override
  const satelliteBorderCls = isSatellite ? "border-dashed border-zinc-600/50" : borderCls;

  const maxTitleLen = compact ? 22 : 28;
  const title = node.title.length > maxTitleLen
    ? node.title.slice(0, maxTitleLen) + "…"
    : node.title;

  const actorLabel =
    node.actorType === "agent" ? "Agent" :
    node.actorType === "human" ? "Human" : "System";

  const actorCls =
    node.actorType === "agent" ? "bg-indigo-500/20 text-indigo-300" :
    node.actorType === "human" ? "bg-blue-500/20 text-blue-300" :
    "bg-zinc-600/30 text-zinc-400";

  const showSeq = sequenceNumber !== undefined && sequenceNumber > 0;

  // ── Compact ──────────────────────────────────────────────────────────────────

  if (compact) {
    return (
      <div className="relative" style={{ opacity, transition: "opacity 0.25s ease" }}>
        {isRoot     && <StartChip />}
        {isTerminal && <EndChip kind={terminalKind} />}
        <Handle type="target" position={Position.Left}  className="bg-zinc-600! border-zinc-500! w-1.5! h-1.5!" />
        <div
          className={[
            "rounded-sm border px-2 py-1.5 min-w-[160px] max-w-[180px]",
            "bg-zinc-800 shadow-xs cursor-pointer transition-all relative",
            isSatellite ? satelliteBorderCls : borderCls,
            termRingCls,
            selected ? "ring-2 ring-indigo-400 scale-[1.02]" : "hover:border-zinc-500",
          ].join(" ")}
        >
          {showSeq && <SeqBadge n={sequenceNumber!} compact />}
          {isRetry  && <RetryBadge />}
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`shrink-0 rounded-full p-0.5 ${iconCls}`}>
              <NodeIcon type={node.type} actorType={node.actorType} />
            </div>
            <span className="text-[11px] font-medium text-zinc-200 truncate leading-tight">{title}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[9px] text-zinc-500">
              {formatDistanceToNow(new Date(node.occurredAt), { addSuffix: true })}
            </span>
            <span className={`text-[9px] px-1 py-0.5 rounded-full ${actorCls}`}>{actorLabel}</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="bg-zinc-600! border-zinc-500! w-1.5! h-1.5!" />
      </div>
    );
  }

  // ── Normal ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative" style={{ opacity, transition: "opacity 0.25s ease" }}>
      {isRoot     && <StartChip />}
      {isTerminal && <EndChip kind={terminalKind} />}
      <Handle type="target" position={Position.Left}  className="bg-zinc-600! border-zinc-500! w-2! h-2!" />
      <div
        className={[
          "rounded-lg border px-3 py-2 min-w-[200px] max-w-[220px]",
          "bg-zinc-800 shadow-md cursor-pointer transition-all relative",
          isSatellite ? satelliteBorderCls : borderCls,
          termRingCls,
          selected ? "ring-2 ring-indigo-400 scale-[1.02]" : "hover:border-zinc-500",
        ].join(" ")}
      >
        {showSeq && <SeqBadge n={sequenceNumber!} compact={false} />}
        {isRetry  && <RetryBadge />}
        <div className="flex items-center gap-2 mb-1 mt-1">
          <div className={`shrink-0 rounded-full p-1 ${iconCls}`}>
            <NodeIcon type={node.type} actorType={node.actorType} />
          </div>
          <span className="text-xs font-medium text-zinc-200 truncate">{title}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">
            {formatDistanceToNow(new Date(node.occurredAt), { addSuffix: true })}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${actorCls}`}>{actorLabel}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="bg-zinc-600! border-zinc-500! w-2! h-2!" />
    </div>
  );
}
