// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * CrossProductNotifier — DEFERRED-21 N-03.
 *
 * Watches badge counts for all products and fires a toast when a non-active
 * product's unread count increases between polls.
 *
 * Design decisions:
 *   - Baseline is captured silently on the first non-empty response — no toast
 *     on initial load (prevents spam on page refresh).
 *   - Resets baseline when the active product changes (prevents false positives
 *     caused by the polling catching up after a switch).
 *   - Toasts for queue and approvals separately so the operator knows where to
 *     look ("Acme: 2 new queue items" vs "Acme: 1 new approval").
 *   - Renders nothing — pure side-effect component.
 */

import { useEffect, useRef } from "react";
import { useAllProductsBadges, type ProductBadgeSummary } from "@/lib/useAllProductsBadges";
import { useProductSafe } from "@/lib/product-context";
import { useToast } from "./Toast";

interface PrevSnapshot {
  queue:     number;
  approvals: number;
}

export function CrossProductNotifier() {
  const { toast }    = useToast();
  const allBadges    = useAllProductsBadges();
  const productCtx   = useProductSafe();
  const activeId     = productCtx?.product.productId ?? null;

  // Ref holding the last-seen counts per product — not state so it doesn't
  // cause re-renders, and survives between poll ticks.
  const prevRef      = useRef<Record<string, PrevSnapshot>>({});
  const initializedRef = useRef(false);
  // Track active product so we can reset baseline on switch
  const prevActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    const entries = Object.entries(allBadges) as [string, ProductBadgeSummary][];
    if (!entries.length) return;

    // Reset baseline when the active product changes to avoid false positives
    if (prevActiveIdRef.current !== activeId) {
      prevActiveIdRef.current = activeId;
      initializedRef.current  = false;
      prevRef.current         = {};
    }

    if (!initializedRef.current) {
      // First poll after mount (or product switch) — capture baseline silently
      for (const [pid, s] of entries) {
        prevRef.current[pid] = { queue: s.queue, approvals: s.approvals };
      }
      initializedRef.current = true;
      return;
    }

    // Subsequent polls — look for increases in non-active products
    for (const [pid, s] of entries) {
      if (pid === activeId) {
        prevRef.current[pid] = { queue: s.queue, approvals: s.approvals };
        continue;
      }

      const prev = prevRef.current[pid] ?? { queue: 0, approvals: 0 };
      const queueDelta     = s.queue     - prev.queue;
      const approvalsDelta = s.approvals - prev.approvals;

      if (queueDelta > 0) {
        toast(
          `${s.name}: ${queueDelta} new queue item${queueDelta !== 1 ? "s" : ""} waiting`,
          "info"
        );
      }
      if (approvalsDelta > 0) {
        toast(
          `${s.name}: ${approvalsDelta} approval${approvalsDelta !== 1 ? "s" : ""} need review`,
          "info"
        );
      }

      prevRef.current[pid] = { queue: s.queue, approvals: s.approvals };
    }
  }, [allBadges, activeId, toast]);

  return null;
}
