/**
 * Permission engine — SLICE-23.
 *
 * Pure-function utilities for the Permission Studio:
 *   - Dependency resolution (iterative fixed-point)
 *   - Permission diff + dirty detection
 *   - Tier-gating
 *   - Role key validation
 *   - Clone helpers
 *   - Impact preview
 */

import { DEFAULT_ROLE_PERMISSIONS } from "../infra/db/repositories/permissions.js"
import type { LicenseTier } from "../license/types.js"

// ── Product tier ──────────────────────────────────────────────────────────────

export type ProductTier = "community" | "starter" | "growth" | "scale"

/**
 * Maps a LicenseTier (from the license JWT) to a ProductTier.
 * null means dev mode — all features enabled → treated as scale.
 */
export function licenseToProductTier(licenseTier: LicenseTier | null): ProductTier {
  if (licenseTier === null) return "scale"   // dev mode → full access
  switch (licenseTier) {
    case "trial":      return "starter"      // trial = Starter features, 30 days (Pattern B)
    case "enterprise": return "scale"        // enterprise = full access
    case "scale":      return "scale"
    case "growth":     return "growth"
    case "starter":    return "starter"
    case "community":  return "community"
    default:           return "community"
  }
}

// ── Tier gate ─────────────────────────────────────────────────────────────────

/**
 * Returns true only when the tier allows role editing (Scale tier only).
 */
export function canEditRoles(tier: ProductTier): boolean {
  return tier === "scale"
}

// ── Role key validation ───────────────────────────────────────────────────────

const ROLE_KEY_RE = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Validates that a role key is a valid slug:
 *   - starts with lowercase letter or digit
 *   - only lowercase letters, digits, hyphens, underscores
 *   - non-empty
 */
export function validateRoleKey(key: string): boolean {
  return ROLE_KEY_RE.test(key)
}

// ── Dependency map ────────────────────────────────────────────────────────────

/**
 * Maps a permission to the permissions it requires.
 * Used by resolveDependencies for automatic prerequisite expansion.
 */
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  "compliance:dsar_export":       ["compliance:dsar_search"],
  "compliance:dsar_search":       ["compliance:read"],
  "cases:delete":                 ["cases:read"],
  "memory:delete":                ["memory:read"],
  "memory:write":                 ["memory:read"],
  "cases:transition":             ["cases:read"],
  "cases:create":                 ["cases:read"],
  "cases:export":                 ["cases:read"],
  "change_requests:create":       ["change_requests:read"],
  "change_requests:approve":      ["change_requests:read"],
  "change_requests:reject":       ["change_requests:read"],
  "change_requests:complete":     ["change_requests:read"],
  "pr_drafts:push":               ["pr_drafts:read"],
  "approvals:act":                ["approvals:read"],
  "signals:dismiss":              ["signals:read"],
  "settings:write":               ["settings:read"],
  "products:create":              ["products:read"],
  "products:update":              ["products:read"],
  "compliance:retention_run":     ["compliance:read"],
}

/**
 * Iterative fixed-point dependency expansion.
 * Keeps adding prerequisites until no new ones are added.
 */
export function resolveDependencies(permissions: Set<string>): Set<string> {
  const result = new Set(permissions)
  let changed = true
  while (changed) {
    changed = false
    for (const perm of [...result]) {
      const deps = PERMISSION_DEPENDENCIES[perm]
      if (deps) {
        for (const dep of deps) {
          if (!result.has(dep)) {
            result.add(dep)
            changed = true
          }
        }
      }
    }
  }
  return result
}

// ── Permission diff ───────────────────────────────────────────────────────────

export interface PermissionDiff {
  added: string[]
  removed: string[]
}

/**
 * Computes what changed between the current permission set and a default set.
 * added   = in current but not in default
 * removed = in default but not in current
 */
export function getPermissionDiff(current: string[], defaultPerms: string[]): PermissionDiff {
  const currentSet = new Set(current)
  const defaultSet = new Set(defaultPerms)

  const added = current.filter((p) => !defaultSet.has(p))
  const removed = defaultPerms.filter((p) => !currentSet.has(p))

  return { added, removed }
}

/**
 * Returns true if current differs from defaultPerms in any way.
 */
export function isDirty(current: string[], defaultPerms: string[]): boolean {
  const diff = getPermissionDiff(current, defaultPerms)
  return diff.added.length > 0 || diff.removed.length > 0
}

// ── Clone helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a mutable copy of the default permissions for a given role.
 * Returns [] if the roleId is not a known default role.
 */
export function cloneRolePermissions(sourceRoleId: string): string[] {
  const perms = DEFAULT_ROLE_PERMISSIONS[sourceRoleId]
  if (!perms) return []
  return [...perms]
}

// ── Impact preview ────────────────────────────────────────────────────────────

export interface ImpactPreview {
  affectedUsers: string[]
}

/**
 * Returns the list of users that would be affected by removing the given
 * permissions from a role.
 *
 * @param roleId           The role being edited
 * @param removedPermissions Permissions being removed
 * @param getUsersForRole  Async callback that resolves user refs for the role
 */
export async function computeImpactPreview(
  roleId: string,
  removedPermissions: string[],
  getUsersForRole: (roleId: string) => Promise<string[]>,
): Promise<ImpactPreview> {
  // If nothing is being removed, no users are affected
  if (removedPermissions.length === 0) {
    return { affectedUsers: [] }
  }

  const users = await getUsersForRole(roleId)
  return { affectedUsers: users }
}
