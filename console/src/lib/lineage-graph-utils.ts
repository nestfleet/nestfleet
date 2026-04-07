import { type Node, type Edge } from "@xyflow/react";
import dagre from "dagre";
import type { LineageNode, LineageEdge, LineageNodeType } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const NODE_WIDTH         = 220;
const NODE_HEIGHT        = 80;
const NODE_WIDTH_COMPACT  = 180;
const NODE_HEIGHT_COMPACT = 64;

/** Side-effect node types — shown subordinated, not as core flow steps */
export const SATELLITE_NODE_TYPES = new Set<LineageNodeType>([
  "notification_sent",
  // auto_reply removed: it is a core pipeline step (routing → auto_reply → resolved),
  // not a side effect. Treating it as a satellite broke the critical path in highlight mode.
]);

/**
 * Node types whose second appearance signals a back-in-force restart.
 * When one of these appears again after being seen, a new attempt begins.
 */
const RESTART_TRIGGER_TYPES = new Set<LineageNodeType>([
  "triage",
  "routing",
  "change_request_created",
  "change_prep",
  "approval_requested",
]);

const SUCCESS_TERMINAL_TYPES = new Set<LineageNodeType>([
  "resolved", "deployed", "ci_passed", "pr_merged",
]);
const FAILURE_TERMINAL_TYPES = new Set<LineageNodeType>([
  "rejected", "deploy_failed", "ci_failed",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

export type TerminalKind = "success" | "failure" | "open";

export interface AttemptGroup {
  id:            string;
  attemptNumber: number;
  label:         string;         // "Attempt 1", "Attempt 2", …
  nodeIds:       Set<string>;
  outcome:       "success" | "failure" | "pending";
}

export interface GraphMeta {
  // ── Structure ──────────────────────────────────────────────────────────────
  rootIds:             Set<string>;
  terminalIds:         Set<string>;
  terminalKindMap:     Map<string, TerminalKind>;
  // ── Critical path ─────────────────────────────────────────────────────────
  criticalPathNodeIds: Set<string>;
  criticalPathEdgeIds: Set<string>;
  // ── Satellite nodes ────────────────────────────────────────────────────────
  satelliteNodeIds:    Set<string>;
  // ── Temporal sequence ─────────────────────────────────────────────────────
  sequenceNumbers:     Map<string, number>;   // nodeId → 1-based position
  // ── Back-in-force ─────────────────────────────────────────────────────────
  retryNodeIds:        Set<string>;           // nodes that restart the flow
  loopBackEdgeIds:     Set<string>;           // edges crossing attempt boundaries
  attemptGroups:       AttemptGroup[];        // empty when no back-in-force
}

function getTerminalKind(type: LineageNodeType): TerminalKind {
  if (SUCCESS_TERMINAL_TYPES.has(type)) return "success";
  if (FAILURE_TERMINAL_TYPES.has(type)) return "failure";
  return "open";
}

// ── Main meta computation ──────────────────────────────────────────────────────

export function computeGraphMeta(
  nodes: LineageNode[],
  edges: LineageEdge[],
): GraphMeta {
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));

  // ── 1. Roots & terminals ────────────────────────────────────────────────────
  const hasIncoming = new Set<string>();
  const hasOutgoing  = new Set<string>();
  for (const e of edges) { hasIncoming.add(e.target); hasOutgoing.add(e.source); }

  const rootIds        = new Set<string>();
  const terminalIds    = new Set<string>();
  const terminalKindMap = new Map<string, TerminalKind>();
  for (const n of nodes) {
    if (!hasIncoming.has(n.nodeId)) rootIds.add(n.nodeId);
    if (!hasOutgoing.has(n.nodeId)) {
      terminalIds.add(n.nodeId);
      terminalKindMap.set(n.nodeId, getTerminalKind(n.type));
    }
  }

  // ── 2. Temporal sequence numbers (1-based, sorted by occurredAt) ────────────
  const sorted = [...nodes].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  const sequenceNumbers = new Map<string, number>();
  sorted.forEach((n, i) => sequenceNumbers.set(n.nodeId, i + 1));

  // ── 3. Satellite nodes ───────────────────────────────────────────────────────
  const satelliteNodeIds = new Set<string>(
    nodes.filter((n) => SATELLITE_NODE_TYPES.has(n.type)).map((n) => n.nodeId),
  );

  // ── 4. Attempt groups (back-in-force detection) ──────────────────────────────
  //    Walk nodes in temporal order; when a RESTART_TRIGGER_TYPE is seen again
  //    (and is not just the first occurrence), split into a new attempt.
  const seenRestartTypes = new Set<LineageNodeType>();
  const rawAttempts: { nodeIds: Set<string> }[] = [{ nodeIds: new Set() }];

  for (const n of sorted) {
    if (
      RESTART_TRIGGER_TYPES.has(n.type) &&
      seenRestartTypes.has(n.type) &&
      !satelliteNodeIds.has(n.nodeId)
    ) {
      rawAttempts.push({ nodeIds: new Set() });
    }
    rawAttempts[rawAttempts.length - 1].nodeIds.add(n.nodeId);
    if (!satelliteNodeIds.has(n.nodeId)) seenRestartTypes.add(n.type);
  }

  // Determine outcome of each attempt
  const attemptGroups: AttemptGroup[] = rawAttempts.length > 1
    ? rawAttempts.map((a, idx) => {
        const attemptSorted = sorted.filter((n) => a.nodeIds.has(n.nodeId));
        const lastNode = attemptSorted[attemptSorted.length - 1];
        let outcome: AttemptGroup["outcome"] = "pending";
        if (lastNode) {
          if (FAILURE_TERMINAL_TYPES.has(lastNode.type)) outcome = "failure";
          else if (SUCCESS_TERMINAL_TYPES.has(lastNode.type)) outcome = "success";
        }
        return {
          id:            `attempt-group-${idx}`,
          attemptNumber: idx + 1,
          label:         `Attempt ${idx + 1}`,
          nodeIds:       a.nodeIds,
          outcome,
        };
      })
    : [];

  // ── 5. Retry nodes & loop-back edges ────────────────────────────────────────
  const retryNodeIds    = new Set<string>();
  const loopBackEdgeIds = new Set<string>();

  if (attemptGroups.length > 1) {
    // Retry nodes: appear in attempt 2+ and same type appeared in attempt 1
    const attempt1Types = new Set<LineageNodeType>(
      [...attemptGroups[0].nodeIds]
        .map((id) => nodeMap.get(id)?.type)
        .filter((t): t is LineageNodeType => t !== undefined),
    );
    for (let i = 1; i < attemptGroups.length; i++) {
      for (const nodeId of attemptGroups[i].nodeIds) {
        const n = nodeMap.get(nodeId);
        if (n && attempt1Types.has(n.type)) retryNodeIds.add(nodeId);
      }
    }

    // Loop-back edges: cross from one attempt's nodes to the next attempt's nodes
    for (let i = 0; i < attemptGroups.length - 1; i++) {
      for (const edge of edges) {
        if (
          attemptGroups[i].nodeIds.has(edge.source) &&
          attemptGroups[i + 1].nodeIds.has(edge.target)
        ) {
          loopBackEdgeIds.add(edge.id);
        }
      }
    }
  }

  // ── 6. Critical path ─────────────────────────────────────────────────────────
  const outEdges = new Map<string, LineageEdge[]>();
  for (const e of edges) {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e);
  }

  let startId: string | null = null;
  let earliestMs = Infinity;
  for (const id of rootIds) {
    const ms = new Date(nodeMap.get(id)!.occurredAt).getTime();
    if (ms < earliestMs) { earliestMs = ms; startId = id; }
  }

  let endId: string | null = null;
  let latestMs = -Infinity;
  for (const id of terminalIds) {
    const ms = new Date(nodeMap.get(id)!.occurredAt).getTime();
    if (ms > latestMs) { latestMs = ms; endId = id; }
  }

  const criticalPathNodeIds = new Set<string>();
  const criticalPathEdgeIds = new Set<string>();

  if (startId && endId) {
    let current = startId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      criticalPathNodeIds.add(current);
      if (current === endId) break;
      const nexts = outEdges.get(current) ?? [];
      if (!nexts.length) break;
      let bestEdge: LineageEdge | null = null;
      let bestMs2 = -Infinity;
      for (const edge of nexts) {
        const t = nodeMap.get(edge.target);
        if (t) {
          const ms = new Date(t.occurredAt).getTime();
          if (ms > bestMs2) { bestMs2 = ms; bestEdge = edge; }
        }
      }
      if (!bestEdge) break;
      criticalPathEdgeIds.add(bestEdge.id);
      current = bestEdge.target;
    }
    criticalPathNodeIds.add(endId);
  }

  return {
    rootIds, terminalIds, terminalKindMap,
    criticalPathNodeIds, criticalPathEdgeIds,
    satelliteNodeIds, sequenceNumbers,
    retryNodeIds, loopBackEdgeIds, attemptGroups,
  };
}

