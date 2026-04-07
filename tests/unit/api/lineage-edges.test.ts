/**
 * Unit tests for buildEdges() — lineage graph edge construction.
 * Tests the 3-pass algorithm: semantic edges, notification side-edges,
 * and sequential fallback for orphan nodes.
 *
 * NF-UNIT-200+
 *
 * Only buildEdges() is exported from lineage.ts; all helper behaviour
 * (edgeTypeForTarget, SEMANTIC_SUCCESSORS branching rules) is exercised
 * indirectly through the edges produced.
 */

import { describe, it, expect } from "vitest"
import { buildEdges } from "../../../src/api/v1/lineage.js"
import type { LineageNode, LineageNodeType, LineageEdge } from "../../../src/api/v1/lineage.js"

// ── Test factory ──────────────────────────────────────────────────────────────

function makeNode(
  overrides: Partial<LineageNode> & { nodeId: string; type: LineageNodeType; occurredAt: string },
): LineageNode {
  return {
    actorType: "agent",
    actorRef: "test",
    action: "test",
    title: "Test",
    summary: "",
    metadata: {},
    agentRun: null,
    availableActions: [],
    ...overrides,
  }
}

/** Convenience: find an edge by source→target node IDs. */
function findEdge(edges: LineageEdge[], sourceId: string, targetId: string): LineageEdge | undefined {
  return edges.find((e) => e.source === sourceId && e.target === targetId)
}

/** Assert that a specific edge exists and return it. */
function assertEdge(
  edges: LineageEdge[],
  sourceId: string,
  targetId: string,
): LineageEdge {
  const edge = findEdge(edges, sourceId, targetId)
  expect(edge, `Expected edge ${sourceId} → ${targetId} to exist`).toBeDefined()
  return edge!
}

// ── Group 1: Happy path — full pipeline ──────────────────────────────────────

describe("buildEdges() — happy path full pipeline", () => {
  const nodes: LineageNode[] = [
    makeNode({ nodeId: "n1",  type: "signal_received",        occurredAt: "2024-01-01T00:00:00.000Z" }),
    makeNode({ nodeId: "n2",  type: "case_created",           occurredAt: "2024-01-01T00:01:00.000Z" }),
    makeNode({ nodeId: "n3",  type: "triage",                 occurredAt: "2024-01-01T00:02:00.000Z" }),
    makeNode({ nodeId: "n4",  type: "routing",                occurredAt: "2024-01-01T00:03:00.000Z" }),
    makeNode({ nodeId: "n5",  type: "change_request_created", occurredAt: "2024-01-01T00:04:00.000Z" }),
    makeNode({ nodeId: "n6",  type: "change_prep",            occurredAt: "2024-01-01T00:05:00.000Z" }),
    makeNode({ nodeId: "n7",  type: "approval_requested",     occurredAt: "2024-01-01T00:06:00.000Z" }),
    makeNode({ nodeId: "n8",  type: "approved",               occurredAt: "2024-01-01T00:07:00.000Z" }),
    makeNode({ nodeId: "n9",  type: "pr_drafted",             occurredAt: "2024-01-01T00:08:00.000Z" }),
    makeNode({ nodeId: "n10", type: "pr_merged",              occurredAt: "2024-01-01T00:09:00.000Z" }),
    makeNode({ nodeId: "n11", type: "ci_passed",              occurredAt: "2024-01-01T00:10:00.000Z" }),
    makeNode({ nodeId: "n12", type: "deployed",               occurredAt: "2024-01-01T00:11:00.000Z" }),
    makeNode({ nodeId: "n13", type: "resolved",               occurredAt: "2024-01-01T00:12:00.000Z" }),
  ]

  it("NF-UNIT-200: signal_received connects to case_created", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n1", "n2")
  })

  it("NF-UNIT-201: case_created connects to triage", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n2", "n3")
  })

  it("NF-UNIT-202: triage connects to routing (skipping known_issue_match when absent)", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n3", "n4")
  })

  it("NF-UNIT-203: routing connects to change_request_created", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n4", "n5")
  })

  it("NF-UNIT-204: change_request_created connects to change_prep", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n5", "n6")
  })

  it("NF-UNIT-205: change_prep connects to approval_requested", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n6", "n7")
  })

  it("NF-UNIT-206: approval_requested connects to approved", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n7", "n8")
  })

  it("NF-UNIT-207: approved connects to pr_drafted", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n8", "n9")
  })

  it("NF-UNIT-208: pr_drafted connects to pr_merged", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n9", "n10")
  })

  it("NF-UNIT-209: pr_merged connects to ci_passed", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n10", "n11")
  })

  it("NF-UNIT-210: ci_passed connects to deployed", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n11", "n12")
  })

  it("NF-UNIT-211: deployed connects to resolved", () => {
    const edges = buildEdges(nodes)
    assertEdge(edges, "n12", "n13")
  })

  it("NF-UNIT-212: full pipeline produces exactly 13 edges (ci_passed branches to both deployed and resolved)", () => {
    const edges = buildEdges(nodes)
    // 12 sequential hops + ci_passed also connects directly to resolved (branching node)
    expect(edges.length).toBe(13)
  })

  it("NF-UNIT-213: every edge has a unique id with edge- prefix", () => {
    const edges = buildEdges(nodes)
    const ids = edges.map((e) => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^edge-/)
    }
  })
})

