"use client";

/**
 * ProductEventStream — INFRA-01.
 *
 * Thin client component wrapper so the layout (a Server Component) can mount
 * the `useProductEventStream` hook. Renders nothing — side-effect only.
 */

import { useProductEventStream } from "@/lib/useProductEventStream";

export function ProductEventStream() {
  useProductEventStream();
  return null;
}