// ── Transform: LineageNode[] → React Flow Node[] ───────────────────────────────

export function toReactFlowNodes(
  nodes: LineageNode[],
  compact = false,
  meta?: GraphMeta,
  highlightMode = false,
): Node[] {
  const w = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH;
  const h = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT;

  const attemptMap = new Map<string, number>(); // nodeId → attemptNumber
  if (meta) {
    for (const g of meta.attemptGroups) {
      for (const id of g.nodeIds) attemptMap.set(id, g.attemptNumber);
    }
  }

  return nodes.map((node) => ({
    id:       node.nodeId,
    type:     "lineageNode",
    position: { x: 0, y: 0 },
    data: {
      node,
      compact,
      // Structure
      isRoot:          meta?.rootIds.has(node.nodeId)          ?? false,
      isTerminal:      meta?.terminalIds.has(node.nodeId)       ?? false,
      terminalKind:    meta?.terminalKindMap.get(node.nodeId)   ?? ("open" as TerminalKind),
      // Critical path
      onCriticalPath:  meta ? meta.criticalPathNodeIds.has(node.nodeId) : true,
      highlightMode,
      // Satellite
      isSatellite:     meta?.satelliteNodeIds.has(node.nodeId)  ?? false,
      // Sequence
      sequenceNumber:  meta?.sequenceNumbers.get(node.nodeId)   ?? 0,
      // Back-in-force
      isRetry:         meta?.retryNodeIds.has(node.nodeId)      ?? false,
      attemptNumber:   attemptMap.get(node.nodeId)              ?? 1,
    },
    width: w,
    height: h,
  }));
}