// ── Group 2: Branching — approval_requested ───────────────────────────────────

describe("buildEdges() — approval_requested branching", () => {
  it("NF-UNIT-214: approval_requested connects to both approved AND rejected when both exist", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ap",  type: "approval_requested", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ok",  type: "approved",           occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "no",  type: "rejected",           occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "ap", "ok")
    assertEdge(edges, "ap", "no")
  })

  it("NF-UNIT-215: approval_requested connects only to approved when rejected is absent", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ap", type: "approval_requested", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ok", type: "approved",           occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "ap", "ok")
    expect(edges.filter((e) => e.source === "ap").length).toBe(1)
  })

  it("NF-UNIT-216: approval_requested → approved has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ap", type: "approval_requested", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ok", type: "approved",           occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const edge = assertEdge(edges, "ap", "ok")
    expect(edge.edgeType).toBe("success")
  })

  it("NF-UNIT-217: approval_requested → rejected has edgeType 'failure'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ap", type: "approval_requested", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "no", type: "rejected",           occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const edge = assertEdge(edges, "ap", "no")
    expect(edge.edgeType).toBe("failure")
  })
})

// ── Group 3: Branching — pr_merged ───────────────────────────────────────────

describe("buildEdges() — pr_merged branching", () => {
  it("NF-UNIT-218: pr_merged connects to both ci_passed AND ci_failed when both exist", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pm",  type: "pr_merged",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cp",  type: "ci_passed",  occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "cf",  type: "ci_failed",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "pm", "cp")
    assertEdge(edges, "pm", "cf")
  })

  it("NF-UNIT-219: pr_merged → ci_passed has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pm", type: "pr_merged", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cp", type: "ci_passed", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "pm", "cp").edgeType).toBe("success")
  })

  it("NF-UNIT-220: pr_merged → ci_failed has edgeType 'failure'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pm", type: "pr_merged", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cf", type: "ci_failed", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "pm", "cf").edgeType).toBe("failure")
  })
})

// ── Group 4: Branching — ci_passed ───────────────────────────────────────────

describe("buildEdges() — ci_passed branching", () => {
  it("NF-UNIT-221: ci_passed connects to deployed, deploy_failed, and resolved when all exist", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cp",  type: "ci_passed",    occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "dp",  type: "deployed",     occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "df",  type: "deploy_failed",occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved",     occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "cp", "dp")
    assertEdge(edges, "cp", "df")
    assertEdge(edges, "cp", "res")
  })

  it("NF-UNIT-222: ci_passed → deployed has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cp", type: "ci_passed", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "dp", type: "deployed",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "cp", "dp").edgeType).toBe("success")
  })

  it("NF-UNIT-223: ci_passed → deploy_failed has edgeType 'failure'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cp", type: "ci_passed",    occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "df", type: "deploy_failed", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "cp", "df").edgeType).toBe("failure")
  })

  it("NF-UNIT-224: ci_passed → resolved has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cp",  type: "ci_passed", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "cp", "res").edgeType).toBe("success")
  })
})

