/**
 * Canonical role constants for NestFleet operator users.
 * Single source of truth used by the API, auth middleware, and seed scripts.
 */

export const ROLES = [
  "admin",
  "operator",
  "support_lead",
  "change_lead",
  "product_lead",
  "knowledge_lead",
] as const

export type Role = typeof ROLES[number]

export function isValidRole(role: string): role is Role {
  return ROLES.includes(role as Role)
}