// ── Transform: LineageEdge[] → React Flow Edge[] ───────────────────────────────

const EDGE_STYLES: Record<LineageEdge["edgeType"], React.CSSProperties> = {
  default: { stroke: "#71717a", strokeWidth: 1.5 },
  success: { stroke: "#22c55e", strokeWidth: 2 },
  failure: { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5 5" },
  branch:  { stroke: "#a78bfa", strokeWidth: 1.5 },
};

const LABEL_BG_COLORS: Record<LineageEdge["edgeType"], string> = {
  default: "#27272a",
  success: "#14532d",
  failure: "#450a0a",
  branch:  "#2e1065",
};

function formatDeltaMs(ms: number): string {
  if (ms < 1000) return "< 1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function toReactFlowEdges(
  edges: LineageEdge[],
  nodeTimeIndex: Map<string, number> = new Map(),
  disableAnimation = false,
  meta?: GraphMeta,
  highlightMode = false,
): Edge[] {
  return edges.map((edge) => {
    const isLoopBack    = meta?.loopBackEdgeIds.has(edge.id)    ?? false;
    const isToSatellite = meta?.satelliteNodeIds.has(edge.target) ?? false;
    const onCriticalPath = meta ? meta.criticalPathEdgeIds.has(edge.id) : true;
    const dimmed  = highlightMode && !onCriticalPath && !isLoopBack;
    const boosted = highlightMode && onCriticalPath;

    // Timing label
    const sourceMs = nodeTimeIndex.get(edge.source);
    const targetMs = nodeTimeIndex.get(edge.target);
    const timingLabel =
      sourceMs !== undefined && targetMs !== undefined && targetMs > sourceMs
        ? formatDeltaMs(targetMs - sourceMs)
        : undefined;

    // Loop-back edges always show ↺
    const label = isLoopBack ? "↺ back-in-force" : (edge.label ?? timingLabel);

    // Style resolution
    let style: React.CSSProperties;
    if (isLoopBack) {
      style = { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "6 3" };
    } else if (dimmed) {
      style = { ...EDGE_STYLES[edge.edgeType], opacity: 0.12 };
    } else if (boosted) {
      style = { stroke: "#e4e4e7", strokeWidth: 2.5 };
    } else if (isToSatellite) {
      style = { stroke: "#52525b", strokeWidth: 1, strokeDasharray: "3 3", opacity: 0.6 };
    } else {
      style = EDGE_STYLES[edge.edgeType];
    }

    const labelFill   = dimmed ? "transparent" : isLoopBack ? "#f59e0b" : "#a1a1aa";
    const labelBgFill = dimmed ? "transparent" : isLoopBack ? "#431407" : LABEL_BG_COLORS[edge.edgeType];

    return {
      id:     edge.id,
      source: edge.source,
      target: edge.target,
      ...(label !== undefined ? { label } : {}),
      labelStyle:     { fill: labelFill, fontSize: 10, fontWeight: isLoopBack ? 600 : 400 },
      labelBgStyle:   { fill: labelBgFill, rx: 4, ry: 4 },
      labelBgPadding: [4, 6] as [number, number],
      style,
      animated: (disableAnimation || highlightMode || isLoopBack || isToSatellite)
        ? false
        : edge.edgeType === "default",
    };
  });
}

// ── Dagre layout ───────────────────────────────────────────────────────────────

export function layoutGraph(nodes: Node[], edges: Edge[], compact = false): Node[] {
  const w = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH;
  const h = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: compact ? 30 : 50,
    ranksep: compact ? 100 : 140,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) g.setNode(node.id, { width: w, height: h });
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: (pos?.x ?? 0) - w / 2, y: (pos?.y ?? 0) - h / 2 } };
  });
}

