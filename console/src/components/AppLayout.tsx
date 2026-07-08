// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { GracePeriodBanner } from "./GracePeriodBanner";
import { LicenseStatusBanner } from "./LicenseStatusBanner";
import { OuUsageBanner } from "./OuUsageBanner";
import { ProductHeadManager } from "./ProductHeadManager";
import { CrossProductNotifier } from "./CrossProductNotifier";
import { ProductCommandPalette } from "./ProductCommandPalette";
import { useSWRBroadcastListener } from "@/lib/useSWRBroadcast";
import clsx from "clsx";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Close mobile menu on route change. Computed during render (React's
  // documented "adjusting state when a prop changes" pattern) instead of an
  // effect, to avoid an extra commit/flash and the set-state-in-effect warning.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  // N-04: cross-tab SWR cache invalidation via BroadcastChannel
  useSWRBroadcastListener();

  // Auth guard: redirect to /login if not authenticated
  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Will redirect in effect above — render nothing during transition
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* document.title badge — cross-tab unread awareness (DEFERRED-21 N-02) */}
      <ProductHeadManager />
      {/* Cross-product toast — fires when another product gets new items (DEFERRED-21 N-03) */}
      <CrossProductNotifier />
      {/* Cmd+K product switcher palette (DEFERRED-21 U-07) */}
      <ProductCommandPalette />
      {/* ── Sidebar: Desktop (always visible) ── */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-56 xl:w-64 bg-gray-50 border-r border-gray-200 shrink-0"
        aria-label="Application sidebar"
      >
        <Sidebar />
      </aside>

      {/* ── Sidebar: Mobile overlay ── */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside
            className={clsx(
              "absolute left-0 top-0 bottom-0 w-64 bg-gray-50 border-r border-gray-200",
              "flex flex-col shadow-xl"
            )}
            aria-label="Mobile navigation"
          >
            {/* Mobile sidebar header */}
            <div className="flex items-center gap-2 h-14 px-4 border-b border-gray-200">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900 text-sm">NestFleet</span>
            </div>
            <Sidebar onNavClick={() => setIsMobileMenuOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          onMenuToggle={() => setIsMobileMenuOpen((v) => !v)}
          isMobileMenuOpen={isMobileMenuOpen}
        />
        <GracePeriodBanner />
        <LicenseStatusBanner />
        <OuUsageBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
