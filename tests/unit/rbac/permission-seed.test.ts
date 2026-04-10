/**
 * Unit tests: Permission registry seed integrity — SLICE-22.
 * NF-UNIT-90 through NF-UNIT-99.
 *
 * TDD: these tests are written BEFORE the implementation exists.
 * They define the exact contract the permission registry must satisfy.
 * Run → confirm RED → implement → confirm GREEN.
 *
 * No DB required — tests operate on exported TypeScript constants only.
 */

import { describe, it, expect } from "vitest"
import {
  PERMISSION_REGISTRY,
  DEFAULT_ROLE_PERMISSIONS,
  TOTAL_PERMISSIONS,
} from "../../../src/infra/db/repositories/permissions.js"

describe("Permission registry (NF-UNIT-90–99)", () => {

  // ── NF-UNIT-90 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-90: admin role has all permissions in the registry", () => {
    const adminPerms = DEFAULT_ROLE_PERMISSIONS["admin"]
    expect(adminPerms).toBeDefined()
    expect(adminPerms.length).toBe(TOTAL_PERMISSIONS)
    for (const p of PERMISSION_REGISTRY) {
      expect(adminPerms, `admin missing ${p.id}`).toContain(p.id)
    }
  })

  // ── NF-UNIT-91 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-91: operator role excludes destructive and PII-sensitive permissions", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS["operator"]
    expect(perms).toBeDefined()

    // Destructive — must NOT have
    expect(perms).not.toContain("cases:delete")
    expect(perms).not.toContain("compliance:retention_run")
    expect(perms).not.toContain("memory:delete")

    // PII-sensitive — must NOT have
    expect(perms).not.toContain("compliance:dsar_search")
    expect(perms).not.toContain("compliance:dsar_export")

    // Elevated write — must NOT have
    expect(perms).not.toContain("memory:write")
    expect(perms).not.toContain("settings:write")
    expect(perms).not.toContain("products:create")
    expect(perms).not.toContain("products:update")
    expect(perms).not.toContain("change_requests:approve")
    expect(perms).not.toContain("change_requests:reject")
    expect(perms).not.toContain("change_requests:complete")

    // Core operational — MUST have
    expect(perms).toContain("cases:read")
    expect(perms).toContain("cases:create")
    expect(perms).toContain("cases:transition")
    expect(perms).toContain("signals:read")
    expect(perms).toContain("approvals:read")
    expect(perms).toContain("approvals:act")
    expect(perms).toContain("analytics:read")
    expect(perms).toContain("compliance:read")
    expect(perms).toContain("audit:read")
    expect(perms).toContain("products:read")
  })

  // ── NF-UNIT-92 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-92: support_lead role has correct permission set", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS["support_lead"]
    expect(perms).toBeDefined()

    // Must have
    expect(perms).toContain("cases:read")
    expect(perms).toContain("cases:transition")
    expect(perms).toContain("signals:read")
    expect(perms).toContain("approvals:read")
    expect(perms).toContain("approvals:act")
    expect(perms).toContain("analytics:read")
    expect(perms).toContain("settings:read")
    expect(perms).toContain("compliance:read")
    expect(perms).toContain("memory:read")
    expect(perms).toContain("audit:read")
    expect(perms).toContain("products:read")

    // Must NOT have
    expect(perms).not.toContain("cases:create")
    expect(perms).not.toContain("cases:delete")
    expect(perms).not.toContain("cases:export")
    expect(perms).not.toContain("signals:dismiss")
    expect(perms).not.toContain("change_requests:approve")
    expect(perms).not.toContain("change_requests:reject")
    expect(perms).not.toContain("change_requests:complete")
    expect(perms).not.toContain("pr_drafts:read")
    expect(perms).not.toContain("pr_drafts:push")
    expect(perms).not.toContain("memory:write")
    expect(perms).not.toContain("memory:delete")
    expect(perms).not.toContain("settings:write")
    expect(perms).not.toContain("compliance:dsar_search")
    expect(perms).not.toContain("compliance:dsar_export")
    expect(perms).not.toContain("compliance:retention_run")
    expect(perms).not.toContain("products:create")
    expect(perms).not.toContain("products:update")
  })

  // ── NF-UNIT-93 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-93: knowledge_lead role has correct permission set", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS["knowledge_lead"]
    expect(perms).toBeDefined()

    // Must have
    expect(perms).toContain("cases:read")
    expect(perms).toContain("signals:read")
    expect(perms).toContain("change_requests:read")
    expect(perms).toContain("change_requests:create")
    expect(perms).toContain("change_requests:approve")
    expect(perms).toContain("change_requests:reject")
    expect(perms).toContain("change_requests:complete")
    expect(perms).toContain("pr_drafts:read")
    expect(perms).toContain("pr_drafts:push")
    expect(perms).toContain("approvals:read")
    expect(perms).toContain("analytics:read")
    expect(perms).toContain("settings:read")
    expect(perms).toContain("memory:read")
    expect(perms).toContain("memory:write")
    expect(perms).toContain("audit:read")
    expect(perms).toContain("products:read")

    // Must NOT have — knowledge lead has no case write or compliance access
    expect(perms).not.toContain("cases:create")
    expect(perms).not.toContain("cases:transition")
    expect(perms).not.toContain("cases:delete")
    expect(perms).not.toContain("cases:export")
    expect(perms).not.toContain("signals:dismiss")
    expect(perms).not.toContain("approvals:act")
    expect(perms).not.toContain("memory:delete")
    expect(perms).not.toContain("settings:write")
    expect(perms).not.toContain("compliance:dsar_search")
    expect(perms).not.toContain("compliance:dsar_export")
    expect(perms).not.toContain("compliance:retention_run")
    expect(perms).not.toContain("products:create")
    expect(perms).not.toContain("products:update")
  })

  // ── NF-UNIT-94 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-94: only admin has cases:delete — never leaks to other roles", () => {
    expect(DEFAULT_ROLE_PERMISSIONS["admin"]).toContain("cases:delete")
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role !== "admin") {
        expect(perms, `${role} must not have cases:delete`).not.toContain("cases:delete")
      }
    }
  })

  // ── NF-UNIT-95 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-95: only admin has compliance:dsar_search — PII access scoped to root role", () => {
    expect(DEFAULT_ROLE_PERMISSIONS["admin"]).toContain("compliance:dsar_search")
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role !== "admin") {
        expect(perms, `${role} must not have compliance:dsar_search`).not.toContain("compliance:dsar_search")
      }
    }
  })

  // ── NF-UNIT-96 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-96: only admin has compliance:retention_run — destructive sweep scoped to root role", () => {
    expect(DEFAULT_ROLE_PERMISSIONS["admin"]).toContain("compliance:retention_run")
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role !== "admin") {
        expect(perms, `${role} must not have compliance:retention_run`).not.toContain("compliance:retention_run")
      }
    }
  })

  // ── NF-UNIT-97 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-97: no permission appears twice in any default role", () => {
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const unique = new Set(perms)
      expect(unique.size, `${role} has duplicate permissions`).toBe(perms.length)
    }
  })

  // ── NF-UNIT-98 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-98: all permission IDs follow domain:action format and match their domain/action fields", () => {
    for (const p of PERMISSION_REGISTRY) {
      expect(p.id, `${p.id} should match /^[a-z_]+:[a-z_]+$/`).toMatch(/^[a-z_]+:[a-z_]+$/)
      expect(p.id, `${p.id} should equal domain:action`).toBe(`${p.domain}:${p.action}`)
    }
  })

  // ── NF-UNIT-99 ───────────────────────────────────────────────────────────────

  it("NF-UNIT-99: every permission has non-empty label and description", () => {
    for (const p of PERMISSION_REGISTRY) {
      expect(p.label.trim(), `${p.id} missing label`).not.toBe("")
      expect(p.description.trim(), `${p.id} missing description`).not.toBe("")
    }
  })

  // ── NF-UNIT-100a (seed) ───────────────────────────────────────────────────────

  it("NF-UNIT-100a: change_lead role has correct permission set", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS["change_lead"]
    expect(perms).toBeDefined()

    // Must have — CR lifecycle + PR push + approvals
    expect(perms).toContain("cases:read")
    expect(perms).toContain("change_requests:read")
    expect(perms).toContain("change_requests:create")
    expect(perms).toContain("change_requests:approve")
    expect(perms).toContain("change_requests:reject")
    expect(perms).toContain("change_requests:complete")
    expect(perms).toContain("pr_drafts:read")
    expect(perms).toContain("pr_drafts:push")
    expect(perms).toContain("approvals:read")
    expect(perms).toContain("approvals:act")
    expect(perms).toContain("analytics:read")
    expect(perms).toContain("memory:read")
    expect(perms).toContain("audit:read")
    expect(perms).toContain("products:read")

    // Must NOT have — no case write, no destructive, no PII, no settings write
    expect(perms).not.toContain("cases:create")
    expect(perms).not.toContain("cases:transition")
    expect(perms).not.toContain("cases:delete")
    expect(perms).not.toContain("cases:export")
    expect(perms).not.toContain("settings:write")
    expect(perms).not.toContain("memory:delete")
    expect(perms).not.toContain("compliance:dsar_search")
    expect(perms).not.toContain("compliance:dsar_export")
    expect(perms).not.toContain("compliance:retention_run")
    expect(perms).not.toContain("products:create")
  })

  // ── NF-UNIT-100b (seed) ───────────────────────────────────────────────────────

  it("NF-UNIT-100b: product_lead role has correct permission set", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS["product_lead"]
    expect(perms).toBeDefined()

    // Must have — case transition + CR approve/reject + approvals
    expect(perms).toContain("cases:read")
    expect(perms).toContain("cases:transition")
    expect(perms).toContain("signals:read")
    expect(perms).toContain("change_requests:read")
    expect(perms).toContain("change_requests:approve")
    expect(perms).toContain("change_requests:reject")
    expect(perms).toContain("pr_drafts:read")
    expect(perms).toContain("approvals:read")
    expect(perms).toContain("approvals:act")
    expect(perms).toContain("analytics:read")
    expect(perms).toContain("compliance:read")
    expect(perms).toContain("memory:read")
    expect(perms).toContain("audit:read")
    expect(perms).toContain("products:read")

    // Must NOT have — no PR push, no destructive, no PII, no settings write
    expect(perms).not.toContain("pr_drafts:push")
    expect(perms).not.toContain("cases:delete")
    expect(perms).not.toContain("cases:export")
    expect(perms).not.toContain("settings:write")
    expect(perms).not.toContain("memory:write")
    expect(perms).not.toContain("memory:delete")
    expect(perms).not.toContain("compliance:dsar_search")
    expect(perms).not.toContain("compliance:dsar_export")
    expect(perms).not.toContain("compliance:retention_run")
    expect(perms).not.toContain("products:create")
  })

})
