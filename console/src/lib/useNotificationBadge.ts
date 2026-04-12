// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * useNotificationBadge
 *
 * Tracks how many notifications the user hasn't seen yet by comparing
 * notification `created_at` against a `lastSeenAt` timestamp stored in
 * localStorage. The key is namespaced per product.
 *
 * Call `markSeen()` when the user opens the Notifications page.
 */

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { getNotificationsApi } from "./api";
import { useProductIdWithFallback } from "./product-context";

function notifStorageKey(productId: string): string {
  return productId
    ? `nestfleet_notifications_seen_at__${productId}`
    : "nestfleet_notifications_seen_at";
}

function getLastSeenAt(productId: string): Date | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(notifStorageKey(productId));
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function useNotificationBadge() {
  const productId = useProductIdWithFallback();
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setLastSeenAt(getLastSeenAt(productId));
  }, [productId]);

  const { data } = useSWR(
    productId ? ["notifications-badge", productId] : null,
    () => getNotificationsApi(productId, { limit: 100 }),
    {
      // Poll every 60s so the badge stays fresh across pages
      refreshInterval:   60_000,
      revalidateOnFocus: true,
      // Don't throw — badge is non-critical
      shouldRetryOnError: false,
    }
  );

  const notifications = data?.data ?? [];

  // Count notifications created after lastSeenAt
  const unseenCount = lastSeenAt === null
    ? notifications.length   // first visit — everything is "new"
    : notifications.filter(
        (n) => new Date(n.created_at).getTime() > lastSeenAt.getTime()
      ).length;

  const markSeen = useCallback(() => {
    const now = new Date();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(notifStorageKey(productId), now.toISOString());
    }
    setLastSeenAt(now);
  }, [productId]);

  return { unseenCount, lastSeenAt, markSeen };
}
