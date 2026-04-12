// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ProductContext — DEFERRED-21 Multi-Product Console Architecture.
 *
 * Canonical product truth flows: URL slug → ProductProvider → useProductId()
 *
 * Hooks:
 *   useProductId()           — throws if called outside ProductProvider
 *   useProductSafe()         — returns null if called outside ProductProvider
 *   useProductIdWithFallback() — falls back to NEXT_PUBLIC_PRODUCT_ID (for legacy pages)
 *   useProduct()             — the full ProductSummary from context
 *   useProducts()            — all products the user has access to
 *   useSwitchProduct()       — navigate to a different product's URL
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { getProductsApi, ApiError, type ProductSummary } from "./api";
import { recordMruVisit } from "./useProductMru";

// ─── Context value ────────────────────────────────────────────────────────────

interface ProductContextValue {
  product:         ProductSummary;
  products:        ProductSummary[];
  switchProduct:   (slug: string) => void;
  refreshProducts: () => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ProductProviderProps {
  /** Slug from the URL — comes from route params in (app)/p/[slug]/layout.tsx */
  slug:     string;
  children: ReactNode;
}

function setLastProductCookie(slug: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `nf_last_product=${encodeURIComponent(slug)}; path=/; SameSite=Lax; max-age=${maxAge}`;
}

export function ProductProvider({ slug, children }: ProductProviderProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [product, setProduct]   = useState<ProductSummary | null>(null);

  const loadProducts = useCallback(() => {
    getProductsApi().then((res) => {
      const list  = res.products ?? [];
      const match = list.find((p) => p.slug === slug) ?? null;

      // U-04: slug not in user's product list — show 404 instead of silently
      // falling back to the first product (which would serve wrong-product data).
      if (list.length > 0 && !match) {
        router.replace("/not-found");
        return;
      }

      setProducts(list);
      setProduct(match);
      if (match) {
        setLastProductCookie(match.slug);
        recordMruVisit(match.slug);
      }
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      }
      // other errors: silently swallow — page will show empty state
    });
  }, [slug, router]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // U-01: preserve the current page segment when switching products.
  // e.g. /p/skillseal/approvals → /p/docugardener/approvals (not always /cases)
  const switchProduct = useCallback((targetSlug: string) => {
    setLastProductCookie(targetSlug);
    recordMruVisit(targetSlug);
    const pageSegment = pathname.replace(/^\/p\/[^/]+/, "") || "/cases";
    router.push(`/p/${targetSlug}${pageSegment}`);
  }, [router, pathname]);

  const refreshProducts = useCallback(() => {
    loadProducts();
  }, [loadProducts]);

  // Wait until we have resolved the active product before rendering children.
  // This prevents a flash where hooks return stale data.
  if (!product) return null;

  return (
    <ProductContext.Provider value={{ product, products, switchProduct, refreshProducts }}>
      {children}
    </ProductContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Returns the active productId. Throws if called outside <ProductProvider>. */
export function useProductId(): string {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProductId must be used inside <ProductProvider>");
  return ctx.product.productId;
}

/** Returns the context value or null — safe to call outside <ProductProvider>. */
export function useProductSafe(): ProductContextValue | null {
  return useContext(ProductContext);
}

/**
 * Returns the active productId.
 * Falls back to process.env.NEXT_PUBLIC_PRODUCT_ID when called outside
 * <ProductProvider> — allows legacy pages to remain untouched during migration.
 */
export function useProductIdWithFallback(): string {
  const ctx = useContext(ProductContext);
  if (ctx) return ctx.product.productId;
  return process.env.NEXT_PUBLIC_PRODUCT_ID ?? "";
}

/** Returns the full ProductSummary for the active product. */
export function useProduct(): ProductSummary {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProduct must be used inside <ProductProvider>");
  return ctx.product;
}

/** Returns all products the user has access to. */
export function useProducts(): ProductSummary[] {
  const ctx = useContext(ProductContext);
  if (!ctx) return [];
  return ctx.products;
}

/** Returns the slug-based path prefix for the active product, e.g. "/p/skillseal".
 *  Falls back to "" when rendered outside ProductProvider (legacy pages). */
export function useProductBasePath(): string {
  const ctx = useContext(ProductContext);
  if (!ctx) return "";
  return `/p/${ctx.product.slug}`;
}

/** Returns a callback to navigate to a different product. */
export function useSwitchProduct(): (slug: string) => void {
  const ctx = useContext(ProductContext);
  if (!ctx) return () => {};
  return ctx.switchProduct;
}

/** Returns a callback to re-fetch the products list (e.g. after adding a product). */
export function useRefreshProducts(): () => void {
  const ctx = useContext(ProductContext);
  if (!ctx) return () => {};
  return ctx.refreshProducts;
}
