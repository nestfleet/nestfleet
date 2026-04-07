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
 *   - /_next/*   (Next.js internals)
 *   - /api/*     (API routes — not page navigation)
 *   - static assets (favicons, etc.)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const BYPASS_PREFIXES = ["/_next", "/api", "/favicon", "/robots"];
const BYPASS_EXACT    = ["/setup", "/login"];

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

  // --- /cases redirect (DEFERRED-21) ---
  // Send users who land on the legacy /cases path to their last product.
  if (pathname === "/cases") {
    const lastSlug = request.cookies.get("nf_last_product")?.value;
    if (lastSlug && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(lastSlug)) {
      return NextResponse.redirect(new URL(`/p/${lastSlug}/cases`, request.url));
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