// ── Group 5: Notification side-edges ─────────────────────────────────────────

describe("buildEdges() — notification side-edges", () => {
  it("NF-UNIT-225: notification_sent attaches to the immediately preceding non-notification node", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",   type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "tr",   type: "triage",           occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "c1", "notif")
  })

  it("NF-UNIT-226: notification edge has edgeType 'default'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",   type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const edge = assertEdge(edges, "c1", "notif")
    expect(edge.edgeType).toBe("default")
  })

  it("NF-UNIT-227: multiple notifications after same node each get their own side-edge", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",    type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif1",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "notif2",type: "notification_sent",occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "c1", "notif1")
    assertEdge(edges, "c1", "notif2")
  })

  it("NF-UNIT-228: notification between two semantic nodes attaches to the node immediately before it, not the one after", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",   type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "tr",   type: "triage",           occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // notif should attach to c1, NOT to tr
    expect(findEdge(edges, "tr", "notif")).toBeUndefined()
    assertEdge(edges, "c1", "notif")
  })

  it("NF-UNIT-229: notification_sent node receives no outgoing semantic edge", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",   type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const outgoing = edges.filter((e) => e.source === "notif")
    expect(outgoing.length).toBe(0)
  })
})

// ── Group 6: Sequential fallback for orphan nodes ────────────────────────────

describe("buildEdges() — sequential fallback for orphan nodes", () => {
  it("NF-UNIT-230: system_event with no semantic predecessors falls back to previous node", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1", type: "case_created",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "se", type: "system_event",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "c1", "se")
  })

  it("NF-UNIT-231: fallback skips notification_sent nodes when looking backwards for a parent", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1",   type: "case_created",     occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "notif",type: "notification_sent",occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "se",   type: "system_event",     occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // system_event should attach to c1 (skipping the notification)
    assertEdge(edges, "c1", "se")
    expect(findEdge(edges, "notif", "se")).toBeUndefined()
  })

  it("NF-UNIT-232: known_issue_match followed by routing gets semantic edge from triage, not fallback", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "tr",  type: "triage",            occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ki",  type: "known_issue_match", occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "ro",  type: "routing",           occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // triage → known_issue_match (semantic)
    assertEdge(edges, "tr", "ki")
    // known_issue_match → routing (semantic)
    assertEdge(edges, "ki", "ro")
  })
})

// ── Group 7: Edge deduplication ───────────────────────────────────────────────

describe("buildEdges() — edge deduplication", () => {
  it("NF-UNIT-233: duplicate edges are not emitted when multiple passes would create the same edge", () => {
    // ci_passed → resolved both via semantic (branching) and potentially via deployed → resolved
    // Arrange a short chain where dedup matters
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pm",  type: "pr_merged",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cp",  type: "ci_passed",  occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved",   occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const fromCpToRes = edges.filter((e) => e.source === "cp" && e.target === "res")
    expect(fromCpToRes.length).toBe(1)
  })

  it("NF-UNIT-234: all edge ids are unique across the full output", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "sr",  type: "signal_received",        occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cc",  type: "case_created",           occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "tr",  type: "triage",                 occurredAt: "2024-01-01T00:02:00.000Z" }),
      makeNode({ nodeId: "ro",  type: "routing",                occurredAt: "2024-01-01T00:03:00.000Z" }),
      makeNode({ nodeId: "cr",  type: "change_request_created", occurredAt: "2024-01-01T00:04:00.000Z" }),
      makeNode({ nodeId: "ap",  type: "approval_requested",     occurredAt: "2024-01-01T00:05:00.000Z" }),
      makeNode({ nodeId: "ok",  type: "approved",               occurredAt: "2024-01-01T00:06:00.000Z" }),
      makeNode({ nodeId: "rej", type: "rejected",               occurredAt: "2024-01-01T00:06:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const ids = edges.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── Group 8: Edge type correctness ───────────────────────────────────────────

describe("buildEdges() — edgeType assignment", () => {
  it("NF-UNIT-235: edge to 'resolved' always has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro",  type: "routing",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "ro", "res").edgeType).toBe("success")
  })

  it("NF-UNIT-236: edge to 'change_request_created' has edgeType 'branch'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",                occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cr", type: "change_request_created", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "ro", "cr").edgeType).toBe("branch")
  })

  it("NF-UNIT-237: edge to 'auto_reply' has edgeType 'branch'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",    occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ar", type: "auto_reply", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "ro", "ar").edgeType).toBe("branch")
  })

  it("NF-UNIT-238: edge to 'escalated' has edgeType 'branch'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "es", type: "escalated",occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "ro", "es").edgeType).toBe("branch")
  })

  it("NF-UNIT-239: edge to 'triage' has edgeType 'default'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cc", type: "case_created", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "tr", type: "triage",       occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "cc", "tr").edgeType).toBe("default")
  })

  it("NF-UNIT-240: edge to 'ci_passed' has edgeType 'success'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pm", type: "pr_merged", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cp", type: "ci_passed", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    expect(assertEdge(edges, "pm", "cp").edgeType).toBe("success")
  })
})

