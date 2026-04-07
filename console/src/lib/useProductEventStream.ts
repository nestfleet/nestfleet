"use client";

/**
 * useProductEventStream — INFRA-01.
 *
 * Opens an SSE connection to `GET /api/v1/products/:productId/events` while
 * the product is active in the layout. Handles reconnection on error.
 *
 * Auth: EventSource does not support custom headers, so the JWT is passed via
 * `?token=<jwt>` query parameter (HTTPS-encrypted in production).
 *
 * Events handled:
 *   - chat_message   → fires a toast with the truncated text
 *   - badge_update   → (reserved for future badge context update)
 *   - notification   → fires a toast with the subject
 *   - ping           → ignored (keepalive)
 *   - connected      → logged (stream ready confirmation)
 */

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { useProductId } from "./product-context";
import { useToast } from "@/components/Toast";

const API_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
    : "";

type OperatorEvent =
  | { type: "chat_message"; productId: string; caseId: string; sessionId: string; text: string; ts: string }
  | { type: "notification"; productId: string; kind: string; subject: string; ts: string }
  | { type: "badge_update"; productId: string; openChats: number; pendingApprovals: number; ts: string }
  | { type: "ping"; ts: string }
  | { type: "connected"; productId: string; ts: string }

export function useProductEventStream() {
  const productId   = useProductId();
  const { toast }   = useToast();
  const esRef       = useRef<EventSource | null>(null);
  const reconnectTm = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const token = (typeof localStorage !== "undefined"
        ? localStorage.getItem("nestfleet_token")
        : null) ?? "";

      const url = `${API_URL}/api/v1/products/${encodeURIComponent(productId)}/events?token=${encodeURIComponent(token)}`;
      const es  = new EventSource(url);
      esRef.current = es;

      es.addEventListener("operator", (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as OperatorEvent;
          switch (event.type) {
            case "chat_message":
              toast(`New chat message: "${event.text.slice(0, 80)}"`, "info");
              // Revalidate the Live Chats SWR key so the tab badge and list update immediately
              mutate(["queue-live-chats", productId]);
              break;
            case "notification":
              toast(event.subject.slice(0, 100), "info");
              break;
            case "badge_update":
            case "ping":
            case "connected":
              // no-op for now; badge_update reserved for future badge context integration
              break;
          }
        } catch {
          // malformed event — ignore
        }
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!cancelled) {
          // Reconnect after 5 s with jitter
          reconnectTm.current = setTimeout(connect, 5_000 + Math.random() * 2_000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTm.current) clearTimeout(reconnectTm.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [productId, toast]);
}
