/**
 * Unit tests: Permission engine — SLICE-23.
 * NF-UNIT-100 through NF-UNIT-115.
 * TDD: written BEFORE implementation. All tests start RED.
 */

import { describe, it, expect, vi } from "vitest"
import {
  resolveDependencies,
  getPermissionDiff,
  isDirty,
  canEditRoles,
  validateRoleKey,
  cloneRolePermissions,
  computeImpactPreview,
} from "../../../src/rbac/permission-engine.js"
import { TOTAL_PERMISSIONS } from "../../../src/infra/db/repositories/permissions.js"

describe("Permission engine (NF-UNIT-100–115)", () => {

  it("NF-UNIT-100: resolveDependencies adds compliance:dsar_search when dsar_export requested", () => {
    const result = resolveDependencies(new Set(["compliance:dsar_export"]))
    expect(result.has("compliance:dsar_search")).toBe(true)
    expect(result.has("compliance:dsar_export")).toBe(true)
  })

  it("NF-UNIT-101: resolveDependencies adds cases:read when cases:delete requested", () => {
    const result = resolveDependencies(new Set(["cases:delete"]))
    expect(result.has("cases:read")).toBe(true)
    expect(result.has("cases:delete")).toBe(true)
  })

  it("NF-UNIT-102: resolveDependencies adds memory:read when memory:delete requested", () => {
    const result = resolveDependencies(new Set(["memory:delete"]))
    expect(result.has("memory:read")).toBe(true)
    expect(result.has("memory:delete")).toBe(true)
  })

  it("NF-UNIT-103: resolveDependencies is idempotent", () => {
    const input = new Set(["compliance:dsar_export", "cases:delete"])
    const first = resolveDependencies(input)
    const second = resolveDependencies(first)
    expect([...first].sort()).toEqual([...second].sort())
  })

  it("NF-UNIT-104: getPermissionDiff identifies added permissions", () => {
    const current = ["cases:read", "cases:create", "cases:delete"]
    const defaultPerms = ["cases:read", "cases:create"]
    const diff = getPermissionDiff(current, defaultPerms)
    expect(diff.added).toContain("cases:delete")
    expect(diff.removed).toHaveLength(0)
  })

  it("NF-UNIT-105: getPermissionDiff identifies removed permissions", () => {
    const current = ["cases:read"]
    const defaultPerms = ["cases:read", "cases:create", "cases:transition"]
    const diff = getPermissionDiff(current, defaultPerms)
    expect(diff.removed).toContain("cases:create")
    expect(diff.removed).toContain("cases:transition")
    expect(diff.added).toHaveLength(0)
  })

  it("NF-UNIT-106: getPermissionDiff returns empty diff for identical sets", () => {
    const perms = ["cases:read", "cases:create"]
    const diff = getPermissionDiff(perms, perms)
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
  })

  it("NF-UNIT-107: isDirty returns true when a permission is toggled", () => {
    const defaultPerms = ["cases:read", "cases:create"]
    const modified = ["cases:read"]
    expect(isDirty(modified, defaultPerms)).toBe(true)
  })

  it("NF-UNIT-108: isDirty returns false when reset to default", () => {
    const defaultPerms = ["cases:read", "cases:create"]
    expect(isDirty([...defaultPerms], defaultPerms)).toBe(false)
  })

  it("NF-UNIT-109: canEditRoles returns true for scale tier", () => {
    expect(canEditRoles("scale")).toBe(true)
  })

  it("NF-UNIT-110: canEditRoles returns false for growth tier", () => {
    expect(canEditRoles("growth")).toBe(false)
  })

  it("NF-UNIT-111: canEditRoles returns false for starter tier", () => {
    expect(canEditRoles("starter")).toBe(false)
  })

  it("NF-UNIT-112: validateRoleKey accepts valid slugs", () => {
    expect(validateRoleKey("dpo-role")).toBe(true)
    expect(validateRoleKey("auditor_v2")).toBe(true)
    expect(validateRoleKey("support123")).toBe(true)
  })

  it("NF-UNIT-113: validateRoleKey rejects keys with spaces or uppercase", () => {
    expect(validateRoleKey("DPO Role")).toBe(false)
    expect(validateRoleKey("my role")).toBe(false)
    expect(validateRoleKey("ADMIN")).toBe(false)
    expect(validateRoleKey("")).toBe(false)
  })

  it("NF-UNIT-114: cloneRolePermissions from admin returns all permissions", () => {
    const cloned = cloneRolePermissions("admin")
    expect(cloned.length).toBe(TOTAL_PERMISSIONS)
  })

  it("NF-UNIT-115: computeImpactPreview returns affected user refs", async () => {
    const mockGetUsers = vi.fn().mockResolvedValue(["alice@example.com", "bob@example.com"])
    const result = await computeImpactPreview("operator", ["cases:delete"], mockGetUsers)
    expect(result.affectedUsers).toContain("alice@example.com")
    expect(result.affectedUsers).toContain("bob@example.com")
    expect(mockGetUsers).toHaveBeenCalledWith("operator")
  })

})