// ── Group 9: Empty graph ──────────────────────────────────────────────────────

describe("buildEdges() — empty and trivial inputs", () => {
  it("NF-UNIT-241: empty node list returns empty edge list", () => {
    expect(buildEdges([])).toEqual([])
  })

  it("NF-UNIT-242: single node returns empty edge list", () => {
    const nodes = [makeNode({ nodeId: "n1", type: "signal_received", occurredAt: "2024-01-01T00:00:00.000Z" })]
    expect(buildEdges(nodes)).toEqual([])
  })
})

// ── Group 10: All notification nodes ─────────────────────────────────────────

describe("buildEdges() — all notification nodes edge cases", () => {
  it("NF-UNIT-243: list consisting entirely of notification_sent nodes produces no edges", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "n1", type: "notification_sent", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "n2", type: "notification_sent", occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "n3", type: "notification_sent", occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    // Should not throw and should return empty (no preceding non-notification node exists)
    const edges = buildEdges(nodes)
    expect(edges).toEqual([])
  })

  it("NF-UNIT-244: notification at position 0 (before any semantic node) produces no edge", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "n1", type: "notification_sent", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "n2", type: "case_created",      occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // The notification has no preceding non-notification node — no edge for it
    expect(edges.filter((e) => e.target === "n1").length).toBe(0)
  })
})

// ── Group 11: Non-branching greedy selection ──────────────────────────────────

describe("buildEdges() — non-branching nodes select first matching successor", () => {
  it("NF-UNIT-245: when two triage nodes exist, signal_received connects only to the first one by occurredAt", () => {
    // case_created is non-branching → it should pick first matching triage
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cc",  type: "case_created", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "tr1", type: "triage",       occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "tr2", type: "triage",       occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const outgoing = edges.filter((e) => e.source === "cc")
    // Non-branching: should connect to exactly one triage node
    expect(outgoing.length).toBe(1)
    expect(outgoing[0]!.target).toBe("tr1")
  })

  it("NF-UNIT-246: triage connects to known_issue_match before routing when both are present (priority order)", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "tr", type: "triage",            occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ki", type: "known_issue_match", occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "ro", type: "routing",           occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // triage is non-branching: picks first successor in priority list = known_issue_match
    const trOutgoing = edges.filter((e) => e.source === "tr")
    expect(trOutgoing.length).toBe(1)
    expect(trOutgoing[0]!.target).toBe("ki")
  })

  it("NF-UNIT-247: triage connects directly to routing when known_issue_match is absent", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "tr", type: "triage",   occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ro", type: "routing",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "tr", "ro")
  })
})

// ── Group 12: Routing branching ───────────────────────────────────────────────

