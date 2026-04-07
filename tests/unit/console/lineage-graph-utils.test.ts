/**
 * Unit tests: computeGraphMeta — lineage-graph-utils.ts
 *
 * Tests the pure graph-analysis function in isolation. All module dependencies
 * that require React, browser APIs, or layout engines are mocked so this file
 * runs cleanly under the backend vitest config (node environment, no DOM).
 *
 * Coverage groups
 *   NF-UNIT-LGU-01  Empty graph
 *   NF-UNIT-LGU-02  Single node
 *   NF-UNIT-LGU-03  Linear chain
 *   NF-UNIT-LGU-04  Terminal kinds
 *   NF-UNIT-LGU-05  Satellite identification
 *   NF-UNIT-LGU-06  Sequence numbers
 *   NF-UNIT-LGU-07  No attempts when each trigger type appears once
 *   NF-UNIT-LGU-08  Back-in-force: single trigger repeats
 *   NF-UNIT-LGU-09  Back-in-force: multiple different triggers repeat
 *   NF-UNIT-LGU-10  Attempt outcome — failure
 *   NF-UNIT-LGU-11  Attempt outcome — success
 *   NF-UNIT-LGU-12  Attempt outcome — pending
 *   NF-UNIT-LGU-13  Retry node identification
 *   NF-UNIT-LGU-14  Loop-back edge identification
 *   NF-UNIT-LGU-15  Critical path — linear graph
 *   NF-UNIT-LGU-16  Critical path — fork picks latest terminal
 *   NF-UNIT-LGU-17  Critical path — isolated terminal included
 *   NF-UNIT-LGU-18  Satellite nodes excluded from restart detection
 *   NF-UNIT-LGU-19  Satellite nodes excluded from roots/terminals logic
 *   NF-UNIT-LGU-20  Attempt group ids and labels
 *   NF-UNIT-LGU-21  Multiple attempts produce attempt-group arrays of correct length
 *   NF-UNIT-LGU-22  Nodes with no edges are both roots and terminals
 *   NF-UNIT-LGU-23  Mixed full scenario
 */

// ── Module mocks (must be hoisted before any imports) ──────────────────────────

vi.mock("@xyflow/react", () => ({
  // Only the types from this module are consumed by lineage-graph-utils.ts.
  // No runtime values are referenced, so an empty object is sufficient.
}))

vi.mock("dagre", () => ({
  // dagre is only used inside layoutGraph(), which is NOT under test here.
  // Providing a minimal shape prevents import-time crashes.
  default: {
    graphlib: {
      Graph: class MockGraph {
        setDefaultEdgeLabel() {}
        setGraph() {}
        setNode() {}
        setEdge() {}
        node() { return { x: 0, y: 0 } }
      },
    },
    layout() {},
  },
}))

