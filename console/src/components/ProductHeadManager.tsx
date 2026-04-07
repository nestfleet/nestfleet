"use client";

/**
 * ProductHeadManager — DEFERRED-21 N-02.
 *
 * Manages document.title to give multi-tab users an at-a-glance signal of
 * unread activity without switching tabs.
 *
 * Format:
 *   - Unread items present:  "(5) SkillSeal | NestFleet"
 *   - No unread items:       "SkillSeal | NestFleet"
 *   - No product context:    "NestFleet"
 *
 * The count reflects the active product's total unread:
 *   queue (awaiting-lead) + pending approvals + unseen notifications
 *
 * This runs inside AppLayout, which is always mounted when the app is open,
 * so the title stays current as badge counts update via their own SWR polls.
 *
 * Renders nothing — pure side-effect component.
 */

import { useEffect } from "react";
import { useProductSafe } from "@/lib/product-context";
import { useNavBadges } from "@/lib/useNavBadges";
import { useNotificationBadge } from "@/lib/useNotificationBadge";

const APP_NAME = "NestFleet";

export function ProductHeadManager() {
  const productCtx   = useProductSafe();
  const { badges }   = useNavBadges();
  const { unseenCount } = useNotificationBadge();

  const productName = productCtx?.product.name ?? null;

  // Total unread for the active product across all tracked surfaces
  const total =
    (badges.queue ?? 0) +
    (badges.approvals ?? 0) +
    (unseenCount ?? 0);

  useEffect(() => {
    const base = productName ? `${productName} | ${APP_NAME}` : APP_NAME;
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, [productName, total]);

  // Reset to app name when this component unmounts (e.g., user logs out)
  useEffect(() => {
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return null;
}
