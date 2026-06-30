// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useMemo, useState, useCallback, useDeferredValue } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LineageNode, LineageNodeType, LineageResponse } from "@/lib/types";
import {
  toReactFlowNodes,
  toReactFlowEdges,
  layoutGraph,
  computeGraphMeta,
  buildAttemptFrameNodes,
} from "@/lib/lineage-graph-utils";
import { LineageGraphNode, AttemptFrameNode } from "./LineageGraphNode";
import { NodeDetailPanel } from "./NodeDetailPanel";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface LineageGraphProps {
  response: LineageResponse;
  productId: string;
  onActionComplete: () => void;
}

// ── Filter types ───────────────────────────────────────────────────────────────

type ActorFilter    = "all" | "agent" | "human" | "system";
type NodeGroupFilter = "all" | "agent_events" | "human_decisions" | "notifications" | "ci_deploy";

const NODE_GROUP_MAP: Record<NodeGroupFilter, Set<LineageNodeType>> = {
  all:              new Set(),
  agent_events:     new Set(["triage", "known_issue_match", "routing", "change_prep", "auto_reply"]),
  human_decisions:  new Set(["approved", "rejected", "escalated", "resolved"]),
  notifications:    new Set(["notification_sent"]),
  ci_deploy:        new Set(["pr_drafted", "pr_merged", "ci_passed", "ci_failed", "deployed", "deploy_failed"]),
};

// ── Custom node type registry ──────────────────────────────────────────────────

const nodeTypes = {
  lineageNode:  LineageGraphNode,
  attemptFrame: AttemptFrameNode,
};

// ── Component ──────────────────────────────────────────────────────────────────

