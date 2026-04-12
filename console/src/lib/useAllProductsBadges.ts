// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * useAllProductsBadges — DEFERRED-21 N-01.
 *
 * Polls queue (awaiting-lead cases) + pending approvals for EVERY product the
 * user has access to and returns a per-product summary. Runs in the background
 * so the product switcher dropdown can show per-product unread counts and the
 * switcher button can show an ambient dot when another product needs attention.
 *
 * Refresh interval: 2 minutes (lower priority than the active product's 60s poll).
 * Effect-based (not useSWR) to avoid the hooks-inside-map ESLint violation.
 *
 * Returns an empty object when the user has 0 or 1 products (no switcher shown).
 */

import { useEffect, useRef, useState } from "react";
import { getCasesApi, getPendingApprovalsApi } from "./api";
import { useProducts } from "./product-context";

export interface ProductBadgeSummary {
  productId: string;
  slug:      string;
  name:      string;
  queue:     number;   // awaiting-lead cases
  approvals: number;   // pending approvals
  total:     number;   // queue + approvals
}

const POLL_INTERVAL = 2 * 60_000; // 2 minutes

export function useAllProductsBadges(): Record<string, ProductBadgeSummary> {
  const products = useProducts();
  const [badges, setBadges] = useState<Record<string, ProductBadgeSummary>>({});
  // Stable ref so the interval callback always sees current products
  const productsRef = useRef(products);
  productsRef.current = products;

  useEffect(() => {
    if (products.length <= 1) {
      // No switcher shown for 0–1 products — no need to poll
      setBadges({});
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const current = productsRef.current;
      if (!current.length) return;

      const results = await Promise.allSettled(
        current.map(async (p) => {
          const [queueRes, approvalsRes] = await Promise.allSettled([
            getCasesApi(p.productId, { status: "awaiting-lead" }),
            getPendingApprovalsApi(p.productId),
          ]);
          const queue     = queueRes.status     === "fulfilled" ? (queueRes.value.data?.length     ?? 0) : 0;
          const approvals = approvalsRes.status === "fulfilled" ? (approvalsRes.value.data?.length ?? 0) : 0;
          return { productId: p.productId, slug: p.slug, name: p.name, queue, approvals, total: queue + approvals };
        })
      );

      if (cancelled) return;

      const map: Record<string, ProductBadgeSummary> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          map[r.value.productId] = r.value;
        }
      }
      setBadges(map);
    }

    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [products.length]); // re-init only when product count changes, not on every render

  return badges;
}
