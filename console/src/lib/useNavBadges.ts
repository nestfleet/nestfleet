// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * useNavBadges
 *
 * Tracks "new / unread" item counts for Queue, Cases, Approvals and PR Drafts.
 * Uses the same localStorage-timestamp pattern as useNotificationBadge:
 *   - when you visit a tab, that tab's lastSeenAt is updated to now()
 *   - the badge shows items created AFTER that timestamp
 *
 * The Sidebar calls markSeen(tab) automatically on pathname change.
 * localStorage keys are namespaced per product to avoid cross-product pollution.
 */

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { getCasesApi, getPendingApprovalsApi, getPrDraftedChangeRequestsApi } from "./api";
import { useProductIdWithFallback } from "./product-context";

export type NavTab = "queue" | "cases" | "approvals" | "pr-drafts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(productId: string): string {
  return productId ? `nestfleet_nav_seen_at__${productId}` : "nestfleet_nav_seen_at";
}

function readStorage(productId: string): Partial<Record<NavTab, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(productId));
    return raw ? (JSON.parse(raw) as Partial<Record<NavTab, string>>) : {};
  } catch {
    return {};
  }
}

function writeStorage(productId: string, map: Partial<Record<NavTab, string>>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(productId), JSON.stringify(map));
}

function countNew(
  items: Array<{ created_at: string }>,
  lastSeenIso: string | undefined,
): number {
  if (!lastSeenIso) return items.length; // first visit → everything is new
  const ts = new Date(lastSeenIso).getTime();
  return items.filter((i) => new Date(i.created_at).getTime() > ts).length;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface NavBadges {
  queue: number;
  cases: number;
  approvals: number;
  "pr-drafts": number;
}

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: true,
  shouldRetryOnError: false,
};

export function useNavBadges(): { badges: NavBadges; markSeen: (tab: NavTab) => void } {
  const productId = useProductIdWithFallback();
  const [lastSeenMap, setLastSeenMap] = useState<Partial<Record<NavTab, string>>>({});

  // Hydrate from localStorage after mount (avoids SSR mismatch). Intentional
  // one-time client-only read with no SSR equivalent — not derivable during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSeenMap(readStorage(productId));
  }, [productId]);

  // ── Data fetches (one per tab) ────────────────────────────────────────────
  const { data: queueData } = useSWR(
    productId ? ["queue-badge", productId] : null,
    () => getCasesApi(productId, { status: "awaiting-lead" }),
    SWR_OPTS,
  );

  const { data: casesData } = useSWR(
    productId ? ["cases-badge", productId] : null,
    () => getCasesApi(productId),
    SWR_OPTS,
  );

  const { data: approvalsData } = useSWR(
    productId ? ["approvals-badge", productId] : null,
    () => getPendingApprovalsApi(productId),
    SWR_OPTS,
  );

  const { data: prDraftsData } = useSWR(
    productId ? ["pr-drafts-badge", productId] : null,
    () => getPrDraftedChangeRequestsApi(productId),
    SWR_OPTS,
  );

  // ── Mark a tab as seen ────────────────────────────────────────────────────
  const markSeen = useCallback((tab: NavTab) => {
    const now = new Date().toISOString();
    const updated = { ...readStorage(productId), [tab]: now };
    writeStorage(productId, updated);
    setLastSeenMap(updated);
  }, [productId]);

  // ── Compute badges ────────────────────────────────────────────────────────
  const badges: NavBadges = {
    queue:        countNew(queueData?.data     ?? [], lastSeenMap["queue"]),
    cases:        countNew(casesData?.data     ?? [], lastSeenMap["cases"]),
    approvals:    countNew(approvalsData?.data ?? [], lastSeenMap["approvals"]),
    "pr-drafts":  countNew(prDraftsData?.data  ?? [], lastSeenMap["pr-drafts"]),
  };

  return { badges, markSeen };
}
