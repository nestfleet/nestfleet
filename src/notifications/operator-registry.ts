// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Operator real-time event registry — INFRA-01.
 *
 * In-memory pub/sub keyed by productId. Connects the server-side event
 * producers (chat ingress, auto-reply worker, notification service) to the
 * open SSE streams in the operator console.
 *
 * Mirrors the pattern in src/chat/session-registry.ts but is scoped to the
 * operator side: one subscription per operator browser tab per product.
 *
 * Limitation: single-process only. Multi-instance deployments would need
 * a Redis pub/sub layer (same caveat as session-registry.ts).
 */

type Listener = (event: OperatorEvent) => void

const _listeners = new Map<string, Set<Listener>>()

// ── Event types ───────────────────────────────────────────────────────────────

export type OperatorEvent =
  | { type: "chat_message";  productId: string; caseId: string; sessionId: string; text: string; ts: string }
  | { type: "notification";  productId: string; kind: string; subject: string; ts: string }
  | { type: "badge_update";  productId: string; openChats: number; pendingApprovals: number; ts: string }

// ── Registry API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to operator events for a product.
 * Returns an unsubscribe function — call it when the SSE connection closes.
 */
export function subscribe(productId: string, fn: Listener): () => void {
  if (!_listeners.has(productId)) {
    _listeners.set(productId, new Set())
  }
  _listeners.get(productId)!.add(fn)

  return () => {
    const set = _listeners.get(productId)
    if (set) {
      set.delete(fn)
      if (set.size === 0) _listeners.delete(productId)
    }
  }
}

/**
 * Publish an event to all open SSE connections watching this product.
 * No-op if nobody is listening (all operator tabs are closed).
 */
export function publish(productId: string, event: OperatorEvent): void {
  _listeners.get(productId)?.forEach((fn) => fn(event))
}

/** Returns true if at least one SSE connection is open for this product. */
export function hasListeners(productId: string): boolean {
  const set = _listeners.get(productId)
  return !!(set && set.size > 0)
}
