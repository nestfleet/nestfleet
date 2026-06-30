// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ProductCommandPalette — DEFERRED-21 U-07.
 *
 * Opens on Cmd+K / Ctrl+K. Lets operators search and switch products without
 * using the mouse. Safe to mount in AppLayout — renders nothing when called
 * outside ProductProvider (legacy pages) or when products.length <= 1.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import clsx from "clsx";
import { useProductSafe, useProducts, useSwitchProduct } from "@/lib/product-context";
import { useProductMru } from "@/lib/useProductMru";

export function ProductCommandPalette() {
  const ctx = useProductSafe();
  const products = useProducts();
  const switchProduct = useSwitchProduct();
  const { sortProducts } = useProductMru();

  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcut to open/close ─────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Auto-focus input on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Defer to next tick so the element is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // ── Filtered + sorted product list ──────────────────────────────────────────
  const sorted   = sortProducts(products);
  const filtered = query.trim()
    ? sorted.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  // ── Keyboard navigation inside the list ─────────────────────────────────────
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) {
        switchProduct(target.slug);
        close();
      }
    }
  }

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Render nothing outside ProductProvider
  if (!ctx) return null;

  const currentSlug = ctx.product.slug;

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40"
      onMouseDown={(e) => {
        // Close when clicking directly on the backdrop (not on the panel)
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Product switcher"
    >
      {/* Panel */}
      <div className="w-full max-w-md mx-4 bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg
            className="h-4 w-4 text-gray-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-hidden bg-transparent"
            placeholder="Switch product…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
            esc
          </kbd>
        </div>

        {/* Results list */}
        <ul
          role="listbox"
          className="max-h-72 overflow-y-auto py-1"
        >
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">
              No products match &ldquo;{query}&rdquo;
            </li>
          )}
          {filtered.map((p, i) => {
            const isActive  = i === activeIndex;
            const isCurrent = p.slug === currentSlug;
            return (
              <li
                key={p.productId}
                role="option"
                aria-selected={isCurrent}
                className={clsx(
                  "flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm",
                  isActive ? "bg-indigo-50" : "hover:bg-gray-50",
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  switchProduct(p.slug);
                  close();
                }}
              >
                {/* Accent dot */}
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.accentColor ?? "#6366f1" }}
                  aria-hidden="true"
                />

                {/* Name */}
                <span className={clsx("flex-1 font-medium", isActive ? "text-indigo-700" : "text-gray-800")}>
                  {p.name}
                </span>

                {/* Stage chip */}
                {p.stage && (
                  <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    {p.stage}
                  </span>
                )}

                {/* Active checkmark */}
                {isCurrent && (
                  <svg
                    className="h-4 w-4 text-indigo-500 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400">
          <span><kbd className="font-sans">↑↓</kbd> navigate</span>
          <span><kbd className="font-sans">↵</kbd> select</span>
          <span><kbd className="font-sans">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
