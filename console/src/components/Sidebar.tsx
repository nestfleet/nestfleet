// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useNotificationBadge } from "@/lib/useNotificationBadge";
import { useNavBadges, type NavTab } from "@/lib/useNavBadges";
import { useAuth } from "@/lib/auth";
import { canAccessNav } from "@/lib/permissions";
import { useLicense } from "@/lib/useLicense";
import { useProductSafe, useProducts, useSwitchProduct } from "@/lib/product-context";
import { useProductMru } from "@/lib/useProductMru";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { AddProductButton, AddProductWizard } from "./AddProductWizard";
import { useAllProductsBadges } from "@/lib/useAllProductsBadges";
import { getChannelStatusApi } from "@/lib/api";
import { ACTIVE_CHANNELS } from "@/lib/channel-catalog";
import { WaitlistButton } from "@/components/WaitlistButton";
import { WAITLIST_MODE } from "@/lib/flags";

function ProductsBar({ tier }: { tier: string }) {
  const { license } = useLicense();
  if (!license) return null;
  const pct = Math.min(100, (license.currentProducts / Math.max(1, license.productLimit)) * 100);
  const atLimit = license.currentProducts >= license.productLimit;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-400">Products</span>
        <span className={`text-[10px] font-medium ${atLimit ? "text-red-500" : "text-gray-500"}`}>
          {license.currentProducts}/{license.productLimit}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${atLimit ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-indigo-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface NavItem {
  label: string;
  href: string;
  navKey: string;  // maps to permissions.ts NAV_ACCESS key
  icon: React.ReactNode;
  comingSoon?: boolean;
  badgeKey?: NavTab; // maps to useNavBadges
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    navKey: "dashboard",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    label: "Queue",
    href: "/queue",
    navKey: "approvals",
    badgeKey: "queue",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.875 14.25l1.214 1.942a2.25 2.25 0 001.908 1.058h4.006a2.25 2.25 0 001.908-1.058l1.214-1.942M2.41 9h4.636a2.25 2.25 0 011.872 1.002l.164.246a2.25 2.25 0 001.872 1.002h2.092a2.25 2.25 0 001.872-1.002l.164-.246A2.25 2.25 0 0117.954 9h4.636M2.41 9a2.25 2.25 0 00-.16.832V12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 12V9.832c0-.287-.055-.57-.16-.832M2.41 9a2.25 2.25 0 01.382-.632l3.285-3.832a2.25 2.25 0 011.708-.786h8.43a2.25 2.25 0 011.709.786l3.284 3.832c.163.19.291.404.382.632" />
      </svg>
    ),
  },
  {
    label: "Cases",
    href: "/cases",
    navKey: "cases",
    badgeKey: "cases",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    label: "Change Approvals",
    href: "/approvals",
    navKey: "approvals",
    badgeKey: "approvals",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    label: "PR Drafts",
    href: "/pr-drafts",
    navKey: "pr-drafts",
    badgeKey: "pr-drafts",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    label: "Analytics",
    href: "/analytics",
    navKey: "analytics",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: "Notifications",
    href: "/notifications",
    navKey: "notifications",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
  {
    label: "Knowledge",
    href: "/knowledge",
    navKey: "knowledge",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    label: "Compliance",
    href: "/compliance",
    navKey: "compliance",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

interface SidebarProps {
  onNavClick?: () => void;
}

function pathToNavTab(pathname: string): NavTab | null {
  // Support both legacy /cases and new /p/[slug]/cases patterns
  const bare = pathname.replace(/^\/p\/[^/]+/, "");
  if (bare.startsWith("/queue"))     return "queue";
  if (bare.startsWith("/cases"))     return "cases";
  if (bare.startsWith("/approvals")) return "approvals";
  if (bare.startsWith("/pr-drafts")) return "pr-drafts";
  return null;
}

// ─── Product Switcher ─────────────────────────────────────────────────────────

function ProductSwitcherDropdown() {
  const productCtx    = useProductSafe();
  const products      = useProducts();
  const switchProduct = useSwitchProduct();
  const { license }   = useLicense();
  const allBadges     = useAllProductsBadges();
  const { sortProducts, isPinned, togglePin } = useProductMru();
  const [open, setOpen]             = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Community tier (productLimit === 1): never show the switcher
  const productLimit = license?.productLimit ?? null;
  const isCommunity  = productLimit !== null && productLimit <= 1;

  // Community tier: hide everything
  if (!productCtx || isCommunity) return null;

  const { product } = productCtx;

  // Single product, non-Community: show only "Add Product" — no switcher yet
  if (products.length === 1) {
    return (
      <>
        <div className="px-3 pb-1">
          <div className="rounded-lg border border-dashed border-gray-200 px-1 py-0.5">
            <AddProductButton onClick={() => setWizardOpen(true)} />
          </div>
        </div>
        <AddProductWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
      </>
    );
  }

  // Ambient dot: any non-active product has unread items
  const otherProductsHaveUnread = products.some(
    (p) => p.productId !== product.productId && (allBadges[p.productId]?.total ?? 0) > 0
  );

  return (
    <>
      <div className="relative px-3 pb-1">
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ borderLeftColor: product.accentColor ?? "#6366f1" }}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 border-l-2 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {/* Ambient dot — lights up when another product has unread items */}
          <span className="relative flex items-center gap-2 min-w-0">
            {otherProductsHaveUnread && !open && (
              <span
                className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
                aria-label="Another product has unread items"
              />
            )}
            <span className="truncate">{product.name}</span>
          </span>
          <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-3 right-3 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
            <ul role="listbox">
              {sortProducts(products).map((p) => {
                const isActive   = p.productId === product.productId;
                const pinned     = isPinned(p.slug);
                const summary    = allBadges[p.productId];
                const badgeTotal = summary?.total ?? 0;

                return (
                  <li key={p.productId} role="option" aria-selected={isActive} className="group flex items-stretch">
                    {/* Main switch button */}
                    <button
                      onClick={() => { switchProduct(p.slug); setOpen(false); }}
                      style={{ borderLeftColor: p.accentColor ?? "#6366f1" }}
                      className={clsx(
                        "flex flex-1 items-center gap-2 px-3 py-2 text-sm border-l-2",
                        isActive
                          ? "bg-indigo-50 font-medium text-indigo-700"
                          : "border-transparent text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {/* Product name — full on desktop, compact on mobile */}
                      <span className="flex-1 truncate text-left">{p.name}</span>

                      {/* Per-product unread badge */}
                      {!isActive && badgeTotal > 0 && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">
                          {badgeTotal > 99 ? "99+" : badgeTotal}
                        </span>
                      )}

                      {/* Stage badge — hidden on narrow mobile to save space (U-09) */}
                      <span className="hidden lg:inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {p.stage}
                      </span>

                      {isActive && (
                        <svg className="h-4 w-4 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>

                    {/* Pin toggle — separate sibling button (avoids nested-button HTML error) */}
                    <button
                      onClick={() => togglePin(p.slug)}
                      className={clsx(
                        "flex items-center px-2 text-gray-300 hover:text-gray-500 transition-opacity",
                        pinned
                          ? "opacity-100 text-indigo-400 hover:text-indigo-600"
                          : "opacity-0 group-hover:opacity-100"
                      )}
                      aria-label={pinned ? "Unpin product" : "Pin product"}
                    >
                      {/* Pin icon — filled when pinned, outline when not */}
                      {pinned ? (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M16 2a1 1 0 011 1v1.586l2.707 2.707A1 1 0 0120 8v4a1 1 0 01-1 1h-6v8a1 1 0 01-2 0v-8H5a1 1 0 01-1-1V8a1 1 0 01.293-.707L7 4.586V3a1 1 0 011-1h8z" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v2.172a2 2 0 01-.586 1.414L16 11v5l-4 3-4-3v-5L5.586 8.586A2 2 0 015 7.172V5z" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Add Product — tier-gated entry */}
            <div className="border-t border-gray-100">
              <AddProductButton onClick={() => { setOpen(false); setWizardOpen(true); }} />
            </div>
          </div>
        )}
      </div>

      <AddProductWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
    </>
  );
}

function useUnconfiguredChannelCount(productId: string | undefined): number {
  const { data } = useSWR(
    productId ? ["channels-status", productId] : null,
    () => getChannelStatusApi(productId!),
    { refreshInterval: 60_000 },
  );
  if (!data?.channels) return 0;
  return ACTIVE_CHANNELS.filter((ch) => {
    const info = data.channels[ch.id];
    return !info || info.status === "not_configured";
  }).length;
}

export function Sidebar({ onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const { unseenCount } = useNotificationBadge();
  const { badges, markSeen } = useNavBadges();
  const { user } = useAuth();
  const { tier, trialDaysRemaining } = useLicense();
  const userRoles = user?.roles ?? [];
  const productCtx = useProductSafe();
  const unconfiguredChannels = useUnconfiguredChannelCount(productCtx?.product.productId);

  // When inside a product context, prefix all hrefs with /p/[slug]/
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";

  // Mark the active tab as seen whenever the user navigates to it
  useEffect(() => {
    const tab = pathToNavTab(pathname);
    if (tab) markSeen(tab);
  }, [pathname, markSeen]);

  const visibleItems = NAV_ITEMS.filter((item) => canAccessNav(userRoles, item.navKey));
  const showSettings = canAccessNav(userRoles, "settings");

  return (
    <nav className="flex flex-col h-full" aria-label="Main navigation">
      {/* Product switcher — visible only when user has > 1 product */}
      <ProductSwitcherDropdown />

      <div className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const href = `${basePath}${item.href}`;
          const isActive =
            !item.comingSoon && pathname.startsWith(item.href) ||
            !item.comingSoon && basePath !== "" && pathname.startsWith(href);

          const isNotifications = item.href === "/notifications";
          const navBadgeCount = item.badgeKey ? badges[item.badgeKey] : 0;
          const showBadge = !isActive && (
            (isNotifications && unseenCount > 0) ||
            (!isNotifications && navBadgeCount > 0)
          );
          const badgeCount = isNotifications ? unseenCount : navBadgeCount;

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed select-none"
                title="Coming soon"
              >
                {item.icon}
                <span>{item.label}</span>
                <span className="ml-auto text-xs bg-gray-100 text-gray-400 rounded-sm px-1.5 py-0.5">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={clsx(isActive ? "text-indigo-600" : "text-gray-400")}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white"
                  aria-label={`${badgeCount} new item${badgeCount === 1 ? "" : "s"}`}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Settings link (SLICE-11) — admin + operator only */}
      {showSettings && <div className="px-3 pb-2">
        <Link
          href={`${basePath}/settings`}
          onClick={onNavClick}
          className={clsx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/settings") || pathname.startsWith(`${basePath}/settings`)
              ? "bg-indigo-50 text-indigo-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          )}
          aria-current={pathname.startsWith("/settings") || pathname.startsWith(`${basePath}/settings`) ? "page" : undefined}
        >
          <span className={clsx(pathname.startsWith("/settings") || pathname.startsWith(`${basePath}/settings`) ? "text-indigo-600" : "text-gray-400")}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <span className="flex-1">Settings</span>
          {unconfiguredChannels > 0 && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white"
              aria-label={`${unconfiguredChannels} channel${unconfiguredChannels === 1 ? "" : "s"} not configured`}
            >
              {unconfiguredChannels}
            </span>
          )}
        </Link>
      </div>}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">NestFleet</p>
          {tier ? (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-indigo-600 ring-1 ring-indigo-200">
              {tier}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
              dev
            </span>
          )}
        </div>

        {/* Trial countdown (W6-05) */}
        {tier === "trial" && trialDaysRemaining !== null && (
          <p className={`text-[10px] font-medium ${trialDaysRemaining <= 3 ? "text-red-500" : trialDaysRemaining <= 7 ? "text-amber-500" : "text-gray-400"}`}>
            {trialDaysRemaining === 0
              ? "Trial expires today"
              : `Trial: ${trialDaysRemaining}d remaining`}
          </p>
        )}

        {/* Products usage bar — only when we have license data */}
        {tier && (
          <ProductsBar tier={tier} />
        )}

        {/* Upgrade nudge for non-paid tiers (W6-01) */}
        {tier !== null && tier !== "starter" && tier !== "growth" && tier !== "scale" && (
          WAITLIST_MODE ? (
            <WaitlistButton
              planHint="starter"
              label="Join waitlist →"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            />
          ) : (
            <a
              href={`${basePath}/settings?section=plan`}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
              Upgrade plan
            </a>
          )
        )}
      </div>
    </nav>
  );
}
