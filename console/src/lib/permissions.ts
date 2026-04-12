// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Role-based permission helper for frontend conditional rendering.
 *
 * Mirrors the backend requireRole() guard — admin is a superuser
 * that bypasses all checks.
 */

export type Role = "admin" | "operator" | "support_lead" | "change_lead" | "product_lead" | "knowledge_lead";

/** Which sidebar nav items each role can see */
const NAV_ACCESS: Record<string, Role[]> = {
  dashboard:     ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"],
  cases:         ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"],
  approvals:     ["admin", "change_lead", "product_lead"],
  "pr-drafts":   ["admin", "operator", "support_lead", "change_lead", "product_lead"],
  notifications: ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"],
  analytics:     ["admin", "operator"],
  settings:      ["admin", "operator"],
  compliance:    ["admin"],
};

/** Which actions each role can perform */
const ACTION_ACCESS: Record<string, Role[]> = {
  // Case actions
  "case.patch":              ["admin", "support_lead"],
  "case.resolve":            ["admin", "support_lead"],
  "case.triage_manual":      ["admin", "support_lead", "product_lead"],
  "case.draft_clarification": ["admin", "operator", "support_lead"],
  "case.send_to_change":     ["admin", "support_lead", "change_lead", "product_lead"],

  // Approval actions
  "approval.approve":        ["admin", "change_lead", "product_lead"],
  "approval.reject":         ["admin", "change_lead", "product_lead"],

  // PR Draft actions
  "pr_draft.complete":       ["admin", "change_lead"],

  // Settings actions
  "settings.view":           ["admin", "operator"],
  "settings.edit":           ["admin"],
  "settings.users":          ["admin"],
  "settings.license":        ["admin"],

  // Memory actions
  "memory.view":             ["admin", "operator", "knowledge_lead"],
  "memory.delete":           ["admin"],

  // Compliance actions (CG-03, CG-04)
  "compliance.dsar":         ["admin"],
  "compliance.retention":    ["admin"],
  "compliance.case_delete":  ["admin"],
};

/**
 * Checks if the user's roles grant access to a nav item.
 */
export function canAccessNav(userRoles: string[], navKey: string): boolean {
  if (userRoles.includes("admin")) return true;
  const allowed = NAV_ACCESS[navKey];
  if (!allowed) return true; // unknown nav = allow (fail open for non-sensitive items)
  return allowed.some((r) => userRoles.includes(r));
}

/**
 * Checks if the user's roles grant permission to perform an action.
 */
export function canPerformAction(userRoles: string[], action: string): boolean {
  if (userRoles.includes("admin")) return true;
  const allowed = ACTION_ACCESS[action];
  if (!allowed) return false; // unknown action = deny (fail closed)
  return allowed.some((r) => userRoles.includes(r));
}
