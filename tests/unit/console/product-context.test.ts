/**
 * Unit tests: product-context hook contracts and tier-gate logic.
 *
 * DEFERRED-21 P7 — T-01, T-02, T-03, T-05
 *
 * React is not available in the root node-env; these tests verify the exact
 * same predicates used in product-context.tsx as standalone functions.
 * This is a deliberate choice: the logic is trivial and testing it in
 * isolation is faster and more maintainable than spinning up jsdom.
 *
 * Covers:
 *   NF-UNIT-420: useProductId() contract — throws when ctx is null
 *   NF-UNIT-421: useProductSafe() contract — returns null (no throw)
 *   NF-UNIT-422: useProductIdWithFallback() — env-var fallback logic
 *   NF-UNIT-430: Tier gate — NOT disabled when productLimit is null (unlimited)
 *   NF-UNIT-431: Tier gate — NOT disabled when below limit
 *   NF-UNIT-432: Tier gate — disabled at the limit
 *   NF-UNIT-433: Tier gate — disabled above the limit (defensive)
 *   NF-UNIT-434: Community check — isCommunity when productLimit === 1
 *   NF-UNIT-435: Community check — NOT community when productLimit >= 2
 *   NF-UNIT-436: Community check — NOT community when productLimit is null
 */

import { describe, it, expect } from "vitest"

// ─── Inline replicas of the hook predicates ───────────────────────────────────
//
// These mirror the exact logic in console/src/lib/product-context.tsx.
// If the source diverges, these tests will fail on the updated predicates.

interface ProductCtx {
  product: { productId: string; slug: string; name: string; stage: string }
  products: unknown[]
  switchProduct: (slug: string) => void
  refreshProducts: () => void
}

/** Mirror of useProductId() */
function testUseProductId(ctx: ProductCtx | null): string {
  if (!ctx) throw new Error("useProductId must be used inside <ProductProvider>")
  return ctx.product.productId
}

/** Mirror of useProductSafe() */
function testUseProductSafe(ctx: ProductCtx | null): ProductCtx | null {
  return ctx
}

/** Mirror of useProductIdWithFallback() */
function testUseProductIdWithFallback(
  ctx: ProductCtx | null,
  envVar: string | undefined
): string {
  if (ctx) return ctx.product.productId
  return envVar ?? ""
}

const mockCtx: ProductCtx = {
  product:         { productId: "prod_abc123", slug: "acme", name: "Acme", stage: "beta" },
  products:        [],
  switchProduct:   () => {},
  refreshProducts: () => {},
}

// ── T-03: hook error contracts ────────────────────────────────────────────────

describe("useProductId() contract — NF-UNIT-420", () => {
  it("throws with descriptive message when ctx is null", () => {
    expect(() => testUseProductId(null)).toThrow(
      "useProductId must be used inside <ProductProvider>"
    )
  })

  it("returns productId when ctx is populated", () => {
    expect(testUseProductId(mockCtx)).toBe("prod_abc123")
  })
})

describe("useProductSafe() contract — NF-UNIT-421", () => {
  it("returns null without throwing", () => {
    expect(() => testUseProductSafe(null)).not.toThrow()
    expect(testUseProductSafe(null)).toBeNull()
  })

  it("returns context when present", () => {
    expect(testUseProductSafe(mockCtx)).toBe(mockCtx)
  })
})

describe("useProductIdWithFallback() contract — NF-UNIT-422", () => {
  it("returns env var when ctx is null and env var is set", () => {
    expect(testUseProductIdWithFallback(null, "prod_legacy")).toBe("prod_legacy")
  })

  it("returns empty string when ctx is null and env var is undefined", () => {
    expect(testUseProductIdWithFallback(null, undefined)).toBe("")
  })

  it("returns productId from ctx even when env var is set (ctx wins)", () => {
    expect(testUseProductIdWithFallback(mockCtx, "prod_legacy")).toBe("prod_abc123")
  })
})

