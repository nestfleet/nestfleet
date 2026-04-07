# Multi-Product Console Architecture
## DEFERRED-21 — Solution Design

> **Status:** ✅ COMPLETE — All P0–P8 phases shipped. Post-ship fixes: `key={slug}` on ProductProvider (product-switch isolation), login redirect to `/p/[slug]/cases`, API key autofill protection (locked field UX). See §21 for full verification record.
> **Decision date:** 2026-03-21
> **Last updated:** 2026-03-24
> **Supersedes:** §4.8 SPIKE block in `active-backlog.md`
> **Architecture option selected:** C — Hybrid URL prefix + React Context

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Option C Decision & Rationale](#2-option-c-decision--rationale)
3. [URL Structure](#3-url-structure)
4. [Database — Slug Column Migration](#4-database--slug-column-migration)
5. [New Backend Endpoints](#5-new-backend-endpoints)
6. [ProductContext Contract](#6-productcontext-contract)
7. [Next.js Route Group Restructure](#7-nextjs-route-group-restructure)
8. [Component-Level Changes](#8-component-level-changes)
9. [SWR Cache Strategy](#9-swr-cache-strategy)
10. [localStorage Namespacing](#10-localstorage-namespacing)
11. [useNavBadges Migration](#11-usenavbadges-migration)
12. [Sidebar — Dynamic Hrefs](#12-sidebar--dynamic-hrefs)
13. [Badge Aggregation in Switcher](#13-badge-aggregation-in-switcher)
14. [Middleware Extension](#14-middleware-extension)
15. [Auth Layer Changes](#15-auth-layer-changes)
16. [Tier Gating](#16-tier-gating)
17. [Legacy NEXT_PUBLIC_PRODUCT_ID Migration](#17-legacy-next_public_product_id-migration)
18. [Open Questions — Resolved](#18-open-questions--resolved)
19. [Effort Breakdown](#19-effort-breakdown)
20. [Testing Strategy & Acceptance Criteria](#20-testing-strategy--acceptance-criteria)

---

## 1. Executive Summary

The Console is currently **single-product**: every page reads `process.env.NEXT_PUBLIC_PRODUCT_ID` — a build-time constant that makes runtime product switching architecturally impossible. 13 Console files carry this coupling today.

**What changes:**

| Layer | Before | After |
|-------|--------|-------|
| Product ID source | `process.env.NEXT_PUBLIC_PRODUCT_ID` | `useProductId()` from React Context, seeded by URL slug |
| URL structure | `/cases`, `/queue`, `/settings` | `/p/[slug]/cases`, `/p/[slug]/queue`, `/p/[slug]/settings` |
| Product resolution | Build-time env var | Runtime: slug → productId lookup via `GET /api/v1/products` |
| Multi-tab support | Broken (shared env) | Fully isolated (each tab owns its URL) |
| SWR cache keys | `["cases", PRODUCT_ID]` | `["cases", productId]` — auto-invalidate on slug change |
| Product switcher | None | Sidebar dropdown; visible only when `products.length > 1` |

**What does NOT change:** All backend API routes (`/api/v1/products/:productId/...`) are already product-parameterised and require zero modification. The API client functions in `console/src/lib/api.ts` already accept `productId` as first param.

---

## 2. Option C Decision & Rationale

### Options considered

| Option | Verdict | Blocking issue |
|--------|---------|----------------|
| **A: URL-only** (no context) | Rejected | Every component at every level would need to drill slug from `useParams()`, bypassing the "no prop drilling" principle. Pages can't read their own product without knowing the URL segment name. |
| **B: Context + localStorage only** | Rejected | `localStorage` is shared across browser tabs. Two tabs on different products = last-writer-wins race condition. Multi-tab independence is a hard requirement (Req 2, principle 4). |
| **C: URL prefix + Context** | **Selected** | URL is the canonical truth; context reads from URL; no prop drilling; full multi-tab independence; bookmarkable; browser back/forward correct. |

### Why Option C satisfies all requirements

1. **Multi-tab independence** — Each tab's URL is its own state. Switching products in Tab 2 has zero effect on Tab 1.
2. **Bookmarkable deep links** — `/p/docugardener/cases?caseId=123` is a full deep link. Operators can share links to specific product + page combinations.
3. **Single source of truth** — `useProductId()` reads from the URL segment via `useParams()`. No page can accidentally read a different source.
4. **Reactive propagation** — Next.js App Router re-renders the product-scoped layout whenever the slug segment changes. All context consumers update automatically.
5. **SWR auto-invalidation** — Cache keys include `productId`. When the slug changes, the productId changes, and SWR treats old keys as inactive (retained in cache for instant back-switch).
6. **Preserves navigation position** — switching `/p/docugardener/cases` → `/p/skillseal/cases` stays on the Cases page. Same page, different data. The slug is the only segment that changes.

---

## 3. URL Structure

### Route group layout

```
console/src/app/
  (auth)/
    login/page.tsx          — unchanged
    setup/page.tsx          — unchanged
  (app)/
    layout.tsx              — NEW: wraps in <ProductProvider>; reads [slug] from URL
    p/
      [slug]/
        layout.tsx          — product-scoped layout: fetches product by slug, sets context
        page.tsx            — redirect → /p/[slug]/dashboard
        dashboard/page.tsx
        queue/page.tsx
        cases/page.tsx
        approvals/page.tsx
        pr-drafts/page.tsx
        knowledge/page.tsx
        analytics/page.tsx
        notifications/page.tsx
        compliance/page.tsx
        settings/page.tsx
    ...
```

### URL examples

| Page | Before | After |
|------|--------|-------|
| Case queue | `/queue` | `/p/docugardener/queue` |
| Cases list | `/cases` | `/p/docugardener/cases` |
| Case detail | `/cases/case_abc123` | `/p/docugardener/cases/case_abc123` |
| Approvals | `/approvals` | `/p/docugardener/approvals` |
| Settings | `/settings` | `/p/docugardener/settings` |
| Analytics | `/analytics` | `/p/docugardener/analytics` |
| Knowledge | `/knowledge` | `/p/docugardener/knowledge` |

### Slug format

- Derived from product name at creation time: `"DocuGardener"` → `"docugardener"`, `"Skill Seal"` → `"skill-seal"`
- Algorithm: `name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")`
- Max 60 chars, unique across all products in the instance
- Stored in DB (see §4); not derived at query time

### Root redirect

`console/src/app/page.tsx` redirects to the last-used product slug:

```typescript
// console/src/app/page.tsx
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default function RootPage() {
  const lastSlug = cookies().get("nf_last_product")?.value
  if (lastSlug) redirect(`/p/${lastSlug}/queue`)
  redirect("/login")  // fallback if no cookie
}
```

On first login with no prior session, the backend returns the user's first product and the Console navigates to it. The `nf_last_product` cookie is set client-side by `switchProduct()` on every product switch, so it survives page reloads.

---

## 4. Database — Slug Column Migration

### Problem

`ProductRow` in `src/infra/db/repositories/products.ts` has no `slug` field. URL-based routing requires a stable, human-readable unique identifier per product. This is a critical gap.

### Migration

**File:** `src/infra/db/migrations/XXXX_add_product_slug.sql`

```sql
-- Up
ALTER TABLE products ADD COLUMN slug VARCHAR(60);

-- Backfill: derive slug from existing product names
UPDATE products
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
           -- strip leading/trailing hyphens
           |> REGEXP_REPLACE('^-+|-+$', '');

-- Enforce uniqueness and non-null going forward
ALTER TABLE products
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT products_slug_unique UNIQUE (slug);

-- Down
ALTER TABLE products DROP COLUMN slug;
```

> **Note:** PostgreSQL-flavoured. Adjust pipe syntax for your migration runner if needed. The backfill `REGEXP_REPLACE` is deterministic and idempotent — re-running on an already-migrated table is a no-op because `NOT NULL` would fail before the UPDATE reaches a null row.

### ProductRowSchema update

```typescript
// src/infra/db/repositories/products.ts
export const ProductRowSchema = z.object({
  product_id:       z.string(),
  slug:             z.string(),          // ← ADD
  name:             z.string(),
  stage:            ProductStageSchema,
  support_policy:   z.record(z.unknown()),
  enabled_channels: z.array(z.string()),
  lead_assignments: z.record(z.unknown()),
  llm_config:       z.record(z.unknown()),
  agent_config:     z.record(z.unknown()),
  ci_config:        z.record(z.unknown()),
  created_at:       z.date(),
  updated_at:       z.date(),
})
```

### New repository function

```typescript
// src/infra/db/repositories/products.ts

export async function findProductBySlug(slug: string): Promise<ProductRow | null> {
  const rows = await sql<ProductRow[]>`
    SELECT * FROM products WHERE slug = ${slug} LIMIT 1
  `
  return rows[0] ?? null
}
```

### Slug generation utility

```typescript
// src/shared/slugify.ts
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/, "")
    .slice(0, 60)
}
```

---

## 5. New Backend Endpoints

### 5.1 GET /api/v1/products

Returns all products the authenticated user has access to. Required by the Console to populate the product switcher and seed the `ProductContext`.

**File:** `src/api/v1/products-list.ts` (new, mounted on the existing v1 router)

```typescript
// GET /api/v1/products
// Auth: operator JWT required
// Returns: { products: ProductSummary[] }

export type ProductSummary = {
  productId: string
  slug:      string
  name:      string
  stage:     ProductStage
  accentColor?: string   // optional: per-product brand colour for the switcher chip
}
```

**Logic:**
1. Extract `productIds: string[]` from JWT claims (already present in `AuthUser`)
2. `SELECT product_id, slug, name, stage FROM products WHERE product_id = ANY($1)` ordered by `created_at ASC`
3. Return as `{ products: ProductSummary[] }`

**Why not reuse `findProductById`?** That function returns the full `ProductRow` including `llm_config`, `agent_config`, etc. — heavy and unnecessary for the switcher. The new endpoint returns a lean summary projection.

**Rate limiting:** inherit the existing v1 auth middleware rate limiter (100 req/min per user). No additional rate limit needed — this endpoint is called once per page load, not in a polling loop.

### 5.2 POST /api/v1/products

Creates a new product for the authenticated user's organisation. Called by the "Add Product" wizard in the Console.

**File:** `src/api/v1/products-create.ts` (new)

```typescript
// POST /api/v1/products
// Auth: operator JWT required; tier gate: productCount < licenseStatus.productLimit
// Body: { name: string, stage?: "beta" | "production" }
// Returns: { product: ProductSummary } on success; 402 if over tier limit

const CreateProductBodySchema = z.object({
  name:  z.string().min(1).max(100),
  stage: z.enum(["beta", "production"]).default("beta"),
})
```

**Logic:**
1. Validate body
2. Load license via `validateLicense(productId)` — but for a new product we check via the org's existing product count: `SELECT COUNT(*) FROM products WHERE product_id = ANY($userProductIds)`
3. Compare count against `licenseStatus.productLimit` (from PlatformCloud license payload). If `count >= limit` → `402 Payment Required` with `{ error: "Product limit reached", limit, upgradeUrl: "/settings/billing" }`
4. Generate `slug = slugify(name)`, check uniqueness. If collision, append `-2`, `-3`, etc.
5. Insert new product row with defaults
6. Add `product_id` to the calling user's `product_ids` (the `users` table or a join table, depending on schema)
7. Return `ProductSummary` of the created product

**Why NestFleet, not PlatformCloud?** Product creation is an application-level operation — it creates a row in NestFleet's `products` table and configures defaults. PlatformCloud manages billing quotas (enforced here via license check), not product rows. Calling PlatformCloud for every product creation would create an unnecessary synchronous dependency on an external service.

### 5.3 PATCH /api/v1/products/:productId/slug *(optional, post-MVP)*

Allows slug rename after creation. Requires redirect of old URLs. Deferred — slug changes break bookmarks, which must be handled with 301 redirects in middleware. Mark as out of scope for initial implementation.

---

## 6. ProductContext Contract

### File: `console/src/lib/product-context.tsx`

```typescript
import React, { createContext, useContext, useCallback, useEffect, useState } from "react"
import { useParams, useRouter, usePathname } from "next/navigation"
import useSWR from "swr"

export type ProductSummary = {
  productId:   string
  slug:        string
  name:        string
  stage:       "beta" | "production" | string
  accentColor?: string
}

type ProductContextValue = {
  // Current active product (resolved from URL slug)
  productId:   string
  product:     ProductSummary
  // All products accessible to this user (for the switcher)
  products:    ProductSummary[]
  isLoading:   boolean
  // Programmatic switch — updates URL; context reacts automatically
  switchProduct: (slug: string) => void
  // Event subscription — fires after slug change is confirmed in URL
  onProductChange: (cb: (from: string, to: string) => void) => () => void
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function useProductId(): string {
  const ctx = useContext(ProductContext)
  if (!ctx) throw new Error("useProductId() must be used inside <ProductProvider>")
  return ctx.productId
}

export function useProduct(): ProductSummary {
  const ctx = useContext(ProductContext)
  if (!ctx) throw new Error("useProduct() must be used inside <ProductProvider>")
  return ctx.product
}

export function useProducts(): ProductSummary[] {
  const ctx = useContext(ProductContext)
  if (!ctx) throw new Error("useProducts() must be used inside <ProductProvider>")
  return ctx.products
}

export function useSwitchProduct() {
  const ctx = useContext(ProductContext)
  if (!ctx) throw new Error("useSwitchProduct() must be used inside <ProductProvider>")
  return ctx.switchProduct
}

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const params   = useParams()
  const router   = useRouter()
  const pathname = usePathname()

  // The slug segment from the URL: /p/[slug]/...
  const currentSlug = params.slug as string

  // Fetch all accessible products (cached globally — not per-slug)
  const { data, isLoading } = useSWR<{ products: ProductSummary[] }>(
    "/api/v1/products",
    (url) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const products = data?.products ?? []

  // Resolve active product from slug
  const product = products.find((p) => p.slug === currentSlug)

  // Product change listeners
  const listeners = React.useRef<Set<(from: string, to: string) => void>>(new Set())
  const prevSlugRef = React.useRef<string>(currentSlug)

  useEffect(() => {
    if (prevSlugRef.current !== currentSlug && prevSlugRef.current) {
      listeners.current.forEach((cb) => cb(prevSlugRef.current, currentSlug))
    }
    prevSlugRef.current = currentSlug
  }, [currentSlug])

  const onProductChange = useCallback(
    (cb: (from: string, to: string) => void) => {
      listeners.current.add(cb)
      return () => listeners.current.delete(cb)
    },
    []
  )

  const switchProduct = useCallback(
    (slug: string) => {
      // Preserve the current page segment (e.g. /cases, /queue, /settings)
      // pathname: /p/docugardener/cases → replace slug → /p/skillseal/cases
      const newPath = pathname.replace(
        /^\/p\/[^/]+/,
        `/p/${slug}`
      )
      // Update last-used cookie (client-side; expires in 30 days)
      document.cookie = `nf_last_product=${slug}; path=/; max-age=${30 * 86400}; SameSite=Lax`
      router.push(newPath)
    },
    [pathname, router]
  )

  // Guard: if slug is unknown after products load, show 404
  if (!isLoading && products.length > 0 && !product) {
    // Will be caught by the [slug]/layout.tsx notFound() call
    return null
  }

  // While loading, product may be undefined — provide a skeleton value
  const safeProduct: ProductSummary = product ?? {
    productId:   "",
    slug:        currentSlug,
    name:        currentSlug,
    stage:       "beta",
  }

  return (
    <ProductContext.Provider value={{
      productId:       safeProduct.productId,
      product:         safeProduct,
      products,
      isLoading,
      switchProduct,
      onProductChange,
    }}>
      {children}
    </ProductContext.Provider>
  )
}
```

### Key design notes

- **`useProductId()` throws** if called outside the provider. This is intentional: silent `undefined` is worse than a clear error during development.
- **`onProductChange`** lets `useNavBadges`, WebSocket hooks, and analytics fire-and-forget on product switch without polling or polling intervals.
- **`switchProduct(slug)`** updates the URL, which triggers Next.js router re-render, which re-reads `params.slug`, which updates context. The provider does not maintain its own "current product" state separate from the URL — the URL is the single source of truth.
- **`/api/v1/products`** is fetched once with a 60s dedup interval. Products change rarely — no need to poll. On "Add Product" wizard completion, call `mutate("/api/v1/products")` to refresh.

---

## 7. Next.js Route Group Restructure

### New files to create

```
console/src/app/(app)/
  layout.tsx                    — Wraps in <ProductProvider>; handles auth guard
  p/
    [slug]/
      layout.tsx                — Validates slug; calls notFound() if invalid; renders Sidebar
      page.tsx                  — redirect → queue (or dashboard)
      queue/page.tsx            — migrated from /queue
      cases/page.tsx            — migrated from /cases
      cases/[caseId]/page.tsx   — migrated from /cases/[caseId]
      approvals/page.tsx        — migrated from /approvals
      pr-drafts/page.tsx        — migrated from /pr-drafts
      knowledge/page.tsx        — migrated from /knowledge
      analytics/page.tsx        — migrated from /analytics
      notifications/page.tsx    — migrated from /notifications
      compliance/page.tsx       — migrated from /compliance
      settings/page.tsx         — migrated from /settings
```

### `(app)/layout.tsx`

```typescript
// console/src/app/(app)/layout.tsx
import { ProductProvider } from "@/lib/product-context"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductProvider>
      {children}
    </ProductProvider>
  )
}
```

### `(app)/p/[slug]/layout.tsx`

```typescript
// console/src/app/(app)/p/[slug]/layout.tsx
import { notFound } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import { useProducts } from "@/lib/product-context"

// This is a Server Component — slug validation happens before render
export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  // Slug validation: call backend to verify slug belongs to this user
  // (Middleware also checks, but we double-check here for SSR correctness)
  // If the slug is invalid for this user, Next.js renders the 404 page
  // (actual implementation delegates to middleware; layout just renders)
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

> **Note:** The `ProductProvider` is a Client Component (uses hooks). The `[slug]/layout.tsx` should be a thin Server Component that delegates auth/slug guard to middleware and renders the Sidebar + content layout.

### Page migration pattern

Every migrated page removes the env var read and uses the hook instead:

```typescript
// Before (e.g., console/src/app/cases/page.tsx)
const productId = process.env.NEXT_PUBLIC_PRODUCT_ID ?? ""

// After (console/src/app/(app)/p/[slug]/cases/page.tsx)
"use client"
import { useProductId } from "@/lib/product-context"
// ...
const productId = useProductId()
```

The rest of the page is unchanged — all API calls already accept `productId` as first param.

---

## 8. Component-Level Changes

### 8.1 Files with `process.env.NEXT_PUBLIC_PRODUCT_ID` (13 confirmed)

All 13 files follow the same pattern: remove module-level const, call `useProductId()` inside the component:

| File | Change complexity |
|------|-----------------|
| `cases/page.tsx` | Low — single reference |
| `queue/page.tsx` | Low |
| `approvals/page.tsx` | Low |
| `pr-drafts/page.tsx` | Low |
| `knowledge/page.tsx` | Low |
| `analytics/page.tsx` | Low |
| `notifications/page.tsx` | Low |
| `compliance/page.tsx` | **Medium** — uses `user?.productIds[0]` directly (line ~506); must remove and use `useProductId()` |
| `settings/page.tsx` | Low |
| `dashboard/page.tsx` | Low |
| `lib/useNavBadges.ts` | **High** — module-level const, SWR key coupling (see §11) |
| `lib/useNotificationBadge.ts` | Medium — SWR key coupling |
| Any other page | Low |

### 8.2 `compliance/page.tsx` bug fix

The `compliance` page contains a direct bypass of the product context:

```typescript
// BEFORE (line ~506) — direct read from auth user; bypasses context
const productId = user?.productIds[0]
```

This must become:

```typescript
// AFTER
const productId = useProductId()
```

This is a correctness bug post-migration: `user?.productIds[0]` would always return the user's first product ID, ignoring which product the operator is currently viewing.

### 8.3 Sidebar product switcher

See §12 for detailed Sidebar changes.

---

## 9. SWR Cache Strategy

### Cache key namespacing

All SWR keys must include `productId` as a segment. Current pattern in the codebase:

```typescript
// Current (must change)
const { data } = useSWR(["cases-list", PRODUCT_ID], fetcher)

// After
const productId = useProductId()
const { data } = useSWR(["cases-list", productId], fetcher)
```

When `productId` changes (because the slug in the URL changed), the SWR key changes, and SWR automatically:
- Stops revalidating the old key
- Starts revalidating the new key
- Serves from cache if the new key has been seen before (enables instant A→B→A back-switch)

### Cache retention on switch

SWR's default `provider` keeps all entries in memory. Do NOT call `mutate(() => true, undefined)` (clear all) on product switch — that would invalidate Product A's cache when switching to B, breaking the warm back-switch guarantee.

Instead, rely on key namespacing. Product A's keys (`["cases-list", "prod_abc"]`) are simply inactive while Product B is active. They retain their data. Switching back to A serves from cache immediately.

### Manual invalidation triggers

Some actions require explicit invalidation after mutation:

```typescript
// After creating a case, approving a CR, etc.
const productId = useProductId()
mutate(["cases-list", productId])         // invalidate this product's list
mutate(["queue-badge", productId])        // refresh badge counts
```

This is the same pattern as before; only the key shape changes.

### Badge invalidation on product switch

`useNavBadges` subscribes to `onProductChange` and calls `mutate` for the new product's badge keys. This triggers a single network fetch (badge counts for new product) rather than invalidating all. See §11.

---

## 10. localStorage Namespacing

Several `localStorage` keys are currently global, creating cross-product contamination when multi-product is enabled:

| Key (current) | Problem | Fix |
|---------------|---------|-----|
| `nestfleet_nav_seen_at` | Shared across products — marking cases as "seen" in Product A affects Product B's badge counts | `nestfleet_nav_seen_at__${productId}` |
| `nestfleet_notifications_seen_at` | Same issue | `nestfleet_notifications_seen_at__${productId}` |
| `nf_last_product` | New key — stores last-used slug for root redirect | `nf_last_product` (user-scoped, not product-scoped — intentional) |

### Migration of existing localStorage data

On first load after upgrade, if the new namespaced keys are absent but the old global key exists:

```typescript
// One-time migration in ProductProvider or useNavBadges
const oldValue = localStorage.getItem("nestfleet_nav_seen_at")
if (oldValue && !localStorage.getItem(`nestfleet_nav_seen_at__${productId}`)) {
  localStorage.setItem(`nestfleet_nav_seen_at__${productId}`, oldValue)
  // Don't remove old key until all products have been migrated
}
```

This ensures single-product deployments upgrading to multi-product don't lose their "seen" timestamps.

---

## 11. useNavBadges Migration

`useNavBadges.ts` is the highest-risk file in the migration. It currently has a module-level constant that reads the env var at module initialisation time — before any React context exists:

```typescript
// CURRENT (broken for multi-product)
const PRODUCT_ID =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_PRODUCT_ID ?? "")
    : "";

// SWR keys: ["queue-badge", PRODUCT_ID], ["cases-badge", PRODUCT_ID]
// localStorage key: "nestfleet_nav_seen_at"  ← not product-namespaced
```

### After migration

```typescript
// console/src/lib/useNavBadges.ts — AFTER

"use client"
import { useProductId, useProduct } from "@/lib/product-context"
import { useEffect, useRef } from "react"
import useSWR from "swr"
import { useSWRConfig } from "swr"

export function useNavBadges() {
  const productId  = useProductId()           // from context, not env var
  const { onProductChange } = useContext(ProductContext)  // for cache warm-up
  const { mutate } = useSWRConfig()
  const pathname   = usePathname()
  const seenAtKey  = `nestfleet_nav_seen_at__${productId}`

  // SWR keys now include productId — auto-invalidate on product switch
  const { data: queueBadge }     = useSWR(["queue-badge", productId],     queueBadgeFetcher,     { refreshInterval: 60_000 })
  const { data: casesBadge }     = useSWR(["cases-badge", productId],     casesBadgeFetcher,     { refreshInterval: 60_000 })
  const { data: approvalsBadge } = useSWR(["approvals-badge", productId], approvalsBadgeFetcher, { refreshInterval: 60_000 })
  const { data: prDraftsBadge }  = useSWR(["pr-drafts-badge", productId], prDraftsBadgeFetcher,  { refreshInterval: 60_000 })

  // On product switch: prefetch badge counts for new product
  useEffect(() => {
    return onProductChange((_from, to) => {
      // `to` is the new slug; we don't have its productId yet here
      // The context update will trigger re-render with new productId,
      // SWR will auto-fetch the new keys. Nothing to do manually.
    })
  }, [onProductChange])

  // Mark seen on pathname change (same as current behaviour, but namespaced)
  useEffect(() => {
    localStorage.setItem(seenAtKey, new Date().toISOString())
  }, [pathname, seenAtKey])

  return { queueBadge, casesBadge, approvalsBadge, prDraftsBadge }
}
```

**Key changes:**
1. `PRODUCT_ID` module-level const removed entirely
2. `productId` comes from `useProductId()` inside the hook body
3. SWR keys use `productId` from context → auto-invalidate when product switches
4. `seenAtKey` is namespaced by productId → no cross-product contamination

---

## 12. Sidebar — Dynamic Hrefs

### Current state

`NAV_ITEMS` in `Sidebar.tsx` has hardcoded hrefs:

```typescript
const NAV_ITEMS = [
  { href: "/queue", label: "Queue", icon: InboxIcon },
  { href: "/cases", label: "Cases", icon: FolderIcon },
  // ...
]
```

### After migration

```typescript
// console/src/components/Sidebar.tsx — after migration

"use client"
import { useProduct, useProducts, useSwitchProduct } from "@/lib/product-context"
import { useLicense } from "@/lib/useLicense"

export function Sidebar() {
  const product   = useProduct()
  const products  = useProducts()
  const switchProduct = useSwitchProduct()
  const { licenseStatus } = useLicense()

  const slug = product.slug

  const NAV_ITEMS = [
    { href: `/p/${slug}/queue`,         label: "Queue",     icon: InboxIcon },
    { href: `/p/${slug}/cases`,         label: "Cases",     icon: FolderIcon },
    { href: `/p/${slug}/approvals`,     label: "Approvals", icon: CheckIcon },
    { href: `/p/${slug}/pr-drafts`,     label: "PR Drafts", icon: GitPullRequestIcon },
    { href: `/p/${slug}/knowledge`,     label: "Knowledge", icon: BookIcon },
    { href: `/p/${slug}/analytics`,     label: "Analytics", icon: BarChartIcon },
    { href: `/p/${slug}/notifications`, label: "Alerts",    icon: BellIcon },
    { href: `/p/${slug}/compliance`,    label: "Compliance",icon: ShieldIcon },
    { href: `/p/${slug}/settings`,      label: "Settings",  icon: SettingsIcon },
  ]

  // Product switcher: only show when user has 2+ products
  const showSwitcher = products.length > 1

  return (
    <aside style={{ borderLeftColor: product.accentColor }}>
      {/* Product identity — always visible */}
      <div className="product-identity">
        <span className="product-name">{product.name}</span>
        <span className="product-stage-badge">{product.stage}</span>
      </div>

      {/* Product switcher — only when multi-product */}
      {showSwitcher && (
        <ProductSwitcherDropdown
          products={products}
          activeSlug={slug}
          onSwitch={switchProduct}
        />
      )}

      {/* Nav items */}
      <nav>
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Product usage bar — existing component, keep as-is */}
      <ProductsBar licenseStatus={licenseStatus} productCount={products.length} />
    </aside>
  )
}
```

### Product identity accent colour

Each product gets a `accentColor` (hex) stored in `support_policy` or as a dedicated column. Initially default to the NestFleet brand colour for all products; editable in Settings → Product Appearance (deferred post-MVP).

The sidebar left border uses `product.accentColor`. This provides the "visual context break on switch" required by UX principle 3.

---

## 13. Badge Aggregation in Switcher

The product switcher dropdown must show per-product unread badge counts without requiring a switch. This requires fetching badge counts for **all** products simultaneously.

### `useAllProductsBadges()` hook

```typescript
// console/src/lib/useAllProductsBadges.ts

import useSWR from "swr"
import { useProducts } from "@/lib/product-context"

type ProductBadgeSummary = {
  productId: string
  slug:      string
  queue:     number
  cases:     number
  approvals: number
}

export function useAllProductsBadges(): ProductBadgeSummary[] {
  const products = useProducts()

  // One SWR call per product — SWR deduplicates if multiple components use the same key
  // Only active while switcher dropdown is open (mount/unmount controls subscription)
  const results = products.map((p) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = useSWR(
      ["all-products-badge", p.productId],
      () => fetchBadgeSummary(p.productId),
      { refreshInterval: 120_000, revalidateOnFocus: false }
    )
    return { productId: p.productId, slug: p.slug, ...(data ?? { queue: 0, cases: 0, approvals: 0 }) }
  })

  return results
}
```

> **Note on `rules-of-hooks` inside map:** The above pattern is technically valid because `products` is stable (same array length across renders for a given user), but ESLint will flag it. In practice, wrap each product's badge fetch in a sub-component (`<ProductBadgeLoader productId={p.productId} />`) that renders its count and passes it up via context or render prop.

### Switcher dropdown design

```
┌─────────────────────────────────────┐
│  DocuGardener          [3] [1] [0] │ ← active (highlighted)
│  SkillSeal             [0] [2] [5] │
│  ─────────────────────────────────  │
│  + Add Product                      │ ← only if tier allows
└─────────────────────────────────────┘
       Queue  Cases  Approvals badge counts
```

The `[N]` badges are fetched in the background and update every 2 minutes. They do not block the switcher opening.

---

## 14. Middleware Extension

`console/src/middleware.ts` currently only handles `/setup` redirect. It must be extended to:

1. Validate that the slug in `/p/[slug]/...` URLs belongs to the authenticated user
2. Redirect unauthenticated requests to `/login`
3. Redirect `/` to last-used product (server-side, using the `nf_last_product` cookie)

```typescript
// console/src/middleware.ts — extended

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PRODUCT_ROUTE_PATTERN = /^\/p\/([^/]+)(\/.*)?$/

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get("nestfleet_token")?.value
    ?? request.headers.get("authorization")?.replace("Bearer ", "")

  // --- Auth guard ---
  const isPublicPath = pathname.startsWith("/login") || pathname.startsWith("/setup")
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // --- Root redirect ---
  if (pathname === "/" && token) {
    const lastSlug = request.cookies.get("nf_last_product")?.value
    if (lastSlug) {
      return NextResponse.redirect(new URL(`/p/${lastSlug}/queue`, request.url))
    }
    // No last-used slug — let the page.tsx handle it (fetches first product from API)
    return NextResponse.redirect(new URL("/app/select-product", request.url))
  }

  // --- Slug format validation (cheap, no DB) ---
  const slugMatch = pathname.match(PRODUCT_ROUTE_PATTERN)
  if (slugMatch) {
    const slug = slugMatch[1]
    // Basic format check — rejects obvious garbage before it hits the backend
    if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(slug) && slug.length > 1) {
      return NextResponse.rewrite(new URL("/not-found", request.url))
    }
    // Deep validation (slug exists, user has access) happens in the product layout
    // via a server-side fetch to GET /api/v1/products. Not done in middleware to
    // avoid adding a DB call to every request in the Edge runtime.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
}
```

**Why not validate slug in middleware?** Edge Middleware runs before the Node.js runtime and has restricted access to the database. A slug DB lookup in middleware would either require an HTTP call to the backend (latency) or a separate Edge-compatible DB connection. The `[slug]/layout.tsx` runs in the Node.js runtime and can call the products repository directly. Middleware does the cheap format check; the layout does the authoritative access check.

---

## 15. Auth Layer Changes

### Current state

`GET /api/v1/auth/me` returns `{ userId, email, roles, productIds: string[] }`. The `productIds` are product UUIDs — present in the JWT but not used by the Console today (only the env var product ID is used).

### Changes needed

**None to the auth API.** `productIds` is already in the JWT and the `/me` response. The Console just needs to start using it (to seed the initial product list in `ProductProvider`).

**One optimisation (optional):** If `GET /api/v1/products` is fetched immediately on auth, the `productIds` array in the auth response could be used to eagerly populate the switcher without a second API call. This can be done by including `productSummaries` in the `/me` response:

```typescript
// Optional enrichment of GET /api/v1/auth/me response
{
  userId:          "usr_...",
  email:           "alex@example.com",
  roles:           ["operator"],
  productIds:      ["prod_abc", "prod_def"],
  // Optional enrichment — avoids a second GET /api/v1/products call on page load
  productSummaries: [
    { productId: "prod_abc", slug: "docugardener", name: "DocuGardener", stage: "production" },
    { productId: "prod_def", slug: "skillseal",    name: "SkillSeal",    stage: "beta" }
  ]
}
```

This is a nice-to-have optimisation. The `ProductProvider` can use `productSummaries` from the auth response if present, and fall back to calling `GET /api/v1/products` otherwise. Start with the two-call approach and optimise if page load latency is a concern.

---

## 16. Tier Gating

Product creation is gated by the license tier's `productLimit`.

| Tier | productLimit | Console behaviour |
|------|-------------|------------------|
| Community | 1 | No switcher; no "Add Product" button anywhere in UI |
| Starter | 3 | Switcher visible when 2+ products; "Add Product" visible until limit |
| Growth | 10 | Full multi-product |
| Scale | Unlimited | Full multi-product |

Source: `PlatformCloud/src/license/validator.ts` → `PRODUCT_REGISTRY.maxProducts` (already defined for both products).

### Console enforcement

```typescript
// In Sidebar ProductSwitcherDropdown and Settings/Products page
const { licenseStatus } = useLicense()
const canAddProduct = licenseStatus.productLimit === null  // null = unlimited
  || products.length < licenseStatus.productLimit

// "Add Product" button
<Button disabled={!canAddProduct} title={!canAddProduct ? "Upgrade to add more products" : undefined}>
  + Add Product
</Button>
```

When `!canAddProduct`, show a tooltip: "You've reached your plan's product limit (N). [Upgrade plan →]".

For **Community tier** specifically: the entire switcher section in the sidebar must be hidden — not disabled, not greyed out. An operator with 1 product should see no multi-product UI at all (per UX principle 8).

```typescript
const showSwitcher = products.length > 1  // Community: products.length === 1 → false
```

---

## 17. Legacy NEXT_PUBLIC_PRODUCT_ID Migration

### Backward compatibility guarantee

Existing single-product deployments using `NEXT_PUBLIC_PRODUCT_ID` in `.env.local` must work after the upgrade **without any `.env.local` changes**.

### Migration mechanism

In `console/.env.local.example`:

```env
# Deprecated: NEXT_PUBLIC_PRODUCT_ID is no longer used for routing.
# If set, it acts as a startup hint: the Console will redirect to /p/<slug-of-this-product>
# on first load. Remove it once you have logged in and your last-used product is remembered.
# NEXT_PUBLIC_PRODUCT_ID=prod_abc123
```

In the root page (`console/src/app/page.tsx`):

```typescript
export default function RootPage() {
  // Priority 1: cookie-based last-used (post-migration sessions)
  const lastSlug = cookies().get("nf_last_product")?.value
  if (lastSlug) return redirect(`/p/${lastSlug}/queue`)

  // Priority 2: env var hint (legacy deployments)
  const legacyProductId = process.env.NEXT_PUBLIC_PRODUCT_ID
  if (legacyProductId) {
    // We don't know the slug from the product ID alone at this point.
    // Redirect to a server action that looks it up.
    return redirect(`/app/resolve-product?productId=${legacyProductId}`)
  }

  // No hint → login
  return redirect("/login")
}
```

`/app/resolve-product` is a minimal page that:
1. Calls `GET /api/v1/products` (authenticated)
2. Finds the product matching the legacy `productId`
3. Sets the `nf_last_product` cookie
4. Redirects to `/p/${slug}/queue`

After one successful login, the cookie is set and the env var path is never hit again. Operators can remove `NEXT_PUBLIC_PRODUCT_ID` from `.env.local` at their convenience.

### Post-migration grep check

The acceptance criterion "zero `process.env.NEXT_PUBLIC_PRODUCT_ID` references in `console/src/`" is verified by:

```bash
grep -r "NEXT_PUBLIC_PRODUCT_ID" console/src/
# Expected output: empty (0 results)
```

The only remaining reference is in `console/.env.local.example` (as a comment) and the root `page.tsx` legacy hint path — both are intentional and documented.

---

## 18. Open Questions — Resolved

| ID | Question | Resolution |
|----|----------|-----------|
| **OQ-MP-01** | Option B (context + localStorage) or Option C (URL + context)? | **Option C selected.** URL as canonical product selector; context reads from URL. Rationale: multi-tab independence, bookmarkability, no localStorage race condition. See §2 for full trade-off analysis. |
| **OQ-MP-02** | Default product on login — last-used or first in list? | **Last-used product** (stored in `nf_last_product` cookie, user-scoped). On first login with no prior session, default to first product returned by `GET /api/v1/products` (ordered by `created_at ASC`). |
| **OQ-MP-03** | "Add Product" wizard: call NestFleet backend or PlatformCloud admin API? | **NestFleet backend only** (`POST /api/v1/products`). NestFleet validates tier quota via the existing license check mechanism. No synchronous dependency on PlatformCloud for product creation. PlatformCloud is only involved at billing time (seat/product limits enforced via license). |
| **OQ-MP-04** | Multi-tab behaviour: Tab 1 on Product A, Tab 2 switches to Product B — does Tab 1 change? | **Tab independence: Tab 1 stays on Product A.** Each tab holds its own URL state. Switching products in Tab 2 updates Tab 2's URL only. The `nf_last_product` cookie update (on switch) is a last-writer-wins best-effort hint for the root redirect — it does not affect already-open tabs. This is the correct behaviour for multi-product operator workflows. |

---

## 19. Effort Breakdown

| Phase | Task | Hours |
|-------|------|-------|
| **P0: DB + Backend** | `slug` column migration + `findProductBySlug()` + `slugify()` utility | 3h |
| | `GET /api/v1/products` endpoint | 3h |
| | `POST /api/v1/products` endpoint (with tier gate) | 5h |
| **P1: ProductContext** | `product-context.tsx` + hooks (`useProductId`, `useProduct`, etc.) | 4h |
| | Root `page.tsx` + legacy product ID redirect | 1h |
| **P2: Route Restructure** | Next.js route group `(app)/p/[slug]/` creation | 3h |
| | Middleware extension | 2h |
| **P3: Page Migration** | 13 pages — remove env var, add `useProductId()` | 6h |
| | `compliance/page.tsx` bug fix | 1h |
| **P4: Sidebar + Switcher** | `Sidebar.tsx` dynamic hrefs + product identity header | 3h |
| | `ProductSwitcherDropdown` component | 4h |
| | `useAllProductsBadges()` hook | 2h |
| **P5: Hooks Migration** | `useNavBadges.ts` — remove module-level const, context-based | 3h |
| | `useNotificationBadge.ts` — SWR key update + namespaced localStorage | 2h |
| **P6: "Add Product" Wizard** | Multi-step form: name → stage → confirm → create → redirect | 6h |
| | Tier gate UI (disabled button + tooltip + upgrade CTA) | 1h |
| **P7: Tests** | Unit tests: `ProductProvider`, `useProductId`, `switchProduct` | 3h |
| | E2E: product switch, data isolation, badge counts | 4h |
| | Legacy compatibility regression test | 1h |
| **P8: Docs** | `.env.local.example` update + migration notes | 1h |
| **Total** | | **~58h** |

> **Revision from backlog estimate (40h):** The original estimate did not account for the `slug` column DB migration (+8h across P0+P2) and the "Add Product" wizard complexity that emerged during spike research. The revised estimate is 58h.

**Phasing recommendation:** P0 → P1 → P2 → P3 (in parallel with P4) → P5 → P6 → P7 → P8. P3 can be distributed across multiple PRs (one page per PR), each gated behind the feature flag `FF_MULTI_PRODUCT` until the full migration is complete.

---

## 20. Testing Strategy & Acceptance Criteria

### Unit tests

| Test | Assertion |
|------|-----------|
| `ProductProvider` renders children | Given `products: [A, B]` and URL `/p/a/cases`, `useProductId()` returns `A.productId` |
| `switchProduct("b")` | Calls `router.push("/p/b/cases")` (preserving page segment) |
| `useProductId()` outside provider | Throws `"useProductId() must be used inside <ProductProvider>"` |
| `slugify("DocuGardener")` | Returns `"docugardener"` |
| `slugify("Skill Seal 2.0")` | Returns `"skill-seal-2-0"` |
| Tier gate: Community | `showSwitcher` is `false` when `products.length === 1` |
| Tier gate: Starter limit | `canAddProduct` is `false` when `products.length >= 3` on Starter |

### Integration tests (Vitest + Testcontainers)

| Test | Assertion |
|------|-----------|
| `GET /api/v1/products` | Returns only products in authenticated user's `productIds` |
| `GET /api/v1/products` wrong user | Returns empty array, not 403 (user has zero products) |
| `POST /api/v1/products` over limit | Returns `402` with `{ error: "Product limit reached", limit: 3 }` |
| `POST /api/v1/products` duplicate name | Returns `409` with `{ error: "Product name already exists" }` |
| `findProductBySlug("nonexistent")` | Returns `null` |

### E2E acceptance criteria (from §4.8)

- [ ] No file in `console/src/` references `process.env.NEXT_PUBLIC_PRODUCT_ID` (grep returns 0 results post-migration)
- [ ] Two browser tabs can independently show different products without interference
- [ ] Switching Product A → B → A serves Product A data from warm SWR cache (no re-fetch, verified via Network tab)
- [ ] SWR cache for Product A contains zero entries from Product B (React DevTools)
- [ ] Navigating to `/p/nonexistent-slug/cases` shows 404 page, not empty page or another product's data
- [ ] `useProductId()` throws clear error if called outside `ProductProvider`
- [ ] Existing deployment with `NEXT_PUBLIC_PRODUCT_ID` set and 1 product works identically to current behaviour
- [ ] Product switch completes in <200ms perceived (no spinner, no layout shift)
- [ ] Navigation position preserved on switch (same page, different product data)
- [ ] Single-product operators see zero switcher UI
- [ ] Unread badge counts visible per product in switcher dropdown without switching
- [ ] Adding a new page requires only `const productId = useProductId()` — no env var, no prop drilling
- [ ] Full E2E test suite passes when run against SkillSeal product ID

---

## 21. Implementation Status & Pending Items

> **As of 2026-03-21.** Phases P0–P6 are shipped. Items below are what remains.

### Shipped ✅

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| P0 | `slug` column migration + `slugify()` | `src/api/v1/products.ts` |
| P0 | `GET /api/v1/products` | Returns products scoped to auth user |
| P0 | `POST /api/v1/products` (tier-gated) | 402 on over-limit, 409 on duplicate name |
| P0 | `productsRouter` wired at `/api/v1` in `src/api/index.ts` | |
| P1 | `product-context.tsx` — `ProductProvider`, all hooks | `useProductId`, `useProductIdWithFallback`, `useProductSafe`, `useProduct`, `useProducts`, `useSwitchProduct`, `useRefreshProducts` |
| P1 | `nf_last_product` cookie set on product resolve + switch | Client-side, 1-year, `SameSite=Lax` |
| P2 | Route group `(app)/p/[slug]/` + `layout.tsx` | Async server layout, mounts `ProductProvider` only |
| P2 | 12 thin re-export pages under `/p/[slug]/` | All major console pages |
| P2 | Middleware: root redirect via `nf_last_product` cookie | `/` → `/p/${slug}/queue` |
| P2 | Middleware: slug format validation (cheap, no DB) | Rewrites garbage slugs to `/not-found` |
| P2 | Middleware: `config.matcher` excludes `api/` | |
| P3 | 13 page migrations — `NEXT_PUBLIC_PRODUCT_ID` removed | All pages now use `useProductIdWithFallback()` |
| P3 | `compliance/page.tsx` bug fix | `user?.productIds[0]` → context hook |
| P4 | `Sidebar.tsx` — dynamic hrefs via `basePath` | Both legacy and `/p/[slug]/` paths active |
| P4 | `ProductSwitcherDropdown` — product list, active checkmark | Hidden for Community tier |
| P5 | `useNavBadges.ts` — `productId` from context, localStorage namespaced | |
| P5 | `useNotificationBadge.ts` — same pattern | |
| P6 | `AddProductWizard` — 3-step modal (name → stage → confirm) | `src/components/AddProductWizard.tsx` |
| P6 | `AddProductButton` — disabled+tooltip when at limit | |
| P6 | `ProductSwitcherDropdown` — "Add Product" entry + tier gate | Community hidden; Starter+ shows button |
| P6 | `useRefreshProducts()` hook | Re-fetches product list after wizard creates product |

---

### Pending ⏳

#### P7 — Tests ✅ COMPLETE 2026-03-21

| # | Item | Type | Priority |
|---|------|------|----------|
| T-01 | ✅ Unit: `ProductProvider` slug→productId resolution — `NF-UNIT-450` in `tests/unit/console/product-context.test.ts` | Unit | High |
| T-02 | ✅ Unit: `switchProduct` URL construction — `NF-UNIT-451` in `tests/unit/console/product-context.test.ts` | Unit | High |
| T-03 | ✅ Unit: `useProductId()` outside provider throws — `NF-UNIT-420..423` in `tests/unit/console/product-context.test.ts` | Unit | High |
| T-04 | ✅ Unit: `slugify()` + `uniqueSlug()` — `NF-UNIT-401..410` in `tests/unit/shared/slugify.test.ts` | Unit | Medium |
| T-05 | ✅ Unit: tier gate — disabled at/above limit, community check — `NF-UNIT-430..436` in `tests/unit/console/product-context.test.ts` | Unit | Medium |
| T-06 | ✅ Integration: `GET /api/v1/products` returns only user's products — `NF-INT-500..504` in `tests/integration/products-api.test.ts` | Integration | High |
| T-07 | ✅ Integration: `POST /api/v1/products` over limit → 402 — `NF-INT-507` in `tests/integration/products-api.test.ts` | Integration | High |
| T-08 | ✅ Integration: duplicate name → 201 with auto-suffixed slug (no 409 — no unique-name constraint); see DEV-05 — `NF-INT-509` in `tests/integration/products-api.test.ts` | Integration | Medium |
| T-09 | ✅ E2E: product switch A→B updates URL and switcher to Product B — `console/e2e/product-switcher.spec.ts` | E2E | High |
| T-10 | ✅ E2E: SWR cache isolation — page reflects Product B after switch — `console/e2e/product-switcher.spec.ts` | E2E | High |
| T-11 | ✅ E2E: navigating to `/p/nonexistent-slug-xyz/cases` redirects to `/not-found` — `console/e2e/product-switcher.spec.ts` | E2E | High |
| T-12 | ✅ E2E: legacy `/cases` and `/approvals` paths still render without errors — `console/e2e/product-switcher.spec.ts` | Regression | High |
| T-13 | ✅ E2E: Add Product wizard creates product and redirects to `/p/<slug>/cases` — `console/e2e/product-switcher.spec.ts` | E2E | Medium |

#### P8 — Docs

| # | Item | Priority |
|---|------|----------|
| D-01 | ✅ `.env.local.example` — `NEXT_PUBLIC_PRODUCT_ID` commented out with deprecation notice | Medium |
| D-02 | ✅ `console/README.md` created — Getting started, env vars, `/p/[slug]/` URL structure, Add Product flow | Low |

#### UX Polish (post-MVP, from §4.8 UX principles)

| # | Item | UX Principle | Effort |
|---|------|-------------|--------|
| U-01 | ✅ **Navigation position preserved on switch** — `switchProduct` uses `usePathname` to extract current page segment; `/approvals` → `/p/new-slug/approvals` | Principle 4 | Small |
| U-02 | ✅ **Badge aggregation in switcher** — shipped as N-01; per-product counts in dropdown rows | Principle 7 | Medium |
| U-03 | ✅ **`/app/resolve-product` page** — resolves legacy `productId` hint → sets `nf_last_product` cookie → redirects to `/p/<slug>/queue`; Suspense boundary for `useSearchParams` | Principle N/A | Small |
| U-04 | ✅ **Authoritative slug validation in ProductProvider** — if slug not in user's product list after fetch, redirects to `/not-found` instead of falling back to first product | Req 2.1 | Small |
| U-05 | ✅ **`/not-found` page** — `src/app/not-found.tsx` created; middleware rewrite lands here | N/A | Small |
| U-06 | ✅ **Sidebar accent color** — `migrations/0034_product_accent_color.sql`; `accent_color` in `ProductRowSchema`; `accentColor` in `ProductSummary` + API GET/POST responses; left `border-l-2` on each switcher dropdown row | Principle 3 | Medium |
| U-07 | **Keyboard shortcut** — `Cmd+K` → type product name → Enter for power operators | Principle 5 | Large |
| U-08 | **Recent/pinned products** — MRU ordering + pin favorites when list > 5 | Principle 6 | Large |
| U-09 | ✅ **Mobile/narrow viewport** — stage badge in dropdown rows hidden on `< lg` via `hidden lg:inline-flex` Tailwind class; product name + badge count remain visible; no JS media query needed | Principle 9 | Medium |
| U-10 | ✅ **"Add Product" entry for single-product non-Community users** — `ProductSwitcherDropdown` now shows a dashed "Add Product" button when `products.length === 1` on non-Community tiers | Principle 8 | Small |

#### Cross-Product & Cross-Tab Awareness ✅ Shipped (N-01, N-02) / Pending (N-03, N-04)

Two user workflows drive this group:

> **Workflow A — Single tab, multiple products.**
> Operator is on `/p/skillseal/cases`. DocuGardener gets 3 new approvals.
> They must be notified without switching products.
>
> **Workflow B — Multiple browser tabs, one tab per product.**
> Tab 1: `/p/docugardener/cases` · Tab 2: `/p/skillseal/approvals`.
> A change in Tab 2 must be visible from Tab 1 without activating Tab 2.

**UX recommendation:**

| Signal | Workflow A | Workflow B | Invasiveness | Implementation |
|--------|------------|------------|-------------|----------------|
| Ambient badge dot on switcher button | ✅ Primary | ✗ | None | `useAllProductsBadges` |
| Per-product counts in dropdown rows | ✅ Secondary | ✗ | None | `useAllProductsBadges` |
| `document.title` count prefix `(N) Product \| NestFleet` | ✓ (page title) | ✅ Primary | None | `useDocumentTitle` hook |
| Toast notification (brief, auto-dismiss) | Optional | ✗ | Low | Cross-product poller |
| Browser Notifications API (OS-level) | ✗ | ✅ Optional | High | Requires permission grant |
| Favicon badge overlay | ✓ | ✅ Secondary | None | Canvas API, complex |
| `BroadcastChannel` cross-tab SWR sync | ✗ | ✅ Real-time | None | Browser API, no server cost |

**Chosen approach (MVP):** ambient dot + `document.title` prefix. Together they cover both workflows with zero invasiveness — no sounds, no pop-ups, no permission requests. Poller-based (2 min lag acceptable for async operator workflows).

| # | Item | Workflow | Status | Notes |
|---|------|----------|--------|-------|
| N-01 | **`useAllProductsBadges` hook** — polls queue + approvals for every product in background; 2-min interval; effect-based (avoids hooks-in-map) | A | ✅ Shipped | `src/lib/useAllProductsBadges.ts` |
| N-02 | **`document.title` prefix** — `(N) ProductName \| NestFleet` when active product has unread items; `ProductHeadManager` client component mounted in AppLayout | B (+ A) | ✅ Shipped | `src/components/ProductHeadManager.tsx` |
| N-03 | ✅ **Cross-product toast** — `CrossProductNotifier` component; fires on count increase (not on initial load); resets baseline on product switch; separate toasts for queue vs approvals | A | ✅ Shipped | `src/components/CrossProductNotifier.tsx` |
| N-04 | ✅ **`BroadcastChannel` cross-tab SWR invalidation** — `useSWRBroadcastListener` hook mounted in AppLayout; `broadcastInvalidation(productId, keys)` emitter wired in `approvals/[crId]` (approve + reject) and `pr-drafts/[crId]` (complete); fire-and-forget channel pattern | B | ✅ Shipped | `src/lib/useSWRBroadcast.ts`, `approvals/[crId]/page.tsx`, `pr-drafts/[crId]/page.tsx` |

#### Known Deviations from Spec

| # | Spec says | Current implementation | Reason |
|---|-----------|----------------------|--------|
| DEV-01 | Middleware auth guard: redirect unauthenticated requests to `/login` | Not implemented | Token is in `localStorage`, not a cookie — Edge Middleware can't read it. Auth guard remains client-side in `useAuth`. |
| DEV-02 | `useAllProductsBadges()` hook in switcher dropdown | ✅ Implemented — `useAllProductsBadges.ts` + ambient dot on switcher button + per-product counts in dropdown rows | N-01 shipped |
| DEV-03 | Accent color on sidebar left border | ✅ Implemented — `migrations/0034`, `ProductSummary.accentColor`, `border-l-2` on each dropdown row | U-06 shipped |
| DEV-04 | Legacy `NEXT_PUBLIC_PRODUCT_ID` via `/app/resolve-product` server route | ✅ Implemented — `useProductIdWithFallback()` falls back to env var; `/app/resolve-product` page sets cookie and redirects | U-03 shipped |
| DEV-05 | T-08 spec called for `POST /api/v1/products` duplicate name → 409 | Duplicate names allowed — `products` table has no `UNIQUE(name)` constraint; slug collision is auto-suffixed by `uniqueSlug()` | Design intent: same name, different slugs, are valid separate products. Adding a unique-name constraint would be a breaking change requiring migration+API update. |

---

## 21. Manual UI Verification Guide

> **Purpose:** Step-by-step checklist to verify all DEFERRED-21 changes through the browser UI.
> **Prerequisites:** API on `localhost:3001`, Console on `localhost:3002`, PlatformCloud on `localhost:4000`.
> Both DocuGardener and SkillSeal seeded in the DB and assigned to `admin@nestfleet.local`.
>
> **Status: ✅ ALL SECTIONS VERIFIED — 2026-03-22**
> Bugs found and fixed during verification: login post-submit redirect (stale JWT → fresh token on POST /products), product switcher button visibility (accent color border), GET /products JWT staleness (now queries operator_users in DB), Add Product wizard error handling (402 → meaningful message), middleware /cases redirect prerequisite (C-6 cookie caveat documented.

---

### § A — Login redirect ✅

| Step | Action | Expected result |
|------|--------|----------------|
| A-1 | Clear browser localStorage + cookies, open `http://localhost:3002/login` | Login page shows |
| A-2 | Sign in with `admin@nestfleet.local` / `nestfleet-admin-2025` | Browser redirects to `http://localhost:3002/p/docugardener/cases` (first product by creation date) |
| A-3 | Reload the page | Stays on `/p/docugardener/cases` — no redirect loop |
| A-4 | Sign out, sign back in | Redirect goes to `/p/docugardener/cases` again (fresh token, same first product) |
| A-5 | Directly visit `http://localhost:3002/cases` while logged in | Middleware redirects to `/p/docugardener/cases` via `nf_last_product` cookie |

---

### § B — Product switcher dropdown ✅

| Step | Action | Expected result |
|------|--------|----------------|
| B-1 | On `/p/docugardener/cases`, look at the top of the left sidebar | A button showing "DocuGardener" with a colored left border (product accent color) and a chevron icon is visible. A red ambient dot may appear if the other product has unread items — that is correct behavior (§H). |
| B-2 | Click the switcher button | Dropdown opens **below** the button, listing both DocuGardener and SkillSeal |
| B-3 | DocuGardener row | Highlighted in indigo (active), checkmark icon on the right, colored left border |
| B-4 | SkillSeal row | Normal text, no checkmark, pin icon appears on row hover |
| B-5 | Click SkillSeal | URL changes to `/p/skillseal/cases`, switcher button now shows "SkillSeal" |
| B-6 | Open dropdown again | SkillSeal highlighted, DocuGardener available |
| B-7 | Click DocuGardener | Returns to `/p/docugardener/cases` |

---

### § C — Cmd+K command palette ✅

| Step | Action | Expected result |
|------|--------|----------------|
| C-1 | On any `/p/[slug]/` page, press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) | Modal overlay opens with a search input auto-focused |
| C-2 | Type "skill" | List filters to SkillSeal only |
| C-3 | Press `ArrowDown` then `Enter` | Navigates to `/p/skillseal/cases`, palette closes |
| C-4 | Press `Cmd+K` again, then press `Escape` | Palette closes without navigation |
| C-5 | Press `Cmd+K`, click outside the modal | Palette closes |
| C-6 | **First clear the `nf_last_product` cookie** (DevTools → Application → Cookies → delete it). Then navigate directly to `http://localhost:3002/cases` in the address bar and press `Cmd+K` | Nothing happens — palette not mounted outside `ProductProvider`. ⚠️ **If the cookie is still set**, the middleware redirects `/cases` → `/p/${lastSlug}/cases` before you land there, so the palette *will* open — that is §A-5 redirect behavior, not a C-6 failure. |

---

### § D — MRU ordering and pin ✅

| Step | Action | Expected result |
|------|--------|----------------|
| D-1 | Visit DocuGardener, then switch to SkillSeal via the dropdown | SkillSeal is now most-recently-used |
| D-2 | Open the dropdown | SkillSeal appears **first** in the list (MRU order) |
| D-3 | Hover over DocuGardener row, click the pin icon (📌) | Pin icon fills; DocuGardener moves to the top of the list on next open |
| D-4 | Reload the page, open the dropdown | DocuGardener is still pinned at the top (persisted in localStorage) |
| D-5 | Click the filled pin icon on DocuGardener | Unpins; MRU order is restored |

---

### § E — Page-level navigation with correct product context ✅

| Step | Action | Expected result |
|------|--------|----------------|
| E-1 | On `/p/docugardener/cases`, click a case in the list | Navigates to `/p/docugardener/cases/[caseId]` — **not** `/cases/[caseId]` |
| E-2 | Case detail page loads | Lineage loads without error (uses DocuGardener's product ID from context) |
| E-3 | On `/p/docugardener/approvals`, click an approval row | Navigates to `/p/docugardener/approvals/[crId]` |
| E-4 | On `/p/docugardener/queue`, click "View case" on a queue item | Navigates to `/p/docugardener/cases/[caseId]` |
| E-5 | Switch to SkillSeal, navigate to Cases, click a case | Navigates to `/p/skillseal/cases/[caseId]` — SkillSeal's lineage loads |
| E-6 | All sidebar nav links (Cases, Queue, Approvals, PR Drafts, Settings) | All links include `/p/[slug]/` prefix while inside a product context |

---

### § F — URL routing edge cases ✅

| Step | Action | Expected result |
|------|--------|----------------|
| F-1 | Navigate to `http://localhost:3002/p/nonexistent-slug-xyz/cases` | Browser redirects to `/not-found` page |
| F-2 | Navigate to `http://localhost:3002/p/INVALID/cases` (uppercase) | Middleware rewrites to `/not-found` (slug format validation) |
| F-3 | Navigate to `http://localhost:3002/p/skillseal/cases` with a fresh session (not logged in) | Redirected to `/login`, then back to `/p/skillseal/cases` after sign-in |
| F-4 | Open Tab 1 on `/p/docugardener/cases`, Tab 2 on `/p/skillseal/cases` | Each tab shows its own product — no interference |
| F-5 | Use browser back/forward after switching products | Returns to correct previous product page |

---

### § G — Add Product wizard ✅

| Step | Action | Expected result |
|------|--------|----------------|
| G-1 | Open the product switcher dropdown | "Add Product" button visible in the dropdown footer |
| G-2 | Click "Add Product" | Wizard modal opens |
| G-3 | Enter a unique product name (e.g. `Test Product 2026`) and click Next | Step 2 (stage selection) appears |
| G-4 | Select "Production" stage and click Create | Wizard submits, browser redirects to `/p/[new-slug]/cases` |
| G-5 | Open the dropdown on the new product | All three products are now listed |
| G-6 | (If on Community tier) Open switcher on single-product account | No dropdown: only a dashed "Add Product" button is shown |

---

### § H — Cross-product badge awareness ✅

| Step | Action | Expected result |
|------|--------|----------------|
| H-1 | Inject a case for SkillSeal while viewing DocuGardener | Ambient red dot appears on the switcher button |
| H-2 | Open the dropdown | SkillSeal row shows a badge count (e.g. `1`) |
| H-3 | Toast notification | A "SkillSeal — 1 new item" toast fires in the lower-right corner |
| H-4 | Open browser tab 2 on `/p/skillseal/approvals`, approve a CR | Tab 1 (`/p/docugardener/approvals`) invalidates its SWR cache via `BroadcastChannel` — count updates without manual reload |
| H-5 | Browser tab title while on DocuGardener with unread SkillSeal items | Title shows `(N) DocuGardener | NestFleet` |

---

*Architecture by NestFleet SA — 2026-03-21*
*Backlog reference: §4.8 DEFERRED-21 in `docs/active-backlog.md`*