export function LineageGraph({ response, productId, onActionComplete }: LineageGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [actorFilter,    setActorFilter]    = useState<ActorFilter>("all");
  const [groupFilter,    setGroupFilter]    = useState<NodeGroupFilter>("all");
  const [highlightPath,  setHighlightPath]  = useState(false);

  const isLargeGraph = response.nodes.length > 30;
  const compact      = isLargeGraph;

  // ── Deferred response: paint shell first, layout after ──────────────────────
  const deferredResponse = useDeferredValue(response);
  const isStale = deferredResponse !== response;

  // ── Filter (on deferred data) ────────────────────────────────────────────────
  const filteredNodes = useMemo<LineageNode[]>(() => {
    return deferredResponse.nodes.filter((n) => {
      if (actorFilter !== "all" && n.actorType !== actorFilter) return false;
      if (groupFilter !== "all") {
        if (!NODE_GROUP_MAP[groupFilter].has(n.type)) return false;
      }
      return true;
    });
  }, [deferredResponse.nodes, actorFilter, groupFilter]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.nodeId)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () => (deferredResponse.edges ?? []).filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    ),
    [deferredResponse.edges, filteredNodeIds],
  );

  // ── Graph meta (roots, terminals, critical path, satellites, attempts) ───────
  const graphMeta = useMemo(
    () => computeGraphMeta(filteredNodes, filteredEdges),
    [filteredNodes, filteredEdges],
  );

  // ── React Flow nodes + edges + attempt frames ─────────────────────────────────
  const { rfNodes, rfEdges } = useMemo(() => {
    const nodeTimeIndex = new Map<string, number>(
      filteredNodes.map((n) => [n.nodeId, new Date(n.occurredAt).getTime()]),
    );

    const raw      = toReactFlowNodes(filteredNodes, compact, graphMeta, highlightPath);
    const edges    = toReactFlowEdges(filteredEdges, nodeTimeIndex, isLargeGraph, graphMeta, highlightPath);
    const regular  = layoutGraph(raw, edges, compact);

    // Inject attempt frame nodes AFTER layout (needs positions)
    const frames   = buildAttemptFrameNodes(regular, graphMeta.attemptGroups, compact);

    // Frames prepended so they render behind regular nodes
    return { rfNodes: [...frames, ...regular], rfEdges: edges };
  }, [filteredNodes, filteredEdges, compact, isLargeGraph, graphMeta, highlightPath]);

  // ── Selection ─────────────────────────────────────────────────────────────────
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return response.nodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  }, [selectedNodeId, response.nodes]);

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node: Node) => {
    // Ignore clicks on frame nodes
    if (node.type === "attemptFrame") return;
    setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId]);

  const handlePaneClick = useCallback(() => setSelectedNodeId(null), []);

  // ── Filter badge count ────────────────────────────────────────────────────────
  const activeFilters = (actorFilter !== "all" ? 1 : 0) + (groupFilter !== "all" ? 1 : 0);
  const hasAttempts   = graphMeta.attemptGroups.length > 1;

  return (
    <div className="space-y-2">
      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Actor filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5">
          <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value as ActorFilter)}
            className="border-0 bg-transparent text-xs text-zinc-300 focus:outline-hidden focus:ring-0 pr-1"
          >
            <option value="all">All actors</option>
            <option value="agent">Agent only</option>
            <option value="human">Human only</option>
            <option value="system">System only</option>
          </select>
        </div>

        {/* Node group filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5">
          <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as NodeGroupFilter)}
            className="border-0 bg-transparent text-xs text-zinc-300 focus:outline-hidden focus:ring-0 pr-1"
          >
            <option value="all">All events</option>
            <option value="agent_events">Agent events</option>
            <option value="human_decisions">Human decisions</option>
            <option value="notifications">Notifications</option>
            <option value="ci_deploy">CI / Deploy</option>
          </select>
        </div>

        {/* Main route toggle */}
        <button
          onClick={() => setHighlightPath((v) => !v)}
          className={[
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            highlightPath
              ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-300"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 12l4-4m-4 4l4 4m10-4l4-4m-4 4l4 4" />
          </svg>
          Main route
          {highlightPath && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />}
        </button>

        {/* Back-in-force indicator (shown only when attempts exist) */}
        {hasAttempts && (
          <span className="flex items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-400">
            <span className="text-sm leading-none">↺</span>
            {graphMeta.attemptGroups.length} attempts
          </span>
        )}

        {/* Clear filters */}
        {activeFilters > 0 && (
          <button
            onClick={() => { setActorFilter("all"); setGroupFilter("all"); }}
            className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-1 text-xs text-indigo-300 hover:bg-indigo-500/30 transition-colors"
          >
            {activeFilters} filter{activeFilters > 1 ? "s" : ""} active
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Node count + stale */}
        <span className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
          {isStale && (
            <span className="flex items-center gap-1 text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
              Updating…
            </span>
          )}
          {filteredNodes.length} / {response.nodes.length} node{response.nodes.length !== 1 ? "s" : ""}
          {isLargeGraph && <span className="text-zinc-700">(compact)</span>}
        </span>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Start
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-xs ring-1 ring-emerald-500/70 bg-transparent" /> End ✓
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-xs ring-1 ring-red-500/70 bg-transparent" /> End ✗
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-xs ring-1 ring-amber-500/50 bg-transparent" /> In progress
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-xs border border-dashed border-zinc-600/50 bg-transparent" /> Side effect
        </span>
        {hasAttempts && (
          <span className="flex items-center gap-1 text-amber-600/70">
            <span className="text-xs">↺</span> Back-in-force
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-zinc-600">1</span> Sequence order
        </span>
      </div>

      {/* ── Graph canvas ──────────────────────────────────────────────────── */}
      <div className="flex h-[560px] rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">

        <div className="flex-1 relative">
          {filteredNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500">No nodes match the current filters.</p>
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              className="bg-zinc-950"
              nodesDraggable={!isLargeGraph}
            >
              <Background variant={"dots" as never} gap={compact ? 12 : 16} size={1} color="#3f3f46" />
              <Controls className="bg-zinc-800! border-zinc-700! shadow-lg! [&>button]:bg-zinc-800! [&>button]:border-zinc-700! [&>button]:text-zinc-400! [&>button:hover]:bg-zinc-700!" />
              <MiniMap
                className="bg-zinc-800! border-zinc-700!"
                nodeColor={(node) => {
                  if (node.type === "attemptFrame") return "transparent";
                  const d = node.data as Record<string, unknown>;
                  if (highlightPath && d.onCriticalPath === false) return "#3f3f46";
                  if (d.isTerminal) {
                    const k = d.terminalKind as string;
                    return k === "success" ? "#10b981" : k === "failure" ? "#ef4444" : "#f59e0b";
                  }
                  if (d.isSatellite) return "#3f3f46";
                  if (d.isRoot) return "#71717a";
                  return "#6366f1";
                }}
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Detail panel — click any node to open, frame clicks are ignored */}
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            changeRequests={response.changeRequests}
            productId={productId}
            caseId={response.caseId}
            onClose={() => setSelectedNodeId(null)}
            onActionComplete={onActionComplete}
          />
        )}
      </div>
    </div>
  );
}
