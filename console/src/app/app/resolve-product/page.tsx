// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * /app/resolve-product — DEFERRED-21 U-03.
 *
 * Legacy NEXT_PUBLIC_PRODUCT_ID migration path (spec §17).
 * Steps: fetch user's products → match hintId → set nf_last_product cookie → redirect.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProductsApi } from "@/lib/api";

function setLastProductCookie(slug: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `nf_last_product=${encodeURIComponent(slug)}; path=/; SameSite=Lax; max-age=${maxAge}`;
}

// Inner component — useSearchParams() must be inside Suspense
function ResolveProductInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hintId =
      searchParams.get("productId") ??
      process.env.NEXT_PUBLIC_PRODUCT_ID ??
      null;

    getProductsApi()
      .then((res) => {
        const list = res.products ?? [];
        if (!list.length) {
          router.replace("/setup");
          return;
        }
        const match = hintId
          ? (list.find((p) => p.productId === hintId) ?? list[0])
          : list[0];
        setLastProductCookie(match.slug);
        router.replace(`/p/${match.slug}/queue`);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-500">Resolving your workspace…</p>
      </div>
    </div>
  );
}

export default function ResolveProductPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      }
    >
      <ResolveProductInner />
    </Suspense>
  );
}