// @/lib/types is consumed only as TypeScript types (erased at runtime).
// An empty mock satisfies the module resolver without shipping any values.
vi.mock("@/lib/types", () => ({}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest"
import { computeGraphMeta, SATELLITE_NODE_TYPES } from "../../../console/src/lib/lineage-graph-utils.js"
import type { LineageNode, LineageEdge, LineageNodeType } from "../../../console/src/lib/types.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Re-export the type so test helpers below can use it without referencing the
 *  (mocked) @/lib/types alias — they're identical shapes. */
type LNode = LineageNode
type LEdge = LineageEdge

function makeNode(
  id: string,
  type: LineageNodeType,
  occurredAt: string,
  actorType: "agent" | "human" | "system" = "agent",
): LNode {
  return {
    nodeId: id,
    type,
    occurredAt,
    actorType,
    actorRef: "actor-ref",
    action: "action",
    title: "Test Node",
    summary: "",
    metadata: {},
    agentRun: null,
    availableActions: [],
  }
}

function makeEdge(
  source: string,
  target: string,
  edgeType: LEdge["edgeType"] = "default",
): LEdge {
  return { id: `edge-${source}-${target}`, source, target, edgeType }
}

// ── NF-UNIT-LGU-01: Empty graph ───────────────────────────────────────────────

describe("computeGraphMeta — empty graph (NF-UNIT-LGU-01)", () => {
  it("returns empty sets and maps when there are no nodes or edges", () => {
    const meta = computeGraphMeta([], [])

    expect(meta.rootIds.size).toBe(0)
    expect(meta.terminalIds.size).toBe(0)
    expect(meta.terminalKindMap.size).toBe(0)
    expect(meta.satelliteNodeIds.size).toBe(0)
    expect(meta.sequenceNumbers.size).toBe(0)
    expect(meta.retryNodeIds.size).toBe(0)
    expect(meta.loopBackEdgeIds.size).toBe(0)
    expect(meta.attemptGroups).toHaveLength(0)
    expect(meta.criticalPathNodeIds.size).toBe(0)
    expect(meta.criticalPathEdgeIds.size).toBe(0)
  })
})

// ── NF-UNIT-LGU-02: Single node ──────────────────────────────────────────────

describe("computeGraphMeta — single node (NF-UNIT-LGU-02)", () => {
  const nodes = [makeNode("n1", "signal_received", "2024-01-01T00:00:00Z")]
  const meta  = computeGraphMeta(nodes, [])

  it("the only node is both root and terminal", () => {
    expect(meta.rootIds.has("n1")).toBe(true)
    expect(meta.terminalIds.has("n1")).toBe(true)
  })

  it("receives sequence number 1", () => {
    expect(meta.sequenceNumbers.get("n1")).toBe(1)
  })

  it("is on the critical path", () => {
    expect(meta.criticalPathNodeIds.has("n1")).toBe(true)
  })

  it("has no attempt groups", () => {
    expect(meta.attemptGroups).toHaveLength(0)
  })
})

// ── NF-UNIT-LGU-03: Linear chain ─────────────────────────────────────────────

describe("computeGraphMeta — linear chain (NF-UNIT-LGU-03)", () => {
  // signal → case_created → triage → routing → resolved
  const nodes = [
    makeNode("n1", "signal_received",  "2024-01-01T00:01:00Z"),
    makeNode("n2", "case_created",     "2024-01-01T00:02:00Z"),
    makeNode("n3", "triage",           "2024-01-01T00:03:00Z"),
    makeNode("n4", "routing",          "2024-01-01T00:04:00Z"),
    makeNode("n5", "resolved",         "2024-01-01T00:05:00Z"),
  ]
  const edges = [
    makeEdge("n1", "n2"),
    makeEdge("n2", "n3"),
    makeEdge("n3", "n4"),
    makeEdge("n4", "n5"),
  ]
  const meta = computeGraphMeta(nodes, edges)

  it("identifies only the first node as root", () => {
    expect(meta.rootIds.size).toBe(1)
    expect(meta.rootIds.has("n1")).toBe(true)
  })

  it("identifies only the last node as terminal", () => {
    expect(meta.terminalIds.size).toBe(1)
    expect(meta.terminalIds.has("n5")).toBe(true)
  })

  it("all five nodes are on the critical path", () => {
    expect(meta.criticalPathNodeIds.size).toBe(5)
    for (const id of ["n1", "n2", "n3", "n4", "n5"]) {
      expect(meta.criticalPathNodeIds.has(id)).toBe(true)
    }
  })

  it("all four edges are critical-path edges", () => {
    expect(meta.criticalPathEdgeIds.size).toBe(4)
  })
})

// ── NF-UNIT-LGU-04: Terminal kinds ───────────────────────────────────────────

describe("computeGraphMeta — terminal kinds (NF-UNIT-LGU-04)", () => {
  it("resolved → success", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "resolved", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("success")
  })

  it("deployed → success", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "deployed", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("success")
  })

  it("ci_passed → success", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "ci_passed", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("success")
  })

  it("pr_merged → success", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "pr_merged", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("success")
  })

  it("rejected → failure", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "rejected", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("failure")
  })

  it("deploy_failed → failure", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "deploy_failed", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("failure")
  })

  it("ci_failed → failure", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "ci_failed", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("failure")
  })

  it("system_event → open (not success or failure)", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "system_event", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("open")
  })

  it("routing (mid-flow, in-progress) → open", () => {
    const meta = computeGraphMeta(
      [makeNode("n1", "routing", "2024-01-01T00:00:00Z")], []
    )
    expect(meta.terminalKindMap.get("n1")).toBe("open")
  })
})

