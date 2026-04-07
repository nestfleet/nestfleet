"use client";

/**
 * useSWRBroadcast + SWRBroadcastListener — DEFERRED-21 N-04.
 *
 * Cross-tab SWR cache invalidation via BroadcastChannel.
 *
 * Problem: two tabs on the same product have independent SWR caches. When Tab A
 * approves a CR, Tab B keeps showing the stale "pending" state until its 60s
 * poll fires. BroadcastChannel lets Tab A signal Tab B to revalidate immediately.
 *
 * Architecture:
 *   SWRBroadcastListener  — mounts in AppLayout; listens for messages and calls
 *                           global SWR mutate() to revalidate matching keys.
 *   broadcastInvalidation — call this after any mutation; posts to the channel.
 *
 * Message format:
 *   { type: "invalidate", productId: string, keys: string[] }
 *   keys = SWR key fragments to match (e.g. "approvals", "cases").
 *   Any cached SWR key that is an array AND contains one of the fragments
 *   (as an element) will be revalidated.
 *
 * Usage in a mutation site:
 *   await submitApprovalApi(productId, crId);
 *   broadcastInvalidation(productId, ["approvals", "cases"]);
 */

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { useProductSafe } from "./product-context";

const CHANNEL = "nestfleet-swr";

interface BroadcastMsg {
  type:      "invalidate";
  productId: string;
  keys:      string[];
}

// ─── Listener component ───────────────────────────────────────────────────────

/**
 * Mount once inside AppLayout. Listens on the BroadcastChannel and triggers
 * SWR global revalidation for any key that matches the incoming fragments.
 */
export function useSWRBroadcastListener() {
  const { mutate } = useSWRConfig();
  const productCtx = useProductSafe();
  const productId  = productCtx?.product.productId ?? null;

  useEffect(() => {
    if (!productId || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CHANNEL);

    channel.onmessage = (evt: MessageEvent<BroadcastMsg>) => {
      const msg = evt.data;
      if (msg.type !== "invalidate" || msg.productId !== productId) return;

      // Global SWR mutate with a key filter — revalidates every matching cache entry.
      // SWR v2+ supports passing a filter function to the global mutate.
      mutate(
        (key: unknown) => {
          if (!Array.isArray(key)) return false;
          return msg.keys.some((fragment) => key.includes(fragment));
        },
        undefined,
        { revalidate: true }
      );
    };

    return () => channel.close();
  }, [productId, mutate]);
}

// ─── Emitter ──────────────────────────────────────────────────────────────────

/**
 * Call this after a mutation to notify sibling tabs on the same product.
 *
 * @param productId  The product ID the mutation affected.
 * @param keys       SWR key fragments to invalidate (e.g. ["approvals", "cases"]).
 *
 * @example
 *   await submitApprovalApi(productId, crId);
 *   broadcastInvalidation(productId, ["approvals"]);
 */
export function broadcastInvalidation(productId: string, keys: string[]): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  const msg: BroadcastMsg = { type: "invalidate", productId, keys };
  channel.postMessage(msg);
  channel.close(); // fire-and-forget
}
