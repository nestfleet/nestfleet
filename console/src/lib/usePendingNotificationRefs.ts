// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * usePendingNotificationRefs
 *
 * Returns a Set of source_ref values that have at least one actionable
 * notification:  status === "pending"  OR  (ack_required AND !acked_at).
 *
 * Used by list pages (Cases, Approvals, PR Drafts) to render an amber
 * indicator dot on rows that need attention.
 *
 * Fetches once per page load + refreshes every 60s (lower cadence than the
 * main list because this is supplementary data, not critical).
 */

import useSWR from "swr";
import { getNotificationsApi } from "@/lib/api";
import type { Notification } from "@/lib/types";

function isActionable(n: Notification): boolean {
  if (n.status === "pending") return true;
  if (n.ack_required && !n.acked_at) return true;
  return false;
}

export function usePendingNotificationRefs(productId: string | null): Set<string> {
  const { data } = useSWR(
    productId ? ["notif-pending-refs", productId] : null,
    () => getNotificationsApi(productId!, { limit: 500 }),
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const refs = new Set<string>();
  for (const n of data?.data ?? []) {
    if (isActionable(n) && n.source_ref) {
      refs.add(n.source_ref);
    }
  }
  return refs;
}
