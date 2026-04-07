/**
 * Unit tests for BEF-17 (Reopen action) and BEF-16 (Follow-up action).
 *
 * Covers the pure helper functions in lineage.ts that changed:
 *   - buildAvailableActions(): resolved status emits reopen + send_followup
 *   - actionToNodeType(): case.reopened → escalated, case.followup_sent → auto_reply
 *   - nodeTypeToTitle(): action-based title overrides for these two events
 *
 * Endpoint integration (DB) is out of scope for unit tests.
 */

import { describe, it, expect } from "vitest"
import {
  buildAvailableActions,
  actionToNodeType,
  nodeTypeToTitle,
} from "../../../src/api/v1/lineage.js"
import type { LineageNodeType } from "../../../src/api/v1/lineage.js"

// ── buildAvailableActions ─────────────────────────────────────────────────────

describe("buildAvailableActions() — BEF-17/16", () => {
  describe("resolved status", () => {
    it("emits reopen", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).toContain("reopen")
    })

    it("emits send_followup", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).toContain("send_followup")
    })

    it("emits escalate (resolved is no longer terminal)", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).toContain("escalate")
    })

    it("does not emit resolve (only for in-resolution)", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).not.toContain("resolve")
    })

    it("does not emit send_to_change (only for awaiting-lead)", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).not.toContain("send_to_change")
    })

    it("does not emit approve / reject", () => {
      const actions = buildAvailableActions("resolved", "resolved", null)
      expect(actions).not.toContain("approve")
      expect(actions).not.toContain("reject")
    })
  })

  describe("other statuses do not emit reopen or send_followup", () => {
    const others: string[] = [
      "new", "enriching", "triaged", "awaiting-user",
      "awaiting-lead", "in-resolution", "in-change",
      "pr-drafting", "closed",
    ]

    for (const status of others) {
      it(`${status} does not emit reopen`, () => {
        const actions = buildAvailableActions("auto_reply", status, null)
        expect(actions).not.toContain("reopen")
      })

      it(`${status} does not emit send_followup`, () => {
        const actions = buildAvailableActions("auto_reply", status, null)
        expect(actions).not.toContain("send_followup")
      })
    }
  })

  describe("closed and rejected remain terminal (no escalate)", () => {
    it("closed: no escalate", () => {
      const actions = buildAvailableActions("resolved", "closed", null)
      expect(actions).not.toContain("escalate")
    })

    it("rejected: no escalate", () => {
      const actions = buildAvailableActions("rejected", "rejected", null)
      expect(actions).not.toContain("escalate")
    })
  })
})

// ── actionToNodeType ──────────────────────────────────────────────────────────

describe("actionToNodeType() — BEF-17/16", () => {
  it("case.reopened maps to escalated node type", () => {
    expect(actionToNodeType("case.reopened")).toBe("escalated")
  })

  it("case.followup_sent maps to auto_reply node type", () => {
    expect(actionToNodeType("case.followup_sent")).toBe("auto_reply")
  })

  it("case.draft_reply_sent maps to auto_reply node type", () => {
    expect(actionToNodeType("case.draft_reply_sent")).toBe("auto_reply")
  })

  it("case.resolved still maps to resolved", () => {
    expect(actionToNodeType("case.resolved")).toBe("resolved")
  })

  it("case.escalated still maps to escalated", () => {
    expect(actionToNodeType("case.escalated")).toBe("escalated")
  })
})

// ── nodeTypeToTitle ───────────────────────────────────────────────────────────

describe("nodeTypeToTitle() — BEF-17/16 action overrides", () => {
  it("case.reopened action returns 'Case reopened'", () => {
    expect(nodeTypeToTitle("escalated", "case.reopened")).toBe("Case reopened")
  })

  it("case.escalated action returns 'Escalated to lead'", () => {
    expect(nodeTypeToTitle("escalated", "case.escalated")).toBe("Escalated to lead")
  })

  it("case.followup_sent action returns 'Follow-up sent'", () => {
    expect(nodeTypeToTitle("auto_reply", "case.followup_sent")).toBe("Follow-up sent")
  })

  it("case.auto_replied action returns 'Auto-reply sent'", () => {
    expect(nodeTypeToTitle("auto_reply", "case.auto_replied")).toBe("Auto-reply sent")
  })
})