// ── Attempt frame injection (runs AFTER layoutGraph) ──────────────────────────

const FRAME_PADDING = 28;

/**
 * Computes translucent background frame nodes for each attempt group.
 * Must be called AFTER layoutGraph so positions are known.
 * Returns frame nodes to PREPEND to the node list (renders behind regular nodes).
 */
export function buildAttemptFrameNodes(
  positionedNodes: Node[],
  attemptGroups: AttemptGroup[],
  compact: boolean,
): Node[] {
  if (attemptGroups.length < 2) return [];

  const nw = compact ? NODE_WIDTH_COMPACT : NODE_WIDTH;
  const nh = compact ? NODE_HEIGHT_COMPACT : NODE_HEIGHT;

  const posMap = new Map(positionedNodes.map((n) => [n.id, n.position]));

  const frames: Array<Node | null> = attemptGroups.map((group) => {
    const groupPositions = [...group.nodeIds]
      .map((id) => posMap.get(id))
      .filter((p): p is { x: number; y: number } => p !== undefined);

    if (groupPositions.length === 0) return null;

    const xs = groupPositions.map((p) => p.x);
    const ys = groupPositions.map((p) => p.y);
    const x = Math.min(...xs) - FRAME_PADDING;
    const y = Math.min(...ys) - FRAME_PADDING - 18; // extra top room for label
    const w = Math.max(...xs) + nw - x + FRAME_PADDING;
    const h = Math.max(...ys) + nh - y + FRAME_PADDING;

    return {
      id:       group.id,
      type:     "attemptFrame",
      position: { x, y },
      data:     { label: group.label, outcome: group.outcome, width: w, height: h },
      width:    w,
      height:   h,
      selectable: false,
      draggable:  false,
      focusable:  false,
      style:      { zIndex: -10, pointerEvents: "none" as const },
    } satisfies Node;
  });
  return frames.filter((n): n is Node => n !== null);
}
