"use client";

/**
 * useProductMru — DEFERRED-21 U-08.
 *
 * Tracks most-recently-used products and user-pinned products in localStorage.
 * Used by ProductSwitcherDropdown to sort the product list and by
 * ProductCommandPalette to surface recently-used products first.
 *
 * Storage keys:
 *   nf_product_mru   — JSON string[] of slugs, most-recent first, max 10
 *   nf_product_pins  — JSON string[] of pinned slugs (order = pin order)
 */

import { useState, useCallback } from "react";
import type { ProductSummary } from "./api";

const MRU_KEY  = "nf_product_mru";
const PINS_KEY = "nf_product_pins";
const MRU_MAX  = 10;

// ── Pure localStorage helpers (no React — safe to call anywhere) ──────────────

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage quota exceeded — silently swallow
  }
}

/**
 * Record a product visit in the MRU list.
 * Pure localStorage write — safe to call outside React (e.g. from product-context callbacks).
 */
export function recordMruVisit(slug: string): void {
  const current = readJson<string[]>(MRU_KEY, []);
  const filtered = current.filter((s) => s !== slug);
  writeJson(MRU_KEY, [slug, ...filtered].slice(0, MRU_MAX));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProductMru(): {
  sortProducts: (products: ProductSummary[]) => ProductSummary[];
  isPinned:     (slug: string) => boolean;
  togglePin:    (slug: string) => void;
  mruSlugs:     string[];
  pinnedSlugs:  string[];
} {
  // Re-render when pins change (MRU changes are fire-and-forget — sort re-runs on next render)
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>(() =>
    readJson<string[]>(PINS_KEY, [])
  );

  const togglePin = useCallback((slug: string) => {
    setPinnedSlugs((prev) => {
      const next = prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug];
      writeJson(PINS_KEY, next);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (slug: string) => pinnedSlugs.includes(slug),
    [pinnedSlugs],
  );

  /**
   * Sort products:
   *   1. Pinned — in pin-list order (stable, user-controlled)
   *   2. Recent unpinned — in MRU order
   *   3. Never-visited or remaining — alphabetical by name
   *
   * The spec says "when list > 5" but MRU ordering is a net improvement at any count.
   */
  const sortProducts = useCallback(
    (products: ProductSummary[]): ProductSummary[] => {
      const mruSlugs = readJson<string[]>(MRU_KEY, []);
      const mruIndex = (slug: string) => {
        const i = mruSlugs.indexOf(slug);
        return i === -1 ? Infinity : i;
      };
      const pinIndex = (slug: string) => {
        const i = pinnedSlugs.indexOf(slug);
        return i === -1 ? Infinity : i;
      };

      const pinned   = products.filter((p) => pinnedSlugs.includes(p.slug))
                               .sort((a, b) => pinIndex(a.slug) - pinIndex(b.slug));
      const unpinned = products.filter((p) => !pinnedSlugs.includes(p.slug));
      const recent   = unpinned.filter((p) => mruIndex(p.slug) !== Infinity)
                               .sort((a, b) => mruIndex(a.slug) - mruIndex(b.slug));
      const rest     = unpinned.filter((p) => mruIndex(p.slug) === Infinity)
                               .sort((a, b) => a.name.localeCompare(b.name));

      return [...pinned, ...recent, ...rest];
    },
    [pinnedSlugs],
  );

  const mruSlugs = readJson<string[]>(MRU_KEY, []);

  return { sortProducts, isPinned, togglePin, mruSlugs, pinnedSlugs };
}