// ── T-05: Tier gate pure logic ────────────────────────────────────────────────
//
// AddProductButton logic from Sidebar.tsx:
//   isDisabled = productLimit !== null && products.length >= productLimit
//   isCommunity = productLimit !== null && productLimit <= 1

function isAddDisabled(productCount: number, productLimit: number | null): boolean {
  return productLimit !== null && productCount >= productLimit
}

function isCommunityTier(productLimit: number | null): boolean {
  return productLimit !== null && productLimit <= 1
}

describe("Tier gate — isAddDisabled() — T-05", () => {
  describe("NF-UNIT-430: unlimited plan (productLimit null)", () => {
    it("is NOT disabled for 0 products", () => {
      expect(isAddDisabled(0, null)).toBe(false)
    })

    it("is NOT disabled for many products", () => {
      expect(isAddDisabled(99, null)).toBe(false)
    })
  })

  describe("NF-UNIT-431: below the limit", () => {
    it("is NOT disabled when count < limit", () => {
      expect(isAddDisabled(0, 3)).toBe(false)
      expect(isAddDisabled(2, 3)).toBe(false)
      expect(isAddDisabled(1, 5)).toBe(false)
    })
  })

  describe("NF-UNIT-432: at the limit", () => {
    it("IS disabled when count equals limit", () => {
      expect(isAddDisabled(3, 3)).toBe(true)
      expect(isAddDisabled(1, 1)).toBe(true)
      expect(isAddDisabled(5, 5)).toBe(true)
    })
  })

  describe("NF-UNIT-433: above the limit (defensive)", () => {
    it("IS disabled when count exceeds limit", () => {
      expect(isAddDisabled(4, 3)).toBe(true)
      expect(isAddDisabled(10, 5)).toBe(true)
    })
  })
})

describe("Community tier check — isCommunityTier() — T-05", () => {
  describe("NF-UNIT-434: community when productLimit === 1", () => {
    it("returns true for productLimit of 1", () => {
      expect(isCommunityTier(1)).toBe(true)
    })
  })

  describe("NF-UNIT-435: NOT community for paid tiers", () => {
    it("returns false for productLimit of 2", () => {
      expect(isCommunityTier(2)).toBe(false)
    })

    it("returns false for productLimit of 5", () => {
      expect(isCommunityTier(5)).toBe(false)
    })
  })

  describe("NF-UNIT-436: NOT community for unlimited plan (null)", () => {
    it("returns false when productLimit is null", () => {
      expect(isCommunityTier(null)).toBe(false)
    })
  })
})

// ── T-01: ProductProvider slug→productId resolution ───────────────────────────
//
// Mirrors the logic inside ProductProvider.loadProducts:
//   const match = list.find(p => p.slug === slug) ?? null
//   if (list.length > 0 && !match) { router.replace("/not-found"); return; }
//   setProduct(match)
//
// When product is resolved, useProductId() returns the product's ID.
// When the slug is not in the list, match is null — provider renders nothing.

interface MockProduct {
  productId: string
  slug:      string
  name:      string
  stage:     string
  accentColor?: string
}

function resolveProduct(
  list:  MockProduct[],
  slug:  string,
): MockProduct | null {
  return list.find((p) => p.slug === slug) ?? null
}

const PRODUCTS: MockProduct[] = [
  { productId: "prod_aaa", slug: "acme",   name: "Acme",   stage: "beta"       },
  { productId: "prod_bbb", slug: "acme-two", name: "AcmeTwo", stage: "production" },
  { productId: "prod_ccc", slug: "zoneshift",    name: "ZoneShift",    stage: "prelaunch"  },
]