describe("buildEdges() — routing destinations", () => {
  it("NF-UNIT-248: routing connects to auto_reply when change_request_created is absent", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",    occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "ar", type: "auto_reply", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "ro", "ar")
  })

  it("NF-UNIT-249: routing connects to escalated when it is the first matching successor", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",   occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "es", type: "escalated", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "ro", "es")
  })

  it("NF-UNIT-250: routing connects to resolved when it is the only matching successor", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro",  type: "routing",  occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "ro", "res")
  })

  it("NF-UNIT-251: routing selects change_request_created over auto_reply when both exist (priority order)", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "ro", type: "routing",                occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cr", type: "change_request_created", occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "ar", type: "auto_reply",             occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // routing is non-branching: first successor in the list wins (change_request_created)
    const outgoing = edges.filter((e) => e.source === "ro")
    expect(outgoing.length).toBe(1)
    expect(outgoing[0]!.target).toBe("cr")
  })
})

// ── Group 13: pr_drafted branching ───────────────────────────────────────────

describe("buildEdges() — pr_drafted destinations", () => {
  it("NF-UNIT-252: pr_drafted connects to pr_merged when present", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pd", type: "pr_drafted", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "pm", type: "pr_merged",  occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "pd", "pm")
  })

  it("NF-UNIT-253: pr_drafted connects to resolved when pr_merged is absent", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pd",  type: "pr_drafted", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved",   occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "pd", "res")
  })

  it("NF-UNIT-254: pr_drafted selects pr_merged over resolved (priority order) when both exist", () => {
    // pr_drafted is non-branching → only the first matching successor
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "pd",  type: "pr_drafted", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "pm",  type: "pr_merged",  occurredAt: "2024-01-01T00:01:00.000Z" }),
      makeNode({ nodeId: "res", type: "resolved",   occurredAt: "2024-01-01T00:02:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const outgoing = edges.filter((e) => e.source === "pd")
    // Only one outgoing edge (non-branching); resolved is picked up downstream by deployed→resolved
    expect(outgoing.length).toBe(1)
    expect(outgoing[0]!.target).toBe("pm")
  })
})

// ── Group 14: Edge id format ──────────────────────────────────────────────────

describe("buildEdges() — edge id and structure", () => {
  it("NF-UNIT-255: edge id is 'edge-{sourceId}-{targetId}'", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "abc", type: "case_created", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "xyz", type: "triage",       occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const edge = assertEdge(edges, "abc", "xyz")
    expect(edge.id).toBe("edge-abc-xyz")
  })

  it("NF-UNIT-256: edges do not include a label property unless explicitly set", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "c1", type: "case_created", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "tr", type: "triage",       occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    const edge = assertEdge(edges, "c1", "tr")
    expect("label" in edge).toBe(false)
  })

  it("NF-UNIT-257: every edge has source, target, id, and edgeType fields", () => {
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "sr", type: "signal_received", occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cc", type: "case_created",    occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    for (const edge of edges) {
      expect(typeof edge.id).toBe("string")
      expect(typeof edge.source).toBe("string")
      expect(typeof edge.target).toBe("string")
      expect(["default", "success", "failure", "branch"]).toContain(edge.edgeType)
    }
  })
})

// ── Group 15: Temporal ordering constraint ────────────────────────────────────

describe("buildEdges() — temporal ordering (occurredAt constraint)", () => {
  it("NF-UNIT-258: semantic successor that occurred before the source node is skipped", () => {
    // triage appears before case_created — case_created should NOT link to it
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "tr", type: "triage",       occurredAt: "2024-01-01T00:00:00.000Z" }),
      makeNode({ nodeId: "cc", type: "case_created", occurredAt: "2024-01-01T00:01:00.000Z" }),
    ]
    const edges = buildEdges(nodes)
    // case_created → triage should NOT exist because triage occurredAt < case_created occurredAt
    expect(findEdge(edges, "cc", "tr")).toBeUndefined()
  })

  it("NF-UNIT-259: successor occurring at exactly the same time as source is included (>= boundary)", () => {
    const ts = "2024-01-01T00:00:00.000Z"
    const nodes: LineageNode[] = [
      makeNode({ nodeId: "cc", type: "case_created", occurredAt: ts }),
      makeNode({ nodeId: "tr", type: "triage",       occurredAt: ts }),
    ]
    const edges = buildEdges(nodes)
    assertEdge(edges, "cc", "tr")
  })
})