// ── NF-UNIT-LGU-05: Satellite identification ─────────────────────────────────

describe("computeGraphMeta — satellite nodes (NF-UNIT-LGU-05)", () => {
  it("notification_sent is a satellite", () => {
    const nodes = [
      makeNode("n1", "resolved",          "2024-01-01T00:01:00Z"),
      makeNode("n2", "notification_sent", "2024-01-01T00:02:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [makeEdge("n1", "n2")])
    expect(meta.satelliteNodeIds.has("n2")).toBe(true)
    expect(meta.satelliteNodeIds.has("n1")).toBe(false)
  })

  it("auto_reply is NOT a satellite — it is a core pipeline step (routing → auto_reply → resolved)", () => {
    // auto_reply was intentionally removed from SATELLITE_NODE_TYPES because treating it
    // as a side-effect broke the critical path highlight for auto-resolved cases.
    const nodes = [
      makeNode("n1", "routing",    "2024-01-01T00:01:00Z"),
      makeNode("n2", "auto_reply", "2024-01-01T00:02:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [makeEdge("n1", "n2")])
    expect(meta.satelliteNodeIds.has("n2")).toBe(false)
  })

  it("SATELLITE_NODE_TYPES export contains exactly notification_sent", () => {
    expect(SATELLITE_NODE_TYPES.has("notification_sent")).toBe(true)
    expect(SATELLITE_NODE_TYPES.has("auto_reply")).toBe(false)
    expect(SATELLITE_NODE_TYPES.size).toBe(1)
  })
})

// ── NF-UNIT-LGU-06: Sequence numbers ─────────────────────────────────────────

describe("computeGraphMeta — sequence numbers (NF-UNIT-LGU-06)", () => {
  it("assigns 1-based positions sorted by occurredAt, regardless of input order", () => {
    // Input order is intentionally reversed relative to chronological order.
    const nodes = [
      makeNode("n3", "routing",          "2024-01-01T00:03:00Z"),
      makeNode("n1", "signal_received",  "2024-01-01T00:01:00Z"),
      makeNode("n2", "case_created",     "2024-01-01T00:02:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])

    expect(meta.sequenceNumbers.get("n1")).toBe(1)
    expect(meta.sequenceNumbers.get("n2")).toBe(2)
    expect(meta.sequenceNumbers.get("n3")).toBe(3)
  })

  it("ties in occurredAt produce a deterministic monotonic range (1..N)", () => {
    const nodes = [
      makeNode("a", "triage",   "2024-01-01T00:01:00Z"),
      makeNode("b", "routing",  "2024-01-01T00:01:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    const nums = [...meta.sequenceNumbers.values()].sort()
    expect(nums).toEqual([1, 2])
  })
})

// ── NF-UNIT-LGU-07: No attempts when trigger types appear only once ───────────

describe("computeGraphMeta — no back-in-force when triggers appear once (NF-UNIT-LGU-07)", () => {
  it("each RESTART_TRIGGER_TYPE appears exactly once → no attempt groups", () => {
    const nodes = [
      makeNode("n1", "triage",                   "2024-01-01T00:01:00Z"),
      makeNode("n2", "routing",                  "2024-01-01T00:02:00Z"),
      makeNode("n3", "change_request_created",   "2024-01-01T00:03:00Z"),
      makeNode("n4", "change_prep",              "2024-01-01T00:04:00Z"),
      makeNode("n5", "approval_requested",       "2024-01-01T00:05:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups).toHaveLength(0)
    expect(meta.retryNodeIds.size).toBe(0)
    expect(meta.loopBackEdgeIds.size).toBe(0)
  })
})

// ── NF-UNIT-LGU-08: Back-in-force — single trigger repeats ───────────────────

describe("computeGraphMeta — back-in-force with single trigger (NF-UNIT-LGU-08)", () => {
  // signal → triage1 → rejected → triage2 → resolved
  // triage appearing a second time triggers a new attempt
  const nodes = [
    makeNode("n1", "signal_received", "2024-01-01T00:01:00Z"),
    makeNode("n2", "triage",          "2024-01-01T00:02:00Z"),
    makeNode("n3", "rejected",        "2024-01-01T00:03:00Z"),
    makeNode("n4", "triage",          "2024-01-01T00:04:00Z"),
    makeNode("n5", "resolved",        "2024-01-01T00:05:00Z"),
  ]
  const edges = [
    makeEdge("n1", "n2"),
    makeEdge("n2", "n3"),
    makeEdge("n3", "n4"),
    makeEdge("n4", "n5"),
  ]
  const meta = computeGraphMeta(nodes, edges)

  it("produces exactly 2 attempt groups", () => {
    expect(meta.attemptGroups).toHaveLength(2)
  })

  it("attempt 1 contains n1, n2, n3 and attempt 2 contains n4, n5", () => {
    const [a1, a2] = meta.attemptGroups
    expect(a1.nodeIds.has("n1")).toBe(true)
    expect(a1.nodeIds.has("n2")).toBe(true)
    expect(a1.nodeIds.has("n3")).toBe(true)
    expect(a2.nodeIds.has("n4")).toBe(true)
    expect(a2.nodeIds.has("n5")).toBe(true)
  })

  it("attempt 1 ends with rejected → outcome = failure", () => {
    expect(meta.attemptGroups[0].outcome).toBe("failure")
  })

  it("attempt 2 ends with resolved → outcome = success", () => {
    expect(meta.attemptGroups[1].outcome).toBe("success")
  })
})

// ── NF-UNIT-LGU-09: Back-in-force — multiple different triggers repeat ────────

describe("computeGraphMeta — back-in-force with multiple triggers (NF-UNIT-LGU-09)", () => {
  // routing appears twice; change_prep appears twice → two split points → 3 attempts
  const nodes = [
    makeNode("n1", "routing",     "2024-01-01T00:01:00Z"),
    makeNode("n2", "change_prep", "2024-01-01T00:02:00Z"),
    makeNode("n3", "routing",     "2024-01-01T00:03:00Z"),
    makeNode("n4", "change_prep", "2024-01-01T00:04:00Z"),
    makeNode("n5", "resolved",    "2024-01-01T00:05:00Z"),
  ]
  const meta = computeGraphMeta(nodes, [])

  it("produces 3 attempt groups when two different triggers each repeat once", () => {
    expect(meta.attemptGroups).toHaveLength(3)
  })

  it("attempt numbers are sequential starting at 1", () => {
    const numbers = meta.attemptGroups.map((g) => g.attemptNumber)
    expect(numbers).toEqual([1, 2, 3])
  })
})

// ── NF-UNIT-LGU-10: Attempt outcome — failure ────────────────────────────────

describe("computeGraphMeta — attempt outcome failure (NF-UNIT-LGU-10)", () => {
  it("last node of type deploy_failed produces outcome=failure", () => {
    const nodes = [
      makeNode("n1", "routing",      "2024-01-01T00:01:00Z"),
      makeNode("n2", "deploy_failed","2024-01-01T00:02:00Z"),
      makeNode("n3", "routing",      "2024-01-01T00:03:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups[0].outcome).toBe("failure")
  })

  it("last node of type ci_failed produces outcome=failure", () => {
    const nodes = [
      makeNode("n1", "triage",    "2024-01-01T00:01:00Z"),
      makeNode("n2", "ci_failed", "2024-01-01T00:02:00Z"),
      makeNode("n3", "triage",    "2024-01-01T00:03:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups[0].outcome).toBe("failure")
  })
})

// ── NF-UNIT-LGU-11: Attempt outcome — success ────────────────────────────────

describe("computeGraphMeta — attempt outcome success (NF-UNIT-LGU-11)", () => {
  it("last node of type ci_passed produces outcome=success", () => {
    const nodes = [
      makeNode("n1", "routing",   "2024-01-01T00:01:00Z"),
      makeNode("n2", "ci_passed", "2024-01-01T00:02:00Z"),
      makeNode("n3", "routing",   "2024-01-01T00:03:00Z"),
      makeNode("n4", "resolved",  "2024-01-01T00:04:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups[0].outcome).toBe("success")
  })

  it("last node of type pr_merged produces outcome=success", () => {
    const nodes = [
      makeNode("n1", "triage",    "2024-01-01T00:01:00Z"),
      makeNode("n2", "pr_merged", "2024-01-01T00:02:00Z"),
      makeNode("n3", "triage",    "2024-01-01T00:03:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups[0].outcome).toBe("success")
  })
})

// ── NF-UNIT-LGU-12: Attempt outcome — pending ────────────────────────────────

describe("computeGraphMeta — attempt outcome pending (NF-UNIT-LGU-12)", () => {
  it("last node is routing (not a terminal type) → outcome=pending", () => {
    const nodes = [
      makeNode("n1", "triage",  "2024-01-01T00:01:00Z"),
      makeNode("n2", "routing", "2024-01-01T00:02:00Z"),
      makeNode("n3", "triage",  "2024-01-01T00:03:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    // Attempt 1 contains n1, n2; last in sorted order is n2 (routing) → pending
    expect(meta.attemptGroups[0].outcome).toBe("pending")
  })
})

// ── NF-UNIT-LGU-13: Retry node identification ────────────────────────────────

describe("computeGraphMeta — retry nodes (NF-UNIT-LGU-13)", () => {
  // triage appears in both attempts → attempt-2 triage is a retry node
  const nodes = [
    makeNode("n1", "signal_received", "2024-01-01T00:01:00Z"),
    makeNode("n2", "triage",          "2024-01-01T00:02:00Z"),  // attempt 1
    makeNode("n3", "rejected",        "2024-01-01T00:03:00Z"),
    makeNode("n4", "triage",          "2024-01-01T00:04:00Z"),  // attempt 2 — retry
    makeNode("n5", "resolved",        "2024-01-01T00:05:00Z"),
  ]
  const meta = computeGraphMeta(nodes, [])

  it("marks the second triage as a retry node", () => {
    expect(meta.retryNodeIds.has("n4")).toBe(true)
  })

  it("does not mark the first triage as a retry node", () => {
    expect(meta.retryNodeIds.has("n2")).toBe(false)
  })

  it("nodes with no type match in attempt 1 are not retry nodes", () => {
    // resolved (n5) is not in attempt 1, so it should not be a retry
    expect(meta.retryNodeIds.has("n5")).toBe(false)
  })
})

// ── NF-UNIT-LGU-14: Loop-back edge identification ────────────────────────────

describe("computeGraphMeta — loop-back edges (NF-UNIT-LGU-14)", () => {
  const nodes = [
    makeNode("n1", "signal_received", "2024-01-01T00:01:00Z"),
    makeNode("n2", "triage",          "2024-01-01T00:02:00Z"),
    makeNode("n3", "rejected",        "2024-01-01T00:03:00Z"),
    makeNode("n4", "triage",          "2024-01-01T00:04:00Z"),
    makeNode("n5", "resolved",        "2024-01-01T00:05:00Z"),
  ]
  const crossAttemptEdge = makeEdge("n3", "n4")  // attempt1 → attempt2
  const internalEdge     = makeEdge("n4", "n5")  // within attempt2
  const edges = [
    makeEdge("n1", "n2"),
    makeEdge("n2", "n3"),
    crossAttemptEdge,
    internalEdge,
  ]
  const meta = computeGraphMeta(nodes, edges)

  it("the edge crossing from attempt 1 to attempt 2 is a loop-back edge", () => {
    expect(meta.loopBackEdgeIds.has(crossAttemptEdge.id)).toBe(true)
  })

  it("edges within the same attempt are not loop-back edges", () => {
    expect(meta.loopBackEdgeIds.has(internalEdge.id)).toBe(false)
  })
})

// ── NF-UNIT-LGU-15: Critical path — linear graph ─────────────────────────────

describe("computeGraphMeta — critical path linear (NF-UNIT-LGU-15)", () => {
  it("every node in a chain of length N is on the critical path", () => {
    const nodes = [
      makeNode("a", "signal_received", "2024-01-01T00:01:00Z"),
      makeNode("b", "triage",          "2024-01-01T00:02:00Z"),
      makeNode("c", "routing",         "2024-01-01T00:03:00Z"),
      makeNode("d", "resolved",        "2024-01-01T00:04:00Z"),
    ]
    const edges = [makeEdge("a","b"), makeEdge("b","c"), makeEdge("c","d")]
    const meta = computeGraphMeta(nodes, edges)

    expect([...meta.criticalPathNodeIds]).toHaveLength(4)
    expect([...meta.criticalPathEdgeIds]).toHaveLength(3)
  })
})

// ── NF-UNIT-LGU-16: Critical path — fork picks latest terminal ───────────────

describe("computeGraphMeta — critical path fork (NF-UNIT-LGU-16)", () => {
  // root → fork → branch_a (ends at T+3)
  //             → branch_b (ends at T+10, latest)
  // The critical path should follow branch_b.
  const nodes = [
    makeNode("root",     "signal_received", "2024-01-01T00:00:00Z"),
    makeNode("fork",     "triage",          "2024-01-01T00:01:00Z"),
    makeNode("branch_a", "rejected",        "2024-01-01T00:03:00Z"),  // earlier terminal
    makeNode("branch_b", "resolved",        "2024-01-01T00:10:00Z"),  // latest terminal
  ]
  const edges = [
    makeEdge("root",  "fork"),
    makeEdge("fork",  "branch_a"),
    makeEdge("fork",  "branch_b"),
  ]
  const meta = computeGraphMeta(nodes, edges)

  it("the later terminal (branch_b) is on the critical path", () => {
    expect(meta.criticalPathNodeIds.has("branch_b")).toBe(true)
  })

  it("the earlier terminal (branch_a) is NOT on the critical path", () => {
    expect(meta.criticalPathNodeIds.has("branch_a")).toBe(false)
  })

  it("root and fork are on the critical path", () => {
    expect(meta.criticalPathNodeIds.has("root")).toBe(true)
    expect(meta.criticalPathNodeIds.has("fork")).toBe(true)
  })

  it("the edge to branch_b is a critical-path edge", () => {
    expect(meta.criticalPathEdgeIds.has("edge-fork-branch_b")).toBe(true)
  })

  it("the edge to branch_a is not a critical-path edge", () => {
    expect(meta.criticalPathEdgeIds.has("edge-fork-branch_a")).toBe(false)
  })
})

// ── NF-UNIT-LGU-17: Critical path — isolated terminal always included ─────────

describe("computeGraphMeta — isolated terminal on critical path (NF-UNIT-LGU-17)", () => {
  it("endId is always added to criticalPathNodeIds even if the walker stops early", () => {
    // Two independent nodes — root is earliest, terminal is latest.
    const nodes = [
      makeNode("alpha", "signal_received", "2024-01-01T00:00:00Z"),
      makeNode("beta",  "resolved",        "2024-01-01T00:05:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    // No edges means the walker from alpha finds no outgoing edges and stops,
    // but endId (beta) is unconditionally added.
    expect(meta.criticalPathNodeIds.has("alpha")).toBe(true)
    expect(meta.criticalPathNodeIds.has("beta")).toBe(true)
  })
})

// ── NF-UNIT-LGU-18: Satellite nodes excluded from restart detection ───────────

describe("computeGraphMeta — satellite nodes skip restart detection (NF-UNIT-LGU-18)", () => {
  it("auto_reply appearing more than once does NOT trigger a new attempt", () => {
    const nodes = [
      makeNode("n1", "triage",      "2024-01-01T00:01:00Z"),
      makeNode("n2", "auto_reply",  "2024-01-01T00:02:00Z"),
      makeNode("n3", "auto_reply",  "2024-01-01T00:03:00Z"),  // second auto_reply
      makeNode("n4", "resolved",    "2024-01-01T00:04:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    // auto_reply is not in RESTART_TRIGGER_TYPES, so no split regardless
    expect(meta.attemptGroups).toHaveLength(0)
  })

  it("notification_sent appearing more than once does NOT trigger a new attempt", () => {
    const nodes = [
      makeNode("n1", "routing",           "2024-01-01T00:01:00Z"),
      makeNode("n2", "notification_sent", "2024-01-01T00:02:00Z"),
      makeNode("n3", "notification_sent", "2024-01-01T00:03:00Z"),
      makeNode("n4", "resolved",          "2024-01-01T00:04:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups).toHaveLength(0)
  })
})

// ── NF-UNIT-LGU-19: Satellite nodes are roots/terminals if at graph boundary ──

describe("computeGraphMeta — satellite nodes at graph boundary (NF-UNIT-LGU-19)", () => {
  it("a satellite with no outgoing edge is still a terminal node", () => {
    const nodes = [
      makeNode("n1", "resolved",          "2024-01-01T00:01:00Z"),
      makeNode("n2", "notification_sent", "2024-01-01T00:02:00Z"),
    ]
    const edges = [makeEdge("n1", "n2")]
    const meta = computeGraphMeta(nodes, edges)
    expect(meta.terminalIds.has("n2")).toBe(true)
    expect(meta.terminalIds.has("n1")).toBe(false)
  })

  it("a satellite with no incoming edge is still a root node", () => {
    const nodes = [
      makeNode("n1", "auto_reply", "2024-01-01T00:01:00Z"),
      makeNode("n2", "routing",    "2024-01-01T00:02:00Z"),
    ]
    const edges = [makeEdge("n1", "n2")]
    const meta = computeGraphMeta(nodes, edges)
    expect(meta.rootIds.has("n1")).toBe(true)
  })
})

// ── NF-UNIT-LGU-20: Attempt group labels and ids ─────────────────────────────

describe("computeGraphMeta — attempt group metadata (NF-UNIT-LGU-20)", () => {
  const nodes = [
    makeNode("n1", "routing",  "2024-01-01T00:01:00Z"),
    makeNode("n2", "routing",  "2024-01-01T00:02:00Z"),
    makeNode("n3", "routing",  "2024-01-01T00:03:00Z"),
  ]
  const meta = computeGraphMeta(nodes, [])

  it("attempt ids follow the pattern attempt-group-N (0-indexed)", () => {
    expect(meta.attemptGroups[0].id).toBe("attempt-group-0")
    expect(meta.attemptGroups[1].id).toBe("attempt-group-1")
    expect(meta.attemptGroups[2].id).toBe("attempt-group-2")
  })

  it("labels are human-readable 1-indexed strings", () => {
    expect(meta.attemptGroups[0].label).toBe("Attempt 1")
    expect(meta.attemptGroups[1].label).toBe("Attempt 2")
    expect(meta.attemptGroups[2].label).toBe("Attempt 3")
  })
})

// ── NF-UNIT-LGU-21: Attempt group count with N repeats ───────────────────────

describe("computeGraphMeta — attempt group count (NF-UNIT-LGU-21)", () => {
  it("triage appearing 4 times → 4 attempt groups", () => {
    const nodes = [
      makeNode("n1", "triage", "2024-01-01T00:01:00Z"),
      makeNode("n2", "triage", "2024-01-01T00:02:00Z"),
      makeNode("n3", "triage", "2024-01-01T00:03:00Z"),
      makeNode("n4", "triage", "2024-01-01T00:04:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.attemptGroups).toHaveLength(4)
  })
})

// ── NF-UNIT-LGU-22: Nodes with no edges are both roots and terminals ──────────

describe("computeGraphMeta — disconnected nodes (NF-UNIT-LGU-22)", () => {
  it("each isolated node is simultaneously a root and a terminal", () => {
    const nodes = [
      makeNode("a", "triage",   "2024-01-01T00:01:00Z"),
      makeNode("b", "routing",  "2024-01-01T00:02:00Z"),
      makeNode("c", "resolved", "2024-01-01T00:03:00Z"),
    ]
    const meta = computeGraphMeta(nodes, [])
    expect(meta.rootIds.size).toBe(3)
    expect(meta.terminalIds.size).toBe(3)
    // All are roots and all are terminals
    for (const id of ["a", "b", "c"]) {
      expect(meta.rootIds.has(id)).toBe(true)
      expect(meta.terminalIds.has(id)).toBe(true)
    }
  })
})

// ── NF-UNIT-LGU-23: Mixed full scenario ──────────────────────────────────────

describe("computeGraphMeta — mixed full scenario (NF-UNIT-LGU-23)", () => {
  /**
   * Scenario: Signal comes in, triage done, change_prep started,
   * then rejected and restarted with triage again (back-in-force on triage only).
   * Second attempt uses approval_requested (first occurrence → no extra split)
   * then resolves. Throughout, notification_sent nodes are emitted as satellites.
   *
   * Nodes (chronological):
   *   n1  signal_received    T+01
   *   n2  triage             T+02   attempt 1 — first occurrence of triage
   *   n3  change_prep        T+03   attempt 1 — first occurrence of change_prep
   *   n4  notification_sent  T+04   satellite
   *   n5  rejected           T+05   attempt 1
   *   n6  triage             T+06   attempt 2 — second occurrence → SPLIT
   *   n7  notification_sent  T+07   satellite
   *   n8  approval_requested T+08   attempt 2 — first occurrence, no split
   *   n9  resolved           T+09   attempt 2
   *
   * Only triage repeats, so there are exactly 2 attempt groups.
   */
  const t = (min: number) => `2024-01-01T00:${String(min).padStart(2,"0")}:00Z`

  const nodes = [
    makeNode("n1", "signal_received",   t(1)),
    makeNode("n2", "triage",            t(2)),
    makeNode("n3", "change_prep",       t(3)),
    makeNode("n4", "notification_sent", t(4)),
    makeNode("n5", "rejected",          t(5)),
    makeNode("n6", "triage",            t(6)),
    makeNode("n7", "notification_sent", t(7)),
    makeNode("n8", "approval_requested",t(8)),
    makeNode("n9", "resolved",          t(9)),
  ]

  const edges = [
    makeEdge("n1", "n2"),
    makeEdge("n2", "n3"),
    makeEdge("n3", "n4"),
    makeEdge("n3", "n5"),
    makeEdge("n5", "n6"),   // loop-back edge: attempt1 → attempt2
    makeEdge("n6", "n7"),
    makeEdge("n6", "n8"),
    makeEdge("n8", "n9"),
  ]

  const meta = computeGraphMeta(nodes, edges)

  it("produces exactly 2 attempt groups", () => {
    expect(meta.attemptGroups).toHaveLength(2)
  })

  it("satellite nodes n4 and n7 are identified", () => {
    expect(meta.satelliteNodeIds.has("n4")).toBe(true)
    expect(meta.satelliteNodeIds.has("n7")).toBe(true)
  })

  it("n1 is the only root", () => {
    expect(meta.rootIds.size).toBe(1)
    expect(meta.rootIds.has("n1")).toBe(true)
  })

  it("n4, n7, n9 are terminals (leaves with no outgoing edges)", () => {
    expect(meta.terminalIds.has("n4")).toBe(true)
    expect(meta.terminalIds.has("n7")).toBe(true)
    expect(meta.terminalIds.has("n9")).toBe(true)
  })

  it("attempt 1 outcome is failure (last chronological node in attempt 1 is rejected)", () => {
    const a1 = meta.attemptGroups.find((g) => g.attemptNumber === 1)!
    expect(a1.outcome).toBe("failure")
  })

  it("attempt 2 outcome is success (last chronological node in attempt 2 is resolved)", () => {
    const a2 = meta.attemptGroups.find((g) => g.attemptNumber === 2)!
    expect(a2.outcome).toBe("success")
  })

  it("the loop-back edge n5→n6 (attempt1 terminal → attempt2 root) is a loop-back edge", () => {
    expect(meta.loopBackEdgeIds.has("edge-n5-n6")).toBe(true)
  })

  it("n6 (triage in attempt 2) is a retry node; n2 (triage in attempt 1) is not", () => {
    expect(meta.retryNodeIds.has("n6")).toBe(true)
    expect(meta.retryNodeIds.has("n2")).toBe(false)
  })

  it("sequence numbers are 1-based and cover all 9 nodes in chronological order", () => {
    expect(meta.sequenceNumbers.size).toBe(9)
    for (let i = 1; i <= 9; i++) {
      const id = `n${i}`
      expect(meta.sequenceNumbers.get(id)).toBe(i)
    }
  })

  it("critical path runs from n1 to n9 (the latest terminal)", () => {
    expect(meta.criticalPathNodeIds.has("n1")).toBe(true)
    expect(meta.criticalPathNodeIds.has("n9")).toBe(true)
  })

  it("n9 (resolved) has terminal kind success", () => {
    expect(meta.terminalKindMap.get("n9")).toBe("success")
  })

  it("n4 (notification_sent terminal) has terminal kind open", () => {
    expect(meta.terminalKindMap.get("n4")).toBe("open")
  })
})