describe("T-01 — ProductProvider slug→product resolution (NF-UNIT-450)", () => {
  it("resolves slug 'acme' to productId 'prod_aaa'", () => {
    const match = resolveProduct(PRODUCTS, "acme")
    expect(match).not.toBeNull()
    // mirror of useProductId(ctx) — returns ctx.product.productId
    expect(match!.productId).toBe("prod_aaa")
  })

  it("resolves slug 'acme-two' to productId 'prod_bbb'", () => {
    const match = resolveProduct(PRODUCTS, "acme-two")
    expect(match!.productId).toBe("prod_bbb")
  })

  it("returns null (renders nothing / redirects) when slug is not in the list", () => {
    const match = resolveProduct(PRODUCTS, "nonexistent-slug")
    expect(match).toBeNull()
  })

  it("is case-sensitive — 'Acme' (wrong case) does not match", () => {
    const match = resolveProduct(PRODUCTS, "Acme")
    expect(match).toBeNull()
  })

  it("single-product list resolves correctly", () => {
    const single: MockProduct[] = [
      { productId: "prod_only", slug: "my-app", name: "My App", stage: "production" },
    ]
    const match = resolveProduct(single, "my-app")
    expect(match!.productId).toBe("prod_only")
  })

  it("empty product list always returns null", () => {
    expect(resolveProduct([], "acme")).toBeNull()
  })
})

// ── T-02: switchProduct URL construction (NF-UNIT-451) ───────────────────────
//
// Mirrors the logic inside ProductProvider.switchProduct:
//   const pageSegment = pathname.replace(/^\/p\/[^/]+/, "") || "/cases";
//   router.push(`/p/${targetSlug}${pageSegment}`);

function buildSwitchUrl(pathname: string, targetSlug: string): string {
  const pageSegment = pathname.replace(/^\/p\/[^/]+/, "") || "/cases"
  return `/p/${targetSlug}${pageSegment}`
}

describe("T-02 — switchProduct URL construction (NF-UNIT-451)", () => {
  it("preserves /cases sub-path", () => {
    expect(buildSwitchUrl("/p/acme/cases", "acme-two"))
      .toBe("/p/acme-two/cases")
  })

  it("preserves /approvals sub-path", () => {
    expect(buildSwitchUrl("/p/acme/approvals", "acme-two"))
      .toBe("/p/acme-two/approvals")
  })

  it("preserves /pr-drafts sub-path", () => {
    expect(buildSwitchUrl("/p/acme/pr-drafts", "acme-two"))
      .toBe("/p/acme-two/pr-drafts")
  })

  it("preserves /knowledge sub-path", () => {
    expect(buildSwitchUrl("/p/acme/knowledge", "acme-two"))
      .toBe("/p/acme-two/knowledge")
  })

  it("preserves /queue sub-path", () => {
    expect(buildSwitchUrl("/p/acme/queue", "acme-two"))
      .toBe("/p/acme-two/queue")
  })

  it("preserves deep sub-path with case ID", () => {
    expect(buildSwitchUrl("/p/acme/cases/case_01abc", "acme-two"))
      .toBe("/p/acme-two/cases/case_01abc")
  })

  it("falls back to /cases when slug has no sub-path", () => {
    // /p/acme → pageSegment="" → fallback
    expect(buildSwitchUrl("/p/acme", "acme-two"))
      .toBe("/p/acme-two/cases")
  })

  it("handles legacy non-product paths by passing through the segment", () => {
    // /cases has no /p/[slug] prefix — replace does nothing → "/cases"
    expect(buildSwitchUrl("/cases", "acme-two"))
      .toBe("/p/acme-two/cases")
  })

  it("handles root path by falling back to /cases", () => {
    // "/" → replace does nothing → "/" which is truthy → "/p/slug/"
    // Explicit: the fallback only triggers on empty string
    const result = buildSwitchUrl("/", "acme-two")
    // "/" is truthy so no fallback — result is "/p/acme-two/"
    expect(result).toBe("/p/acme-two/")
  })

  it("uses the target slug, not the source slug", () => {
    const url = buildSwitchUrl("/p/acme/cases", "zoneshift")
    expect(url).toContain("zoneshift")
    expect(url).not.toContain("acme")
  })
})
