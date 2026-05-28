// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

/**
 * Next.js Edge Middleware — SLICE-12 + DEFERRED-21.
 *
 * 1. Setup guard: if needsSetup is true, redirect to /setup.
 * 2. Root redirect: if / and nf_last_product cookie is set, redirect to that
 *    product's queue page (avoids the marketing landing page for logged-in users).
 * 3. Slug format validation: cheap format check on /p/[slug]/... paths before
 *    they hit the Node.js runtime. Authoritative slug-exists check is done in
 *    the product layout (needs DB access, not available in Edge).
 *
 * Note: auth is localStorage-based (not cookie-based), so we cannot do an auth
 * guard here — that remains handled client-side by the useAuth hook.
 *
 * Paths excluded from all checks:
 *   - /setup     (the wizard itself)
 *   - /login     (auth page)
 *   - /docs/*    (public documentation — no auth or setup guard needed)
 *   - /_next/*   (Next.js internals)
 *   - /api/*     (API routes — not page navigation)
 *   - static assets (favicons, etc.)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// INTERNAL_API_URL is set at runtime in Docker (console → api service on internal network).
// NEXT_PUBLIC_API_URL is baked at build time (empty = same-origin via Caddy for the browser).
// Fallback to localhost:3001 for local dev outside Docker.
const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const BYPASS_PREFIXES = ["/_next", "/api", "/favicon", "/robots", "/account", "/docs"];
const BYPASS_EXACT    = ["/setup", "/login", "/register", "/signup", "/terms", "/privacy"];

// Matches /p/<slug> and /p/<slug>/anything
const PRODUCT_ROUTE_PATTERN = /^\/p\/([^/]+)(\/.*)?$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-page paths
  if (
    BYPASS_EXACT.includes(pathname) ||
    BYPASS_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // --- Root redirect (DEFERRED-21) ---
  // If the user lands on "/" and we know their last product, send them there
  // directly rather than showing the marketing landing page.
  if (pathname === "/") {
    const lastSlug = request.cookies.get("nf_last_product")?.value;
    if (lastSlug && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(lastSlug)) {
      return NextResponse.redirect(new URL(`/p/${lastSlug}/queue`, request.url));
    }
  }

  // --- Legacy route redirects (DEFERRED-21) ---
  // Redirect all legacy top-level app routes to their /p/[slug] equivalents
  // using the nf_last_product cookie. Without this, users who land on legacy
  // URLs (bookmarks, direct navigation) get no ProductProvider context and
  // the sidebar stays in legacy mode.
  const LEGACY_APP_ROUTES = [
    "/cases", "/queue", "/approvals", "/pr-drafts",
    "/analytics", "/notifications", "/knowledge",
    "/compliance", "/dashboard", "/settings",
  ];
  const legacyBase = LEGACY_APP_ROUTES.find(
    (r) => pathname === r || pathname.startsWith(r + "/") || pathname.startsWith(r + "?"),
  );
  if (legacyBase) {
    const lastSlug = request.cookies.get("nf_last_product")?.value;
    if (lastSlug && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(lastSlug)) {
      const rest = pathname.slice(legacyBase.length); // preserves sub-paths like /approvals/crId
      const search = request.nextUrl.search;          // preserves ?section=plan etc.
      return NextResponse.redirect(
        new URL(`/p/${lastSlug}${legacyBase}${rest}${search}`, request.url),
      );
    }
  }

  // --- Slug format validation (DEFERRED-21) ---
  // Cheap check before the request reaches the Node.js runtime.
  // Only rejects obvious garbage (wrong chars / wrong length).
  // Whether the slug actually exists and the user has access is checked
  // in (app)/p/[slug]/layout.tsx.
  const slugMatch = pathname.match(PRODUCT_ROUTE_PATTERN);
  if (slugMatch) {
    const slug = slugMatch[1];
    const validSlug = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || /^[a-z0-9]$/.test(slug);
    if (!validSlug) {
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
  }

  // --- Setup guard (SLICE-12) ---
  try {
    const res = await fetch(`${API_BASE}/api/v1/setup/status`, {
      // 30-second edge cache — avoids a DB hit on every page load
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const json = await res.json() as { data?: { needsSetup?: boolean } };
      if (json?.data?.needsSetup === true) {
        const url = request.nextUrl.clone();
        url.pathname = "/setup";
        return NextResponse.redirect(url);
      }
    }
  } catch {
    // API unreachable — let the request through; the page will handle errors
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - api/          (API routes handled by Next.js API layer)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
